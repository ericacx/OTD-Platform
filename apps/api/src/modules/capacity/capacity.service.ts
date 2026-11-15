import { Inject, Injectable } from "@nestjs/common";
import {
  type BaseMachineDto,
  CAPACITY_DEFAULT_LEAD_DAYS,
  CAPACITY_DEFAULT_NEEDLE,
  CAPACITY_FALLBACK_LEAD_DAYS,
  CAPACITY_TIGHT_RATE,
  CAPACITY_WINDOW_DAYS,
  type CapacityCompareDto,
  type CapacityKpiDto,
  type CapacityRowDto,
  type CapacityVersionDetailDto,
  type CapacityVersionDto,
  type Ledger,
  type baseMachineUpdateSchema,
  type capacityRowCreateSchema,
  type capacityRowUpdateSchema,
  type capacityVersionCreateSchema,
  capacityErrors,
  knitFigures,
} from "@otd/contracts/capacity";
import {
  type Database,
  type DbOrTx,
  baseMachines,
  bases,
  capacityLedgerVersions,
  capacityRows,
  customerOrders,
  factories,
  ledgerTasks,
  needleTypes,
  orderLines,
  plannings,
  productionProgress,
  users,
} from "@otd/db";
import { canTransition } from "@otd/shared";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { z } from "zod";
import type { AccessContext } from "../../core/access/access.types.js";
import { AuditService } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, assertFound, illegalTransition, notFound, versionConflict } from "../../core/errors.js";
import { EventBus, inTransaction } from "../../core/events.js";
import { iso } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";

type VersionRow = typeof capacityLedgerVersions.$inferSelect;
type RowRow = typeof capacityRows.$inferSelect;
type RowInsert = typeof capacityRows.$inferInsert;

export const UNPRODUCED_STATUSES = ["TO_SCHEDULE", "IN_PRODUCTION"];
const KNIT_FIELDS = ["leadDays", "availableDays", "machineCount", "dailyOutput", "cumulativeCapacity", "otdUnproducedQty", "erpBacklog", "unproducedQty", "spareCapacity", "spareRate"] as const;

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const rowKey = (r: Pick<RowRow, "ledger" | "baseId" | "needleTypeId" | "process">) => `${r.ledger}:${r.baseId}:${r.needleTypeId ?? ""}:${r.process ?? ""}`;
const isTight = (r: Pick<RowRow, "ledger" | "spareRate" | "cumulativeCapacity" | "unproducedQty">) =>
  r.ledger === "KNIT" && r.spareRate !== null && r.spareRate < CAPACITY_TIGHT_RATE && ((r.cumulativeCapacity ?? 0) > 0 || (r.unproducedQty ?? 0) > 0);

@Injectable()
export class CapacityService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly clock: Clock,
  ) {}

  async listVersions(): Promise<CapacityVersionDto[]> {
    return this.toVersionDtos(await this.db.select().from(capacityLedgerVersions).orderBy(desc(capacityLedgerVersions.versionNo)));
  }

  async detail(id: string, q: { keyword?: string; ledger?: Ledger } = {}): Promise<CapacityVersionDetailDto> {
    const version = assertFound((await this.db.select().from(capacityLedgerVersions).where(eq(capacityLedgerVersions.id, id)))[0]);
    const rows = await this.rowDtos(await this.db.select().from(capacityRows).where(eq(capacityRows.versionId, id)).orderBy(asc(capacityRows.ledger), asc(capacityRows.sort)));
    const kw = q.keyword?.trim().toLowerCase();
    const filtered = rows.filter((r) => (!q.ledger || r.ledger === q.ledger) && (!kw || [r.baseName, r.baseCode, r.needleCode ?? "", r.process ?? ""].some((s) => s.toLowerCase().includes(kw))));
    return { version: (await this.toVersionDtos([version]))[0]!, kpis: await this.kpis(rows), rows: filtered };
  }

  async summary(publishedOnly = false): Promise<CapacityVersionDetailDto> {
    const where = publishedOnly ? eq(capacityLedgerVersions.status, "PUBLISHED") : undefined;
    const latest = (await this.db.select().from(capacityLedgerVersions).where(where).orderBy(desc(capacityLedgerVersions.versionNo)).limit(1))[0];
    if (!latest) throw notFound("capacityVersion");
    return this.detail(latest.id);
  }

  async createVersion(ctx: AccessContext, input: z.infer<typeof capacityVersionCreateSchema>): Promise<CapacityVersionDetailDto> {
    const created = await inTransaction(this.db, this.events, async (tx, emit) => {
      const asOfDate = input.asOfDate ?? this.clock.today();
      const previous = (await tx.select().from(capacityLedgerVersions).orderBy(desc(capacityLedgerVersions.versionNo)).limit(1))[0];
      const versionNo = (previous?.versionNo ?? 0) + 1;
      const label = `V${versionNo}`;
      const version = (await tx.insert(capacityLedgerVersions).values({ versionNo, label, asOfDate, windowDays: CAPACITY_WINDOW_DAYS, status: "DRAFT", note: input.note ?? null, createdBy: ctx.userId }).returning())[0]!;
      const prevRows = previous ? await tx.select().from(capacityRows).where(eq(capacityRows.versionId, previous.id)) : [];
      const prevKnit = prevRows.filter((r) => r.ledger === "KNIT");
      const leadOverrides = new Map(prevKnit.filter((r) => r.sources.leadDays === "MANUAL" && r.leadDays !== null).map((r) => [rowKey(r), r.leadDays!]));
      const backlog = new Map(prevKnit.filter((r) => typeof r.extra.erpBacklog === "number" && r.extra.erpBacklog > 0).map((r) => [rowKey(r), r.extra.erpBacklog as number]));
      const knit = await this.computeKnitRows(tx, CAPACITY_WINDOW_DAYS, { leadOverrides, backlog });
      const manual = prevRows.filter((r) => r.ledger !== "KNIT").map((r) => ({ ledger: r.ledger, baseId: r.baseId, needleTypeId: r.needleTypeId, process: r.process, extra: r.extra, sources: r.sources, sort: r.sort }));
      const values: RowInsert[] = [...knit, ...manual].map((r) => ({ ...r, versionId: version.id }));
      if (values.length) await tx.insert(capacityRows).values(values);
      await this.audit.log(ctx, { action: "capacity.version.create", objectType: "capacityVersion", objectId: version.id, docNo: label, diff: { asOfDate, knitRows: knit.length, copiedRows: manual.length } }, tx);
      emit({ type: "capacity.version.created", aggregateType: "capacityVersion", aggregateId: version.id, payload: { label, asOfDate } });
      return version;
    });
    return this.detail(created.id);
  }

  async publish(ctx: AccessContext, id: string, version: number): Promise<CapacityVersionDetailDto> {
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = assertFound((await tx.select().from(capacityLedgerVersions).where(eq(capacityLedgerVersions.id, id)))[0]);
      if (before.version !== version) throw versionConflict();
      if (!canTransition("capacityVersion", before.status as "DRAFT", "PUBLISHED")) throw illegalTransition(before.status, "publish");
      const updated = (
        await tx
          .update(capacityLedgerVersions)
          .set({ status: "PUBLISHED", publishedAt: this.clock.now(), publishedBy: ctx.userId, version: before.version + 1, updatedBy: ctx.userId })
          .where(and(eq(capacityLedgerVersions.id, id), eq(capacityLedgerVersions.version, version)))
          .returning()
      )[0];
      if (!updated) throw versionConflict();
      await tx.update(ledgerTasks).set({ currentVersion: before.label }).where(inArray(ledgerTasks.ledger, ["KNIT", "PACKING", "SPECIAL"]));
      await this.audit.log(ctx, { action: "capacity.version.publish", objectType: "capacityVersion", objectId: id, docNo: before.label, diff: { status: { from: "DRAFT", to: "PUBLISHED" } } }, tx);
      emit({ type: "capacity.version.published", aggregateType: "capacityVersion", aggregateId: id, payload: { label: before.label } });
    });
    return this.detail(id);
  }

  async compare(fromId: string, toId: string): Promise<CapacityCompareDto> {
    const versions = await this.db.select().from(capacityLedgerVersions).where(inArray(capacityLedgerVersions.id, [fromId, toId]));
    const from = assertFound(versions.find((v) => v.id === fromId));
    const to = assertFound(versions.find((v) => v.id === toId));
    const all = await this.rowDtos(await this.db.select().from(capacityRows).where(inArray(capacityRows.versionId, [fromId, toId])).orderBy(asc(capacityRows.ledger), asc(capacityRows.sort)));
    const key = (r: CapacityRowDto) => `${r.ledger}:${r.baseId}:${r.needleTypeId ?? ""}:${r.process ?? ""}`;
    const a = new Map(all.filter((r) => r.versionId === fromId).map((r) => [key(r), r]));
    const b = new Map(all.filter((r) => r.versionId === toId).map((r) => [key(r), r]));
    const keys = [...new Set([...b.keys(), ...a.keys()])];
    const rows = keys.map((k) => {
      const x = a.get(k);
      const y = b.get(k);
      const ref = (y ?? x)!;
      const fields: CapacityCompareDto["rows"][number]["fields"] = [];
      const names = ref.ledger === "KNIT" ? [...KNIT_FIELDS] : [...new Set([...Object.keys(x?.extra ?? {}), ...Object.keys(y?.extra ?? {})])];
      for (const f of names) {
        const fv = ref.ledger === "KNIT" ? (x?.[f as (typeof KNIT_FIELDS)[number]] ?? null) : (x?.extra[f] ?? null);
        const tv = ref.ledger === "KNIT" ? (y?.[f as (typeof KNIT_FIELDS)[number]] ?? null) : (y?.extra[f] ?? null);
        if (JSON.stringify(fv) === JSON.stringify(tv)) continue;
        fields.push({ field: f, from: fv, to: tv, delta: typeof fv === "number" && typeof tv === "number" ? round3(tv - fv) : null });
      }
      const change = !x ? "ADDED" : !y ? "REMOVED" : fields.length ? "CHANGED" : "SAME";
      return { key: k, ledger: ref.ledger, baseName: ref.baseName, needleCode: ref.needleCode, process: ref.process, change, fields } as CapacityCompareDto["rows"][number];
    });
    const [fromDto, toDto] = await this.toVersionDtos([from, to]);
    return { from: fromDto!, to: toDto!, rows };
  }

  async updateRow(ctx: AccessContext, id: string, input: z.infer<typeof capacityRowUpdateSchema>): Promise<CapacityRowDto> {
    await inTransaction(this.db, this.events, async (tx) => {
      const before = assertFound((await tx.select().from(capacityRows).where(eq(capacityRows.id, id)))[0]);
      const version = await this.draftVersion(tx, before.versionId);
      if (before.version !== input.version) throw versionConflict();
      let patch: Partial<RowRow>;
      if (before.ledger === "KNIT") {
        const leadDays = input.leadDays ?? before.leadDays ?? CAPACITY_FALLBACK_LEAD_DAYS;
        const machineCount = input.machineCount ?? before.machineCount ?? 0;
        const figures = knitFigures({ windowDays: version.windowDays, leadDays, machineCount, dailyOutput: before.dailyOutput ?? 0, unproducedQty: before.unproducedQty ?? 0 });
        const sources = { ...before.sources, ...(input.leadDays !== undefined ? { leadDays: "MANUAL" as const } : {}), ...(input.machineCount !== undefined ? { machineCount: "MANUAL" as const } : {}) };
        patch = { leadDays, machineCount, ...figures, sources };
      } else {
        patch = { ...(input.process !== undefined ? { process: input.process } : {}), ...(input.extra ? { extra: { ...before.extra, ...input.extra } } : {}) };
      }
      const updated = (await tx.update(capacityRows).set({ ...patch, version: before.version + 1 }).where(and(eq(capacityRows.id, id), eq(capacityRows.version, input.version))).returning())[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: "capacity.row.update", objectType: "capacityRow", objectId: id, docNo: version.label, diff: { leadDays: input.leadDays, machineCount: input.machineCount, extra: input.extra, process: input.process } }, tx);
    });
    return (await this.rowDtos(await this.db.select().from(capacityRows).where(eq(capacityRows.id, id))))[0]!;
  }

  async addRow(ctx: AccessContext, versionId: string, input: z.infer<typeof capacityRowCreateSchema>): Promise<CapacityRowDto> {
    if (input.ledger === "KNIT") throw new AppError(capacityErrors.CAPACITY_ROW_LEDGER_INVALID);
    const row = await inTransaction(this.db, this.events, async (tx) => {
      const version = await this.draftVersion(tx, versionId);
      assertFound((await tx.select().from(bases).where(eq(bases.id, input.baseId)))[0]);
      const max = (await tx.select({ n: sql<number>`coalesce(max(${capacityRows.sort}), 0)::int` }).from(capacityRows).where(and(eq(capacityRows.versionId, versionId), eq(capacityRows.ledger, input.ledger))))[0]!.n;
      const created = (await tx.insert(capacityRows).values({ versionId, ledger: input.ledger, baseId: input.baseId, process: input.process ?? null, extra: input.extra, sources: { extra: "MANUAL" }, sort: max + 1 }).returning())[0]!;
      await this.audit.log(ctx, { action: "capacity.row.create", objectType: "capacityRow", objectId: created.id, docNo: version.label, diff: { ledger: input.ledger } }, tx);
      return created;
    });
    return (await this.rowDtos([row]))[0]!;
  }

  async setErpBacklog(ctx: AccessContext, versionId: string, rowId: string, input: { version: number; erpBacklog: number }): Promise<CapacityRowDto> {
    await inTransaction(this.db, this.events, async (tx) => {
      const before = (await tx.select().from(capacityRows).where(and(eq(capacityRows.id, rowId), eq(capacityRows.versionId, versionId))))[0];
      if (!before) throw notFound();
      const version = await this.draftVersion(tx, versionId);
      if (before.ledger !== "KNIT") throw new AppError(capacityErrors.CAPACITY_ROW_LEDGER_INVALID);
      if (before.version !== input.version) throw versionConflict();
      const previous = typeof before.extra.erpBacklog === "number" ? before.extra.erpBacklog : 0;
      const otdUnproduced = typeof before.extra.otdUnproduced === "number" ? before.extra.otdUnproduced : round3((before.unproducedQty ?? 0) - previous);
      const erpBacklog = round3(input.erpBacklog);
      const unproducedQty = round3(otdUnproduced + erpBacklog);
      const figures = knitFigures({ windowDays: version.windowDays, leadDays: before.leadDays ?? CAPACITY_FALLBACK_LEAD_DAYS, machineCount: before.machineCount ?? 0, dailyOutput: before.dailyOutput ?? 0, unproducedQty });
      const updated = (
        await tx
          .update(capacityRows)
          .set({ unproducedQty, ...figures, extra: { ...before.extra, otdUnproduced, erpBacklog }, sources: { ...before.sources, erpBacklog: "SYNC", unproducedQty: "SYNC" }, version: before.version + 1 })
          .where(and(eq(capacityRows.id, rowId), eq(capacityRows.version, input.version)))
          .returning()
      )[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: "capacity.row.backlog", objectType: "capacityRow", objectId: rowId, docNo: version.label, diff: { erpBacklog: { from: previous, to: erpBacklog } } }, tx);
    });
    return (await this.rowDtos(await this.db.select().from(capacityRows).where(eq(capacityRows.id, rowId))))[0]!;
  }

  async deleteRow(ctx: AccessContext, id: string, version: number): Promise<void> {
    await inTransaction(this.db, this.events, async (tx) => {
      const before = assertFound((await tx.select().from(capacityRows).where(eq(capacityRows.id, id)))[0]);
      const v = await this.draftVersion(tx, before.versionId);
      if (before.ledger === "KNIT") throw new AppError(capacityErrors.CAPACITY_ROW_LEDGER_INVALID);
      if (before.version !== version) throw versionConflict();
      await tx.delete(capacityRows).where(and(eq(capacityRows.id, id), eq(capacityRows.version, version)));
      await this.audit.log(ctx, { action: "capacity.row.delete", objectType: "capacityRow", objectId: id, docNo: v.label, diff: { ledger: before.ledger, extra: before.extra } }, tx);
    });
  }

  async listMachines(): Promise<BaseMachineDto[]> {
    const rows = await this.db
      .select({ m: baseMachines, baseCode: bases.code, baseName: bases.name, needleCode: needleTypes.code, needles: needleTypes.needles })
      .from(baseMachines)
      .innerJoin(bases, eq(bases.id, baseMachines.baseId))
      .innerJoin(needleTypes, eq(needleTypes.id, baseMachines.needleTypeId))
      .where(isNull(bases.deletedAt))
      .orderBy(asc(bases.code), asc(needleTypes.needles));
    return rows.map((r) => ({ id: r.m.id, baseId: r.m.baseId, baseCode: r.baseCode, baseName: r.baseName, needleTypeId: r.m.needleTypeId, needleCode: r.needleCode, machineCount: r.m.machineCount, dailyOutputPerMachine: r.m.dailyOutputPerMachine, version: r.m.version }));
  }

  async updateMachines(ctx: AccessContext, input: z.infer<typeof baseMachineUpdateSchema>): Promise<BaseMachineDto> {
    const id = await inTransaction(this.db, this.events, async (tx) => {
      const before = assertFound((await tx.select().from(baseMachines).where(and(eq(baseMachines.baseId, input.baseId), eq(baseMachines.needleTypeId, input.needleTypeId))))[0]);
      if (before.version !== input.version) throw versionConflict();
      const updated = (await tx.update(baseMachines).set({ machineCount: input.machineCount, version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(baseMachines.id, before.id), eq(baseMachines.version, input.version))).returning())[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: "capacity.machine.update", objectType: "baseMachine", objectId: before.id, diff: { machineCount: { from: before.machineCount, to: input.machineCount } } }, tx);
      return before.id;
    });
    return (await this.listMachines()).find((m) => m.id === id)!;
  }

  async computeKnitRows(db: DbOrTx, windowDays: number, carry: { leadOverrides?: Map<string, number>; backlog?: Map<string, number> } = {}): Promise<Omit<RowInsert, "versionId">[]> {
    const leadOverrides = carry.leadOverrides ?? new Map<string, number>();
    const backlog = carry.backlog ?? new Map<string, number>();
    const baseRows = await db.select().from(bases).where(isNull(bases.deletedAt));
    const needleRows = await db.select().from(needleTypes);
    const machineRows = await db.select().from(baseMachines);
    const factoryRows = await db.select({ id: factories.id, baseId: factories.baseId }).from(factories);
    const baseOfFactory = new Map(factoryRows.map((f) => [f.id, f.baseId]));
    const fallbackNeedle = needleRows.find((n) => n.code === CAPACITY_DEFAULT_NEEDLE) ?? null;
    const orders = await db.select().from(customerOrders).where(and(inArray(customerOrders.status, UNPRODUCED_STATUSES), isNotNull(customerOrders.factoryId)));
    const orderIds = orders.map((o) => o.id);
    const progress = orderIds.length ? await db.select().from(productionProgress).where(inArray(productionProgress.orderId, orderIds)).orderBy(desc(productionProgress.reportDate), desc(productionProgress.createdAt)) : [];
    const knitted = new Map<string, number>();
    for (const p of progress) if (!knitted.has(p.orderId)) knitted.set(p.orderId, p.knittedPairs);
    const lines = orderIds.length ? await db.select().from(orderLines).where(inArray(orderLines.orderId, orderIds)) : [];
    const styleIds = [...new Set(lines.map((l) => l.styleId))];
    const planningRows = styleIds.length ? await db.select({ styleId: plannings.styleId, needleCount: plannings.needleCount, updatedAt: plannings.updatedAt }).from(plannings).where(and(inArray(plannings.styleId, styleIds), isNotNull(plannings.needleCount))).orderBy(desc(plannings.updatedAt)) : [];
    const needleOfStyle = new Map<string, string>();
    for (const p of planningRows) {
      if (!p.styleId || needleOfStyle.has(p.styleId)) continue;
      const needle = matchNeedle(p.needleCount, needleRows);
      if (needle) needleOfStyle.set(p.styleId, needle.id);
    }
    const unproduced = new Map<string, number>();
    for (const o of orders) {
      const baseId = baseOfFactory.get(o.factoryId!);
      if (!baseId) continue;
      const remaining = Math.max(0, o.totalPairs - (knitted.get(o.id) ?? 0));
      if (!remaining) continue;
      const own = lines.filter((l) => l.orderId === o.id && l.quantity > 0);
      const total = own.reduce((s, l) => s + l.quantity, 0);
      const shares = total > 0 ? own.map((l) => ({ needleId: needleOfStyle.get(l.styleId) ?? fallbackNeedle?.id ?? null, share: l.quantity / total })) : [{ needleId: fallbackNeedle?.id ?? null, share: 1 }];
      for (const s of shares) {
        if (!s.needleId) continue;
        const key = `${baseId}:${s.needleId}`;
        unproduced.set(key, (unproduced.get(key) ?? 0) + remaining * s.share);
      }
    }
    const cells = new Map<string, { baseId: string; needleTypeId: string; machineCount: number; dailyOutput: number }>();
    for (const m of machineRows) cells.set(`${m.baseId}:${m.needleTypeId}`, { baseId: m.baseId, needleTypeId: m.needleTypeId, machineCount: m.machineCount, dailyOutput: m.dailyOutputPerMachine });
    for (const key of [...unproduced.keys(), ...[...backlog.keys()].map((k) => k.replace(/^KNIT:/, "").replace(/:$/, ""))]) {
      if (cells.has(key)) continue;
      const [baseId, needleTypeId] = key.split(":") as [string, string];
      cells.set(key, { baseId, needleTypeId, machineCount: 0, dailyOutput: 0 });
    }
    const baseCode = new Map(baseRows.map((b) => [b.id, b.code]));
    const needleNo = new Map(needleRows.map((n) => [n.id, n.needles]));
    const sorted = [...cells.values()]
      .filter((c) => baseCode.has(c.baseId))
      .sort((a, b) => (baseCode.get(a.baseId)! < baseCode.get(b.baseId)! ? -1 : baseCode.get(a.baseId)! > baseCode.get(b.baseId)! ? 1 : (needleNo.get(a.needleTypeId) ?? 0) - (needleNo.get(b.needleTypeId) ?? 0)));
    return sorted.map((c, i) => {
      const override = leadOverrides.get(`KNIT:${c.baseId}:${c.needleTypeId}:`);
      const leadDays = override ?? CAPACITY_DEFAULT_LEAD_DAYS[baseCode.get(c.baseId)!] ?? CAPACITY_FALLBACK_LEAD_DAYS;
      const otdUnproduced = round3(unproduced.get(`${c.baseId}:${c.needleTypeId}`) ?? 0);
      const erpBacklog = round3(backlog.get(`KNIT:${c.baseId}:${c.needleTypeId}:`) ?? 0);
      const unproducedQty = round3(otdUnproduced + erpBacklog);
      return {
        ledger: "KNIT",
        baseId: c.baseId,
        needleTypeId: c.needleTypeId,
        process: null,
        leadDays,
        machineCount: c.machineCount,
        dailyOutput: c.dailyOutput,
        unproducedQty,
        ...knitFigures({ windowDays, leadDays, machineCount: c.machineCount, dailyOutput: c.dailyOutput, unproducedQty }),
        sources: { leadDays: override !== undefined ? "MANUAL" : "DEFAULT", machineCount: "MANUAL", dailyOutput: "SYNC", unproducedQty: "SYNC", erpBacklog: "SYNC" },
        extra: { otdUnproduced, erpBacklog },
        sort: i + 1,
      };
    });
  }

  private async draftVersion(tx: DbOrTx, versionId: string): Promise<VersionRow> {
    const version = assertFound((await tx.select().from(capacityLedgerVersions).where(eq(capacityLedgerVersions.id, versionId)))[0]);
    if (version.status !== "DRAFT") throw new AppError(capacityErrors.CAPACITY_VERSION_PUBLISHED, { label: version.label });
    return version;
  }

  private async kpis(rows: CapacityRowDto[]): Promise<CapacityKpiDto> {
    const knit = rows.filter((r) => r.ledger === "KNIT");
    const groupCapacity = round3(knit.reduce((s, r) => s + (r.cumulativeCapacity ?? 0), 0));
    const groupSpare = round3(knit.reduce((s, r) => s + (r.spareCapacity ?? 0), 0));
    const overdueTasks = (await this.db.select({ n: sql<number>`cast(count(*) as int)` }).from(ledgerTasks).where(eq(ledgerTasks.status, "OVERDUE")))[0]!.n;
    return {
      groupSpare,
      groupSpareWan: Math.round(groupSpare / 100) / 100,
      groupCapacity,
      avgSpareRate: groupCapacity > 0 ? Math.round((groupSpare / groupCapacity) * 10000) / 10000 : 0,
      tightCount: knit.filter((r) => r.tight).length,
      tightThreshold: CAPACITY_TIGHT_RATE,
      overdueTasks,
    };
  }

  private async rowDtos(rows: RowRow[]): Promise<CapacityRowDto[]> {
    if (!rows.length) return [];
    const baseRows = await this.db.select().from(bases).where(inArray(bases.id, [...new Set(rows.map((r) => r.baseId))]));
    const needleIds = [...new Set(rows.map((r) => r.needleTypeId).filter((x): x is string => !!x))];
    const needleRows = needleIds.length ? await this.db.select().from(needleTypes).where(inArray(needleTypes.id, needleIds)) : [];
    return rows.map((r) => {
      const base = baseRows.find((b) => b.id === r.baseId);
      return {
        id: r.id,
        versionId: r.versionId,
        ledger: r.ledger as Ledger,
        baseId: r.baseId,
        baseCode: base?.code ?? "",
        baseName: base?.name ?? "",
        needleTypeId: r.needleTypeId,
        needleCode: needleRows.find((n) => n.id === r.needleTypeId)?.code ?? null,
        process: r.process,
        leadDays: r.leadDays,
        availableDays: r.availableDays,
        machineCount: r.machineCount,
        dailyOutput: r.dailyOutput,
        cumulativeCapacity: r.cumulativeCapacity,
        unproducedQty: r.unproducedQty,
        otdUnproducedQty: r.ledger === "KNIT" ? (typeof r.extra.otdUnproduced === "number" ? r.extra.otdUnproduced : r.unproducedQty) : null,
        erpBacklog: r.ledger === "KNIT" ? (typeof r.extra.erpBacklog === "number" ? r.extra.erpBacklog : 0) : null,
        spareCapacity: r.spareCapacity,
        spareRate: r.spareRate,
        tight: isTight(r),
        sources: r.sources,
        extra: r.extra,
        version: r.version,
      };
    });
  }

  private async toVersionDtos(rows: VersionRow[]): Promise<CapacityVersionDto[]> {
    if (!rows.length) return [];
    const counts = await this.db
      .select({ versionId: capacityRows.versionId, ledger: capacityRows.ledger, n: sql<number>`cast(count(*) as int)` })
      .from(capacityRows)
      .where(inArray(capacityRows.versionId, rows.map((r) => r.id)))
      .groupBy(capacityRows.versionId, capacityRows.ledger);
    const publisherIds = [...new Set(rows.map((r) => r.publishedBy).filter((x): x is string => !!x))];
    const people = publisherIds.length ? await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, publisherIds)) : [];
    const n = (id: string, ledger: Ledger) => counts.find((c) => c.versionId === id && c.ledger === ledger)?.n ?? 0;
    return rows.map((r) => ({
      id: r.id,
      versionNo: r.versionNo,
      label: r.label,
      asOfDate: r.asOfDate,
      windowDays: r.windowDays,
      status: r.status as CapacityVersionDto["status"],
      publishedAt: iso(r.publishedAt),
      publishedByName: people.find((p) => p.id === r.publishedBy)?.name ?? null,
      note: r.note,
      rowCounts: { KNIT: n(r.id, "KNIT"), PACKING: n(r.id, "PACKING"), SPECIAL: n(r.id, "SPECIAL") },
      createdAt: r.createdAt.toISOString(),
      version: r.version,
    }));
  }
}

export function matchNeedle<T extends { id: string; code: string; needles: number }>(value: string | null, needles: T[]): T | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  const byCode = needles.find((n) => n.code.toUpperCase() === v);
  if (byCode) return byCode;
  const digits = v.match(/\d+/)?.[0];
  return digits ? (needles.find((n) => n.needles === Number(digits)) ?? null) : null;
}

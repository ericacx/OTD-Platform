import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { baseMachines, bases, capacityLedgerVersions, capacityRows, customerOrders, factories, ledgerTasks, needleTypes, orderLines, plannings, productionProgress } from "../../schema/index.js";
import type { SeedContext } from "./context.js";

const WINDOW_DAYS = 60;
const DEFAULT_NEEDLE = "144N";
const LEAD_DAYS: Record<string, number> = { DC: 7, VN: 10, NH: 8 };
const PLANNER = "13800000008";

type KnitRow = {
  baseId: string;
  baseCode: string;
  needleTypeId: string;
  needles: number;
  leadDays: number;
  machineCount: number;
  dailyOutput: number;
  otdUnproduced: number;
  erpBacklog: number;
};

const TARGET_SPARE_RATE: Record<string, number> = {
  "DC-96N": 0.25,
  "DC-120N": 0.19,
  "DC-144N": 0.15,
  "DC-200N": 0.09,
  "NH-96N": 0.33,
  "NH-120N": 0.28,
  "NH-144N": 0.39,
  "NH-168N": 0.069,
  "VN-96N": 0.36,
  "VN-120N": 0.29,
  "VN-144N": 0.07,
  "VN-200N": 0.22,
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;

function figures(row: KnitRow) {
  const availableDays = Math.max(0, WINDOW_DAYS - row.leadDays);
  const cumulativeCapacity = r3(availableDays * row.dailyOutput * row.machineCount);
  const unproducedQty = r3(row.otdUnproduced + row.erpBacklog);
  const spareCapacity = r3(cumulativeCapacity - unproducedQty);
  const spareRate = cumulativeCapacity > 0 ? spareCapacity / cumulativeCapacity : unproducedQty > 0 ? -1 : 0;
  return { availableDays, cumulativeCapacity, unproducedQty, spareCapacity, spareRate: Math.round(spareRate * 10000) / 10000 };
}

async function computeKnit(ctx: SeedContext): Promise<KnitRow[]> {
  const baseRows = await ctx.db.select().from(bases).where(isNull(bases.deletedAt));
  const needleRows = await ctx.db.select().from(needleTypes);
  const machines = await ctx.db.select().from(baseMachines);
  const baseOfFactory = new Map((await ctx.db.select({ id: factories.id, baseId: factories.baseId }).from(factories)).map((f) => [f.id, f.baseId]));
  const fallback = needleRows.find((n) => n.code === DEFAULT_NEEDLE)?.id ?? null;
  const orders = await ctx.db.select().from(customerOrders).where(and(inArray(customerOrders.status, ["TO_SCHEDULE", "IN_PRODUCTION"]), isNotNull(customerOrders.factoryId)));
  const ids = orders.map((o) => o.id);
  const progress = ids.length ? await ctx.db.select().from(productionProgress).where(inArray(productionProgress.orderId, ids)).orderBy(desc(productionProgress.reportDate), desc(productionProgress.createdAt)) : [];
  const knitted = new Map<string, number>();
  for (const p of progress) if (!knitted.has(p.orderId)) knitted.set(p.orderId, p.knittedPairs);
  const lines = ids.length ? await ctx.db.select().from(orderLines).where(inArray(orderLines.orderId, ids)) : [];
  const styleIds = [...new Set(lines.map((l) => l.styleId))];
  const plans = styleIds.length ? await ctx.db.select().from(plannings).where(and(inArray(plannings.styleId, styleIds), isNotNull(plannings.needleCount))).orderBy(desc(plannings.updatedAt)) : [];
  const needleOfStyle = new Map<string, string>();
  for (const p of plans) {
    if (!p.styleId || needleOfStyle.has(p.styleId)) continue;
    const v = (p.needleCount ?? "").trim().toUpperCase();
    const digits = v.match(/\d+/)?.[0];
    const hit = needleRows.find((n) => n.code.toUpperCase() === v) ?? (digits ? needleRows.find((n) => n.needles === Number(digits)) : undefined);
    if (hit) needleOfStyle.set(p.styleId, hit.id);
  }
  const unproduced = new Map<string, number>();
  for (const o of orders) {
    const baseId = baseOfFactory.get(o.factoryId!);
    const remaining = Math.max(0, o.totalPairs - (knitted.get(o.id) ?? 0));
    if (!baseId || !remaining) continue;
    const own = lines.filter((l) => l.orderId === o.id && l.quantity > 0);
    const total = own.reduce((s, l) => s + l.quantity, 0);
    const shares = total > 0 ? own.map((l) => ({ needle: needleOfStyle.get(l.styleId) ?? fallback, share: l.quantity / total })) : [{ needle: fallback, share: 1 }];
    for (const s of shares) {
      if (!s.needle) continue;
      const key = `${baseId}:${s.needle}`;
      unproduced.set(key, (unproduced.get(key) ?? 0) + remaining * s.share);
    }
  }
  const cells = new Map(machines.map((m) => [`${m.baseId}:${m.needleTypeId}`, { baseId: m.baseId, needleTypeId: m.needleTypeId, machineCount: m.machineCount, dailyOutput: m.dailyOutputPerMachine }]));
  for (const key of unproduced.keys()) {
    if (cells.has(key)) continue;
    const [baseId, needleTypeId] = key.split(":") as [string, string];
    cells.set(key, { baseId, needleTypeId, machineCount: 0, dailyOutput: 0 });
  }
  const rows: KnitRow[] = [];
  for (const c of cells.values()) {
    const base = baseRows.find((b) => b.id === c.baseId);
    const needle = needleRows.find((n) => n.id === c.needleTypeId);
    if (!base || !needle) continue;
    rows.push({ ...c, baseCode: base.code, needles: needle.needles, leadDays: LEAD_DAYS[base.code] ?? 7, otdUnproduced: r3(unproduced.get(`${c.baseId}:${c.needleTypeId}`) ?? 0), erpBacklog: 0 });
  }
  return rows.sort((a, b) => a.baseCode.localeCompare(b.baseCode) || a.needles - b.needles);
}

function knitValues(versionId: string, rows: KnitRow[]) {
  return rows.map((r, i) => ({
    versionId,
    ledger: "KNIT",
    baseId: r.baseId,
    needleTypeId: r.needleTypeId,
    leadDays: r.leadDays,
    machineCount: r.machineCount,
    dailyOutput: r.dailyOutput,
    ...figures(r),
    sources: { leadDays: "DEFAULT", machineCount: "MANUAL", dailyOutput: "SYNC", unproducedQty: "SYNC", erpBacklog: "SYNC" } as Record<string, "MANUAL" | "SYNC" | "DEFAULT">,
    extra: { otdUnproduced: r.otdUnproduced, erpBacklog: r.erpBacklog },
    sort: i + 1,
  }));
}

function manualValues(versionId: string, baseIds: Record<string, string>, week: 0 | 1) {
  const packing: [string, Record<string, unknown>][] = [
    ["DC", { lines: 6, monthOrders: week ? 176.5 : 182.4, scheduled: week ? 150.8 : 160.2, loadRate: week ? 85 : 88 }],
    ["NH", { lines: 4, monthOrders: week ? 120.3 : 126.8, scheduled: week ? 112.6 : 121, loadRate: week ? 94 : 95 }],
    ["VN", { lines: 3, monthOrders: week ? 60.1 : 64.2, scheduled: week ? 44.9 : 48.5, loadRate: week ? 75 : 76 }],
  ];
  const special: [string, string, Record<string, unknown>][] = [
    ["DC", "刺绣", { dailyCapacity: 8000, bookedUntil: week ? "2026-11-05" : "2026-11-12", status: "PENDING" }],
    ["NH", "点胶防滑", { dailyCapacity: 26000, bookedUntil: week ? "2026-10-29" : "2026-11-03", status: "DONE" }],
    ["VN", "定型", { dailyCapacity: 40000, bookedUntil: week ? "2026-10-26" : "2026-10-30", status: "DONE" }],
  ];
  return [
    ...packing.filter(([b]) => baseIds[b]).map(([b, extra], i) => ({ versionId, ledger: "PACKING", baseId: baseIds[b]!, extra, sources: { extra: "MANUAL" } as Record<string, "MANUAL">, sort: i + 1 })),
    ...special.filter(([b]) => baseIds[b]).map(([b, process, extra], i) => ({ versionId, ledger: "SPECIAL", baseId: baseIds[b]!, process, extra, sources: { extra: "MANUAL" } as Record<string, "MANUAL">, sort: i + 1 })),
  ];
}

export async function seedCapacityDemo(ctx: SeedContext): Promise<void> {
  const planner = ctx.users[PLANNER] ?? null;
  const baseIds = Object.fromEntries((await ctx.db.select().from(bases)).map((b) => [b.code, b.id]));
  const knit = await computeKnit(ctx);
  if (!knit.length) return;

  for (const r of knit) {
    const target = TARGET_SPARE_RATE[`${r.baseCode}-${r.needles}N`];
    if (target === undefined) continue;
    const capacity = figures(r).cumulativeCapacity;
    r.erpBacklog = Math.max(0, Math.round((capacity * (1 - target) - r.otdUnproduced) / 100) * 100);
  }

  const v25 = (
    await ctx.db
      .insert(capacityLedgerVersions)
      .values({ versionNo: 25, label: "V25", asOfDate: ctx.day(-8), windowDays: WINDOW_DAYS, status: "PUBLISHED", publishedAt: ctx.at(-8, 10), publishedBy: planner, note: "周更新", createdBy: planner, createdAt: ctx.at(-8, 8) })
      .returning({ id: capacityLedgerVersions.id })
  )[0]!;
  const lastWeek = knit.map((r) => ({ ...r, otdUnproduced: r3(r.otdUnproduced * 1.2), erpBacklog: Math.round((r.erpBacklog * 1.05) / 100) * 100 }));
  await ctx.db.insert(capacityRows).values([...knitValues(v25.id, lastWeek), ...manualValues(v25.id, baseIds, 1)]);

  const v26 = (
    await ctx.db
      .insert(capacityLedgerVersions)
      .values({ versionNo: 26, label: "V26", asOfDate: ctx.day(-1), windowDays: WINDOW_DAYS, status: "DRAFT", note: "周更新 · 系统计算", createdBy: planner, createdAt: ctx.at(-1, 8) })
      .returning({ id: capacityLedgerVersions.id })
  )[0]!;
  await ctx.db.insert(capacityRows).values([...knitValues(v26.id, knit), ...manualValues(v26.id, baseIds, 0)]);

  const tasks: [string, number, string, number | null, string | null][] = [
    ["KNIT", 6, "PENDING", -1, null],
    ["PACKING", 28, "DONE", -1, null],
    ["SPECIAL", -2, "OVERDUE", -32, "SPECIAL"],
    ["UTILIZATION", 6, "PENDING", -1, null],
    ["FORECAST", 8, "UPDATING", -23, null],
  ];
  for (const [ledger, dueOffset, status, lastOffset, overdue] of tasks) {
    await ctx.db
      .update(ledgerTasks)
      .set({
        nextDueAt: ctx.day(dueOffset),
        status,
        lastUpdatedAt: lastOffset === null ? null : ctx.at(lastOffset, 8),
        note: overdue ? `应更新日 ${ctx.day(dueOffset)}，逾期 ${-dueOffset} 天，已升级告警至集团计划部负责人` : null,
        escalatedAt: overdue ? ctx.at(dueOffset + 1, 1) : null,
      })
      .where(eq(ledgerTasks.ledger, ledger));
  }
}

import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import {
  type FileRefDto,
  HANDOVER_ITEMS,
  HANDOVER_NOT_APPLICABLE,
  HANDOVER_STALE_DAYS,
  type HandoverCheckDto,
  type HandoverDto,
  type HandoverItemKey,
  type HandoverSnapshotDto,
  type HandoverStatus,
  documentErrors,
  type handoverCreateSchema,
  type handoverListQuerySchema,
} from "@otd/contracts/document";
import {
  type Database,
  type DbOrTx,
  type HandoverChecklist,
  customers,
  files,
  handoverPackages,
  quoteRounds,
  quotes,
  sampleLibrary,
  sampleRounds,
  samples,
  styles,
  testReportLinks,
  testReports,
  users,
} from "@otd/db";
import { canTransition } from "@otd/shared";
import { type SQL, and, desc, eq, gte, ilike, inArray, lt, or } from "drizzle-orm";
import type { z } from "zod";
import { type AccessContext, systemContext } from "../../core/access/access.types.js";
import { assertCanSee, scoped } from "../../core/access/scope.js";
import { AuditService } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, assertFound, gateBlocked, illegalTransition, versionConflict } from "../../core/errors.js";
import { EventBus, inTransaction } from "../../core/events.js";
import { NumberingService } from "../../core/numbering.service.js";
import { countAll, iso, likeKeyword, paginate } from "../../core/paging.js";
import { Scheduler } from "../../core/scheduler.js";
import { DB } from "../../core/tokens.js";
import { FlowConfigService } from "../flow/flow-config.service.js";
import { NotificationService } from "../notification/notification.service.js";
import { TodoService } from "../todo/todo.service.js";

type HandoverRow = typeof handoverPackages.$inferSelect;
type Evaluation = {
  checklist: HandoverCheckDto[];
  ready: boolean;
  missing: string[];
  refs: Omit<HandoverSnapshotDto, "styleId" | "styleNo" | "techPackFileId" | "checkedAt">;
};

const DAY = 86_400_000;
const isReady = (list: HandoverCheckDto[]) => list.every((c) => !c.applicable || c.ok);
const missingOf = (list: HandoverCheckDto[]) => list.filter((c) => c.applicable && !c.ok).map((c) => c.label.zh);
export const staleTodoKey = (id: string) => `document.handover:${id}:collecting`;

@Injectable()
export class HandoverService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly todos: TodoService,
    private readonly notifications: NotificationService,
    private readonly scheduler: Scheduler,
    private readonly flow: FlowConfigService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({ name: "document.handover-stale", dailyAt: "08:00", run: () => this.remindStale() });
    this.events.on("quote.round.accepted", "document.handover.ensure", async (e) => {
      const styleId = e.payload.styleId;
      if (typeof styleId === "string") await this.ensureForStyle(styleId);
    });
  }

  async list(ctx: AccessContext, q: z.infer<typeof handoverListQuerySchema>): Promise<Page<HandoverDto>> {
    const conds: SQL[] = [scoped(handoverPackages, ctx)];
    if (q.status?.length) conds.push(inArray(handoverPackages.status, q.status));
    if (q.customerId) conds.push(eq(handoverPackages.customerId, q.customerId));
    const kw = likeKeyword(q.keyword);
    if (kw) {
      conds.push(
        or(
          ilike(handoverPackages.docNo, kw),
          inArray(handoverPackages.styleId, this.db.select({ id: styles.id }).from(styles).where(or(ilike(styles.styleNo, kw), ilike(styles.nameZh, kw), ilike(styles.nameEn, kw)))),
        )!,
      );
    }
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(handoverPackages).where(where))[0]!.n,
      async (limit, offset) => this.toDtos(await this.db.select().from(handoverPackages).where(where).orderBy(desc(handoverPackages.updatedAt)).limit(limit).offset(offset)),
    );
  }

  async get(ctx: AccessContext, id: string): Promise<HandoverDto> {
    const row = assertCanSee(ctx, (await this.db.select().from(handoverPackages).where(eq(handoverPackages.id, id)))[0]);
    return (await this.toDtos([row]))[0]!;
  }

  async create(ctx: AccessContext, input: z.infer<typeof handoverCreateSchema>): Promise<HandoverDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const style = assertCanSee(ctx, (await tx.select().from(styles).where(eq(styles.id, input.styleId)))[0]);
      const existing = (await tx.select().from(handoverPackages).where(eq(handoverPackages.styleId, style.id)))[0];
      if (existing) throw new AppError(documentErrors.DOCUMENT_HANDOVER_EXISTS, { styleNo: style.styleNo, docNo: existing.docNo });
      if (input.techPackFileId) assertFound((await tx.select({ id: files.id }).from(files).where(eq(files.id, input.techPackFileId)))[0]);
      const created = await this.insert(ctx, style, input.techPackFileId ?? null, tx);
      emit({ type: "document.handover.created", aggregateType: "handover", aggregateId: created.id, payload: { docNo: created.docNo, styleId: style.id } });
      return created;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async ensureForStyle(styleId: string): Promise<void> {
    const sys = systemContext();
    await inTransaction(this.db, this.events, async (tx, emit) => {
      if ((await tx.select({ id: handoverPackages.id }).from(handoverPackages).where(eq(handoverPackages.styleId, styleId)))[0]) return;
      const style = (await tx.select().from(styles).where(eq(styles.id, styleId)))[0];
      if (!style) return;
      const created = await this.insert(sys, style, null, tx);
      emit({ type: "document.handover.created", aggregateType: "handover", aggregateId: created.id, payload: { docNo: created.docNo, styleId, source: "quote.accepted" } });
    });
  }

  async uploadTechPack(ctx: AccessContext, id: string, input: { fileId: string; version: number }): Promise<HandoverDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = assertCanSee(ctx, (await tx.select().from(handoverPackages).where(eq(handoverPackages.id, id)))[0]);
      if (before.version !== input.version) throw versionConflict();
      if (before.status === "HANDED_OVER") throw new AppError(documentErrors.DOCUMENT_HANDOVER_FROZEN);
      const file = assertFound((await tx.select().from(files).where(eq(files.id, input.fileId)))[0]);
      await tx.update(files).set({ ownerType: "handover", ownerId: id }).where(eq(files.id, file.id));
      const updated = (await tx.update(handoverPackages).set({ techPackFileId: file.id, version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(handoverPackages.id, id), eq(handoverPackages.version, input.version))).returning())[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: "document.handover.techPack", objectType: "handover", objectId: id, docNo: before.docNo, diff: { techPack: { from: before.techPackFileId, to: file.filename } } }, tx);
      emit({ type: "document.handover.updated", aggregateType: "handover", aggregateId: id, payload: { docNo: before.docNo, styleId: before.styleId, techPackFileId: file.id } });
      return updated;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async complete(ctx: AccessContext, id: string, version: number): Promise<HandoverDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = assertCanSee(ctx, (await tx.select().from(handoverPackages).where(eq(handoverPackages.id, id)))[0]);
      if (before.version !== version) throw versionConflict();
      if (!canTransition("handover", before.status as HandoverStatus, "HANDED_OVER")) throw illegalTransition(before.status, "complete");
      const style = assertFound((await tx.select().from(styles).where(eq(styles.id, before.styleId)))[0]);
      const evaluation = (await this.evaluate([before], tx)).get(before.styleId)!;
      if (!evaluation.ready) throw gateBlocked("G1", evaluation.missing);
      const now = this.clock.now();
      const snapshot: HandoverSnapshotDto = { styleId: style.id, styleNo: style.styleNo, ...evaluation.refs, techPackFileId: before.techPackFileId, checkedAt: now.toISOString() };
      const checklist: HandoverChecklist = Object.fromEntries(evaluation.checklist.map((c) => [c.key, { ok: c.ok, applicable: c.applicable, ...(c.ref ? { ref: c.ref } : {}), ...(c.refId ? { refId: c.refId } : {}), ...(c.note ? { note: c.note } : {}) }]));
      const updated = (
        await tx
          .update(handoverPackages)
          .set({ status: "HANDED_OVER", frozenAt: now, completedBy: ctx.userId, checklist, qrsLibraryId: evaluation.refs.qrsLibraryId, snapshot, version: before.version + 1, updatedBy: ctx.userId })
          .where(and(eq(handoverPackages.id, id), eq(handoverPackages.version, version)))
          .returning()
      )[0];
      if (!updated) throw versionConflict();
      await this.todos.close(staleTodoKey(id), tx);
      await this.audit.log(ctx, { action: "document.handover.complete", objectType: "handover", objectId: id, docNo: before.docNo, diff: { status: { from: before.status, to: "HANDED_OVER" } } }, tx);
      await this.notifications.notify(
        [before.ownerId].filter((u) => u !== ctx.userId),
        { type: "document.handover.completed", title: `开发移交完成 ${before.docNo}`, body: `#${style.styleNo} G1 条件已齐套，开发资料已冻结`, link: `/documents/handovers/${id}` },
        tx,
      );
      emit({ type: "document.handover.completed", aggregateType: "handover", aggregateId: id, payload: { docNo: before.docNo, styleId: style.id, customerId: before.customerId, snapshot } });
      return updated;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async change(ctx: AccessContext, id: string, input: { reason: string; version: number }): Promise<HandoverDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = assertCanSee(ctx, (await tx.select().from(handoverPackages).where(eq(handoverPackages.id, id)))[0]);
      if (before.version !== input.version) throw versionConflict();
      if (!canTransition("handover", before.status as HandoverStatus, "COLLECTING")) throw illegalTransition(before.status, "change");
      const now = this.clock.now();
      const entry = { at: now.toISOString(), by: ctx.userId, byName: ctx.userName, reason: input.reason };
      const updated = (
        await tx
          .update(handoverPackages)
          .set({ status: "COLLECTING", frozenAt: null, collectingSince: now, changeLog: [...before.changeLog, entry], version: before.version + 1, updatedBy: ctx.userId })
          .where(and(eq(handoverPackages.id, id), eq(handoverPackages.version, input.version)))
          .returning()
      )[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: "document.handover.change", objectType: "handover", objectId: id, docNo: before.docNo, diff: { status: { from: before.status, to: "COLLECTING" }, reason: { from: null, to: input.reason } } }, tx);
      emit({ type: "document.handover.changed", aggregateType: "handover", aggregateId: id, payload: { docNo: before.docNo, styleId: before.styleId, reason: input.reason } });
      return updated;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async remindStale(): Promise<{ reminded: string[] }> {
    const cutoff = new Date(this.clock.now().getTime() - HANDOVER_STALE_DAYS * DAY);
    const rows = await this.db.select().from(handoverPackages).where(and(eq(handoverPackages.status, "COLLECTING"), lt(handoverPackages.collectingSince, cutoff)));
    if (!rows.length) return { reminded: [] };
    const evaluations = await this.evaluate(rows, this.db);
    const styleRows = await this.db.select({ id: styles.id, styleNo: styles.styleNo }).from(styles).where(inArray(styles.id, rows.map((r) => r.styleId)));
    const now = this.clock.now().getTime();
    for (const r of rows) {
      const ev = evaluations.get(r.styleId)!;
      const styleNo = styleRows.find((s) => s.id === r.styleId)?.styleNo ?? "";
      const days = Math.floor((now - r.collectingSince.getTime()) / DAY);
      await this.todos.upsert({
        fingerprint: staleTodoKey(r.id),
        source: "FLOW",
        action: "document.handover",
        title: `完成开发移交 ${r.docNo}`,
        description: `#${styleNo} 齐套中已 ${days} 天${ev.missing.length ? `，缺：${ev.missing.join("、")}` : "，条件已齐，待确认移交"}`,
        docType: "handover",
        docId: r.id,
        docNo: r.docNo,
        link: `/documents/handovers/${r.id}`,
        customerId: r.customerId,
        assigneeId: r.ownerId,
        dueAt: new Date(r.collectingSince.getTime() + HANDOVER_STALE_DAYS * DAY),
      });
    }
    return { reminded: rows.map((r) => r.docNo) };
  }

  private async insert(ctx: AccessContext, style: typeof styles.$inferSelect, techPackFileId: string | null, tx: DbOrTx): Promise<HandoverRow> {
    const docNo = await this.numbering.next("handover", tx);
    const created = (
      await tx
        .insert(handoverPackages)
        .values({ docNo, styleId: style.id, status: "COLLECTING", techPackFileId, collectingSince: this.clock.now(), ownerId: style.ownerId, orgId: style.orgId, customerId: style.customerId, createdBy: ctx.system ? null : ctx.userId })
        .returning()
    )[0]!;
    if (techPackFileId) await tx.update(files).set({ ownerType: "handover", ownerId: created.id }).where(eq(files.id, techPackFileId));
    await this.audit.log(ctx, { action: "document.handover.create", objectType: "handover", objectId: created.id, docNo }, tx);
    return created;
  }

  async evaluate(rows: Pick<HandoverRow, "styleId" | "techPackFileId" | "customerId">[], db: DbOrTx): Promise<Map<string, Evaluation>> {
    const styleIds = [...new Set(rows.map((r) => r.styleId))];
    const out = new Map<string, Evaluation>();
    if (!styleIds.length) return out;
    const today = this.clock.today();
    const flows = new Map<string, { conditions: string[]; versionId: string | null }>();
    for (const customerId of new Set(rows.map((r) => r.customerId))) {
      flows.set(customerId, { conditions: await this.flow.gateConditions(customerId, "G1", null, db), versionId: await this.flow.currentVersionId(customerId, db) });
    }
    const approved = await db
      .select({ id: sampleRounds.id, roundNo: sampleRounds.roundNo, roundType: sampleRounds.roundType, docNo: samples.docNo, styleId: samples.styleId })
      .from(sampleRounds)
      .innerJoin(samples, eq(samples.id, sampleRounds.sampleId))
      .where(and(inArray(samples.styleId, styleIds), eq(sampleRounds.status, "APPROVED")));
    const accepted = await db
      .select({ id: quoteRounds.id, docNo: quoteRounds.docNo, roundNo: quoteRounds.roundNo, styleId: quotes.styleId })
      .from(quoteRounds)
      .innerJoin(quotes, eq(quotes.id, quoteRounds.quoteId))
      .where(and(inArray(quotes.styleId, styleIds), eq(quoteRounds.kind, "CUSTOMER"), eq(quoteRounds.status, "ACCEPTED")));
    const links = await db.select().from(testReportLinks).where(inArray(testReportLinks.styleId, styleIds));
    const linkedIds = [...new Set(links.map((l) => l.reportId))];
    const reports = await db
      .select({ id: testReports.id, docNo: testReports.docNo, agencyReportNo: testReports.agencyReportNo, styleId: testReports.styleId, validUntil: testReports.validUntil })
      .from(testReports)
      .where(and(linkedIds.length ? or(inArray(testReports.styleId, styleIds), inArray(testReports.id, linkedIds)) : inArray(testReports.styleId, styleIds), eq(testReports.result, "PASS"), gte(testReports.validUntil, today)));
    const qrs = await db.select().from(sampleLibrary).where(and(inArray(sampleLibrary.styleId, styleIds), eq(sampleLibrary.kind, "QRS")));
    const fileIds = [...new Set(rows.map((r) => r.techPackFileId).filter((x): x is string => !!x))];
    const fileRows = fileIds.length ? await db.select({ id: files.id, filename: files.filename }).from(files).where(inArray(files.id, fileIds)) : [];
    for (const row of rows) {
      const sid = row.styleId;
      const sample = approved.filter((a) => a.styleId === sid).sort((a, b) => b.roundNo - a.roundNo);
      const quote = accepted.filter((a) => a.styleId === sid).sort((a, b) => b.roundNo - a.roundNo)[0];
      const reportList = reports.filter((r) => r.styleId === sid || links.some((l) => l.reportId === r.id && l.styleId === sid)).sort((a, b) => b.validUntil.localeCompare(a.validUntil));
      const qrsRow = qrs.filter((q) => q.styleId === sid)[0];
      const file = row.techPackFileId ? fileRows.find((f) => f.id === row.techPackFileId) : undefined;
      const facts: Record<HandoverItemKey, { ok: boolean; ref: string | null; refId: string | null; note: string | null }> = {
        sampleApproved: { ok: sample.length > 0, ref: sample[0] ? `${sample[0].docNo} 第 ${sample[0].roundNo} 轮 ${sample[0].roundType}` : null, refId: sample[0]?.id ?? null, note: null },
        quoteAccepted: { ok: !!quote, ref: quote?.docNo ?? null, refId: quote?.id ?? null, note: null },
        testReportValid: { ok: reportList.length > 0, ref: reportList[0] ? `${reportList[0].docNo} / ${reportList[0].agencyReportNo}` : null, refId: reportList[0]?.id ?? null, note: reportList[0] ? `有效期至 ${reportList[0].validUntil}` : null },
        qrsRetained: { ok: !!qrsRow, ref: qrsRow ? (qrsRow.location ?? "QRS") : null, refId: qrsRow?.id ?? null, note: qrsRow ? `${qrsRow.quantity} 件` : null },
        techPackUploaded: { ok: !!row.techPackFileId, ref: file?.filename ?? null, refId: row.techPackFileId, note: null },
      };
      const flow = flows.get(row.customerId)!;
      const checklist = HANDOVER_ITEMS.map((item) => {
        const f = facts[item.key];
        const applicable = flow.conditions.includes(item.key);
        return { key: item.key, label: item.label, applicable, ok: f.ok, ref: f.ref, refId: f.refId, note: !applicable ? HANDOVER_NOT_APPLICABLE.zh : f.ok ? f.note : item.missing.zh };
      });
      out.set(sid, {
        checklist,
        ready: isReady(checklist),
        missing: missingOf(checklist),
        refs: {
          conditions: checklist.filter((c) => c.applicable).map((c) => c.key),
          flowVersionId: flow.versionId,
          sampleRoundIds: sample.map((s) => s.id),
          sampleRef: facts.sampleApproved.ref,
          quoteRoundId: quote?.id ?? null,
          quoteDocNo: quote?.docNo ?? null,
          reportIds: reportList.map((r) => r.id),
          reportRef: facts.testReportValid.ref,
          qrsLibraryId: qrsRow?.id ?? null,
        },
      });
    }
    return out;
  }

  private storedChecklist(stored: HandoverChecklist): HandoverCheckDto[] {
    return HANDOVER_ITEMS.map((item) => {
      const s = stored[item.key];
      return { key: item.key, label: item.label, applicable: s?.applicable ?? true, ok: !!s?.ok, ref: s?.ref ?? null, refId: s?.refId ?? null, note: s?.note ?? null };
    });
  }

  private async toDtos(rows: HandoverRow[]): Promise<HandoverDto[]> {
    if (!rows.length) return [];
    const styleRows = await this.db.select().from(styles).where(inArray(styles.id, rows.map((r) => r.styleId)));
    const custRows = await this.db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, [...new Set(rows.map((r) => r.customerId))]));
    const userIds = [...new Set(rows.flatMap((r) => [r.ownerId, r.completedBy]).filter((x): x is string => !!x))];
    const userRows = userIds.length ? await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds)) : [];
    const fileIds = [...new Set(rows.map((r) => r.techPackFileId).filter((x): x is string => !!x))];
    const fileRows = fileIds.length ? await this.db.select().from(files).where(inArray(files.id, fileIds)) : [];
    const live = await this.evaluate(rows.filter((r) => r.status !== "HANDED_OVER"), this.db);
    const now = this.clock.now().getTime();
    const name = (id: string | null) => (id ? (userRows.find((u) => u.id === id)?.name ?? null) : null);
    return rows.map((r) => {
      const style = styleRows.find((s) => s.id === r.styleId);
      const frozen = r.status === "HANDED_OVER";
      const checklist = frozen ? this.storedChecklist(r.checklist) : live.get(r.styleId)!.checklist;
      const file = r.techPackFileId ? fileRows.find((f) => f.id === r.techPackFileId) : undefined;
      const fileRef: FileRefDto | null = file ? { id: file.id, filename: file.filename, contentType: file.contentType, size: file.size } : null;
      const end = frozen && r.frozenAt ? r.frozenAt.getTime() : now;
      return {
        id: r.id,
        docNo: r.docNo,
        styleId: r.styleId,
        styleNo: style?.styleNo ?? "",
        styleName: style?.nameZh ?? "",
        seasonCode: style?.seasonCode ?? null,
        customerId: r.customerId,
        customerName: custRows.find((c) => c.id === r.customerId)?.name ?? "",
        ownerId: r.ownerId,
        ownerName: name(r.ownerId) ?? "",
        status: r.status as HandoverStatus,
        checklist,
        ready: isReady(checklist),
        missing: missingOf(checklist),
        okCount: checklist.filter((c) => c.applicable && c.ok).length,
        applicableCount: checklist.filter((c) => c.applicable).length,
        techPackFile: fileRef,
        frozenAt: iso(r.frozenAt),
        completedBy: r.completedBy,
        completedByName: name(r.completedBy),
        snapshot: (r.snapshot as HandoverSnapshotDto | null) ?? null,
        changeLog: r.changeLog,
        collectingSince: r.collectingSince.toISOString(),
        collectingDays: Math.max(0, Math.floor((end - r.collectingSince.getTime()) / DAY)),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        version: r.version,
      };
    });
  }
}

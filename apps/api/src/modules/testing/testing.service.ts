import { Inject, Injectable } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import {
  type ReportStatus,
  type ReuseCheckResultDto,
  type ReuseKey,
  type ReuseMatchDto,
  TEST_ITEM_LABELS,
  type TestItem,
  type TestReportDto,
  type TestRequestDetailDto,
  type TestRequestDto,
  type TestRequestStatus,
  type reportCreateSchema,
  type reportListQuerySchema,
  type reportUpdateSchema,
  type testCompleteSchema,
  type testReceiveSchema,
  type testRequestCreateSchema,
  type testRequestListQuerySchema,
  type testRequestUpdateSchema,
  type testSubmitSchema,
  testingErrors,
} from "@otd/contracts/testing";
import { type Database, type DbOrTx, customers, factories, styles, systemParams, testAgencies, testReportLinks, testReports, testRequests, users } from "@otd/db";
import { canTransition } from "@otd/shared";
import { type SQL, and, desc, eq, gt, gte, ilike, inArray, lt, lte, or, sql } from "drizzle-orm";
import type { z } from "zod";
import type { AccessContext } from "../../core/access/access.types.js";
import { assertCanSee, customerScoped, requirePermission, scoped } from "../../core/access/scope.js";
import { AuditService, diffOf } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, assertFound, illegalTransition, notFound, versionConflict } from "../../core/errors.js";
import { type DomainEvent, EventBus, inTransaction } from "../../core/events.js";
import { FileService } from "../../core/files/file.service.js";
import { NumberingService } from "../../core/numbering.service.js";
import { countAll, iso, likeKeyword, paginate } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";
import { NotificationService } from "../notification/notification.service.js";
import { firstUserWithRole } from "../sample/assignees.js";
import { TodoService } from "../todo/todo.service.js";
import { addDays, addMonths, addWorkdays, daysBetween, serviceWorkdays } from "./testing.dates.js";

type RequestRow = typeof testRequests.$inferSelect;
type ReportRow = typeof testReports.$inferSelect;
type StyleRow = typeof styles.$inferSelect;
type Emit = (e: DomainEvent) => void;

export const QUALITY_ROLE = "R005";
const DEFAULT_EXPIRING_DAYS = 30;
const DEFAULT_LAB_DAYS = 7;
const EDITABLE: TestRequestStatus[] = ["DRAFT", "AWAITING_SAMPLE"];
const RESULT_NOTE = "电子档案取号入共享盘并回传客户系统 · 纸质交授检";

const itemLabel = (item: string) => TEST_ITEM_LABELS[item as TestItem]?.zh ?? item;
const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();
const sameKey = (a: string | undefined, b: string | undefined) => !!norm(a) && norm(a) === norm(b);

@Injectable()
export class TestingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly files: FileService,
    private readonly todos: TodoService,
    private readonly notifications: NotificationService,
  ) {}

  async expiringDays(db: DbOrTx = this.db): Promise<number> {
    const row = (await db.select({ value: systemParams.value }).from(systemParams).where(eq(systemParams.key, "testing.expiringDays")))[0];
    const n = Number(row?.value);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_EXPIRING_DAYS;
  }

  reportStatus(validUntil: string, today: string, expiringDays: number): ReportStatus {
    if (validUntil < today) return "EXPIRED";
    if (validUntil <= addDays(today, expiringDays)) return "EXPIRING";
    return "VALID";
  }

  async list(ctx: AccessContext, q: z.infer<typeof testRequestListQuerySchema>): Promise<Page<TestRequestDto>> {
    const conds: SQL[] = [scoped(testRequests, ctx)];
    if (q.status?.length) conds.push(inArray(testRequests.status, q.status));
    if (q.customerId) conds.push(eq(testRequests.customerId, q.customerId));
    if (q.stage) conds.push(eq(testRequests.stage, q.stage));
    if (q.styleId) conds.push(eq(testRequests.styleId, q.styleId));
    if (q.result) conds.push(eq(testRequests.result, q.result));
    const kw = likeKeyword(q.keyword);
    if (kw) {
      const styleIds = this.db.select({ id: styles.id }).from(styles).where(or(ilike(styles.styleNo, kw), ilike(styles.nameZh, kw)));
      const custIds = this.db.select({ id: customers.id }).from(customers).where(or(ilike(customers.name, kw), ilike(customers.code, kw)));
      const agencyIds = this.db.select({ id: testAgencies.id }).from(testAgencies).where(ilike(testAgencies.name, kw));
      const itemCodes = Object.entries(TEST_ITEM_LABELS)
        .filter(([, l]) => l.zh.includes(q.keyword!.trim()) || l.en.toLowerCase().includes(q.keyword!.trim().toLowerCase()))
        .map(([code]) => code);
      const itemConds = itemCodes.map((code) => sql`${testRequests.items} @> ${JSON.stringify([code])}::jsonb`);
      conds.push(
        or(
          ilike(testRequests.docNo, kw),
          ilike(testRequests.customerPo, kw),
          ilike(testRequests.trackingNo, kw),
          inArray(testRequests.styleId, styleIds),
          inArray(testRequests.customerId, custIds),
          inArray(testRequests.agencyId, agencyIds),
          ...itemConds,
        )!,
      );
    }
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(testRequests).where(where))[0]!.n,
      async (limit, offset) => this.toDtos(await this.db.select().from(testRequests).where(where).orderBy(desc(testRequests.createdAt), desc(testRequests.docNo)).limit(limit).offset(offset)),
    );
  }

  async get(ctx: AccessContext, id: string): Promise<TestRequestDetailDto> {
    const row = assertCanSee(ctx, (await this.db.select().from(testRequests).where(eq(testRequests.id, id)))[0]);
    const dto = (await this.toDtos([row]))[0]!;
    const linked = this.db.select({ id: testReportLinks.reportId }).from(testReportLinks).where(eq(testReportLinks.styleId, row.styleId));
    const related = await this.db.select().from(testReports).where(or(eq(testReports.styleId, row.styleId), inArray(testReports.id, linked))).orderBy(desc(testReports.issuedDate));
    return { ...dto, relatedReports: await this.toReports(related) };
  }

  async reuseCheck(ctx: AccessContext, input: { styleId: string; items: string[]; reuseKey?: ReuseKey | undefined }, db: DbOrTx = this.db): Promise<ReuseCheckResultDto> {
    const style = assertCanSee(ctx, (await db.select().from(styles).where(eq(styles.id, input.styleId)))[0]);
    const today = this.clock.today();
    const ownLinks = await db.select({ reportId: testReportLinks.reportId }).from(testReportLinks).where(eq(testReportLinks.styleId, style.id));
    const ownIds = new Set(ownLinks.map((l) => l.reportId));
    const reports = await db.select().from(testReports).where(and(eq(testReports.customerId, style.customerId), customerScoped(testReports.customerId, ctx))).orderBy(desc(testReports.issuedDate));
    const own = reports.filter((r) => r.styleId === style.id || ownIds.has(r.id));
    const key: ReuseKey = input.reuseKey && Object.values(input.reuseKey).some((v) => !!v?.trim()) ? input.reuseKey : (own.find((r) => Object.keys(r.reuseKey).length)?.reuseKey ?? {});
    const items = [...new Set(input.items)];
    const matches: { row: ReportRow; m: Omit<ReuseMatchDto, "report"> }[] = [];
    for (const r of reports) {
      const sameStyle = r.styleId === style.id || ownIds.has(r.id);
      const sameStructure = sameKey(key.structure, r.reuseKey.structure);
      const sameCraft = sameKey(key.craft, r.reuseKey.craft);
      const sameYarn = sameKey(key.yarn, r.reuseKey.yarn);
      if (!sameStyle && !sameStructure && !sameCraft && !sameYarn) continue;
      const keyMatch = sameStructure && sameCraft && sameYarn;
      const inValidity = r.validUntil >= today;
      const passed = r.result === "PASS";
      const coveredItems = items.filter((i) => r.items.includes(i));
      const missingItems = items.filter((i) => !r.items.includes(i));
      const reasons: string[] = [];
      if (!sameStyle && !keyMatch) reasons.push(`不同款且${[!sameStructure && "结构", !sameCraft && "工艺", !sameYarn && "纱线"].filter(Boolean).join("、")}不一致`);
      if (!inValidity) reasons.push(`已过期（有效期至 ${r.validUntil}）`);
      if (!passed) reasons.push("结论不合格");
      if (missingItems.length) reasons.push(`未覆盖：${missingItems.map(itemLabel).join("、")}`);
      matches.push({ row: r, m: { sameCustomer: true, sameStyle, sameStructure, sameCraft, sameYarn, inValidity, passed, coveredItems, missingItems, reusable: reasons.length === 0, reasons } });
    }
    matches.sort((a, b) => Number(b.m.reusable) - Number(a.m.reusable) || Number(b.m.sameStyle) - Number(a.m.sameStyle) || b.row.validUntil.localeCompare(a.row.validUntil));
    const dtos = await this.toReports(matches.map((x) => x.row), db);
    const candidates = matches.map((x, i) => ({ report: dtos[i]!, ...x.m }));
    const eligible = candidates.filter((c) => (c.sameStyle || (c.sameStructure && c.sameCraft && c.sameYarn)) && c.inValidity && c.passed);
    const coverage = items.map((item) => {
      const hit = eligible.find((c) => c.coveredItems.includes(item));
      return { item, reportId: hit?.report.id ?? null, reportDocNo: hit?.report.docNo ?? null };
    });
    return { styleId: style.id, items, reuseKey: key, candidates, coverage, bestReportId: candidates.find((c) => c.reusable)?.report.id ?? null };
  }

  async create(ctx: AccessContext, input: z.infer<typeof testRequestCreateSchema>): Promise<TestRequestDetailDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const style = assertCanSee(ctx, (await tx.select().from(styles).where(eq(styles.id, input.styleId)))[0]);
      const { styleId: _s, reuseReportId, reuseKey, ...fields } = input;
      let reused: ReportRow | null = null;
      if (reuseReportId) {
        const check = await this.reuseCheck(ctx, { styleId: style.id, items: input.items, reuseKey }, tx);
        const match = check.candidates.find((c) => c.report.id === reuseReportId);
        if (!match || !match.reusable) {
          const report = (await tx.select().from(testReports).where(eq(testReports.id, reuseReportId)))[0];
          if (!report) throw notFound();
          throw new AppError(testingErrors.TESTING_REPORT_NOT_REUSABLE, { reportNo: report.docNo, reasons: match ? match.reasons.join("；") : "不同客户或结构/工艺/纱线均不一致" });
        }
        reused = assertFound((await tx.select().from(testReports).where(eq(testReports.id, reuseReportId)))[0]);
      }
      const docNo = await this.numbering.next("testRequest", tx);
      const now = this.clock.now();
      const created = (
        await tx
          .insert(testRequests)
          .values({
            ...fields,
            seasonCode: fields.seasonCode ?? style.seasonCode,
            docNo,
            styleId: style.id,
            status: reused ? "COMPLETED" : "DRAFT",
            senderId: ctx.userId,
            ...(reused ? { reusedReportId: reused.id, result: "PASS", completedDate: this.clock.today(), resultNote: `复用报告 ${reused.docNo}（${reused.agencyReportNo}），无需送测` } : {}),
            ownerId: style.ownerId,
            orgId: style.orgId,
            customerId: style.customerId,
            createdBy: ctx.userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
      )[0]!;
      if (reused) await tx.insert(testReportLinks).values({ reportId: reused.id, styleId: style.id, createdAt: now }).onConflictDoNothing();
      await this.audit.log(ctx, { action: reused ? "testing.request.reuse" : "testing.request.create", objectType: "testRequest", objectId: created.id, docNo, ...(reused ? { diff: { reusedReport: reused.docNo } } : {}) }, tx);
      emit({ type: "testing.request.created", aggregateType: "testRequest", aggregateId: created.id, payload: { docNo, styleId: style.id } });
      if (reused) emit({ type: "testing.request.completed", aggregateType: "testRequest", aggregateId: created.id, payload: { docNo, styleId: style.id, reportId: reused.id, result: "PASS", reused: true } });
      return created;
    });
    return this.get(ctx, row.id);
  }

  async update(ctx: AccessContext, id: string, input: z.infer<typeof testRequestUpdateSchema>): Promise<TestRequestDetailDto> {
    await inTransaction(this.db, this.events, async (tx) => {
      const before = assertCanSee(ctx, (await tx.select().from(testRequests).where(eq(testRequests.id, id)))[0]);
      if (before.version !== input.version) throw versionConflict();
      if (!EDITABLE.includes(before.status as TestRequestStatus)) throw new AppError(testingErrors.TESTING_NOT_EDITABLE, { status: before.status });
      const { version: _v, ...rest } = input;
      const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as Partial<RequestRow>;
      await this.updateVersioned(tx, before, { ...patch, updatedBy: ctx.userId });
      await this.audit.log(ctx, { action: "testing.request.update", objectType: "testRequest", objectId: id, docNo: before.docNo, diff: diffOf(before as Record<string, unknown>, patch as Record<string, unknown>) }, tx);
    });
    return this.get(ctx, id);
  }

  async submit(ctx: AccessContext, id: string, input: z.infer<typeof testSubmitSchema>): Promise<TestRequestDetailDto> {
    return this.transition(ctx, id, input.version, "AWAITING_SAMPLE", "submit", async (_tx, before) => ({
      submittedAt: this.clock.now(),
      sentDate: input.sentDate ?? before.sentDate ?? this.clock.today(),
      ...(input.trackingNo ? { trackingNo: input.trackingNo } : {}),
    }));
  }

  async receive(ctx: AccessContext, id: string, input: z.infer<typeof testReceiveSchema>): Promise<TestRequestDetailDto> {
    requirePermission(ctx, "testing.request.advance");
    return this.transition(ctx, id, input.version, "TESTING", "receive", async (tx, before) => {
      const labReceivedDate = input.labReceivedDate ?? this.clock.today();
      const workdays = serviceWorkdays(before.serviceLevel);
      const dueDate = input.dueDate ?? (workdays ? addWorkdays(labReceivedDate, workdays) : (before.dueDate ?? addDays(labReceivedDate, DEFAULT_LAB_DAYS)));
      const quality = await firstUserWithRole(tx, QUALITY_ROLE);
      if (quality) {
        const style = (await tx.select({ styleNo: styles.styleNo }).from(styles).where(eq(styles.id, before.styleId)))[0];
        await this.todos.upsert(
          {
            fingerprint: `testing:request:${before.id}:report`,
            source: "FLOW",
            action: "testing.request.report",
            title: "跟进送测报告",
            description: `#${style?.styleNo ?? ""} · ${before.items.map(itemLabel).join("、")} · 要求 ${dueDate} 出报告`,
            docType: "testRequest",
            docId: before.id,
            docNo: before.docNo,
            link: `/tests/${before.id}`,
            customerId: before.customerId,
            assigneeId: quality.id,
            dueAt: new Date(`${dueDate}T10:00:00Z`),
          },
          tx,
        );
      }
      return { labReceivedDate, dueDate, ...(input.trackingNo ? { trackingNo: input.trackingNo } : {}) };
    });
  }

  async complete(ctx: AccessContext, id: string, input: z.infer<typeof testCompleteSchema>): Promise<TestRequestDetailDto> {
    return this.transition(ctx, id, input.version, "COMPLETED", "complete", async (tx, before, emit) => {
      const r = input.report;
      const validUntil = r.validUntil ?? addMonths(r.issuedDate, 12);
      if (validUntil < r.issuedDate) throw new AppError(testingErrors.TESTING_VALIDITY_INVALID);
      const dup = await tx.select({ id: testReports.id }).from(testReports).where(eq(testReports.agencyReportNo, r.agencyReportNo)).limit(1);
      if (dup.length) throw new AppError(testingErrors.TESTING_DUPLICATE_REPORT, { agencyReportNo: r.agencyReportNo });
      const docNo = await this.numbering.next("testReport", tx);
      const now = this.clock.now();
      const report = (
        await tx
          .insert(testReports)
          .values({
            docNo,
            agencyReportNo: r.agencyReportNo,
            agencyId: before.agencyId,
            styleId: before.styleId,
            items: r.items ?? before.items,
            result: input.result,
            failedItems: input.result === "FAIL" ? (input.failedItems ?? null) : null,
            issuedDate: r.issuedDate,
            validUntil,
            fileId: r.fileId ?? null,
            reuseKey: r.reuseKey ?? {},
            testRequestId: before.id,
            ownerId: before.ownerId,
            orgId: before.orgId,
            customerId: before.customerId,
            createdBy: ctx.userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
      )[0]!;
      await tx.insert(testReportLinks).values({ reportId: report.id, styleId: before.styleId, createdAt: now }).onConflictDoNothing();
      if (r.fileId) await this.files.attach(r.fileId, "testReport", report.id, tx);
      await this.todos.close(`testing:request:${before.id}:report`, tx);
      await this.notifications.notify([before.ownerId], { type: "testing.request.completed", title: `测试完成：${before.docNo} · ${input.result === "PASS" ? "合格" : "不合格"}`, body: `报告 ${docNo} / ${r.agencyReportNo}`, link: `/tests/${before.id}` }, tx);
      await this.audit.log(ctx, { action: "testing.report.create", objectType: "testReport", objectId: report.id, docNo, diff: { agencyReportNo: r.agencyReportNo, result: input.result } }, tx);
      emit({ type: "testing.report.created", aggregateType: "testReport", aggregateId: report.id, payload: { docNo, styleId: before.styleId, result: input.result, validUntil } });
      emit({ type: "testing.request.completed", aggregateType: "testRequest", aggregateId: before.id, payload: { docNo: before.docNo, styleId: before.styleId, reportId: report.id, result: input.result } });
      return {
        result: input.result,
        failedItems: input.result === "FAIL" ? (input.failedItems ?? null) : null,
        correctiveAction: input.correctiveAction ?? null,
        resultNote: input.resultNote ?? RESULT_NOTE,
        completedDate: input.completedDate ?? this.clock.today(),
        reportId: report.id,
      };
    });
  }

  async retest(ctx: AccessContext, id: string, version: number): Promise<TestRequestDetailDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = assertCanSee(ctx, (await tx.select().from(testRequests).where(eq(testRequests.id, id)))[0]);
      if (before.version !== version) throw versionConflict();
      if (before.status !== "COMPLETED" || before.result !== "FAIL") throw new AppError(testingErrors.TESTING_RETEST_NOT_ALLOWED);
      const docNo = await this.numbering.next("testRequest", tx);
      const now = this.clock.now();
      const created = (
        await tx
          .insert(testRequests)
          .values({
            docNo,
            styleId: before.styleId,
            customerPo: before.customerPo,
            colorSize: before.colorSize,
            stage: before.stage,
            entrust: before.entrust,
            agencyId: before.agencyId,
            serviceLevel: before.serviceLevel,
            items: before.items,
            standard: before.standard,
            sampleQty: before.sampleQty,
            sampleSite: before.sampleSite,
            factoryId: before.factoryId,
            seasonCode: before.seasonCode,
            status: "DRAFT",
            senderId: ctx.userId,
            retestOfId: before.id,
            ownerId: before.ownerId,
            orgId: before.orgId,
            customerId: before.customerId,
            createdBy: ctx.userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
      )[0]!;
      await this.audit.log(ctx, { action: "testing.request.retest", objectType: "testRequest", objectId: created.id, docNo, diff: { retestOf: before.docNo } }, tx);
      emit({ type: "testing.request.created", aggregateType: "testRequest", aggregateId: created.id, payload: { docNo, styleId: before.styleId, retestOf: before.id } });
      return created;
    });
    return this.get(ctx, row.id);
  }

  private async transition(
    ctx: AccessContext,
    id: string,
    version: number,
    to: TestRequestStatus,
    action: string,
    patchOf: (tx: DbOrTx, before: RequestRow, emit: Emit) => Promise<Partial<RequestRow>>,
  ): Promise<TestRequestDetailDto> {
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = assertCanSee(ctx, (await tx.select().from(testRequests).where(eq(testRequests.id, id)))[0]);
      if (before.version !== version) throw versionConflict();
      if (!canTransition("testRequest", before.status as TestRequestStatus, to)) throw illegalTransition(before.status, action);
      const patch = await patchOf(tx, before, emit);
      await this.updateVersioned(tx, before, { ...patch, status: to, updatedBy: ctx.userId });
      await this.audit.log(ctx, { action: `testing.request.${action}`, objectType: "testRequest", objectId: id, docNo: before.docNo, diff: { status: { from: before.status, to } } }, tx);
      if (action !== "complete") emit({ type: `testing.request.${action === "submit" ? "submitted" : "received"}`, aggregateType: "testRequest", aggregateId: id, payload: { docNo: before.docNo, styleId: before.styleId } });
    });
    return this.get(ctx, id);
  }

  private async updateVersioned(tx: DbOrTx, before: RequestRow, patch: Partial<RequestRow>): Promise<RequestRow> {
    const updated = (
      await tx
        .update(testRequests)
        .set({ ...patch, version: before.version + 1, updatedAt: this.clock.now() })
        .where(and(eq(testRequests.id, before.id), eq(testRequests.version, before.version)))
        .returning()
    )[0];
    if (!updated) throw versionConflict();
    return updated;
  }

  private reportVisible(ctx: AccessContext): SQL {
    const viaLinks = this.db.select({ id: testReportLinks.reportId }).from(testReportLinks).innerJoin(styles, eq(styles.id, testReportLinks.styleId)).where(scoped(styles, ctx));
    return or(scoped(testReports, ctx), inArray(testReports.id, viaLinks))!;
  }

  async listReports(ctx: AccessContext, q: z.infer<typeof reportListQuerySchema>): Promise<Page<TestReportDto>> {
    const today = this.clock.today();
    const threshold = addDays(today, await this.expiringDays());
    const conds: SQL[] = [this.reportVisible(ctx)];
    if (q.status?.length) {
      const byStatus: Record<string, SQL> = {
        EXPIRED: lt(testReports.validUntil, today),
        EXPIRING: and(gte(testReports.validUntil, today), lte(testReports.validUntil, threshold))!,
        VALID: gt(testReports.validUntil, threshold),
      };
      const parts = q.status.map((s) => byStatus[s]).filter((x): x is SQL => !!x);
      if (parts.length) conds.push(or(...parts)!);
    }
    if (q.customerId) conds.push(eq(testReports.customerId, q.customerId));
    if (q.result) conds.push(eq(testReports.result, q.result));
    if (q.styleId) {
      const linked = this.db.select({ id: testReportLinks.reportId }).from(testReportLinks).where(eq(testReportLinks.styleId, q.styleId));
      conds.push(or(eq(testReports.styleId, q.styleId), inArray(testReports.id, linked))!);
    }
    const kw = likeKeyword(q.keyword);
    if (kw) {
      const styleIds = this.db.select({ id: styles.id }).from(styles).where(or(ilike(styles.styleNo, kw), ilike(styles.nameZh, kw)));
      const agencyIds = this.db.select({ id: testAgencies.id }).from(testAgencies).where(ilike(testAgencies.name, kw));
      conds.push(or(ilike(testReports.docNo, kw), ilike(testReports.agencyReportNo, kw), inArray(testReports.styleId, styleIds), inArray(testReports.agencyId, agencyIds))!);
    }
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(testReports).where(where))[0]!.n,
      async (limit, offset) => this.toReports(await this.db.select().from(testReports).where(where).orderBy(testReports.validUntil, desc(testReports.docNo)).limit(limit).offset(offset)),
    );
  }

  async getReport(ctx: AccessContext, id: string): Promise<TestReportDto> {
    const row = (await this.db.select().from(testReports).where(and(eq(testReports.id, id), this.reportVisible(ctx))))[0];
    if (!row) throw notFound();
    return (await this.toReports([row]))[0]!;
  }

  async createReport(ctx: AccessContext, input: z.infer<typeof reportCreateSchema>): Promise<TestReportDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const style = assertCanSee(ctx, (await tx.select().from(styles).where(eq(styles.id, input.styleId)))[0]);
      const validUntil = input.validUntil ?? addMonths(input.issuedDate, 12);
      if (validUntil < input.issuedDate) throw new AppError(testingErrors.TESTING_VALIDITY_INVALID);
      const dup = await tx.select({ id: testReports.id }).from(testReports).where(eq(testReports.agencyReportNo, input.agencyReportNo)).limit(1);
      if (dup.length) throw new AppError(testingErrors.TESTING_DUPLICATE_REPORT, { agencyReportNo: input.agencyReportNo });
      return this.insertReport(ctx, tx, emit, style, { ...input, validUntil });
    });
    return (await this.toReports([row]))[0]!;
  }

  private async insertReport(ctx: AccessContext, tx: DbOrTx, emit: Emit, style: StyleRow, input: z.infer<typeof reportCreateSchema> & { validUntil: string }): Promise<ReportRow> {
    const docNo = await this.numbering.next("testReport", tx);
    const now = this.clock.now();
    const report = (
      await tx
        .insert(testReports)
        .values({
          docNo,
          agencyReportNo: input.agencyReportNo,
          agencyId: input.agencyId ?? null,
          styleId: style.id,
          items: input.items,
          result: input.result,
          failedItems: input.result === "FAIL" ? (input.failedItems ?? null) : null,
          issuedDate: input.issuedDate,
          validUntil: input.validUntil,
          fileId: input.fileId ?? null,
          reuseKey: input.reuseKey ?? {},
          ownerId: style.ownerId,
          orgId: style.orgId,
          customerId: style.customerId,
          createdBy: ctx.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
    )[0]!;
    await tx.insert(testReportLinks).values({ reportId: report.id, styleId: style.id, createdAt: now }).onConflictDoNothing();
    if (input.fileId) await this.files.attach(input.fileId, "testReport", report.id, tx);
    await this.audit.log(ctx, { action: "testing.report.create", objectType: "testReport", objectId: report.id, docNo, diff: { agencyReportNo: input.agencyReportNo, result: input.result } }, tx);
    emit({ type: "testing.report.created", aggregateType: "testReport", aggregateId: report.id, payload: { docNo, styleId: style.id, result: input.result, validUntil: input.validUntil } });
    return report;
  }

  async updateReport(ctx: AccessContext, id: string, input: z.infer<typeof reportUpdateSchema>): Promise<TestReportDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = (await tx.select().from(testReports).where(and(eq(testReports.id, id), this.reportVisible(ctx))))[0];
      if (!before) throw notFound();
      if (before.version !== input.version) throw versionConflict();
      const { version, ...rest } = input;
      const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as Partial<ReportRow>;
      if (patch.validUntil && patch.validUntil < before.issuedDate) throw new AppError(testingErrors.TESTING_VALIDITY_INVALID);
      const updated = (
        await tx
          .update(testReports)
          .set({ ...patch, version: version + 1, updatedBy: ctx.userId, updatedAt: this.clock.now() })
          .where(and(eq(testReports.id, id), eq(testReports.version, version)))
          .returning()
      )[0];
      if (!updated) throw versionConflict();
      if (patch.fileId) await this.files.attach(patch.fileId, "testReport", id, tx);
      await this.audit.log(ctx, { action: "testing.report.update", objectType: "testReport", objectId: id, docNo: before.docNo, diff: diffOf(before as Record<string, unknown>, patch as Record<string, unknown>) }, tx);
      emit({ type: "testing.report.updated", aggregateType: "testReport", aggregateId: id, payload: { docNo: before.docNo, styleId: before.styleId, validUntil: updated.validUntil } });
      return updated;
    });
    return (await this.toReports([row]))[0]!;
  }

  private async toReports(rows: ReportRow[], db: DbOrTx = this.db): Promise<TestReportDto[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const links = await db.select().from(testReportLinks).where(inArray(testReportLinks.reportId, ids));
    const styleIds = [...new Set([...rows.map((r) => r.styleId), ...links.map((l) => l.styleId)])];
    const custIds = [...new Set(rows.map((r) => r.customerId))];
    const agencyIds = [...new Set(rows.map((r) => r.agencyId).filter((x): x is string => !!x))];
    const requestIds = [...new Set(rows.map((r) => r.testRequestId).filter((x): x is string => !!x))];
    const [styleRows, custRows, agencyRows, requestRows] = await Promise.all([
      db.select({ id: styles.id, styleNo: styles.styleNo, nameZh: styles.nameZh }).from(styles).where(inArray(styles.id, styleIds)),
      db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, custIds)),
      agencyIds.length ? db.select({ id: testAgencies.id, name: testAgencies.name }).from(testAgencies).where(inArray(testAgencies.id, agencyIds)) : [],
      requestIds.length ? db.select({ id: testRequests.id, docNo: testRequests.docNo }).from(testRequests).where(inArray(testRequests.id, requestIds)) : [],
    ]);
    const styleMap = new Map(styleRows.map((s) => [s.id, s]));
    const today = this.clock.today();
    const expiringDays = await this.expiringDays(db);
    return rows.map((r) => {
      const style = styleMap.get(r.styleId);
      return {
        id: r.id,
        docNo: r.docNo,
        agencyReportNo: r.agencyReportNo,
        agencyId: r.agencyId,
        agencyName: agencyRows.find((a) => a.id === r.agencyId)?.name ?? null,
        styleId: r.styleId,
        styleNo: style?.styleNo ?? "",
        styleNameZh: style?.nameZh ?? "",
        customerId: r.customerId,
        customerName: custRows.find((c) => c.id === r.customerId)?.name ?? "",
        items: r.items,
        result: r.result as TestReportDto["result"],
        failedItems: r.failedItems,
        issuedDate: r.issuedDate,
        validUntil: r.validUntil,
        daysToExpire: daysBetween(today, r.validUntil),
        status: this.reportStatus(r.validUntil, today, expiringDays),
        fileId: r.fileId,
        reuseKey: r.reuseKey,
        linkedStyles: links
          .filter((l) => l.reportId === r.id)
          .map((l) => ({ id: l.styleId, styleNo: styleMap.get(l.styleId)?.styleNo ?? "" }))
          .sort((a, b) => a.styleNo.localeCompare(b.styleNo)),
        testRequestId: r.testRequestId,
        testRequestDocNo: requestRows.find((x) => x.id === r.testRequestId)?.docNo ?? null,
        createdAt: r.createdAt.toISOString(),
        version: r.version,
      };
    });
  }

  private async toDtos(rows: RequestRow[]): Promise<TestRequestDto[]> {
    if (!rows.length) return [];
    const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
    const styleIds = uniq(rows.map((r) => r.styleId));
    const custIds = uniq(rows.map((r) => r.customerId));
    const userIds = uniq(rows.flatMap((r) => [r.ownerId, r.senderId]));
    const agencyIds = uniq(rows.map((r) => r.agencyId));
    const factoryIds = uniq(rows.map((r) => r.factoryId));
    const reportIds = uniq(rows.flatMap((r) => [r.reportId, r.reusedReportId]));
    const retestOfIds = uniq(rows.map((r) => r.retestOfId));
    const ids = rows.map((r) => r.id);
    const [styleRows, custRows, userRows, agencyRows, factoryRows, reportRows, parentRows, childRows] = await Promise.all([
      this.db.select().from(styles).where(inArray(styles.id, styleIds)),
      this.db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, custIds)),
      userIds.length ? this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds)) : [],
      agencyIds.length ? this.db.select({ id: testAgencies.id, name: testAgencies.name }).from(testAgencies).where(inArray(testAgencies.id, agencyIds)) : [],
      factoryIds.length ? this.db.select({ id: factories.id, name: factories.name }).from(factories).where(inArray(factories.id, factoryIds)) : [],
      reportIds.length ? this.db.select().from(testReports).where(inArray(testReports.id, reportIds)) : [],
      retestOfIds.length ? this.db.select({ id: testRequests.id, docNo: testRequests.docNo }).from(testRequests).where(inArray(testRequests.id, retestOfIds)) : [],
      this.db.select({ id: testRequests.id, docNo: testRequests.docNo, status: testRequests.status, retestOfId: testRequests.retestOfId }).from(testRequests).where(inArray(testRequests.retestOfId, ids)),
    ]);
    const reports = new Map((await this.toReports(reportRows)).map((r) => [r.id, r]));
    const today = this.clock.today();
    return rows.map((r) => {
      const style = styleRows.find((s) => s.id === r.styleId);
      const agencyName = agencyRows.find((a) => a.id === r.agencyId)?.name ?? null;
      const report = r.reportId ? (reports.get(r.reportId) ?? null) : null;
      const reusedReport = r.reusedReportId ? (reports.get(r.reusedReportId) ?? null) : null;
      const overdue = r.status !== "COMPLETED" && !!r.dueDate && r.dueDate < today;
      const parent = parentRows.find((p) => p.id === r.retestOfId);
      return {
        id: r.id,
        docNo: r.docNo,
        styleId: r.styleId,
        styleNo: style?.styleNo ?? "",
        styleNameZh: style?.nameZh ?? "",
        styleNameEn: style?.nameEn ?? null,
        styleImageFileId: style?.imageFileId ?? null,
        customerId: r.customerId,
        customerName: custRows.find((c) => c.id === r.customerId)?.name ?? "",
        customerPo: r.customerPo,
        colorSize: r.colorSize,
        stage: r.stage as TestRequestDto["stage"],
        entrust: (r.entrust as TestRequestDto["entrust"]) ?? null,
        agencyId: r.agencyId,
        agencyName,
        serviceLevel: r.serviceLevel,
        items: r.items,
        standard: r.standard,
        sampleQty: r.sampleQty,
        sampleSite: r.sampleSite,
        sentDate: r.sentDate,
        labReceivedDate: r.labReceivedDate,
        dueDate: r.dueDate,
        completedDate: r.completedDate,
        trackingNo: r.trackingNo,
        senderId: r.senderId,
        senderName: r.senderId ? (userRows.find((u) => u.id === r.senderId)?.name ?? null) : null,
        factoryId: r.factoryId,
        factoryName: factoryRows.find((f) => f.id === r.factoryId)?.name ?? null,
        seasonCode: r.seasonCode,
        status: r.status as TestRequestStatus,
        result: (r.result as TestRequestDto["result"]) ?? null,
        failedItems: r.failedItems,
        correctiveAction: r.correctiveAction,
        resultNote: r.resultNote,
        overdue,
        overdueDays: overdue && r.dueDate ? daysBetween(r.dueDate, today) : 0,
        report,
        reusedReport,
        retestOf: parent ? { id: parent.id, docNo: parent.docNo } : null,
        retests: childRows.filter((c) => c.retestOfId === r.id).map((c) => ({ id: c.id, docNo: c.docNo, status: c.status as TestRequestStatus })),
        steps: this.steps(r, agencyName, report, reusedReport),
        ownerId: r.ownerId,
        ownerName: userRows.find((u) => u.id === r.ownerId)?.name ?? "",
        createdAt: r.createdAt.toISOString(),
        version: r.version,
      };
    });
  }

  private steps(r: RequestRow, agencyName: string | null, report: TestReportDto | null, reused: TestReportDto | null): TestRequestDto["steps"] {
    const order: TestRequestStatus[] = ["DRAFT", "AWAITING_SAMPLE", "TESTING", "COMPLETED"];
    const idx = order.indexOf(r.status as TestRequestStatus);
    const items = r.items.map(itemLabel).join("、");
    if (reused) {
      const note = `复用报告 ${reused.docNo}（${reused.agencyReportNo}），无需送测`;
      return [
        { key: "APPLY", state: "DONE", at: iso(r.createdAt), description: note },
        { key: "LAB", state: "DONE", at: null, description: note },
        { key: "REPORT", state: "DONE", at: reused.issuedDate, description: `${reused.agencyReportNo} ｜ 有效期至 ${reused.validUntil}` },
        { key: "RESULT", state: "DONE", at: r.completedDate, description: r.resultNote },
      ];
    }
    const apply = [agencyName ? `申请 ${agencyName}` : null, items || null, r.sampleSite || r.sampleQty ? `${r.sampleSite ?? ""}${r.sampleQty ? ` · ${r.sampleQty} 双` : ""}`.trim() : null, r.trackingNo ? `快递单号 ${r.trackingNo}` : null].filter(Boolean).join(" ｜ ");
    const lab = [agencyName, r.serviceLevel, r.labReceivedDate ? `签收 ${r.labReceivedDate}` : null].filter(Boolean).join(" ｜ ");
    return [
      { key: "APPLY", state: idx >= 1 ? "DONE" : "ACTIVE", at: r.submittedAt ? r.submittedAt.toISOString() : r.sentDate, description: apply || null },
      { key: "LAB", state: idx >= 3 ? "DONE" : idx >= 1 ? "ACTIVE" : "PENDING", at: r.labReceivedDate, description: lab || null },
      { key: "REPORT", state: report ? "DONE" : "PENDING", at: report?.issuedDate ?? null, description: report ? `${report.agencyReportNo} ｜ ${report.docNo}` : null },
      { key: "RESULT", state: idx >= 3 ? "DONE" : "PENDING", at: r.completedDate, description: idx >= 3 ? r.resultNote : null },
    ];
  }
}

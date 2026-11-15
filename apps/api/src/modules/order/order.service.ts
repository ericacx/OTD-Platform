import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import {
  ORDER_KEY_FIELDS,
  type OrderDetail,
  type OrderListItem,
  type OrderStatus,
  type PoExtraction,
  type ProductionProgressDto,
  type customerConfirmSchema,
  type factoryReplyCreateSchema,
  type orderAdvanceSchema,
  type orderCancelSchema,
  type orderConfirmSchema,
  type orderCreateSchema,
  type orderListQuerySchema,
  type orderReviseSchema,
  type orderUpdateSchema,
  type productionProgressCreateSchema,
  orderErrors,
  poExtractionSchema,
} from "@otd/contracts/order";
import {
  type Database,
  type DbOrTx,
  type ExtractedField,
  type UnmatchedOrderLine,
  customerOrders,
  customers,
  factories,
  factoryReplies,
  nodeStateSnapshots,
  orderLines,
  orderStageLogs,
  poRevisions,
  productionProgress,
  shipments,
  styles,
  users,
} from "@otd/db";
import { NODES, canTransition, statusLabel } from "@otd/shared";
import { type SQL, and, asc, desc, eq, exists, gt, gte, ilike, inArray, lt, lte, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { type AccessContext, canSeeCustomer, hasPermission } from "../../core/access/access.types.js";
import { assertCanSee, ownership, scoped } from "../../core/access/scope.js";
import type { AiProvider } from "../../core/ai/ai.types.js";
import { FakeAiProvider } from "../../core/ai/fake.provider.js";
import { AuditService } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, assertFound, duplicate, forbidden, illegalTransition, notFound, versionConflict } from "../../core/errors.js";
import { EventBus, inTransaction } from "../../core/events.js";
import { FileService } from "../../core/files/file.service.js";
import { countAll, iso, likeKeyword, orderBy, paginate } from "../../core/paging.js";
import { AI_PROVIDER, DB } from "../../core/tokens.js";
import { FlowConfigService } from "../flow/flow-config.service.js";
import { MainlineService } from "../mainline/mainline.service.js";
import { NotificationService } from "../notification/notification.service.js";
import { TodoService } from "../todo/todo.service.js";
import { PDF_TYPE, PO_EXTRACT_INSTRUCTIONS, XLSX_TYPE, excelToText, fakePoExtract } from "./po-extract.js";
import { addDays, daysBetween, ruleCheckOptions, runRuleCheck } from "./rule-check.js";
import { buildStages, stageAverages } from "./stages.js";

type OrderRow = typeof customerOrders.$inferSelect;
type LineInput = { styleId: string; color?: string | null; size?: string | null; sku?: string | null; quantity: number; unitPrice?: number | null };
type Fields = Partial<Omit<z.infer<typeof orderUpdateSchema>, "version" | "lines">>;

export const ACTIVE_STATUSES = ["PENDING_CONFIRM", "TO_SCHEDULE", "IN_PRODUCTION", "TO_SHIP"] as const;
const EDITABLE = new Set<string>(ACTIVE_STATUSES);
const NEXT: Partial<Record<string, OrderStatus>> = { TO_SCHEDULE: "IN_PRODUCTION", IN_PRODUCTION: "TO_SHIP", TO_SHIP: "COMPLETED" };
const ADVANCE_ACTION: Partial<Record<OrderStatus, string>> = {
  IN_PRODUCTION: "排产确认，进入「生产中」",
  TO_SHIP: "生产完成并放行，进入「待发货」",
  COMPLETED: "全部出货签收、回款闭环，订单完成",
};
const DAY_MS = 86_400_000;
const LOG_FIELDS: Partial<Record<keyof OrderRow, string>> = { customerDueDate: "客户交期", totalPairs: "总双数", factoryId: "承做工厂", tradeTerm: "贸易术语", paymentTerms: "付款条款", destination: "目的地", transportMode: "运输方式", currency: "币种" };

export const reviewTodo = (orderId: string) => `order:review:${orderId}`;
export const factoryReplyTodo = (orderId: string) => `order:factoryReply:${orderId}`;

function sumLines(lines: { quantity: number; unitPrice?: number | null }[]) {
  const pairs = lines.reduce((s, l) => s + l.quantity, 0);
  const priced = lines.filter((l) => l.unitPrice !== null && l.unitPrice !== undefined);
  const amount = priced.length ? Math.round(priced.reduce((s, l) => s + l.quantity * (l.unitPrice ?? 0), 0) * 100) / 100 : null;
  return { pairs, amount };
}

function pickFields(input: Fields): Partial<OrderRow> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) if (v !== undefined) out[k] = v;
  return out as Partial<OrderRow>;
}

@Injectable()
export class OrderService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly files: FileService,
    private readonly todos: TodoService,
    private readonly notifications: NotificationService,
    private readonly mainline: MainlineService,
    private readonly flow: FlowConfigService,
  ) {}

  onModuleInit(): void {
    if (this.ai instanceof FakeAiProvider) this.ai.onExtract("order.extract", (req) => fakePoExtract(req));
  }

  async list(ctx: AccessContext, q: z.infer<typeof orderListQuerySchema>): Promise<Page<OrderListItem>> {
    const conds: SQL[] = [scoped(customerOrders, ctx)];
    if (q.customerId) conds.push(eq(customerOrders.customerId, q.customerId));
    if (q.status?.length) conds.push(inArray(customerOrders.status, q.status));
    if (q.dueFrom) conds.push(gte(customerOrders.customerDueDate, q.dueFrom));
    if (q.dueTo) conds.push(lte(customerOrders.customerDueDate, q.dueTo));
    if (q.factoryId) conds.push(eq(customerOrders.factoryId, q.factoryId));
    if (q.risk) conds.push(this.riskCondition());
    const kw = likeKeyword(q.keyword?.replace(/^#/, ""));
    if (kw) {
      const byStyle = exists(
        this.db
          .select({ one: sql`1` })
          .from(orderLines)
          .innerJoin(styles, eq(styles.id, orderLines.styleId))
          .where(and(eq(orderLines.orderId, customerOrders.id), ilike(styles.styleNo, kw))),
      );
      conds.push(or(ilike(customerOrders.poNo, kw), byStyle)!);
    }
    const where = and(...conds);
    const sort = orderBy(q.sort, { customerDueDate: customerOrders.customerDueDate, createdAt: customerOrders.createdAt, poNo: customerOrders.poNo, totalPairs: customerOrders.totalPairs }, [desc(customerOrders.createdAt)]);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(customerOrders).where(where))[0]!.n,
      async (limit, offset) => this.toListItems(await this.db.select().from(customerOrders).where(where).orderBy(...sort).limit(limit).offset(offset)),
    );
  }

  riskCondition(): SQL {
    const today = this.clock.today();
    const blocked = exists(this.db.select({ one: sql`1` }).from(nodeStateSnapshots).where(and(eq(nodeStateSnapshots.orderId, customerOrders.id), eq(nodeStateSnapshots.state, "BLOCKED"))));
    return and(inArray(customerOrders.status, [...ACTIVE_STATUSES]), or(lt(customerOrders.customerDueDate, today), gt(customerOrders.delayDays, 0), blocked))!;
  }

  async get(ctx: AccessContext, id: string): Promise<OrderDetail> {
    const row = assertCanSee(ctx, (await this.db.select().from(customerOrders).where(eq(customerOrders.id, id)))[0]);
    if (row.status === "PENDING_CONFIRM" && !row.ruleCheck) {
      row.ruleCheck = await this.ruleCheckFor(this.db, row, await this.linesOf(this.db, id));
      await this.db.update(customerOrders).set({ ruleCheck: row.ruleCheck }).where(eq(customerOrders.id, id));
    }
    return this.toDetail(row);
  }

  async upload(ctx: AccessContext, input: { file?: { filename: string; contentType: string; data: Buffer }; fileId?: string; customerId?: string }): Promise<OrderDetail> {
    let fileId: string;
    let file: { filename: string; contentType: string; data: Buffer };
    if (input.file) {
      const contentType = normalizeType(input.file.filename, input.file.contentType);
      if (contentType !== PDF_TYPE && contentType !== XLSX_TYPE) throw new AppError(orderErrors.ORDER_FILE_UNSUPPORTED);
      file = { ...input.file, contentType };
      fileId = (await this.files.save(ctx, file)).id;
    } else {
      const meta = assertFound(await this.files.meta(input.fileId!));
      if (meta.contentType !== PDF_TYPE && meta.contentType !== XLSX_TYPE) throw new AppError(orderErrors.ORDER_FILE_UNSUPPORTED);
      fileId = meta.id;
      file = await this.files.read(meta.id);
    }
    const extraction = await this.extract(ctx, file);
    const customer = await this.resolveCustomer(ctx, input.customerId, extraction.customer.value);
    const poNo = extraction.poNo.value?.trim();
    if (!poNo) throw new AppError(orderErrors.ORDER_EXTRACTION_FAILED, { reason: "未识别到 PO 号" });
    const styleNos = [...new Set(extraction.lines.map((l) => l.styleNo.replace(/^#/, "").trim()))];
    const styleRows = styleNos.length ? await this.db.select({ id: styles.id, styleNo: styles.styleNo }).from(styles).where(and(eq(styles.customerId, customer.id), inArray(styles.styleNo, styleNos))) : [];
    const styleId = new Map(styleRows.map((s) => [s.styleNo, s.id]));
    const lines: LineInput[] = [];
    const unmatched: UnmatchedOrderLine[] = [];
    for (const l of extraction.lines) {
      const no = l.styleNo.replace(/^#/, "").trim();
      const id = styleId.get(no);
      if (id) lines.push({ styleId: id, color: l.color, size: l.size, sku: l.sku, quantity: l.quantity, unitPrice: l.unitPrice });
      else unmatched.push({ styleNo: no, color: l.color, size: l.size, sku: l.sku, quantity: l.quantity, unitPrice: l.unitPrice });
    }
    const today = this.clock.today();
    const dueDate = validDate(extraction.dueDate.value);
    const fields: Fields = {
      seasonCode: extraction.seasonCode.value,
      tradeTerm: extraction.tradeTerm.value,
      paymentTerms: extraction.paymentTerms.value,
      currency: extraction.currency.value && /^[A-Z]{3}$/.test(extraction.currency.value) ? extraction.currency.value : customer.currency,
      orderDate: validDate(extraction.orderDate.value) ?? today,
      transportMode: extraction.transportMode.value,
      destination: extraction.destination.value,
      buyerEntity: extraction.buyerEntity.value ?? customer.settlementEntity,
    };
    const stored: Record<string, ExtractedField> = {};
    for (const [key, v] of Object.entries(extraction)) {
      if (key === "lines" || !v || Array.isArray(v)) continue;
      stored[key] = { value: v.value, confidence: v.confidence, ...(v.source ? { source: v.source } : {}) };
    }
    if (!dueDate) stored.dueDate = { value: addDays(today, 60), confidence: 0, source: "未识别，默认下单后 60 天，请核对" };
    stored.lines = { value: extraction.lines.length, confidence: extraction.lines.length ? Math.min(...extraction.lines.map((l) => l.confidence)) : 0, source: `${lines.length} 行已关联款号，${unmatched.length} 行未关联` };
    const revision = Number(extraction.revision.value);
    const id = await this.insertOrder(ctx, {
      customerId: customer.id,
      poNo,
      revision: Number.isInteger(revision) && revision > 0 ? revision : 1,
      customerDueDate: dueDate ?? addDays(today, 60),
      fields,
      lines,
      unmatched,
      sourceFileId: fileId,
      extraction: stored,
      logAction: "上传客户 PO 并识别字段，进入「待确认」",
      operatorName: "系统识别",
    });
    return this.get(ctx, id);
  }

  async create(ctx: AccessContext, input: z.infer<typeof orderCreateSchema>): Promise<OrderDetail> {
    if (!canSeeCustomer(ctx, input.customerId)) throw notFound();
    const { customerId, poNo, revision, customerDueDate, lines, ...fields } = input;
    await this.assertStyles(this.db, customerId, lines);
    const id = await this.insertOrder(ctx, { customerId, poNo: poNo.trim(), revision, customerDueDate, fields: { orderDate: this.clock.today(), ...fields }, lines, unmatched: [], logAction: "手工新建订单，进入「待确认」", operatorName: ctx.userName });
    return this.get(ctx, id);
  }

  async update(ctx: AccessContext, id: string, input: z.infer<typeof orderUpdateSchema>): Promise<OrderDetail> {
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.lockRow(ctx, tx, id, input.version);
      if (!EDITABLE.has(before.status)) throw new AppError(orderErrors.ORDER_NOT_EDITABLE, { status: statusLabel("order", before.status).zh });
      const { version: _v, lines, ...rest } = input;
      const keyChanged = ORDER_KEY_FIELDS.some((key) => (key === "lines" ? lines !== undefined : rest[key] !== undefined && rest[key] !== before[key]));
      if (before.status !== "PENDING_CONFIRM" && keyChanged) throw new AppError(orderErrors.ORDER_KEY_FIELD_LOCKED);
      const patch = pickFields(rest);
      if (lines) {
        await this.assertStyles(tx, before.customerId, lines);
        await this.replaceLines(tx, id, lines);
        const totals = sumLines(lines);
        Object.assign(patch, { totalPairs: totals.pairs, fobAmount: totals.amount, unmatchedLines: [] });
      }
      const merged = { ...before, ...patch };
      if (before.status === "PENDING_CONFIRM") patch.ruleCheck = await this.ruleCheckFor(tx, merged, lines ?? (await this.linesOf(tx, id)));
      await this.bump(ctx, tx, before, patch);
      await this.audit.log(ctx, { action: "order.order.update", objectType: "order", objectId: id, docNo: before.poNo, diff: diffFields(before, patch) }, tx);
      emit({ type: "order.order.updated", aggregateType: "order", aggregateId: id, payload: { orderId: id, poNo: before.poNo } });
    });
    return this.get(ctx, id);
  }

  async recheck(ctx: AccessContext, id: string): Promise<OrderDetail> {
    const row = assertCanSee(ctx, (await this.db.select().from(customerOrders).where(eq(customerOrders.id, id)))[0]);
    const ruleCheck = await this.ruleCheckFor(this.db, row, await this.linesOf(this.db, id));
    await this.db.update(customerOrders).set({ ruleCheck }).where(eq(customerOrders.id, id));
    await this.mainline.recompute(id);
    return this.get(ctx, id);
  }

  async confirm(ctx: AccessContext, id: string, input: z.infer<typeof orderConfirmSchema>): Promise<OrderDetail> {
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.lockRow(ctx, tx, id, input.version);
      if (!canTransition("order", before.status as OrderStatus, "TO_SCHEDULE")) throw illegalTransition(before.status, "confirm");
      const ruleCheck = await this.ruleCheckFor(tx, before, await this.linesOf(tx, id));
      const failed = ruleCheck.filter((r) => !r.passed);
      if (failed.length) {
        if (!input.overrideReason) throw new AppError(orderErrors.ORDER_RULE_PACK_FAILED, { failed: failed.map((f) => f.label.zh).join("、"), failedRules: failed.map((f) => f.key) });
        if (!hasPermission(ctx, "order.order.confirm")) throw forbidden("order.order.confirm");
      }
      const flowVersionId = await this.flow.currentVersionId(before.customerId, tx);
      const now = this.clock.now();
      await this.bump(ctx, tx, before, { status: "TO_SCHEDULE", confirmedAt: now, flowVersionId, ruleCheck, overrideReason: failed.length ? input.overrideReason! : null });
      const action = failed.length ? `规则包 ${failed.length} 项未通过，例外确认（${input.overrideReason}），进入「待排产」` : "PO 复核规则包全绿，确认订单，进入「待排产」";
      await this.log(tx, id, "TO_SCHEDULE", action, ctx.userId, ctx.userName);
      await this.todos.close(reviewTodo(id), tx);
      if (!before.factoryReplyDate) {
        await this.todos.upsert({ fingerprint: factoryReplyTodo(id), source: "FLOW", action: "order.factoryReply", title: "登记工厂交期回复", description: `PO ${before.poNo} 已确认，请在 3 天内登记工厂交期回复`, docType: "order", docId: id, docNo: before.poNo, link: `/orders/${id}`, customerId: before.customerId, assigneeId: before.merchandiserId ?? before.ownerId, dueAt: new Date(now.getTime() + 3 * DAY_MS) }, tx);
      }
      await this.audit.log(ctx, { action: "order.order.confirm", objectType: "order", objectId: id, docNo: before.poNo, diff: { status: { from: before.status, to: "TO_SCHEDULE" }, ...(failed.length ? { overrideReason: { from: null, to: input.overrideReason }, failedRules: { from: null, to: failed.map((f) => f.key) } } : {}) } }, tx);
      if (before.merchandiserId) await this.notifications.notify([before.merchandiserId], { type: "order.confirmed", title: `PO ${before.poNo} 已确认，进入待排产`, link: `/orders/${id}` }, tx);
      emit({ type: "order.order.confirmed", aggregateType: "order", aggregateId: id, payload: { orderId: id, poNo: before.poNo, override: failed.length > 0 } });
    });
    return this.get(ctx, id);
  }

  async advance(ctx: AccessContext, id: string, input: z.infer<typeof orderAdvanceSchema>): Promise<OrderDetail> {
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.lockRow(ctx, tx, id, input.version);
      const target = input.to ?? NEXT[before.status];
      if (!target || target === "CANCELLED" || before.status === "PENDING_CONFIRM" || !canTransition("order", before.status as OrderStatus, target)) throw illegalTransition(before.status, "advance");
      await this.bump(ctx, tx, before, { status: target });
      await this.log(tx, id, target, `${ADVANCE_ACTION[target] ?? target}${input.note ? `：${input.note}` : ""}`, ctx.userId, ctx.userName, input.note ?? null);
      if (target === "COMPLETED") await this.todos.closeForDoc("order", id, tx);
      await this.audit.log(ctx, { action: "order.order.advance", objectType: "order", objectId: id, docNo: before.poNo, diff: { status: { from: before.status, to: target } } }, tx);
      emit({ type: "order.order.advanced", aggregateType: "order", aggregateId: id, payload: { orderId: id, poNo: before.poNo, from: before.status, to: target } });
    });
    return this.get(ctx, id);
  }

  async cancel(ctx: AccessContext, id: string, input: z.infer<typeof orderCancelSchema>): Promise<OrderDetail> {
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.lockRow(ctx, tx, id, input.version);
      if (!canTransition("order", before.status as OrderStatus, "CANCELLED")) throw illegalTransition(before.status, "cancel");
      const shipped = (await tx.select({ n: countAll }).from(shipments).where(eq(shipments.orderId, id)))[0]!.n;
      if (shipped > 0) throw new AppError(orderErrors.ORDER_HAS_SHIPMENTS);
      const now = this.clock.now();
      await this.bump(ctx, tx, before, { status: "CANCELLED", cancelledAt: now, cancelReason: input.reason });
      await this.log(tx, id, "CANCELLED", `取消订单：${input.reason}`, ctx.userId, ctx.userName, input.reason);
      await this.todos.closeForDoc("order", id, tx);
      await this.audit.log(ctx, { action: "order.order.cancel", objectType: "order", objectId: id, docNo: before.poNo, diff: { status: { from: before.status, to: "CANCELLED" }, reason: { from: null, to: input.reason } } }, tx);
      const notify = [before.ownerId, before.merchandiserId].filter((u): u is string => !!u && u !== ctx.userId);
      await this.notifications.notify(notify, { type: "order.cancelled", title: `PO ${before.poNo} 已取消`, body: input.reason, link: `/orders/${id}` }, tx);
      emit({ type: "order.order.cancelled", aggregateType: "order", aggregateId: id, payload: { orderId: id, poNo: before.poNo } });
    });
    return this.get(ctx, id);
  }

  async revise(ctx: AccessContext, id: string, input: z.infer<typeof orderReviseSchema>): Promise<OrderDetail> {
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.lockRow(ctx, tx, id, input.version);
      if (!EDITABLE.has(before.status)) throw new AppError(orderErrors.ORDER_NOT_EDITABLE, { status: statusLabel("order", before.status).zh });
      const { version: _v, lines, note, revisionDate, ...rest } = input;
      const oldLines = await this.linesOf(tx, id);
      const now = this.clock.now();
      await tx.insert(poRevisions).values({ orderId: id, revision: before.revision, snapshot: snapshotOf(before, oldLines), note: note ?? null, createdBy: ctx.userId, createdAt: now });
      const patch = pickFields(rest);
      if (lines) {
        await this.assertStyles(tx, before.customerId, lines);
        await this.replaceLines(tx, id, lines);
        const totals = sumLines(lines);
        Object.assign(patch, { totalPairs: totals.pairs, fobAmount: totals.amount, unmatchedLines: [] });
      }
      if (patch.customerDueDate && before.factoryReplyDate) patch.delayDays = daysBetween(patch.customerDueDate, before.factoryReplyDate);
      const nextRevision = before.revision + 1;
      const merged = { ...before, ...patch };
      const ruleCheck = await this.ruleCheckFor(tx, merged, lines ?? oldLines);
      await this.bump(ctx, tx, before, { ...patch, ruleCheck, revision: nextRevision, revisionDate: revisionDate ?? this.clock.today() });
      const diff = diffFields(before, patch);
      const changes = Object.entries(diff)
        .filter(([k]) => LOG_FIELDS[k as keyof OrderRow])
        .map(([k, d]) => `${LOG_FIELDS[k as keyof OrderRow]} ${String(d.from ?? "—")} → ${String(d.to ?? "—")}`);
      if (lines) changes.push(`明细 ${oldLines.length} 行 → ${lines.length} 行`);
      await this.log(tx, id, before.status, `PO 改版 Rev.${nextRevision}${changes.length ? `：${changes.join("；")}` : ""}`, ctx.userId, ctx.userName, note ?? null);
      await this.audit.log(ctx, { action: "order.order.revise", objectType: "order", objectId: id, docNo: before.poNo, diff: { revision: { from: before.revision, to: nextRevision }, ...diff } }, tx);
      const notify = [before.merchandiserId, before.ownerId].filter((u): u is string => !!u && u !== ctx.userId);
      await this.notifications.notify(notify, { type: "order.revised", title: `PO ${before.poNo} 改版 Rev.${nextRevision}`, body: changes.join("；") || null, link: `/orders/${id}` }, tx);
      emit({ type: "order.order.revised", aggregateType: "order", aggregateId: id, payload: { orderId: id, poNo: before.poNo, revision: nextRevision } });
    });
    return this.get(ctx, id);
  }

  async factoryReply(ctx: AccessContext, id: string, input: z.infer<typeof factoryReplyCreateSchema>): Promise<OrderDetail> {
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.lockRow(ctx, tx, id, input.version);
      if (!EDITABLE.has(before.status)) throw new AppError(orderErrors.ORDER_NOT_EDITABLE, { status: statusLabel("order", before.status).zh });
      const last = (await tx.select({ v: factoryReplies.versionNo }).from(factoryReplies).where(eq(factoryReplies.orderId, id)).orderBy(desc(factoryReplies.versionNo)).limit(1))[0];
      const versionNo = (last?.v ?? 0) + 1;
      const delay = daysBetween(before.customerDueDate, input.replyDate);
      const now = this.clock.now();
      await tx.insert(factoryReplies).values({ orderId: id, versionNo, replyDate: input.replyDate, delayDays: delay, note: input.note ?? null, createdBy: ctx.userId, createdAt: now });
      await this.bump(ctx, tx, before, { factoryReplyDate: input.replyDate, delayDays: delay });
      const delayText = delay === 0 ? "持平" : delay > 0 ? `延期 ${delay} 天` : `提前 ${-delay} 天`;
      await this.log(tx, id, before.status, `登记工厂交期回复 V${versionNo}：${input.replyDate}（${delayText}）`, ctx.userId, ctx.userName, input.note ?? null);
      await this.todos.close(factoryReplyTodo(id), tx);
      await this.audit.log(ctx, { action: "order.factoryReply.create", objectType: "order", objectId: id, docNo: before.poNo, diff: { factoryReplyDate: { from: before.factoryReplyDate, to: input.replyDate }, delayDays: { from: before.delayDays, to: delay } } }, tx);
      if (before.ownerId !== ctx.userId) await this.notifications.notify([before.ownerId], { type: "order.factoryReply", title: `PO ${before.poNo} 工厂已回复交期 V${versionNo}：${input.replyDate}（${delayText}）`, link: `/orders/${id}` }, tx);
      emit({ type: "order.factoryReply.created", aggregateType: "order", aggregateId: id, payload: { orderId: id, poNo: before.poNo, versionNo, delayDays: delay } });
    });
    return this.get(ctx, id);
  }

  async customerConfirm(ctx: AccessContext, id: string, input: z.infer<typeof customerConfirmSchema>): Promise<OrderDetail> {
    const METHOD: Record<string, string> = { EMAIL: "邮件", CUSTOMER_SYSTEM: "客户系统", OFFLINE: "线下" };
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.lockRow(ctx, tx, id, input.version);
      if (!EDITABLE.has(before.status)) throw new AppError(orderErrors.ORDER_NOT_EDITABLE, { status: statusLabel("order", before.status).zh });
      const now = this.clock.now();
      await this.bump(ctx, tx, before, { customerConfirmedAt: now, customerConfirmMethod: input.method, customerConfirmNote: input.note ?? null });
      await this.log(tx, id, before.status, `登记客户确认 Rev.${before.revision}（${METHOD[input.method]}）`, ctx.userId, ctx.userName, input.note ?? null);
      await this.audit.log(ctx, { action: "order.order.customerConfirm", objectType: "order", objectId: id, docNo: before.poNo, diff: { customerConfirmMethod: { from: before.customerConfirmMethod, to: input.method } } }, tx);
      emit({ type: "order.order.customerConfirmed", aggregateType: "order", aggregateId: id, payload: { orderId: id, poNo: before.poNo } });
    });
    return this.get(ctx, id);
  }

  async recordProduction(ctx: AccessContext, id: string, input: z.infer<typeof productionProgressCreateSchema>): Promise<ProductionProgressDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const order = assertCanSee(ctx, (await tx.select().from(customerOrders).where(eq(customerOrders.id, id)))[0]);
      if (!["TO_SCHEDULE", "IN_PRODUCTION", "TO_SHIP"].includes(order.status)) throw new AppError(orderErrors.ORDER_NOT_EDITABLE, { status: statusLabel("order", order.status).zh });
      const rate = order.totalPairs > 0 ? Math.min(1, Math.round((input.knittedPairs / order.totalPairs) * 10000) / 10000) : null;
      const now = this.clock.now();
      const created = (await tx.insert(productionProgress).values({ orderId: id, factoryId: order.factoryId, reportDate: input.reportDate, knittedPairs: input.knittedPairs, packedPairs: input.packedPairs, completionRate: rate, note: input.note ?? null, createdBy: ctx.userId, createdAt: now, updatedAt: now }).returning())[0]!;
      await this.audit.log(ctx, { action: "order.production.record", objectType: "order", objectId: id, docNo: order.poNo, diff: { knittedPairs: { from: null, to: input.knittedPairs }, completionRate: { from: null, to: rate } } }, tx);
      emit({ type: "order.production.recorded", aggregateType: "order", aggregateId: id, payload: { orderId: id, poNo: order.poNo, completionRate: rate } });
      return created;
    });
    return toProduction(row);
  }

  async ruleCheckFor(db: DbOrTx, order: Pick<OrderRow, "customerId" | "totalPairs" | "orderDate" | "customerDueDate" | "factoryId" | "currency" | "unmatchedLines">, lines: { styleId: string; quantity: number; unitPrice?: number | null }[]) {
    const options = ruleCheckOptions(await this.flow.rulePack("PO_REVIEW", order.customerId, db));
    return runRuleCheck(db, { totalPairs: order.totalPairs, orderDate: order.orderDate, customerDueDate: order.customerDueDate, factoryId: order.factoryId, currency: order.currency, lines: lines.map((l) => ({ styleId: l.styleId, quantity: l.quantity, unitPrice: l.unitPrice ?? null })), unmatched: order.unmatchedLines }, this.clock.today(), options);
  }

  private async extract(ctx: AccessContext, file: { filename: string; contentType: string; data: Buffer }): Promise<PoExtraction> {
    try {
      if (file.contentType === XLSX_TYPE) {
        const text = await excelToText(file.data);
        return await this.ai.extract({ purpose: "order.extract", instructions: PO_EXTRACT_INSTRUCTIONS, text: `文件名：${file.filename}\n${text}`, schema: poExtractionSchema, userId: ctx.userId });
      }
      return await this.ai.extract({ purpose: "order.extract", instructions: PO_EXTRACT_INSTRUCTIONS, document: file, schema: poExtractionSchema, userId: ctx.userId });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(orderErrors.ORDER_EXTRACTION_FAILED, { reason: err instanceof Error ? err.message : String(err) });
    }
  }

  private async resolveCustomer(ctx: AccessContext, customerId: string | undefined, hint: string | null) {
    if (customerId) {
      const c = assertFound((await this.db.select().from(customers).where(eq(customers.id, customerId)))[0]);
      if (!canSeeCustomer(ctx, c.id)) throw notFound();
      return c;
    }
    const h = hint?.trim().toLowerCase();
    if (h) {
      const all = (await this.db.select().from(customers)).filter((c) => canSeeCustomer(ctx, c.id));
      const exact = all.find((c) => [c.code, c.name, c.nameEn ?? "", c.settlementEntity ?? ""].some((v) => v.toLowerCase() === h));
      const fuzzy = exact ?? all.find((c) => [c.name, c.nameEn ?? ""].some((v) => v && (h.includes(v.toLowerCase()) || v.toLowerCase().includes(h))));
      if (fuzzy) return fuzzy;
    }
    throw new AppError(orderErrors.ORDER_CUSTOMER_UNRESOLVED);
  }

  private async insertOrder(
    ctx: AccessContext,
    input: { customerId: string; poNo: string; revision: number; customerDueDate: string; fields: Fields; lines: LineInput[]; unmatched: UnmatchedOrderLine[]; sourceFileId?: string; extraction?: Record<string, ExtractedField>; logAction: string; operatorName: string },
  ): Promise<string> {
    return inTransaction(this.db, this.events, async (tx, emit) => {
      const dup = (await tx.select({ id: customerOrders.id }).from(customerOrders).where(and(eq(customerOrders.customerId, input.customerId), eq(customerOrders.poNo, input.poNo))))[0];
      if (dup) throw duplicate("PO 号");
      const totals = sumLines([...input.lines, ...input.unmatched]);
      const now = this.clock.now();
      const base = { ...pickFields(input.fields), totalPairs: totals.pairs, fobAmount: totals.amount, customerDueDate: input.customerDueDate, currency: input.fields.currency ?? "USD", orderDate: input.fields.orderDate ?? this.clock.today(), factoryId: input.fields.factoryId ?? null, unmatchedLines: input.unmatched };
      const ruleCheck = await this.ruleCheckFor(tx, { ...base, customerId: input.customerId }, input.lines);
      const created = (
        await tx
          .insert(customerOrders)
          .values({ ...base, poNo: input.poNo, revision: input.revision, status: "PENDING_CONFIRM", ruleCheck, sourceFileId: input.sourceFileId ?? null, extraction: input.extraction ?? null, ...ownership(ctx, input.customerId), createdBy: ctx.userId, createdAt: now, updatedAt: now })
          .returning()
      )[0]!;
      await this.replaceLines(tx, created.id, input.lines);
      await this.log(tx, created.id, "PENDING_CONFIRM", input.logAction, input.sourceFileId ? null : ctx.userId, input.operatorName);
      if (input.sourceFileId) await this.files.attach(input.sourceFileId, "order", created.id, tx);
      const customer = (await tx.select({ name: customers.name }).from(customers).where(eq(customers.id, input.customerId)))[0];
      await this.todos.upsert({ fingerprint: reviewTodo(created.id), source: "FLOW", action: "order.review", title: "复核客户 PO", description: `${customer?.name ?? ""} · ${totals.pairs.toLocaleString("en-US")} 双 · 交期 ${input.customerDueDate}`, docType: "order", docId: created.id, docNo: input.poNo, link: `/orders/${created.id}`, customerId: input.customerId, assigneeId: created.ownerId, dueAt: new Date(now.getTime() + 2 * DAY_MS) }, tx);
      await this.audit.log(ctx, { action: "order.order.create", objectType: "order", objectId: created.id, docNo: input.poNo }, tx);
      emit({ type: "order.order.created", aggregateType: "order", aggregateId: created.id, payload: { orderId: created.id, poNo: input.poNo } });
      return created.id;
    });
  }

  private async bump(ctx: AccessContext, tx: DbOrTx, before: OrderRow, patch: Partial<OrderRow>): Promise<void> {
    const rows = await tx
      .update(customerOrders)
      .set({ ...patch, version: before.version + 1, updatedBy: ctx.userId, updatedAt: this.clock.now() })
      .where(and(eq(customerOrders.id, before.id), eq(customerOrders.version, before.version)))
      .returning({ id: customerOrders.id });
    if (!rows.length) throw versionConflict();
  }

  private async lockRow(ctx: AccessContext, tx: DbOrTx, id: string, version: number): Promise<OrderRow> {
    const row = assertCanSee(ctx, (await tx.select().from(customerOrders).where(eq(customerOrders.id, id)))[0]);
    if (row.version !== version) throw versionConflict();
    return row;
  }

  private async assertStyles(db: DbOrTx, customerId: string, lines: { styleId: string }[]): Promise<void> {
    const ids = [...new Set(lines.map((l) => l.styleId))];
    const rows = await db.select({ id: styles.id, customerId: styles.customerId }).from(styles).where(inArray(styles.id, ids));
    for (const id of ids) {
      const s = rows.find((r) => r.id === id);
      if (!s || s.customerId !== customerId) throw notFound("style");
    }
  }

  private async replaceLines(tx: DbOrTx, orderId: string, lines: LineInput[]): Promise<void> {
    await tx.delete(orderLines).where(eq(orderLines.orderId, orderId));
    if (lines.length) await tx.insert(orderLines).values(lines.map((l) => ({ orderId, styleId: l.styleId, color: l.color ?? null, size: l.size ?? null, sku: l.sku ?? null, quantity: l.quantity, unitPrice: l.unitPrice ?? null })));
  }

  private linesOf(db: DbOrTx, orderId: string) {
    return db.select().from(orderLines).where(eq(orderLines.orderId, orderId)).orderBy(asc(orderLines.styleId), asc(orderLines.color), asc(orderLines.size));
  }

  private async log(tx: DbOrTx, orderId: string, status: string, action: string, operatorId: string | null, operatorName: string | null, note: string | null = null): Promise<void> {
    await tx.insert(orderStageLogs).values({ orderId, status, action, note, at: this.clock.now(), operatorId, operatorName });
  }

  private async toListItems(rows: OrderRow[]): Promise<OrderListItem[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const custs = await this.db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, [...new Set(rows.map((r) => r.customerId))]));
    const factoryIds = [...new Set(rows.map((r) => r.factoryId).filter((x): x is string => !!x))];
    const facs = factoryIds.length ? await this.db.select({ id: factories.id, name: factories.name }).from(factories).where(inArray(factories.id, factoryIds)) : [];
    const userIds = [...new Set(rows.flatMap((r) => [r.ownerId, r.merchandiserId]).filter((x): x is string => !!x))];
    const people = await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds));
    const lineStyles = await this.db.selectDistinct({ orderId: orderLines.orderId, styleNo: styles.styleNo }).from(orderLines).innerJoin(styles, eq(styles.id, orderLines.styleId)).where(inArray(orderLines.orderId, ids)).orderBy(asc(styles.styleNo));
    const current = await this.mainline.currentNodes(ids);
    const name = (list: { id: string; name: string }[], id: string | null) => (id ? (list.find((x) => x.id === id)?.name ?? null) : null);
    return rows.map((r) => {
      const styleNos = [...lineStyles.filter((l) => l.orderId === r.id).map((l) => l.styleNo), ...r.unmatchedLines.map((u) => u.styleNo)].filter((v, i, a) => a.indexOf(v) === i);
      const node = current.get(r.id);
      const def = node ? NODES.find((n) => n.code === node.code) : undefined;
      return {
        id: r.id,
        poNo: r.poNo,
        revision: r.revision,
        customerId: r.customerId,
        customerName: name(custs, r.customerId) ?? "",
        seasonCode: r.seasonCode,
        styleNos,
        styleCount: styleNos.length,
        totalPairs: r.totalPairs,
        fobAmount: r.fobAmount,
        currency: r.currency,
        customerDueDate: r.customerDueDate,
        factoryReplyDate: r.factoryReplyDate,
        delayDays: r.delayDays,
        factoryId: r.factoryId,
        factoryName: name(facs, r.factoryId),
        merchandiserId: r.merchandiserId,
        merchandiserName: name(people, r.merchandiserId),
        ownerId: r.ownerId,
        ownerName: name(people, r.ownerId) ?? "",
        status: r.status as OrderStatus,
        currentNode: node && def ? { code: node.code, name: def.label, state: node.state } : null,
        createdAt: r.createdAt.toISOString(),
        version: r.version,
      };
    });
  }

  private async toDetail(row: OrderRow): Promise<OrderDetail> {
    const [item] = await this.toListItems([row]);
    const lines = await this.db.select({ line: orderLines, styleNo: styles.styleNo, styleName: styles.nameZh }).from(orderLines).innerJoin(styles, eq(styles.id, orderLines.styleId)).where(eq(orderLines.orderId, row.id)).orderBy(asc(styles.styleNo), asc(orderLines.color), asc(orderLines.size));
    const revisions = await this.db.select().from(poRevisions).where(eq(poRevisions.orderId, row.id)).orderBy(desc(poRevisions.revision));
    const replies = await this.db.select().from(factoryReplies).where(eq(factoryReplies.orderId, row.id)).orderBy(desc(factoryReplies.versionNo));
    const logs = await this.db.select().from(orderStageLogs).where(eq(orderStageLogs.orderId, row.id)).orderBy(asc(orderStageLogs.at));
    const production = await this.db.select().from(productionProgress).where(eq(productionProgress.orderId, row.id)).orderBy(desc(productionProgress.reportDate), desc(productionProgress.createdAt));
    const userIds = [...new Set([...revisions.map((r) => r.createdBy), ...replies.map((r) => r.createdBy)].filter((x): x is string => !!x))];
    const people = userIds.length ? await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds)) : [];
    const who = (id: string | null) => (id ? (people.find((p) => p.id === id)?.name ?? null) : null);
    const now = this.clock.now();
    const logDtos = logs.map((l) => ({ id: l.id, status: l.status, action: l.action, note: l.note, at: l.at.toISOString(), operatorName: l.operatorName, atDate: l.at }));
    const { stages, stageIndex } = buildStages(row.status, logDtos, await stageAverages(this.db, now), now);
    const next = NEXT[row.status] ?? (row.status === "PENDING_CONFIRM" ? "TO_SCHEDULE" : null);
    return {
      ...item!,
      revisionDate: row.revisionDate,
      channel: row.channel,
      poType: row.poType,
      productLine: row.productLine,
      styleType: row.styleType,
      tradeTerm: row.tradeTerm,
      paymentTerms: row.paymentTerms,
      buyerEntity: row.buyerEntity,
      origin: row.origin,
      orderDate: row.orderDate,
      factoryEntity: row.factoryEntity,
      transportMode: row.transportMode,
      destination: row.destination,
      totalUnits: row.totalUnits,
      poTerms: row.poTerms,
      note: row.note,
      sourceFileId: row.sourceFileId,
      extraction: row.extraction,
      ruleCheck: row.ruleCheck,
      ruleCheckPassed: !!row.ruleCheck?.length && row.ruleCheck.every((r) => r.passed),
      overrideReason: row.overrideReason,
      flowVersionId: row.flowVersionId,
      confirmedAt: iso(row.confirmedAt),
      cancelledAt: iso(row.cancelledAt),
      cancelReason: row.cancelReason,
      customerConfirmedAt: iso(row.customerConfirmedAt),
      customerConfirmMethod: row.customerConfirmMethod,
      dueDaysLeft: daysBetween(this.clock.today(), row.customerDueDate),
      lines: lines.map(({ line, styleNo, styleName }) => ({ id: line.id, styleId: line.styleId, styleNo, styleName, color: line.color, size: line.size, sku: line.sku, quantity: line.quantity, unitPrice: line.unitPrice, amount: line.unitPrice === null ? null : Math.round(line.quantity * line.unitPrice * 100) / 100 })),
      unmatchedLines: row.unmatchedLines,
      revisions: revisions.map((r) => ({ id: r.id, revision: r.revision, snapshot: r.snapshot, note: r.note, createdBy: r.createdBy, createdByName: who(r.createdBy), createdAt: r.createdAt.toISOString() })),
      factoryReplies: replies.map((r) => ({ id: r.id, versionNo: r.versionNo, replyDate: r.replyDate, delayDays: r.delayDays, note: r.note, createdByName: who(r.createdBy), createdAt: r.createdAt.toISOString() })),
      stages,
      stageIndex,
      stageLogCount: logs.length,
      production: production.map(toProduction),
      nextStatus: next,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function toProduction(r: typeof productionProgress.$inferSelect): ProductionProgressDto {
  return { id: r.id, reportDate: r.reportDate, knittedPairs: r.knittedPairs, packedPairs: r.packedPairs, completionRate: r.completionRate, note: r.note, createdAt: r.createdAt.toISOString() };
}

function snapshotOf(order: OrderRow, lines: (typeof orderLines.$inferSelect)[]): Record<string, unknown> {
  return {
    revision: order.revision,
    revisionDate: order.revisionDate,
    customerDueDate: order.customerDueDate,
    totalPairs: order.totalPairs,
    fobAmount: order.fobAmount,
    currency: order.currency,
    tradeTerm: order.tradeTerm,
    paymentTerms: order.paymentTerms,
    transportMode: order.transportMode,
    destination: order.destination,
    factoryId: order.factoryId,
    lines: lines.map((l) => ({ styleId: l.styleId, color: l.color, size: l.size, sku: l.sku, quantity: l.quantity, unitPrice: l.unitPrice })),
    unmatchedLines: order.unmatchedLines,
  };
}

function diffFields(before: OrderRow, patch: Partial<OrderRow>): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === "ruleCheck" || k === "unmatchedLines") continue;
    const a = before[k as keyof OrderRow];
    if (JSON.stringify(a ?? null) !== JSON.stringify(v ?? null)) out[k] = { from: a ?? null, to: v ?? null };
  }
  return out;
}

function validDate(v: string | null): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;
}

function normalizeType(filename: string, contentType: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx")) return XLSX_TYPE;
  if (lower.endsWith(".pdf")) return PDF_TYPE;
  return contentType;
}

import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import {
  type CostCategory,
  type QuoteDto,
  type QuoteExportForm,
  type QuoteListItemDto,
  type QuoteMethod,
  type QuotePreviewDto,
  type QuoteRoundDto,
  type QuoteRoundStatus,
  type QuoteStrategyDto,
  type StrategyParams,
  type StrategySnapshotDto,
  type StyleOptionDto,
  QUOTE_FEEDBACK_DAYS,
  type costItemInputSchema,
  type quoteCreateSchema,
  type quoteFeedbackSchema,
  type quoteListQuerySchema,
  type quotePreviewSchema,
  type quoteRoundCreateSchema,
  type quoteStrategyUpsertSchema,
  type quoteUpdateSchema,
  type styleOptionQuerySchema,
  quoteErrors,
} from "@otd/contracts/quote";
import {
  type Database,
  type DbOrTx,
  type QuoteStrategySnapshot,
  customers,
  factories,
  files,
  handoverPackages,
  quoteCostItems,
  quoteRounds,
  quoteStrategies,
  quotes,
  styles,
  users,
} from "@otd/db";
import { canTransition, quoteNo, round } from "@otd/shared";
import { type SQL, and, asc, desc, eq, ilike, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { type AccessContext, hasPermission, systemContext } from "../../core/access/access.types.js";
import { assertCanSee, requirePermission, scoped } from "../../core/access/scope.js";
import { AuditService, diffOf } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, assertFound, illegalTransition, notFound, versionConflict } from "../../core/errors.js";
import { EventBus, inTransaction } from "../../core/events.js";
import { NumberingService } from "../../core/numbering.service.js";
import { countAll, iso, likeKeyword, paginate } from "../../core/paging.js";
import { Scheduler } from "../../core/scheduler.js";
import { DB } from "../../core/tokens.js";
import { TodoService } from "../todo/todo.service.js";
import { type CostLine, checkPrice, computeCost, lineAmount, pct, suggestPrice } from "./quote.calc.js";
import { buildQuoteWorkbook } from "./quote.export.js";

type QuoteRow = typeof quotes.$inferSelect;
type RoundRow = typeof quoteRounds.$inferSelect;
type StrategyRow = typeof quoteStrategies.$inferSelect;
type CostItemInput = z.infer<typeof costItemInputSchema>;

const DAY = 86_400_000;
const COST_VIEW = "quote.cost.view";
const OVERRIDE = "quote.quote.override";

export const feedbackTodoKey = (roundId: string) => `quote.round:${roundId}:feedback`;

export function strategyParams(row: StrategyRow): StrategyParams {
  return {
    method: row.method as QuoteMethod,
    lossRate: row.lossRate,
    overheadRate: row.overheadRate,
    markupRate: row.markupRate,
    targetMargin: row.targetMargin,
    guardrail: row.guardrail,
    lockedFx: row.lockedFx,
    moq: row.moq,
    smallOrderUplift: row.smallOrderUplift,
    skuTiers: row.skuTiers,
  };
}

export function strategySnapshot(row: StrategyRow): QuoteStrategySnapshot {
  return { code: row.code, name: row.name, ...strategyParams(row), version: row.version };
}

function aggregateStatus(rounds: Pick<RoundRow, "kind" | "roundNo" | "status">[]): QuoteRoundStatus {
  const latest = (kind: string) => rounds.filter((r) => r.kind === kind).sort((a, b) => b.roundNo - a.roundNo)[0];
  return ((latest("CUSTOMER") ?? latest("INTERNAL"))?.status ?? "DRAFT") as QuoteRoundStatus;
}

@Injectable()
export class QuoteService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly todos: TodoService,
    private readonly scheduler: Scheduler,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({ name: "quote.lapse-unanswered", dailyAt: "01:10", run: () => this.lapseUnanswered() });
  }

  async listStrategies(): Promise<QuoteStrategyDto[]> {
    const rows = await this.db.select().from(quoteStrategies).orderBy(asc(quoteStrategies.code));
    const used = await this.db
      .select({ id: quoteRounds.strategyId, n: sql<number>`cast(count(distinct ${quoteRounds.quoteId}) as int)` })
      .from(quoteRounds)
      .groupBy(quoteRounds.strategyId);
    const usage = new Map(used.map((u) => [u.id, u.n]));
    return rows.map((r) => this.toStrategy(r, usage.get(r.id) ?? 0));
  }

  async createStrategy(ctx: AccessContext, input: z.infer<typeof quoteStrategyUpsertSchema>): Promise<QuoteStrategyDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const code = await this.numbering.next("quoteStrategy", tx);
      const { version: _v, reason: _r, ...data } = input;
      const created = (await tx.insert(quoteStrategies).values({ ...data, nameEn: data.nameEn ?? null, code, createdBy: ctx.userId }).returning())[0]!;
      await this.audit.log(ctx, { action: "quote.strategy.create", objectType: "quoteStrategy", objectId: created.id, docNo: code }, tx);
      emit({ type: "quote.strategy.created", aggregateType: "quoteStrategy", aggregateId: created.id, payload: { code } });
      return created;
    });
    return this.toStrategy(row, 0);
  }

  async updateStrategy(ctx: AccessContext, id: string, input: z.infer<typeof quoteStrategyUpsertSchema>): Promise<QuoteStrategyDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = assertFound((await tx.select().from(quoteStrategies).where(eq(quoteStrategies.id, id)))[0]);
      if (input.version !== before.version) throw versionConflict();
      const { version: _v, reason, ...data } = input;
      const patch = { ...data, nameEn: data.nameEn ?? null };
      await this.audit.snapshot(ctx, "quoteStrategy", id, before.version, { ...before, createdAt: iso(before.createdAt), updatedAt: iso(before.updatedAt) }, reason, tx);
      const updated = (await tx.update(quoteStrategies).set({ ...patch, version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(quoteStrategies.id, id), eq(quoteStrategies.version, before.version))).returning())[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: "quote.strategy.update", objectType: "quoteStrategy", objectId: id, docNo: before.code, diff: diffOf(before as unknown as Record<string, unknown>, patch) }, tx);
      emit({ type: "quote.strategy.updated", aggregateType: "quoteStrategy", aggregateId: id, payload: { code: before.code, version: updated.version } });
      return updated;
    });
    const used = (await this.db.select({ n: sql<number>`cast(count(distinct ${quoteRounds.quoteId}) as int)` }).from(quoteRounds).where(eq(quoteRounds.strategyId, id)))[0]?.n ?? 0;
    return this.toStrategy(row, used);
  }

  async list(ctx: AccessContext, q: z.infer<typeof quoteListQuerySchema>): Promise<Page<QuoteListItemDto>> {
    const conds: SQL[] = [scoped(quotes, ctx)];
    if (q.status?.length) conds.push(inArray(quotes.status, q.status));
    if (q.customerId) conds.push(eq(quotes.customerId, q.customerId));
    if (q.ownerId) conds.push(eq(quotes.ownerId, q.ownerId));
    conds.push(q.archived ? isNotNull(quotes.archivedAt) : isNull(quotes.archivedAt));
    if (q.seasonCode) conds.push(inArray(quotes.styleId, this.db.select({ id: styles.id }).from(styles).where(eq(styles.seasonCode, q.seasonCode))));
    const kw = likeKeyword(q.keyword);
    if (kw) {
      conds.push(
        or(
          inArray(quotes.styleId, this.db.select({ id: styles.id }).from(styles).where(or(ilike(styles.styleNo, kw), ilike(styles.nameZh, kw), ilike(styles.nameEn, kw)))),
          inArray(quotes.id, this.db.select({ id: quoteRounds.quoteId }).from(quoteRounds).where(ilike(quoteRounds.docNo, kw))),
          inArray(quotes.customerId, this.db.select({ id: customers.id }).from(customers).where(ilike(customers.name, kw))),
        )!,
      );
    }
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(quotes).where(where))[0]!.n,
      async (limit, offset) => this.toListItems(ctx, await this.db.select().from(quotes).where(where).orderBy(desc(quotes.updatedAt)).limit(limit).offset(offset)),
    );
  }

  async styleOptions(ctx: AccessContext, q: z.infer<typeof styleOptionQuerySchema>): Promise<StyleOptionDto[]> {
    const conds: SQL[] = [scoped(styles, ctx)];
    if (q.customerId) conds.push(eq(styles.customerId, q.customerId));
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(or(ilike(styles.styleNo, kw), ilike(styles.nameZh, kw), ilike(styles.nameEn, kw))!);
    const rows = await this.db.select().from(styles).where(and(...conds)).orderBy(asc(styles.styleNo)).limit(q.limit);
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [quoteRows, handoverRows, custRows] = await Promise.all([
      this.db.select({ id: quotes.id, styleId: quotes.styleId }).from(quotes).where(inArray(quotes.styleId, ids)),
      this.db.select({ id: handoverPackages.id, styleId: handoverPackages.styleId }).from(handoverPackages).where(inArray(handoverPackages.styleId, ids)),
      this.db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, [...new Set(rows.map((r) => r.customerId))])),
    ]);
    return rows.map((r) => ({
      id: r.id,
      styleNo: r.styleNo,
      nameZh: r.nameZh,
      nameEn: r.nameEn,
      seasonCode: r.seasonCode,
      productCode: r.productCode,
      customerId: r.customerId,
      customerName: custRows.find((c) => c.id === r.customerId)?.name ?? "",
      quoteId: quoteRows.find((x) => x.styleId === r.id)?.id ?? null,
      handoverId: handoverRows.find((x) => x.styleId === r.id)?.id ?? null,
    }));
  }

  async get(ctx: AccessContext, id: string): Promise<QuoteDto> {
    const row = assertCanSee(ctx, (await this.db.select().from(quotes).where(eq(quotes.id, id)))[0]);
    return this.toDto(ctx, row);
  }

  async create(ctx: AccessContext, input: z.infer<typeof quoteCreateSchema>): Promise<QuoteDto> {
    if (input.costItems?.length) requirePermission(ctx, COST_VIEW);
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const style = assertCanSee(ctx, (await tx.select().from(styles).where(eq(styles.id, input.styleId)))[0]);
      if ((await tx.select({ id: quotes.id }).from(quotes).where(eq(quotes.styleId, style.id)))[0]) throw new AppError(quoteErrors.QUOTE_STYLE_EXISTS, { styleNo: style.styleNo });
      const strategy = await this.loadStrategy(input.strategyId, tx);
      if (input.factoryId) assertFound((await tx.select({ id: factories.id }).from(factories).where(eq(factories.id, input.factoryId)))[0]);
      const lines = (input.costItems ?? []).map((i) => ({ category: i.category, amount: lineAmount(i) }));
      const cost = lines.length ? computeCost(lines, strategyParams(strategy)) : null;
      const created = (
        await tx
          .insert(quotes)
          .values({
            styleId: style.id,
            factoryId: input.factoryId ?? null,
            moq: input.moq ?? null,
            costTotal: cost?.costTotal ?? null,
            costBreakdown: cost?.breakdown ?? null,
            targetPriceUsd: input.targetPriceUsd ?? null,
            targetFx: input.targetFx ?? null,
            targetSource: input.targetSource ?? null,
            targetDate: input.targetDate ?? null,
            strategyId: strategy.id,
            status: "DRAFT",
            note: input.note ?? null,
            ownerId: style.ownerId,
            orgId: style.orgId,
            customerId: style.customerId,
            createdBy: ctx.userId,
          })
          .returning()
      )[0]!;
      await this.replaceCostItems(ctx, created.id, input.costItems ?? [], tx);
      await this.audit.log(ctx, { action: "quote.quote.create", objectType: "quote", objectId: created.id, docNo: `QT-${style.styleNo}` }, tx);
      emit({ type: "quote.quote.created", aggregateType: "quote", aggregateId: created.id, payload: { styleId: style.id, styleNo: style.styleNo } });
      return created;
    });
    return this.toDto(ctx, row);
  }

  async update(ctx: AccessContext, id: string, input: z.infer<typeof quoteUpdateSchema>): Promise<QuoteDto> {
    if (input.costItems !== undefined) requirePermission(ctx, COST_VIEW);
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.loadEditable(ctx, id, input.version, tx);
      const strategy = await this.loadStrategy(input.strategyId ?? before.strategyId, tx);
      if (input.factoryId) assertFound((await tx.select({ id: factories.id }).from(factories).where(eq(factories.id, input.factoryId)))[0]);
      if (input.costItems !== undefined) await this.replaceCostItems(ctx, id, input.costItems, tx);
      const cost = await this.costFor(id, strategyParams(strategy), tx);
      const patch: Partial<QuoteRow> = { strategyId: strategy.id, costTotal: cost?.costTotal ?? null, costBreakdown: cost?.breakdown ?? null };
      for (const key of ["factoryId", "moq", "targetPriceUsd", "targetFx", "targetSource", "targetDate", "note"] as const) {
        if (input[key] !== undefined) (patch as Record<string, unknown>)[key] = input[key];
      }
      const updated = (await tx.update(quotes).set({ ...patch, version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(quotes.id, id), eq(quotes.version, before.version))).returning())[0];
      if (!updated) throw versionConflict();
      const diff = diffOf(before as unknown as Record<string, unknown>, patch);
      if (input.costItems !== undefined) diff.costItems = { from: null, to: input.costItems.length };
      await this.audit.log(ctx, { action: "quote.quote.update", objectType: "quote", objectId: id, diff }, tx);
      emit({ type: "quote.quote.updated", aggregateType: "quote", aggregateId: id, payload: { styleId: before.styleId } });
      return updated;
    });
    return this.toDto(ctx, row);
  }

  async preview(ctx: AccessContext, input: z.infer<typeof quotePreviewSchema>): Promise<QuotePreviewDto> {
    let lines: CostLine[];
    let strategyId = input.strategyId;
    let target = input.targetPriceUsd ?? null;
    if (input.quoteId) {
      const quote = assertCanSee(ctx, (await this.db.select().from(quotes).where(eq(quotes.id, input.quoteId)))[0]);
      lines = await this.costLines(quote.id);
      strategyId = strategyId ?? quote.strategyId ?? undefined;
      if (input.targetPriceUsd === undefined) target = quote.targetPriceUsd;
    } else {
      lines = (input.costItems ?? []).map((i) => ({ category: i.category, amount: lineAmount(i) }));
    }
    if (!lines.length) throw new AppError(quoteErrors.QUOTE_COST_MISSING);
    const strategy = await this.loadStrategy(strategyId ?? null);
    const params = strategyParams(strategy);
    const cost = computeCost(lines, params);
    const suggested = suggestPrice(cost.costTotal, params, input.quantity);
    const canCost = hasPermission(ctx, COST_VIEW);
    const check = input.priceCny === undefined ? null : checkPrice({ priceCny: input.priceCny, cost: cost.costTotal, params, quantity: input.quantity, targetPriceUsd: target, canOverride: hasPermission(ctx, OVERRIDE) });
    const result: QuotePreviewDto = { strategy: strategySnapshot(strategy) as StrategySnapshotDto, fx: params.lockedFx, quantity: input.quantity, check };
    if (canCost) {
      result.costTotal = cost.costTotal;
      result.costBreakdown = cost.breakdown;
      result.suggested = { basePrice: suggested.basePrice, upliftRate: suggested.upliftRate, skuAmount: suggested.skuAmount, discountRate: suggested.discountRate, suggestedPrice: suggested.suggestedPrice, priceUsd: suggested.priceUsd };
    } else if (check) {
      const { margin: _m, ...rest } = check;
      result.check = rest;
    }
    return result;
  }

  async createRound(ctx: AccessContext, id: string, input: z.infer<typeof quoteRoundCreateSchema>): Promise<QuoteDto> {
    if (input.kind === "INTERNAL") requirePermission(ctx, COST_VIEW);
    if (input.kind === "CUSTOMER" && input.priceCny === undefined) throw new AppError(quoteErrors.QUOTE_PRICE_REQUIRED);
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const quote = await this.loadEditable(ctx, id, input.version, tx);
      const strategy = await this.loadStrategy(input.strategyId ?? quote.strategyId, tx);
      const params = strategyParams(strategy);
      const cost = await this.costFor(id, params, tx);
      if (!cost) throw new AppError(quoteErrors.QUOTE_COST_MISSING);
      const style = assertFound((await tx.select().from(styles).where(eq(styles.id, quote.styleId)))[0]);
      const existing = await tx.select().from(quoteRounds).where(eq(quoteRounds.quoteId, id));
      const roundNo = existing.reduce((m, r) => Math.max(m, r.roundNo), 0) + 1;
      const docNo = quoteNo(style.styleNo, roundNo);
      const now = this.clock.now();
      const suggested = suggestPrice(cost.costTotal, params, input.quantity);
      const pricing = { basePrice: suggested.basePrice, upliftRate: suggested.upliftRate, skuAmount: suggested.skuAmount, discountRate: suggested.discountRate, suggestedPrice: suggested.suggestedPrice };
      const priceCny = input.kind === "INTERNAL" ? suggested.suggestedPrice : round(input.priceCny!, 2);
      const check = checkPrice({ priceCny, cost: cost.costTotal, params, quantity: input.quantity, targetPriceUsd: quote.targetPriceUsd, canOverride: hasPermission(ctx, OVERRIDE) });
      let overrideApprovedBy: string | null = null;
      let overrideReason: string | null = null;
      if (input.kind === "CUSTOMER" && !check.guardrailPassed) {
        const errParams = { guardrail: pct(params.guardrail), guardrailRate: params.guardrail, ...(hasPermission(ctx, COST_VIEW) ? { margin: pct(check.margin), marginRate: check.margin } : {}) };
        if (!hasPermission(ctx, OVERRIDE)) throw new AppError(quoteErrors.QUOTE_GUARDRAIL_VIOLATED, errParams);
        if (!input.overrideReason) throw new AppError(quoteErrors.QUOTE_OVERRIDE_REASON_REQUIRED, errParams);
        overrideApprovedBy = ctx.userId;
        overrideReason = input.overrideReason;
      }
      const status: QuoteRoundStatus = input.kind === "INTERNAL" ? "COST_REVIEW" : "QUOTED";
      if (!canTransition("quoteRound", "DRAFT", status)) throw illegalTransition("DRAFT", "submit");
      const created = (
        await tx
          .insert(quoteRounds)
          .values({
            quoteId: id,
            docNo,
            kind: input.kind,
            roundNo,
            priceCny,
            priceUsd: check.priceUsd,
            fx: params.lockedFx,
            quantity: input.quantity,
            strategyId: strategy.id,
            margin: check.margin,
            guardrailPassed: check.guardrailPassed,
            diffToTargetUsd: check.diffToTargetUsd,
            status,
            quotedBy: ctx.userId,
            quotedAt: now,
            overrideApprovedBy,
            overrideReason,
            costTotal: cost.costTotal,
            strategySnapshot: strategySnapshot(strategy),
            pricing,
            note: input.note ?? null,
            createdBy: ctx.userId,
          })
          .returning()
      )[0]!;
      const all = [...existing, created];
      if (input.kind === "CUSTOMER") {
        for (const prev of existing.filter((r) => r.kind === "CUSTOMER" && r.status === "QUOTED")) {
          await tx.update(quoteRounds).set({ status: "LAPSED", version: prev.version + 1, updatedBy: ctx.userId }).where(eq(quoteRounds.id, prev.id));
          await this.todos.close(feedbackTodoKey(prev.id), tx);
          prev.status = "LAPSED";
          emit({ type: "quote.round.lapsed", aggregateType: "quoteRound", aggregateId: prev.id, payload: { quoteId: id, styleId: quote.styleId, docNo: prev.docNo, reason: "superseded" } });
        }
        for (const internal of existing.filter((r) => r.kind === "INTERNAL" && r.status === "COST_REVIEW")) {
          await tx.update(quoteRounds).set({ status: "QUOTED", version: internal.version + 1, updatedBy: ctx.userId }).where(eq(quoteRounds.id, internal.id));
          internal.status = "QUOTED";
        }
        const customerName = (await tx.select({ name: customers.name }).from(customers).where(eq(customers.id, quote.customerId)))[0]?.name ?? "";
        await this.todos.upsert(
          {
            fingerprint: feedbackTodoKey(created.id),
            source: "FLOW",
            action: "quote.feedback",
            title: `跟进客户报价反馈 ${docNo}`,
            description: `${customerName} · #${style.styleNo} · $${check.priceUsd.toFixed(2)} × ${input.quantity}`,
            docType: "quote",
            docId: id,
            docNo,
            link: `/quotes/${id}`,
            customerId: quote.customerId,
            assigneeId: quote.ownerId,
            dueAt: new Date(now.getTime() + QUOTE_FEEDBACK_DAYS * DAY),
          },
          tx,
        );
      }
      const patch: Partial<QuoteRow> = { status: aggregateStatus(all), updatedBy: ctx.userId, version: quote.version + 1 };
      if (input.kind === "CUSTOMER" && strategy.id !== quote.strategyId) Object.assign(patch, { strategyId: strategy.id, costTotal: cost.costTotal, costBreakdown: cost.breakdown });
      const updated = (await tx.update(quotes).set(patch).where(and(eq(quotes.id, id), eq(quotes.version, quote.version))).returning())[0];
      if (!updated) throw versionConflict();
      await this.audit.log(
        ctx,
        { action: input.kind === "INTERNAL" ? "quote.round.internal" : "quote.round.quote", objectType: "quoteRound", objectId: created.id, docNo, diff: { priceCny: { from: null, to: priceCny }, quantity: { from: null, to: input.quantity }, strategy: { from: null, to: strategy.code }, ...(overrideReason ? { override: { from: null, to: overrideReason } } : {}) } },
        tx,
      );
      emit({ type: input.kind === "INTERNAL" ? "quote.round.internal" : "quote.round.quoted", aggregateType: "quoteRound", aggregateId: created.id, payload: { quoteId: id, styleId: quote.styleId, docNo, guardrailPassed: check.guardrailPassed } });
      return updated;
    });
    return this.toDto(ctx, row);
  }

  async feedback(ctx: AccessContext, id: string, roundId: string, input: z.infer<typeof quoteFeedbackSchema>): Promise<QuoteDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const quote = assertCanSee(ctx, (await tx.select().from(quotes).where(eq(quotes.id, id)))[0]);
      if (quote.archivedAt) throw new AppError(quoteErrors.QUOTE_ARCHIVED);
      await this.assertNotFrozen(quote.styleId, tx);
      const rounds = await tx.select().from(quoteRounds).where(eq(quoteRounds.quoteId, id));
      const target = rounds.find((r) => r.id === roundId);
      if (!target) throw notFound();
      if (target.version !== input.version) throw versionConflict();
      if (target.kind !== "CUSTOMER") throw illegalTransition(target.status, "feedback");
      const latest = rounds.filter((r) => r.kind === "CUSTOMER").sort((a, b) => b.roundNo - a.roundNo)[0]!;
      if (latest.id !== target.id) throw new AppError(quoteErrors.QUOTE_NOT_LATEST_ROUND);
      if (!canTransition("quoteRound", target.status as QuoteRoundStatus, input.result)) throw illegalTransition(target.status, "feedback");
      const changed = (
        await tx
          .update(quoteRounds)
          .set({ status: input.result, feedbackAt: this.clock.now(), feedbackNote: input.note ?? null, version: target.version + 1, updatedBy: ctx.userId })
          .where(and(eq(quoteRounds.id, roundId), eq(quoteRounds.version, target.version)))
          .returning()
      )[0];
      if (!changed) throw versionConflict();
      const all = rounds.map((r) => (r.id === roundId ? changed : r));
      const updated = (await tx.update(quotes).set({ status: aggregateStatus(all), version: quote.version + 1, updatedBy: ctx.userId }).where(eq(quotes.id, id)).returning())[0]!;
      await this.todos.close(feedbackTodoKey(roundId), tx);
      await this.audit.log(ctx, { action: "quote.round.feedback", objectType: "quoteRound", objectId: roundId, docNo: target.docNo, diff: { status: { from: target.status, to: input.result } } }, tx);
      emit({
        type: input.result === "ACCEPTED" ? "quote.round.accepted" : "quote.round.rejected",
        aggregateType: "quoteRound",
        aggregateId: roundId,
        payload: { quoteId: id, styleId: quote.styleId, customerId: quote.customerId, docNo: target.docNo },
      });
      return updated;
    });
    return this.toDto(ctx, row);
  }

  async archive(ctx: AccessContext, id: string, version: number): Promise<QuoteDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = assertCanSee(ctx, (await tx.select().from(quotes).where(eq(quotes.id, id)))[0]);
      if (before.version !== version) throw versionConflict();
      if (before.archivedAt) throw new AppError(quoteErrors.QUOTE_ARCHIVED);
      const updated = (await tx.update(quotes).set({ archivedAt: this.clock.now(), version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(quotes.id, id), eq(quotes.version, version))).returning())[0];
      if (!updated) throw versionConflict();
      await this.todos.closeForDoc("quote", id, tx);
      await this.audit.log(ctx, { action: "quote.quote.archive", objectType: "quote", objectId: id, diff: { archivedAt: { from: null, to: iso(updated.archivedAt) } } }, tx);
      emit({ type: "quote.quote.archived", aggregateType: "quote", aggregateId: id, payload: { styleId: before.styleId } });
      return updated;
    });
    return this.toDto(ctx, row);
  }

  async attachFile(ctx: AccessContext, id: string, input: { fileId: string; version: number }): Promise<QuoteDto> {
    const row = await inTransaction(this.db, this.events, async (tx) => {
      const before = await this.loadEditable(ctx, id, input.version, tx);
      const file = assertFound((await tx.select().from(files).where(eq(files.id, input.fileId)))[0]);
      await tx.update(files).set({ ownerType: "quote", ownerId: id }).where(eq(files.id, file.id));
      const updated = (await tx.update(quotes).set({ version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(quotes.id, id), eq(quotes.version, before.version))).returning())[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: "quote.quote.attach", objectType: "quote", objectId: id, diff: { file: { from: null, to: file.filename } } }, tx);
      return updated;
    });
    return this.toDto(ctx, row);
  }

  async lapseUnanswered(): Promise<{ lapsed: string[] }> {
    const cutoff = new Date(this.clock.now().getTime() - QUOTE_FEEDBACK_DAYS * DAY);
    const stale = await this.db
      .select()
      .from(quoteRounds)
      .where(and(eq(quoteRounds.kind, "CUSTOMER"), eq(quoteRounds.status, "QUOTED"), lt(quoteRounds.quotedAt, cutoff)));
    const sys = systemContext();
    const lapsed: string[] = [];
    for (const r of stale) {
      await inTransaction(this.db, this.events, async (tx, emit) => {
        const changed = (await tx.update(quoteRounds).set({ status: "LAPSED", version: r.version + 1 }).where(and(eq(quoteRounds.id, r.id), eq(quoteRounds.version, r.version))).returning())[0];
        if (!changed) return;
        const all = await tx.select().from(quoteRounds).where(eq(quoteRounds.quoteId, r.quoteId));
        const quote = (await tx
          .update(quotes)
          .set({ status: aggregateStatus(all), version: sql`${quotes.version} + 1` })
          .where(eq(quotes.id, r.quoteId))
          .returning({ styleId: quotes.styleId }))[0];
        await this.todos.close(feedbackTodoKey(r.id), tx);
        await this.audit.log(sys, { action: "quote.round.lapse", objectType: "quoteRound", objectId: r.id, docNo: r.docNo, diff: { status: { from: "QUOTED", to: "LAPSED" } } }, tx);
        emit({ type: "quote.round.lapsed", aggregateType: "quoteRound", aggregateId: r.id, payload: { quoteId: r.quoteId, styleId: quote?.styleId ?? null, docNo: r.docNo, reason: "no_feedback" } });
        lapsed.push(r.docNo);
      });
    }
    return { lapsed };
  }

  async exportForm(ctx: AccessContext, id: string, form: QuoteExportForm): Promise<{ filename: string; data: Buffer }> {
    if (form === "cost-detail") requirePermission(ctx, COST_VIEW);
    const quote = await this.get(ctx, id);
    await this.audit.log(ctx, { action: "quote.quote.export", objectType: "quote", objectId: id, docNo: `QT-${quote.styleNo}`, diff: { form: { from: null, to: form } } });
    return buildQuoteWorkbook(form, quote, hasPermission(ctx, COST_VIEW));
  }

  private async loadEditable(ctx: AccessContext, id: string, version: number, tx: DbOrTx): Promise<QuoteRow> {
    const row = assertCanSee(ctx, (await tx.select().from(quotes).where(eq(quotes.id, id)))[0]);
    if (row.version !== version) throw versionConflict();
    if (row.archivedAt) throw new AppError(quoteErrors.QUOTE_ARCHIVED);
    await this.assertNotFrozen(row.styleId, tx);
    return row;
  }

  private async assertNotFrozen(styleId: string, tx: DbOrTx): Promise<void> {
    const h = (await tx.select({ status: handoverPackages.status }).from(handoverPackages).where(eq(handoverPackages.styleId, styleId)))[0];
    if (h?.status === "HANDED_OVER") throw new AppError(quoteErrors.QUOTE_FROZEN);
  }

  private async loadStrategy(id: string | null | undefined, db: DbOrTx = this.db): Promise<StrategyRow> {
    if (!id) throw notFound("strategy");
    const row = assertFound((await db.select().from(quoteStrategies).where(eq(quoteStrategies.id, id)))[0], "strategy");
    if (!row.enabled) throw new AppError(quoteErrors.QUOTE_STRATEGY_DISABLED, { code: row.code });
    return row;
  }

  private async costLines(quoteId: string, db: DbOrTx = this.db): Promise<CostLine[]> {
    const rows = await db.select({ category: quoteCostItems.category, amount: quoteCostItems.amount }).from(quoteCostItems).where(eq(quoteCostItems.quoteId, quoteId));
    return rows.map((r) => ({ category: r.category as CostCategory, amount: r.amount }));
  }

  private async costFor(quoteId: string, params: StrategyParams, db: DbOrTx) {
    const lines = await this.costLines(quoteId, db);
    return lines.length ? computeCost(lines, params) : null;
  }

  private async replaceCostItems(ctx: AccessContext, quoteId: string, items: CostItemInput[], tx: DbOrTx): Promise<void> {
    await tx.delete(quoteCostItems).where(eq(quoteCostItems.quoteId, quoteId));
    if (!items.length) return;
    await tx.insert(quoteCostItems).values(
      items.map((i) => ({ quoteId, category: i.category, name: i.name, spec: i.spec ?? null, quantity: i.quantity ?? null, unitPrice: i.unitPrice ?? null, amount: lineAmount(i), createdBy: ctx.userId })),
    );
  }

  private toStrategy(r: StrategyRow, usedBy: number): QuoteStrategyDto {
    return { id: r.id, code: r.code, name: r.name, nameEn: r.nameEn, ...strategyParams(r), enabled: r.enabled, usedBy, updatedAt: r.updatedAt.toISOString(), version: r.version };
  }

  private async lookups(rows: QuoteRow[]) {
    const ids = rows.map((r) => r.id);
    const styleIds = [...new Set(rows.map((r) => r.styleId))];
    const factoryIds = [...new Set(rows.map((r) => r.factoryId).filter((x): x is string => !!x))];
    const strategyIds = [...new Set(rows.map((r) => r.strategyId).filter((x): x is string => !!x))];
    const [styleRows, custRows, factoryRows, strategyRows, roundRows] = await Promise.all([
      this.db.select().from(styles).where(inArray(styles.id, styleIds)),
      this.db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, [...new Set(rows.map((r) => r.customerId))])),
      factoryIds.length ? this.db.select({ id: factories.id, name: factories.name }).from(factories).where(inArray(factories.id, factoryIds)) : Promise.resolve([]),
      strategyIds.length ? this.db.select().from(quoteStrategies).where(inArray(quoteStrategies.id, strategyIds)) : Promise.resolve([]),
      this.db.select().from(quoteRounds).where(inArray(quoteRounds.quoteId, ids)).orderBy(asc(quoteRounds.roundNo)),
    ]);
    const userIds = [...new Set([...rows.map((r) => r.ownerId), ...roundRows.map((r) => r.quotedBy).filter((x): x is string => !!x)])];
    const userRows = userIds.length ? await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds)) : [];
    return {
      style: new Map(styleRows.map((s) => [s.id, s])),
      customer: new Map(custRows.map((c) => [c.id, c.name])),
      factory: new Map(factoryRows.map((f) => [f.id, f.name])),
      strategy: new Map(strategyRows.map((s) => [s.id, s])),
      user: new Map(userRows.map((u) => [u.id, u.name])),
      rounds: roundRows,
    };
  }

  private toRound(r: RoundRow, all: RoundRow[], userName: Map<string, string>, canCost: boolean): QuoteRoundDto {
    const sameKind = all.filter((x) => x.kind === r.kind).sort((a, b) => a.roundNo - b.roundNo);
    const snap = r.strategySnapshot;
    const dto: QuoteRoundDto = {
      id: r.id,
      docNo: r.docNo,
      kind: r.kind as QuoteRoundDto["kind"],
      roundNo: r.roundNo,
      seq: sameKind.findIndex((x) => x.id === r.id) + 1,
      isLatest: sameKind[sameKind.length - 1]?.id === r.id,
      priceCny: r.priceCny,
      priceUsd: r.priceUsd,
      fx: r.fx,
      quantity: r.quantity,
      strategyId: r.strategyId,
      strategyCode: snap?.code ?? null,
      strategy: snap ? { ...snap, method: snap.method as QuoteMethod } : null,
      guardrailPassed: r.guardrailPassed,
      diffToTargetUsd: r.diffToTargetUsd,
      status: r.status as QuoteRoundStatus,
      quotedBy: r.quotedBy,
      quotedByName: r.quotedBy ? (userName.get(r.quotedBy) ?? null) : null,
      quotedAt: iso(r.quotedAt),
      overrideApprovedBy: r.overrideApprovedBy,
      overrideReason: r.overrideReason,
      feedbackAt: iso(r.feedbackAt),
      feedbackNote: r.feedbackNote,
      note: r.note,
      version: r.version,
    };
    if (canCost) {
      dto.costTotal = r.costTotal;
      dto.margin = r.margin;
      dto.pricing = r.pricing ?? null;
    }
    return dto;
  }

  private async toListItems(ctx: AccessContext, rows: QuoteRow[]): Promise<QuoteListItemDto[]> {
    if (!rows.length) return [];
    const canCost = hasPermission(ctx, COST_VIEW);
    const l = await this.lookups(rows);
    return rows.map((r) => {
      const style = l.style.get(r.styleId);
      const rounds = l.rounds.filter((x) => x.quoteId === r.id);
      const pick = (kind: string) => rounds.filter((x) => x.kind === kind).sort((a, b) => b.roundNo - a.roundNo)[0];
      const customer = pick("CUSTOMER");
      const internal = pick("INTERNAL");
      const latest = customer ?? internal;
      const priced = customer ?? (canCost ? internal : undefined);
      const seqOf = (x: RoundRow) => rounds.filter((y) => y.kind === x.kind && y.roundNo <= x.roundNo).length;
      const item: QuoteListItemDto = {
        id: r.id,
        styleId: r.styleId,
        styleNo: style?.styleNo ?? "",
        styleName: style?.nameZh ?? "",
        seasonCode: style?.seasonCode ?? null,
        customerId: r.customerId,
        customerName: l.customer.get(r.customerId) ?? "",
        factoryName: r.factoryId ? (l.factory.get(r.factoryId) ?? null) : null,
        status: r.status as QuoteRoundStatus,
        strategyCode: r.strategyId ? (l.strategy.get(r.strategyId)?.code ?? null) : null,
        latestDocNo: latest?.docNo ?? null,
        latestSeq: latest ? seqOf(latest) : null,
        latestPriceCny: priced?.priceCny ?? null,
        latestPriceUsd: priced?.priceUsd ?? null,
        latestQuantity: latest?.quantity ?? null,
        latestQuotedAt: iso(latest?.quotedAt),
        roundCount: rounds.length,
        ownerId: r.ownerId,
        ownerName: l.user.get(r.ownerId) ?? "",
        archivedAt: iso(r.archivedAt),
        updatedAt: r.updatedAt.toISOString(),
        version: r.version,
      };
      if (canCost) item.latestMargin = priced?.margin ?? null;
      return item;
    });
  }

  private async toDto(ctx: AccessContext, row: QuoteRow): Promise<QuoteDto> {
    const canCost = hasPermission(ctx, COST_VIEW);
    const l = await this.lookups([row]);
    const style = l.style.get(row.styleId);
    const strategy = row.strategyId ? l.strategy.get(row.strategyId) : undefined;
    const roundDtos = l.rounds.map((r) => this.toRound(r, l.rounds, l.user, canCost));
    const customerRounds = roundDtos.filter((r) => r.kind === "CUSTOMER");
    const internalRounds = roundDtos.filter((r) => r.kind === "INTERNAL");
    const latestInternal = internalRounds[internalRounds.length - 1];
    const [fileRows, handover] = await Promise.all([
      this.db.select().from(files).where(and(eq(files.ownerType, "quote"), eq(files.ownerId, row.id))).orderBy(asc(files.createdAt)),
      this.db.select({ status: handoverPackages.status }).from(handoverPackages).where(eq(handoverPackages.styleId, row.styleId)),
    ]);
    const dto: QuoteDto = {
      id: row.id,
      styleId: row.styleId,
      styleNo: style?.styleNo ?? "",
      styleName: style?.nameZh ?? "",
      styleNameEn: style?.nameEn ?? null,
      productCode: style?.productCode ?? null,
      seasonCode: style?.seasonCode ?? null,
      customerId: row.customerId,
      customerName: l.customer.get(row.customerId) ?? "",
      factoryId: row.factoryId,
      factoryName: row.factoryId ? (l.factory.get(row.factoryId) ?? null) : null,
      moq: row.moq,
      status: row.status as QuoteRoundStatus,
      strategy: strategy ? { id: strategy.id, code: strategy.code, name: strategy.name, nameEn: strategy.nameEn, ...strategyParams(strategy), version: strategy.version } : null,
      targetPriceUsd: row.targetPriceUsd,
      targetFx: row.targetFx,
      targetPriceCny: row.targetPriceUsd != null && row.targetFx != null ? round(row.targetPriceUsd * row.targetFx, 2) : null,
      targetSource: row.targetSource,
      targetDate: row.targetDate,
      customerRounds,
      latestCustomerRound: customerRounds[customerRounds.length - 1] ?? null,
      roundCounts: { internal: internalRounds.length, customer: customerRounds.length },
      files: fileRows.map((f) => ({ id: f.id, filename: f.filename, contentType: f.contentType, size: f.size, createdAt: f.createdAt.toISOString() })),
      handoverStatus: (handover[0]?.status as QuoteDto["handoverStatus"]) ?? null,
      note: row.note,
      ownerId: row.ownerId,
      ownerName: l.user.get(row.ownerId) ?? "",
      archivedAt: iso(row.archivedAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      version: row.version,
    };
    if (canCost) {
      const items = await this.db.select().from(quoteCostItems).where(eq(quoteCostItems.quoteId, row.id)).orderBy(asc(quoteCostItems.createdAt), asc(quoteCostItems.id));
      const order: CostCategory[] = ["YARN", "LABOR", "TRIMS", "OTHER"];
      dto.costTotal = row.costTotal;
      dto.costBreakdown = row.costBreakdown ? { yarnRaw: 0, laborRaw: 0, overheadRate: 0, ...row.costBreakdown } : null;
      dto.costItems = items
        .map((i) => ({ id: i.id, category: i.category as CostCategory, name: i.name, spec: i.spec, quantity: i.quantity, unitPrice: i.unitPrice, amount: i.amount }))
        .sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
      dto.internalRounds = internalRounds;
      dto.internalPrice = latestInternal ? { docNo: latestInternal.docNo, priceCny: latestInternal.priceCny, priceUsd: latestInternal.priceUsd } : null;
    }
    return dto;
  }
}


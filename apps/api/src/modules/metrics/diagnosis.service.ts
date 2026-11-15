import { Inject, Injectable, Logger } from "@nestjs/common";
import type { BoardKey, BoardQuery, DiagnosisDto } from "@otd/contracts/metrics";
import { type Database, diagnoses } from "@otd/db";
import { and, desc, eq } from "drizzle-orm";
import type { AccessContext } from "../../core/access/access.types.js";
import { requirePermission } from "../../core/access/scope.js";
import type { AiProvider } from "../../core/ai/ai.types.js";
import { Clock } from "../../core/clock.js";
import { AI_PROVIDER, DB } from "../../core/tokens.js";
import { type RenderedItem, polishItems, renderSignal, selectSignals, summaryOf } from "./diagnosis.js";
import { MetricsService } from "./metrics.service.js";
import { periodOf } from "./metrics.period.js";
import { scopeKeyOf } from "./metrics.scope.js";

const TITLES: Record<BoardKey, string> = { sales: "本期任务分析", manager: "本期客户分析", gm: "本期经营分析" };

@Injectable()
export class DiagnosisService {
  private readonly logger = new Logger("Diagnosis");

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    private readonly clock: Clock,
    private readonly metrics: MetricsService,
  ) {}

  async get(ctx: AccessContext, board: BoardKey, q: BoardQuery, refresh = false): Promise<DiagnosisDto> {
    requirePermission(ctx, `metrics.${board}.view`);
    const today = this.clock.today();
    const period = periodOf(q.period, today);
    const scopeKey = scopeKeyOf(ctx, q.orgId ?? null, q.customerId ?? null);
    if (!refresh) {
      const cached = (await this.db.select().from(diagnoses).where(and(eq(diagnoses.board, board), eq(diagnoses.scopeKey, scopeKey), eq(diagnoses.period, period.code))).orderBy(desc(diagnoses.generatedAt)).limit(1))[0];
      if (cached && cached.generatedAt.toISOString().slice(0, 10) === today) return this.toDto(cached, true);
    }
    const computed = await this.metrics.compute(ctx, board, { ...q, tab: undefined });
    const items = selectSignals(computed.signals).map(renderSignal);
    let polished: { items: RenderedItem[]; model: string | null } = { items, model: null };
    try {
      polished = await polishItems(this.ai, items, ctx.userId);
    } catch (err) {
      this.logger.warn(`diagnosis polish skipped: ${err instanceof Error ? err.message : String(err)}`);
    }
    const row = (
      await this.db
        .insert(diagnoses)
        .values({
          board,
          scopeKey,
          period: period.code,
          title: TITLES[board],
          scopeLabel: computed.dto.scope.label.zh,
          asOf: computed.today,
          summary: summaryOf(board, polished.items),
          items: polished.items.map((i) => ({ level: i.level, title: i.title, basis: i.basis, suggestion: i.suggestion, signalKey: i.signalKey, numbers: i.numbers })),
          signals: computed.signals.map((s) => ({ key: s.key, level: s.level, impact: s.impact, numbers: s.numbers })),
          model: polished.model,
          generatedBy: ctx.system ? null : ctx.userId,
          generatedAt: this.clock.now(),
        })
        .returning()
    )[0]!;
    return this.toDto(row, false);
  }

  private toDto(row: typeof diagnoses.$inferSelect, cached: boolean): DiagnosisDto {
    return {
      board: row.board as BoardKey,
      scopeKey: row.scopeKey,
      period: row.period,
      title: row.title ?? TITLES[row.board as BoardKey],
      scopeLabel: row.scopeLabel ?? "",
      asOf: row.asOf ?? row.generatedAt.toISOString().slice(0, 10),
      summary: row.summary,
      items: row.items.map((i, idx) => ({ no: idx + 1, level: i.level, title: i.title, basis: i.basis, suggestion: i.suggestion, signalKey: i.signalKey ?? "", numbers: i.numbers ?? {} })),
      signals: row.signals,
      model: row.model,
      generatedAt: row.generatedAt.toISOString(),
      cached,
    };
  }
}

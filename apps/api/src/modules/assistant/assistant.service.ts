import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import {
  ASSISTANT_EXAMPLES,
  type AssistantAnswer,
  type AssistantMessageDto,
  type AssistantProfileDto,
  type AssistantReplyDto,
  type ConversationDto,
  type ProposalDto,
  type ProposalKind,
  type ProposalStatus,
  assistantAnswerSchema,
  assistantErrors,
  type conversationCreateSchema,
  type messageCreateSchema,
  type proposalDecisionSchema,
} from "@otd/contracts/assistant";
import type { COLLECTION_CHANNELS, COLLECTION_RESULTS } from "@otd/contracts/receivable";
import { type Database, type DbOrTx, aiConversations, aiMessages, aiProposals, aiUsage, systemParams } from "@otd/db";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { z } from "zod";
import { AiProviderError, type AiChatMessage, type AiChatRequest, type AiChatResult, type AiProvider } from "../../core/ai/ai.types.js";
import { FakeAiProvider } from "../../core/ai/fake.provider.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { requirePermission } from "../../core/access/scope.js";
import { AuditService } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, assertFound, illegalTransition, versionConflict } from "../../core/errors.js";
import { EventBus, inTransaction } from "../../core/events.js";
import { Scheduler } from "../../core/scheduler.js";
import { AI_PROVIDER, DB } from "../../core/tokens.js";
import { ReceivableService } from "../receivable/receivable.service.js";
import { TodoService } from "../todo/todo.service.js";
import { EXAMPLES_TEXT, plan } from "./assistant.offline.js";
import { describe, excludedCount, latestCalls, present } from "./assistant.present.js";
import { contextPrefix, pagePrefix, systemPrompt } from "./assistant.prompt.js";
import { AssistantTools } from "./assistant.tools.js";
import type { ProposalPreview, RunState, ToolOutput } from "./assistant.types.js";

export const CHAT_PURPOSE = "assistant.chat";
export const QUESTION_PURPOSE = "assistant.question";
const DEFAULT_QUOTA = 200;
const DEFAULT_NAME = { zh: "OTD 助手", en: "OTD Assistant" };
const NEW_TITLE = "新对话";
const HISTORY_LIMIT = 20;
const RETENTION_DAYS = 180;

type ConversationRow = typeof aiConversations.$inferSelect;
type MessageRow = typeof aiMessages.$inferSelect;
type ProposalRow = typeof aiProposals.$inferSelect;
type UserContent = { text: string; context?: unknown };
type AssistantContent = { answer: AssistantAnswer; toolCalls?: unknown; mode?: string };
type TodoPayload = { title: string; note: string | null; assigneeId: string; assigneeName: string; dueDate: string | null; orderId: string | null; poNo: string | null; customerId: string | null };
type CollectionPayload = { receivableId: string; docNo: string; channel: (typeof COLLECTION_CHANNELS)[number]; result: (typeof COLLECTION_RESULTS)[number]; note: string | null; nextFollowUp: string | null };

@Injectable()
export class AssistantService implements OnModuleInit {
  private readonly runs = new WeakMap<AiChatRequest, RunState>();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly scheduler: Scheduler,
    private readonly tools: AssistantTools,
    private readonly todos: TodoService,
    private readonly receivables: ReceivableService,
  ) {}

  onModuleInit(): void {
    if (this.ai instanceof FakeAiProvider) this.ai.onChat(CHAT_PURPOSE, (req) => this.offline(req));
    this.scheduler.register({ name: "assistant.retention", dailyAt: "03:20", run: () => this.purgeExpired() });
  }

  get online(): boolean {
    return !(this.ai instanceof FakeAiProvider);
  }

  async profile(ctx: AccessContext): Promise<AssistantProfileDto> {
    return { name: await this.assistantName(), examples: [...ASSISTANT_EXAMPLES], mode: this.online ? "online" : "offline", quota: { limit: await this.quotaLimit(), used: await this.usedToday(ctx.userId) } };
  }

  async listConversations(ctx: AccessContext): Promise<ConversationDto[]> {
    const rows = await this.db.select().from(aiConversations).where(eq(aiConversations.userId, ctx.userId)).orderBy(desc(aiConversations.updatedAt), desc(aiConversations.createdAt)).limit(100);
    return rows.map(toConversation);
  }

  async createConversation(ctx: AccessContext, input: z.infer<typeof conversationCreateSchema>): Promise<ConversationDto> {
    const now = this.clock.now();
    const row = (await this.db.insert(aiConversations).values({ userId: ctx.userId, title: input.title ?? NEW_TITLE, createdAt: now, updatedAt: now }).returning())[0]!;
    return toConversation(row);
  }

  async deleteConversation(ctx: AccessContext, id: string): Promise<void> {
    await this.ownConversation(ctx, id);
    await inTransaction(this.db, this.events, async (tx) => {
      await tx.delete(aiMessages).where(eq(aiMessages.conversationId, id));
      await tx.delete(aiProposals).where(and(eq(aiProposals.conversationId, id), eq(aiProposals.status, "PENDING")));
      await tx.delete(aiConversations).where(eq(aiConversations.id, id));
      await this.audit.log(ctx, { action: "assistant.conversation.delete", objectType: "aiConversation", objectId: id }, tx);
    });
  }

  async messages(ctx: AccessContext, id: string): Promise<AssistantMessageDto[]> {
    await this.ownConversation(ctx, id);
    const rows = await this.db.select().from(aiMessages).where(eq(aiMessages.conversationId, id)).orderBy(asc(aiMessages.seq), asc(aiMessages.createdAt));
    const proposals = await this.db.select().from(aiProposals).where(eq(aiProposals.conversationId, id));
    const byId = new Map(proposals.map((p) => [p.id, toProposal(p)]));
    return rows.map((r) => toMessage(r, byId));
  }

  async ask(ctx: AccessContext, id: string, input: z.infer<typeof messageCreateSchema>, onText?: (delta: string) => void): Promise<AssistantReplyDto> {
    const conversation = await this.ownConversation(ctx, id);
    const limit = await this.quotaLimit();
    if ((await this.usedToday(ctx.userId)) >= limit) throw new AppError(assistantErrors.ASSISTANT_QUOTA_EXCEEDED, { limit });
    const name = await this.assistantName();
    const history = await this.history(id);
    const prefix = contextPrefix({ userName: ctx.userName, roles: ctx.roles, scope: this.tools.scopeLabel(ctx), today: this.clock.today() });
    const page = pagePrefix(input.context);
    const current = [page, input.content].filter(Boolean).join("\n");
    const messages: AiChatMessage[] = [...history, { role: "user", content: current }];
    messages[0] = { role: "user", content: `${prefix}\n\n${messages[0]!.content}` };
    const state: RunState = { external: true, question: input.content, context: input.context ?? null, calls: [], proposals: [] };
    const req: AiChatRequest = { purpose: CHAT_PURPOSE, system: systemPrompt(name.zh), messages, tools: this.tools.build(ctx, state), userId: ctx.userId, ...(onText ? { onText } : {}) };
    this.runs.set(req, state);
    let result: AiChatResult;
    try {
      result = await this.ai.chat(req);
    } catch (err) {
      if (err instanceof AiProviderError) throw new AppError(assistantErrors.ASSISTANT_AI_UNAVAILABLE, { reason: err.message });
      throw err;
    } finally {
      this.runs.delete(req);
    }
    const answer = this.assemble(result.text, state, name.zh);
    const now = this.clock.now();
    const mode = state.external ? this.ai.name : "offline";
    const saved = await inTransaction(this.db, this.events, async (tx) => {
      const base = conversation.messageCount;
      const question = (await tx.insert(aiMessages).values({ conversationId: id, seq: base + 1, role: "user", content: { text: input.content, ...(input.context ? { context: input.context } : {}) }, createdAt: now }).returning())[0]!;
      const reply = (
        await tx
          .insert(aiMessages)
          .values({ conversationId: id, seq: base + 2, role: "assistant", content: { answer, toolCalls: latestCalls(state.calls).map((c) => ({ tool: c.tool, input: c.input })), mode }, createdAt: now })
          .returning()
      )[0]!;
      if (state.proposals.length) {
        await tx.insert(aiProposals).values(state.proposals.map((p) => ({ id: p.id, userId: ctx.userId, conversationId: id, messageId: reply.id, kind: p.kind, payload: p.payload, preview: p.preview, status: "PENDING", createdAt: now })));
      }
      const title = conversation.title === NEW_TITLE && base === 0 ? input.content.replace(/\s+/g, " ").slice(0, 40) : conversation.title;
      const updated = (await tx.update(aiConversations).set({ title, messageCount: sql`${aiConversations.messageCount} + 2`, updatedAt: now }).where(eq(aiConversations.id, id)).returning())[0]!;
      await tx.insert(aiUsage).values({ userId: ctx.userId, purpose: QUESTION_PURPOSE, model: mode, inputTokens: 0, outputTokens: 0, createdAt: now });
      return { question, reply, updated };
    });
    const proposals = new Map((answer.proposals ?? []).map((p) => [p.id, p]));
    return { conversation: toConversation(saved.updated), question: toMessage(saved.question, proposals), answer: toMessage(saved.reply, proposals) };
  }

  async confirmProposal(ctx: AccessContext, id: string, input: z.infer<typeof proposalDecisionSchema>): Promise<ProposalDto> {
    const row = await this.ownProposal(ctx, id);
    if (row.status !== "PENDING") throw illegalTransition(row.status, "confirm");
    if (row.version !== input.version) throw versionConflict();
    if (row.kind === "TODO") return this.confirmTodo(ctx, row);
    return this.confirmCollection(ctx, row);
  }

  async rejectProposal(ctx: AccessContext, id: string, input: z.infer<typeof proposalDecisionSchema>): Promise<ProposalDto> {
    const row = await this.ownProposal(ctx, id);
    if (row.status !== "PENDING") throw illegalTransition(row.status, "reject");
    if (row.version !== input.version) throw versionConflict();
    const updated = await inTransaction(this.db, this.events, async (tx) => {
      const next = await this.transition(tx, row, "REJECTED", { message: "已放弃，未执行任何操作", link: null });
      await this.audit.log(ctx, { action: "assistant.proposal.reject", objectType: "aiProposal", objectId: row.id, diff: { status: { from: row.status, to: "REJECTED" }, source: { from: null, to: "AI 助手" }, conversationId: { from: null, to: row.conversationId } } }, tx);
      return next;
    });
    return toProposal(updated);
  }

  async purgeExpired(): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - RETENTION_DAYS * 86_400_000);
    const expired = await this.db.select({ id: aiConversations.id }).from(aiConversations).where(lt(aiConversations.updatedAt, cutoff));
    if (!expired.length) return 0;
    const ids = expired.map((e) => e.id);
    await this.db.transaction(async (tx) => {
      await tx.delete(aiMessages).where(inArray(aiMessages.conversationId, ids));
      await tx.delete(aiProposals).where(and(inArray(aiProposals.conversationId, ids), eq(aiProposals.status, "PENDING")));
      await tx.delete(aiConversations).where(inArray(aiConversations.id, ids));
    });
    return ids.length;
  }

  private async confirmTodo(ctx: AccessContext, row: ProposalRow): Promise<ProposalDto> {
    requirePermission(ctx, "todo.todo.view");
    const p = row.payload as TodoPayload;
    const allowed = await this.tools.assignableUsers(ctx);
    if (!allowed.some((u) => u.id === p.assigneeId)) throw new AppError(assistantErrors.ASSISTANT_ASSIGNEE_NOT_ALLOWED);
    const updated = await inTransaction(this.db, this.events, async (tx) => {
      const next = await this.transition(tx, row, "CONFIRMED", { message: `已创建待办「${p.title}」，负责人 ${p.assigneeName}`, link: "/todo" });
      await this.todos.upsert(
        {
          fingerprint: `ai:${row.id}`,
          source: "AI",
          action: "assistant.todo",
          title: p.title,
          description: p.note,
          docType: p.orderId ? "order" : null,
          docId: p.orderId,
          docNo: p.poNo,
          link: p.orderId ? `/orders/${p.orderId}` : null,
          customerId: p.customerId,
          assigneeId: p.assigneeId,
          dueAt: p.dueDate ? new Date(`${p.dueDate}T10:00:00.000Z`) : null,
        },
        tx,
      );
      await this.audit.log(
        ctx,
        {
          action: "assistant.proposal.confirm",
          objectType: "aiProposal",
          objectId: row.id,
          docNo: p.poNo,
          diff: { source: { from: null, to: "AI 助手" }, kind: { from: null, to: row.kind }, conversationId: { from: null, to: row.conversationId }, title: { from: null, to: p.title }, assigneeId: { from: null, to: p.assigneeId }, dueDate: { from: null, to: p.dueDate } },
        },
        tx,
      );
      return next;
    });
    return toProposal(updated);
  }

  private async confirmCollection(ctx: AccessContext, row: ProposalRow): Promise<ProposalDto> {
    requirePermission(ctx, "receivable.collection.log");
    const p = row.payload as CollectionPayload;
    const claimed = await inTransaction(this.db, this.events, (tx) => this.transition(tx, row, "CONFIRMED", null));
    try {
      await this.receivables.logCollection(ctx, p.receivableId, { channel: p.channel, result: p.result, note: p.note, nextFollowUp: p.nextFollowUp });
    } catch (err) {
      await this.db.update(aiProposals).set({ status: "PENDING", decidedAt: null, version: claimed.version + 1 }).where(and(eq(aiProposals.id, row.id), eq(aiProposals.version, claimed.version)));
      throw err;
    }
    const updated = await inTransaction(this.db, this.events, async (tx) => {
      const done = (await tx.update(aiProposals).set({ result: { message: `已记录 ${p.docNo} 的催收`, link: `/receivables/${p.receivableId}` } }).where(eq(aiProposals.id, row.id)).returning())[0]!;
      await this.audit.log(
        ctx,
        {
          action: "assistant.proposal.confirm",
          objectType: "aiProposal",
          objectId: row.id,
          docNo: p.docNo,
          diff: { source: { from: null, to: "AI 助手" }, kind: { from: null, to: row.kind }, conversationId: { from: null, to: row.conversationId }, channel: { from: null, to: p.channel }, result: { from: null, to: p.result } },
        },
        tx,
      );
      return done;
    });
    return toProposal(updated);
  }

  private async transition(tx: DbOrTx, row: ProposalRow, status: ProposalStatus, result: { message: string; link: string | null } | null): Promise<ProposalRow> {
    const updated = (
      await tx
        .update(aiProposals)
        .set({ status, result, decidedAt: this.clock.now(), version: row.version + 1 })
        .where(and(eq(aiProposals.id, row.id), eq(aiProposals.version, row.version), eq(aiProposals.status, "PENDING")))
        .returning()
    )[0];
    if (!updated) throw versionConflict();
    return updated;
  }

  private assemble(modelText: string, state: RunState, name: string): AssistantAnswer {
    const { cards, sources, actions } = present(state.calls);
    let text = modelText.trim();
    if (!text) text = latestCalls(state.calls).map((c) => describe(c.output)).join("\n\n") || EXAMPLES_TEXT;
    const excluded = excludedCount(state.calls);
    if (excluded > 0) {
      text += `\n\n注：有 ${excluded} 条数据所属客户设置为不参与 AI 分析，未纳入本次回答。`;
      cards.push({ type: "highlight", tone: "info", label: "有数据未纳入", value: `${excluded} 条数据所属客户不参与 AI 分析`, link: null });
    }
    if (!sources.length) sources.push({ module: "assistant", label: `${name} · 未读取业务数据`, asOf: this.clock.now().toISOString() });
    const proposals = state.proposals.map((d) => draftToDto(d.id, d.kind, d.preview));
    return assistantAnswerSchema.parse({ text, cards, sources, actions, ...(proposals.length ? { proposals } : {}) });
  }

  private async offline(req: AiChatRequest): Promise<AiChatResult> {
    const state = this.runs.get(req);
    if (!state) return { text: EXAMPLES_TEXT, toolCalls: [] };
    state.external = false;
    const byName = new Map((req.tools ?? []).map((t) => [t.name, t]));
    const steps = plan(state.question, state.context, this.clock.today());
    const parts: string[] = steps.prefix ? [steps.prefix] : [];
    const toolCalls: AiChatResult["toolCalls"] = [];
    const run = async (name: string, input: Record<string, unknown>): Promise<ToolOutput | null> => {
      const tool = byName.get(name);
      if (!tool) return null;
      const output = (await tool.run(input)) as ToolOutput;
      toolCalls.push({ name, input, output });
      return output;
    };
    const emptyKb = (o: ToolOutput | null) => o?.tool === "search_kb" && !o.denied && !o.hits.length;
    let unanswered = steps.fallback;
    for (const call of steps.calls) {
      const output = await run(call.tool, call.input);
      if (emptyKb(output)) unanswered = true;
      else if (output) parts.push(describe(output));
    }
    if (steps.fallback) {
      const output = await run("search_kb", { query: state.question });
      if (output && !emptyKb(output) && !output.denied) {
        parts.push(describe(output));
        unanswered = false;
      } else state.calls = state.calls.filter((c) => c.output !== output);
    }
    if (unanswered && !parts.length) {
      state.calls = state.calls.filter((c) => !emptyKb(c.output));
      parts.push(EXAMPLES_TEXT);
    }
    return { text: parts.join("\n\n"), toolCalls };
  }

  private async history(conversationId: string): Promise<AiChatMessage[]> {
    const rows = await this.db.select().from(aiMessages).where(eq(aiMessages.conversationId, conversationId)).orderBy(desc(aiMessages.seq), desc(aiMessages.createdAt)).limit(HISTORY_LIMIT);
    const out: AiChatMessage[] = rows.reverse().map((r) => ({ role: r.role === "assistant" ? "assistant" : "user", content: r.role === "assistant" ? ((r.content as AssistantContent).answer?.text ?? "") : ((r.content as UserContent).text ?? "") }));
    while (out.length && out[0]!.role !== "user") out.shift();
    return out;
  }

  private async ownConversation(ctx: AccessContext, id: string): Promise<ConversationRow> {
    return assertFound((await this.db.select().from(aiConversations).where(and(eq(aiConversations.id, id), eq(aiConversations.userId, ctx.userId))))[0]);
  }

  private async ownProposal(ctx: AccessContext, id: string): Promise<ProposalRow> {
    return assertFound((await this.db.select().from(aiProposals).where(and(eq(aiProposals.id, id), eq(aiProposals.userId, ctx.userId))))[0]);
  }

  private async param(key: string): Promise<unknown> {
    return (await this.db.select().from(systemParams).where(eq(systemParams.key, key)))[0]?.value;
  }

  private async quotaLimit(): Promise<number> {
    const value = Number(await this.param("ai.dailyQuotaPerUser"));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_QUOTA;
  }

  private async assistantName(): Promise<{ zh: string; en: string }> {
    const value = await this.param("assistant.name");
    if (typeof value === "string" && value.trim()) return { zh: value, en: value };
    if (value && typeof value === "object" && "zh" in value) {
      const v = value as { zh?: unknown; en?: unknown };
      const zh = typeof v.zh === "string" && v.zh.trim() ? v.zh : DEFAULT_NAME.zh;
      return { zh, en: typeof v.en === "string" && v.en.trim() ? v.en : zh };
    }
    return DEFAULT_NAME;
  }

  private async usedToday(userId: string): Promise<number> {
    const start = new Date(`${this.clock.today()}T00:00:00.000Z`);
    const row = (await this.db.select({ n: sql<number>`cast(count(*) as int)` }).from(aiUsage).where(and(eq(aiUsage.userId, userId), eq(aiUsage.purpose, QUESTION_PURPOSE), gte(aiUsage.createdAt, start))))[0];
    return row?.n ?? 0;
  }
}

function draftToDto(id: string, kind: ProposalKind, preview: ProposalPreview): ProposalDto {
  return { id, kind, title: preview.title, summary: preview.summary, targets: preview.targets, fields: preview.fields, status: "PENDING", version: 1, result: null, decidedAt: null };
}

function toProposal(row: ProposalRow): ProposalDto {
  const preview = row.preview as ProposalPreview;
  const result = row.result as { message?: unknown; link?: unknown } | null;
  return {
    id: row.id,
    kind: row.kind as ProposalKind,
    title: preview.title,
    summary: preview.summary,
    targets: preview.targets,
    fields: preview.fields,
    status: row.status as ProposalStatus,
    version: row.version,
    result: result && typeof result.message === "string" ? { message: result.message, link: typeof result.link === "string" ? result.link : null } : null,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
  };
}

function toConversation(row: ConversationRow): ConversationDto {
  return { id: row.id, title: row.title, messageCount: row.messageCount, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function toMessage(row: MessageRow, proposals: Map<string, ProposalDto>): AssistantMessageDto {
  if (row.role !== "assistant") return { id: row.id, role: "user", text: (row.content as UserContent).text ?? "", answer: null, createdAt: row.createdAt.toISOString() };
  const stored = (row.content as AssistantContent).answer;
  const answer: AssistantAnswer = stored.proposals?.length ? { ...stored, proposals: stored.proposals.map((p) => proposals.get(p.id) ?? p) } : stored;
  return { id: row.id, role: "assistant", text: answer.text, answer, createdAt: row.createdAt.toISOString() };
}

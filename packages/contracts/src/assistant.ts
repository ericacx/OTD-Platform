import type { StatusOf } from "@otd/shared";
import { z } from "zod";
import { labelSchema } from "./common.js";
import { defineErrors } from "./errors.js";

export const assistantErrors = defineErrors({
  ASSISTANT_QUOTA_EXCEEDED: { status: 429, zh: "今日助手调用次数已达上限（{limit} 次），请明天再试", en: "Daily assistant quota reached ({limit}), please try again tomorrow" },
  ASSISTANT_AI_UNAVAILABLE: { status: 502, zh: "AI 服务暂时不可用：{reason}", en: "AI service unavailable: {reason}" },
  ASSISTANT_ASSIGNEE_NOT_ALLOWED: { status: 422, zh: "只能给自己或下属建待办", en: "To-dos can only be assigned to yourself or your team" },
});

export const PROPOSAL_STATUSES = ["PENDING", "CONFIRMED", "REJECTED"] as const satisfies readonly StatusOf<"aiProposal">[];
export const proposalStatusSchema = z.enum(PROPOSAL_STATUSES);
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;

export const PROPOSAL_KINDS = ["TODO", "COLLECTION_LOG"] as const;
export const proposalKindSchema = z.enum(PROPOSAL_KINDS);
export type ProposalKind = z.infer<typeof proposalKindSchema>;

export const cardToneSchema = z.enum(["info", "success", "warning", "danger"]);

export const kpiItemSchema = z.object({
  label: z.string(),
  value: z.number(),
  unit: z.string().nullable(),
  format: z.enum(["int", "decimal", "money", "percent"]),
  currency: z.string().nullable(),
  link: z.string().nullable(),
});

export const kpisCardSchema = z.object({ type: z.literal("kpis"), title: z.string().nullable(), items: z.array(kpiItemSchema) });

export const highlightCardSchema = z.object({
  type: z.literal("highlight"),
  tone: cardToneSchema,
  label: z.string(),
  value: z.string().nullable(),
  link: z.string().nullable(),
});

export const barCardSchema = z.object({
  type: z.literal("bar"),
  title: z.string(),
  unit: z.string().nullable(),
  items: z.array(z.object({ label: z.string(), value: z.number(), display: z.string(), link: z.string().nullable() })),
});

export const lineCardSchema = z.object({
  type: z.literal("line"),
  title: z.string(),
  unit: z.string().nullable(),
  points: z.array(z.object({ label: z.string(), value: z.number() })),
  average: z.number(),
});

export const tableCardSchema = z.object({
  type: z.literal("table"),
  title: z.string().nullable(),
  columns: z.array(z.object({ key: z.string(), label: z.string(), align: z.enum(["left", "right"]) })),
  rows: z.array(z.object({ cells: z.record(z.string(), z.union([z.string(), z.number(), z.null()])), link: z.string().nullable(), tone: cardToneSchema.nullable() })),
});

export const timelineNodeSchema = z.object({
  code: z.string(),
  name: z.string(),
  state: z.enum(["NOT_STARTED", "IN_PROGRESS", "DONE", "BLOCKED", "NOT_APPLICABLE"]),
  gate: z.enum(["G1", "G2"]).nullable(),
  summary: z.string(),
  blockedReasons: z.array(z.string()),
  link: z.string().nullable(),
});

export const timelineCardSchema = z.object({
  type: z.literal("timeline"),
  title: z.string(),
  headline: z.string(),
  completedCount: z.number().int(),
  total: z.number().int(),
  currentNode: z.string().nullable(),
  nodes: z.array(timelineNodeSchema),
  link: z.string().nullable(),
});

export const assistantCardSchema = z.discriminatedUnion("type", [kpisCardSchema, highlightCardSchema, barCardSchema, lineCardSchema, tableCardSchema, timelineCardSchema]);
export type AssistantCard = z.infer<typeof assistantCardSchema>;
export type KpisCard = z.infer<typeof kpisCardSchema>;
export type HighlightCard = z.infer<typeof highlightCardSchema>;
export type BarCard = z.infer<typeof barCardSchema>;
export type LineCard = z.infer<typeof lineCardSchema>;
export type TableCard = z.infer<typeof tableCardSchema>;
export type TimelineCard = z.infer<typeof timelineCardSchema>;

export const assistantSourceSchema = z.object({ module: z.string(), label: z.string(), asOf: z.string() });
export type AssistantSource = z.infer<typeof assistantSourceSchema>;

export const assistantActionSchema = z.object({ label: z.string(), link: z.string() });
export type AssistantAction = z.infer<typeof assistantActionSchema>;

export const proposalSchema = z.object({
  id: z.string(),
  kind: proposalKindSchema,
  title: z.string(),
  summary: z.string(),
  targets: z.array(z.object({ type: z.string(), id: z.string().nullable(), label: z.string(), link: z.string().nullable() })),
  fields: z.array(z.object({ label: z.string(), value: z.string() })),
  status: proposalStatusSchema,
  version: z.number().int(),
  result: z.object({ message: z.string(), link: z.string().nullable() }).nullable(),
  decidedAt: z.string().nullable(),
});
export type ProposalDto = z.infer<typeof proposalSchema>;

export const assistantAnswerSchema = z.object({
  text: z.string(),
  cards: z.array(assistantCardSchema),
  sources: z.array(assistantSourceSchema).min(1),
  actions: z.array(assistantActionSchema),
  proposals: z.array(proposalSchema).optional(),
});
export type AssistantAnswer = z.infer<typeof assistantAnswerSchema>;

export const assistantMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  answer: assistantAnswerSchema.nullable(),
  createdAt: z.string(),
});
export type AssistantMessageDto = z.infer<typeof assistantMessageSchema>;

export const conversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  messageCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ConversationDto = z.infer<typeof conversationSchema>;

export const assistantReplySchema = z.object({
  conversation: conversationSchema,
  question: assistantMessageSchema,
  answer: assistantMessageSchema,
});
export type AssistantReplyDto = z.infer<typeof assistantReplySchema>;

export const assistantProfileSchema = z.object({
  name: labelSchema,
  examples: z.array(z.string()),
  mode: z.enum(["online", "offline"]),
  quota: z.object({ limit: z.number().int(), used: z.number().int() }),
});
export type AssistantProfileDto = z.infer<typeof assistantProfileSchema>;

export const pageContextSchema = z.object({
  path: z.string().trim().max(300).optional(),
  docType: z.string().trim().max(40).optional(),
  docId: z.string().trim().max(60).optional(),
  docNo: z.string().trim().max(60).optional(),
});
export type PageContext = z.infer<typeof pageContextSchema>;

export const conversationCreateSchema = z.object({ title: z.string().trim().min(1).max(100).optional() });

export const messageCreateSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  context: pageContextSchema.optional(),
});

export const proposalDecisionSchema = z.object({ version: z.number().int().min(1) });

export const ASSISTANT_EXAMPLES = [
  "现在手上有多少张客户订单？按客户分布如何？",
  "今天有哪些需要我跟进的事",
  "PO0010459 到哪一步了",
  "逾期应收有哪些",
  "产能哪里紧张",
  "巡检红灯有哪些",
  "什么是 QRS",
  "帮我建个待办：明天跟进 PO0010459 客户确认",
] as const;

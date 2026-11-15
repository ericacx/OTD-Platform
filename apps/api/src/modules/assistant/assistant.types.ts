import type { AssistantSource, PageContext, ProposalKind } from "@otd/contracts/assistant";
import type { SearchType } from "@otd/contracts/mainline";

export const TOOL_ORDER = [
  "order_stats",
  "order_status",
  "my_todos",
  "receivables_summary",
  "capacity_summary",
  "patrol_hits",
  "quote_summary",
  "search_kb",
  "search_docs",
  "propose_todo",
  "propose_collection_log",
] as const;
export type ToolName = (typeof TOOL_ORDER)[number];

type Base<N extends ToolName> = { tool: N; source: AssistantSource; excluded: number; denied: string | null };

export type OrderStatsOutput = Base<"order_stats"> & {
  scope: string;
  totals: { orders: number; pairs: number; valueUsd: number; inProduction: number; pendingConfirm: number; toSchedule: number; toShip: number; customers: number; overdue: number };
  byCustomer: { customerId: string; customerName: string; orders: number; pairs: number; share: number }[];
  weeks: { start: string; label: string; due: number }[];
  weeklyAverage: number;
};

export type OrderStatusOutput = Base<"order_status"> & {
  poNo: string;
  found: boolean;
  order: { id: string; poNo: string; customerName: string; styleSummary: string; totalPairs: number; customerDueDate: string; factoryName: string | null; status: string; statusLabel: string } | null;
  mainline: {
    headline: string;
    completedCount: number;
    total: number;
    currentNode: string | null;
    nodes: { code: string; name: string; state: "NOT_STARTED" | "IN_PROGRESS" | "DONE" | "BLOCKED" | "NOT_APPLICABLE"; gate: "G1" | "G2" | null; summary: string; blockedReasons: string[]; link: string | null }[];
  } | null;
};

export type TodoBrief = { title: string; docNo: string | null; customerName: string | null; dueAt: string | null; overdueDays: number; link: string | null };
export type MyTodosOutput = Base<"my_todos"> & { counts: { total: number; overdue: number; today: number; later: number }; overdue: TodoBrief[]; today: TodoBrief[]; later: TodoBrief[] };

export type ReceivableBrief = { id: string; docNo: string; customerName: string; currency: string; outstanding: number; outstandingUsd: number; dueDate: string; overdueDays: number; link: string };
export type ReceivablesOutput = Base<"receivables_summary"> & {
  totals: { overdueCount: number; overdueUsd: number; avgOverdueDays: number; dueThisMonthCount: number; dueThisMonthUsd: number; openCount: number; openUsd: number };
  byCustomer: { customerName: string; count: number; usd: number }[];
  overdue: ReceivableBrief[];
  dueThisMonth: ReceivableBrief[];
};

export type CapacityRowBrief = { baseName: string; needleCode: string | null; spareRate: number | null; spareCapacity: number | null; unproducedQty: number | null; cumulativeCapacity: number | null; tight: boolean };
export type CapacityOutput = Base<"capacity_summary"> & {
  found: boolean;
  versionLabel: string | null;
  kpis: { groupSpareWan: number; avgSpareRate: number; tightCount: number; tightThreshold: number } | null;
  tight: CapacityRowBrief[];
  lowest: CapacityRowBrief[];
};

export type PatrolHitBrief = { light: string; severity: string; ruleCode: string; ruleName: string; module: string; targetNo: string | null; targetName: string | null; message: string; overdueDays: number; link: string };
export type PatrolOutput = Base<"patrol_hits"> & { red: number; yellow: number; byModule: { module: string; label: string; count: number }[]; hits: PatrolHitBrief[] };

export type QuoteBrief = {
  quoteId: string;
  styleNo: string;
  customerName: string;
  status: string;
  rounds: { docNo: string; kind: string; roundNo: number; status: string; priceUsd: number; priceCny: number; quantity: number; quotedAt: string | null; costTotal?: number | null; margin?: number; guardrailPassed?: boolean }[];
  targetPriceUsd?: number | null;
  costTotal?: number | null;
  link: string;
};
export type QuoteOutput = Base<"quote_summary"> & { keyword: string; costVisible: boolean; quotes: QuoteBrief[] };

export type KbHit = { id: string; title: string; kind: string; customerName: string | null; snippet: string; link: string; updatedAt: string };
export type KbOutput = Base<"search_kb"> & { query: string; terms: string[]; hits: KbHit[] };

export type DocHit = { type: SearchType; typeLabel: string; docNo: string; title: string; link: string };
export type DocsOutput = Base<"search_docs"> & { query: string; results: DocHit[] };

export type ProposalPreview = {
  title: string;
  summary: string;
  targets: { type: string; id: string | null; label: string; link: string | null }[];
  fields: { label: string; value: string }[];
};
export type ProposalDraft = { id: string; kind: ProposalKind; payload: Record<string, unknown>; preview: ProposalPreview };
export type ProposalOutput = Base<"propose_todo" | "propose_collection_log"> & { ok: boolean; message: string; proposalId: string | null; preview: ProposalPreview | null };

export type ToolOutput = OrderStatsOutput | OrderStatusOutput | MyTodosOutput | ReceivablesOutput | CapacityOutput | PatrolOutput | QuoteOutput | KbOutput | DocsOutput | ProposalOutput;

export type ToolCallRecord = { tool: ToolName; input: Record<string, unknown>; output: ToolOutput };

export type RunState = {
  external: boolean;
  question: string;
  context: PageContext | null;
  calls: ToolCallRecord[];
  proposals: ProposalDraft[];
};

import { boolean, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { auditColumns, id, money, ts } from "./_common.js";

export const nodeStateSnapshots = pgTable(
  "node_state_snapshots",
  {
    orderId: uuid().notNull(),
    nodeCode: text().notNull(),
    state: text().notNull(),
    enteredAt: ts(),
    completedAt: ts(),
    assigneeId: uuid(),
    blockedReasons: jsonb().$type<string[]>().notNull().default([]),
    summary: text(),
    computedAt: ts().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orderId, t.nodeCode] }), index().on(t.nodeCode, t.state)],
);

export const todos = pgTable(
  "todos",
  {
    id: id(),
    source: text().notNull(),
    action: text().notNull(),
    title: text().notNull(),
    description: text(),
    docType: text(),
    docId: text(),
    docNo: text(),
    link: text(),
    customerId: uuid(),
    assigneeId: uuid().notNull(),
    dueAt: ts(),
    status: text().notNull().default("OPEN"),
    fingerprint: text(),
    doneAt: ts(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.assigneeId, t.status, t.dueAt), uniqueIndex().on(t.fingerprint)],
);

export const patrolRules = pgTable("patrol_rules", {
  id: id(),
  code: text().notNull().unique(),
  module: text().notNull(),
  ruleType: text().notNull(),
  name: text().notNull(),
  nameEn: text(),
  targetType: text().notNull(),
  params: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  severity: text().notNull(),
  assigneeRole: text().notNull(),
  yellowWindowDays: integer().notNull().default(2),
  enabled: boolean().notNull().default(true),
  customerIds: jsonb().$type<string[]>(),
  description: text(),
  ...auditColumns,
});

export const patrolRuns = pgTable("patrol_runs", {
  id: id(),
  docNo: text().notNull().unique(),
  trigger: text().notNull(),
  startedAt: ts().notNull().defaultNow(),
  finishedAt: ts(),
  durationMs: integer(),
  ruleCount: integer().notNull().default(0),
  hitCount: integer().notNull().default(0),
  redCount: integer().notNull().default(0),
  yellowCount: integer().notNull().default(0),
  greenModules: jsonb().$type<string[]>().notNull().default([]),
  triggeredBy: uuid(),
});

export const patrolHits = pgTable(
  "patrol_hits",
  {
    id: id(),
    ruleId: uuid().notNull(),
    lastRunId: uuid().notNull(),
    module: text().notNull(),
    targetType: text().notNull(),
    targetId: text().notNull(),
    targetNo: text(),
    targetName: text(),
    light: text().notNull(),
    severity: text().notNull(),
    message: jsonb().$type<{ zh: string; en: string }>().notNull(),
    overdueDays: integer().notNull().default(0),
    assigneeId: uuid(),
    customerId: uuid(),
    status: text().notNull().default("OPEN"),
    fingerprint: text().notNull(),
    firstSeenAt: ts().notNull().defaultNow(),
    lastSeenAt: ts().notNull().defaultNow(),
    closedAt: ts(),
  },
  (t) => [index().on(t.status, t.light), index().on(t.fingerprint)],
);

export const metricSnapshots = pgTable(
  "metric_snapshots",
  {
    id: id(),
    metric: text().notNull(),
    scopeKey: text().notNull(),
    period: text().notNull(),
    value: money().notNull(),
    computedAt: ts().notNull().defaultNow(),
  },
  (t) => [uniqueIndex().on(t.metric, t.scopeKey, t.period)],
);

export type DiagnosisItem = { level: "PRIORITY" | "WATCH"; title: string; basis: string; suggestion: string };

export const diagnoses = pgTable(
  "diagnoses",
  {
    id: id(),
    board: text().notNull(),
    scopeKey: text().notNull(),
    period: text().notNull(),
    summary: text().notNull(),
    items: jsonb().$type<DiagnosisItem[]>().notNull(),
    model: text(),
    generatedAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.board, t.scopeKey, t.period)],
);

export type MappingField = { source: string; target: string; transform?: string; args?: Record<string, unknown>; required?: boolean };

export const syncEndpoints = pgTable("sync_endpoints", {
  id: id(),
  code: text().notNull().unique(),
  name: text().notNull(),
  kind: text().notNull(),
  customerId: uuid(),
  protocol: text().notNull(),
  baseUrl: text(),
  credential: jsonb().$type<Record<string, string>>(),
  status: text().notNull().default("ACTIVE"),
  ownerId: uuid(),
  ...auditColumns,
});

export const syncMappings = pgTable("sync_mappings", {
  id: id(),
  endpointId: uuid().notNull(),
  object: text().notNull(),
  direction: text().notNull(),
  fields: jsonb().$type<MappingField[]>().notNull().default([]),
  codeMaps: jsonb().$type<Record<string, Record<string, string>>>().notNull().default({}),
  enabled: boolean().notNull().default(true),
  ...auditColumns,
});

export const syncTasks = pgTable("sync_tasks", {
  id: id(),
  docNo: text().notNull().unique(),
  name: text().notNull(),
  endpointId: uuid().notNull(),
  mappingId: uuid(),
  customerId: uuid(),
  object: text().notNull(),
  direction: text().notNull(),
  mode: text().notNull(),
  trigger: text().notNull(),
  frequency: text(),
  intervalMinutes: integer(),
  ownerId: uuid(),
  lastRunAt: ts(),
  nextRunAt: ts(),
  lastStatus: text(),
  watermark: text(),
  enabled: boolean().notNull().default(true),
  note: text(),
  ...auditColumns,
});

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: id(),
    taskId: uuid().notNull(),
    trigger: text().notNull(),
    startedAt: ts().notNull().defaultNow(),
    finishedAt: ts(),
    status: text().notNull(),
    total: integer().notNull().default(0),
    success: integer().notNull().default(0),
    failed: integer().notNull().default(0),
    skipped: integer().notNull().default(0),
    steps: jsonb().$type<{ key: string; at: string; ok: boolean }[]>().notNull().default([]),
    operatorId: uuid(),
  },
  (t) => [index().on(t.taskId)],
);

export const syncBatches = pgTable(
  "sync_batches",
  {
    id: id(),
    runId: uuid().notNull(),
    batchNo: text().notNull(),
    object: text().notNull(),
    startedAt: ts().notNull().defaultNow(),
    durationMs: integer().notNull().default(0),
    total: integer().notNull().default(0),
    success: integer().notNull().default(0),
    failed: integer().notNull().default(0),
    skipped: integer().notNull().default(0),
    status: text().notNull(),
  },
  (t) => [index().on(t.runId)],
);

export const syncRecords = pgTable(
  "sync_records",
  {
    id: id(),
    taskId: uuid().notNull(),
    runId: uuid().notNull(),
    batchId: uuid(),
    recordKey: text().notNull(),
    field: text(),
    errorType: text(),
    errorMessage: text(),
    suggestion: text(),
    payload: jsonb().$type<Record<string, unknown>>(),
    status: text().notNull(),
    attempts: integer().notNull().default(1),
    nextRetryAt: ts(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.taskId, t.status)],
);

export const syncLinks = pgTable(
  "sync_links",
  {
    endpointId: uuid().notNull(),
    object: text().notNull(),
    localId: text().notNull(),
    remoteId: text().notNull(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.endpointId, t.object, t.localId] })],
);

export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: id(),
    userId: uuid().notNull(),
    title: text().notNull(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.updatedAt)],
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: id(),
    conversationId: uuid().notNull(),
    role: text().notNull(),
    content: jsonb().$type<unknown>().notNull(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.conversationId)],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: id(),
    userId: uuid(),
    purpose: text().notNull(),
    model: text().notNull(),
    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.createdAt)],
);

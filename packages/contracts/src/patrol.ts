import { z } from "zod";
import { csv, labelSchema, pageQuerySchema } from "./common.js";
import { defineErrors } from "./errors.js";

export const patrolErrors = defineErrors({
  PATROL_NOTE_REQUIRED: { status: 422, zh: "关闭命中须填写处理说明", en: "A note is required to close the hit" },
  PATROL_PARAM_INVALID: { status: 422, zh: "规则参数「{key}」不合法", en: "Invalid rule parameter {key}" },
  PATROL_RULE_TYPE_UNKNOWN: { status: 409, zh: "规则类型「{ruleType}」没有实现", en: "Rule type {ruleType} is not implemented" },
});

export const patrolLightSchema = z.enum(["RED", "YELLOW"]);
export type PatrolLight = z.infer<typeof patrolLightSchema>;
export const patrolSeveritySchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export type PatrolSeverity = z.infer<typeof patrolSeveritySchema>;
export const patrolHitStatusSchema = z.enum(["OPEN", "HANDLING", "CLOSED"]);
export type PatrolHitStatus = z.infer<typeof patrolHitStatusSchema>;
export const patrolTriggerSchema = z.enum(["AUTO", "MANUAL"]);
export type PatrolTrigger = z.infer<typeof patrolTriggerSchema>;
export const patrolJudgeKindSchema = z.enum(["DWELL", "DEADLINE", "MISSING"]);
export type PatrolJudgeKind = z.infer<typeof patrolJudgeKindSchema>;

export const patrolHitSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  ruleCode: z.string(),
  ruleName: labelSchema,
  ruleType: z.string(),
  module: z.string(),
  moduleLabel: labelSchema,
  targetType: z.string(),
  targetId: z.string(),
  targetNo: z.string().nullable(),
  targetName: z.string().nullable(),
  docType: z.string().nullable(),
  docId: z.string().nullable(),
  link: z.string().nullable(),
  light: patrolLightSchema,
  severity: patrolSeveritySchema,
  message: labelSchema,
  overdueDays: z.number().int(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  assigneeRole: z.string().nullable(),
  assigneeRoleLabel: labelSchema.nullable(),
  customerId: z.string().nullable(),
  customerName: z.string().nullable(),
  status: patrolHitStatusSchema,
  closeReason: z.enum(["RESOLVED", "MANUAL"]).nullable(),
  handleNote: z.string().nullable(),
  handledByName: z.string().nullable(),
  handledAt: z.string().nullable(),
  todoId: z.string().nullable(),
  todoOwned: z.boolean(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  closedAt: z.string().nullable(),
  escalatedAt: z.string().nullable(),
  version: z.number().int(),
});
export type PatrolHitDto = z.infer<typeof patrolHitSchema>;

export const patrolRunSchema = z.object({
  id: z.string(),
  docNo: z.string(),
  trigger: patrolTriggerSchema,
  status: z.enum(["RUNNING", "DONE", "FAILED"]),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  ruleCount: z.number().int(),
  hitCount: z.number().int(),
  redCount: z.number().int(),
  yellowCount: z.number().int(),
  scannedModules: z.array(z.string()),
  greenModules: z.array(z.string()),
  ruleStats: z.record(z.string(), z.object({ hits: z.number().int(), red: z.number().int(), yellow: z.number().int() })),
  triggeredBy: z.string().nullable(),
  triggeredByName: z.string().nullable(),
  error: z.string().nullable(),
});
export type PatrolRunDto = z.infer<typeof patrolRunSchema>;

export const patrolRunResultSchema = patrolRunSchema.extend({ alreadyRunning: z.boolean() });
export type PatrolRunResultDto = z.infer<typeof patrolRunResultSchema>;

export const patrolRuleSchema = z.object({
  id: z.string(),
  code: z.string(),
  module: z.string(),
  moduleLabel: labelSchema,
  ruleType: z.string(),
  kind: patrolJudgeKindSchema.nullable(),
  name: z.string(),
  nameEn: z.string().nullable(),
  targetType: z.string(),
  params: z.record(z.string(), z.number()),
  paramKeys: z.array(z.string()),
  condition: labelSchema,
  severity: patrolSeveritySchema,
  assigneeRole: z.string(),
  assigneeRoleLabel: labelSchema.nullable(),
  yellowWindowDays: z.number().int(),
  enabled: z.boolean(),
  customerIds: z.array(z.string()).nullable(),
  customerNames: z.array(z.string()),
  description: z.string().nullable(),
  openHits: z.number().int(),
  updatedAt: z.string(),
  version: z.number().int(),
});
export type PatrolRuleDto = z.infer<typeof patrolRuleSchema>;

export const patrolDashboardSchema = z.object({
  legend: z.object({
    red: z.number().int(),
    yellow: z.number().int(),
    greenModules: z.number().int(),
    scannedModules: z.number().int(),
    greenModuleCodes: z.array(z.string()),
  }),
  kpis: z.object({
    activeRules: z.number().int(),
    totalRules: z.number().int(),
    coveredModules: z.number().int(),
    hitCount: z.number().int(),
    lastRunAt: z.string().nullable(),
  }),
  lastRun: patrolRunSchema.nullable(),
  previousRun: patrolRunSchema.nullable(),
  running: patrolRunSchema.nullable(),
  modules: z.array(z.object({ code: z.string(), label: labelSchema, open: z.number().int() })),
  hits: z.object({ items: z.array(patrolHitSchema), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() }),
});
export type PatrolDashboardDto = z.infer<typeof patrolDashboardSchema>;

export const patrolHitQuerySchema = pageQuerySchema.extend({
  module: csv,
  light: csv,
  severity: csv,
  status: csv,
  ruleId: z.uuid().optional(),
});
export type PatrolHitQuery = z.infer<typeof patrolHitQuerySchema>;

export const patrolDocHitsQuerySchema = z.object({
  docType: z.string().trim().min(1).max(40),
  docId: z.string().trim().min(1).max(64),
});

export const patrolHitHandleSchema = z.object({
  action: z.enum(["START", "CLOSE"]),
  note: z.string().trim().max(500).optional(),
  version: z.number().int().min(1),
});
export type PatrolHitHandleInput = z.infer<typeof patrolHitHandleSchema>;

export const patrolRuleUpdateSchema = z.object({
  params: z.record(z.string(), z.number().int().min(0).max(3650)).optional(),
  severity: patrolSeveritySchema.optional(),
  yellowWindowDays: z.number().int().min(0).max(90).optional(),
  enabled: z.boolean().optional(),
  customerIds: z.array(z.uuid()).max(200).nullable().optional(),
  reason: z.string().trim().max(200).optional(),
  version: z.number().int().min(1),
});
export type PatrolRuleUpdateInput = z.infer<typeof patrolRuleUpdateSchema>;

export const patrolRunQuerySchema = pageQuerySchema.extend({ trigger: patrolTriggerSchema.optional() });
export type PatrolRunQuery = z.infer<typeof patrolRunQuerySchema>;

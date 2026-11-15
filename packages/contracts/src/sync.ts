import { z } from "zod";
import { csv, pageQuerySchema } from "./common.js";
import { defineErrors } from "./errors.js";

export const syncErrors = defineErrors({
  SYNC_TASK_DISABLED: { status: 409, zh: "同步任务已停用，请先启用", en: "Sync task is disabled" },
  SYNC_TASK_RUNNING: { status: 409, zh: "任务正在执行，请稍后再试", en: "Sync task is already running" },
  SYNC_ENDPOINT_DISABLED: { status: 409, zh: "对端系统「{name}」已停用", en: "Endpoint {name} is disabled" },
  SYNC_MAPPING_MISMATCH: { status: 422, zh: "字段映射与任务的对端、对象或方向不一致", en: "Mapping does not match the task endpoint, object or direction" },
  SYNC_CUSTOMER_REQUIRED: { status: 422, zh: "客户系统必须指定所属客户", en: "Customer systems need a customer" },
  SYNC_BASE_URL_REQUIRED: { status: 422, zh: "{protocol} 对端必须填写地址", en: "{protocol} endpoints need an address" },
  SYNC_INTERVAL_REQUIRED: { status: 422, zh: "定时触发必须设置执行间隔", en: "Scheduled tasks need an interval" },
});

export const SYNC_PLATFORM_NAME = { zh: "OTD 平台", en: "OTD Platform" } as const;
export const SYNC_MAX_RETRIES = 5;
export const SYNC_RETRY_DELAYS_MINUTES = [1, 2, 4, 8, 16] as const;
export const SYNC_DEFAULT_BATCH_SIZE = 100;

export const syncEndpointKindSchema = z.enum(["ERP", "CUSTOMER"]);
export type SyncEndpointKind = z.infer<typeof syncEndpointKindSchema>;
export const syncProtocolSchema = z.enum(["REST", "SFTP", "EMAIL", "MOCK"]);
export type SyncProtocol = z.infer<typeof syncProtocolSchema>;
export const syncEndpointStatusSchema = z.enum(["ACTIVE", "DISABLED"]);
export const syncObjectSchema = z.enum(["ORDER_DUE", "STYLE", "INVENTORY", "TEST_REPORT", "INSPECTION", "TNA"]);
export type SyncObject = z.infer<typeof syncObjectSchema>;
export const syncDirectionSchema = z.enum(["PUSH", "PULL"]);
export type SyncDirection = z.infer<typeof syncDirectionSchema>;
export const syncModeSchema = z.enum(["INCREMENTAL", "FULL"]);
export type SyncMode = z.infer<typeof syncModeSchema>;
export const syncTriggerSchema = z.enum(["SCHEDULED", "MANUAL", "EVENT"]);
export type SyncTrigger = z.infer<typeof syncTriggerSchema>;
export const syncRunStatusSchema = z.enum(["RUNNING", "SUCCESS", "PARTIAL", "FAILED"]);
export type SyncRunStatus = z.infer<typeof syncRunStatusSchema>;
export const syncRecordStatusSchema = z.enum(["SUCCESS", "FAILED", "SKIPPED", "RETRYING"]);
export type SyncRecordStatus = z.infer<typeof syncRecordStatusSchema>;
export const syncQueueStateSchema = z.enum(["PENDING", "MANUAL", "ABANDONED"]);
export type SyncQueueState = z.infer<typeof syncQueueStateSchema>;
export const syncStepKeySchema = z.enum(["START", "RESULT", "LOG"]);

export const syncErrorTypeSchema = z.enum(["TIMEOUT", "REMOTE_UNAVAILABLE", "CONNECTION_FAILED", "FORMAT_MISMATCH", "MAPPING_MISS", "REQUIRED_MISSING", "REMOTE_REJECTED", "UNSUPPORTED"]);
export type SyncErrorType = z.infer<typeof syncErrorTypeSchema>;

type ErrorTypeInfo = { label: { zh: string; en: string }; retryable: boolean; reason: { zh: string; en: string }; suggestion: { zh: string; en: string } };

export const SYNC_ERROR_TYPES: Record<SyncErrorType, ErrorTypeInfo> = {
  TIMEOUT: {
    label: { zh: "接口超时", en: "Timeout" },
    retryable: true,
    reason: { zh: "外部系统 30 秒内未返回结果", en: "No response within 30 s" },
    suggestion: { zh: "链路重试；连续超时需联系对方系统运维", en: "Retry; contact their ops if it keeps timing out" },
  },
  REMOTE_UNAVAILABLE: {
    label: { zh: "对端限流 / 不可用", en: "Remote unavailable" },
    retryable: true,
    reason: { zh: "对端返回 429 / 5xx", en: "Remote returned 429 / 5xx" },
    suggestion: { zh: "等待后自动重试", en: "Wait and retry" },
  },
  CONNECTION_FAILED: {
    label: { zh: "连接失败", en: "Connection failed" },
    retryable: true,
    reason: { zh: "无法连接对端地址", en: "Cannot reach the endpoint" },
    suggestion: { zh: "检查对端地址与网络后重试", en: "Check the address and network" },
  },
  FORMAT_MISMATCH: {
    label: { zh: "格式不符", en: "Format mismatch" },
    retryable: false,
    reason: { zh: "来源日期格式与目标不一致", en: "Source format differs from target" },
    suggestion: { zh: "在转换规则里统一为 YYYY-MM-DD", en: "Normalize to YYYY-MM-DD in the mapping" },
  },
  MAPPING_MISS: {
    label: { zh: "映射未命中", en: "Mapping miss" },
    retryable: false,
    reason: { zh: "码表中没有对应编码", en: "No matching code in the code map" },
    suggestion: { zh: "补充码表后手动重试", en: "Add the code then retry" },
  },
  REQUIRED_MISSING: {
    label: { zh: "必填缺失", en: "Required missing" },
    retryable: false,
    reason: { zh: "必填字段为空", en: "A required field is empty" },
    suggestion: { zh: "补数据后手动重试", en: "Fill in the data then retry" },
  },
  REMOTE_REJECTED: {
    label: { zh: "对端拒收", en: "Rejected" },
    retryable: false,
    reason: { zh: "对端校验未通过", en: "Rejected by the remote system" },
    suggestion: { zh: "按对端返回信息修正后手动重试", en: "Fix per the remote message then retry" },
  },
  UNSUPPORTED: {
    label: { zh: "暂不支持", en: "Unsupported" },
    retryable: false,
    reason: { zh: "该连接方式暂不支持", en: "Protocol not supported yet" },
    suggestion: { zh: "改用 REST 或联系管理员", en: "Use REST or contact the admin" },
  },
};

export function isRetryableError(type: string | null | undefined): boolean {
  return !!type && (SYNC_ERROR_TYPES as Record<string, ErrorTypeInfo>)[type]?.retryable === true;
}

export function syncRetryDelayMinutes(attempts: number): number | null {
  return SYNC_RETRY_DELAYS_MINUTES[attempts - 1] ?? null;
}

export const syncTransformSchema = z.enum(["dateFormat", "codeMap", "enumMap", "unit", "default", "concat", "split", "trim", "number", "required"]);
export type SyncTransform = z.infer<typeof syncTransformSchema>;

export const syncMappingFieldSchema = z.object({
  source: z.string().trim().max(200).default(""),
  target: z.string().trim().min(1).max(120),
  transform: syncTransformSchema.optional(),
  args: z.record(z.string(), z.unknown()).optional(),
  required: z.boolean().optional(),
});
export type SyncMappingField = z.infer<typeof syncMappingFieldSchema>;

export const syncCodeMapsSchema = z.record(z.string().min(1).max(60), z.record(z.string(), z.string()));
export type SyncCodeMaps = z.infer<typeof syncCodeMapsSchema>;

export const syncMappingIssueSchema = z.object({
  field: z.string(),
  source: z.string(),
  type: z.enum(["MAPPING_MISS", "FORMAT_MISMATCH", "REQUIRED_MISSING"]),
  message: z.string(),
  suggestion: z.string(),
});
export type SyncMappingIssue = z.infer<typeof syncMappingIssueSchema>;

export const syncCredentialStateSchema = z.object({
  configured: z.boolean(),
  updatedAt: z.string().nullable(),
  masked: z.record(z.string(), z.string()),
});

export const syncEndpointSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  kind: syncEndpointKindSchema,
  customerId: z.string().nullable(),
  customerName: z.string().nullable(),
  protocol: syncProtocolSchema,
  baseUrl: z.string().nullable(),
  contact: z.string().nullable(),
  timeoutMs: z.number().int(),
  options: z.record(z.string(), z.unknown()),
  status: syncEndpointStatusSchema,
  ownerId: z.string().nullable(),
  ownerName: z.string().nullable(),
  note: z.string().nullable(),
  credential: syncCredentialStateSchema,
  lastTest: z.object({ at: z.string(), ok: z.boolean(), message: z.string().nullable() }).nullable(),
  taskCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int(),
});
export type SyncEndpointDto = z.infer<typeof syncEndpointSchema>;

const endpointBase = {
  name: z.string().trim().min(1).max(80),
  kind: syncEndpointKindSchema,
  customerId: z.uuid().nullable().optional(),
  protocol: syncProtocolSchema,
  baseUrl: z.string().trim().max(300).nullable().optional(),
  contact: z.string().trim().max(120).nullable().optional(),
  timeoutMs: z.number().int().min(1000).max(120_000).default(30_000),
  options: z.record(z.string(), z.unknown()).optional(),
  ownerId: z.uuid().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
};

export const syncEndpointCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/),
  ...endpointBase,
  credential: z.record(z.string().min(1).max(60), z.string().max(4000)).optional(),
});

export const syncEndpointUpdateSchema = z.object({ ...endpointBase, version: z.number().int() });

export const syncCredentialUpdateSchema = z.object({
  credential: z.record(z.string().min(1).max(60), z.string().max(4000)).nullable(),
  version: z.number().int(),
});

export const syncVersionSchema = z.object({ version: z.number().int() });

export const syncEndpointListQuerySchema = pageQuerySchema.extend({
  kind: syncEndpointKindSchema.optional(),
  protocol: syncProtocolSchema.optional(),
  status: syncEndpointStatusSchema.optional(),
  customerId: z.uuid().optional(),
});

export const syncConnectionResultSchema = z.object({ ok: z.boolean(), latencyMs: z.number().int(), message: z.string(), testedAt: z.string() });
export type SyncConnectionResult = z.infer<typeof syncConnectionResultSchema>;

export const syncMappingSchema = z.object({
  id: z.string(),
  name: z.string(),
  endpointId: z.string(),
  endpointName: z.string(),
  object: syncObjectSchema,
  direction: syncDirectionSchema,
  keyField: z.string().nullable(),
  fields: z.array(syncMappingFieldSchema),
  codeMaps: syncCodeMapsSchema,
  enabled: z.boolean(),
  taskCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int(),
});
export type SyncMappingDto = z.infer<typeof syncMappingSchema>;

const mappingBase = {
  name: z.string().trim().min(1).max(80),
  endpointId: z.uuid(),
  object: syncObjectSchema,
  direction: syncDirectionSchema,
  keyField: z.string().trim().max(120).nullable().optional(),
  fields: z.array(syncMappingFieldSchema).max(200),
  codeMaps: syncCodeMapsSchema.default({}),
  enabled: z.boolean().default(true),
};

export const syncMappingCreateSchema = z.object(mappingBase);
export const syncMappingUpdateSchema = z.object({ ...mappingBase, version: z.number().int() });

export const syncMappingListQuerySchema = pageQuerySchema.extend({
  endpointId: z.uuid().optional(),
  object: syncObjectSchema.optional(),
  direction: syncDirectionSchema.optional(),
});

export const syncMappingPreviewSchema = z.object({
  mappingId: z.uuid().optional(),
  object: syncObjectSchema.optional(),
  fields: z.array(syncMappingFieldSchema).max(200).optional(),
  codeMaps: syncCodeMapsSchema.optional(),
  sample: z.record(z.string(), z.unknown()).optional(),
});

export const syncMappingPreviewResultSchema = z.object({
  sample: z.record(z.string(), z.unknown()).nullable(),
  output: z.record(z.string(), z.unknown()),
  errors: z.array(syncMappingIssueSchema),
  ok: z.boolean(),
});
export type SyncMappingPreviewResult = z.infer<typeof syncMappingPreviewResultSchema>;

export const syncStepSchema = z.object({ key: syncStepKeySchema, at: z.string(), ok: z.boolean(), message: z.string().nullable() });
export type SyncStepDto = z.infer<typeof syncStepSchema>;

export const syncBatchSchema = z.object({
  id: z.string(),
  batchNo: z.string(),
  object: syncObjectSchema,
  startedAt: z.string(),
  durationMs: z.number().int(),
  total: z.number().int(),
  success: z.number().int(),
  failed: z.number().int(),
  skipped: z.number().int(),
  status: syncRunStatusSchema,
});
export type SyncBatchDto = z.infer<typeof syncBatchSchema>;

export const syncRunSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  trigger: syncTriggerSchema,
  status: syncRunStatusSchema,
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  total: z.number().int(),
  success: z.number().int(),
  failed: z.number().int(),
  skipped: z.number().int(),
  steps: z.array(syncStepSchema),
  error: z.string().nullable(),
  operatorName: z.string().nullable(),
  batches: z.array(syncBatchSchema),
});
export type SyncRunDto = z.infer<typeof syncRunSchema>;

export const syncRecordSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  taskDocNo: z.string(),
  taskName: z.string(),
  runId: z.string(),
  batchNo: z.string().nullable(),
  recordKey: z.string(),
  field: z.string().nullable(),
  errorType: syncErrorTypeSchema.nullable(),
  errorMessage: z.string().nullable(),
  suggestion: z.string().nullable(),
  status: syncRecordStatusSchema,
  queueState: syncQueueStateSchema.nullable(),
  attempts: z.number().int(),
  nextRetryAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type SyncRecordDto = z.infer<typeof syncRecordSchema>;

export const syncTaskSchema = z.object({
  id: z.string(),
  docNo: z.string(),
  name: z.string(),
  endpointId: z.string(),
  endpointName: z.string(),
  endpointKind: syncEndpointKindSchema,
  protocol: syncProtocolSchema,
  mappingId: z.string().nullable(),
  mappingName: z.string().nullable(),
  customerId: z.string().nullable(),
  customerName: z.string().nullable(),
  customerCode: z.string().nullable(),
  object: syncObjectSchema,
  direction: syncDirectionSchema,
  mode: syncModeSchema,
  trigger: syncTriggerSchema,
  intervalMinutes: z.number().int().nullable(),
  frequency: z.string().nullable(),
  batchSize: z.number().int(),
  sourceSystem: z.string(),
  targetSystem: z.string(),
  ownerId: z.string().nullable(),
  ownerName: z.string().nullable(),
  lastRunAt: z.string().nullable(),
  nextRunAt: z.string().nullable(),
  lastStatus: syncRunStatusSchema.nullable(),
  watermark: z.string().nullable(),
  enabled: z.boolean(),
  note: z.string().nullable(),
  openFailures: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int(),
});
export type SyncTaskDto = z.infer<typeof syncTaskSchema>;

export const syncTaskDetailSchema = syncTaskSchema.extend({
  latestRun: syncRunSchema.nullable(),
  failures: z.array(syncRecordSchema),
});
export type SyncTaskDetailDto = z.infer<typeof syncTaskDetailSchema>;

const taskBase = {
  name: z.string().trim().min(1).max(120),
  endpointId: z.uuid(),
  mappingId: z.uuid().nullable().optional(),
  customerId: z.uuid().nullable().optional(),
  object: syncObjectSchema,
  direction: syncDirectionSchema,
  mode: syncModeSchema,
  trigger: syncTriggerSchema,
  intervalMinutes: z.number().int().min(1).max(10_080).nullable().optional(),
  frequency: z.string().trim().max(40).nullable().optional(),
  batchSize: z.number().int().min(1).max(1000).default(SYNC_DEFAULT_BATCH_SIZE),
  ownerId: z.uuid().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
};

export const syncTaskCreateSchema = z.object({ ...taskBase, enabled: z.boolean().default(true) });
export const syncTaskUpdateSchema = z.object({ ...taskBase, version: z.number().int() });

const boolQuery = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === "true"));

export const syncTaskListQuerySchema = pageQuerySchema.extend({
  object: syncObjectSchema.optional(),
  direction: syncDirectionSchema.optional(),
  trigger: syncTriggerSchema.optional(),
  lastStatus: csv,
  enabled: boolQuery,
  customerId: z.uuid().optional(),
  endpointId: z.uuid().optional(),
});

export const syncRunListQuerySchema = pageQuerySchema;
export const syncLogQuerySchema = pageQuerySchema;

export const syncRetryQueueQuerySchema = pageQuerySchema.extend({
  state: csv,
  taskId: z.uuid().optional(),
  errorType: csv,
});

export const syncRetryRecordsSchema = z.object({ recordIds: z.array(z.uuid()).min(1).max(500) });

export const syncRetryResultSchema = z.object({ total: z.number().int(), success: z.number().int(), failed: z.number().int(), pending: z.number().int(), abandoned: z.number().int() });
export type SyncRetryResult = z.infer<typeof syncRetryResultSchema>;

export const syncLogSchema = z.object({
  id: z.string(),
  at: z.string(),
  userName: z.string().nullable(),
  action: z.string(),
  params: z.record(z.string(), z.unknown()),
  summary: z.string(),
});
export type SyncLogDto = z.infer<typeof syncLogSchema>;

export const syncTaskRetryResponseSchema = z.object({ result: syncRetryResultSchema, task: syncTaskDetailSchema });
export type SyncTaskRetryResponse = z.infer<typeof syncTaskRetryResponseSchema>;

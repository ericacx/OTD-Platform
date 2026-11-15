import type { GateCode, NodeCode } from "@otd/shared";
import { z } from "zod";
import { pageQuerySchema } from "./common.js";
import { defineErrors } from "./errors.js";

export const flowErrors = defineErrors({
  FLOW_GATE_EMPTY: { status: 422, zh: "{gate} 的条件不能全部裁掉", en: "{gate} must keep at least one condition" },
  FLOW_NO_CHANGES: { status: 409, zh: "草稿与当前发布版本相同，无需发布", en: "Draft is identical to the published version" },
  FLOW_MODULE_PENDING: { status: 422, zh: "服务模块「{module}」暂无承载页面，不可配置", en: "Module {module} has no page yet" },
  FLOW_MODULE_DUPLICATE: { status: 422, zh: "服务模块「{module}」重复", en: "Module {module} appears more than once" },
  FLOW_ITEM_MODULE_MISMATCH: { status: 422, zh: "服务项「{item}」不属于模块「{module}」", en: "Item {item} does not belong to module {module}" },
  FLOW_UNKNOWN_CODE: { status: 422, zh: "未知的服务模块或服务项：{code}", en: "Unknown module or item: {code}" },
  FLOW_CATALOG_IN_USE: { status: 409, zh: "「{name}」仍被 {count} 个客户流程使用，不能删除", en: "{name} is still used by {count} customer flows" },
  FLOW_NOT_PUBLISHED: { status: 409, zh: "该客户流程尚未发布", en: "Customer flow has not been published" },
  FLOW_VERSION_NOT_CURRENT: { status: 409, zh: "只能迁移到当前发布版本", en: "Orders can only be migrated to the current version" },
  FLOW_RULEPACK_DUPLICATE: { status: 409, zh: "{kind} 已有同范围的规则包", en: "{kind} already has a rule pack for this scope" },
  FLOW_RULEPACK_DEFAULT_LOCKED: { status: 409, zh: "全局默认规则包不能删除", en: "Global default rule packs cannot be deleted" },
  FLOW_RULEPACK_SNAPSHOT_MISMATCH: { status: 422, zh: "快照与规则包不匹配", en: "Snapshot does not belong to this rule pack" },
  FLOW_REQUIRED_MODULE_MISSING: { status: 422, zh: "必选服务模块被裁掉：{modules}，不能发布", en: "Mandatory modules were cut: {modules}" },
});

export const FORCED_NODES = ["N01", "N02", "N05", "N06", "N08", "N10"] as const;
export type ForcedNode = (typeof FORCED_NODES)[number];

export const FLOW_STATUSES = ["NONE", "DRAFT", "PUBLISHED"] as const;
export const flowStatusSchema = z.enum(FLOW_STATUSES);
export type FlowStatus = z.infer<typeof flowStatusSchema>;

export const RULE_KINDS = ["PO_REVIEW", "RELEASE", "TEST_REUSE", "QUOTE"] as const;
export const ruleKindSchema = z.enum(RULE_KINDS);
export type RuleKind = z.infer<typeof ruleKindSchema>;

export const serviceItemEffectSchema = z.object({
  nodes: z.array(z.string().regex(/^N\d{2}$/)).optional(),
  gateConditions: z.array(z.string().regex(/^G[12]\.\w+$/)).optional(),
  rulePacks: z.array(z.string()).optional(),
  patrolRules: z.array(z.string()).optional(),
  todoTemplates: z.array(z.string()).optional(),
});
export type ServiceItemEffectDto = z.infer<typeof serviceItemEffectSchema>;

export const serviceItemSchema = z.object({
  id: z.string(),
  moduleId: z.string(),
  moduleCode: z.string(),
  code: z.string(),
  name: z.string(),
  nameEn: z.string().nullable(),
  description: z.string().nullable(),
  department: z.string().nullable(),
  requiresCustomerConfirm: z.boolean(),
  effects: serviceItemEffectSchema,
  paramsSchema: z.record(z.string(), z.unknown()).nullable(),
  sort: z.number().int(),
  version: z.number().int(),
});
export type ServiceItemDto = z.infer<typeof serviceItemSchema>;

export const serviceModuleSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  nameEn: z.string().nullable(),
  department: z.string(),
  sort: z.number().int(),
  hasPage: z.boolean(),
  description: z.string().nullable(),
  nodes: z.array(z.string()),
  itemCount: z.number().int(),
  customerCount: z.number().int().nullable(),
  enabledItemTotal: z.number().int().nullable(),
  version: z.number().int(),
});
export type ServiceModuleDto = z.infer<typeof serviceModuleSchema>;

export const serviceModuleDetailSchema = serviceModuleSchema.extend({ items: z.array(serviceItemSchema) });
export type ServiceModuleDetailDto = z.infer<typeof serviceModuleDetailSchema>;

export const serviceModuleListQuerySchema = pageQuerySchema.extend({ hasPage: z.enum(["true", "false"]).optional() });

export const serviceModuleUpsertSchema = z.object({
  code: z.string().trim().regex(/^[A-Z][A-Z0-9-]{1,11}$/).optional(),
  name: z.string().trim().min(1).max(40),
  nameEn: z.string().trim().max(80).nullable().optional(),
  department: z.string().trim().min(1).max(30),
  sort: z.number().int().min(0).optional(),
  hasPage: z.boolean().default(true),
  description: z.string().max(500).nullable().optional(),
  version: z.number().int().optional(),
});

export const serviceItemUpsertSchema = z.object({
  code: z.string().trim().regex(/^[A-Z][A-Z0-9-]{1,19}$/).optional(),
  name: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().max(120).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  department: z.string().trim().max(30).nullable().optional(),
  requiresCustomerConfirm: z.boolean().default(false),
  effects: serviceItemEffectSchema.default({}),
  paramsSchema: z.record(z.string(), z.unknown()).nullable().optional(),
  sort: z.number().int().min(0).optional(),
  version: z.number().int().optional(),
});

export const catalogDeleteQuerySchema = z.object({ version: z.coerce.number().int().optional() });

export const moduleAssignSchema = z.object({ customerIds: z.array(z.uuid()).min(1).max(200) });
export const moduleAssignResultSchema = z.object({ assigned: z.array(z.string()), skipped: z.array(z.string()) });
export type ModuleAssignResult = z.infer<typeof moduleAssignResultSchema>;

export const reportReuseSchema = z.object({
  sameStructure: z.boolean(),
  sameProcess: z.boolean(),
  coverItems: z.boolean(),
  withinValidity: z.boolean(),
  allowCrossStyle: z.boolean(),
});

export const INSPECTION_STAGE_CODES = ["IPI", "DPI", "FRI"] as const;

export const flowParamsSchema = z.object({
  paymentTermsDays: z.number().int().min(0).max(365).optional(),
  paymentStartFrom: z.enum(["SHIP_DATE", "INVOICE_DATE", "ARRIVAL_DATE"]).optional(),
  reportReuse: reportReuseSchema.optional(),
  reportValidityMonths: z.number().int().min(1).max(60).optional(),
  inspectionStages: z.array(z.enum(INSPECTION_STAGE_CODES)).optional(),
  aqlLevel: z.string().trim().max(40).optional(),
  releaseDaysBeforeExFactory: z.number().int().min(0).max(90).optional(),
  sameFactorySameDayLimit: z.number().int().min(1).max(50).optional(),
  mergeReport: z.boolean().optional(),
  sampleRoundStuckDays: z.number().int().min(1).max(60).optional(),
  approvalWaitDays: z.number().int().min(1).max(60).optional(),
  reconciliationDay: z.number().int().min(1).max(28).optional(),
});
export type FlowParamsInput = z.infer<typeof flowParamsSchema>;
export type FlowParams = { [K in keyof FlowParamsInput]-?: Exclude<FlowParamsInput[K], undefined> };

export const DEFAULT_FLOW_PARAMS: FlowParams = {
  paymentTermsDays: 60,
  paymentStartFrom: "SHIP_DATE",
  reportReuse: { sameStructure: true, sameProcess: true, coverItems: true, withinValidity: true, allowCrossStyle: false },
  reportValidityMonths: 12,
  inspectionStages: ["IPI", "DPI", "FRI"],
  aqlLevel: "AQL 1.5 Level I",
  releaseDaysBeforeExFactory: 15,
  sameFactorySameDayLimit: 5,
  mergeReport: true,
  sampleRoundStuckDays: 7,
  approvalWaitDays: 5,
  reconciliationDay: 5,
};

export const flowItemViewSchema = z.object({
  code: z.string(),
  name: z.string(),
  nameEn: z.string().nullable(),
  enabled: z.boolean(),
  params: z.record(z.string(), z.unknown()).nullable(),
  requiresCustomerConfirm: z.boolean(),
  deleted: z.boolean(),
});
export type FlowItemView = z.infer<typeof flowItemViewSchema>;

export const flowModuleViewSchema = z.object({
  moduleId: z.string().nullable(),
  moduleCode: z.string(),
  name: z.string(),
  nameEn: z.string().nullable(),
  department: z.string(),
  defaultDepartment: z.string(),
  hasPage: z.boolean(),
  sort: z.number().int(),
  nodes: z.array(z.string()),
  items: z.array(flowItemViewSchema),
  enabledCount: z.number().int(),
  totalCount: z.number().int(),
});
export type FlowModuleView = z.infer<typeof flowModuleViewSchema>;

export const flowRuntimeSchema = z.object({
  customerId: z.string(),
  versionId: z.string().nullable(),
  versionNo: z.number().int().nullable(),
  configured: z.boolean(),
  nodes: z.array(z.string()),
  gateConditions: z.object({ G1: z.array(z.string()), G2: z.array(z.string()) }),
  modules: z.array(z.string()),
  items: z.array(z.string()),
  params: z.record(z.string(), z.unknown()),
});
export type FlowRuntime = {
  customerId: string;
  versionId: string | null;
  versionNo: number | null;
  configured: boolean;
  nodes: NodeCode[];
  gateConditions: Record<GateCode, string[]>;
  modules: string[];
  items: string[];
  params: FlowParams;
};

export const flowCardSchema = z.object({
  customerId: z.string(),
  code: z.string(),
  name: z.string(),
  nameEn: z.string().nullable(),
  logoText: z.string().nullable(),
  contactName: z.string().nullable(),
  paymentTermsDays: z.number().int(),
  customerStatus: z.string(),
  flowStatus: flowStatusSchema,
  hasChanges: z.boolean(),
  moduleCount: z.number().int(),
  itemCount: z.number().int(),
  currentVersionNo: z.number().int().nullable(),
  publishedAt: z.string().nullable(),
});
export type FlowCardDto = z.infer<typeof flowCardSchema>;

export const flowCardQuerySchema = pageQuerySchema.extend({ flowStatus: flowStatusSchema.optional() });

export const flowVersionSchema = z.object({
  id: z.string(),
  versionNo: z.number().int(),
  note: z.string().nullable(),
  publishedAt: z.string(),
  publishedBy: z.string().nullable(),
  publishedByName: z.string().nullable(),
  moduleCount: z.number().int(),
  itemCount: z.number().int(),
  isCurrent: z.boolean(),
  summary: z.record(z.string(), z.unknown()).nullable(),
});
export type FlowVersionDto = z.infer<typeof flowVersionSchema>;

export const flowVersionDetailSchema = flowVersionSchema.extend({
  modules: z.array(flowModuleViewSchema),
  params: z.record(z.string(), z.unknown()),
  runtime: flowRuntimeSchema,
});
export type FlowVersionDetailDto = z.infer<typeof flowVersionDetailSchema>;

export const flowDetailSchema = z.object({
  customer: flowCardSchema,
  draft: z.object({ modules: z.array(flowModuleViewSchema), params: z.record(z.string(), z.unknown()) }),
  draftRuntime: flowRuntimeSchema,
  availableModules: z.array(z.object({ moduleCode: z.string(), name: z.string(), nameEn: z.string().nullable(), department: z.string(), itemCount: z.number().int() })),
  currentVersion: flowVersionSchema.nullable(),
  hasChanges: z.boolean(),
  version: z.number().int(),
});
export type FlowDetailDto = z.infer<typeof flowDetailSchema>;

export const flowDraftModuleSchema = z.object({
  moduleCode: z.string().trim().min(1),
  department: z.string().trim().min(1).max(30).optional(),
  items: z.array(z.object({ itemCode: z.string().trim().min(1), params: z.record(z.string(), z.unknown()).optional() })).max(100),
});

export const flowDraftUpdateSchema = z.object({
  modules: z.array(flowDraftModuleSchema).max(50),
  params: flowParamsSchema.default({}),
  version: z.number().int().min(0),
});
export type FlowDraftUpdateInput = z.infer<typeof flowDraftUpdateSchema>;

export const flowPublishSchema = z.object({ note: z.string().trim().max(200).optional(), version: z.number().int().min(1) });
export const flowRollbackSchema = z.object({ versionId: z.uuid(), reason: z.string().trim().min(1).max(200), version: z.number().int().min(1) });
export const flowCopySchema = z.object({ sourceCustomerId: z.uuid(), version: z.number().int().min(0) });

export const flowDiffQuerySchema = z.object({ from: z.string().optional(), to: z.string().optional() });

const diffModuleRef = z.object({ moduleCode: z.string(), name: z.string() });
const diffItemRef = z.object({ moduleCode: z.string(), itemCode: z.string(), name: z.string() });
const diffEnd = z.object({ label: z.string(), versionId: z.string().nullable(), versionNo: z.number().int().nullable() });

export const flowDiffSchema = z.object({
  from: diffEnd,
  to: diffEnd,
  identical: z.boolean(),
  modulesAdded: z.array(diffModuleRef),
  modulesRemoved: z.array(diffModuleRef),
  orderChanged: z.boolean(),
  order: z.object({ from: z.array(z.string()), to: z.array(z.string()) }),
  departmentsChanged: z.array(diffModuleRef.extend({ from: z.string(), to: z.string() })),
  itemsAdded: z.array(diffItemRef),
  itemsRemoved: z.array(diffItemRef),
  itemParamsChanged: z.array(diffItemRef),
  paramsChanged: z.array(z.object({ key: z.string(), from: z.unknown(), to: z.unknown() })),
  nodesAdded: z.array(z.string()),
  nodesRemoved: z.array(z.string()),
  gateConditionsAdded: z.array(z.object({ gate: z.string(), key: z.string() })),
  gateConditionsRemoved: z.array(z.object({ gate: z.string(), key: z.string() })),
});
export type FlowDiffDto = z.infer<typeof flowDiffSchema>;

export const flowRuntimeQuerySchema = z.object({ versionId: z.uuid().optional() });

export const migrationQuerySchema = z.object({ targetVersionId: z.uuid().optional() });

export const migrationOrderSchema = z.object({
  id: z.string(),
  poNo: z.string(),
  status: z.string(),
  customerDueDate: z.string(),
  fromVersionId: z.string(),
  fromVersionNo: z.number().int().nullable(),
  ownerName: z.string(),
});

export const migrationPreviewSchema = z.object({
  target: z.object({ versionId: z.string(), versionNo: z.number().int() }),
  total: z.number().int(),
  orders: z.array(migrationOrderSchema),
  groups: z.array(z.object({ fromVersionId: z.string(), fromVersionNo: z.number().int().nullable(), orderCount: z.number().int(), diff: flowDiffSchema })),
});
export type MigrationPreviewDto = z.infer<typeof migrationPreviewSchema>;

export const flowMigrateSchema = z.object({ targetVersionId: z.uuid(), orderIds: z.array(z.uuid()).max(1000).optional() });
export const flowMigrateResultSchema = z.object({ migrated: z.number().int(), orderIds: z.array(z.string()), target: z.object({ versionId: z.string(), versionNo: z.number().int() }) });
export type FlowMigrateResult = z.infer<typeof flowMigrateResultSchema>;

export const rulePackSchema = z.object({
  id: z.string(),
  code: z.string(),
  kind: ruleKindSchema,
  name: z.string(),
  nameEn: z.string().nullable(),
  customerId: z.string().nullable(),
  customerCode: z.string().nullable(),
  customerName: z.string().nullable(),
  params: z.record(z.string(), z.unknown()),
  description: z.string().nullable(),
  enabled: z.boolean(),
  updatedAt: z.string(),
  version: z.number().int(),
});
export type RulePackDto = z.infer<typeof rulePackSchema>;

export const rulePackListQuerySchema = pageQuerySchema.extend({
  kind: ruleKindSchema.optional(),
  customerId: z.uuid().optional(),
  scope: z.enum(["GLOBAL", "CUSTOMER"]).optional(),
});

export const rulePackUpsertSchema = z.object({
  code: z.string().trim().regex(/^[A-Z][A-Z0-9_-]{1,39}$/).optional(),
  kind: ruleKindSchema,
  name: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().max(120).nullable().optional(),
  customerId: z.uuid().nullable().optional(),
  params: z.record(z.string(), z.unknown()).default({}),
  description: z.string().max(500).nullable().optional(),
  enabled: z.boolean().default(true),
  reason: z.string().trim().max(200).optional(),
  version: z.number().int().optional(),
});

export const effectiveRulePackQuerySchema = z.object({ customerId: z.uuid().optional() });
export const effectiveRulePackSchema = z.object({
  kind: ruleKindSchema,
  params: z.record(z.string(), z.unknown()),
  defaultPackId: z.string().nullable(),
  overridePackId: z.string().nullable(),
});
export type EffectiveRulePackDto = z.infer<typeof effectiveRulePackSchema>;

export const rulePackSnapshotSchema = z.object({
  id: z.string(),
  objectVersion: z.number().int(),
  reason: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
});
export type RulePackSnapshotDto = z.infer<typeof rulePackSnapshotSchema>;

export const rulePackRollbackSchema = z.object({ snapshotId: z.uuid(), reason: z.string().trim().min(1).max(200) });

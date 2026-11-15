import { z } from "zod";
import { csv, dateSchema, labelSchema, pageQuerySchema } from "./common.js";
import { defineErrors } from "./errors.js";

export const orderErrors = defineErrors({
  ORDER_RULE_PACK_FAILED: { status: 422, zh: "PO 复核规则包未全绿：{failed}", en: "PO review rule pack failed: {failed}" },
  ORDER_HAS_SHIPMENTS: { status: 409, zh: "订单已有出货记录，不可取消", en: "Order already has shipments and cannot be cancelled" },
  ORDER_EXTRACTION_FAILED: { status: 422, zh: "PO 识别失败：{reason}", en: "PO extraction failed: {reason}" },
  ORDER_CUSTOMER_UNRESOLVED: { status: 422, zh: "无法确定 PO 所属客户，请选择客户后重试", en: "Cannot resolve the customer of this PO, please choose one" },
  ORDER_FILE_UNSUPPORTED: { status: 422, zh: "只支持 PDF 或 Excel 格式的 PO 文件", en: "Only PDF or Excel PO files are supported" },
  ORDER_KEY_FIELD_LOCKED: { status: 409, zh: "订单已确认，数量、交期、明细请走 PO 改版", en: "Order confirmed; change quantity, due date or lines through a PO revision" },
  ORDER_NOT_EDITABLE: { status: 409, zh: "订单当前状态「{status}」不可修改", en: "Order in status {status} cannot be modified" },
});

export const orderStatusSchema = z.enum(["PENDING_CONFIRM", "TO_SCHEDULE", "IN_PRODUCTION", "TO_SHIP", "COMPLETED", "CANCELLED"]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const ORDER_STAGES = ["PENDING_CONFIRM", "TO_SCHEDULE", "IN_PRODUCTION", "TO_SHIP", "COMPLETED"] as const;
export const ORDER_STAGE_DEFAULT_DAYS: Record<(typeof ORDER_STAGES)[number], number | null> = {
  PENDING_CONFIRM: 5,
  TO_SCHEDULE: 8,
  IN_PRODUCTION: 40,
  TO_SHIP: 9,
  COMPLETED: null,
};

export const extractedValueSchema = z.object({
  value: z.string().nullable(),
  confidence: z.number(),
  source: z.string().nullable(),
});
export type ExtractedValue = z.infer<typeof extractedValueSchema>;

export const extractedLineSchema = z.object({
  styleNo: z.string(),
  color: z.string().nullable(),
  size: z.string().nullable(),
  sku: z.string().nullable(),
  quantity: z.number().int(),
  unitPrice: z.number().nullable(),
  confidence: z.number(),
});
export type ExtractedLine = z.infer<typeof extractedLineSchema>;

export const poExtractionSchema = z.object({
  poNo: extractedValueSchema,
  revision: extractedValueSchema,
  customer: extractedValueSchema,
  seasonCode: extractedValueSchema,
  tradeTerm: extractedValueSchema,
  paymentTerms: extractedValueSchema,
  currency: extractedValueSchema,
  orderDate: extractedValueSchema,
  dueDate: extractedValueSchema,
  transportMode: extractedValueSchema,
  destination: extractedValueSchema,
  buyerEntity: extractedValueSchema,
  lines: z.array(extractedLineSchema),
});
export type PoExtraction = z.infer<typeof poExtractionSchema>;

export const ruleCheckItemSchema = z.object({
  key: z.string(),
  label: labelSchema,
  passed: z.boolean(),
  detail: z.string().optional(),
});
export type RuleCheckItemDto = z.infer<typeof ruleCheckItemSchema>;

export const orderLineInputSchema = z.object({
  styleId: z.uuid(),
  color: z.string().max(60).nullable().optional(),
  size: z.string().max(30).nullable().optional(),
  sku: z.string().max(80).nullable().optional(),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0).nullable().optional(),
});

const orderFieldsSchema = z.object({
  channel: z.string().max(60).nullable().optional(),
  poType: z.string().max(60).nullable().optional(),
  productLine: z.string().max(60).nullable().optional(),
  seasonCode: z.string().max(10).nullable().optional(),
  styleType: z.string().max(30).nullable().optional(),
  tradeTerm: z.string().max(120).nullable().optional(),
  paymentTerms: z.string().max(120).nullable().optional(),
  currency: z.string().length(3).optional(),
  buyerEntity: z.string().max(120).nullable().optional(),
  origin: z.string().max(60).nullable().optional(),
  orderDate: dateSchema.nullable().optional(),
  factoryId: z.uuid().nullable().optional(),
  factoryEntity: z.string().max(120).nullable().optional(),
  transportMode: z.string().max(30).nullable().optional(),
  destination: z.string().max(120).nullable().optional(),
  totalUnits: z.number().int().min(0).nullable().optional(),
  merchandiserId: z.uuid().nullable().optional(),
  poTerms: z.string().max(4000).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});

export const orderCreateSchema = orderFieldsSchema.extend({
  customerId: z.uuid(),
  poNo: z.string().trim().min(1).max(40),
  revision: z.number().int().min(1).default(1),
  customerDueDate: dateSchema,
  lines: z.array(orderLineInputSchema).min(1),
});

export const orderUpdateSchema = orderFieldsSchema.extend({
  version: z.number().int(),
  customerDueDate: dateSchema.optional(),
  lines: z.array(orderLineInputSchema).min(1).optional(),
});

export const orderExtractSchema = z.object({
  fileId: z.uuid(),
  customerId: z.uuid().optional(),
});

export const orderConfirmSchema = z.object({
  version: z.number().int(),
  overrideReason: z.string().trim().min(2).max(500).optional(),
});

export const orderAdvanceSchema = z.object({
  version: z.number().int(),
  to: orderStatusSchema.optional(),
  note: z.string().max(500).optional(),
});

export const orderCancelSchema = z.object({
  version: z.number().int(),
  reason: z.string().trim().min(2).max(500),
});

export const orderReviseSchema = orderFieldsSchema.extend({
  version: z.number().int(),
  customerDueDate: dateSchema.optional(),
  lines: z.array(orderLineInputSchema).min(1).optional(),
  revisionDate: dateSchema.optional(),
  note: z.string().max(500).optional(),
});

export const factoryReplyCreateSchema = z.object({
  version: z.number().int(),
  replyDate: dateSchema,
  note: z.string().max(500).optional(),
});

export const customerConfirmSchema = z.object({
  version: z.number().int(),
  method: z.enum(["EMAIL", "CUSTOMER_SYSTEM", "OFFLINE"]),
  note: z.string().max(500).optional(),
});

export const productionProgressCreateSchema = z.object({
  reportDate: dateSchema,
  knittedPairs: z.number().int().min(0),
  packedPairs: z.number().int().min(0).default(0),
  note: z.string().max(500).optional(),
});

export const orderListQuerySchema = pageQuerySchema.extend({
  customerId: z.uuid().optional(),
  status: csv,
  dueFrom: dateSchema.optional(),
  dueTo: dateSchema.optional(),
  factoryId: z.uuid().optional(),
  risk: z.enum(["1", "true"]).optional(),
});

export const orderListItemSchema = z.object({
  id: z.string(),
  poNo: z.string(),
  revision: z.number().int(),
  customerId: z.string(),
  customerName: z.string(),
  seasonCode: z.string().nullable(),
  styleNos: z.array(z.string()),
  styleCount: z.number().int(),
  totalPairs: z.number().int(),
  fobAmount: z.number().nullable(),
  currency: z.string(),
  customerDueDate: z.string(),
  factoryReplyDate: z.string().nullable(),
  delayDays: z.number().int().nullable(),
  factoryId: z.string().nullable(),
  factoryName: z.string().nullable(),
  merchandiserId: z.string().nullable(),
  merchandiserName: z.string().nullable(),
  ownerId: z.string(),
  ownerName: z.string(),
  status: orderStatusSchema,
  currentNode: z.object({ code: z.string(), name: labelSchema, state: z.string() }).nullable(),
  createdAt: z.string(),
  version: z.number().int(),
});
export type OrderListItem = z.infer<typeof orderListItemSchema>;

export const orderLineSchema = z.object({
  id: z.string(),
  styleId: z.string(),
  styleNo: z.string(),
  styleName: z.string().nullable(),
  color: z.string().nullable(),
  size: z.string().nullable(),
  sku: z.string().nullable(),
  quantity: z.number().int(),
  unitPrice: z.number().nullable(),
  amount: z.number().nullable(),
});
export type OrderLineDto = z.infer<typeof orderLineSchema>;

export const unmatchedLineSchema = z.object({
  styleNo: z.string(),
  color: z.string().nullable(),
  size: z.string().nullable(),
  sku: z.string().nullable(),
  quantity: z.number().int(),
  unitPrice: z.number().nullable(),
});
export type UnmatchedLine = z.infer<typeof unmatchedLineSchema>;

export const poRevisionSchema = z.object({
  id: z.string(),
  revision: z.number().int(),
  snapshot: z.record(z.string(), z.unknown()),
  note: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
});
export type PoRevisionDto = z.infer<typeof poRevisionSchema>;

export const factoryReplySchema = z.object({
  id: z.string(),
  versionNo: z.number().int(),
  replyDate: z.string(),
  delayDays: z.number().int(),
  note: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
});
export type FactoryReplyDto = z.infer<typeof factoryReplySchema>;

export const stageLogSchema = z.object({
  id: z.string(),
  status: z.string(),
  action: z.string(),
  note: z.string().nullable(),
  at: z.string(),
  operatorName: z.string().nullable(),
});
export type StageLogDto = z.infer<typeof stageLogSchema>;

export const orderStageSchema = z.object({
  status: z.enum(ORDER_STAGES),
  state: z.enum(["DONE", "CURRENT", "PENDING"]),
  enteredAt: z.string().nullable(),
  leftAt: z.string().nullable(),
  elapsedDays: z.number().nullable(),
  avgDays: z.number().nullable(),
  slowerThanAvg: z.boolean(),
  logs: z.array(stageLogSchema),
});
export type OrderStageDto = z.infer<typeof orderStageSchema>;

export const productionProgressSchema = z.object({
  id: z.string(),
  reportDate: z.string(),
  knittedPairs: z.number().int(),
  packedPairs: z.number().int(),
  completionRate: z.number().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type ProductionProgressDto = z.infer<typeof productionProgressSchema>;

export const orderDetailSchema = orderListItemSchema.extend({
  revisionDate: z.string().nullable(),
  channel: z.string().nullable(),
  poType: z.string().nullable(),
  productLine: z.string().nullable(),
  styleType: z.string().nullable(),
  tradeTerm: z.string().nullable(),
  paymentTerms: z.string().nullable(),
  buyerEntity: z.string().nullable(),
  origin: z.string().nullable(),
  orderDate: z.string().nullable(),
  factoryEntity: z.string().nullable(),
  transportMode: z.string().nullable(),
  destination: z.string().nullable(),
  totalUnits: z.number().int().nullable(),
  poTerms: z.string().nullable(),
  note: z.string().nullable(),
  sourceFileId: z.string().nullable(),
  extraction: z.record(z.string(), z.object({ value: z.union([z.string(), z.number()]).nullable(), confidence: z.number(), source: z.string().optional() })).nullable(),
  ruleCheck: z.array(ruleCheckItemSchema).nullable(),
  ruleCheckPassed: z.boolean(),
  overrideReason: z.string().nullable(),
  flowVersionId: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  customerConfirmedAt: z.string().nullable(),
  customerConfirmMethod: z.string().nullable(),
  dueDaysLeft: z.number().int(),
  lines: z.array(orderLineSchema),
  unmatchedLines: z.array(unmatchedLineSchema),
  revisions: z.array(poRevisionSchema),
  factoryReplies: z.array(factoryReplySchema),
  stages: z.array(orderStageSchema),
  stageIndex: z.number().int(),
  stageLogCount: z.number().int(),
  production: z.array(productionProgressSchema),
  nextStatus: orderStatusSchema.nullable(),
  updatedAt: z.string(),
});
export type OrderDetail = z.infer<typeof orderDetailSchema>;

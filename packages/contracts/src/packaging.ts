import { z } from "zod";
import { csv, dateSchema, pageQuerySchema } from "./common.js";
import { defineErrors } from "./errors.js";

export const packagingErrors = defineErrors({
  PACKAGING_SOURCE_REQUIRED: { status: 422, zh: "请选择关联订单或客户", en: "Order or customer is required" },
  PACKAGING_NOT_EDITABLE: { status: 409, zh: "方案处于「{status}」状态，不能直接修改，请先退回草稿", en: "Plan in status {status} cannot be edited; return it to draft first" },
  PACKAGING_CHANGE_NOTE_REQUIRED: { status: 422, zh: "修改已确认的方案须填写修改说明", en: "A change note is required to revise a confirmed plan" },
  PACKAGING_VERSION_NOT_FOUND: { status: 404, zh: "版本 v{versionNo} 不存在", en: "Version v{versionNo} not found" },
  PACKAGING_PAIRS_PER_CARTON_REQUIRED: { status: 422, zh: "包装方案未设置每箱双数", en: "Pairs per carton is not set" },
  PACKAGING_PLAN_REQUIRED: { status: 422, zh: "订单 {poNo} 还没有已确认的包装方案", en: "Order {poNo} has no confirmed packing plan" },
  PACKAGING_PLAN_ORDER_MISMATCH: { status: 422, zh: "包装方案 {docNo} 不属于该订单", en: "Packing plan {docNo} does not belong to the order" },
  PACKAGING_ORDER_HAS_NO_LINES: { status: 422, zh: "订单 {poNo} 没有明细行", en: "Order {poNo} has no lines" },
  PACKAGING_CARTON_NOT_EDITABLE: { status: 409, zh: "装箱单「{status}」状态不能调整", en: "Carton list in status {status} cannot be adjusted" },
});

export const packagingPlanStatusSchema = z.enum(["DRAFT", "PENDING_CUSTOMER", "CONFIRMED"]);
export type PackagingPlanStatus = z.infer<typeof packagingPlanStatusSchema>;
export const cartonStatusSchema = z.enum(["TO_PACK", "PACKING", "PACKED"]);
export type CartonStatus = z.infer<typeof cartonStatusSchema>;
export const confirmMethodSchema = z.enum(["EMAIL", "CUSTOMER_SYSTEM", "OFFLINE"]);

export const requirementItemSchema = z.object({ title: z.string().trim().min(1).max(60), content: z.string().trim().max(2000) });

export const PACKAGING_PLAN_FIELDS = [
  "title",
  "method",
  "pairsPerCarton",
  "cartonSize",
  "cartonType",
  "strength",
  "shippingMark",
  "markPosition",
  "sizeSticker",
  "sealSticker",
  "innerBag",
  "tape",
  "destination",
  "requirements",
] as const;
export type PackagingPlanField = (typeof PACKAGING_PLAN_FIELDS)[number];

const text = (max = 200) => z.string().trim().max(max).nullable().optional();

export const packagingPlanFieldsSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  method: text(120),
  pairsPerCarton: z.number().int().min(1).max(10000).nullable().optional(),
  cartonSize: text(60),
  cartonType: text(),
  strength: text(60),
  shippingMark: text(),
  markPosition: text(),
  sizeSticker: text(),
  sealSticker: text(),
  innerBag: text(),
  tape: text(),
  destination: text(),
  requirements: z.array(requirementItemSchema).max(30).optional(),
});

export const packagingPlanCreateSchema = packagingPlanFieldsSchema.extend({
  orderId: z.uuid().nullable().optional(),
  customerId: z.uuid().nullable().optional(),
  styleId: z.uuid().nullable().optional(),
});

export const packagingPlanUpdateSchema = packagingPlanFieldsSchema.extend({
  styleId: z.uuid().nullable().optional(),
  changeNote: z.string().trim().max(300).nullable().optional(),
  version: z.number().int(),
});

export const packagingVersionedSchema = z.object({ version: z.number().int() });
export const packagingReturnSchema = z.object({ version: z.number().int(), reason: z.string().trim().max(300).nullable().optional() });
export const packagingConfirmSchema = z.object({
  version: z.number().int(),
  confirmedBy: z.string().trim().min(1).max(80),
  method: confirmMethodSchema,
  confirmedAt: z.iso.datetime({ offset: true }).optional(),
  note: z.string().trim().max(300).nullable().optional(),
});

export const packagingPlanListQuerySchema = pageQuerySchema.extend({
  status: csv,
  customerId: z.uuid().optional(),
  orderId: z.uuid().optional(),
});

export const packagingCompareQuerySchema = z.object({ from: z.coerce.number().int().min(1), to: z.coerce.number().int().min(1) });

export const packagingPlanSchema = z.object({
  id: z.string(),
  docNo: z.string(),
  title: z.string(),
  orderId: z.string().nullable(),
  poNo: z.string().nullable(),
  styleId: z.string().nullable(),
  styleNo: z.string().nullable(),
  customerId: z.string(),
  customerCode: z.string(),
  customerName: z.string(),
  status: packagingPlanStatusSchema,
  currentVersion: z.number().int(),
  effectiveVersion: z.number().int().nullable(),
  method: z.string().nullable(),
  pairsPerCarton: z.number().int().nullable(),
  cartonSize: z.string().nullable(),
  cartonType: z.string().nullable(),
  strength: z.string().nullable(),
  shippingMark: z.string().nullable(),
  markPosition: z.string().nullable(),
  sizeSticker: z.string().nullable(),
  sealSticker: z.string().nullable(),
  innerBag: z.string().nullable(),
  tape: z.string().nullable(),
  destination: z.string().nullable(),
  requirements: z.array(requirementItemSchema),
  submittedAt: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  confirmedBy: z.string().nullable(),
  confirmMethod: confirmMethodSchema.nullable(),
  confirmNote: z.string().nullable(),
  applicable: z.object({ cartonLines: z.number().int(), pairs: z.number().int(), cartons: z.number().int() }),
  ownerId: z.string(),
  ownerName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int(),
});
export type PackagingPlanDto = z.infer<typeof packagingPlanSchema>;

export const packagingVersionSchema = z.object({
  versionNo: z.number().int(),
  changeNote: z.string().nullable(),
  customerConfirmed: z.boolean(),
  current: z.boolean(),
  effective: z.boolean(),
  changedBy: z.string().nullable(),
  changedByName: z.string().nullable(),
  changedAt: z.string(),
  confirmedAt: z.string().nullable(),
  confirmedBy: z.string().nullable(),
  confirmMethod: confirmMethodSchema.nullable(),
  snapshot: z.record(z.string(), z.unknown()),
});
export type PackagingVersionDto = z.infer<typeof packagingVersionSchema>;

export const packagingPlanDetailSchema = packagingPlanSchema.extend({ versions: z.array(packagingVersionSchema) });
export type PackagingPlanDetailDto = z.infer<typeof packagingPlanDetailSchema>;

export const packagingVersionDiffSchema = z.object({
  planId: z.string(),
  docNo: z.string(),
  from: z.number().int(),
  to: z.number().int(),
  diffs: z.array(z.object({ field: z.string(), from: z.unknown(), to: z.unknown() })),
});
export type PackagingVersionDiffDto = z.infer<typeof packagingVersionDiffSchema>;

export const cartonSchema = z.object({
  id: z.string(),
  docNo: z.string(),
  orderId: z.string(),
  poNo: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  styleId: z.string().nullable(),
  styleNo: z.string().nullable(),
  customerSku: z.string().nullable(),
  color: z.string().nullable(),
  size: z.string().nullable(),
  pairs: z.number().int(),
  pairsPerCarton: z.number().int(),
  cartonCount: z.number().int(),
  tailPairs: z.number().int(),
  cartonRange: z.string().nullable(),
  rangeStart: z.number().int().nullable(),
  rangeEnd: z.number().int().nullable(),
  packDueDate: z.string().nullable(),
  status: cartonStatusSchema,
  planId: z.string().nullable(),
  planDocNo: z.string().nullable(),
  planVersion: z.number().int().nullable(),
  startedAt: z.string().nullable(),
  packedAt: z.string().nullable(),
  createdAt: z.string(),
  version: z.number().int(),
});
export type CartonDto = z.infer<typeof cartonSchema>;

export const cartonListQuerySchema = pageQuerySchema.extend({
  status: csv,
  customerId: z.uuid().optional(),
  orderId: z.uuid().optional(),
});

export const cartonGenerateSchema = z.object({
  orderId: z.uuid(),
  planId: z.uuid().optional(),
  pairsPerCarton: z.number().int().min(1).max(10000).optional(),
  packDueDate: dateSchema.nullable().optional(),
});

export const cartonAdjustSchema = z.object({
  version: z.number().int(),
  pairsPerCarton: z.number().int().min(1).max(10000).optional(),
  packDueDate: dateSchema.nullable().optional(),
});

export const cartonCoverageSchema = z.object({
  orderId: z.string(),
  covered: z.boolean(),
  lineCount: z.number().int(),
  coveredLineCount: z.number().int(),
  missing: z.array(z.object({ styleId: z.string(), styleNo: z.string().nullable(), sku: z.string().nullable(), color: z.string().nullable(), size: z.string().nullable(), quantity: z.number().int() })),
});
export type CartonCoverageDto = z.infer<typeof cartonCoverageSchema>;

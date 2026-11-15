import { z } from "zod";
import { csv, dateSchema, pageQuerySchema } from "./common.js";
import { defineErrors } from "./errors.js";

export const purchaseErrors = defineErrors({
  PURCHASE_SOURCE_REQUIRED: { status: 422, zh: "请选择关联订单、打样单或客户", en: "Order, sample or customer is required" },
  PURCHASE_LINE_NAME_REQUIRED: { status: 422, zh: "第 {index} 行未选物料时须填写名称和单位", en: "Line {index} needs a name and unit when no material is selected" },
  PURCHASE_RECEIVE_EXCEEDS: { status: 422, zh: "「{name}」到货 {quantity} 超出未到数量 {remaining}", en: "{name}: received {quantity} exceeds remaining {remaining}" },
  PURCHASE_LINE_NOT_FOUND: { status: 404, zh: "采购明细行不存在", en: "Purchase line not found" },
});

export const purchaseStatusSchema = z.enum(["ORDERED", "PARTIAL", "RECEIVED", "CANCELLED"]);
export type PurchaseStatus = z.infer<typeof purchaseStatusSchema>;
export const purchaseCategorySchema = z.enum(["YARN", "TRIM", "PACKAGING"]);
export type PurchaseCategory = z.infer<typeof purchaseCategorySchema>;
export const qcResultSchema = z.enum(["PASS", "FAIL"]);

export const purchaseLineInputSchema = z.object({
  materialId: z.uuid().nullable().optional(),
  name: z.string().trim().max(120).nullable().optional(),
  spec: z.string().trim().max(120).nullable().optional(),
  quantity: z.number().positive(),
  unit: z.string().trim().max(20).nullable().optional(),
  unitPrice: z.number().min(0).nullable().optional(),
});

export const purchaseCreateSchema = z.object({
  orderId: z.uuid().nullable().optional(),
  sampleId: z.uuid().nullable().optional(),
  customerId: z.uuid().nullable().optional(),
  supplier: z.string().trim().min(1).max(120),
  category: purchaseCategorySchema,
  orderedAt: dateSchema.optional(),
  promisedDate: dateSchema,
  deliveryPlace: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  lines: z.array(purchaseLineInputSchema).min(1).max(50),
});

export const purchaseReceiveSchema = z.object({
  version: z.number().int(),
  receivedAt: dateSchema.optional(),
  qcResult: qcResultSchema.nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
  lines: z.array(z.object({ lineId: z.uuid(), quantity: z.number().positive() })).min(1),
});

export const purchaseCancelSchema = z.object({ version: z.number().int(), reason: z.string().trim().max(300).nullable().optional() });

const bool = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === true || v === "true"));

export const purchaseListQuerySchema = pageQuerySchema.extend({
  status: csv,
  category: csv,
  customerId: z.uuid().optional(),
  orderId: z.uuid().optional(),
  overdue: bool,
});

export const purchaseReceiptListQuerySchema = pageQuerySchema.extend({
  purchaseId: z.uuid().optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

export const purchaseRequirementQuerySchema = z.object({ orderId: z.uuid() });

export const purchaseLineSchema = z.object({
  id: z.string(),
  materialId: z.string().nullable(),
  materialCode: z.string().nullable(),
  name: z.string(),
  spec: z.string().nullable(),
  quantity: z.number(),
  unit: z.string(),
  unitPrice: z.number().nullable(),
  receivedQty: z.number(),
  remainingQty: z.number(),
});
export type PurchaseLineDto = z.infer<typeof purchaseLineSchema>;

export const purchaseReceiptSchema = z.object({
  id: z.string(),
  purchaseId: z.string(),
  purchaseDocNo: z.string(),
  supplier: z.string(),
  lineId: z.string(),
  lineName: z.string(),
  quantity: z.number(),
  unit: z.string(),
  receivedAt: z.string(),
  qcResult: qcResultSchema.nullable(),
  note: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
});
export type PurchaseReceiptDto = z.infer<typeof purchaseReceiptSchema>;

export const purchaseSchema = z.object({
  id: z.string(),
  docNo: z.string(),
  orderId: z.string().nullable(),
  poNo: z.string().nullable(),
  sampleId: z.string().nullable(),
  sampleNo: z.string().nullable(),
  customerId: z.string(),
  customerName: z.string(),
  supplier: z.string(),
  category: purchaseCategorySchema,
  status: purchaseStatusSchema,
  orderedAt: z.string(),
  promisedDate: z.string().nullable(),
  receivedAt: z.string().nullable(),
  deliveryPlace: z.string().nullable(),
  note: z.string().nullable(),
  overdue: z.boolean(),
  overdueDays: z.number().int(),
  lineCount: z.number().int(),
  amount: z.number(),
  receivedRate: z.number(),
  cancelledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  ownerId: z.string(),
  ownerName: z.string(),
  createdAt: z.string(),
  version: z.number().int(),
});
export type PurchaseDto = z.infer<typeof purchaseSchema>;

export const purchaseDetailSchema = purchaseSchema.extend({ lines: z.array(purchaseLineSchema), receipts: z.array(purchaseReceiptSchema) });
export type PurchaseDetailDto = z.infer<typeof purchaseDetailSchema>;

export const requirementKeySchema = z.enum(["YARN", "OPP_BAG", "CARTON"]);

export const purchaseRequirementSchema = z.object({
  orderId: z.string(),
  poNo: z.string(),
  totalPairs: z.number().int(),
  pairsPerCarton: z.number().int(),
  pairsPerCartonSource: z.enum(["PLAN", "DEFAULT"]),
  items: z.array(
    z.object({
      key: requirementKeySchema,
      category: purchaseCategorySchema,
      materialId: z.string().nullable(),
      materialCode: z.string().nullable(),
      name: z.string(),
      unit: z.string(),
      basis: z.string(),
      required: z.number(),
      ordered: z.number(),
      received: z.number(),
      shortage: z.number(),
      suggestion: z.string().nullable(),
    }),
  ),
});
export type PurchaseRequirementDto = z.infer<typeof purchaseRequirementSchema>;

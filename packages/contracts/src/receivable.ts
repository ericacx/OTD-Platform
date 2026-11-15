import { z } from "zod";
import { csv, dateSchema, pageQuerySchema } from "./common.js";
import { defineErrors } from "./errors.js";

export const receivableErrors = defineErrors({
  RECEIVABLE_AMOUNT_SIGN: { status: 422, zh: "折让与质量扣款须为负数，其他类型须为正数", en: "Deductions must be negative, other types positive" },
  RECEIVABLE_OVERPAID: { status: 422, zh: "收款金额超过未收余额 {outstanding}", en: "Receipt exceeds outstanding {outstanding}" },
  RECEIVABLE_CURRENCY_MISMATCH: { status: 422, zh: "币种与应收单不一致（{expected}）", en: "Currency must be {expected}" },
  RECEIVABLE_NOT_OFFSET: { status: 409, zh: "负数应收单只能冲抵，不能登记收款", en: "Negative receivables can only be offset" },
  RECEIVABLE_OFFSET_TARGET_INVALID: { status: 422, zh: "冲抵目标须为同客户、同币种、未收清且余额足够的应收单", en: "Offset target must be an open receivable of the same customer and currency with enough balance" },
  RECEIVABLE_CUSTOMER_REQUIRED: { status: 422, zh: "请指定客户或来源订单", en: "Customer or source order required" },
});

export const RECEIVABLE_TYPES = ["GOODS", "DEDUCTION", "FREIGHT", "TESTING", "TRIMS", "SAMPLE"] as const;
export const receivableTypeSchema = z.enum(RECEIVABLE_TYPES);
export type ReceivableType = z.infer<typeof receivableTypeSchema>;

export const RECEIVABLE_STATUSES = ["NOT_DUE", "DUE", "PARTIAL", "PAID", "OFFSET_PENDING", "OFFSET"] as const;
export const receivableStatusSchema = z.enum(RECEIVABLE_STATUSES);
export type ReceivableStatus = z.infer<typeof receivableStatusSchema>;

export const COLLECTION_CHANNELS = ["EMAIL", "PHONE", "WECHAT", "CUSTOMER_SYSTEM"] as const;
export const collectionChannelSchema = z.enum(COLLECTION_CHANNELS);
export const COLLECTION_RESULTS = ["PROMISED", "APPLIED", "DISPUTED", "UNREACHABLE"] as const;
export const collectionResultSchema = z.enum(COLLECTION_RESULTS);
export const COLLECTION_RESULT_LABELS: Record<z.infer<typeof collectionResultSchema>, { zh: string; en: string }> = {
  PROMISED: { zh: "客户承诺付款日", en: "Payment date promised" },
  APPLIED: { zh: "客户已申请付款", en: "Payment requested" },
  DISPUTED: { zh: "争议中", en: "Disputed" },
  UNREACHABLE: { zh: "联系不上", en: "Unreachable" },
};

export const collectionLogSchema = z.object({
  id: z.string(),
  channel: collectionChannelSchema,
  result: collectionResultSchema,
  note: z.string().nullable(),
  nextFollowUp: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
});
export type CollectionLogDto = z.infer<typeof collectionLogSchema>;

export const receiptSchema = z.object({
  id: z.string(),
  amount: z.number(),
  currency: z.string(),
  receivedAt: z.string(),
  method: z.string().nullable(),
  bankRef: z.string().nullable(),
  note: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
});
export type ReceiptDto = z.infer<typeof receiptSchema>;

export const receivableSchema = z.object({
  id: z.string(),
  docNo: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  settlementEntity: z.string().nullable(),
  sourceType: z.string(),
  sourceNo: z.string().nullable(),
  orderId: z.string().nullable(),
  poNo: z.string().nullable(),
  shipmentId: z.string().nullable(),
  shipmentNo: z.string().nullable(),
  invoiceId: z.string().nullable(),
  invoiceNo: z.string().nullable(),
  type: receivableTypeSchema,
  amount: z.number(),
  currency: z.string(),
  dueDate: z.string(),
  receivedAmount: z.number(),
  outstanding: z.number(),
  progress: z.number(),
  status: receivableStatusSchema,
  overdue: z.boolean(),
  overdueDays: z.number().int(),
  disputed: z.boolean(),
  missingData: z.boolean(),
  note: z.string().nullable(),
  collectionCount: z.number().int(),
  lastCollection: z.object({ channel: collectionChannelSchema, result: collectionResultSchema, at: z.string() }).nullable(),
  nextFollowUp: z.string().nullable(),
  ownerId: z.string(),
  ownerName: z.string(),
  createdAt: z.string(),
  version: z.number().int(),
});
export type ReceivableDto = z.infer<typeof receivableSchema>;

export const receivableDetailSchema = receivableSchema.extend({
  receipts: z.array(receiptSchema),
  collections: z.array(collectionLogSchema),
});
export type ReceivableDetailDto = z.infer<typeof receivableDetailSchema>;

export const receivableKpiSchema = z.object({
  balanceUsd: z.number(),
  overdueUsd: z.number(),
  overdueCount: z.number().int(),
  avgOverdueDays: z.number(),
  dueThisMonth: z.number().int(),
  missingData: z.number().int(),
});
export type ReceivableKpiDto = z.infer<typeof receivableKpiSchema>;

export const collectionSummarySchema = z.object({
  overdueUsd: z.number(),
  overdueCount: z.number().int(),
  avgOverdueDays: z.number(),
  todayFollowUps: z.number().int(),
  collectedThisMonthUsd: z.number(),
  untouched: z.number().int(),
  tabs: z.object({ all: z.number().int(), mine: z.number().int(), today: z.number().int(), team: z.number().int() }),
  team: z.array(z.object({ ownerId: z.string(), ownerName: z.string(), overdueCount: z.number().int(), overdueUsd: z.number(), untouched: z.number().int() })),
});
export type CollectionSummaryDto = z.infer<typeof collectionSummarySchema>;

export const invoiceSchema = z.object({
  id: z.string(),
  invoiceNo: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  orderId: z.string().nullable(),
  poNo: z.string().nullable(),
  shipmentId: z.string().nullable(),
  shipmentNo: z.string().nullable(),
  receivableId: z.string().nullable(),
  receivableNo: z.string().nullable(),
  amount: z.number(),
  currency: z.string(),
  issuedDate: z.string(),
  note: z.string().nullable(),
  ownerId: z.string(),
  ownerName: z.string(),
  createdAt: z.string(),
  version: z.number().int(),
});
export type InvoiceDto = z.infer<typeof invoiceSchema>;

const text = (max: number) => z.string().trim().max(max);
const currencySchema = z.string().trim().length(3).toUpperCase();

export const receivableCreateSchema = z.object({
  customerId: z.uuid().optional(),
  orderId: z.uuid().nullable().optional(),
  shipmentId: z.uuid().nullable().optional(),
  type: receivableTypeSchema,
  amount: z.number().refine((v) => v !== 0, "amount must not be 0"),
  currency: currencySchema.optional(),
  dueDate: dateSchema.nullable().optional(),
  settlementEntity: text(160).nullable().optional(),
  sourceNo: text(60).nullable().optional(),
  note: text(500).nullable().optional(),
});

export const receiptCreateSchema = z.object({
  version: z.number().int(),
  amount: z.number().positive(),
  currency: currencySchema.optional(),
  receivedAt: dateSchema,
  method: text(40).nullable().optional(),
  bankRef: text(80).nullable().optional(),
  note: text(500).nullable().optional(),
});

export const offsetSchema = z.object({
  version: z.number().int(),
  targetId: z.uuid(),
  note: text(500).nullable().optional(),
});

export const collectionCreateSchema = z.object({
  channel: collectionChannelSchema,
  result: collectionResultSchema,
  nextFollowUp: dateSchema.nullable().optional(),
  note: text(1000).nullable().optional(),
});

export const disputeSchema = z.object({
  version: z.number().int(),
  disputed: z.boolean(),
  note: text(500).nullable().optional(),
});

export const invoiceCreateSchema = z.object({
  invoiceNo: z.string().trim().min(1).max(60),
  receivableId: z.uuid().nullable().optional(),
  shipmentId: z.uuid().nullable().optional(),
  orderId: z.uuid().nullable().optional(),
  amount: z.number().positive(),
  currency: currencySchema.optional(),
  issuedDate: dateSchema,
  note: text(500).nullable().optional(),
});

const flag = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === true || v === "true" || v === "1"));

export const receivableListQuerySchema = pageQuerySchema.extend({
  customerId: z.uuid().optional(),
  status: csv,
  type: csv,
  settlementEntity: z.string().trim().optional(),
  orderId: z.uuid().optional(),
  overdue: flag,
  missingData: flag,
});

export const COLLECTION_TABS = ["all", "mine", "today", "team"] as const;
export const collectionQuerySchema = pageQuerySchema.extend({
  tab: z.enum(COLLECTION_TABS).default("all"),
  customerId: z.uuid().optional(),
});

export const invoiceListQuerySchema = pageQuerySchema.extend({
  customerId: z.uuid().optional(),
  orderId: z.uuid().optional(),
});

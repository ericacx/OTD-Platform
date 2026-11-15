import { z } from "zod";
import { csv, dateSchema, pageQuerySchema } from "./common.js";
import { defineErrors } from "./errors.js";

export const quoteErrors = defineErrors({
  QUOTE_GUARDRAIL_VIOLATED: { status: 422, zh: "毛利率低于护栏 {guardrail}，不能生成报价", en: "Margin is below the guardrail {guardrail}" },
  QUOTE_OVERRIDE_REASON_REQUIRED: { status: 422, zh: "低于护栏的报价需填写例外理由", en: "A reason is required to override the guardrail" },
  QUOTE_STYLE_EXISTS: { status: 409, zh: "款号 {styleNo} 已有报价单", en: "Style {styleNo} already has a quote" },
  QUOTE_ARCHIVED: { status: 409, zh: "报价单已归档", en: "The quote is archived" },
  QUOTE_FROZEN: { status: 409, zh: "该款已开发移交，报价资料已冻结", en: "The style has been handed over; quote data is frozen" },
  QUOTE_NOT_LATEST_ROUND: { status: 409, zh: "只有最新一轮客户报价可以登记反馈", en: "Only the latest customer round can receive feedback" },
  QUOTE_COST_MISSING: { status: 422, zh: "请先录入成本明细", en: "Enter cost items first" },
  QUOTE_PRICE_REQUIRED: { status: 422, zh: "客户报价需要填写报价（元/双）", en: "A customer round needs a price" },
  QUOTE_STRATEGY_DISABLED: { status: 422, zh: "报价策略 {code} 已停用", en: "Strategy {code} is disabled" },
});

export const quoteMethodSchema = z.enum(["MARKUP", "MARGIN"]);
export type QuoteMethod = z.infer<typeof quoteMethodSchema>;
export const quoteRoundKindSchema = z.enum(["INTERNAL", "CUSTOMER"]);
export type QuoteRoundKind = z.infer<typeof quoteRoundKindSchema>;
export const quoteRoundStatusSchema = z.enum(["DRAFT", "COST_REVIEW", "QUOTED", "ACCEPTED", "REJECTED", "LAPSED"]);
export type QuoteRoundStatus = z.infer<typeof quoteRoundStatusSchema>;
export const costCategorySchema = z.enum(["YARN", "LABOR", "TRIMS", "OTHER"]);
export type CostCategory = z.infer<typeof costCategorySchema>;
export const quoteExportFormSchema = z.enum(["summary", "cost-detail"]);
export type QuoteExportForm = z.infer<typeof quoteExportFormSchema>;

export const QUOTE_FEEDBACK_DAYS = 14;
export const QUOTE_TARGET_TOLERANCE = 0.05;

export const skuTierSchema = z.object({ minAmount: z.number().positive(), discount: z.number().min(0).max(0.5) });

export const strategyParamsSchema = z.object({
  method: quoteMethodSchema,
  lossRate: z.number().min(0).max(1),
  overheadRate: z.number().min(-0.5).max(1),
  markupRate: z.number().min(0).max(5),
  targetMargin: z.number().min(0).lt(1),
  guardrail: z.number().min(0).lt(1),
  lockedFx: z.number().positive().max(1000),
  moq: z.number().int().min(0),
  smallOrderUplift: z.number().min(0).max(5),
  skuTiers: z.array(skuTierSchema).max(10),
});
export type StrategyParams = z.infer<typeof strategyParamsSchema>;

export const quoteStrategySchema = strategyParamsSchema.extend({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  nameEn: z.string().nullable(),
  enabled: z.boolean(),
  usedBy: z.number().int(),
  updatedAt: z.string(),
  version: z.number().int(),
});
export type QuoteStrategyDto = z.infer<typeof quoteStrategySchema>;

export const strategySnapshotSchema = strategyParamsSchema.extend({ code: z.string(), name: z.string(), version: z.number().int() });
export type StrategySnapshotDto = z.infer<typeof strategySnapshotSchema>;

export const quoteStrategyUpsertSchema = strategyParamsSchema.extend({
  name: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().max(120).nullable().optional(),
  enabled: z.boolean().default(true),
  reason: z.string().trim().max(200).optional(),
  version: z.number().int().optional(),
});

export const costItemInputSchema = z
  .object({
    category: costCategorySchema,
    name: z.string().trim().min(1).max(80),
    spec: z.string().trim().max(120).nullable().optional(),
    quantity: z.number().min(0).nullable().optional(),
    unitPrice: z.number().min(0).nullable().optional(),
    amount: z.number().min(0).optional(),
  })
  .refine((v) => v.amount !== undefined || (v.quantity != null && v.unitPrice != null), { message: "amount or quantity × unitPrice required", path: ["amount"] });
export type CostItemInput = z.infer<typeof costItemInputSchema>;

export const costItemSchema = z.object({
  id: z.string(),
  category: costCategorySchema,
  name: z.string(),
  spec: z.string().nullable(),
  quantity: z.number().nullable(),
  unitPrice: z.number().nullable(),
  amount: z.number(),
});
export type CostItemDto = z.infer<typeof costItemSchema>;

export const costBreakdownSchema = z.object({
  yarn: z.number(),
  yarnRaw: z.number(),
  yarnLossRate: z.number(),
  labor: z.number(),
  laborRaw: z.number(),
  overheadRate: z.number(),
  trims: z.number(),
  other: z.number(),
});
export type CostBreakdownDto = z.infer<typeof costBreakdownSchema>;

export const roundPricingSchema = z.object({ basePrice: z.number(), upliftRate: z.number(), skuAmount: z.number(), discountRate: z.number(), suggestedPrice: z.number() });

export const quoteRoundSchema = z.object({
  id: z.string(),
  docNo: z.string(),
  kind: quoteRoundKindSchema,
  roundNo: z.number().int(),
  seq: z.number().int(),
  isLatest: z.boolean(),
  priceCny: z.number(),
  priceUsd: z.number(),
  fx: z.number(),
  quantity: z.number().int(),
  strategyId: z.string().nullable(),
  strategyCode: z.string().nullable(),
  strategy: strategySnapshotSchema.nullable(),
  costTotal: z.number().nullable().optional(),
  margin: z.number().optional(),
  pricing: roundPricingSchema.nullable().optional(),
  guardrailPassed: z.boolean(),
  diffToTargetUsd: z.number().nullable(),
  status: quoteRoundStatusSchema,
  quotedBy: z.string().nullable(),
  quotedByName: z.string().nullable(),
  quotedAt: z.string().nullable(),
  overrideApprovedBy: z.string().nullable(),
  overrideReason: z.string().nullable(),
  feedbackAt: z.string().nullable(),
  feedbackNote: z.string().nullable(),
  note: z.string().nullable(),
  version: z.number().int(),
});
export type QuoteRoundDto = z.infer<typeof quoteRoundSchema>;

export const quoteFileSchema = z.object({ id: z.string(), filename: z.string(), contentType: z.string(), size: z.number().int(), createdAt: z.string() });
export type QuoteFileDto = z.infer<typeof quoteFileSchema>;

export const quoteStrategyRefSchema = strategyParamsSchema.extend({ id: z.string(), code: z.string(), name: z.string(), nameEn: z.string().nullable(), version: z.number().int() });

export const quoteSchema = z.object({
  id: z.string(),
  styleId: z.string(),
  styleNo: z.string(),
  styleName: z.string(),
  styleNameEn: z.string().nullable(),
  productCode: z.string().nullable(),
  seasonCode: z.string().nullable(),
  customerId: z.string(),
  customerName: z.string(),
  factoryId: z.string().nullable(),
  factoryName: z.string().nullable(),
  moq: z.number().int().nullable(),
  status: quoteRoundStatusSchema,
  strategy: quoteStrategyRefSchema.nullable(),
  targetPriceUsd: z.number().nullable(),
  targetFx: z.number().nullable(),
  targetPriceCny: z.number().nullable(),
  targetSource: z.string().nullable(),
  targetDate: z.string().nullable(),
  costTotal: z.number().nullable().optional(),
  costBreakdown: costBreakdownSchema.nullable().optional(),
  costItems: z.array(costItemSchema).optional(),
  internalPrice: z.object({ docNo: z.string(), priceCny: z.number(), priceUsd: z.number() }).nullable().optional(),
  internalRounds: z.array(quoteRoundSchema).optional(),
  customerRounds: z.array(quoteRoundSchema),
  latestCustomerRound: quoteRoundSchema.nullable(),
  roundCounts: z.object({ internal: z.number().int(), customer: z.number().int() }),
  files: z.array(quoteFileSchema),
  handoverStatus: z.enum(["COLLECTING", "HANDED_OVER"]).nullable(),
  note: z.string().nullable(),
  ownerId: z.string(),
  ownerName: z.string(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int(),
});
export type QuoteDto = z.infer<typeof quoteSchema>;

export const quoteListItemSchema = z.object({
  id: z.string(),
  styleId: z.string(),
  styleNo: z.string(),
  styleName: z.string(),
  seasonCode: z.string().nullable(),
  customerId: z.string(),
  customerName: z.string(),
  factoryName: z.string().nullable(),
  status: quoteRoundStatusSchema,
  strategyCode: z.string().nullable(),
  latestDocNo: z.string().nullable(),
  latestSeq: z.number().int().nullable(),
  latestPriceCny: z.number().nullable(),
  latestPriceUsd: z.number().nullable(),
  latestQuantity: z.number().int().nullable(),
  latestMargin: z.number().nullable().optional(),
  latestQuotedAt: z.string().nullable(),
  roundCount: z.number().int(),
  ownerId: z.string(),
  ownerName: z.string(),
  archivedAt: z.string().nullable(),
  updatedAt: z.string(),
  version: z.number().int(),
});
export type QuoteListItemDto = z.infer<typeof quoteListItemSchema>;

export const quoteListQuerySchema = pageQuerySchema.extend({
  status: csv,
  customerId: z.uuid().optional(),
  seasonCode: z.string().trim().optional(),
  ownerId: z.uuid().optional(),
  archived: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

export const quoteCreateSchema = z.object({
  styleId: z.uuid(),
  strategyId: z.uuid(),
  factoryId: z.uuid().nullable().optional(),
  moq: z.number().int().min(0).nullable().optional(),
  targetPriceUsd: z.number().positive().nullable().optional(),
  targetFx: z.number().positive().nullable().optional(),
  targetSource: z.string().trim().max(60).nullable().optional(),
  targetDate: dateSchema.nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  costItems: z.array(costItemInputSchema).max(100).optional(),
});

export const quoteUpdateSchema = z.object({
  strategyId: z.uuid().optional(),
  factoryId: z.uuid().nullable().optional(),
  moq: z.number().int().min(0).nullable().optional(),
  targetPriceUsd: z.number().positive().nullable().optional(),
  targetFx: z.number().positive().nullable().optional(),
  targetSource: z.string().trim().max(60).nullable().optional(),
  targetDate: dateSchema.nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  costItems: z.array(costItemInputSchema).max(100).optional(),
  version: z.number().int(),
});

export const quoteRoundCreateSchema = z.object({
  kind: quoteRoundKindSchema,
  quantity: z.number().int().min(1),
  strategyId: z.uuid().optional(),
  priceCny: z.number().positive().optional(),
  note: z.string().max(500).nullable().optional(),
  overrideReason: z.string().trim().min(2).max(300).optional(),
  version: z.number().int(),
});

export const quoteFeedbackSchema = z.object({
  result: z.enum(["ACCEPTED", "REJECTED"]),
  note: z.string().max(500).nullable().optional(),
  version: z.number().int(),
});

export const quoteArchiveSchema = z.object({ version: z.number().int() });
export const quoteAttachFileSchema = z.object({ fileId: z.uuid(), version: z.number().int() });

export const quotePreviewSchema = z
  .object({
    quoteId: z.uuid().optional(),
    costItems: z.array(costItemInputSchema).max(100).optional(),
    targetPriceUsd: z.number().positive().nullable().optional(),
    strategyId: z.uuid().optional(),
    quantity: z.number().int().min(1),
    priceCny: z.number().positive().optional(),
  })
  .refine((v) => !!v.quoteId || (!!v.costItems && !!v.strategyId), { message: "quoteId or costItems + strategyId required", path: ["quoteId"] });

export const quoteCheckSchema = z.object({
  priceCny: z.number(),
  priceUsd: z.number(),
  margin: z.number().optional(),
  guardrail: z.number(),
  guardrailPassed: z.boolean(),
  targetMargin: z.number(),
  targetMarginMet: z.boolean(),
  moq: z.number().int(),
  belowMoq: z.boolean(),
  targetPriceUsd: z.number().nullable(),
  diffToTargetUsd: z.number().nullable(),
  overTargetTolerance: z.boolean(),
  canOverride: z.boolean(),
  canSubmit: z.boolean(),
});
export type QuoteCheckDto = z.infer<typeof quoteCheckSchema>;

export const quotePreviewResultSchema = z.object({
  strategy: strategySnapshotSchema,
  fx: z.number(),
  quantity: z.number().int(),
  costTotal: z.number().optional(),
  costBreakdown: costBreakdownSchema.optional(),
  suggested: roundPricingSchema.extend({ priceUsd: z.number() }).optional(),
  check: quoteCheckSchema.nullable(),
});
export type QuotePreviewDto = z.infer<typeof quotePreviewResultSchema>;

export const styleOptionQuerySchema = z.object({
  keyword: z.string().trim().optional(),
  customerId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const styleOptionSchema = z.object({
  id: z.string(),
  styleNo: z.string(),
  nameZh: z.string(),
  nameEn: z.string().nullable(),
  seasonCode: z.string().nullable(),
  productCode: z.string().nullable(),
  customerId: z.string(),
  customerName: z.string(),
  quoteId: z.string().nullable(),
  handoverId: z.string().nullable(),
});
export type StyleOptionDto = z.infer<typeof styleOptionSchema>;

import { z } from "zod";
import { csv, dateSchema, pageQuerySchema } from "./common.js";
import { defineErrors } from "./errors.js";
import { roundTypeSchema } from "./sample.js";

export const planningErrors = defineErrors({
  PLANNING_FILE_REQUIRED: { status: 422, zh: "请上传企划原件", en: "Please upload the brief file" },
  PLANNING_FILE_UNSUPPORTED: { status: 422, zh: "仅支持 PDF、PNG / JPG 图片或文本格式的企划原件", en: "Only PDF, PNG / JPG or text briefs are supported" },
  PLANNING_NOT_EDITABLE: { status: 409, zh: "当前状态「{status}」不可编辑", en: "Brief in status {status} cannot be edited" },
  PLANNING_CONFIRM_INCOMPLETE: { status: 422, zh: "确认前请补全：{fields}", en: "Please complete before confirming: {fields}" },
  PLANNING_NO_SOURCE: { status: 409, zh: "该企划没有原件，无法重新识别", en: "No source file to recognize" },
  PLANNING_STYLE_HAS_ORDERS: { status: 409, zh: "款 #{styleNo} 已有订单，不能归档", en: "Style #{styleNo} has orders and cannot be archived" },
});

export const PLANNING_STATUSES = ["RECOGNIZING", "EXTRACTED", "CONFIRMED", "ARCHIVED", "RECOGNITION_FAILED"] as const;
export const planningStatusSchema = z.enum(PLANNING_STATUSES);
export type PlanningStatus = z.infer<typeof planningStatusSchema>;

export const LOW_CONFIDENCE = 0.8;

export const PLANNING_FIELDS = [
  "nameZh",
  "nameEn",
  "customerName",
  "styleNo",
  "seasonCode",
  "category",
  "subCategory",
  "sizeRange",
  "defaultSize",
  "needleCount",
  "sockWeight",
  "requiredSampleDate",
  "supplier",
  "buyerName",
  "designer",
] as const;
export type PlanningField = (typeof PLANNING_FIELDS)[number];

export const PRODUCT_ATTRS = [
  { key: "needleCount", zh: "针数", en: "Needle Count" },
  { key: "cylinder", zh: "针筒", en: "Cylinder" },
  { key: "nahmSize", zh: "NAHM 尺码", en: "NAHM Size" },
  { key: "cuff", zh: "罗口", en: "Cuff" },
  { key: "footCushion", zh: "脚底缓冲", en: "Foot Cushion" },
  { key: "heel", zh: "跟部", en: "Heel" },
  { key: "toeSeam", zh: "袜头缝", en: "Toe Seam" },
  { key: "leftRight", zh: "左右脚区分", en: "Left/Right Sock" },
] as const;
export const PRODUCT_ATTR_KEYS = ["needleCount", "cylinder", "nahmSize", "cuff", "footCushion", "heel", "toeSeam", "leftRight"] as const;
export const productAttrKeySchema = z.enum(PRODUCT_ATTR_KEYS);
export type ProductAttrKey = z.infer<typeof productAttrKeySchema>;

const aiFieldSchema = z.object({
  value: z.string().nullable(),
  confidence: z.number(),
  source: z.string().nullable(),
  page: z.number().int().nullable(),
});
export type AiExtractedField = z.infer<typeof aiFieldSchema>;

export const planningExtractionSchema = z.object({
  fields: z.object({
    nameZh: aiFieldSchema,
    nameEn: aiFieldSchema,
    customerName: aiFieldSchema,
    styleNo: aiFieldSchema,
    seasonCode: aiFieldSchema,
    category: aiFieldSchema,
    subCategory: aiFieldSchema,
    sizeRange: aiFieldSchema,
    defaultSize: aiFieldSchema,
    needleCount: aiFieldSchema,
    sockWeight: aiFieldSchema,
    requiredSampleDate: aiFieldSchema,
    supplier: aiFieldSchema,
    buyerName: aiFieldSchema,
    designer: aiFieldSchema,
  }),
  productAttrs: z.array(
    z.object({
      key: productAttrKeySchema,
      original: z.string().nullable(),
      translated: z.string().nullable(),
      confidence: z.number(),
      page: z.number().int().nullable(),
    }),
  ),
  briefTranslation: z.string().nullable(),
});
export type PlanningExtraction = z.infer<typeof planningExtractionSchema>;

export const PLANNING_EXTRACT_INSTRUCTIONS = [
  "你是针织袜业企业的企划录入助手。阅读客户发来的企划原件（Tech Pack），按给定 JSON 结构抽取要素。",
  "规则：",
  "1. 只抽取原件里写明的信息，没有写的字段 value 填 null、confidence 填 0，不要猜测。",
  "2. confidence 取 0 到 1：原文明确写出为 0.9 以上；需要换算或推断为 0.5 到 0.8；看不清或有歧义低于 0.5。",
  "3. source 填原文片段（不超过 80 字），page 填原件页码（从 1 开始），找不到时填 null。",
  "4. nameZh 为中文品名（原件只有英文时翻译成简洁的中文品名），nameEn 为英文品名原文。",
  "5. styleNo 只填客户款号数字或编号本身，不带 #。seasonCode 用季节编码：SS/SP/SU/FA/AW/HO + 两位年份，如 Fall 2027 写 FA27。",
  "6. category 只能是 KIDS（童袜）、WOMEN（女袜）、MEN（男袜）之一；subCategory 只能是 CREW、NO_SHOW、ANKLE、QUARTER、HALF_CALF 之一；判断不了填 null。",
  "7. needleCount 写成如 144N；sockWeight 写成如 Light 薄款 / Medium 中厚 / Heavy 厚款；sizeRange 写成如 S / M / L；requiredSampleDate 用 YYYY-MM-DD。",
  "8. productAttrs 对 needleCount、cylinder、nahmSize、cuff、footCushion、heel、toeSeam、leftRight 每项各给一条：original 为原文，translated 为中文译文，客户未填的项 original 与 translated 都填 null。",
  "9. briefTranslation 用中文概括企划要点（款式、工艺、纱线、特殊要求），200 字以内；原件为空白时填 null。",
].join("\n");

export const productAttrSchema = z.object({
  key: productAttrKeySchema,
  labelZh: z.string(),
  labelEn: z.string(),
  original: z.string().nullable(),
  translated: z.string().nullable(),
  confidence: z.number().nullable(),
});
export type ProductAttrDto = z.infer<typeof productAttrSchema>;

export const extractedFieldSchema = z.object({
  value: z.union([z.string(), z.number()]).nullable(),
  confidence: z.number(),
  source: z.string().nullable(),
  page: z.number().nullable(),
});

export const planningSchema = z.object({
  id: z.string(),
  docNo: z.string(),
  status: planningStatusSchema,
  styleId: z.string().nullable(),
  styleNo: z.string().nullable(),
  seasonCode: z.string().nullable(),
  customerId: z.string(),
  customerName: z.string(),
  nameZh: z.string().nullable(),
  nameEn: z.string().nullable(),
  category: z.string().nullable(),
  subCategory: z.string().nullable(),
  defaultSize: z.string().nullable(),
  sizeRange: z.string().nullable(),
  supplier: z.string().nullable(),
  buyerName: z.string().nullable(),
  designer: z.string().nullable(),
  needleCount: z.string().nullable(),
  sockWeight: z.string().nullable(),
  requiredSampleDate: z.string().nullable(),
  briefTranslation: z.string().nullable(),
  productAttrs: z.array(productAttrSchema),
  extraction: z.record(z.string(), extractedFieldSchema).nullable(),
  lowConfidenceFields: z.array(z.string()),
  sourceFile: z.object({ id: z.string(), filename: z.string() }).nullable(),
  imageFileIds: z.array(z.string()),
  recognitionError: z.string().nullable(),
  recognizedAt: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  confirmedByName: z.string().nullable(),
  archivedAt: z.string().nullable(),
  sample: z.object({ id: z.string(), docNo: z.string() }).nullable(),
  ownerId: z.string(),
  ownerName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int(),
});
export type PlanningDto = z.infer<typeof planningSchema>;

const text = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalDate = z.preprocess((v) => (v === "" ? null : v), dateSchema.nullable().optional());

export const planningFieldsSchema = z.object({
  styleNo: z.preprocess((v) => (typeof v === "string" ? v.trim().replace(/^#/, "") : v), z.string().max(40).nullable().optional()),
  seasonCode: text(8),
  nameZh: text(120),
  nameEn: text(200),
  category: text(40),
  subCategory: text(40),
  defaultSize: text(40),
  sizeRange: text(80),
  supplier: text(120),
  buyerName: text(60),
  designer: text(60),
  needleCount: text(20),
  sockWeight: text(40),
  requiredSampleDate: optionalDate,
  briefTranslation: text(4000),
});

export const planningCreateSchema = planningFieldsSchema.extend({
  customerId: z.uuid(),
  fileId: z.uuid().nullable().optional(),
});

export const planningImportFieldsSchema = planningFieldsSchema.extend({
  customerId: z.uuid(),
});

export const planningUpdateSchema = planningFieldsSchema.extend({
  productAttrs: z.partialRecord(productAttrKeySchema, z.object({ original: z.string().trim().max(500).nullable().optional(), translated: z.string().trim().max(500).nullable().optional() })).optional(),
  version: z.number().int(),
});

export const planningConfirmSchema = z.object({
  version: z.number().int(),
  factoryId: z.uuid().nullable().optional(),
  roundType: roundTypeSchema.optional(),
  quantity: z.number().int().min(1).max(10000).optional(),
});

export const planningVersionSchema = z.object({ version: z.number().int() });

export const planningListQuerySchema = pageQuerySchema.extend({
  status: csv,
  seasonCode: z.string().optional(),
  category: z.string().optional(),
  customerId: z.uuid().optional(),
});

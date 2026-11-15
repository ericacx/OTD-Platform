import { GATES } from "@otd/shared";
import { z } from "zod";
import { csv, labelSchema, pageQuerySchema } from "./common.js";
import { defineErrors } from "./errors.js";

export const documentErrors = defineErrors({
  DOCUMENT_HANDOVER_EXISTS: { status: 409, zh: "款号 {styleNo} 已有开发移交包 {docNo}", en: "Style {styleNo} already has handover package {docNo}" },
  DOCUMENT_HANDOVER_FROZEN: { status: 409, zh: "开发移交包已移交冻结，修改请先发起开发变更", en: "The handover package is frozen; raise a change request first" },
});

export const HANDOVER_STALE_DAYS = 7;

export const handoverItemKeySchema = z.enum(["sampleApproved", "quoteAccepted", "testReportValid", "qrsRetained", "techPackUploaded"]);
export type HandoverItemKey = z.infer<typeof handoverItemKeySchema>;

const MISSING: Record<HandoverItemKey, { zh: string; en: string }> = {
  sampleApproved: { zh: "没有已批准的打样轮次", en: "No approved sample round" },
  quoteAccepted: { zh: "没有客户已接受的报价轮次", en: "No accepted customer quote" },
  testReportValid: { zh: "没有在有效期内且合格的测试报告", en: "No valid passing test report" },
  qrsRetained: { zh: "样品库没有 QRS 品质参考样留存记录", en: "No QRS sample in the library" },
  techPackUploaded: { zh: "尚未上传技术资料包", en: "Tech pack not uploaded" },
};

export const HANDOVER_NOT_APPLICABLE = { zh: "不适用（客户流程未启用）", en: "Not applicable (not enabled in the customer flow)" };

export const HANDOVER_ITEMS: { key: HandoverItemKey; label: { zh: string; en: string }; missing: { zh: string; en: string } }[] = GATES.G1.conditions.map((c) => ({
  key: c.key,
  label: { zh: c.label.zh, en: c.label.en },
  missing: MISSING[c.key],
}));

export const handoverStatusSchema = z.enum(["COLLECTING", "HANDED_OVER"]);
export type HandoverStatus = z.infer<typeof handoverStatusSchema>;

export const handoverCheckSchema = z.object({
  key: handoverItemKeySchema,
  label: labelSchema,
  applicable: z.boolean(),
  ok: z.boolean(),
  ref: z.string().nullable(),
  refId: z.string().nullable(),
  note: z.string().nullable(),
});
export type HandoverCheckDto = z.infer<typeof handoverCheckSchema>;

export const fileRefSchema = z.object({ id: z.string(), filename: z.string(), contentType: z.string(), size: z.number().int() });
export type FileRefDto = z.infer<typeof fileRefSchema>;

export const handoverChangeEntrySchema = z.object({ at: z.string(), by: z.string(), byName: z.string(), reason: z.string() });

export const handoverSnapshotSchema = z.object({
  styleId: z.string(),
  styleNo: z.string(),
  sampleRoundIds: z.array(z.string()),
  sampleRef: z.string().nullable(),
  quoteRoundId: z.string().nullable(),
  quoteDocNo: z.string().nullable(),
  reportIds: z.array(z.string()),
  reportRef: z.string().nullable(),
  qrsLibraryId: z.string().nullable(),
  techPackFileId: z.string().nullable(),
  conditions: z.array(handoverItemKeySchema).optional(),
  flowVersionId: z.string().nullable().optional(),
  checkedAt: z.string(),
});
export type HandoverSnapshotDto = z.infer<typeof handoverSnapshotSchema>;

export const handoverSchema = z.object({
  id: z.string(),
  docNo: z.string(),
  styleId: z.string(),
  styleNo: z.string(),
  styleName: z.string(),
  seasonCode: z.string().nullable(),
  customerId: z.string(),
  customerName: z.string(),
  ownerId: z.string(),
  ownerName: z.string(),
  status: handoverStatusSchema,
  checklist: z.array(handoverCheckSchema),
  ready: z.boolean(),
  missing: z.array(z.string()),
  okCount: z.number().int(),
  applicableCount: z.number().int(),
  techPackFile: fileRefSchema.nullable(),
  frozenAt: z.string().nullable(),
  completedBy: z.string().nullable(),
  completedByName: z.string().nullable(),
  snapshot: handoverSnapshotSchema.nullable(),
  changeLog: z.array(handoverChangeEntrySchema),
  collectingSince: z.string(),
  collectingDays: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int(),
});
export type HandoverDto = z.infer<typeof handoverSchema>;

export const handoverListQuerySchema = pageQuerySchema.extend({
  status: csv,
  customerId: z.uuid().optional(),
});

export const handoverCreateSchema = z.object({ styleId: z.uuid(), techPackFileId: z.uuid().nullable().optional() });
export const handoverTechPackSchema = z.object({ fileId: z.uuid(), version: z.number().int() });
export const handoverCompleteSchema = z.object({ version: z.number().int() });
export const handoverChangeSchema = z.object({ reason: z.string().trim().min(2).max(300), version: z.number().int() });

export const kbKindSchema = z.enum(["MANUAL", "KB"]);
export type KbKind = z.infer<typeof kbKindSchema>;

export const kbDocumentSchema = z.object({
  id: z.string(),
  kind: kbKindSchema,
  title: z.string(),
  customerId: z.string().nullable(),
  customerName: z.string().nullable(),
  tags: z.array(z.string()),
  content: z.string(),
  excerpt: z.string(),
  file: fileRefSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedByName: z.string().nullable(),
  version: z.number().int(),
});
export type KbDocumentDto = z.infer<typeof kbDocumentSchema>;

export const kbDocumentUpsertSchema = z.object({
  kind: kbKindSchema,
  title: z.string().trim().min(1).max(120),
  customerId: z.uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  content: z.string().max(50_000).default(""),
  fileId: z.uuid().nullable().optional(),
  version: z.number().int().optional(),
});

export const kbListQuerySchema = pageQuerySchema.extend({
  kind: kbKindSchema.optional(),
  customerId: z.uuid().optional(),
  tag: z.string().trim().max(30).optional(),
});

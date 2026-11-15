import { z } from "zod";
import { csv, dateSchema, pageQuerySchema } from "./common.js";
import { defineErrors } from "./errors.js";

export const factoryauditErrors = defineErrors({
  FACTORYAUDIT_OPEN_FINDINGS: { status: 409, zh: "还有 {count} 项整改未关闭，不能关闭审计", en: "{count} findings are still open" },
  FACTORYAUDIT_RESULT_REQUIRED: { status: 422, zh: "请先登记审计结果", en: "Record the audit result first" },
  FACTORYAUDIT_CUSTOMER_REQUIRED: { status: 422, zh: "该工厂暂无服务客户，请选择客户", en: "This factory has no customer yet, choose one" },
  FACTORYAUDIT_FINDING_CLOSED: { status: 409, zh: "整改项已关闭", en: "Finding already closed" },
});

export const AUDIT_TYPES = {
  SOCIAL: { zh: "社会责任", en: "Social compliance" },
  QUALITY: { zh: "质量体系", en: "Quality system" },
  CUSTOMER: { zh: "客户验厂", en: "Customer audit" },
  SECURITY: { zh: "反恐", en: "Security" },
} as const;
export const auditTypeSchema = z.enum(["SOCIAL", "QUALITY", "CUSTOMER", "SECURITY"]);
export type AuditType = z.infer<typeof auditTypeSchema>;

export const AUDIT_RESULTS = {
  PASS: { zh: "通过", en: "Pass" },
  CONDITIONAL: { zh: "有条件通过", en: "Conditional pass" },
  FAIL: { zh: "不通过", en: "Fail" },
} as const;
export const auditResultSchema = z.enum(["PASS", "CONDITIONAL", "FAIL"]);
export type AuditResult = z.infer<typeof auditResultSchema>;

export const auditStatusSchema = z.enum(["PLANNED", "IN_PROGRESS", "RECTIFYING", "CLOSED"]);
export type AuditStatus = z.infer<typeof auditStatusSchema>;

export const findingSeveritySchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export const findingStatusSchema = z.enum(["OPEN", "CLOSED"]);

export const FINDING_STATUSES = {
  OPEN: { zh: "待整改", en: "Open" },
  CLOSED: { zh: "已关闭", en: "Closed" },
} as const;

export const findingSchema = z.object({
  id: z.string(),
  auditId: z.string(),
  auditDocNo: z.string(),
  auditStatus: auditStatusSchema,
  factoryId: z.string(),
  factoryName: z.string(),
  customerName: z.string(),
  item: z.string(),
  severity: findingSeveritySchema,
  correctiveAction: z.string().nullable(),
  responsible: z.string().nullable(),
  dueDate: z.string().nullable(),
  status: findingStatusSchema,
  overdue: z.boolean(),
  overdueDays: z.number().int(),
  closedAt: z.string().nullable(),
  closeNote: z.string().nullable(),
  version: z.number().int(),
});
export type FindingDto = z.infer<typeof findingSchema>;

export const factoryAuditSchema = z.object({
  id: z.string(),
  docNo: z.string(),
  factoryId: z.string(),
  factoryCode: z.string(),
  factoryName: z.string(),
  baseName: z.string(),
  auditType: auditTypeSchema,
  plannedDate: z.string().nullable(),
  actualDate: z.string().nullable(),
  auditor: z.string().nullable(),
  result: auditResultSchema.nullable(),
  score: z.number().nullable(),
  certificateValidUntil: z.string().nullable(),
  status: auditStatusSchema,
  note: z.string().nullable(),
  customerId: z.string(),
  customerName: z.string(),
  ownerId: z.string(),
  ownerName: z.string(),
  findingCount: z.number().int(),
  openFindingCount: z.number().int(),
  overdueFindingCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int(),
});
export type FactoryAuditDto = z.infer<typeof factoryAuditSchema>;

export const factoryAuditDetailSchema = factoryAuditSchema.extend({ findings: z.array(findingSchema) });
export type FactoryAuditDetailDto = z.infer<typeof factoryAuditDetailSchema>;

export const auditListQuerySchema = pageQuerySchema.extend({
  status: csv,
  auditType: auditTypeSchema.optional(),
  factoryId: z.uuid().optional(),
  customerId: z.uuid().optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

export const findingListQuerySchema = pageQuerySchema.extend({
  status: findingStatusSchema.optional(),
  severity: findingSeveritySchema.optional(),
  overdue: z.enum(["true", "false"]).optional(),
  auditId: z.uuid().optional(),
  factoryId: z.uuid().optional(),
});

export const auditCreateSchema = z.object({
  factoryId: z.uuid(),
  auditType: auditTypeSchema,
  plannedDate: dateSchema,
  auditor: z.string().trim().max(120).nullable().optional(),
  customerId: z.uuid().optional(),
  note: z.string().max(500).nullable().optional(),
});
export const auditUpdateSchema = auditCreateSchema.extend({ version: z.number().int().min(1) });
export const auditStartSchema = z.object({ actualDate: dateSchema.optional(), version: z.number().int().min(1) });
export const auditRecordSchema = z.object({
  actualDate: dateSchema,
  result: auditResultSchema,
  score: z.number().min(0).max(100).nullable().optional(),
  certificateValidUntil: dateSchema.nullable().optional(),
  auditor: z.string().trim().max(120).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  version: z.number().int().min(1),
});
export const auditCloseSchema = z.object({ note: z.string().max(500).optional(), version: z.number().int().min(1) });

export const findingCreateSchema = z.object({
  item: z.string().trim().min(1).max(200),
  severity: findingSeveritySchema,
  correctiveAction: z.string().max(500).nullable().optional(),
  responsible: z.string().trim().max(60).nullable().optional(),
  dueDate: dateSchema.nullable().optional(),
});
export const findingUpdateSchema = findingCreateSchema.extend({ version: z.number().int().min(1) });
export const findingCloseSchema = z.object({ closeNote: z.string().max(500).optional(), version: z.number().int().min(1) });

import { z } from "zod";
import { csv, dateSchema, pageQuerySchema } from "./common.js";
import { defineErrors } from "./errors.js";

export const testingErrors = defineErrors({
  TESTING_REPORT_NOT_REUSABLE: { status: 422, zh: "报告 {reportNo} 不满足复用条件：{reasons}", en: "Report {reportNo} cannot be reused: {reasons}" },
  TESTING_NOT_EDITABLE: { status: 409, zh: "当前状态「{status}」不可修改送测信息", en: "Test request in status {status} cannot be edited" },
  TESTING_RETEST_NOT_ALLOWED: { status: 409, zh: "只有结论为不合格的测试可以发起重测", en: "Only failed tests can be retested" },
  TESTING_VALIDITY_INVALID: { status: 422, zh: "有效期至不能早于出具日", en: "Valid-until must not be earlier than the issue date" },
  TESTING_DUPLICATE_REPORT: { status: 409, zh: "机构报告号 {agencyReportNo} 已登记", en: "Agency report {agencyReportNo} already registered" },
});

export const TEST_ITEMS = ["FIBER", "COLORFAST", "PILLING", "FUNCTIONAL", "PH", "SAFETY", "YARN"] as const;
export const testItemSchema = z.enum(TEST_ITEMS);
export type TestItem = z.infer<typeof testItemSchema>;
export const TEST_ITEM_LABELS: Record<TestItem, { zh: string; en: string }> = {
  FIBER: { zh: "成分检测", en: "Fiber content" },
  COLORFAST: { zh: "色牢度", en: "Color fastness" },
  PILLING: { zh: "起毛起球", en: "Pilling" },
  FUNCTIONAL: { zh: "功能性检测", en: "Functional" },
  PH: { zh: "pH 值", en: "pH" },
  SAFETY: { zh: "安全 / 毒性", en: "Safety" },
  YARN: { zh: "纱线测试", en: "Yarn test" },
};

export const TEST_REQUEST_STATUSES = ["DRAFT", "AWAITING_SAMPLE", "TESTING", "COMPLETED"] as const;
export const testRequestStatusSchema = z.enum(TEST_REQUEST_STATUSES);
export type TestRequestStatus = z.infer<typeof testRequestStatusSchema>;

export const REPORT_STATUSES = ["VALID", "EXPIRING", "EXPIRED"] as const;
export const reportStatusSchema = z.enum(REPORT_STATUSES);
export type ReportStatus = z.infer<typeof reportStatusSchema>;

export const testStageSchema = z.enum(["DEV", "BULK"]);
export const entrustSchema = z.enum(["CUSTOMER_PLATFORM", "FACTORY"]);
export const testResultSchema = z.enum(["PASS", "FAIL"]);
export const reuseKeySchema = z.object({ structure: z.string().trim().max(120).optional(), craft: z.string().trim().max(120).optional(), yarn: z.string().trim().max(120).optional() });
export type ReuseKey = z.infer<typeof reuseKeySchema>;

export const reportSummarySchema = z.object({
  id: z.string(),
  docNo: z.string(),
  agencyReportNo: z.string(),
  agencyId: z.string().nullable(),
  agencyName: z.string().nullable(),
  styleId: z.string(),
  styleNo: z.string(),
  styleNameZh: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  items: z.array(z.string()),
  result: testResultSchema,
  failedItems: z.string().nullable(),
  issuedDate: z.string(),
  validUntil: z.string(),
  daysToExpire: z.number().int(),
  status: reportStatusSchema,
  fileId: z.string().nullable(),
  reuseKey: reuseKeySchema,
  linkedStyles: z.array(z.object({ id: z.string(), styleNo: z.string() })),
  testRequestId: z.string().nullable(),
  testRequestDocNo: z.string().nullable(),
  createdAt: z.string(),
  version: z.number().int(),
});
export type TestReportDto = z.infer<typeof reportSummarySchema>;

export const testStepSchema = z.object({
  key: z.enum(["APPLY", "LAB", "REPORT", "RESULT"]),
  state: z.enum(["DONE", "ACTIVE", "PENDING"]),
  at: z.string().nullable(),
  description: z.string().nullable(),
});

export const testRequestSchema = z.object({
  id: z.string(),
  docNo: z.string(),
  styleId: z.string(),
  styleNo: z.string(),
  styleNameZh: z.string(),
  styleNameEn: z.string().nullable(),
  styleImageFileId: z.string().nullable(),
  customerId: z.string(),
  customerName: z.string(),
  customerPo: z.string().nullable(),
  colorSize: z.string().nullable(),
  stage: testStageSchema,
  entrust: entrustSchema.nullable(),
  agencyId: z.string().nullable(),
  agencyName: z.string().nullable(),
  serviceLevel: z.string().nullable(),
  items: z.array(z.string()),
  standard: z.string().nullable(),
  sampleQty: z.number().int().nullable(),
  sampleSite: z.string().nullable(),
  sentDate: z.string().nullable(),
  labReceivedDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  completedDate: z.string().nullable(),
  trackingNo: z.string().nullable(),
  senderId: z.string().nullable(),
  senderName: z.string().nullable(),
  factoryId: z.string().nullable(),
  factoryName: z.string().nullable(),
  seasonCode: z.string().nullable(),
  status: testRequestStatusSchema,
  result: testResultSchema.nullable(),
  failedItems: z.string().nullable(),
  correctiveAction: z.string().nullable(),
  resultNote: z.string().nullable(),
  overdue: z.boolean(),
  overdueDays: z.number().int(),
  report: reportSummarySchema.nullable(),
  reusedReport: reportSummarySchema.nullable(),
  retestOf: z.object({ id: z.string(), docNo: z.string() }).nullable(),
  retests: z.array(z.object({ id: z.string(), docNo: z.string(), status: testRequestStatusSchema })),
  steps: z.array(testStepSchema),
  ownerId: z.string(),
  ownerName: z.string(),
  createdAt: z.string(),
  version: z.number().int(),
});
export type TestRequestDto = z.infer<typeof testRequestSchema>;

export const testRequestDetailSchema = testRequestSchema.extend({
  relatedReports: z.array(reportSummarySchema),
});
export type TestRequestDetailDto = z.infer<typeof testRequestDetailSchema>;

export const reuseMatchSchema = z.object({
  report: reportSummarySchema,
  sameCustomer: z.boolean(),
  sameStyle: z.boolean(),
  sameStructure: z.boolean(),
  sameCraft: z.boolean(),
  sameYarn: z.boolean(),
  inValidity: z.boolean(),
  passed: z.boolean(),
  coveredItems: z.array(z.string()),
  missingItems: z.array(z.string()),
  reusable: z.boolean(),
  reasons: z.array(z.string()),
});
export type ReuseMatchDto = z.infer<typeof reuseMatchSchema>;

export const reuseCheckResultSchema = z.object({
  styleId: z.string(),
  items: z.array(z.string()),
  reuseKey: reuseKeySchema,
  candidates: z.array(reuseMatchSchema),
  coverage: z.array(z.object({ item: z.string(), reportId: z.string().nullable(), reportDocNo: z.string().nullable() })),
  bestReportId: z.string().nullable(),
});
export type ReuseCheckResultDto = z.infer<typeof reuseCheckResultSchema>;

const text = (max: number) => z.string().trim().max(max).nullable().optional();

export const testRequestFieldsSchema = z.object({
  customerPo: text(60),
  colorSize: text(120),
  stage: testStageSchema.default("DEV"),
  entrust: entrustSchema.nullable().optional(),
  agencyId: z.uuid().nullable().optional(),
  serviceLevel: text(60),
  items: z.array(testItemSchema).min(1),
  standard: text(200),
  sampleQty: z.number().int().min(0).max(10000).nullable().optional(),
  sampleSite: text(120),
  sentDate: dateSchema.nullable().optional(),
  dueDate: dateSchema.nullable().optional(),
  trackingNo: text(60),
  factoryId: z.uuid().nullable().optional(),
  seasonCode: text(8),
});

export const testRequestCreateSchema = testRequestFieldsSchema.extend({
  styleId: z.uuid(),
  reuseReportId: z.uuid().nullable().optional(),
  reuseKey: reuseKeySchema.optional(),
});

export const testRequestUpdateSchema = testRequestFieldsSchema.partial().extend({ version: z.number().int() });

export const testSubmitSchema = z.object({ sentDate: dateSchema.optional(), trackingNo: text(60), version: z.number().int() });
export const testReceiveSchema = z.object({ labReceivedDate: dateSchema.optional(), dueDate: dateSchema.optional(), trackingNo: text(60), version: z.number().int() });

export const reportInputSchema = z.object({
  agencyReportNo: z.string().trim().min(1).max(60),
  issuedDate: dateSchema,
  validUntil: dateSchema.optional(),
  fileId: z.uuid().nullable().optional(),
  items: z.array(testItemSchema).min(1).optional(),
  reuseKey: reuseKeySchema.optional(),
});

export const testCompleteSchema = z.object({
  result: testResultSchema,
  failedItems: text(1000),
  correctiveAction: text(1000),
  resultNote: text(500),
  completedDate: dateSchema.optional(),
  report: reportInputSchema,
  version: z.number().int(),
});

export const testRetestSchema = z.object({ version: z.number().int() });

export const reuseCheckSchema = z.object({
  styleId: z.uuid(),
  items: z.array(testItemSchema).min(1),
  reuseKey: reuseKeySchema.optional(),
});

export const testRequestListQuerySchema = pageQuerySchema.extend({
  status: csv,
  customerId: z.uuid().optional(),
  stage: z.string().optional(),
  styleId: z.uuid().optional(),
  result: z.string().optional(),
});

export const reportCreateSchema = reportInputSchema.extend({
  styleId: z.uuid(),
  agencyId: z.uuid().nullable().optional(),
  items: z.array(testItemSchema).min(1),
  result: testResultSchema,
  failedItems: text(1000),
});

export const reportUpdateSchema = z.object({
  validUntil: dateSchema.optional(),
  fileId: z.uuid().nullable().optional(),
  reuseKey: reuseKeySchema.optional(),
  items: z.array(testItemSchema).min(1).optional(),
  version: z.number().int(),
});

export const reportListQuerySchema = pageQuerySchema.extend({
  status: csv,
  customerId: z.uuid().optional(),
  styleId: z.uuid().optional(),
  result: z.string().optional(),
});

import { z } from "zod";
import { csv, dateSchema, dateTimeSchema, pageQuerySchema } from "./common.js";
import { defineErrors } from "./errors.js";

export const sampleErrors = defineErrors({
  SAMPLE_ROUND_OPEN: { status: 409, zh: "上一轮尚未批复，不能新开轮次", en: "Previous round is still open" },
  SAMPLE_MATERIALS_PENDING: { status: 409, zh: "备料未齐：{items}", en: "Materials not ready: {items}" },
  SAMPLE_STAGE_TIME_INVALID: { status: 422, zh: "完成时间不能早于进入本阶段的时间，也不能晚于现在", en: "Completion time must be between stage start and now" },
  SAMPLE_LIBRARY_STATUS: { status: 409, zh: "样品当前状态「{status}」不允许该操作", en: "Library item status {status} does not allow this" },
  SAMPLE_STYLE_MISMATCH: { status: 422, zh: "轮次不属于该款", en: "Round does not belong to the style" },
});

export const ROUND_TYPES = ["PROTO", "SMS", "PP", "COLOR", "LAB_DIP", "FIT", "PHOTO"] as const;
export const roundTypeSchema = z.enum(ROUND_TYPES);
export type RoundType = z.infer<typeof roundTypeSchema>;

export const ROUND_STATUSES = ["ISSUED", "RECEIVING", "SOURCING", "KNITTING", "QC", "READY", "SHIPPED", "AWAITING_APPROVAL", "APPROVED", "REVISE"] as const;
export const roundStatusSchema = z.enum(ROUND_STATUSES);
export type RoundStatus = z.infer<typeof roundStatusSchema>;

export const SAMPLE_STAGES = ["RECEIVING", "SOURCING", "KNITTING", "QC", "READY"] as const;
export const sampleStageSchema = z.enum(SAMPLE_STAGES);
export type SampleStage = z.infer<typeof sampleStageSchema>;

export const LIBRARY_KINDS = ["QRS", "RETAIN", "SEALED", "SHIPMENT"] as const;
export const libraryKindSchema = z.enum(LIBRARY_KINDS);
export const libraryStatusSchema = z.enum(["IN_STOCK", "LENT"]);
export const materialStatusSchema = z.enum(["PENDING", "ARRIVED"]);

export const stageViewSchema = z.object({
  stage: sampleStageSchema,
  state: z.enum(["DONE", "ACTIVE", "PENDING"]),
  enteredAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  durationHours: z.number().nullable(),
  avgHours: z.number(),
  avgSource: z.enum(["FACTORY", "GROUP", "DEFAULT"]),
  slow: z.boolean(),
  location: z.string().nullable(),
  operatorName: z.string().nullable(),
  passes: z.number().int(),
});
export type StageView = z.infer<typeof stageViewSchema>;

export const stageLogSchema = z.object({
  id: z.string(),
  stage: z.string(),
  enteredAt: z.string(),
  leftAt: z.string().nullable(),
  durationHours: z.number().nullable(),
  location: z.string().nullable(),
  operatorName: z.string().nullable(),
  note: z.string().nullable(),
});
export type StageLogDto = z.infer<typeof stageLogSchema>;

export const roundSchema = z.object({
  id: z.string(),
  sampleId: z.string(),
  roundNo: z.number().int(),
  roundType: roundTypeSchema,
  quantity: z.number().int(),
  status: roundStatusSchema,
  stageIndex: z.number().int(),
  stageEnteredAt: z.string(),
  reworkCount: z.number().int(),
  dueDate: z.string().nullable(),
  remainingDays: z.number().int().nullable(),
  issuedAt: z.string().nullable(),
  approvalResult: z.enum(["APPROVED", "REVISE"]).nullable(),
  approvalDate: z.string().nullable(),
  approvalNote: z.string().nullable(),
  reviseNote: z.string().nullable(),
  shipmentId: z.string().nullable(),
  shipmentDocNo: z.string().nullable(),
  progress: z.enum(["NORMAL", "SLOW"]),
  stages: z.array(stageViewSchema),
  logs: z.array(stageLogSchema),
  version: z.number().int(),
});
export type RoundDto = z.infer<typeof roundSchema>;

export const sampleSummarySchema = z.object({
  id: z.string(),
  docNo: z.string(),
  styleId: z.string(),
  styleNo: z.string(),
  styleNameZh: z.string(),
  styleNameEn: z.string().nullable(),
  productCode: z.string().nullable(),
  seasonCode: z.string().nullable(),
  customerId: z.string(),
  customerName: z.string(),
  planningId: z.string().nullable(),
  planningDocNo: z.string().nullable(),
  factoryId: z.string().nullable(),
  factoryName: z.string().nullable(),
  dueDate: z.string().nullable(),
  remainingDays: z.number().int().nullable(),
  currentRound: z
    .object({ id: z.string(), roundNo: z.number().int(), roundType: roundTypeSchema, status: roundStatusSchema, stageIndex: z.number().int(), reworkCount: z.number().int(), progress: z.enum(["NORMAL", "SLOW"]), version: z.number().int() })
    .nullable(),
  costStatus: z.string().nullable(),
  ownerId: z.string(),
  ownerName: z.string(),
  technicianId: z.string().nullable(),
  technicianName: z.string().nullable(),
  createdAt: z.string(),
  version: z.number().int(),
});
export type SampleSummaryDto = z.infer<typeof sampleSummarySchema>;

export const materialSchema = z.object({
  id: z.string(),
  sampleId: z.string(),
  sampleDocNo: z.string(),
  styleNo: z.string(),
  customerName: z.string(),
  materialName: z.string(),
  spec: z.string().nullable(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  supplier: z.string().nullable(),
  arrivalDate: z.string().nullable(),
  arrivedAt: z.string().nullable(),
  status: materialStatusSchema,
  overdue: z.boolean(),
  note: z.string().nullable(),
  version: z.number().int(),
});
export type MaterialDto = z.infer<typeof materialSchema>;

export const libraryItemSchema = z.object({
  id: z.string(),
  styleId: z.string(),
  styleNo: z.string(),
  styleNameZh: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  sampleId: z.string().nullable(),
  sampleDocNo: z.string().nullable(),
  roundId: z.string().nullable(),
  roundLabel: z.string().nullable(),
  kind: libraryKindSchema,
  location: z.string().nullable(),
  quantity: z.number().int(),
  status: libraryStatusSchema,
  borrower: z.string().nullable(),
  lentAt: z.string().nullable(),
  returnedAt: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
  version: z.number().int(),
});
export type LibraryItemDto = z.infer<typeof libraryItemSchema>;

export const sampleDetailSchema = sampleSummarySchema.extend({
  teamOrgId: z.string().nullable(),
  teamOrgName: z.string().nullable(),
  location: z.string().nullable(),
  colorway: z.string().nullable(),
  size: z.string().nullable(),
  customerRef: z.string().nullable(),
  briefTranslation: z.string().nullable(),
  yarnConfig: z.string().nullable(),
  craftNotes: z.string().nullable(),
  sampleNotes: z.string().nullable(),
  styleImageFileId: z.string().nullable(),
  rounds: z.array(roundSchema),
  materials: z.array(materialSchema),
  library: z.array(libraryItemSchema),
});
export type SampleDetailDto = z.infer<typeof sampleDetailSchema>;

const text = (max: number) => z.string().trim().max(max).nullable().optional();

export const sampleHeaderSchema = z.object({
  factoryId: z.uuid().nullable().optional(),
  teamOrgId: z.uuid().nullable().optional(),
  location: text(120),
  colorway: text(120),
  size: text(60),
  dueDate: dateSchema.nullable().optional(),
  customerRef: text(200),
  briefTranslation: text(4000),
  yarnConfig: text(2000),
  craftNotes: text(2000),
  sampleNotes: text(2000),
  costStatus: z.enum(["COST_REVIEW", "COST_DONE"]).nullable().optional(),
});

export const sampleCreateSchema = sampleHeaderSchema.extend({
  styleId: z.uuid(),
  planningId: z.uuid().nullable().optional(),
  roundType: roundTypeSchema.default("PROTO"),
  quantity: z.number().int().min(1).max(10000).default(6),
});

export const sampleUpdateSchema = sampleHeaderSchema.extend({ version: z.number().int() });

export const roundCreateSchema = z.object({
  roundType: roundTypeSchema,
  quantity: z.number().int().min(1).max(10000).default(6),
  dueDate: dateSchema.nullable().optional(),
  note: text(1000),
  version: z.number().int(),
});

export const roundAdvanceSchema = z.object({
  to: z.enum(["RECEIVING", "SOURCING", "KNITTING", "QC", "READY", "SHIPPED", "AWAITING_APPROVAL"]),
  at: dateTimeSchema.optional(),
  location: text(120),
  note: text(1000),
  version: z.number().int(),
});

export const roundApproveSchema = z.object({
  result: z.enum(["APPROVED", "REVISE"]),
  note: text(2000),
  approvalDate: dateSchema.optional(),
  nextRoundType: roundTypeSchema.optional(),
  nextQuantity: z.number().int().min(1).max(10000).optional(),
  version: z.number().int(),
});

export const sampleListQuerySchema = pageQuerySchema.extend({
  status: csv,
  customerId: z.uuid().optional(),
  factoryId: z.uuid().optional(),
  roundType: z.string().optional(),
  styleId: z.uuid().optional(),
});

export const libraryUpsertSchema = z.object({
  styleId: z.uuid(),
  sampleId: z.uuid().nullable().optional(),
  roundId: z.uuid().nullable().optional(),
  kind: libraryKindSchema,
  location: text(120),
  quantity: z.number().int().min(1).max(10000).default(1),
  note: text(500),
  version: z.number().int().optional(),
});

export const libraryLendSchema = z.object({ borrower: z.string().trim().min(1).max(60), note: text(500), version: z.number().int() });
export const libraryReturnSchema = z.object({ location: text(120), version: z.number().int() });

export const libraryListQuerySchema = pageQuerySchema.extend({
  kind: csv,
  status: csv,
  customerId: z.uuid().optional(),
  styleId: z.uuid().optional(),
});

export const materialUpsertSchema = z.object({
  sampleId: z.uuid(),
  materialName: z.string().trim().min(1).max(120),
  spec: text(120),
  quantity: z.number().min(0).nullable().optional(),
  unit: text(20),
  supplier: text(120),
  arrivalDate: dateSchema.nullable().optional(),
  note: text(500),
  version: z.number().int().optional(),
});

export const materialArriveSchema = z.object({ arrivedAt: dateTimeSchema.optional(), version: z.number().int() });

export const materialListQuerySchema = pageQuerySchema.extend({
  sampleId: z.uuid().optional(),
  status: csv,
  customerId: z.uuid().optional(),
});

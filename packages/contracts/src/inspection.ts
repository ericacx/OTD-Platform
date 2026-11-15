import { z } from "zod";
import { csv, dateSchema, labelSchema, pageQuerySchema } from "./common.js";
import { defineErrors } from "./errors.js";

export const inspectionErrors = defineErrors({
  INSPECTION_DAILY_LIMIT: { status: 409, zh: "{factory} {date} 已排 {count} 款，超过同厂同日上限 {limit} 款", en: "{factory} already has {count} styles on {date}, limit {limit}" },
  INSPECTION_RELEASE_FINAL_ONLY: { status: 409, zh: "本阶段只记录验货结果，放行以 FINAL / FRI / FQC 阶段为准", en: "Only final inspections (FRI) can be released" },
  INSPECTION_REWORK_FAILED_ONLY: { status: 409, zh: "只有结论为不合格的验货才能整改复验", en: "Only failed inspections can be reworked" },
  INSPECTION_CONCESSION_NOT_NEEDED: { status: 409, zh: "终验已合格，无需让步放行", en: "Final inspection passed, concession not needed" },
  INSPECTION_DEFECT_EXCEEDS_SAMPLE: { status: 422, zh: "不合格数不能大于实际抽样数", en: "Defects cannot exceed sampled quantity" },
  INSPECTION_STYLE_NOT_IN_ORDER: { status: 422, zh: "该款不在订单内", en: "Style is not part of the order" },
  INSPECTION_STAGE_NOT_ENABLED: { status: 409, zh: "该客户流程未启用验货阶段 {stage}（已启用：{enabled}）", en: "Stage {stage} is not enabled for this customer ({enabled})" },
});

export const INSPECTION_STAGES = ["IPI", "DPI", "FRI"] as const;
export const inspectionStageSchema = z.enum(INSPECTION_STAGES);
export type InspectionStage = z.infer<typeof inspectionStageSchema>;
export const INSPECTION_STAGE_LABELS: Record<InspectionStage, { zh: string; en: string }> = {
  IPI: { zh: "初期验货 IPI", en: "Initial (IPI)" },
  DPI: { zh: "中期验货 DPI", en: "During production (DPI)" },
  FRI: { zh: "尾期验货 FRI", en: "Final (FRI)" },
};

export const inspectionStatusSchema = z.enum(["TO_SCHEDULE", "SCHEDULED", "INSPECTED", "REWORK", "RELEASED", "CANCELLED"]);
export type InspectionStatus = z.infer<typeof inspectionStatusSchema>;
export const inspectionConclusionSchema = z.enum(["PASS", "FAIL"]);
export type InspectionConclusion = z.infer<typeof inspectionConclusionSchema>;

export const NOT_APPLICABLE_DETAIL = "不适用（客户流程未启用）";

export const releaseCheckItemSchema = z.object({
  key: z.string(),
  label: labelSchema,
  passed: z.boolean(),
  applicable: z.boolean(),
  detail: z.string().nullable(),
});
export type ReleaseCheckItemDto = z.infer<typeof releaseCheckItemSchema>;

export const releaseCheckSchema = z.object({
  passed: z.boolean(),
  refDate: z.string(),
  items: z.array(releaseCheckItemSchema),
  missing: z.array(z.string()),
  releasable: z.boolean(),
  concessionAvailable: z.boolean(),
  dailyLimit: z.number().int(),
  releaseDays: z.number().int(),
});
export type ReleaseCheckDto = z.infer<typeof releaseCheckSchema>;

export const inspectionRoundSchema = z.object({
  roundNo: z.number().int(),
  result: z.string(),
  actualDate: z.string().nullable(),
  actualSampleQty: z.number().nullable(),
  defectQty: z.number().nullable(),
  defectRate: z.number().nullable(),
  defectNote: z.string().nullable(),
  correctiveAction: z.string().nullable(),
  recordedAt: z.string(),
  recordedBy: z.string().nullable(),
});
export type InspectionRoundDto = z.infer<typeof inspectionRoundSchema>;

export const inspectionLogSchema = z.object({
  id: z.string(),
  at: z.string(),
  action: z.string(),
  fromStatus: z.string().nullable(),
  toStatus: z.string().nullable(),
  note: z.string().nullable(),
  operatorName: z.string().nullable(),
});
export type InspectionLogDto = z.infer<typeof inspectionLogSchema>;

export const inspectionSchema = z.object({
  id: z.string(),
  docNo: z.string(),
  orderId: z.string(),
  poNo: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  styleId: z.string().nullable(),
  styleNo: z.string().nullable(),
  styleName: z.string().nullable(),
  styleNameEn: z.string().nullable(),
  color: z.string().nullable(),
  stage: inspectionStageSchema,
  roundNo: z.number().int(),
  factoryId: z.string().nullable(),
  factoryName: z.string().nullable(),
  seasonCode: z.string().nullable(),
  plannedDate: z.string().nullable(),
  actualDate: z.string().nullable(),
  plannedExFactory: z.string().nullable(),
  method: z.string().nullable(),
  inspector: z.string().nullable(),
  channel: z.string().nullable(),
  aql: z.string().nullable(),
  granularity: z.string().nullable(),
  orderQty: z.number().nullable(),
  cartonCount: z.number().nullable(),
  productionRate: z.number().nullable(),
  packingRate: z.number().nullable(),
  plannedSampleQty: z.number().nullable(),
  actualSampleQty: z.number().nullable(),
  defectQty: z.number().nullable(),
  defectRate: z.number().nullable(),
  preconditions: z.array(z.string()),
  requirements: z.string().nullable(),
  result: inspectionConclusionSchema.nullable(),
  defectNote: z.string().nullable(),
  correctiveAction: z.string().nullable(),
  status: inspectionStatusSchema,
  releasedAt: z.string().nullable(),
  releaseCheck: z.array(releaseCheckItemSchema).nullable(),
  concession: z.boolean(),
  concessionReason: z.string().nullable(),
  cancelReason: z.string().nullable(),
  scheduleWarning: z.string().nullable(),
  ownerId: z.string(),
  ownerName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int(),
});
export type InspectionDto = z.infer<typeof inspectionSchema>;

export const inspectionDetailSchema = inspectionSchema.extend({
  rounds: z.array(inspectionRoundSchema),
  logs: z.array(inspectionLogSchema),
  sameOrder: z.array(inspectionSchema),
});
export type InspectionDetailDto = z.infer<typeof inspectionDetailSchema>;

export const inspectionKpiSchema = z.object({
  total: z.number().int(),
  byStage: z.record(z.string(), z.number().int()),
  toSchedule: z.number().int(),
  failed: z.number().int(),
  toRelease: z.number().int(),
  released: z.number().int(),
});
export type InspectionKpiDto = z.infer<typeof inspectionKpiSchema>;

export const scheduleItemSchema = z.object({
  id: z.string(),
  docNo: z.string(),
  stage: inspectionStageSchema,
  status: inspectionStatusSchema,
  poNo: z.string(),
  customerName: z.string(),
  styleNo: z.string().nullable(),
  inspector: z.string().nullable(),
  channel: z.string().nullable(),
});
export const scheduleDaySchema = z.object({
  date: z.string(),
  factoryId: z.string().nullable(),
  factoryName: z.string().nullable(),
  styleCount: z.number().int(),
  limit: z.number().int(),
  full: z.boolean(),
  items: z.array(scheduleItemSchema),
});
export const inspectionScheduleViewSchema = z.object({
  from: z.string(),
  to: z.string(),
  limit: z.number().int(),
  days: z.array(scheduleDaySchema),
  unscheduled: z.array(inspectionSchema),
});
export type InspectionScheduleViewDto = z.infer<typeof inspectionScheduleViewSchema>;

const text = (max: number) => z.string().trim().max(max);

export const inspectionCreateSchema = z.object({
  orderId: z.uuid(),
  styleId: z.uuid().nullable().optional(),
  color: text(60).nullable().optional(),
  stage: inspectionStageSchema,
  plannedDate: dateSchema.nullable().optional(),
  plannedExFactory: dateSchema.nullable().optional(),
  method: text(60).nullable().optional(),
  inspector: text(60).nullable().optional(),
  channel: text(60).nullable().optional(),
  aql: text(60).nullable().optional(),
  granularity: text(120).nullable().optional(),
  plannedSampleQty: z.number().int().min(0).nullable().optional(),
  preconditions: z.array(text(60).min(1)).max(20).optional(),
  requirements: text(1000).nullable().optional(),
});

export const inspectionScheduleSchema = z.object({
  version: z.number().int(),
  plannedDate: dateSchema,
  inspector: text(60).nullable().optional(),
  channel: text(60).nullable().optional(),
  method: text(60).nullable().optional(),
  plannedSampleQty: z.number().int().min(0).nullable().optional(),
});

export const inspectionRecordSchema = z.object({
  version: z.number().int(),
  result: inspectionConclusionSchema,
  actualDate: dateSchema,
  actualSampleQty: z.number().int().min(1),
  defectQty: z.number().int().min(0),
  defectNote: text(500).nullable().optional(),
  correctiveAction: text(500).nullable().optional(),
  inspector: text(60).nullable().optional(),
  reportFileId: z.uuid().nullable().optional(),
});

export const inspectionReworkSchema = z.object({
  version: z.number().int(),
  correctiveAction: text(500).nullable().optional(),
  plannedDate: dateSchema.nullable().optional(),
  note: text(500).nullable().optional(),
});

export const inspectionCancelSchema = z.object({
  version: z.number().int(),
  reason: z.string().trim().min(1).max(500),
});

export const inspectionReleaseSchema = z.object({
  version: z.number().int(),
  concessionReason: z.string().trim().min(1).max(1000).optional(),
  note: text(500).nullable().optional(),
});

export const inspectionListQuerySchema = pageQuerySchema.extend({
  status: csv,
  stage: csv,
  result: csv,
  customerId: z.uuid().optional(),
  orderId: z.uuid().optional(),
  styleId: z.uuid().optional(),
  factoryId: z.uuid().optional(),
});

export const inspectionScheduleQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  factoryId: z.uuid().optional(),
});

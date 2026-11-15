import { z } from "zod";
import { dateSchema } from "./common.js";
import { defineErrors } from "./errors.js";

export const capacityErrors = defineErrors({
  CAPACITY_VERSION_PUBLISHED: { status: 409, zh: "版本 {label} 已发布，不能再修改", en: "Version {label} is published and read-only" },
  CAPACITY_ROW_LEDGER_INVALID: { status: 422, zh: "编织产能行由系统计算，不能手工新增或删除", en: "Knitting rows are computed and cannot be added or removed manually" },
  CAPACITY_TASK_NOT_OWNER: { status: 403, zh: "只有任务负责人或有「维护任务」权限的人可以更新", en: "Only the task owner or users with task edit permission can update it" },
});

export const CAPACITY_WINDOW_DAYS = 60;
export const CAPACITY_TIGHT_RATE = 0.12;
export const CAPACITY_DEFAULT_NEEDLE = "144N";
export const CAPACITY_DEFAULT_LEAD_DAYS: Record<string, number> = { DC: 7, VN: 10, NH: 8 };
export const CAPACITY_FALLBACK_LEAD_DAYS = 7;

export function knitFigures(input: { windowDays: number; leadDays: number; machineCount: number; dailyOutput: number; unproducedQty: number }) {
  const availableDays = Math.max(0, input.windowDays - input.leadDays);
  const cumulativeCapacity = Math.round(availableDays * input.dailyOutput * input.machineCount * 1000) / 1000;
  const spareCapacity = Math.round((cumulativeCapacity - input.unproducedQty) * 1000) / 1000;
  const spareRate = cumulativeCapacity > 0 ? spareCapacity / cumulativeCapacity : input.unproducedQty > 0 ? -1 : 0;
  return { availableDays, cumulativeCapacity, spareCapacity, spareRate: Math.round(spareRate * 10000) / 10000 };
}

export const ledgerSchema = z.enum(["KNIT", "PACKING", "SPECIAL"]);
export type Ledger = z.infer<typeof ledgerSchema>;
export const capacityVersionStatusSchema = z.enum(["DRAFT", "PUBLISHED"]);
export const ledgerTaskStatusSchema = z.enum(["PENDING", "UPDATING", "DONE", "OVERDUE"]);
export const ledgerFrequencySchema = z.enum(["WEEKLY", "MONTHLY", "ROLLING_MONTHLY"]);
export const rowSourceSchema = z.enum(["MANUAL", "SYNC", "DEFAULT"]);

export const capacityVersionSchema = z.object({
  id: z.string(),
  versionNo: z.number().int(),
  label: z.string(),
  asOfDate: z.string(),
  windowDays: z.number().int(),
  status: capacityVersionStatusSchema,
  publishedAt: z.string().nullable(),
  publishedByName: z.string().nullable(),
  note: z.string().nullable(),
  rowCounts: z.object({ KNIT: z.number().int(), PACKING: z.number().int(), SPECIAL: z.number().int() }),
  createdAt: z.string(),
  version: z.number().int(),
});
export type CapacityVersionDto = z.infer<typeof capacityVersionSchema>;

export const capacityRowSchema = z.object({
  id: z.string(),
  versionId: z.string(),
  ledger: ledgerSchema,
  baseId: z.string(),
  baseCode: z.string(),
  baseName: z.string(),
  needleTypeId: z.string().nullable(),
  needleCode: z.string().nullable(),
  process: z.string().nullable(),
  leadDays: z.number().int().nullable(),
  availableDays: z.number().int().nullable(),
  machineCount: z.number().int().nullable(),
  dailyOutput: z.number().nullable(),
  cumulativeCapacity: z.number().nullable(),
  unproducedQty: z.number().nullable(),
  otdUnproducedQty: z.number().nullable(),
  erpBacklog: z.number().nullable(),
  spareCapacity: z.number().nullable(),
  spareRate: z.number().nullable(),
  tight: z.boolean(),
  sources: z.record(z.string(), rowSourceSchema),
  extra: z.record(z.string(), z.unknown()),
  version: z.number().int(),
});
export type CapacityRowDto = z.infer<typeof capacityRowSchema>;

export const capacityKpiSchema = z.object({
  groupSpare: z.number(),
  groupSpareWan: z.number(),
  groupCapacity: z.number(),
  avgSpareRate: z.number(),
  tightCount: z.number().int(),
  tightThreshold: z.number(),
  overdueTasks: z.number().int(),
});
export type CapacityKpiDto = z.infer<typeof capacityKpiSchema>;

export const capacityVersionDetailSchema = z.object({ version: capacityVersionSchema, kpis: capacityKpiSchema, rows: z.array(capacityRowSchema) });
export type CapacityVersionDetailDto = z.infer<typeof capacityVersionDetailSchema>;

export const capacityCompareSchema = z.object({
  from: capacityVersionSchema,
  to: capacityVersionSchema,
  rows: z.array(
    z.object({
      key: z.string(),
      ledger: ledgerSchema,
      baseName: z.string(),
      needleCode: z.string().nullable(),
      process: z.string().nullable(),
      change: z.enum(["ADDED", "REMOVED", "CHANGED", "SAME"]),
      fields: z.array(z.object({ field: z.string(), from: z.unknown(), to: z.unknown(), delta: z.number().nullable() })),
    }),
  ),
});
export type CapacityCompareDto = z.infer<typeof capacityCompareSchema>;

export const capacityVersionCreateSchema = z.object({ asOfDate: dateSchema.optional(), note: z.string().trim().max(300).nullable().optional() });
export const capacityVersionedSchema = z.object({ version: z.number().int() });
export const capacityDetailQuerySchema = z.object({ keyword: z.string().trim().optional(), ledger: ledgerSchema.optional() });
export const capacityCompareQuerySchema = z.object({ from: z.uuid(), to: z.uuid() });

export const capacityRowUpdateSchema = z.object({
  version: z.number().int(),
  leadDays: z.number().int().min(0).max(60).optional(),
  machineCount: z.number().int().min(0).max(100000).optional(),
  process: z.string().trim().max(60).nullable().optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});
export const capacityRowCreateSchema = z.object({
  ledger: ledgerSchema,
  baseId: z.uuid(),
  process: z.string().trim().max(60).nullable().optional(),
  extra: z.record(z.string(), z.unknown()).default({}),
});
export const capacityErpBacklogSchema = z.object({ version: z.number().int(), erpBacklog: z.number().min(0).max(1_000_000_000) });
export const capacityRowDeleteQuerySchema = z.object({ version: z.coerce.number().int() });

export const baseMachineSchema = z.object({
  id: z.string(),
  baseId: z.string(),
  baseCode: z.string(),
  baseName: z.string(),
  needleTypeId: z.string(),
  needleCode: z.string(),
  machineCount: z.number().int(),
  dailyOutputPerMachine: z.number(),
  version: z.number().int(),
});
export type BaseMachineDto = z.infer<typeof baseMachineSchema>;
export const baseMachineUpdateSchema = z.object({ baseId: z.uuid(), needleTypeId: z.uuid(), machineCount: z.number().int().min(0).max(100000), version: z.number().int() });

export const ledgerTaskSchema = z.object({
  id: z.string(),
  ledger: z.string(),
  name: z.string(),
  frequency: ledgerFrequencySchema,
  ownerId: z.string().nullable(),
  ownerName: z.string().nullable(),
  currentVersion: z.string().nullable(),
  lastUpdatedAt: z.string().nullable(),
  nextDueAt: z.string().nullable(),
  status: ledgerTaskStatusSchema,
  overdueDays: z.number().int(),
  note: z.string().nullable(),
  escalatedAt: z.string().nullable(),
  version: z.number().int(),
});
export type LedgerTaskDto = z.infer<typeof ledgerTaskSchema>;

export const ledgerTaskCompleteSchema = z.object({ version: z.number().int(), currentVersion: z.string().trim().max(40).nullable().optional(), note: z.string().trim().max(300).nullable().optional() });
export const ledgerTaskUpdateSchema = z.object({
  version: z.number().int(),
  ownerId: z.uuid().nullable().optional(),
  frequency: ledgerFrequencySchema.optional(),
  nextDueAt: dateSchema.nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
});

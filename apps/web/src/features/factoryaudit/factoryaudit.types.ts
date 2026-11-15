import type {
  auditCreateSchema,
  auditRecordSchema,
  auditUpdateSchema,
  findingCreateSchema,
  findingUpdateSchema,
} from "@otd/contracts/factoryaudit";
import type { z } from "zod";

export type {
  AuditResult,
  AuditStatus,
  AuditType,
  FactoryAuditDetailDto,
  FactoryAuditDto,
  FindingDto,
} from "@otd/contracts/factoryaudit";

export type AuditCreateInput = z.input<typeof auditCreateSchema>;
export type AuditUpdateInput = z.input<typeof auditUpdateSchema>;
export type AuditRecordInput = z.input<typeof auditRecordSchema>;
export type FindingCreateInput = z.input<typeof findingCreateSchema>;
export type FindingUpdateInput = z.input<typeof findingUpdateSchema>;
export type PageOf<T> = { items: T[]; total: number; page: number; pageSize: number };

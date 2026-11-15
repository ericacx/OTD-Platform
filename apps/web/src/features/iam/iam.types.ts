import type { auditLogSchema, changeSnapshotSchema, roleDetailSchema, systemParamSchema } from "@otd/contracts/iam";
import type { z } from "zod";

export type { OrgNode, RoleSummary, UserSummary } from "@otd/contracts/iam";
export type RoleDetail = z.infer<typeof roleDetailSchema>;
export type AuditLog = z.infer<typeof auditLogSchema>;
export type ChangeSnapshot = z.infer<typeof changeSnapshotSchema>;
export type SystemParam = z.infer<typeof systemParamSchema>;
export type PageOf<T> = { items: T[]; total: number; page: number; pageSize: number };

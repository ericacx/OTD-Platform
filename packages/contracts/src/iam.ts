import { z } from "zod";
import { pageQuerySchema } from "./common.js";
import { defineErrors } from "./errors.js";

export const iamErrors = defineErrors({
  IAM_ROLE_IN_USE: { status: 409, zh: "角色仍有 {count} 个成员，不能删除", en: "Role still has {count} members" },
  IAM_ORG_HAS_CHILDREN: { status: 409, zh: "组织下还有下级组织或成员，不能删除", en: "Org has children or members" },
  IAM_PARAM_UNKNOWN: { status: 404, zh: "系统参数 {key} 不存在", en: "Unknown parameter {key}" },
  IAM_SNAPSHOT_MISMATCH: { status: 409, zh: "快照与对象不匹配", en: "Snapshot does not match object" },
});

export const orgTypeSchema = z.enum(["GROUP", "DIVISION", "DEPARTMENT", "BASE"]);

export const orgNodeSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  nameEn: z.string().nullable(),
  type: orgTypeSchema,
  parentId: z.string().nullable(),
  leaderId: z.string().nullable(),
  leaderName: z.string().nullable(),
  status: z.string(),
  memberCount: z.number().int(),
  description: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int(),
});
export type OrgNode = z.infer<typeof orgNodeSchema>;

export const orgUpsertSchema = z.object({
  name: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().max(120).nullable().optional(),
  type: orgTypeSchema,
  parentId: z.uuid().nullable(),
  leaderId: z.uuid().nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).default("ACTIVE"),
  version: z.number().int().optional(),
});

export const userSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  nameEn: z.string().nullable(),
  phone: z.string(),
  email: z.string().nullable(),
  employeeNo: z.string().nullable(),
  orgId: z.string(),
  orgName: z.string(),
  roles: z.array(z.object({ id: z.string(), code: z.string(), name: z.string() })),
  status: z.string(),
  lastLoginAt: z.string().nullable(),
  version: z.number().int(),
});
export type UserSummary = z.infer<typeof userSummarySchema>;

export const userListQuerySchema = pageQuerySchema.extend({
  orgId: z.uuid().optional(),
  includeChildren: z.coerce.boolean().optional(),
  roleId: z.uuid().optional(),
  status: z.string().optional(),
});

export const userUpsertSchema = z.object({
  name: z.string().trim().min(1).max(40),
  nameEn: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().regex(/^1\d{10}$/),
  email: z.email().nullable().optional(),
  employeeNo: z.string().max(40).nullable().optional(),
  orgId: z.uuid(),
  roleIds: z.array(z.uuid()).min(1),
  status: z.enum(["ACTIVE", "DISABLED", "LEFT"]).default("ACTIVE"),
  version: z.number().int().optional(),
});

export const roleSummarySchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  nameEn: z.string().nullable(),
  type: z.enum(["BUSINESS", "MANAGEMENT"]),
  dataScope: z.enum(["SELF", "ORG", "ORG_AND_CHILDREN", "ALL"]),
  allCustomers: z.boolean(),
  customers: z.array(z.object({ id: z.string(), code: z.string(), name: z.string() })),
  permissionCount: z.number().int(),
  menuPermissionCount: z.number().int(),
  memberCount: z.number().int(),
  status: z.string(),
  description: z.string().nullable(),
  version: z.number().int(),
});
export type RoleSummary = z.infer<typeof roleSummarySchema>;

export const roleUpsertSchema = z.object({
  name: z.string().trim().min(1).max(40),
  nameEn: z.string().trim().max(80).nullable().optional(),
  type: z.enum(["BUSINESS", "MANAGEMENT"]),
  dataScope: z.enum(["SELF", "ORG", "ORG_AND_CHILDREN", "ALL"]),
  description: z.string().max(200).nullable().optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).default("ACTIVE"),
  version: z.number().int().optional(),
});

export const roleGrantSchema = z.object({
  permissions: z.array(z.string()),
  allCustomers: z.boolean(),
  customerIds: z.array(z.uuid()),
  reason: z.string().max(200).optional(),
  version: z.number().int(),
});
export type RoleGrantInput = z.infer<typeof roleGrantSchema>;

export const roleDetailSchema = roleSummarySchema.extend({ permissions: z.array(z.string()) });

export const auditLogSchema = z.object({
  id: z.string(),
  at: z.string(),
  userName: z.string().nullable(),
  action: z.string(),
  objectType: z.string().nullable(),
  objectId: z.string().nullable(),
  docNo: z.string().nullable(),
  ip: z.string().nullable(),
  diff: z.record(z.string(), z.unknown()).nullable(),
});
export const auditLogQuerySchema = pageQuerySchema.extend({
  action: z.string().optional(),
  objectType: z.string().optional(),
  userId: z.uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const changeSnapshotSchema = z.object({
  id: z.string(),
  objectType: z.string(),
  objectId: z.string(),
  objectVersion: z.number().int(),
  reason: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
});

export const systemParamSchema = z.object({ key: z.string(), value: z.unknown(), description: z.string().nullable(), updatedAt: z.string() });
export const systemParamUpdateSchema = z.object({ value: z.unknown(), reason: z.string().max(200).optional() });

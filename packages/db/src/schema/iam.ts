import { boolean, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { auditColumns, id, ts } from "./_common.js";

export const orgs = pgTable(
  "orgs",
  {
    id: id(),
    code: text().notNull().unique(),
    name: text().notNull(),
    nameEn: text(),
    type: text().notNull(),
    parentId: uuid(),
    path: text().notNull(),
    leaderId: uuid(),
    description: text(),
    status: text().notNull().default("ACTIVE"),
    sort: integer().notNull().default(0),
    ...auditColumns,
  },
  (t) => [index().on(t.parentId), index().on(t.path)],
);

export const users = pgTable("users", {
  id: id(),
  phone: text().notNull().unique(),
  email: text(),
  name: text().notNull(),
  nameEn: text(),
  employeeNo: text(),
  passwordHash: text().notNull(),
  primaryOrgId: uuid().notNull(),
  status: text().notNull().default("ACTIVE"),
  locale: text().notNull().default("zh-CN"),
  preferences: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  mustChangePassword: boolean().notNull().default(false),
  failedLogins: integer().notNull().default(0),
  lockedUntil: ts(),
  lastLoginAt: ts(),
  ...auditColumns,
});

export const roles = pgTable("roles", {
  id: id(),
  code: text().notNull().unique(),
  name: text().notNull(),
  nameEn: text(),
  type: text().notNull(),
  dataScope: text().notNull(),
  allCustomers: boolean().notNull().default(false),
  status: text().notNull().default("ACTIVE"),
  description: text(),
  ...auditColumns,
});

export const userRoles = pgTable(
  "user_roles",
  { userId: uuid().notNull(), roleId: uuid().notNull() },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] }), index().on(t.roleId)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  { roleId: uuid().notNull(), permission: text().notNull() },
  (t) => [primaryKey({ columns: [t.roleId, t.permission] })],
);

export const roleCustomers = pgTable(
  "role_customers",
  { roleId: uuid().notNull(), customerId: uuid().notNull() },
  (t) => [primaryKey({ columns: [t.roleId, t.customerId] })],
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: id(),
    userId: uuid().notNull(),
    familyId: uuid().notNull(),
    tokenHash: text().notNull().unique(),
    expiresAt: ts().notNull(),
    revokedAt: ts(),
    rotatedAt: ts(),
    device: text(),
    ip: text(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.userId), index().on(t.familyId)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    at: ts().notNull().defaultNow(),
    userId: uuid(),
    userName: text(),
    action: text().notNull(),
    objectType: text(),
    objectId: text(),
    docNo: text(),
    ip: text(),
    userAgent: text(),
    requestId: text(),
    diff: jsonb().$type<Record<string, unknown>>(),
  },
  (t) => [index().on(t.at), index().on(t.objectType, t.objectId), index().on(t.userId)],
);

export const changeSnapshots = pgTable(
  "change_snapshots",
  {
    id: id(),
    objectType: text().notNull(),
    objectId: text().notNull(),
    objectVersion: integer().notNull(),
    snapshot: jsonb().$type<Record<string, unknown>>().notNull(),
    reason: text(),
    createdBy: uuid(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.objectType, t.objectId)],
);

export const systemParams = pgTable("system_params", {
  key: text().primaryKey(),
  value: jsonb().$type<unknown>().notNull(),
  description: text(),
  updatedAt: ts().notNull().defaultNow(),
  updatedBy: uuid(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid().notNull(),
    type: text().notNull(),
    title: text().notNull(),
    body: text(),
    link: text(),
    readAt: ts(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.readAt)],
);

export const files = pgTable(
  "files",
  {
    id: id(),
    storageKey: text().notNull().unique(),
    filename: text().notNull(),
    contentType: text().notNull(),
    size: integer().notNull(),
    sha256: text().notNull(),
    ownerType: text(),
    ownerId: text(),
    uploadedBy: uuid(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.ownerType, t.ownerId)],
);

export const numberSequences = pgTable(
  "number_sequences",
  { prefix: text().notNull(), period: text().notNull(), current: integer().notNull().default(0) },
  (t) => [primaryKey({ columns: [t.prefix, t.period] })],
);

export const domainEvents = pgTable(
  "domain_events",
  {
    id: id(),
    type: text().notNull(),
    aggregateType: text().notNull(),
    aggregateId: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    occurredAt: ts().notNull().defaultNow(),
    processedAt: ts(),
    attempts: integer().notNull().default(0),
    lastError: text(),
  },
  (t) => [index().on(t.processedAt), uniqueIndex().on(t.id)],
);

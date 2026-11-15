import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { auditColumns, id, ts } from "./_common.js";

export type ServiceItemEffect = {
  nodes?: string[];
  gateConditions?: string[];
  rulePacks?: string[];
  patrolRules?: string[];
  todoTemplates?: string[];
};

export const serviceModules = pgTable("service_modules", {
  id: id(),
  code: text().notNull().unique(),
  name: text().notNull(),
  nameEn: text(),
  department: text().notNull(),
  sort: integer().notNull().default(0),
  hasPage: boolean().notNull().default(true),
  description: text(),
  deletedAt: ts(),
  ...auditColumns,
});

export const serviceItems = pgTable(
  "service_items",
  {
    id: id(),
    moduleId: uuid().notNull(),
    code: text().notNull().unique(),
    name: text().notNull(),
    nameEn: text(),
    description: text(),
    department: text(),
    requiresCustomerConfirm: boolean().notNull().default(false),
    effects: jsonb().$type<ServiceItemEffect>().notNull().default({}),
    paramsSchema: jsonb().$type<Record<string, unknown>>(),
    sort: integer().notNull().default(0),
    deletedAt: ts(),
    ...auditColumns,
  },
  (t) => [index().on(t.moduleId)],
);

export type FlowSnapshotItem = { itemCode: string; params?: Record<string, unknown>; effects?: ServiceItemEffect };

export type FlowSnapshot = {
  modules: { moduleCode: string; sort: number; department: string; items: FlowSnapshotItem[] }[];
  params: Record<string, unknown>;
};

export const customerFlows = pgTable("customer_flows", {
  id: id(),
  customerId: uuid().notNull().unique(),
  currentVersionId: uuid(),
  draft: jsonb().$type<FlowSnapshot>().notNull(),
  status: text().notNull().default("DRAFT"),
  ...auditColumns,
});

export const customerFlowVersions = pgTable(
  "customer_flow_versions",
  {
    id: id(),
    customerId: uuid().notNull(),
    versionNo: integer().notNull(),
    snapshot: jsonb().$type<FlowSnapshot>().notNull(),
    summary: jsonb().$type<Record<string, unknown>>(),
    note: text(),
    publishedAt: ts().notNull().defaultNow(),
    publishedBy: uuid(),
  },
  (t) => [uniqueIndex().on(t.customerId, t.versionNo)],
);

export const rulePacks = pgTable(
  "rule_packs",
  {
    id: id(),
    code: text().notNull(),
    kind: text().notNull(),
    name: text().notNull(),
    nameEn: text(),
    customerId: uuid(),
    params: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    description: text(),
    enabled: boolean().notNull().default(true),
    ...auditColumns,
  },
  (t) => [index().on(t.kind, t.customerId)],
);

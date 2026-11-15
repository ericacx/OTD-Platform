import { boolean, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { auditColumns, day, id, label, money, qty, rate, ts } from "./_common.js";

export const customers = pgTable("customers", {
  id: id(),
  code: text().notNull().unique(),
  name: text().notNull(),
  nameEn: text(),
  logoText: text(),
  settlementEntity: text(),
  paymentTermsDays: integer().notNull().default(60),
  currency: text().notNull().default("USD"),
  contactName: text(),
  contactEmail: text(),
  aiAllowed: boolean().notNull().default(true),
  ownerOrgId: uuid(),
  status: text().notNull().default("ACTIVE"),
  deletedAt: ts(),
  ...auditColumns,
});

export const bases = pgTable("bases", {
  id: id(),
  code: text().notNull().unique(),
  name: text().notNull(),
  nameEn: text(),
  country: text().notNull().default("CN"),
  deletedAt: ts(),
  ...auditColumns,
});

export const factories = pgTable(
  "factories",
  {
    id: id(),
    code: text().notNull().unique(),
    name: text().notNull(),
    nameEn: text(),
    baseId: uuid().notNull(),
    legalEntity: text(),
    deletedAt: ts(),
    ...auditColumns,
  },
  (t) => [index().on(t.baseId)],
);

export const needleTypes = pgTable("needle_types", {
  id: id(),
  code: text().notNull().unique(),
  needles: integer().notNull(),
  description: text(),
  ...auditColumns,
});

export const baseMachines = pgTable(
  "base_machines",
  {
    id: id(),
    baseId: uuid().notNull(),
    needleTypeId: uuid().notNull(),
    machineCount: integer().notNull().default(0),
    dailyOutputPerMachine: qty().notNull().default(0),
    ...auditColumns,
  },
  (t) => [uniqueIndex().on(t.baseId, t.needleTypeId)],
);

export const materials = pgTable("materials", {
  id: id(),
  code: text().notNull().unique(),
  name: text().notNull(),
  category: text().notNull(),
  spec: text(),
  unit: text().notNull(),
  unitPrice: money(),
  currency: text().notNull().default("CNY"),
  supplier: text(),
  deletedAt: ts(),
  ...auditColumns,
});

export const testAgencies = pgTable("test_agencies", {
  id: id(),
  code: text().notNull().unique(),
  name: text().notNull(),
  city: text(),
  contact: text(),
  deletedAt: ts(),
  ...auditColumns,
});

export const forwarders = pgTable("forwarders", {
  id: id(),
  code: text().notNull().unique(),
  name: text().notNull(),
  type: text().notNull(),
  contact: text(),
  deletedAt: ts(),
  ...auditColumns,
});

export const dictionaries = pgTable(
  "dictionaries",
  {
    id: id(),
    type: text().notNull(),
    code: text().notNull(),
    label: label().notNull(),
    sort: integer().notNull().default(0),
    enabled: boolean().notNull().default(true),
    ...auditColumns,
  },
  (t) => [uniqueIndex().on(t.type, t.code)],
);

export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: id(),
    currency: text().notNull(),
    rateToCny: rate().notNull(),
    effectiveDate: day().notNull(),
    ...auditColumns,
  },
  (t) => [uniqueIndex().on(t.currency, t.effectiveDate)],
);

export const seasons = pgTable("seasons", {
  code: text().primaryKey(),
  label: label().notNull(),
  startDate: day(),
  endDate: day(),
  ...auditColumns,
});

import { z } from "zod";
import { labelSchema, pageQuerySchema } from "./common.js";
import { defineErrors } from "./errors.js";

export const customerSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  nameEn: z.string().nullable(),
  logoText: z.string().nullable(),
  settlementEntity: z.string().nullable(),
  paymentTermsDays: z.number().int(),
  currency: z.string(),
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  aiAllowed: z.boolean(),
  status: z.string(),
  version: z.number().int(),
});
export type CustomerDto = z.infer<typeof customerSchema>;

export const customerUpsertSchema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9]{2,8}$/),
  name: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().max(120).nullable().optional(),
  logoText: z.string().max(40).nullable().optional(),
  settlementEntity: z.string().max(120).nullable().optional(),
  paymentTermsDays: z.number().int().min(0).max(365),
  currency: z.string().length(3),
  contactName: z.string().max(60).nullable().optional(),
  contactEmail: z.email().nullable().optional(),
  aiAllowed: z.boolean().default(true),
  status: z.enum(["ACTIVE", "DISABLED"]).default("ACTIVE"),
  version: z.number().int().optional(),
});

export const factorySchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  nameEn: z.string().nullable(),
  baseId: z.string(),
  baseName: z.string(),
  legalEntity: z.string().nullable(),
  version: z.number().int(),
});
export const factoryUpsertSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(60),
  nameEn: z.string().max(120).nullable().optional(),
  baseId: z.uuid(),
  legalEntity: z.string().max(120).nullable().optional(),
  version: z.number().int().optional(),
});

export const baseSchema = z.object({ id: z.string(), code: z.string(), name: z.string(), nameEn: z.string().nullable(), country: z.string(), version: z.number().int() });
export const baseUpsertSchema = z.object({ code: z.string().trim().min(1).max(10), name: z.string().trim().min(1), nameEn: z.string().nullable().optional(), country: z.string().length(2), version: z.number().int().optional() });

export const needleTypeSchema = z.object({
  id: z.string(),
  code: z.string(),
  needles: z.number().int(),
  description: z.string().nullable(),
  machines: z.array(z.object({ baseId: z.string(), baseName: z.string(), machineCount: z.number().int(), dailyOutputPerMachine: z.number() })),
  version: z.number().int(),
});
export const needleTypeUpsertSchema = z.object({ code: z.string().regex(/^\d+N$/), needles: z.number().int().min(1), description: z.string().nullable().optional(), version: z.number().int().optional() });
export const baseMachineUpsertSchema = z.object({ baseId: z.uuid(), needleTypeId: z.uuid(), machineCount: z.number().int().min(0), dailyOutputPerMachine: z.number().min(0) });

export const materialSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  category: z.enum(["YARN", "TRIM", "PACKAGING"]),
  spec: z.string().nullable(),
  unit: z.string(),
  unitPrice: z.number().nullable(),
  currency: z.string(),
  supplier: z.string().nullable(),
  version: z.number().int(),
});
export const materialUpsertSchema = materialSchema.omit({ id: true, version: true }).extend({ version: z.number().int().optional() });

export const agencySchema = z.object({ id: z.string(), code: z.string(), name: z.string(), city: z.string().nullable(), contact: z.string().nullable(), version: z.number().int() });
export const agencyUpsertSchema = agencySchema.omit({ id: true, version: true }).extend({ version: z.number().int().optional() });

export const forwarderSchema = z.object({ id: z.string(), code: z.string(), name: z.string(), type: z.enum(["FORWARDER", "CARRIER"]), contact: z.string().nullable(), version: z.number().int() });
export const forwarderUpsertSchema = forwarderSchema.omit({ id: true, version: true }).extend({ version: z.number().int().optional() });

export const dictionarySchema = z.object({ id: z.string(), type: z.string(), code: z.string(), label: labelSchema, sort: z.number().int(), enabled: z.boolean(), version: z.number().int() });
export const dictionaryUpsertSchema = z.object({ type: z.string().min(1), code: z.string().min(1), label: labelSchema, sort: z.number().int().default(0), enabled: z.boolean().default(true), version: z.number().int().optional() });

export const exchangeRateSchema = z.object({ id: z.string(), currency: z.string(), rateToCny: z.number(), effectiveDate: z.string() });
export const exchangeRateUpsertSchema = z.object({ currency: z.string().length(3), rateToCny: z.number().positive(), effectiveDate: z.iso.date() });

export const seasonSchema = z.object({ code: z.string(), label: labelSchema });

export const masterListQuerySchema = pageQuerySchema.extend({ type: z.string().optional(), category: z.string().optional(), baseId: z.uuid().optional() });

export const lookupsSchema = z.object({
  customers: z.array(z.object({ id: z.string(), code: z.string(), name: z.string(), nameEn: z.string().nullable() })),
  factories: z.array(z.object({ id: z.string(), code: z.string(), name: z.string(), baseId: z.string() })),
  bases: z.array(z.object({ id: z.string(), code: z.string(), name: z.string() })),
  needleTypes: z.array(z.object({ id: z.string(), code: z.string() })),
  agencies: z.array(z.object({ id: z.string(), code: z.string(), name: z.string() })),
  forwarders: z.array(z.object({ id: z.string(), code: z.string(), name: z.string(), type: z.string() })),
  seasons: z.array(seasonSchema),
  dictionaries: z.record(z.string(), z.array(z.object({ code: z.string(), label: labelSchema }))),
  users: z.array(z.object({ id: z.string(), name: z.string(), orgId: z.string() })),
  currencies: z.array(z.string()),
});
export type Lookups = z.infer<typeof lookupsSchema>;

export const masterdataErrors = defineErrors({
  MASTERDATA_IN_USE: { status: 409, zh: "「{what}」仍有 {count} 条关联数据，不能删除", en: "{what} still has {count} linked records" },
});

export const masterDeleteQuerySchema = z.object({ version: z.coerce.number().int().optional() });

export type FactoryDto = z.infer<typeof factorySchema>;

export const baseDetailSchema = baseSchema.extend({ factoryCount: z.number().int(), machineCount: z.number().int() });
export type BaseDetailDto = z.infer<typeof baseDetailSchema>;

export type NeedleTypeDto = z.infer<typeof needleTypeSchema>;

export const baseMachineSchema = z.object({
  id: z.string(),
  baseId: z.string(),
  baseCode: z.string(),
  baseName: z.string(),
  needleTypeId: z.string(),
  needleCode: z.string(),
  machineCount: z.number().int(),
  dailyOutputPerMachine: z.number(),
  dailyCapacity: z.number(),
  version: z.number().int(),
});
export type BaseMachineDto = z.infer<typeof baseMachineSchema>;
export const baseMachineWriteSchema = baseMachineUpsertSchema.extend({ version: z.number().int().optional() });

export type MaterialDto = z.infer<typeof materialSchema>;
export type AgencyDto = z.infer<typeof agencySchema>;
export type ForwarderDto = z.infer<typeof forwarderSchema>;
export type DictionaryDto = z.infer<typeof dictionarySchema>;

export const dictionaryTypeSchema = z.object({ type: z.string(), count: z.number().int(), enabledCount: z.number().int() });
export type DictionaryTypeDto = z.infer<typeof dictionaryTypeSchema>;

export const exchangeRateDetailSchema = exchangeRateSchema.extend({ version: z.number().int() });
export type ExchangeRateDto = z.infer<typeof exchangeRateDetailSchema>;
export const exchangeRateWriteSchema = exchangeRateUpsertSchema.extend({ version: z.number().int().optional() });
export const exchangeRateListQuerySchema = pageQuerySchema.extend({ currency: z.string().length(3).optional(), asOf: z.iso.date().optional() });

export const seasonDetailSchema = seasonSchema.extend({ startDate: z.string().nullable(), endDate: z.string().nullable(), version: z.number().int() });
export type SeasonDto = z.infer<typeof seasonDetailSchema>;
export const seasonUpsertSchema = z.object({
  code: z.string().trim().regex(/^(SS|SP|SU|FA|AW|HO)\d{2}$/),
  label: labelSchema,
  startDate: z.iso.date().nullable().optional(),
  endDate: z.iso.date().nullable().optional(),
  version: z.number().int().optional(),
});

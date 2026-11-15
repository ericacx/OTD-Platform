import { boolean, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { auditColumns, day, docNoColumn, id, money, ownershipColumns, qty, rate, statusColumn, ts } from "./_common.js";

export type ExtractedField = { value: string | number | null; source?: string; confidence: number; page?: number };

export const styles = pgTable(
  "styles",
  {
    id: id(),
    styleNo: text().notNull(),
    nameZh: text().notNull(),
    nameEn: text(),
    category: text(),
    subCategory: text(),
    seasonCode: text(),
    productCode: text(),
    imageFileId: uuid(),
    colorA: text(),
    colorB: text(),
    ...ownershipColumns,
    ...auditColumns,
  },
  (t) => [uniqueIndex().on(t.customerId, t.styleNo), index().on(t.ownerId, t.orgId, t.customerId)],
);

export const plannings = pgTable(
  "plannings",
  {
    id: id(),
    docNo: docNoColumn(),
    styleId: uuid(),
    styleNo: text(),
    seasonCode: text(),
    status: statusColumn(),
    nameZh: text(),
    nameEn: text(),
    category: text(),
    subCategory: text(),
    defaultSize: text(),
    sizeRange: text(),
    supplier: text(),
    buyerName: text(),
    designer: text(),
    needleCount: text(),
    sockWeight: text(),
    requiredSampleDate: day(),
    productAttrs: jsonb().$type<Record<string, { zh?: string; en?: string; value?: string }>>().notNull().default({}),
    extraction: jsonb().$type<Record<string, ExtractedField>>(),
    sourceFileId: uuid(),
    sourceFilename: text(),
    imageFileIds: jsonb().$type<string[]>().notNull().default([]),
    recognitionError: text(),
    briefTranslation: text(),
    recognizedAt: ts(),
    confirmedAt: ts(),
    confirmedBy: uuid(),
    archivedAt: ts(),
    ...ownershipColumns,
    ...auditColumns,
  },
  (t) => [index().on(t.status), index().on(t.ownerId, t.orgId, t.customerId), index().on(t.styleId)],
);

export const samples = pgTable(
  "samples",
  {
    id: id(),
    docNo: docNoColumn(),
    styleId: uuid().notNull(),
    planningId: uuid(),
    productCode: text(),
    factoryId: uuid(),
    teamOrgId: uuid(),
    location: text(),
    colorway: text(),
    size: text(),
    dueDate: day(),
    customerRef: text(),
    briefTranslation: text(),
    yarnConfig: text(),
    craftNotes: text(),
    sampleNotes: text(),
    costStatus: text(),
    technicianId: uuid(),
    ...ownershipColumns,
    ...auditColumns,
  },
  (t) => [index().on(t.styleId), index().on(t.ownerId, t.orgId, t.customerId)],
);

export const sampleRounds = pgTable(
  "sample_rounds",
  {
    id: id(),
    sampleId: uuid().notNull(),
    roundNo: integer().notNull(),
    roundType: text().notNull(),
    quantity: integer().notNull().default(0),
    status: statusColumn(),
    stageEnteredAt: ts().notNull().defaultNow(),
    reworkCount: integer().notNull().default(0),
    dueDate: day(),
    issuedAt: ts(),
    approvedAt: ts(),
    approvalResult: text(),
    approvalDate: day(),
    approvalNote: text(),
    reviseNote: text(),
    shipmentId: uuid(),
    shipmentDocNo: text(),
    ...auditColumns,
  },
  (t) => [uniqueIndex().on(t.sampleId, t.roundNo), index().on(t.status)],
);

export const sampleStageLogs = pgTable(
  "sample_stage_logs",
  {
    id: id(),
    roundId: uuid().notNull(),
    stage: text().notNull(),
    enteredAt: ts().notNull(),
    leftAt: ts(),
    durationHours: qty(),
    location: text(),
    factoryId: uuid(),
    operatorId: uuid(),
    note: text(),
  },
  (t) => [index().on(t.roundId), index().on(t.stage, t.leftAt)],
);

export const sampleLibrary = pgTable(
  "sample_library",
  {
    id: id(),
    styleId: uuid().notNull(),
    sampleId: uuid(),
    roundId: uuid(),
    kind: text().notNull(),
    location: text(),
    quantity: integer().notNull().default(1),
    status: text().notNull().default("IN_STOCK"),
    borrower: text(),
    lentAt: ts(),
    returnedAt: ts(),
    note: text(),
    ...ownershipColumns,
    ...auditColumns,
  },
  (t) => [index().on(t.styleId)],
);

export const sampleMaterials = pgTable(
  "sample_materials",
  {
    id: id(),
    sampleId: uuid().notNull(),
    materialName: text().notNull(),
    spec: text(),
    quantity: qty(),
    unit: text(),
    supplier: text(),
    arrivalDate: day(),
    arrivedAt: ts(),
    status: text().notNull().default("PENDING"),
    note: text(),
    ...auditColumns,
  },
  (t) => [index().on(t.sampleId)],
);

export const sampleRecipients = pgTable(
  "sample_recipients",
  {
    id: id(),
    customerId: uuid().notNull(),
    company: text().notNull(),
    name: text().notNull(),
    address: text().notNull(),
    phone: text(),
    email: text(),
    courier: text(),
    isDefault: boolean().notNull().default(false),
    ...auditColumns,
  },
  (t) => [index().on(t.customerId)],
);

export const sampleShipments = pgTable(
  "sample_shipments",
  {
    id: id(),
    docNo: docNoColumn(),
    recipientId: uuid(),
    method: text().notNull(),
    courier: text(),
    trackingNo: text(),
    sentAt: ts(),
    signedAt: ts(),
    status: statusColumn(),
    items: jsonb().$type<{ styleId: string; roundId?: string; kind: string; quantity: number }[]>().notNull().default([]),
    note: text(),
    ...ownershipColumns,
    ...auditColumns,
  },
  (t) => [index().on(t.ownerId, t.orgId, t.customerId)],
);

export const testRequests = pgTable(
  "test_requests",
  {
    id: id(),
    docNo: docNoColumn(),
    styleId: uuid().notNull(),
    customerPo: text(),
    colorSize: text(),
    stage: text().notNull(),
    entrust: text(),
    agencyId: uuid(),
    serviceLevel: text(),
    items: jsonb().$type<string[]>().notNull().default([]),
    standard: text(),
    sampleQty: integer(),
    sampleSite: text(),
    sentDate: day(),
    labReceivedDate: day(),
    dueDate: day(),
    completedDate: day(),
    trackingNo: text(),
    senderId: uuid(),
    factoryId: uuid(),
    seasonCode: text(),
    status: statusColumn(),
    result: text(),
    failedItems: text(),
    correctiveAction: text(),
    resultNote: text(),
    submittedAt: ts(),
    reusedReportId: uuid(),
    reportId: uuid(),
    retestOfId: uuid(),
    ...ownershipColumns,
    ...auditColumns,
  },
  (t) => [index().on(t.styleId), index().on(t.status), index().on(t.ownerId, t.orgId, t.customerId)],
);

export const testReports = pgTable(
  "test_reports",
  {
    id: id(),
    docNo: docNoColumn(),
    agencyReportNo: text().notNull(),
    agencyId: uuid(),
    styleId: uuid().notNull(),
    items: jsonb().$type<string[]>().notNull().default([]),
    result: text().notNull(),
    issuedDate: day().notNull(),
    validUntil: day().notNull(),
    fileId: uuid(),
    reuseKey: jsonb().$type<{ structure?: string; craft?: string; yarn?: string }>().notNull().default({}),
    failedItems: text(),
    testRequestId: uuid(),
    ...ownershipColumns,
    ...auditColumns,
  },
  (t) => [index().on(t.styleId), index().on(t.validUntil)],
);

export const testReportLinks = pgTable(
  "test_report_links",
  { reportId: uuid().notNull(), styleId: uuid().notNull(), createdAt: ts().notNull().defaultNow() },
  (t) => [primaryKey({ columns: [t.reportId, t.styleId] })],
);

export const quoteStrategies = pgTable("quote_strategies", {
  id: id(),
  code: text().notNull().unique(),
  name: text().notNull(),
  nameEn: text(),
  method: text().notNull().default("MARKUP"),
  lossRate: rate().notNull().default(0),
  overheadRate: rate().notNull().default(0),
  markupRate: rate().notNull().default(0),
  targetMargin: rate().notNull().default(0),
  guardrail: rate().notNull().default(0),
  lockedFx: rate().notNull().default(7),
  moq: integer().notNull().default(0),
  smallOrderUplift: rate().notNull().default(0),
  skuTiers: jsonb().$type<{ minAmount: number; discount: number }[]>().notNull().default([]),
  enabled: boolean().notNull().default(true),
  ...auditColumns,
});

export const quotes = pgTable(
  "quotes",
  {
    id: id(),
    styleId: uuid().notNull(),
    factoryId: uuid(),
    moq: integer(),
    costTotal: money(),
    costBreakdown: jsonb().$type<{ yarn: number; yarnLossRate: number; labor: number; trims: number; other: number; yarnRaw?: number; laborRaw?: number; overheadRate?: number }>(),
    targetPriceUsd: money(),
    targetFx: rate(),
    targetSource: text(),
    targetDate: day(),
    strategyId: uuid(),
    status: statusColumn(),
    note: text(),
    archivedAt: ts(),
    ...ownershipColumns,
    ...auditColumns,
  },
  (t) => [uniqueIndex().on(t.styleId), index().on(t.ownerId, t.orgId, t.customerId)],
);

export type QuoteStrategySnapshot = {
  code: string;
  name: string;
  method: string;
  lossRate: number;
  overheadRate: number;
  markupRate: number;
  targetMargin: number;
  guardrail: number;
  lockedFx: number;
  moq: number;
  smallOrderUplift: number;
  skuTiers: { minAmount: number; discount: number }[];
  version: number;
};

export type QuoteRoundPricing = { basePrice: number; upliftRate: number; skuAmount: number; discountRate: number; suggestedPrice: number };

export const quoteRounds = pgTable(
  "quote_rounds",
  {
    id: id(),
    quoteId: uuid().notNull(),
    docNo: docNoColumn(),
    kind: text().notNull(),
    roundNo: integer().notNull(),
    priceCny: money().notNull(),
    priceUsd: money().notNull(),
    fx: rate().notNull(),
    quantity: integer().notNull(),
    strategyId: uuid(),
    margin: rate().notNull(),
    guardrailPassed: boolean().notNull(),
    diffToTargetUsd: money(),
    status: statusColumn(),
    quotedBy: uuid(),
    quotedAt: ts(),
    overrideApprovedBy: uuid(),
    overrideReason: text(),
    costTotal: money(),
    strategySnapshot: jsonb().$type<QuoteStrategySnapshot>(),
    pricing: jsonb().$type<QuoteRoundPricing>(),
    feedbackAt: ts(),
    feedbackNote: text(),
    note: text(),
    ...auditColumns,
  },
  (t) => [index().on(t.quoteId)],
);

export const quoteCostItems = pgTable(
  "quote_cost_items",
  {
    id: id(),
    quoteId: uuid().notNull(),
    category: text().notNull(),
    name: text().notNull(),
    spec: text(),
    quantity: qty(),
    unitPrice: money(),
    amount: money().notNull(),
    ...auditColumns,
  },
  (t) => [index().on(t.quoteId)],
);

export type HandoverChecklist = Record<string, { ok: boolean; applicable?: boolean; ref?: string; refId?: string; note?: string }>;
export type HandoverChangeEntry = { at: string; by: string; byName: string; reason: string };

export const handoverPackages = pgTable(
  "handover_packages",
  {
    id: id(),
    docNo: docNoColumn(),
    styleId: uuid().notNull().unique(),
    status: statusColumn(),
    checklist: jsonb().$type<HandoverChecklist>().notNull().default({}),
    techPackFileId: uuid(),
    qrsLibraryId: uuid(),
    frozenAt: ts(),
    completedBy: uuid(),
    snapshot: jsonb().$type<Record<string, unknown>>(),
    changeLog: jsonb().$type<HandoverChangeEntry[]>().notNull().default([]),
    collectingSince: ts().notNull().defaultNow(),
    ...ownershipColumns,
    ...auditColumns,
  },
  (t) => [index().on(t.ownerId, t.orgId, t.customerId)],
);

export const kbDocuments = pgTable(
  "kb_documents",
  {
    id: id(),
    kind: text().notNull(),
    title: text().notNull(),
    customerId: uuid(),
    fileId: uuid(),
    content: text().notNull().default(""),
    tags: jsonb().$type<string[]>().notNull().default([]),
    ...auditColumns,
  },
  (t) => [index().on(t.kind, t.customerId)],
);

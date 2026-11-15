import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { auditColumns, day, docNoColumn, id, money, ownershipColumns, qty, rate, statusColumn, ts } from "./_common.js";
import type { ExtractedField } from "./development.js";

export type RuleCheckItem = { key: string; label: { zh: string; en: string }; passed: boolean; detail?: string };

export const customerOrders = pgTable(
  "customer_orders",
  {
    id: id(),
    poNo: text().notNull(),
    revision: integer().notNull().default(1),
    revisionDate: day(),
    channel: text(),
    poType: text(),
    productLine: text(),
    seasonCode: text(),
    styleType: text(),
    tradeTerm: text(),
    paymentTerms: text(),
    currency: text().notNull().default("USD"),
    fobAmount: money(),
    buyerEntity: text(),
    origin: text(),
    orderDate: day(),
    customerDueDate: day().notNull(),
    factoryReplyDate: day(),
    delayDays: integer(),
    factoryId: uuid(),
    factoryEntity: text(),
    transportMode: text(),
    destination: text(),
    totalUnits: integer(),
    totalPairs: integer().notNull().default(0),
    merchandiserId: uuid(),
    status: statusColumn(),
    poTerms: text(),
    note: text(),
    sourceFileId: uuid(),
    extraction: jsonb().$type<Record<string, ExtractedField>>(),
    ruleCheck: jsonb().$type<RuleCheckItem[]>(),
    flowVersionId: uuid(),
    confirmedAt: ts(),
    cancelledAt: ts(),
    ...ownershipColumns,
    ...auditColumns,
  },
  (t) => [
    uniqueIndex().on(t.customerId, t.poNo),
    index().on(t.ownerId, t.orgId, t.customerId),
    index().on(t.status, t.customerDueDate),
  ],
);

export const orderLines = pgTable(
  "order_lines",
  {
    id: id(),
    orderId: uuid().notNull(),
    styleId: uuid().notNull(),
    color: text(),
    size: text(),
    sku: text(),
    quantity: integer().notNull(),
    unitPrice: money(),
  },
  (t) => [index().on(t.orderId), index().on(t.styleId)],
);

export const poRevisions = pgTable(
  "po_revisions",
  {
    id: id(),
    orderId: uuid().notNull(),
    revision: integer().notNull(),
    snapshot: jsonb().$type<Record<string, unknown>>().notNull(),
    note: text(),
    createdBy: uuid(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [uniqueIndex().on(t.orderId, t.revision)],
);

export const factoryReplies = pgTable(
  "factory_replies",
  {
    id: id(),
    orderId: uuid().notNull(),
    versionNo: integer().notNull(),
    replyDate: day().notNull(),
    delayDays: integer().notNull().default(0),
    note: text(),
    createdBy: uuid(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [uniqueIndex().on(t.orderId, t.versionNo)],
);

export const orderStageLogs = pgTable(
  "order_stage_logs",
  {
    id: id(),
    orderId: uuid().notNull(),
    status: text().notNull(),
    action: text().notNull(),
    note: text(),
    at: ts().notNull().defaultNow(),
    operatorId: uuid(),
    operatorName: text(),
  },
  (t) => [index().on(t.orderId)],
);

export const productionProgress = pgTable(
  "production_progress",
  {
    id: id(),
    orderId: uuid().notNull(),
    factoryId: uuid(),
    reportDate: day().notNull(),
    knittedPairs: integer().notNull().default(0),
    packedPairs: integer().notNull().default(0),
    completionRate: rate(),
    note: text(),
    ...auditColumns,
  },
  (t) => [index().on(t.orderId)],
);

export const packagingPlans = pgTable(
  "packaging_plans",
  {
    id: id(),
    docNo: docNoColumn(),
    orderId: uuid(),
    title: text().notNull(),
    currentVersion: integer().notNull().default(1),
    status: statusColumn(),
    method: text(),
    pairsPerCarton: integer(),
    cartonSize: text(),
    cartonType: text(),
    strength: text(),
    shippingMark: text(),
    markPosition: text(),
    sizeSticker: text(),
    sealSticker: text(),
    innerBag: text(),
    tape: text(),
    destination: text(),
    requirements: jsonb().$type<{ title: string; content: string }[]>().notNull().default([]),
    confirmedAt: ts(),
    ...ownershipColumns,
    ...auditColumns,
  },
  (t) => [index().on(t.orderId), index().on(t.ownerId, t.orgId, t.customerId)],
);

export const packagingPlanVersions = pgTable(
  "packaging_plan_versions",
  {
    id: id(),
    planId: uuid().notNull(),
    versionNo: integer().notNull(),
    snapshot: jsonb().$type<Record<string, unknown>>().notNull(),
    changeNote: text(),
    customerConfirmed: boolean().notNull().default(false),
    changedBy: uuid(),
    changedAt: ts().notNull().defaultNow(),
  },
  (t) => [uniqueIndex().on(t.planId, t.versionNo)],
);

export const cartons = pgTable(
  "cartons",
  {
    id: id(),
    docNo: docNoColumn(),
    orderId: uuid().notNull(),
    styleId: uuid(),
    customerSku: text(),
    size: text(),
    pairs: integer().notNull(),
    pairsPerCarton: integer().notNull(),
    cartonCount: integer().notNull(),
    cartonRange: text(),
    packDueDate: day(),
    status: statusColumn(),
    ...ownershipColumns,
    ...auditColumns,
  },
  (t) => [index().on(t.orderId)],
);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: id(),
    docNo: docNoColumn(),
    orderId: uuid(),
    sampleId: uuid(),
    supplier: text().notNull(),
    category: text().notNull(),
    status: statusColumn(),
    orderedAt: day().notNull(),
    promisedDate: day(),
    note: text(),
    ...ownershipColumns,
    ...auditColumns,
  },
  (t) => [index().on(t.orderId), index().on(t.status, t.promisedDate)],
);

export const purchaseLines = pgTable(
  "purchase_lines",
  {
    id: id(),
    purchaseId: uuid().notNull(),
    materialId: uuid(),
    name: text().notNull(),
    spec: text(),
    quantity: qty().notNull(),
    unit: text().notNull(),
    unitPrice: money(),
    receivedQty: qty().notNull().default(0),
  },
  (t) => [index().on(t.purchaseId)],
);

export const purchaseReceipts = pgTable(
  "purchase_receipts",
  {
    id: id(),
    purchaseId: uuid().notNull(),
    lineId: uuid().notNull(),
    quantity: qty().notNull(),
    receivedAt: day().notNull(),
    note: text(),
    createdBy: uuid(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.purchaseId)],
);

export const capacityLedgerVersions = pgTable("capacity_ledger_versions", {
  id: id(),
  versionNo: integer().notNull().unique(),
  label: text().notNull(),
  asOfDate: day().notNull(),
  status: text().notNull().default("DRAFT"),
  publishedAt: ts(),
  publishedBy: uuid(),
  ...auditColumns,
});

export const capacityRows = pgTable(
  "capacity_rows",
  {
    id: id(),
    versionId: uuid().notNull(),
    ledger: text().notNull(),
    baseId: uuid().notNull(),
    needleTypeId: uuid(),
    process: text(),
    leadDays: integer(),
    availableDays: integer(),
    machineCount: integer(),
    dailyOutput: qty(),
    cumulativeCapacity: qty(),
    unproducedQty: qty(),
    spareCapacity: qty(),
    spareRate: rate(),
    extra: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index().on(t.versionId, t.ledger)],
);

export const ledgerTasks = pgTable("ledger_tasks", {
  id: id(),
  ledger: text().notNull().unique(),
  name: text().notNull(),
  frequency: text().notNull(),
  ownerId: uuid(),
  currentVersion: text(),
  lastUpdatedAt: ts(),
  nextDueAt: day(),
  status: statusColumn(),
  note: text(),
  ...auditColumns,
});

export const inspections = pgTable(
  "inspections",
  {
    id: id(),
    docNo: docNoColumn(),
    orderId: uuid().notNull(),
    styleId: uuid(),
    color: text(),
    stage: text().notNull(),
    roundNo: integer().notNull().default(1),
    factoryId: uuid(),
    plannedDate: day(),
    actualDate: day(),
    plannedExFactory: day(),
    method: text(),
    inspector: text(),
    channel: text(),
    aql: text(),
    granularity: text(),
    orderQty: integer(),
    cartonCount: integer(),
    productionRate: rate(),
    packingRate: rate(),
    plannedSampleQty: integer(),
    actualSampleQty: integer(),
    defectQty: integer(),
    defectRate: rate(),
    preconditions: jsonb().$type<string[]>().notNull().default([]),
    result: text(),
    defectNote: text(),
    correctiveAction: text(),
    status: statusColumn(),
    releasedAt: ts(),
    releaseCheck: jsonb().$type<RuleCheckItem[]>(),
    concession: boolean().notNull().default(false),
    ...ownershipColumns,
    ...auditColumns,
  },
  (t) => [index().on(t.orderId), index().on(t.status), index().on(t.ownerId, t.orgId, t.customerId)],
);

export const inspectionLogs = pgTable(
  "inspection_logs",
  {
    id: id(),
    inspectionId: uuid().notNull(),
    at: ts().notNull().defaultNow(),
    action: text().notNull(),
    fromStatus: text(),
    toStatus: text(),
    note: text(),
    operatorId: uuid(),
  },
  (t) => [index().on(t.inspectionId)],
);

export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    docNo: docNoColumn(),
    orderId: uuid().notNull(),
    forwarderId: uuid(),
    carrier: text(),
    vessel: text(),
    blNo: text(),
    etd: day(),
    eta: day(),
    status: text().notNull().default("BOOKED"),
    note: text(),
    ...ownershipColumns,
    ...auditColumns,
  },
  (t) => [index().on(t.orderId)],
);

export const shipments = pgTable(
  "shipments",
  {
    id: id(),
    docNo: docNoColumn(),
    orderId: uuid().notNull(),
    bookingId: uuid(),
    styleId: uuid(),
    transportMode: text(),
    destination: text(),
    carrierText: text(),
    blNo: text(),
    etd: day(),
    eta: day(),
    cartonCount: integer(),
    pairs: integer(),
    grossWeight: qty(),
    factoryId: uuid(),
    seasonCode: text(),
    status: statusColumn(),
    signedAt: ts(),
    ...ownershipColumns,
    ...auditColumns,
  },
  (t) => [index().on(t.orderId), index().on(t.status), index().on(t.ownerId, t.orgId, t.customerId)],
);

export const shipmentEvents = pgTable(
  "shipment_events",
  {
    id: id(),
    shipmentId: uuid().notNull(),
    status: text().notNull(),
    plannedAt: day(),
    actualAt: ts(),
    note: text(),
  },
  (t) => [index().on(t.shipmentId)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    invoiceNo: text().notNull().unique(),
    orderId: uuid(),
    shipmentId: uuid(),
    amount: money().notNull(),
    currency: text().notNull(),
    issuedDate: day().notNull(),
    ...ownershipColumns,
    ...auditColumns,
  },
  (t) => [index().on(t.orderId)],
);

export const receivables = pgTable(
  "receivables",
  {
    id: id(),
    docNo: docNoColumn(),
    settlementEntity: text(),
    sourceType: text().notNull(),
    sourceNo: text(),
    orderId: uuid(),
    shipmentId: uuid(),
    invoiceId: uuid(),
    type: text().notNull(),
    amount: money().notNull(),
    currency: text().notNull(),
    dueDate: day().notNull(),
    receivedAmount: money().notNull().default(0),
    status: statusColumn(),
    disputed: boolean().notNull().default(false),
    missingData: boolean().notNull().default(false),
    ...ownershipColumns,
    ...auditColumns,
  },
  (t) => [index().on(t.status, t.dueDate), index().on(t.ownerId, t.orgId, t.customerId)],
);

export const receipts = pgTable(
  "receipts",
  {
    id: id(),
    receivableId: uuid().notNull(),
    amount: money().notNull(),
    currency: text().notNull(),
    receivedAt: day().notNull(),
    method: text(),
    note: text(),
    createdBy: uuid(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.receivableId)],
);

export const collectionLogs = pgTable(
  "collection_logs",
  {
    id: id(),
    receivableId: uuid().notNull(),
    channel: text().notNull(),
    result: text().notNull(),
    note: text(),
    nextFollowUp: day(),
    createdBy: uuid(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.receivableId)],
);

export const factoryAudits = pgTable(
  "factory_audits",
  {
    id: id(),
    docNo: docNoColumn(),
    factoryId: uuid().notNull(),
    auditType: text().notNull(),
    plannedDate: day(),
    actualDate: day(),
    auditor: text(),
    result: text(),
    score: rate(),
    status: statusColumn(),
    note: text(),
    ...ownershipColumns,
    ...auditColumns,
  },
  (t) => [index().on(t.factoryId), index().on(t.status)],
);

export const auditFindings = pgTable(
  "audit_findings",
  {
    id: id(),
    auditId: uuid().notNull(),
    item: text().notNull(),
    severity: text().notNull(),
    correctiveAction: text(),
    dueDate: day(),
    status: text().notNull().default("OPEN"),
    closedAt: ts(),
    ...auditColumns,
  },
  (t) => [index().on(t.auditId)],
);

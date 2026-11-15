import type { SyncObject } from "@otd/contracts/sync";
import { type DbOrTx, customerOrders, customers, factories, inspections, styles, testReports } from "@otd/db";
import { type SQL, and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

export type SourceRecord = { localId: string | null; key: string; updatedAt: string | null; data: Record<string, unknown> };
export type LoadOptions = { customerId?: string | null; watermark?: string | null; ids?: string[]; latest?: number };

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function filters(opts: LoadOptions, cols: { id: PgColumn; customerId: PgColumn; updatedAt: PgColumn }): SQL[] {
  const conds: SQL[] = [];
  if (opts.customerId) conds.push(eq(cols.customerId, opts.customerId));
  if (opts.watermark) conds.push(sql`date_trunc('milliseconds', ${cols.updatedAt}) > ${opts.watermark}::timestamptz`);
  if (opts.ids) conds.push(opts.ids.length ? inArray(cols.id, opts.ids.filter((id) => UUID.test(id))) : sql`false`);
  return conds;
}

function ordering(opts: LoadOptions, cols: { id: PgColumn; updatedAt: PgColumn }): SQL[] {
  return opts.latest ? [desc(cols.updatedAt), desc(cols.id)] : [asc(cols.updatedAt), asc(cols.id)];
}

const iso = (d: Date) => d.toISOString();

async function loadOrders(db: DbOrTx, opts: LoadOptions, shape: "ORDER_DUE" | "TNA"): Promise<SourceRecord[]> {
  const conds = [ne(customerOrders.status, "CANCELLED"), ...filters(opts, customerOrders)];
  const q = db
    .select({
      id: customerOrders.id,
      poNo: customerOrders.poNo,
      customerCode: customers.code,
      orderDate: customerOrders.orderDate,
      customerDueDate: customerOrders.customerDueDate,
      factoryReplyDate: customerOrders.factoryReplyDate,
      delayDays: customerOrders.delayDays,
      factoryCode: factories.code,
      totalPairs: customerOrders.totalPairs,
      seasonCode: customerOrders.seasonCode,
      status: customerOrders.status,
      updatedAt: customerOrders.updatedAt,
    })
    .from(customerOrders)
    .leftJoin(customers, eq(customers.id, customerOrders.customerId))
    .leftJoin(factories, eq(factories.id, customerOrders.factoryId))
    .where(and(...conds))
    .orderBy(...ordering(opts, customerOrders));
  const rows = opts.latest ? await q.limit(opts.latest) : await q;
  return rows.map((r) => {
    const data: Record<string, unknown> =
      shape === "ORDER_DUE"
        ? { id: r.id, poNo: r.poNo, customerCode: r.customerCode, customerDueDate: r.customerDueDate, factoryReplyDate: r.factoryReplyDate, delayDays: r.delayDays, factoryCode: r.factoryCode, totalPairs: r.totalPairs, seasonCode: r.seasonCode, status: r.status, updatedAt: iso(r.updatedAt) }
        : { id: r.id, poNo: r.poNo, customerCode: r.customerCode, orderDate: r.orderDate, customerDueDate: r.customerDueDate, factoryReplyDate: r.factoryReplyDate, status: r.status, updatedAt: iso(r.updatedAt) };
    return { localId: r.id, key: r.poNo, updatedAt: iso(r.updatedAt), data };
  });
}

async function loadStyles(db: DbOrTx, opts: LoadOptions): Promise<SourceRecord[]> {
  const q = db
    .select({ id: styles.id, styleNo: styles.styleNo, nameZh: styles.nameZh, nameEn: styles.nameEn, category: styles.category, seasonCode: styles.seasonCode, customerCode: customers.code, updatedAt: styles.updatedAt })
    .from(styles)
    .leftJoin(customers, eq(customers.id, styles.customerId))
    .where(and(...filters(opts, styles)))
    .orderBy(...ordering(opts, styles));
  const rows = opts.latest ? await q.limit(opts.latest) : await q;
  return rows.map((r) => ({ localId: r.id, key: `${r.customerCode ?? ""}-${r.styleNo}`, updatedAt: iso(r.updatedAt), data: { ...r, updatedAt: iso(r.updatedAt) } }));
}

async function loadTestReports(db: DbOrTx, opts: LoadOptions): Promise<SourceRecord[]> {
  const q = db
    .select({
      id: testReports.id,
      docNo: testReports.docNo,
      agencyReportNo: testReports.agencyReportNo,
      styleNo: styles.styleNo,
      customerCode: customers.code,
      items: testReports.items,
      result: testReports.result,
      issuedDate: testReports.issuedDate,
      validUntil: testReports.validUntil,
      updatedAt: testReports.updatedAt,
    })
    .from(testReports)
    .leftJoin(styles, eq(styles.id, testReports.styleId))
    .leftJoin(customers, eq(customers.id, testReports.customerId))
    .where(and(...filters(opts, testReports)))
    .orderBy(...ordering(opts, testReports));
  const rows = opts.latest ? await q.limit(opts.latest) : await q;
  return rows.map((r) => ({ localId: r.id, key: r.docNo, updatedAt: iso(r.updatedAt), data: { ...r, updatedAt: iso(r.updatedAt) } }));
}

async function loadInspections(db: DbOrTx, opts: LoadOptions): Promise<SourceRecord[]> {
  const q = db
    .select({
      id: inspections.id,
      docNo: inspections.docNo,
      poNo: customerOrders.poNo,
      customerCode: customers.code,
      stage: inspections.stage,
      plannedDate: inspections.plannedDate,
      actualDate: inspections.actualDate,
      result: inspections.result,
      updatedAt: inspections.updatedAt,
    })
    .from(inspections)
    .leftJoin(customerOrders, eq(customerOrders.id, inspections.orderId))
    .leftJoin(customers, eq(customers.id, inspections.customerId))
    .where(and(...filters(opts, inspections)))
    .orderBy(...ordering(opts, inspections));
  const rows = opts.latest ? await q.limit(opts.latest) : await q;
  return rows.map((r) => ({ localId: r.id, key: r.docNo, updatedAt: iso(r.updatedAt), data: { ...r, updatedAt: iso(r.updatedAt) } }));
}

export async function loadLocal(db: DbOrTx, object: SyncObject, opts: LoadOptions = {}): Promise<SourceRecord[]> {
  switch (object) {
    case "ORDER_DUE":
    case "TNA":
      return loadOrders(db, opts, object);
    case "STYLE":
      return loadStyles(db, opts);
    case "TEST_REPORT":
      return loadTestReports(db, opts);
    case "INSPECTION":
      return loadInspections(db, opts);
    default:
      return [];
  }
}

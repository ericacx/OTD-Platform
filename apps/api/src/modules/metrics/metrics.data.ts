import {
  type Database,
  bookings,
  customerOrders,
  customers,
  exchangeRates,
  factoryReplies,
  inspections,
  nodeStateSnapshots,
  orderLines,
  orgs,
  patrolHits,
  patrolRules,
  poRevisions,
  purchaseOrders,
  quoteRounds,
  quotes,
  receipts,
  receivables,
  roles,
  shipmentEvents,
  shipments,
  styles,
  testRequests,
  todos,
  userRoles,
  users,
} from "@otd/db";
import type { InspectionRoundRecord } from "@otd/db";
import { and, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { visibleHits } from "../patrol/patrol.scope.js";
import { type MetricsScope, owned } from "./metrics.scope.js";
import { dateOf } from "./metrics.period.js";

export type Owned = { customerId: string; ownerId: string; orgId: string };
export type OrderRow = Owned & { id: string; poNo: string; status: string; currency: string; fobAmount: number; totalPairs: number; customerDueDate: string; confirmedAt: string | null; styleIds: string[] };
export type ShipmentRow = Owned & { id: string; orderId: string; styleId: string | null; pairs: number; status: string; sailedAt: string | null };
export type ReceivableRow = Owned & { id: string; amount: number; receivedAmount: number; currency: string; dueDate: string; status: string };
export type ReceiptRow = Owned & { receivableId: string; amount: number; currency: string; receivedAt: string };
export type InspectionRow = Owned & { id: string; orderId: string; stage: string; status: string; result: string | null; actualDate: string | null; rounds: InspectionRoundRecord[] };
export type TestRow = Owned & { id: string; result: string | null; retestOfId: string | null };
export type BookingRow = Owned & { id: string; orderId: string; etd: string | null; status: string; confirmedAt: string | null };
export type PurchaseRow = Owned & { id: string; status: string; promisedDate: string | null; receivedAt: string | null };
export type HitRow = { id: string; ruleId: string; ruleCode: string; ruleType: string; ruleName: string; module: string; light: string; overdueDays: number; customerId: string | null; orderId: string | null; targetType: string; targetId: string; assigneeId: string | null; ownerId: string | null; orgId: string | null };
export type TodoRow = { id: string; assigneeId: string; customerId: string | null; docType: string | null; docId: string | null; action: string; status: string; dueAt: Date | null; doneAt: Date | null; createdAt: Date };
export type UserRow = { id: string; name: string; orgId: string; roles: string[] };

export type MetricsData = {
  orders: OrderRow[];
  shipments: ShipmentRow[];
  receivables: ReceivableRow[];
  receipts: ReceiptRow[];
  inspections: InspectionRow[];
  tests: TestRow[];
  bookings: BookingRow[];
  purchases: PurchaseRow[];
  hits: HitRow[];
  todos: TodoRow[];
  blocked: Set<string>;
  replies: Map<string, { versionNo: number; delayDays: number }[]>;
  revisionDueDates: Map<string, string[]>;
  margins: Map<string, number>;
  styleCustomers: Set<string>;
  customerNames: Map<string, string>;
  users: Map<string, UserRow>;
  scopeUsers: string[];
  orgs: { id: string; code: string; name: string; nameEn: string | null; parentId: string | null; path: string; type: string; fn: string }[];
  rateDate: string;
  toCny: (amount: number, currency: string) => number;
};

export async function loadMetricsData(db: Database, scope: MetricsScope, rateDate: string): Promise<MetricsData> {
  const ctx = scope.ctx;
  const orderRows = await db
    .select({ id: customerOrders.id, poNo: customerOrders.poNo, status: customerOrders.status, currency: customerOrders.currency, fobAmount: customerOrders.fobAmount, totalPairs: customerOrders.totalPairs, customerDueDate: customerOrders.customerDueDate, confirmedAt: customerOrders.confirmedAt, customerId: customerOrders.customerId, ownerId: customerOrders.ownerId, orgId: customerOrders.orgId })
    .from(customerOrders)
    .where(owned(customerOrders, scope));
  const orderIds = orderRows.map((o) => o.id);
  const lines = orderIds.length ? await db.select({ orderId: orderLines.orderId, styleId: orderLines.styleId }).from(orderLines).where(inArray(orderLines.orderId, orderIds)) : [];
  const orders: OrderRow[] = orderRows.map((o) => ({ ...o, fobAmount: o.fobAmount ?? 0, confirmedAt: dateOf(o.confirmedAt), styleIds: [...new Set(lines.filter((l) => l.orderId === o.id).map((l) => l.styleId))] }));

  const shipmentRows = await db
    .select({ id: shipments.id, orderId: shipments.orderId, styleId: shipments.styleId, pairs: shipments.pairs, status: shipments.status, customerId: shipments.customerId, ownerId: shipments.ownerId, orgId: shipments.orgId })
    .from(shipments)
    .where(owned(shipments, scope));
  const sailed = shipmentRows.length
    ? await db.select({ shipmentId: shipmentEvents.shipmentId, at: shipmentEvents.actualAt }).from(shipmentEvents).where(and(inArray(shipmentEvents.shipmentId, shipmentRows.map((s) => s.id)), eq(shipmentEvents.status, "SAILED"), isNotNull(shipmentEvents.actualAt)))
    : [];
  const sailedAt = new Map(sailed.map((s) => [s.shipmentId, dateOf(s.at)]));
  const shipmentList: ShipmentRow[] = shipmentRows.map((s) => ({ ...s, pairs: s.pairs ?? 0, sailedAt: sailedAt.get(s.id) ?? null }));

  const arRows = await db
    .select({ id: receivables.id, amount: receivables.amount, receivedAmount: receivables.receivedAmount, currency: receivables.currency, dueDate: receivables.dueDate, status: receivables.status, customerId: receivables.customerId, ownerId: receivables.ownerId, orgId: receivables.orgId })
    .from(receivables)
    .where(owned(receivables, scope));
  const receiptRows = arRows.length ? await db.select({ receivableId: receipts.receivableId, amount: receipts.amount, currency: receipts.currency, receivedAt: receipts.receivedAt }).from(receipts).where(inArray(receipts.receivableId, arRows.map((r) => r.id))) : [];
  const arById = new Map(arRows.map((r) => [r.id, r]));

  const inspectionRows = await db
    .select({ id: inspections.id, orderId: inspections.orderId, stage: inspections.stage, status: inspections.status, result: inspections.result, actualDate: inspections.actualDate, rounds: inspections.rounds, customerId: inspections.customerId, ownerId: inspections.ownerId, orgId: inspections.orgId })
    .from(inspections)
    .where(owned(inspections, scope));
  const testRows = await db.select({ id: testRequests.id, result: testRequests.result, retestOfId: testRequests.retestOfId, customerId: testRequests.customerId, ownerId: testRequests.ownerId, orgId: testRequests.orgId }).from(testRequests).where(owned(testRequests, scope));
  const bookingRows = await db
    .select({ id: bookings.id, orderId: bookings.orderId, etd: bookings.etd, status: bookings.status, confirmedAt: bookings.confirmedAt, customerId: bookings.customerId, ownerId: bookings.ownerId, orgId: bookings.orgId })
    .from(bookings)
    .where(owned(bookings, scope));
  const purchaseRows = await db
    .select({ id: purchaseOrders.id, status: purchaseOrders.status, promisedDate: purchaseOrders.promisedDate, receivedAt: purchaseOrders.receivedAt, customerId: purchaseOrders.customerId, ownerId: purchaseOrders.ownerId, orgId: purchaseOrders.orgId })
    .from(purchaseOrders)
    .where(owned(purchaseOrders, scope));

  const hitConds = [visibleHits(ctx), inArray(patrolHits.status, ["OPEN", "HANDLING"])];
  if (scope.customerId) hitConds.push(eq(patrolHits.customerId, scope.customerId));
  if (scope.orgIds) hitConds.push(scope.orgIds.length ? inArray(patrolHits.orgId, scope.orgIds) : sql`false`);
  const hitRows = await db
    .select({ id: patrolHits.id, ruleId: patrolHits.ruleId, ruleCode: patrolRules.code, ruleType: patrolRules.ruleType, ruleName: patrolRules.name, module: patrolHits.module, light: patrolHits.light, overdueDays: patrolHits.overdueDays, customerId: patrolHits.customerId, orderId: patrolHits.orderId, targetType: patrolHits.targetType, targetId: patrolHits.targetId, assigneeId: patrolHits.assigneeId, ownerId: patrolHits.ownerId, orgId: patrolHits.orgId })
    .from(patrolHits)
    .innerJoin(patrolRules, eq(patrolRules.id, patrolHits.ruleId))
    .where(and(...hitConds));

  const blocked = new Set(orderIds.length ? (await db.selectDistinct({ id: nodeStateSnapshots.orderId }).from(nodeStateSnapshots).where(and(inArray(nodeStateSnapshots.orderId, orderIds), eq(nodeStateSnapshots.state, "BLOCKED")))).map((r) => r.id) : []);
  const replyRows = orderIds.length ? await db.select({ orderId: factoryReplies.orderId, versionNo: factoryReplies.versionNo, delayDays: factoryReplies.delayDays }).from(factoryReplies).where(inArray(factoryReplies.orderId, orderIds)) : [];
  const replies = new Map<string, { versionNo: number; delayDays: number }[]>();
  for (const r of replyRows) replies.set(r.orderId, [...(replies.get(r.orderId) ?? []), { versionNo: r.versionNo, delayDays: r.delayDays }]);
  const revisionRows = orderIds.length ? await db.select({ orderId: poRevisions.orderId, snapshot: poRevisions.snapshot }).from(poRevisions).where(inArray(poRevisions.orderId, orderIds)) : [];
  const revisionDueDates = new Map<string, string[]>();
  for (const r of revisionRows) {
    const due = r.snapshot.customerDueDate;
    if (typeof due === "string") revisionDueDates.set(r.orderId, [...(revisionDueDates.get(r.orderId) ?? []), due]);
  }

  const styleIds = [...new Set([...orders.flatMap((o) => o.styleIds), ...shipmentList.map((s) => s.styleId).filter((x): x is string => !!x)])];
  const marginRows = styleIds.length
    ? await db
        .select({ styleId: quotes.styleId, margin: quoteRounds.margin })
        .from(quoteRounds)
        .innerJoin(quotes, eq(quotes.id, quoteRounds.quoteId))
        .where(and(inArray(quotes.styleId, styleIds), eq(quoteRounds.kind, "CUSTOMER"), eq(quoteRounds.status, "ACCEPTED")))
        .orderBy(desc(quoteRounds.quotedAt))
    : [];
  const margins = new Map<string, number>();
  for (const m of marginRows) if (!margins.has(m.styleId)) margins.set(m.styleId, m.margin);
  const styleCustomers = new Set((await db.selectDistinct({ customerId: styles.customerId }).from(styles).where(owned(styles, scope))).map((s) => s.customerId));

  const customerNames = new Map((await db.select({ id: customers.id, name: customers.name }).from(customers)).map((c) => [c.id, c.name]));
  const userRows = await db.select({ id: users.id, name: users.name, orgId: users.primaryOrgId, status: users.status }).from(users);
  const roleRows = await db.select({ userId: userRoles.userId, code: roles.code }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId));
  const userMap = new Map<string, UserRow>(userRows.filter((u) => u.status === "ACTIVE").map((u) => [u.id, { id: u.id, name: u.name, orgId: u.orgId, roles: roleRows.filter((r) => r.userId === u.id).map((r) => r.code) }]));
  const orgRows = (await db.select({ id: orgs.id, code: orgs.code, name: orgs.name, nameEn: orgs.nameEn, parentId: orgs.parentId, path: orgs.path, type: orgs.type, fn: orgs.function, status: orgs.status }).from(orgs)).filter((o) => o.status === "ACTIVE");

  const scopeUsers = scopeUsersOf(scope, [...userMap.values()]);
  const todoConds = [inArray(todos.assigneeId, scopeUsers.length ? scopeUsers : ["00000000-0000-7000-8000-000000000000"]), ne(todos.status, "CANCELLED")];
  if (scope.customerId) todoConds.push(eq(todos.customerId, scope.customerId));
  if (ctx.customerScope.mode === "LIST") todoConds.push(ctx.customerScope.customerIds.length ? or(isNull(todos.customerId), inArray(todos.customerId, ctx.customerScope.customerIds))! : isNull(todos.customerId));
  const todoRows = await db
    .select({ id: todos.id, assigneeId: todos.assigneeId, customerId: todos.customerId, docType: todos.docType, docId: todos.docId, action: todos.action, status: todos.status, dueAt: todos.dueAt, doneAt: todos.doneAt, createdAt: todos.createdAt })
    .from(todos)
    .where(and(...todoConds));

  const rates = await db.select().from(exchangeRates).orderBy(desc(exchangeRates.effectiveDate));
  const rateOf = (cur: string) => (rates.find((r) => r.currency === cur && r.effectiveDate <= rateDate) ?? rates.find((r) => r.currency === cur))?.rateToCny;

  return {
    orders,
    shipments: shipmentList,
    receivables: arRows,
    receipts: receiptRows.flatMap((r) => {
      const ar = arById.get(r.receivableId);
      return ar ? [{ ...r, customerId: ar.customerId, ownerId: ar.ownerId, orgId: ar.orgId }] : [];
    }),
    inspections: inspectionRows,
    tests: testRows,
    bookings: bookingRows.map((b) => ({ ...b, confirmedAt: dateOf(b.confirmedAt) })),
    purchases: purchaseRows,
    hits: hitRows,
    todos: todoRows,
    blocked,
    replies,
    revisionDueDates,
    margins,
    styleCustomers,
    customerNames,
    users: userMap,
    scopeUsers,
    orgs: orgRows,
    rateDate,
    toCny: (amount, currency) => (currency === "CNY" ? amount : amount * (rateOf(currency) ?? 0)),
  };
}

function scopeUsersOf(scope: MetricsScope, all: UserRow[]): string[] {
  const ctx = scope.ctx;
  let list: UserRow[];
  if (ctx.system || ctx.dataScope.mode === "ALL") list = all;
  else if (ctx.dataScope.mode === "SELF" || ctx.functional) list = all.filter((u) => u.id === ctx.userId);
  else list = all.filter((u) => ctx.dataScope.orgIds.includes(u.orgId));
  if (scope.orgIds) list = list.filter((u) => scope.orgIds!.includes(u.orgId));
  return list.map((u) => u.id);
}

import type { MetricsData, OrderRow, TodoRow } from "./metrics.data.js";
import { addDays, daysBetween, inRange } from "./metrics.period.js";

export const ACTIVE_ORDER = new Set(["PENDING_CONFIRM", "TO_SCHEDULE", "IN_PRODUCTION", "TO_SHIP"]);
export const AR_OPEN = new Set(["NOT_DUE", "DUE", "PARTIAL"]);
export const HIGH_RISK = { overdueOrders: 2, qualityIssues: 3, overdueArCny: 200_000 };
export const WATCH_DUE_DAYS = 14;
export const BOOKING_LEAD_DAYS = 14;
export const SHIP_TOLERANCE = 0.97;
const FEEDBACK_RULES = new Set(["ROUND_AWAITING_APPROVAL", "QUOTE_NO_FEEDBACK"]);
const REWORK_ACTIONS = new Set(["inspection.rework"]);
const DAY = 86_400_000;

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const wan = (cny: number) => round1(cny / 10_000);
export const pct = (n: number, d: number): number | null => (d > 0 ? round1((n / d) * 100) : null);

export type RowFilter = (row: { customerId: string | null; ownerId?: string | null; orgId?: string | null }) => boolean;
export const ALL_ROWS: RowFilter = () => true;

export const CATEGORIES = [
  { key: "REQUIREMENT", label: { zh: "需求确认", en: "Requirements" } },
  { key: "SAMPLE", label: { zh: "样品开发", en: "Sampling" } },
  { key: "QUOTE", label: { zh: "成本报价", en: "Costing" } },
  { key: "PO_REVIEW", label: { zh: "订单复核", en: "PO review" } },
  { key: "MATERIAL", label: { zh: "物料保障", en: "Materials" } },
  { key: "PRODUCTION", label: { zh: "生产跟进", en: "Production" } },
  { key: "QUALITY", label: { zh: "质量放行", en: "Quality" } },
  { key: "SHIPPING", label: { zh: "出货单证", en: "Shipping docs" } },
  { key: "COLLECTION", label: { zh: "回款跟进", en: "Collection" } },
  { key: "OTHER", label: { zh: "其他", en: "Other" } },
] as const;
export type CategoryKey = (typeof CATEGORIES)[number]["key"];

const CATEGORY_BY_DOC: Record<string, CategoryKey> = {
  planning: "REQUIREMENT",
  handover: "REQUIREMENT",
  sample: "SAMPLE",
  sampleShipment: "SAMPLE",
  testRequest: "SAMPLE",
  testReport: "SAMPLE",
  quote: "QUOTE",
  purchase: "MATERIAL",
  packagingPlan: "MATERIAL",
  carton: "MATERIAL",
  ledgerTask: "PRODUCTION",
  inspection: "QUALITY",
  factoryAudit: "QUALITY",
  shipment: "SHIPPING",
  booking: "SHIPPING",
  receivable: "COLLECTION",
};
const PO_REVIEW_ACTIONS = new Set(["order.review", "order.customerConfirm", "order.factoryReply"]);

export function categoryOf(todo: Pick<TodoRow, "docType" | "action">): CategoryKey {
  if (todo.docType === "order") return PO_REVIEW_ACTIONS.has(todo.action) ? "PO_REVIEW" : "PRODUCTION";
  return (todo.docType && CATEGORY_BY_DOC[todo.docType]) || "OTHER";
}

export type TaskBucket = { due: number; done: number; onTime: number; overdueOpen: number; completed: number; cycleDays: number; rework: number };
export type TaskStats = TaskBucket & { avgCycleDays: number | null; byCategory: Record<CategoryKey, TaskBucket> };

const emptyBucket = (): TaskBucket => ({ due: 0, done: 0, onTime: 0, overdueOpen: 0, completed: 0, cycleDays: 0, rework: 0 });

export function isRework(todo: TodoRow, history: TodoRow[]): boolean {
  if (REWORK_ACTIONS.has(todo.action)) return true;
  if (!todo.docType || !todo.docId) return false;
  return history.some((h) => h.id !== todo.id && h.docType === todo.docType && h.docId === todo.docId && h.action === todo.action && h.createdAt < todo.createdAt);
}

export function taskStats(list: TodoRow[], start: string, end: string, now: Date, history: TodoRow[] = list): TaskStats {
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${addDays(end, 1)}T00:00:00Z`);
  const total = emptyBucket();
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c.key, emptyBucket()])) as Record<CategoryKey, TaskBucket>;
  for (const t of list) {
    const buckets = [total, byCategory[categoryOf(t)]];
    const due = t.dueAt ? t.dueAt.getTime() : null;
    if (due !== null && due >= from && due < to) {
      for (const b of buckets) {
        b.due += 1;
        if (t.status === "DONE") {
          b.done += 1;
          if (t.doneAt && t.doneAt.getTime() <= due) b.onTime += 1;
        } else if (due < now.getTime()) b.overdueOpen += 1;
      }
    }
    if (t.status === "DONE" && t.doneAt && t.doneAt.getTime() >= from && t.doneAt.getTime() < to) {
      const days = (t.doneAt.getTime() - t.createdAt.getTime()) / DAY;
      const rework = isRework(t, history);
      for (const b of buckets) {
        b.completed += 1;
        b.cycleDays += days;
        if (rework) b.rework += 1;
      }
    }
  }
  return { ...total, avgCycleDays: total.completed ? round1(total.cycleDays / total.completed) : null, byCategory };
}

export function unitPrice(order: OrderRow): number {
  return order.totalPairs > 0 ? order.fobAmount / order.totalPairs : 0;
}

export function orderCny(data: MetricsData, order: OrderRow): number {
  return data.toCny(order.fobAmount, order.currency);
}

export function redOrders(data: MetricsData): Set<string> {
  const set = new Set<string>();
  for (const h of data.hits) {
    if (h.light !== "RED") continue;
    if (h.orderId) set.add(h.orderId);
    if (h.targetType === "order") set.add(h.targetId);
  }
  return set;
}

export function riskOrders(data: MetricsData, filter: RowFilter = ALL_ROWS): { orders: OrderRow[]; cny: number; blocked: number; red: number } {
  const red = redOrders(data);
  const orders = data.orders.filter((o) => ACTIVE_ORDER.has(o.status) && filter(o) && (data.blocked.has(o.id) || red.has(o.id)));
  return { orders, cny: orders.reduce((s, o) => s + orderCny(data, o), 0), blocked: orders.filter((o) => data.blocked.has(o.id)).length, red: orders.filter((o) => red.has(o.id)).length };
}

export function overdueAr(data: MetricsData, today: string, filter: RowFilter = ALL_ROWS): { cny: number; count: number; aged30Cny: number; aged30Count: number; byCustomer: Map<string, number> } {
  let cny = 0;
  let count = 0;
  let aged30Cny = 0;
  let aged30Count = 0;
  const byCustomer = new Map<string, number>();
  for (const r of data.receivables) {
    if (!filter(r) || !AR_OPEN.has(r.status) || r.amount <= 0 || r.dueDate >= today) continue;
    const outstanding = data.toCny(r.amount - r.receivedAmount, r.currency);
    if (outstanding <= 0.005) continue;
    cny += outstanding;
    count += 1;
    byCustomer.set(r.customerId, (byCustomer.get(r.customerId) ?? 0) + outstanding);
    if (daysBetween(r.dueDate, today) > 30) {
      aged30Cny += outstanding;
      aged30Count += 1;
    }
  }
  return { cny, count, aged30Cny, aged30Count, byCustomer };
}

export function confirmedOrders(data: MetricsData, start: string, end: string, filter: RowFilter = ALL_ROWS): { orders: OrderRow[]; cny: number } {
  const orders = data.orders.filter((o) => o.status !== "CANCELLED" && inRange(o.confirmedAt, start, end) && filter(o));
  return { orders, cny: orders.reduce((s, o) => s + orderCny(data, o), 0) };
}

export function delivered(data: MetricsData, start: string, end: string, filter: RowFilter = ALL_ROWS): { cny: number; pairs: number; margin: number | null } {
  const byId = new Map(data.orders.map((o) => [o.id, o]));
  let cny = 0;
  let pairs = 0;
  let weighted = 0;
  let weight = 0;
  for (const s of data.shipments) {
    if (!inRange(s.sailedAt, start, end) || !filter(s)) continue;
    const order = byId.get(s.orderId);
    if (!order) continue;
    const amount = data.toCny(s.pairs * unitPrice(order), order.currency);
    cny += amount;
    pairs += s.pairs;
    const margin = data.margins.get(s.styleId ?? order.styleIds[0] ?? "");
    if (margin !== undefined) {
      weighted += margin * amount;
      weight += amount;
    }
  }
  return { cny, pairs, margin: weight > 0 ? round1((weighted / weight) * 100) : null };
}

export function receivedCny(data: MetricsData, start: string, end: string, filter: RowFilter = ALL_ROWS): number {
  return data.receipts.filter((r) => inRange(r.receivedAt, start, end) && filter(r)).reduce((s, r) => s + data.toCny(r.amount, r.currency), 0);
}

export function onTimeDelivery(data: MetricsData, start: string, end: string, today: string, filter: RowFilter = ALL_ROWS): { on: number; due: number; late: OrderRow[] } {
  const upper = end < today ? end : today;
  const due = data.orders.filter((o) => o.status !== "CANCELLED" && inRange(o.customerDueDate, start, upper) && filter(o));
  const late: OrderRow[] = [];
  let on = 0;
  for (const o of due) {
    const mine = data.shipments.filter((s) => s.orderId === o.id && s.sailedAt);
    const pairs = mine.reduce((s, x) => s + x.pairs, 0);
    const last = mine.reduce<string | null>((m, x) => (!m || x.sailedAt! > m ? x.sailedAt : m), null);
    if (last && last <= o.customerDueDate && pairs >= o.totalPairs * SHIP_TOLERANCE) on += 1;
    else late.push(o);
  }
  return { on, due: due.length, late };
}

export function bookingTimely(data: MetricsData, start: string, end: string, today: string, filter: RowFilter = ALL_ROWS): { timely: number; due: number } {
  let timely = 0;
  let due = 0;
  for (const b of data.bookings) {
    if (b.status === "CANCELLED" || !b.etd || !inRange(b.etd, start, end) || !filter(b)) continue;
    const deadline = addDays(b.etd, -BOOKING_LEAD_DAYS);
    if (!b.confirmedAt && deadline >= today) continue;
    due += 1;
    if (b.confirmedAt && b.confirmedAt <= deadline) timely += 1;
  }
  return { timely, due };
}

export function firstPass(data: MetricsData, start: string, end: string, filter: RowFilter = ALL_ROWS): { pass: number; total: number } {
  let pass = 0;
  let total = 0;
  for (const i of data.inspections) {
    if (i.stage !== "FRI" || !filter(i)) continue;
    const first = i.rounds[0];
    const date = first ? first.actualDate : i.actualDate;
    const result = first ? first.result : i.result;
    if (!result || !inRange(date, start, end)) continue;
    total += 1;
    if (result === "PASS") pass += 1;
  }
  return { pass, total };
}

export function materialReady(data: MetricsData, start: string, end: string, today: string, filter: RowFilter = ALL_ROWS): { ready: number; due: number } {
  let ready = 0;
  let due = 0;
  for (const p of data.purchases) {
    if (p.status === "CANCELLED" || !p.promisedDate || !inRange(p.promisedDate, start, end) || !filter(p)) continue;
    if (p.status !== "RECEIVED" && p.promisedDate >= today) continue;
    due += 1;
    if (p.status === "RECEIVED" && p.receivedAt && p.receivedAt <= p.promisedDate) ready += 1;
  }
  return { ready, due };
}

export function dueDateChange(data: MetricsData, start: string, end: string, filter: RowFilter = ALL_ROWS): { changed: number; confirmed: number } {
  const { orders } = confirmedOrders(data, start, end, filter);
  const changed = orders.filter((o) => {
    const replies = data.replies.get(o.id) ?? [];
    if (replies.length > 1 || replies.some((r) => r.delayDays > 0)) return true;
    return (data.revisionDueDates.get(o.id) ?? []).some((d) => d !== o.customerDueDate);
  });
  return { changed: changed.length, confirmed: orders.length };
}

export function qualityIssues(data: MetricsData, filter: RowFilter = ALL_ROWS): number {
  const inspections = data.inspections.filter((i) => i.result === "FAIL" && i.status !== "RELEASED" && i.status !== "CANCELLED" && filter(i)).length;
  const retestPassed = new Set(data.tests.filter((t) => t.retestOfId && t.result === "PASS").map((t) => t.retestOfId!));
  const tests = data.tests.filter((t) => t.result === "FAIL" && !retestPassed.has(t.id) && filter(t)).length;
  return inspections + tests;
}

export function deptCustomers(data: MetricsData): string[] {
  const set = new Set<string>(data.styleCustomers);
  for (const o of data.orders) if (o.status !== "CANCELLED") set.add(o.customerId);
  for (const r of data.receivables) if (AR_OPEN.has(r.status)) set.add(r.customerId);
  return [...set];
}

export type HealthLevel = "HIGH_RISK" | "WATCH" | "STABLE";
export type HealthRow = {
  customerId: string;
  name: string;
  level: HealthLevel;
  activeOrders: number;
  overdueOrders: number;
  riskOrders: number;
  riskCny: number;
  qualityIssues: number;
  overdueArCny: number;
  nearDueRisk: number;
  awaitingFeedback: number;
  openRed: number;
  openYellow: number;
  reasons: string[];
};

export function customerHealth(data: MetricsData, today: string): HealthRow[] {
  const risk = new Set(riskOrders(data).orders.map((o) => o.id));
  const ar = overdueAr(data, today);
  const horizon = addDays(today, WATCH_DUE_DAYS);
  return deptCustomers(data)
    .map((customerId) => {
      const mine = (row: { customerId: string | null }) => row.customerId === customerId;
      const active = data.orders.filter((o) => mine(o) && ACTIVE_ORDER.has(o.status));
      const overdueOrders = active.filter((o) => o.customerDueDate < today).length;
      const riskList = active.filter((o) => risk.has(o.id));
      const quality = qualityIssues(data, mine);
      const overdueArCny = ar.byCustomer.get(customerId) ?? 0;
      const nearDueRisk = riskList.filter((o) => o.customerDueDate >= today && o.customerDueDate <= horizon).length;
      const hits = data.hits.filter(mine);
      const awaitingFeedback = hits.filter((h) => FEEDBACK_RULES.has(h.ruleType)).length;
      const reasons: string[] = [];
      if (overdueOrders >= HIGH_RISK.overdueOrders) reasons.push(`逾期订单 ${overdueOrders} 张`);
      if (quality >= HIGH_RISK.qualityIssues) reasons.push(`未关闭质量问题 ${quality} 个`);
      if (overdueArCny >= HIGH_RISK.overdueArCny) reasons.push(`逾期应收 ${wan(overdueArCny)} 万元`);
      const high = reasons.length > 0;
      if (!high) {
        if (nearDueRisk > 0) reasons.push(`${WATCH_DUE_DAYS} 天内到期的风险订单 ${nearDueRisk} 张`);
        if (awaitingFeedback > 0) reasons.push(`待客户反馈超期 ${awaitingFeedback} 项`);
      }
      const level: HealthLevel = high ? "HIGH_RISK" : reasons.length ? "WATCH" : "STABLE";
      return {
        customerId,
        name: data.customerNames.get(customerId) ?? customerId,
        level,
        activeOrders: active.length,
        overdueOrders,
        riskOrders: riskList.length,
        riskCny: riskList.reduce((s, o) => s + orderCny(data, o), 0),
        qualityIssues: quality,
        overdueArCny,
        nearDueRisk,
        awaitingFeedback,
        openRed: hits.filter((h) => h.light === "RED").length,
        openYellow: hits.filter((h) => h.light === "YELLOW").length,
        reasons,
      };
    })
    .sort((a, b) => levelRank(a.level) - levelRank(b.level) || b.overdueArCny - a.overdueArCny || a.name.localeCompare(b.name));
}

function levelRank(level: HealthLevel): number {
  return level === "HIGH_RISK" ? 0 : level === "WATCH" ? 1 : 2;
}

export type CoreMetrics = {
  confirmedCny: number;
  confirmedCount: number;
  deliveredCny: number;
  margin: number | null;
  receivedCny: number;
  overdueCny: number;
  aged30Cny: number;
  riskCny: number;
  riskCount: number;
  onTime: { on: number; due: number };
  booking: { timely: number; due: number };
  firstPass: { pass: number; total: number };
  material: { ready: number; due: number };
  fulfillment: number | null;
  activeOrders: number;
};

export function coreMetrics(data: MetricsData, start: string, end: string, today: string, filter: RowFilter = ALL_ROWS): CoreMetrics {
  const conf = confirmedOrders(data, start, end, filter);
  const del = delivered(data, start, end, filter);
  const ar = overdueAr(data, today, filter);
  const risk = riskOrders(data, filter);
  const onTime = onTimeDelivery(data, start, end, today, filter);
  const booking = bookingTimely(data, start, end, today, filter);
  const fp = firstPass(data, start, end, filter);
  const material = materialReady(data, start, end, today, filter);
  const parts = [pct(booking.timely, booking.due), pct(fp.pass, fp.total), pct(material.ready, material.due), pct(onTime.on, onTime.due)].filter((x): x is number => x !== null);
  return {
    confirmedCny: conf.cny,
    confirmedCount: conf.orders.length,
    deliveredCny: del.cny,
    margin: del.margin,
    receivedCny: receivedCny(data, start, end, filter),
    overdueCny: ar.cny,
    aged30Cny: ar.aged30Cny,
    riskCny: risk.cny,
    riskCount: risk.orders.length,
    onTime: { on: onTime.on, due: onTime.due },
    booking,
    firstPass: fp,
    material,
    fulfillment: parts.length ? round1(parts.reduce((s, x) => s + x, 0) / parts.length) : null,
    activeOrders: data.orders.filter((o) => ACTIVE_ORDER.has(o.status) && filter(o)).length,
  };
}

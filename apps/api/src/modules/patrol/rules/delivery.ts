import { bookings, customerOrders, customers, factoryReplies, inspections, ledgerTasks, orderLines, orderStageLogs, packagingPlans, purchaseOrders, shipmentEvents, shipments, testReportLinks, testReports } from "@otd/db";
import { and, eq, inArray, isNotNull, isNull, min, ne, notExists, or, sql } from "drizzle-orm";
import { type Bilingual, addDays, base, compact, customerIn, daysBetween, deadlineLight, defineRule, dwellLight, elapsedDays, judged, shortDate, todayOf } from "./types.js";

type DwellFacts = { since: Date };

function orderName(customerName: string | null, pairs: number): string {
  return `${customerName ?? ""} · ${pairs.toLocaleString("en-US")} 双`;
}

export const poReviewOverdue = defineRule<DwellFacts>({
  ruleType: "PO_REVIEW_OVERDUE",
  targetType: "order",
  kind: "DWELL",
  condition: (p) => ({ zh: `停留「待确认」> ${p.thresholdDays} 天`, en: `In "Pending confirm" > ${p.thresholdDays} days` }),
  findCandidates: async (db, _params, _now, scope) => {
    const rows = await db
      .select({ o: customerOrders, customerName: customers.name })
      .from(customerOrders)
      .leftJoin(customers, eq(customers.id, customerOrders.customerId))
      .where(and(eq(customerOrders.status, "PENDING_CONFIRM"), customerIn(customerOrders.customerId, scope)));
    if (!rows.length) return [];
    const entered = await db
      .select({ orderId: orderStageLogs.orderId, at: min(orderStageLogs.at) })
      .from(orderStageLogs)
      .where(and(inArray(orderStageLogs.orderId, rows.map((r) => r.o.id)), eq(orderStageLogs.status, "PENDING_CONFIRM")))
      .groupBy(orderStageLogs.orderId);
    const since = new Map(entered.map((e) => [e.orderId, e.at]));
    return rows.map(({ o, customerName }) => ({
      ...base({
        targetId: o.id,
        targetNo: o.poNo,
        targetName: orderName(customerName, o.totalPairs),
        docType: "order",
        docId: o.id,
        link: `/orders/${o.id}`,
        customerId: o.customerId,
        ownerId: o.ownerId,
        orgId: o.orgId,
        orderId: o.id,
      }),
      facts: { since: since.get(o.id) ?? o.createdAt },
    }));
  },
  judge: (c, p, now) => {
    const days = elapsedDays(c.facts.since, now);
    const hit = dwellLight(days, p.thresholdDays, p.yellowWindowDays);
    return hit ? judged(c, p, hit, { zh: `PO 待复核已 ${days} 天（阈值 ${p.thresholdDays} 天）`, en: `PO awaiting review for ${days} days (threshold ${p.thresholdDays} days)` }) : null;
  },
});

export const factoryReplyMissing = defineRule<DwellFacts>({
  ruleType: "FACTORY_REPLY_MISSING",
  targetType: "order",
  kind: "DWELL",
  condition: (p) => ({ zh: `订单确认 > ${p.thresholdDays} 天仍无工厂交期回复`, en: `No factory reply ${p.thresholdDays} days after confirmation` }),
  findCandidates: async (db, _params, _now, scope) => {
    const rows = await db
      .select({ o: customerOrders, customerName: customers.name })
      .from(customerOrders)
      .leftJoin(customers, eq(customers.id, customerOrders.customerId))
      .where(
        and(
          inArray(customerOrders.status, ["TO_SCHEDULE", "IN_PRODUCTION"]),
          isNotNull(customerOrders.confirmedAt),
          customerIn(customerOrders.customerId, scope),
          notExists(db.select({ one: sql`1` }).from(factoryReplies).where(eq(factoryReplies.orderId, customerOrders.id))),
        ),
      );
    return rows.map(({ o, customerName }) => ({
      ...base({
        targetId: o.id,
        targetNo: o.poNo,
        targetName: orderName(customerName, o.totalPairs),
        docType: "order",
        docId: o.id,
        link: `/orders/${o.id}`,
        customerId: o.customerId,
        ownerId: o.ownerId,
        orgId: o.orgId,
        orderId: o.id,
        responsibleIds: compact([o.merchandiserId]),
      }),
      facts: { since: o.confirmedAt! },
    }));
  },
  judge: (c, p, now) => {
    const days = elapsedDays(c.facts.since, now);
    const hit = dwellLight(days, p.thresholdDays, p.yellowWindowDays);
    return hit ? judged(c, p, hit, { zh: `订单确认后 ${days} 天仍无工厂交期回复（阈值 ${p.thresholdDays} 天）`, en: `No factory reply ${days} days after confirmation (threshold ${p.thresholdDays} days)` }) : null;
  },
});

type PurchaseFacts = { promisedDate: string };

export const purchaseOverdue = defineRule<PurchaseFacts>({
  ruleType: "PURCHASE_OVERDUE",
  targetType: "purchase",
  kind: "DEADLINE",
  condition: (p) => ({ zh: `超过承诺交期 ${p.thresholdDays} 天仍未全部到货`, en: `Not fully received ${p.thresholdDays} days after the promised date` }),
  findCandidates: async (db, _params, _now, scope) => {
    const rows = await db
      .select()
      .from(purchaseOrders)
      .where(and(inArray(purchaseOrders.status, ["ORDERED", "PARTIAL"]), isNotNull(purchaseOrders.promisedDate), customerIn(purchaseOrders.customerId, scope)));
    return rows.map((r) => ({
      ...base({
        targetId: r.id,
        targetNo: r.docNo,
        targetName: r.supplier,
        docType: "purchase",
        docId: r.id,
        link: `/purchases/${r.id}`,
        customerId: r.customerId,
        ownerId: r.ownerId,
        orgId: r.orgId,
        orderId: r.orderId,
        responsibleIds: compact([r.ownerId]),
      }),
      facts: { promisedDate: r.promisedDate! },
    }));
  },
  judge: (c, p, now) => {
    const hit = deadlineLight(todayOf(now), addDays(c.facts.promisedDate, p.thresholdDays), p.yellowWindowDays);
    if (!hit) return null;
    const message =
      hit.light === "RED"
        ? { zh: `承诺交期 ${c.facts.promisedDate} 已过 ${hit.overdueDays} 天`, en: `Promised date ${c.facts.promisedDate} passed ${hit.overdueDays} days ago` }
        : { zh: `承诺交期 ${c.facts.promisedDate}，剩余 ${-hit.overdueDays} 天仍未到齐`, en: `Promised date ${c.facts.promisedDate}, ${-hit.overdueDays} days left, not fully received` };
    return judged(c, p, hit, message);
  },
});

type PackingFacts = { inspectionDate: string };

export const packingUnconfirmedNearInspection = defineRule<PackingFacts>({
  ruleType: "PACKING_UNCONFIRMED_NEAR_INSPECTION",
  targetType: "packagingPlan",
  kind: "DEADLINE",
  condition: (p) => ({ zh: `终验计划日前 ${p.thresholdDays} 天包装方案仍未确认`, en: `Packing plan unconfirmed ${p.thresholdDays} days before the final inspection` }),
  findCandidates: async (db, _params, _now, scope) => {
    const plans = await db
      .select()
      .from(packagingPlans)
      .where(and(isNotNull(packagingPlans.orderId), isNull(packagingPlans.effectiveVersion), ne(packagingPlans.status, "CONFIRMED"), customerIn(packagingPlans.customerId, scope)));
    const orderIds = compact(plans.map((p) => p.orderId));
    if (!orderIds.length) return [];
    const fri = await db
      .select({ orderId: inspections.orderId, date: min(inspections.plannedDate) })
      .from(inspections)
      .where(and(inArray(inspections.orderId, orderIds), eq(inspections.stage, "FRI"), inArray(inspections.status, ["TO_SCHEDULE", "SCHEDULED"]), isNotNull(inspections.plannedDate)))
      .groupBy(inspections.orderId);
    const dates = new Map(fri.filter((f) => f.date).map((f) => [f.orderId, f.date!]));
    return plans
      .filter((p) => dates.has(p.orderId!))
      .map((p) => ({
        ...base({
          targetId: p.id,
          targetNo: `${p.docNo} v${p.currentVersion}`,
          targetName: p.title,
          docType: "packagingPlan",
          docId: p.id,
          link: `/packaging/${p.id}`,
          customerId: p.customerId,
          ownerId: p.ownerId,
          orgId: p.orgId,
          orderId: p.orderId,
        }),
        facts: { inspectionDate: dates.get(p.orderId!)! },
      }));
  },
  judge: (c, p, now) => {
    const deadline = addDays(c.facts.inspectionDate, -p.thresholdDays);
    const hit = deadlineLight(todayOf(now), deadline, p.yellowWindowDays);
    if (!hit) return null;
    const message =
      hit.light === "RED"
        ? { zh: `终验计划 ${c.facts.inspectionDate}，包装方案须提前 ${p.thresholdDays} 天确认，已超 ${hit.overdueDays} 天仍未确认`, en: `Final inspection on ${c.facts.inspectionDate}; packing plan should be confirmed ${p.thresholdDays} days ahead, ${hit.overdueDays} days late` }
        : { zh: `终验计划 ${c.facts.inspectionDate}，包装方案未确认，距确认截止剩 ${-hit.overdueDays} 天`, en: `Final inspection on ${c.facts.inspectionDate}; packing plan unconfirmed, ${-hit.overdueDays} days to the deadline` };
    return judged(c, p, hit, message, 0);
  },
});

type PreconditionFacts = { plannedDate: string; missing: Bilingual[] };

const MISSING_MATERIALS: Bilingual = { zh: "物料到齐", en: "materials received" };
const MISSING_REPORT: Bilingual = { zh: "有效测试报告", en: "valid test report" };
const MISSING_PACKING: Bilingual = { zh: "包装方案确认", en: "packing plan confirmation" };

export const inspectionPreconditionMissing = defineRule<PreconditionFacts>({
  ruleType: "INSPECTION_PRECONDITION_MISSING",
  targetType: "inspection",
  kind: "MISSING",
  condition: (p) => ({ zh: `排期日前 ${p.thresholdDays} 天前置条件仍不齐`, en: `Preconditions incomplete ${p.thresholdDays} days before the inspection` }),
  findCandidates: async (db, _params, _now, scope) => {
    const rows = await db
      .select({ i: inspections, o: customerOrders })
      .from(inspections)
      .innerJoin(customerOrders, eq(customerOrders.id, inspections.orderId))
      .where(and(inArray(inspections.status, ["TO_SCHEDULE", "SCHEDULED"]), isNotNull(inspections.plannedDate), customerIn(inspections.customerId, scope)));
    if (!rows.length) return [];
    const orderIds = compact(rows.map((r) => r.o.id));
    const openPurchases = new Set(
      (await db.select({ orderId: purchaseOrders.orderId }).from(purchaseOrders).where(and(inArray(purchaseOrders.orderId, orderIds), inArray(purchaseOrders.status, ["ORDERED", "PARTIAL"])))).map((r) => r.orderId),
    );
    const lines = await db.select({ orderId: orderLines.orderId, styleId: orderLines.styleId }).from(orderLines).where(inArray(orderLines.orderId, orderIds));
    const styleIds = compact([...lines.map((l) => l.styleId), ...rows.map((r) => r.i.styleId)]);
    const links = styleIds.length ? await db.select().from(testReportLinks).where(inArray(testReportLinks.styleId, styleIds)) : [];
    const reportCond = links.length ? or(inArray(testReports.styleId, styleIds), inArray(testReports.id, links.map((l) => l.reportId))) : inArray(testReports.styleId, styleIds);
    const reports = styleIds.length ? await db.select({ id: testReports.id, styleId: testReports.styleId, validUntil: testReports.validUntil }).from(testReports).where(and(eq(testReports.result, "PASS"), reportCond)) : [];
    const confirmedPlans = new Set(
      (await db.select({ orderId: packagingPlans.orderId }).from(packagingPlans).where(and(inArray(packagingPlans.orderId, orderIds), or(isNotNull(packagingPlans.effectiveVersion), eq(packagingPlans.status, "CONFIRMED"))))).map((r) => r.orderId),
    );
    const out = [];
    for (const { i, o } of rows) {
      const missing: Bilingual[] = [];
      if (openPurchases.has(o.id)) missing.push(MISSING_MATERIALS);
      if (i.stage === "FRI") {
        const g2 = await scope.g2Conditions(o.customerId, o.flowVersionId);
        const styles = i.styleId ? [i.styleId] : compact(lines.filter((l) => l.orderId === o.id).map((l) => l.styleId));
        const covered = (styleId: string) => reports.some((r) => r.validUntil >= i.plannedDate! && (r.styleId === styleId || links.some((l) => l.reportId === r.id && l.styleId === styleId)));
        if (g2.includes("reportsValid") && styles.some((s) => !covered(s))) missing.push(MISSING_REPORT);
        if (g2.includes("packingReady") && !confirmedPlans.has(o.id)) missing.push(MISSING_PACKING);
      }
      if (!missing.length) continue;
      out.push({
        ...base({
          targetId: i.id,
          targetNo: i.docNo,
          targetName: `${o.poNo} · ${i.stage}`,
          docType: "inspection",
          docId: i.id,
          link: `/inspections/${i.id}`,
          customerId: i.customerId,
          ownerId: i.ownerId,
          orgId: i.orgId,
          orderId: o.id,
        }),
        facts: { plannedDate: i.plannedDate!, missing },
      });
    }
    return out;
  },
  judge: (c, p, now) => {
    if (!c.facts.missing.length) return null;
    const hit = deadlineLight(todayOf(now), addDays(c.facts.plannedDate, -p.thresholdDays), p.yellowWindowDays);
    if (!hit) return null;
    return judged(c, p, hit, {
      zh: `验货前置条件缺${c.facts.missing.map((m) => m.zh).join("、")}，排期日 ${shortDate(c.facts.plannedDate)}`,
      en: `Inspection preconditions missing: ${c.facts.missing.map((m) => m.en).join(", ")}; scheduled ${shortDate(c.facts.plannedDate)}`,
    }, 0);
  },
});

type FailedFacts = { actualDate: string; roundNo: number };

export const friFailedNoRework = defineRule<FailedFacts>({
  ruleType: "FRI_FAILED_NO_REWORK",
  targetType: "inspection",
  kind: "DWELL",
  condition: (p) => ({ zh: `尾验不合格 > ${p.thresholdDays} 天未安排复验`, en: `Failed FRI not re-inspected within ${p.thresholdDays} days` }),
  findCandidates: async (db, _params, _now, scope) => {
    const rows = await db
      .select({ i: inspections, poNo: customerOrders.poNo })
      .from(inspections)
      .innerJoin(customerOrders, eq(customerOrders.id, inspections.orderId))
      .where(and(eq(inspections.stage, "FRI"), eq(inspections.status, "INSPECTED"), eq(inspections.result, "FAIL"), isNotNull(inspections.actualDate), customerIn(inspections.customerId, scope)));
    return rows.map(({ i, poNo }) => ({
      ...base({
        targetId: i.id,
        targetNo: i.docNo,
        targetName: `${poNo} · FRI`,
        docType: "inspection",
        docId: i.id,
        link: `/inspections/${i.id}`,
        customerId: i.customerId,
        ownerId: i.ownerId,
        orgId: i.orgId,
        orderId: i.orderId,
      }),
      facts: { actualDate: i.actualDate!, roundNo: i.roundNo },
    }));
  },
  judge: (c, p, now) => {
    const days = Math.max(0, daysBetween(c.facts.actualDate, todayOf(now)));
    const hit = dwellLight(days, p.thresholdDays, p.yellowWindowDays);
    return hit
      ? judged(c, p, hit, { zh: `尾验第 ${c.facts.roundNo} 轮不合格已 ${days} 天未安排复验（阈值 ${p.thresholdDays} 天）`, en: `FRI round ${c.facts.roundNo} failed ${days} days ago with no re-inspection (threshold ${p.thresholdDays} days)` })
      : null;
  },
});

type LateFacts = { plannedDate: string | null; exFactory: string };

export const inspectionLateSchedule = defineRule<LateFacts>({
  ruleType: "INSPECTION_LATE_SCHEDULE",
  targetType: "inspection",
  kind: "DEADLINE",
  condition: (p) => ({ zh: `终验须在工厂交期前 ${p.thresholdDays} 天完成`, en: `Final inspection due ${p.thresholdDays} days before ex-factory` }),
  findCandidates: async (db, _params, _now, scope) => {
    const rows = await db
      .select({ i: inspections, poNo: customerOrders.poNo })
      .from(inspections)
      .innerJoin(customerOrders, eq(customerOrders.id, inspections.orderId))
      .where(and(eq(inspections.stage, "FRI"), inArray(inspections.status, ["TO_SCHEDULE", "SCHEDULED"]), isNotNull(inspections.plannedExFactory), customerIn(inspections.customerId, scope)));
    return rows.map(({ i, poNo }) => ({
      ...base({
        targetId: i.id,
        targetNo: i.docNo,
        targetName: `${poNo} · FRI`,
        docType: "inspection",
        docId: i.id,
        link: `/inspections/${i.id}`,
        customerId: i.customerId,
        ownerId: i.ownerId,
        orgId: i.orgId,
        orderId: i.orderId,
      }),
      facts: { plannedDate: i.plannedDate, exFactory: i.plannedExFactory! },
    }));
  },
  judge: (c, p, now) => {
    const latest = addDays(c.facts.exFactory, -p.thresholdDays);
    if (c.facts.plannedDate) {
      if (c.facts.plannedDate <= latest) return null;
      const late = daysBetween(latest, c.facts.plannedDate);
      return judged(c, p, { light: "RED", overdueDays: late }, {
        zh: `终验排期 ${c.facts.plannedDate} 晚于工厂交期 ${c.facts.exFactory} 前 ${p.thresholdDays} 天（最晚 ${latest}）`,
        en: `Final inspection on ${c.facts.plannedDate} is later than ${p.thresholdDays} days before ex-factory ${c.facts.exFactory} (latest ${latest})`,
      }, 0);
    }
    const hit = deadlineLight(todayOf(now), latest, p.yellowWindowDays);
    if (!hit) return null;
    const message =
      hit.light === "RED"
        ? { zh: `终验尚未排期，最晚应在 ${latest} 前完成（工厂交期 ${c.facts.exFactory}），已过 ${hit.overdueDays} 天`, en: `Final inspection not scheduled; it was due by ${latest} (ex-factory ${c.facts.exFactory}), ${hit.overdueDays} days late` }
        : { zh: `终验尚未排期，距最晚终验日 ${latest} 剩 ${-hit.overdueDays} 天`, en: `Final inspection not scheduled; ${-hit.overdueDays} days left to ${latest}` };
    return judged(c, p, hit, message, 0);
  },
});

type EtdFacts = { etd: string };

export const etdPassedNotSailed = defineRule<EtdFacts>({
  ruleType: "ETD_PASSED_NOT_SAILED",
  targetType: "shipment",
  kind: "DEADLINE",
  condition: (p) => ({ zh: `计划 ETD 过后 ${p.thresholdDays} 天仍未开船`, en: `Not sailed ${p.thresholdDays} days after ETD` }),
  findCandidates: async (db, _params, _now, scope) => {
    const rows = await db
      .select({ s: shipments, bookingNo: bookings.docNo })
      .from(shipments)
      .leftJoin(bookings, eq(bookings.id, shipments.bookingId))
      .where(and(inArray(shipments.status, ["BOOKED", "PACKED"]), isNotNull(shipments.etd), customerIn(shipments.customerId, scope)));
    return rows.map(({ s, bookingNo }) => ({
      ...base({
        targetId: s.id,
        targetNo: s.docNo,
        targetName: bookingNo ? `订舱 ${bookingNo}` : s.carrierText,
        docType: "shipment",
        docId: s.id,
        link: `/shipments/${s.id}`,
        customerId: s.customerId,
        ownerId: s.ownerId,
        orgId: s.orgId,
        orderId: s.orderId,
      }),
      facts: { etd: s.etd! },
    }));
  },
  judge: (c, p, now) => {
    const hit = deadlineLight(todayOf(now), addDays(c.facts.etd, p.thresholdDays), p.yellowWindowDays);
    if (!hit) return null;
    const message =
      hit.light === "RED"
        ? { zh: `订舱船期 ${c.facts.etd} 已过 ${hit.overdueDays} 天仍未开船`, en: `ETD ${c.facts.etd} passed ${hit.overdueDays} days ago, not sailed` }
        : { zh: `船期 ${c.facts.etd}，剩余 ${-hit.overdueDays} 天尚未开船`, en: `ETD ${c.facts.etd}, ${-hit.overdueDays} days left, not sailed` };
    return judged(c, p, hit, message);
  },
});

export const arrivedNotSigned = defineRule<DwellFacts>({
  ruleType: "ARRIVED_NOT_SIGNED",
  targetType: "shipment",
  kind: "DWELL",
  condition: (p) => ({ zh: `停留「已到港」> ${p.thresholdDays} 天`, en: `In "Arrived" > ${p.thresholdDays} days` }),
  findCandidates: async (db, _params, _now, scope) => {
    const rows = await db.select().from(shipments).where(and(eq(shipments.status, "ARRIVED"), customerIn(shipments.customerId, scope)));
    if (!rows.length) return [];
    const events = await db
      .select({ shipmentId: shipmentEvents.shipmentId, at: shipmentEvents.actualAt })
      .from(shipmentEvents)
      .where(and(inArray(shipmentEvents.shipmentId, rows.map((r) => r.id)), eq(shipmentEvents.status, "ARRIVED"), isNotNull(shipmentEvents.actualAt)));
    const arrived = new Map(events.map((e) => [e.shipmentId, e.at!]));
    return rows
      .map((s) => ({ s, since: arrived.get(s.id) ?? (s.eta ? new Date(`${s.eta}T00:00:00Z`) : null) }))
      .filter((x): x is { s: typeof x.s; since: Date } => !!x.since)
      .map(({ s, since }) => ({
        ...base({
          targetId: s.id,
          targetNo: s.docNo,
          targetName: s.destination,
          docType: "shipment",
          docId: s.id,
          link: `/shipments/${s.id}`,
          customerId: s.customerId,
          ownerId: s.ownerId,
          orgId: s.orgId,
          orderId: s.orderId,
        }),
        facts: { since },
      }));
  },
  judge: (c, p, now) => {
    const days = elapsedDays(c.facts.since, now);
    const hit = dwellLight(days, p.thresholdDays, p.yellowWindowDays);
    return hit ? judged(c, p, hit, { zh: `已到港 ${days} 天未签收（阈值 ${p.thresholdDays} 天）`, en: `Arrived ${days} days ago, not signed (threshold ${p.thresholdDays} days)` }) : null;
  },
});

type LedgerFacts = { nextDueAt: string; name: string };

export const ledgerOverdue = defineRule<LedgerFacts>({
  ruleType: "LEDGER_OVERDUE",
  targetType: "ledgerTask",
  kind: "DEADLINE",
  condition: (p) => ({ zh: `超过应更新日 ${p.thresholdDays} 天仍未更新`, en: `Not updated ${p.thresholdDays} days after the due date` }),
  findCandidates: async (db, _params, _now, scope) => {
    if (scope.customerIds) return [];
    const rows = await db.select().from(ledgerTasks).where(and(ne(ledgerTasks.status, "DONE"), isNotNull(ledgerTasks.nextDueAt)));
    return rows.map((t) => ({
      ...base({
        targetId: t.id,
        targetNo: t.currentVersion,
        targetName: t.name,
        docType: "ledgerTask",
        docId: t.id,
        link: "/capacity/tasks",
        ownerId: t.ownerId,
        responsibleIds: compact([t.ownerId]),
      }),
      facts: { nextDueAt: t.nextDueAt!, name: t.name },
    }));
  },
  judge: (c, p, now) => {
    const hit = deadlineLight(todayOf(now), addDays(c.facts.nextDueAt, p.thresholdDays), p.yellowWindowDays);
    if (!hit) return null;
    const message =
      hit.light === "RED"
        ? { zh: `台账「${c.facts.name}」应于 ${c.facts.nextDueAt} 更新，已逾期 ${hit.overdueDays} 天`, en: `Ledger "${c.facts.name}" was due on ${c.facts.nextDueAt}, ${hit.overdueDays} days overdue` }
        : { zh: `台账「${c.facts.name}」应于 ${c.facts.nextDueAt} 更新，剩余 ${-hit.overdueDays} 天`, en: `Ledger "${c.facts.name}" due on ${c.facts.nextDueAt}, ${-hit.overdueDays} days left` };
    return judged(c, p, hit, message);
  },
});

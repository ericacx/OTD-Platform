import { type DbOrTx, customerOrders, dictionaries, handoverPackages, orderLines, plannings, quoteRounds, quotes, sampleRounds, samples, styles, testReportLinks, testReports, testRequests } from "@otd/db";
import { GATES } from "@otd/shared";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { addDays, base, compact, customerIn, deadlineLight, defineRule, dwellLight, elapsedDays, judged, todayOf } from "./types.js";

const ACTIVE_ORDER = ["PENDING_CONFIRM", "TO_SCHEDULE", "IN_PRODUCTION", "TO_SHIP"];

async function roundTypeLabels(db: DbOrTx): Promise<Map<string, { zh: string; en: string }>> {
  const rows = await db.select({ code: dictionaries.code, label: dictionaries.label }).from(dictionaries).where(eq(dictionaries.type, "roundType"));
  return new Map(rows.map((r) => [r.code, r.label]));
}

type RoundFacts = { since: Date };

function roundRule(ruleType: string, status: string, stage: { zh: string; en: string }, wording: (d: number, t: number) => { zh: string; en: string }) {
  return defineRule<RoundFacts>({
    ruleType,
    targetType: "sampleRound",
    kind: "DWELL",
    condition: (p) => ({ zh: `停留「${stage.zh}」> ${p.thresholdDays} 天`, en: `In "${stage.en}" > ${p.thresholdDays} days` }),
    findCandidates: async (db, _params, _now, scope) => {
      const rows = await db
        .select({ r: sampleRounds, s: samples, styleNo: styles.styleNo })
        .from(sampleRounds)
        .innerJoin(samples, eq(samples.id, sampleRounds.sampleId))
        .innerJoin(styles, eq(styles.id, samples.styleId))
        .where(and(eq(sampleRounds.status, status), customerIn(samples.customerId, scope)));
      if (!rows.length) return [];
      const labels = await roundTypeLabels(db);
      return rows.map(({ r, s, styleNo }) => ({
        ...base({
          targetId: r.id,
          targetNo: s.docNo,
          targetName: `#${styleNo} ${labels.get(r.roundType)?.zh ?? r.roundType} 第 ${r.roundNo} 轮`,
          docType: "sample",
          docId: s.id,
          link: `/samples/${s.id}`,
          customerId: s.customerId,
          ownerId: s.ownerId,
          orgId: s.orgId,
          responsibleIds: compact([s.technicianId, s.ownerId]),
        }),
        facts: { since: r.stageEnteredAt },
      }));
    },
    judge: (c, p, now) => {
      const days = elapsedDays(c.facts.since, now);
      const hit = dwellLight(days, p.thresholdDays, p.yellowWindowDays);
      return hit ? judged(c, p, hit, wording(days, p.thresholdDays)) : null;
    },
  });
}

export const roundStuckIssued = roundRule("ROUND_STUCK_ISSUED", "ISSUED", { zh: "已下达", en: "Issued" }, (d, t) => ({
  zh: `轮次停留在『已下达』已 ${d} 天（阈值 ${t} 天）`,
  en: `Round has stayed in "Issued" for ${d} days (threshold ${t} days)`,
}));

export const roundAwaitingApproval = roundRule("ROUND_AWAITING_APPROVAL", "AWAITING_APPROVAL", { zh: "待批复", en: "Awaiting approval" }, (d, t) => ({
  zh: `等待客户批复已 ${d} 天（阈值 ${t} 天）`,
  en: `Awaiting customer approval for ${d} days (threshold ${t} days)`,
}));

type TestFacts = { dueDate: string };

export const testOverdue = defineRule<TestFacts>({
  ruleType: "TEST_OVERDUE",
  targetType: "testRequest",
  kind: "DEADLINE",
  condition: (p) => ({ zh: `超过要求完成日 ${p.thresholdDays} 天仍未出报告`, en: `No report ${p.thresholdDays} days after the due date` }),
  findCandidates: async (db, _params, _now, scope) => {
    const rows = await db
      .select({ r: testRequests, styleNo: styles.styleNo })
      .from(testRequests)
      .innerJoin(styles, eq(styles.id, testRequests.styleId))
      .where(and(inArray(testRequests.status, ["AWAITING_SAMPLE", "TESTING"]), isNotNull(testRequests.dueDate), customerIn(testRequests.customerId, scope)));
    return rows.map(({ r, styleNo }) => ({
      ...base({
        targetId: r.id,
        targetNo: r.docNo,
        targetName: `#${styleNo}`,
        docType: "testRequest",
        docId: r.id,
        link: `/tests/${r.id}`,
        customerId: r.customerId,
        ownerId: r.ownerId,
        orgId: r.orgId,
        responsibleIds: compact([r.senderId]),
      }),
      facts: { dueDate: r.dueDate! },
    }));
  },
  judge: (c, p, now) => {
    const deadline = addDays(c.facts.dueDate, p.thresholdDays);
    const hit = deadlineLight(todayOf(now), deadline, p.yellowWindowDays);
    if (!hit) return null;
    const message =
      hit.light === "RED"
        ? { zh: `送测超期未出报告：要求 ${c.facts.dueDate} 出报告，已超 ${hit.overdueDays} 天`, en: `Test report overdue: due ${c.facts.dueDate}, ${hit.overdueDays} days late` }
        : { zh: `要求 ${c.facts.dueDate} 出报告，剩余 ${-hit.overdueDays} 天`, en: `Report due ${c.facts.dueDate}, ${-hit.overdueDays} days left` };
    return judged(c, p, hit, message);
  },
});

type ReportFacts = { validUntil: string; agencyReportNo: string; poNos: string[] };

export const reportExpiring = defineRule<ReportFacts>({
  ruleType: "REPORT_EXPIRING",
  targetType: "testReport",
  kind: "DEADLINE",
  condition: (p) => ({ zh: `在途 PO 引用且 ${p.thresholdDays} 天内到期为黄、已过期为红`, en: `Referenced by open POs: amber within ${p.thresholdDays} days, red once expired` }),
  findCandidates: async (db, _params, _now, scope) => {
    const lines = await db
      .select({ styleId: orderLines.styleId, poNo: customerOrders.poNo })
      .from(orderLines)
      .innerJoin(customerOrders, eq(customerOrders.id, orderLines.orderId))
      .where(inArray(customerOrders.status, ACTIVE_ORDER));
    if (!lines.length) return [];
    const posByStyle = new Map<string, Set<string>>();
    for (const l of lines) posByStyle.set(l.styleId, (posByStyle.get(l.styleId) ?? new Set()).add(l.poNo));
    const styleIds = [...posByStyle.keys()];
    const links = await db.select().from(testReportLinks).where(inArray(testReportLinks.styleId, styleIds));
    const reportIds = compact(links.map((l) => l.reportId));
    const reports = await db
      .select()
      .from(testReports)
      .where(and(eq(testReports.result, "PASS"), customerIn(testReports.customerId, scope)));
    const relevant = reports.filter((r) => posByStyle.has(r.styleId) || reportIds.includes(r.id));
    const coverage = new Map<string, string[]>();
    for (const r of relevant) coverage.set(r.id, compact([posByStyle.has(r.styleId) ? r.styleId : null, ...links.filter((l) => l.reportId === r.id).map((l) => l.styleId)]));
    const latest = new Map<string, (typeof reports)[number]>();
    for (const r of relevant) {
      for (const s of coverage.get(r.id) ?? []) {
        const cur = latest.get(s);
        if (!cur || cur.validUntil < r.validUntil) latest.set(s, r);
      }
    }
    const chosen = new Map<string, { report: (typeof reports)[number]; styles: string[] }>();
    for (const [styleId, r] of latest) {
      const entry = chosen.get(r.id) ?? { report: r, styles: [] };
      entry.styles.push(styleId);
      chosen.set(r.id, entry);
    }
    return [...chosen.values()].map(({ report, styles: covered }) => ({
      ...base({
        targetId: report.id,
        targetNo: report.docNo,
        targetName: report.agencyReportNo,
        docType: "testReport",
        docId: report.id,
        link: `/tests/reports/${report.id}`,
        customerId: report.customerId,
        ownerId: report.ownerId,
        orgId: report.orgId,
      }),
      facts: { validUntil: report.validUntil, agencyReportNo: report.agencyReportNo, poNos: [...new Set(covered.flatMap((s) => [...(posByStyle.get(s) ?? [])]))].sort() },
    }));
  },
  judge: (c, p, now) => {
    const hit = deadlineLight(todayOf(now), c.facts.validUntil, p.thresholdDays);
    if (!hit) return null;
    const pos = c.facts.poNos.join("、");
    const message =
      hit.light === "RED"
        ? { zh: `测试报告 ${c.facts.agencyReportNo} 已于 ${c.facts.validUntil} 过期，在途 PO ${pos} 仍引用`, en: `Report ${c.facts.agencyReportNo} expired on ${c.facts.validUntil}; still used by open PO ${pos}` }
        : { zh: `测试报告 ${c.facts.agencyReportNo} 将于 ${c.facts.validUntil} 到期（剩余 ${-hit.overdueDays} 天），在途 PO ${pos} 引用`, en: `Report ${c.facts.agencyReportNo} expires on ${c.facts.validUntil} (${-hit.overdueDays} days left); used by open PO ${pos}` };
    return judged(c, p, hit, message, 0);
  },
});

type DwellFacts = { since: Date };

function planningRule(ruleType: string, status: string, stage: { zh: string; en: string }, wording: (d: number, t: number) => { zh: string; en: string }, since: (r: typeof plannings.$inferSelect) => Date) {
  return defineRule<DwellFacts>({
    ruleType,
    targetType: "planning",
    kind: "DWELL",
    condition: (p) => ({ zh: `停留「${stage.zh}」> ${p.thresholdDays} 天`, en: `In "${stage.en}" > ${p.thresholdDays} days` }),
    findCandidates: async (db, _params, _now, scope) => {
      const rows = await db.select().from(plannings).where(and(eq(plannings.status, status), customerIn(plannings.customerId, scope)));
      return rows.map((r) => ({
        ...base({
          targetId: r.id,
          targetNo: r.docNo,
          targetName: r.styleNo ? `#${r.styleNo}${r.nameZh ? ` ${r.nameZh}` : ""}` : (r.sourceFilename ?? null),
          docType: "planning",
          docId: r.id,
          link: `/planning/${r.id}`,
          customerId: r.customerId,
          ownerId: r.ownerId,
          orgId: r.orgId,
        }),
        facts: { since: since(r) },
      }));
    },
    judge: (c, p, now) => {
      const days = elapsedDays(c.facts.since, now);
      const hit = dwellLight(days, p.thresholdDays, p.yellowWindowDays);
      return hit ? judged(c, p, hit, wording(days, p.thresholdDays)) : null;
    },
  });
}

export const planningRecognizingStuck = planningRule(
  "PLANNING_RECOGNIZING_STUCK",
  "RECOGNIZING",
  { zh: "识别中", en: "Recognizing" },
  (d, t) => ({ zh: `企划停留在『识别中』已 ${d} 天（阈值 ${t} 天）`, en: `Brief has been recognizing for ${d} days (threshold ${t} days)` }),
  (r) => r.createdAt,
);

export const planningUnconfirmed = planningRule(
  "PLANNING_UNCONFIRMED",
  "EXTRACTED",
  { zh: "提取完成", en: "Extracted" },
  (d, t) => ({ zh: `企划提取完成后待确认已 ${d} 天（阈值 ${t} 天）`, en: `Brief extracted ${d} days ago and not confirmed (threshold ${t} days)` }),
  (r) => r.recognizedAt ?? r.createdAt,
);

export const quoteNoFeedback = defineRule<DwellFacts>({
  ruleType: "QUOTE_NO_FEEDBACK",
  targetType: "quoteRound",
  kind: "DWELL",
  condition: (p) => ({ zh: `对外报价停留「已报价」> ${p.thresholdDays} 天`, en: `Customer quote in "Quoted" > ${p.thresholdDays} days` }),
  findCandidates: async (db, _params, _now, scope) => {
    const rows = await db
      .select({ r: quoteRounds, q: quotes, styleNo: styles.styleNo })
      .from(quoteRounds)
      .innerJoin(quotes, eq(quotes.id, quoteRounds.quoteId))
      .innerJoin(styles, eq(styles.id, quotes.styleId))
      .where(and(eq(quoteRounds.kind, "CUSTOMER"), eq(quoteRounds.status, "QUOTED"), customerIn(quotes.customerId, scope)));
    return rows.map(({ r, q, styleNo }) => ({
      ...base({
        targetId: r.id,
        targetNo: r.docNo,
        targetName: `#${styleNo} 第 ${r.roundNo} 轮`,
        docType: "quote",
        docId: q.id,
        link: `/quotes/${q.id}`,
        customerId: q.customerId,
        ownerId: q.ownerId,
        orgId: q.orgId,
      }),
      facts: { since: r.quotedAt ?? r.createdAt },
    }));
  },
  judge: (c, p, now) => {
    const days = elapsedDays(c.facts.since, now);
    const hit = dwellLight(days, p.thresholdDays, p.yellowWindowDays);
    return hit ? judged(c, p, hit, { zh: `报价已报客户 ${days} 天未反馈（阈值 ${p.thresholdDays} 天）`, en: `Quoted ${days} days ago with no customer feedback (threshold ${p.thresholdDays} days)` }) : null;
  },
});

type HandoverFacts = { since: Date; missing: { zh: string; en: string }[] };

const G1_LABELS = new Map<string, { zh: string; en: string }>(GATES.G1.conditions.map((c) => [c.key, c.label]));

export const handoverIncomplete = defineRule<HandoverFacts>({
  ruleType: "HANDOVER_INCOMPLETE",
  targetType: "handover",
  kind: "DWELL",
  condition: (p) => ({ zh: `齐套中 > ${p.thresholdDays} 天仍未移交`, en: `Collecting > ${p.thresholdDays} days without handover` }),
  findCandidates: async (db, _params, _now, scope) => {
    const rows = await db
      .select({ h: handoverPackages, styleNo: styles.styleNo })
      .from(handoverPackages)
      .innerJoin(styles, eq(styles.id, handoverPackages.styleId))
      .where(and(eq(handoverPackages.status, "COLLECTING"), customerIn(handoverPackages.customerId, scope)));
    return rows.map(({ h, styleNo }) => ({
      ...base({
        targetId: h.id,
        targetNo: h.docNo,
        targetName: `#${styleNo}`,
        docType: "handover",
        docId: h.id,
        link: `/documents/handovers/${h.id}`,
        customerId: h.customerId,
        ownerId: h.ownerId,
        orgId: h.orgId,
      }),
      facts: {
        since: h.collectingSince,
        missing: Object.entries(h.checklist)
          .filter(([, v]) => !v.ok && v.applicable !== false)
          .map(([k]) => G1_LABELS.get(k) ?? { zh: k, en: k }),
      },
    }));
  },
  judge: (c, p, now) => {
    const days = elapsedDays(c.facts.since, now);
    const hit = dwellLight(days, p.thresholdDays, p.yellowWindowDays);
    if (!hit) return null;
    const tailZh = c.facts.missing.length ? `，缺：${c.facts.missing.map((m) => m.zh).join("、")}` : "，条件已齐待确认移交";
    const tailEn = c.facts.missing.length ? `; missing: ${c.facts.missing.map((m) => m.en).join(", ")}` : "; ready to hand over";
    return judged(c, p, hit, { zh: `开发移交齐套中已 ${days} 天（阈值 ${p.thresholdDays} 天）${tailZh}`, en: `Handover collecting for ${days} days (threshold ${p.thresholdDays} days)${tailEn}` });
  },
});

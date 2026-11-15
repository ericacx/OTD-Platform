import type { NodeCode, NodeState } from "@otd/shared";
import { describe, expect, it } from "vitest";
import { type EngineOptions, type OrderFacts, type StyleFacts, deriveMainline } from "./engine.js";

const TODAY = "2026-10-21";

function style(styleNo: string, patch: Partial<StyleFacts> = {}): StyleFacts {
  return { styleId: `s-${styleNo}`, styleNo, planning: null, costReview: false, rounds: [], testRequests: [], testReports: [], quoteRounds: [], handover: null, ...patch };
}

function devDone(styleNo: string, patch: Partial<StyleFacts> = {}): StyleFacts {
  return style(styleNo, {
    planning: { id: `p-${styleNo}`, docNo: "BR-2610-001", status: "CONFIRMED", seasonCode: "AW26", confirmed: true },
    rounds: [{ id: `r-${styleNo}`, sampleId: `sp-${styleNo}`, sampleDocNo: "SP-2610-001", roundNo: 1, roundType: "SMS", status: "APPROVED" }],
    testReports: [{ id: `rep-${styleNo}`, docNo: "RPT-2610-001", agencyReportNo: "BV-26-10523", result: "PASS", validUntil: "2027-06-01" }],
    quoteRounds: [{ id: `q-${styleNo}`, quoteId: `qq-${styleNo}`, docNo: `QT-${styleNo}-02`, kind: "CUSTOMER", roundNo: 2, status: "ACCEPTED", guardrailPassed: true, overrideApproved: false }],
    handover: { id: `h-${styleNo}`, docNo: "DH-2610-001", status: "HANDED_OVER", missing: [] },
    ...patch,
  });
}

function facts(patch: Partial<OrderFacts> = {}, order: Partial<OrderFacts["order"]> = {}): OrderFacts {
  return {
    order: { id: "o1", poNo: "PO0010459", status: "PENDING_CONFIRM", ruleCheck: [{ key: "qty", label: { zh: "数量一致", en: "Qty" }, passed: true }], unmatchedStyleNos: [], factoryReplyDate: "2026-12-16", factoryName: "南湖五厂", transportMode: "RAIL", ...order },
    styles: [devDone("11506")],
    packagingPlans: [],
    cartons: [],
    purchases: [],
    production: null,
    inspections: [],
    bookings: [],
    shipments: [],
    receivables: [],
    redHits: [],
    ...patch,
  };
}

const confirmedPack = { id: "pk1", docNo: "PK-2610-009", status: "CONFIRMED", confirmed: true, version: 3 };
const purchase = { id: "pu1", docNo: "PUR-2610-010", status: "RECEIVED", promisedDate: "2026-10-01" };
const released = { id: "i1", docNo: "INSP-2610-020", stage: "FRI", status: "RELEASED", result: "PASS", roundNo: 1, styleId: null, releaseCheck: null };

type Case = { name: string; facts: OrderFacts; options?: Partial<EngineOptions>; expect: Partial<Record<NodeCode, NodeState>>; completed?: number; current?: NodeCode | null; reason?: [NodeCode, string]; headline?: string };

const CASES: Case[] = [
  {
    name: "视频样例：开发五节点完成，PO 待复核全绿 → 5 / 10，当前 PO 复核",
    facts: facts(),
    expect: { N01: "DONE", N02: "DONE", N03: "DONE", N04: "DONE", N05: "DONE", N06: "IN_PROGRESS", N07: "NOT_STARTED", N10: "NOT_STARTED" },
    completed: 5,
    current: "N06",
    headline: "已完成 5 / 10 步 · 当前节点：PO 复核",
  },
  {
    name: "没有任何开发单据 → N01 待启动",
    facts: facts({ styles: [style("90001")] }),
    expect: { N01: "NOT_STARTED", N02: "NOT_STARTED", N03: "NOT_STARTED", N04: "NOT_STARTED", N05: "NOT_STARTED", N06: "IN_PROGRESS" },
    current: "N06",
  },
  {
    name: "企划识别失败 → N01 受阻",
    facts: facts({ styles: [style("90002", { planning: { id: "p", docNo: "BR-2610-002", status: "RECOGNITION_FAILED", seasonCode: null, confirmed: false } })] }),
    expect: { N01: "BLOCKED" },
    current: "N01",
    reason: ["N01", "识别失败"],
  },
  {
    name: "企划 confirmedAt 已写入即视为企划接入完成；任一轮已批准即视为打样完成",
    facts: facts({ styles: [style("90010", { planning: { id: "p", docNo: "BR-2610-010", status: "EXTRACTED", seasonCode: "FA27", confirmed: true }, rounds: [{ id: "r1", sampleId: "sp", sampleDocNo: "SP-2610-030", roundNo: 1, roundType: "SMS", status: "APPROVED" }, { id: "r2", sampleId: "sp", sampleDocNo: "SP-2610-030", roundNo: 2, roundType: "PP", status: "KNITTING" }] })] }),
    expect: { N01: "DONE", N02: "DONE" },
  },
  {
    name: "企划已确认、打样上机中 → N02 进行中",
    facts: facts({ styles: [style("90003", { planning: { id: "p", docNo: "BR-2610-003", status: "CONFIRMED", seasonCode: "FA27", confirmed: true }, rounds: [{ id: "r", sampleId: "sp", sampleDocNo: "SP-2610-012", roundNo: 1, roundType: "PROTO", status: "KNITTING" }] })] }),
    expect: { N01: "DONE", N02: "IN_PROGRESS", N03: "NOT_STARTED", N05: "NOT_STARTED" },
    current: "N02",
  },
  {
    name: "打样到质检 + 报价已发：N03 与 N04 并行进行中",
    facts: facts({
      styles: [
        style("90004", {
          planning: { id: "p", docNo: "BR-2610-004", status: "CONFIRMED", seasonCode: "FA27", confirmed: true },
          rounds: [{ id: "r", sampleId: "sp", sampleDocNo: "SP-2610-013", roundNo: 1, roundType: "SMS", status: "QC" }],
          quoteRounds: [{ id: "q", quoteId: "qq", docNo: "QT-90004-01", kind: "CUSTOMER", roundNo: 1, status: "QUOTED", guardrailPassed: true, overrideApproved: false }],
        }),
      ],
    }),
    expect: { N02: "IN_PROGRESS", N03: "IN_PROGRESS", N04: "IN_PROGRESS" },
    current: "N02",
  },
  {
    name: "客户流程未启用测试 → N03 不适用并计入完成数",
    facts: facts({ styles: [devDone("90005", { testReports: [] })] }),
    options: { enabledNodes: new Set<NodeCode>(["N01", "N02", "N04", "N05", "N06", "N07", "N08", "N09", "N10"]) },
    expect: { N03: "NOT_APPLICABLE", N05: "DONE" },
    completed: 5,
  },
  {
    name: "流程配置缺 N05 也不会把开发移交变成不适用（必选节点）",
    facts: facts(),
    options: { enabledNodes: new Set<NodeCode>(["N03", "N04", "N07", "N09"]) },
    expect: { N05: "DONE", N06: "IN_PROGRESS", N10: "NOT_STARTED" },
  },
  {
    name: "测试报告不合格且无有效报告 → N03 受阻",
    facts: facts({ styles: [devDone("90006", { handover: null, testReports: [{ id: "x", docNo: "RPT-2610-002", agencyReportNo: "SGS-26-1", result: "FAIL", validUntil: "2027-01-01" }] })] }),
    expect: { N03: "BLOCKED", N05: "NOT_STARTED" },
    reason: ["N03", "不合格"],
  },
  {
    name: "唯一报告已过期 → N03 受阻并给出过期日期",
    facts: facts({ styles: [devDone("90007", { handover: null, testReports: [{ id: "x", docNo: "RPT-2510-002", agencyReportNo: "SGS-25-9102", result: "PASS", validUntil: "2026-10-01" }] })] }),
    expect: { N03: "BLOCKED" },
    reason: ["N03", "SGS-25-9102 已于 2026-10-01 过期"],
  },
  {
    name: "报价毛利低于护栏且无例外 → N04 受阻",
    facts: facts({ styles: [devDone("90008", { handover: null, quoteRounds: [{ id: "q", quoteId: "qq", docNo: "QT-90008-01", kind: "INTERNAL", roundNo: 1, status: "COST_REVIEW", guardrailPassed: false, overrideApproved: false }] })] }),
    expect: { N04: "BLOCKED" },
    reason: ["N04", "护栏"],
  },
  {
    name: "N02–N04 完成但移交包缺项 → N05 受阻（G1）",
    facts: facts({ styles: [devDone("90009", { handover: { id: "h", docNo: "DH-2610-002", status: "COLLECTING", missing: [{ zh: "QRS 品质参考样已留存", en: "QRS retained" }] } })] }),
    expect: { N04: "DONE", N05: "BLOCKED" },
    current: "N05",
    reason: ["N05", "G1 缺项：QRS 品质参考样已留存"],
  },
  {
    name: "一单两款：一款完成一款打样中 → 开发节点进行中并显示款数",
    facts: facts({ styles: [devDone("11506"), style("12810", { planning: { id: "p2", docNo: "BR-2610-005", status: "CONFIRMED", seasonCode: "FA27", confirmed: true }, rounds: [{ id: "r2", sampleId: "sp2", sampleDocNo: "SP-2610-020", roundNo: 2, roundType: "SMS", status: "AWAITING_APPROVAL" }] })] }),
    expect: { N01: "DONE", N02: "IN_PROGRESS", N05: "IN_PROGRESS" },
    current: "N02",
  },
  {
    name: "一单两款：任一款受阻 → 节点受阻",
    facts: facts({ styles: [devDone("11506"), style("12811", { planning: { id: "p3", docNo: "BR-2610-006", status: "RECOGNITION_FAILED", seasonCode: null, confirmed: false } })] }),
    expect: { N01: "BLOCKED" },
    reason: ["N01", "#12811"],
  },
  {
    name: "规则包有未通过项 → N06 受阻",
    facts: facts({}, { ruleCheck: [{ key: "leadTime", label: { zh: "交期满足最短生产周期", en: "Lead time" }, passed: false, detail: "不足 30 天" }] }),
    expect: { N06: "BLOCKED" },
    reason: ["N06", "交期满足最短生产周期"],
  },
  {
    name: "待排产：包装已确认 + 采购已下 → N07 完成，N08 待启动",
    facts: facts({ packagingPlans: [confirmedPack], purchases: [purchase] }, { status: "TO_SCHEDULE" }),
    expect: { N06: "DONE", N07: "DONE", N08: "NOT_STARTED" },
    completed: 7,
    current: null,
  },
  {
    name: "待排产：包装草稿 → N07 进行中",
    facts: facts({ packagingPlans: [{ id: "pk", docNo: "PK-2610-001", status: "DRAFT", confirmed: false, version: 1 }] }, { status: "TO_SCHEDULE" }),
    expect: { N07: "IN_PROGRESS" },
    current: "N07",
  },
  {
    name: "生产中：采购逾期 + 工厂回复缺失 → N08 受阻",
    facts: facts({ packagingPlans: [confirmedPack], purchases: [{ id: "pu", docNo: "PUR-2610-011", status: "ORDERED", promisedDate: "2026-10-10" }], production: { completionRate: 0.4, reportDate: TODAY } }, { status: "IN_PRODUCTION", factoryReplyDate: null }),
    expect: { N08: "BLOCKED" },
    current: "N08",
    reason: ["N08", "工厂交期回复缺失"],
  },
  {
    name: "生产完成 100% 且装箱齐套 → N08 完成",
    facts: facts({ packagingPlans: [confirmedPack], purchases: [purchase], production: { completionRate: 1, reportDate: TODAY }, cartons: [{ id: "c", docNo: "CT-2610-001", status: "PACKED" }] }, { status: "IN_PRODUCTION" }),
    expect: { N08: "DONE", N09: "NOT_STARTED" },
    completed: 8,
  },
  {
    name: "尾验不合格未复验 → N09 受阻",
    facts: facts({ packagingPlans: [confirmedPack], purchases: [purchase], inspections: [{ id: "i", docNo: "INSP-2610-020", stage: "FRI", status: "INSPECTED", result: "FAIL", roundNo: 2, styleId: null, releaseCheck: null }] }, { status: "IN_PRODUCTION" }),
    expect: { N09: "BLOCKED" },
    reason: ["N09", "INSP-2610-020 尾验第 2 轮不合格"],
  },
  {
    name: "尾验合格但 G2 条件不满足 → N09 受阻并列出条件",
    facts: facts({ inspections: [{ id: "i", docNo: "INSP-2610-021", stage: "FRI", status: "INSPECTED", result: "PASS", roundNo: 1, styleId: null, releaseCheck: [{ key: "packingReady", label: { zh: "包装方案已确认且装箱齐套", en: "Packing ready" }, passed: false, detail: "PK-2606-009 v3 待客户确认" }] }] }, { status: "IN_PRODUCTION" }),
    expect: { N09: "BLOCKED" },
    reason: ["N09", "G2 未满足：包装方案已确认且装箱齐套"],
  },
  {
    name: "已放行 + 已签收但应收未收 → N10 进行中，未闭环",
    facts: facts({ packagingPlans: [confirmedPack], purchases: [purchase], inspections: [released], shipments: [{ id: "sh", docNo: "SH-2610-001", status: "SIGNED" }], receivables: [{ id: "ar", docNo: "AR-202610-001", status: "NOT_DUE", dueDate: "2026-12-30" }] }, { status: "TO_SHIP" }),
    expect: { N08: "DONE", N09: "DONE", N10: "IN_PROGRESS" },
    completed: 9,
    current: "N10",
  },
  {
    name: "应收逾期 → N10 受阻",
    facts: facts({ inspections: [released], shipments: [{ id: "sh", docNo: "SH-2610-002", status: "SIGNED" }], receivables: [{ id: "ar", docNo: "AR-202609-014", status: "DUE", dueDate: "2026-10-11" }] }, { status: "TO_SHIP" }),
    expect: { N10: "BLOCKED" },
    reason: ["N10", "AR-202609-014 逾期 10 天"],
  },
  {
    name: "全部签收且收齐 → 10 / 10 已闭环",
    facts: facts({ packagingPlans: [confirmedPack], purchases: [purchase], inspections: [released], shipments: [{ id: "sh", docNo: "SH-2610-003", status: "SIGNED" }], receivables: [{ id: "ar", docNo: "AR-202610-002", status: "PAID", dueDate: "2026-10-01" }] }, { status: "TO_SHIP" }),
    expect: { N10: "DONE" },
    completed: 10,
    current: null,
    headline: "已完成 10 / 10 · 已闭环",
  },
  {
    name: "未关闭的红灯巡检命中 → 对应进行中节点受阻",
    facts: facts({ redHits: [{ node: "N06", message: { zh: "PO 待复核超期 4 天", en: "PO review overdue" } }] }),
    expect: { N06: "BLOCKED" },
    reason: ["N06", "PO 待复核超期 4 天"],
  },
  {
    name: "已移交的老款翻单缺上游单据 → 开发节点按已移交视为完成",
    facts: facts({ styles: [style("11152", { handover: { id: "h", docNo: "DH-2601-003", status: "HANDED_OVER", missing: [] } })] }),
    expect: { N01: "DONE", N02: "DONE", N03: "DONE", N04: "DONE", N05: "DONE" },
    completed: 5,
  },
  {
    name: "订单已完成 → 订单期节点按订单状态兜底完成",
    facts: facts({}, { status: "COMPLETED" }),
    expect: { N07: "DONE", N08: "DONE", N09: "DONE", N10: "DONE" },
    completed: 10,
  },
  {
    name: "订单已取消 → 订单期未完成节点回到待启动，没有当前节点",
    facts: facts({}, { status: "CANCELLED" }),
    expect: { N06: "DONE", N07: "NOT_STARTED" },
    current: null,
  },
];

describe("mainline engine", () => {
  it.each(CASES)("$name", (c) => {
    const result = deriveMainline(c.facts, { today: TODAY, ...c.options });
    expect(result.nodes).toHaveLength(10);
    for (const [code, state] of Object.entries(c.expect)) {
      expect({ code, state: result.nodes.find((n) => n.code === code)!.state }).toEqual({ code, state });
    }
    if (c.completed !== undefined) expect(result.completedCount).toBe(c.completed);
    if (c.current !== undefined) expect(result.currentNode).toBe(c.current);
    if (c.reason) {
      const node = result.nodes.find((n) => n.code === c.reason![0])!;
      expect(node.blockedReasons.map((r) => r.zh).join(" | ")).toContain(c.reason[1]);
    }
    if (c.headline) expect(result.headline.zh).toBe(c.headline);
  });

  it("marks parallel in-progress nodes and lists them in the headline", () => {
    const result = deriveMainline(CASES.find((c) => c.name.startsWith("打样到质检"))!.facts, { today: TODAY });
    expect(result.nodes.filter((n) => n.parallel).map((n) => n.code)).toEqual(["N03", "N04", "N06"]);
    expect(result.headline.zh).toContain("并行：测试、报价、PO 复核");
  });

  it("reports per-style states and progress text for multi-style orders", () => {
    const result = deriveMainline(CASES.find((c) => c.name.startsWith("一单两款：一款完成"))!.facts, { today: TODAY });
    const n02 = result.nodes.find((n) => n.code === "N02")!;
    expect(n02.styles).toEqual([
      { styleNo: "11506", state: "DONE" },
      { styleNo: "12810", state: "IN_PROGRESS" },
    ]);
    expect(n02.summary.zh).toContain("1 / 2 款已完成");
    expect(n02.link).toBe("/samples/sp2");
    expect(result.nodes.find((n) => n.code === "N05")!.gate).toBe("G1");
    expect(result.nodes.find((n) => n.code === "N09")!.gate).toBe("G2");
  });

  it("skips packaging requirement when the packaging service is not enabled", () => {
    const result = deriveMainline(facts({ purchases: [purchase] }, { status: "TO_SCHEDULE" }), { today: TODAY, features: { packaging: false, purchase: true } });
    expect(result.nodes.find((n) => n.code === "N07")!.state).toBe("DONE");
  });
});

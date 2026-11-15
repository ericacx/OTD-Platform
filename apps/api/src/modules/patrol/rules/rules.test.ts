import { PATROL_RULES } from "@otd/db/seed";
import { describe, expect, it } from "vitest";
import { PATROL_RULE_TYPES } from "./index.js";
import { type PatrolCandidate, type RuleParams, base, dwellLight } from "./types.js";

const NOW = new Date("2026-10-21T01:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

type Expect = null | { light: "RED" | "YELLOW"; overdueDays: number; severity?: "HIGH" | "MEDIUM" | "LOW"; zh?: string; contains?: string };
type Case = [ruleType: string, label: string, facts: Record<string, unknown>, expected: Expect];

const CASES: Case[] = [
  ["ROUND_STUCK_ISSUED", "红：停留 142 天", { since: ago(142) }, { light: "RED", overdueDays: 135, severity: "HIGH", zh: "轮次停留在『已下达』已 142 天（阈值 7 天）" }],
  ["ROUND_STUCK_ISSUED", "红：刚过阈值", { since: ago(8) }, { light: "RED", overdueDays: 1 }],
  ["ROUND_STUCK_ISSUED", "黄：等于阈值", { since: ago(7) }, { light: "YELLOW", overdueDays: 0 }],
  ["ROUND_STUCK_ISSUED", "黄：窗口内", { since: ago(6) }, { light: "YELLOW", overdueDays: -1 }],
  ["ROUND_STUCK_ISSUED", "不命中", { since: ago(3) }, null],
  ["ROUND_AWAITING_APPROVAL", "红：超 2T 升级为高", { since: ago(142) }, { light: "RED", overdueDays: 137, severity: "HIGH", zh: "等待客户批复已 142 天（阈值 5 天）" }],
  ["ROUND_AWAITING_APPROVAL", "红：未超 2T 不升级", { since: ago(8) }, { light: "RED", overdueDays: 3, severity: "MEDIUM" }],
  ["ROUND_AWAITING_APPROVAL", "黄", { since: ago(4) }, { light: "YELLOW", overdueDays: -1 }],
  ["ROUND_AWAITING_APPROVAL", "不命中", { since: ago(2) }, null],
  ["TEST_OVERDUE", "红", { dueDate: "2026-10-18" }, { light: "RED", overdueDays: 3, zh: "送测超期未出报告：要求 2026-10-18 出报告，已超 3 天" }],
  ["TEST_OVERDUE", "黄", { dueDate: "2026-10-22" }, { light: "YELLOW", overdueDays: -1 }],
  ["TEST_OVERDUE", "不命中", { dueDate: "2026-10-30" }, null],
  ["PURCHASE_OVERDUE", "红：视频原文", { promisedDate: "2026-09-20" }, { light: "RED", overdueDays: 31, zh: "承诺交期 2026-09-20 已过 31 天" }],
  ["PURCHASE_OVERDUE", "黄", { promisedDate: "2026-10-23" }, { light: "YELLOW", overdueDays: -2 }],
  ["PURCHASE_OVERDUE", "不命中", { promisedDate: "2026-10-25" }, null],
  ["PLANNING_RECOGNIZING_STUCK", "红：未超 2T", { since: ago(3) }, { light: "RED", overdueDays: 2, severity: "LOW" }],
  ["PLANNING_RECOGNIZING_STUCK", "红：超 2T 升一级", { since: ago(4) }, { light: "RED", overdueDays: 3, severity: "MEDIUM" }],
  ["PLANNING_RECOGNIZING_STUCK", "黄", { since: ago(1) }, { light: "YELLOW", overdueDays: 0 }],
  ["PLANNING_RECOGNIZING_STUCK", "不命中：刚上传", { since: hoursAgo(1) }, null],
  ["PLANNING_UNCONFIRMED", "红", { since: ago(5) }, { light: "RED", overdueDays: 2, zh: "企划提取完成后待确认已 5 天（阈值 3 天）" }],
  ["PLANNING_UNCONFIRMED", "黄", { since: ago(2) }, { light: "YELLOW", overdueDays: -1 }],
  ["PLANNING_UNCONFIRMED", "不命中", { since: ago(1) }, null],
  ["QUOTE_NO_FEEDBACK", "红", { since: ago(20) }, { light: "RED", overdueDays: 6, zh: "报价已报客户 20 天未反馈（阈值 14 天）" }],
  ["QUOTE_NO_FEEDBACK", "黄", { since: ago(13) }, { light: "YELLOW", overdueDays: -1 }],
  ["QUOTE_NO_FEEDBACK", "不命中", { since: ago(3) }, null],
  ["REPORT_EXPIRING", "红：已过期", { validUntil: "2026-10-09", agencyReportNo: "ITS-25-2810", poNos: ["PO0009690"] }, { light: "RED", overdueDays: 12, severity: "MEDIUM", zh: "测试报告 ITS-25-2810 已于 2026-10-09 过期，在途 PO PO0009690 仍引用" }],
  ["REPORT_EXPIRING", "黄：30 天内", { validUntil: "2026-11-10", agencyReportNo: "ITS-25-3307", poNos: ["PO0009702"] }, { light: "YELLOW", overdueDays: -20, contains: "剩余 20 天" }],
  ["REPORT_EXPIRING", "不命中", { validUntil: "2026-12-31", agencyReportNo: "BV-1", poNos: ["PO1"] }, null],
  ["PO_REVIEW_OVERDUE", "红", { since: ago(4) }, { light: "RED", overdueDays: 1, zh: "PO 待复核已 4 天（阈值 3 天）" }],
  ["PO_REVIEW_OVERDUE", "黄", { since: ago(2) }, { light: "YELLOW", overdueDays: -1 }],
  ["PO_REVIEW_OVERDUE", "不命中", { since: hoursAgo(3) }, null],
  ["FACTORY_REPLY_MISSING", "红", { since: ago(5) }, { light: "RED", overdueDays: 2 }],
  ["FACTORY_REPLY_MISSING", "黄", { since: ago(3) }, { light: "YELLOW", overdueDays: 0 }],
  ["FACTORY_REPLY_MISSING", "不命中", { since: ago(1) }, null],
  ["PACKING_UNCONFIRMED_NEAR_INSPECTION", "红", { inspectionDate: "2026-10-25" }, { light: "RED", overdueDays: 3, contains: "须提前 7 天确认" }],
  ["PACKING_UNCONFIRMED_NEAR_INSPECTION", "黄", { inspectionDate: "2026-10-29" }, { light: "YELLOW", overdueDays: -1 }],
  ["PACKING_UNCONFIRMED_NEAR_INSPECTION", "不命中", { inspectionDate: "2026-11-20" }, null],
  ["INSPECTION_PRECONDITION_MISSING", "红", { plannedDate: "2026-10-22", missing: [{ zh: "物料到齐", en: "materials received" }, { zh: "有效测试报告", en: "valid test report" }] }, { light: "RED", overdueDays: 2, zh: "验货前置条件缺物料到齐、有效测试报告，排期日 10-22" }],
  ["INSPECTION_PRECONDITION_MISSING", "黄", { plannedDate: "2026-10-25", missing: [{ zh: "包装方案确认", en: "packing plan confirmation" }] }, { light: "YELLOW", overdueDays: -1 }],
  ["INSPECTION_PRECONDITION_MISSING", "不命中：离排期远", { plannedDate: "2026-11-30", missing: [{ zh: "物料到齐", en: "materials received" }] }, null],
  ["INSPECTION_PRECONDITION_MISSING", "不命中：条件齐", { plannedDate: "2026-10-22", missing: [] }, null],
  ["FRI_FAILED_NO_REWORK", "红", { actualDate: "2026-10-17", roundNo: 2 }, { light: "RED", overdueDays: 2, zh: "尾验第 2 轮不合格已 4 天未安排复验（阈值 2 天）" }],
  ["FRI_FAILED_NO_REWORK", "黄", { actualDate: "2026-10-20", roundNo: 1 }, { light: "YELLOW", overdueDays: -1 }],
  ["FRI_FAILED_NO_REWORK", "不命中", { actualDate: "2026-10-21", roundNo: 1 }, null],
  ["INSPECTION_LATE_SCHEDULE", "红：排期晚于最晚日", { plannedDate: "2026-11-01", exFactory: "2026-11-10" }, { light: "RED", overdueDays: 6, contains: "最晚 2026-10-26" }],
  ["INSPECTION_LATE_SCHEDULE", "不命中：排期在最晚日前", { plannedDate: "2026-10-25", exFactory: "2026-11-10" }, null],
  ["INSPECTION_LATE_SCHEDULE", "红：未排期且已过最晚日", { plannedDate: null, exFactory: "2026-11-01" }, { light: "RED", overdueDays: 4 }],
  ["INSPECTION_LATE_SCHEDULE", "黄：未排期临近最晚日", { plannedDate: null, exFactory: "2026-11-07" }, { light: "YELLOW", overdueDays: -2 }],
  ["INSPECTION_LATE_SCHEDULE", "不命中：未排期但还早", { plannedDate: null, exFactory: "2026-12-31" }, null],
  ["ETD_PASSED_NOT_SAILED", "红", { etd: "2026-09-30" }, { light: "RED", overdueDays: 21, zh: "订舱船期 2026-09-30 已过 21 天仍未开船" }],
  ["ETD_PASSED_NOT_SAILED", "黄", { etd: "2026-10-22" }, { light: "YELLOW", overdueDays: -1 }],
  ["ETD_PASSED_NOT_SAILED", "不命中", { etd: "2026-11-05" }, null],
  ["ARRIVED_NOT_SIGNED", "红", { since: ago(10) }, { light: "RED", overdueDays: 3, zh: "已到港 10 天未签收（阈值 7 天）" }],
  ["ARRIVED_NOT_SIGNED", "黄", { since: ago(6) }, { light: "YELLOW", overdueDays: -1 }],
  ["ARRIVED_NOT_SIGNED", "不命中", { since: ago(2) }, null],
  ["LEDGER_OVERDUE", "红", { nextDueAt: "2026-10-19", name: "刺绣等特殊工序产能表" }, { light: "RED", overdueDays: 2, zh: "台账「刺绣等特殊工序产能表」应于 2026-10-19 更新，已逾期 2 天" }],
  ["LEDGER_OVERDUE", "黄", { nextDueAt: "2026-10-23", name: "编织产能空余量表" }, { light: "YELLOW", overdueDays: -2 }],
  ["LEDGER_OVERDUE", "不命中", { nextDueAt: "2026-10-27", name: "编织产能空余量表" }, null],
  ["HANDOVER_INCOMPLETE", "红", { since: ago(10), missing: [{ zh: "测试报告有效", en: "Test report valid" }] }, { light: "RED", overdueDays: 3, zh: "开发移交齐套中已 10 天（阈值 7 天），缺：测试报告有效" }],
  ["HANDOVER_INCOMPLETE", "黄", { since: ago(6), missing: [] }, { light: "YELLOW", overdueDays: -1, contains: "条件已齐待确认移交" }],
  ["HANDOVER_INCOMPLETE", "不命中", { since: ago(2), missing: [] }, null],
];

function paramsOf(ruleType: string): RuleParams {
  const seed = PATROL_RULES.find((r) => r.ruleType === ruleType)!;
  return { thresholdDays: seed.params.thresholdDays!, yellowWindowDays: 2, severity: seed.severity as RuleParams["severity"] };
}

function candidate(facts: Record<string, unknown>): PatrolCandidate {
  return { ...base({ targetId: "target-1", assigneeId: "user-1" }), facts };
}

describe("patrol rule judges (table-driven)", () => {
  it("implements every rule type seeded in PATROL_RULES", () => {
    expect([...PATROL_RULE_TYPES.keys()].sort()).toEqual(PATROL_RULES.map((r) => r.ruleType).sort());
    expect(PATROL_RULE_TYPES.size).toBe(18);
    for (const r of PATROL_RULES) expect(PATROL_RULE_TYPES.get(r.ruleType)!.targetType).toBe(r.targetType);
  });

  it("covers red, amber and no-hit for every rule type", () => {
    for (const ruleType of PATROL_RULE_TYPES.keys()) {
      const mine = CASES.filter((c) => c[0] === ruleType);
      expect(mine.some((c) => c[3]?.light === "RED"), `${ruleType} red`).toBe(true);
      expect(mine.some((c) => c[3]?.light === "YELLOW"), `${ruleType} yellow`).toBe(true);
      expect(mine.some((c) => c[3] === null), `${ruleType} none`).toBe(true);
    }
  });

  it.each(CASES)("%s · %s", (ruleType, _label, facts, expected) => {
    const rule = PATROL_RULE_TYPES.get(ruleType)!;
    const params = paramsOf(ruleType);
    const result = rule.judge(candidate(facts), params, NOW);
    if (expected === null) {
      expect(result).toBeNull();
      return;
    }
    expect(result).not.toBeNull();
    expect(result!.light).toBe(expected.light);
    expect(result!.overdueDays).toBe(expected.overdueDays);
    expect(result!.severity).toBe(expected.severity ?? params.severity);
    expect(result!.assigneeId).toBe("user-1");
    expect(result!.message.en.length).toBeGreaterThan(0);
    if (expected.zh) expect(result!.message.zh).toBe(expected.zh);
    if (expected.contains) expect(result!.message.zh).toContain(expected.contains);
  });

  it("dwell lights never turn amber before a full day has passed", () => {
    expect(dwellLight(0, 1, 2)).toBeNull();
    expect(dwellLight(1, 1, 2)).toEqual({ light: "YELLOW", overdueDays: 0 });
    expect(dwellLight(5, 7, 0)).toBeNull();
  });
});

import { MODULES, PRESET_ROLES } from "@otd/shared";
import { HttpResponse, http, type HttpHandler } from "msw";

import { envelope, fail, pageOf } from "./util";

import type { PatrolDashboardDto, PatrolHitDto, PatrolRuleDto, PatrolRunDto, PatrolRuleUpdateInput } from "@otd/contracts/patrol";

type RuleSeed = [code: string, module: string, ruleType: string, name: string, nameEn: string, targetType: string, threshold: number, severity: "HIGH" | "MEDIUM" | "LOW", role: string, kind: "DWELL" | "DEADLINE" | "MISSING"];

const RULE_SEEDS: RuleSeed[] = [
  ["IR-001", "M03", "ROUND_STUCK_ISSUED", "打样轮次超期未出样", "Sample round not started", "sampleRound", 7, "HIGH", "R001", "DWELL"],
  ["IR-002", "M03", "ROUND_AWAITING_APPROVAL", "客户批复等待超期", "Customer approval overdue", "sampleRound", 5, "MEDIUM", "R001", "DWELL"],
  ["IR-003", "M06", "TEST_OVERDUE", "送测超期未出报告", "Test report overdue", "testRequest", 0, "HIGH", "R005", "DEADLINE"],
  ["IR-004", "M13", "PURCHASE_OVERDUE", "采购逾期未到货", "Purchase overdue", "purchase", 0, "HIGH", "R007", "DEADLINE"],
  ["IR-005", "M02", "PLANNING_RECOGNIZING_STUCK", "企划识别超时", "Brief recognition stuck", "planning", 1, "LOW", "R001", "DWELL"],
  ["IR-006", "M02", "PLANNING_UNCONFIRMED", "企划确认超期", "Brief not confirmed", "planning", 3, "MEDIUM", "R001", "DWELL"],
  ["IR-007", "M04", "QUOTE_NO_FEEDBACK", "报价超期未反馈", "Quote awaiting feedback", "quoteRound", 14, "MEDIUM", "R001", "DWELL"],
  ["IR-008", "M06", "REPORT_EXPIRING", "测试报告即将过期", "Test report expiring", "testReport", 30, "MEDIUM", "R005", "DEADLINE"],
  ["IR-009", "M09", "PO_REVIEW_OVERDUE", "PO 待复核超期", "PO review overdue", "order", 3, "HIGH", "R001", "DWELL"],
  ["IR-010", "M09", "FACTORY_REPLY_MISSING", "工厂交期回复缺失", "Factory reply missing", "order", 3, "MEDIUM", "R010", "DWELL"],
  ["IR-011", "M07", "PACKING_UNCONFIRMED_NEAR_INSPECTION", "包装方案未确认临近验货", "Packing unconfirmed near inspection", "packagingPlan", 7, "HIGH", "R001", "DEADLINE"],
  ["IR-012", "M10", "INSPECTION_PRECONDITION_MISSING", "验货前置条件缺失", "Inspection preconditions missing", "inspection", 3, "HIGH", "R005", "MISSING"],
  ["IR-013", "M10", "FRI_FAILED_NO_REWORK", "尾验不合格未复验", "Failed FRI not re-inspected", "inspection", 2, "HIGH", "R005", "DWELL"],
  ["IR-014", "M10", "INSPECTION_LATE_SCHEDULE", "验货排期晚于交期前 15 天", "Inspection scheduled too late", "inspection", 15, "MEDIUM", "R006", "DEADLINE"],
  ["IR-015", "M11", "ETD_PASSED_NOT_SAILED", "订舱船期已过未开船", "ETD passed, not sailed", "shipment", 0, "HIGH", "R008", "DEADLINE"],
  ["IR-016", "M11", "ARRIVED_NOT_SIGNED", "到港未签收超期", "Arrived, not signed", "shipment", 7, "MEDIUM", "R008", "DWELL"],
  ["IR-017", "M08", "LEDGER_OVERDUE", "台账更新逾期", "Ledger update overdue", "ledgerTask", 0, "MEDIUM", "R006", "DEADLINE"],
  ["IR-018", "M15", "HANDOVER_INCOMPLETE", "开发移交缺项", "Handover incomplete", "handover", 7, "MEDIUM", "R001", "DWELL"],
];

const moduleLabel = (code: string) => MODULES.find((m) => m.code === code)?.label ?? { zh: code, en: code };
const roleLabel = (code: string) => PRESET_ROLES.find((r) => r.code === code)?.label ?? null;
const condition = (threshold: number) => ({ zh: `超过阈值 ${threshold} 天`, en: `Beyond ${threshold} days` });

type HitSeed = [id: string, code: string, targetNo: string, targetName: string | null, light: "RED" | "YELLOW", severity: "HIGH" | "MEDIUM" | "LOW", overdue: number, zh: string, en: string, assignee: string, customer: string | null, link: string | null, status: "OPEN" | "HANDLING"];

const HIT_SEEDS: HitSeed[] = [
  ["h-1", "IR-004", "PUR-2610-002", "恒力化纤", "RED", "HIGH", 3, "承诺交期 2026-10-18 已过 3 天", "Promised date 2026-10-18 passed 3 days ago", "周涛", "极线", "/purchases/p-2", "OPEN"],
  ["h-2", "IR-001", "SP-2610-005", "#12610 颜色样 第 1 轮", "RED", "HIGH", 2, "轮次停留在『已下达』已 9 天（阈值 7 天）", 'Round has stayed in "Issued" for 9 days (threshold 7 days)', "刘洋", "极线", "/samples/s-5", "OPEN"],
  ["h-3", "IR-003", "TST-2610-004", "#11720", "RED", "HIGH", 15, "送测超期未出报告：要求 2026-10-06 出报告，已超 15 天", "Test report overdue: due 2026-10-06, 15 days late", "赵敏", "枫林户外", "/tests/t-4", "OPEN"],
  ["h-4", "IR-017", "V26", "刺绣等特殊工序产能表", "RED", "MEDIUM", 2, "台账「刺绣等特殊工序产能表」应于 2026-10-19 更新，已逾期 2 天", 'Ledger "Special process capacity" was due on 2026-10-19, 2 days overdue', "孙悦", null, "/capacity/tasks", "OPEN"],
  ["h-5", "IR-016", "SH-2609-002", "上海仓", "RED", "MEDIUM", 1, "已到港 8 天未签收（阈值 7 天）", "Arrived 8 days ago, not signed (threshold 7 days)", "吴昊", "蓝湾生活", "/shipments/sh-2", "OPEN"],
  ["h-6", "IR-002", "SP-2610-004", "#12603 PP 产前样 第 1 轮", "RED", "MEDIUM", 1, "等待客户批复已 6 天（阈值 5 天）", "Awaiting customer approval for 6 days (threshold 5 days)", "刘洋", "素野", "/samples/s-4", "HANDLING"],
  ["h-7", "IR-009", "PO0010459", "北岸运动 · 37,080 双", "YELLOW", "HIGH", 0, "PO 待复核已 3 天（阈值 3 天）", "PO awaiting review for 3 days (threshold 3 days)", "王芳", "北岸运动", "/orders/o-1", "OPEN"],
  ["h-8", "IR-008", "RPT-2511-001", "ITS-25-3307", "YELLOW", "MEDIUM", -20, "测试报告 ITS-25-3307 将于 2026-11-10 到期（剩余 20 天），在途 PO PO0009702 引用", "Report ITS-25-3307 expires on 2026-11-10 (20 days left); used by open PO PO0009702", "赵敏", "云栖童装", "/tests/reports/r-1", "OPEN"],
];

function buildRules(): PatrolRuleDto[] {
  return RULE_SEEDS.map(([code, module, ruleType, name, nameEn, targetType, threshold, severity, role, kind], i) => ({
    id: `rule-${i + 1}`,
    code,
    module,
    moduleLabel: moduleLabel(module),
    ruleType,
    kind,
    name,
    nameEn,
    targetType,
    params: { thresholdDays: threshold },
    paramKeys: ["thresholdDays"],
    condition: condition(threshold),
    severity,
    assigneeRole: role,
    assigneeRoleLabel: roleLabel(role),
    yellowWindowDays: 2,
    enabled: true,
    customerIds: null,
    customerNames: [],
    description: null,
    openHits: 0,
    updatedAt: "2026-10-21T01:00:00.000Z",
    version: 1,
  }));
}

function buildHits(rules: PatrolRuleDto[]): PatrolHitDto[] {
  return HIT_SEEDS.map(([id, code, targetNo, targetName, light, severity, overdue, zh, en, assignee, customer, link, status]) => {
    const rule = rules.find((r) => r.code === code)!;
    return {
      id,
      ruleId: rule.id,
      ruleCode: code,
      ruleName: { zh: rule.name, en: rule.nameEn ?? rule.name },
      ruleType: rule.ruleType,
      module: rule.module,
      moduleLabel: rule.moduleLabel,
      targetType: rule.targetType,
      targetId: `${id}-target`,
      targetNo,
      targetName,
      docType: rule.targetType,
      docId: `${id}-doc`,
      link,
      light,
      severity,
      message: { zh, en },
      overdueDays: overdue,
      assigneeId: `u-${assignee}`,
      assigneeName: assignee,
      assigneeRole: rule.assigneeRole,
      assigneeRoleLabel: rule.assigneeRoleLabel,
      customerId: customer ? `c-${customer}` : null,
      customerName: customer,
      status,
      closeReason: null,
      handleNote: null,
      handledByName: status === "HANDLING" ? assignee : null,
      handledAt: status === "HANDLING" ? "2026-10-21T02:00:00.000Z" : null,
      todoId: `todo-${id}`,
      todoOwned: code !== "IR-009",
      firstSeenAt: "2026-10-21T00:54:00.000Z",
      lastSeenAt: "2026-10-21T00:54:00.000Z",
      closedAt: null,
      escalatedAt: null,
      version: 1,
    };
  });
}

function runOf(seq: number, trigger: "AUTO" | "MANUAL", hits: PatrolHitDto[], at: string): PatrolRunDto {
  const open = hits.filter((h) => h.status !== "CLOSED");
  const red = open.filter((h) => h.light === "RED").length;
  return {
    id: `run-${seq}`,
    docNo: `PT-${String(seq).padStart(4, "0")}`,
    trigger,
    status: "DONE",
    startedAt: at,
    finishedAt: at,
    durationMs: trigger === "AUTO" ? 289 : 274,
    ruleCount: 18,
    hitCount: open.length,
    redCount: red,
    yellowCount: open.length - red,
    scannedModules: ["M02", "M03", "M04", "M06", "M07", "M08", "M09", "M10", "M11", "M13", "M15"],
    greenModules: ["M04", "M07"],
    ruleStats: {},
    triggeredBy: trigger === "MANUAL" ? "u-admin" : null,
    triggeredByName: trigger === "MANUAL" ? "管理员" : null,
    error: null,
  };
}

const state = { rules: [] as PatrolRuleDto[], hits: [] as PatrolHitDto[], runs: [] as PatrolRunDto[] };

export function resetPatrolMock(): void {
  state.rules = buildRules();
  state.hits = buildHits(state.rules);
  state.runs = [runOf(1, "AUTO", state.hits, "2026-10-21T00:54:00.000Z")];
}
resetPatrolMock();

function rulesWithCounts(): PatrolRuleDto[] {
  return state.rules.map((r) => ({ ...r, openHits: state.hits.filter((h) => h.ruleId === r.id && h.status !== "CLOSED").length }));
}

function dashboard(url: URL): PatrolDashboardDto {
  const list = (key: string) => url.searchParams.get(key)?.split(",").filter(Boolean) ?? [];
  const statuses = list("status").length ? list("status") : ["OPEN", "HANDLING"];
  const filtered = state.hits.filter(
    (h) =>
      statuses.includes(h.status) &&
      (!list("module").length || list("module").includes(h.module)) &&
      (!list("light").length || list("light").includes(h.light)) &&
      (!list("severity").length || list("severity").includes(h.severity)),
  );
  const open = state.hits.filter((h) => h.status !== "CLOSED");
  const last = state.runs[0] ?? null;
  const enabled = state.rules.filter((r) => r.enabled);
  return {
    legend: { red: open.filter((h) => h.light === "RED").length, yellow: open.filter((h) => h.light === "YELLOW").length, greenModules: last?.greenModules.length ?? 0, scannedModules: last?.scannedModules.length ?? 0, greenModuleCodes: last?.greenModules ?? [] },
    kpis: { activeRules: enabled.length, totalRules: state.rules.length, coveredModules: new Set(enabled.map((r) => r.module)).size, hitCount: last?.hitCount ?? 0, lastRunAt: last?.startedAt ?? null },
    lastRun: last,
    previousRun: state.runs[1] ?? null,
    running: null,
    modules: [...new Set(state.rules.map((r) => r.module))].sort().map((code) => ({ code, label: moduleLabel(code), open: open.filter((h) => h.module === code).length })),
    hits: pageOf(filtered, url),
  };
}

export const patrolHandlers: HttpHandler[] = [
  http.get("*/patrol/dashboard", ({ request }) => HttpResponse.json(envelope(dashboard(new URL(request.url))))),
  http.get("*/patrol/hits/:id", ({ params }) => {
    const hit = state.hits.find((h) => h.id === params.id);
    return hit ? HttpResponse.json(envelope(hit)) : fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
  }),
  http.post("*/patrol/hits/:id/handle", async ({ params, request }) => {
    const body = (await request.json()) as { action: "START" | "CLOSE"; note?: string; version: number };
    const hit = state.hits.find((h) => h.id === params.id);
    if (!hit) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    if (body.action === "START" && hit.status !== "OPEN") return fail("FLOW_ILLEGAL_TRANSITION", "当前状态不允许执行该操作", 409);
    if (body.action === "CLOSE" && hit.status === "CLOSED") return fail("FLOW_ILLEGAL_TRANSITION", "当前状态不允许执行该操作", 409);
    if (body.action === "CLOSE" && !body.note?.trim()) return fail("PATROL_NOTE_REQUIRED", "关闭命中须填写处理说明", 422);
    if (hit.version !== body.version) return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    Object.assign(hit, body.action === "START" ? { status: "HANDLING", handledByName: "管理员" } : { status: "CLOSED", closeReason: "MANUAL", handleNote: body.note, closedAt: "2026-10-21T03:00:00.000Z" }, { version: hit.version + 1 });
    return HttpResponse.json(envelope(hit));
  }),
  http.post("*/patrol/run", () => {
    const run = runOf(state.runs.length + 1, "MANUAL", state.hits, "2026-10-21T03:10:00.000Z");
    state.runs.unshift(run);
    return HttpResponse.json(envelope({ ...run, alreadyRunning: false }));
  }),
  http.get("*/patrol/rules", () => HttpResponse.json(envelope(rulesWithCounts()))),
  http.put("*/patrol/rules/:id", async ({ params, request }) => {
    const body = (await request.json()) as PatrolRuleUpdateInput;
    const rule = state.rules.find((r) => r.id === params.id);
    if (!rule) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    if (rule.version !== body.version) return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    if (body.params) rule.params = { ...rule.params, ...body.params };
    if (body.severity) rule.severity = body.severity;
    if (body.yellowWindowDays !== undefined) rule.yellowWindowDays = body.yellowWindowDays;
    if (body.enabled !== undefined) rule.enabled = body.enabled;
    rule.condition = condition(rule.params.thresholdDays ?? 0);
    rule.version += 1;
    return HttpResponse.json(envelope(rulesWithCounts().find((r) => r.id === rule.id)));
  }),
  http.get("*/patrol/runs", ({ request }) => {
    const url = new URL(request.url);
    const trigger = url.searchParams.get("trigger");
    return HttpResponse.json(envelope(pageOf(trigger ? state.runs.filter((r) => r.trigger === trigger) : state.runs, url)));
  }),
  http.get("*/patrol/runs/:id", ({ params }) => {
    const run = state.runs.find((r) => r.id === params.id);
    return run ? HttpResponse.json(envelope(run)) : fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
  }),
];

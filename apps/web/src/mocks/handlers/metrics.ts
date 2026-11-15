import { BOARD_TABS, BOARD_TITLES, METRIC_DEFINITIONS, type BoardDto, type BoardKey, type ChartDto, type DiagnosisDto, type KpiDto, type MetricUnit, type TableDto } from "@otd/contracts/metrics";
import { HttpResponse, http, type HttpHandler } from "msw";

import { envelope, fail } from "./util";

const L = (zh: string, en: string) => ({ zh, en });

function kpi(key: string, value: number | null, unit: MetricUnit, sub: [string, string], extra: Partial<KpiDto> = {}): KpiDto {
  const name = METRIC_DEFINITIONS.find((d) => d.key === key)?.name ?? L(key, key);
  const display = value === null ? "—" : unit === "percent" ? `${value.toFixed(1)}%` : unit === "count" ? String(value) : value.toFixed(1);
  return { key, label: name, value, unit, display, sub: L(sub[0], sub[1]), numerator: null, denominator: null, tone: null, ...extra };
}

const PERIOD_LABEL: Record<string, { code: string; start: string; end: string; label: { zh: string; en: string } }> = {
  month: { code: "2026-10", start: "2026-10-01", end: "2026-10-31", label: L("2026 年 10 月", "2026-10") },
  quarter: { code: "2026-Q4", start: "2026-10-01", end: "2026-12-31", label: L("2026 年第 4 季度", "Q4 2026") },
  year: { code: "2026", start: "2026-01-01", end: "2026-12-31", label: L("2026 年", "2026") },
};

const CATEGORY_DATA = [
  ["REQUIREMENT", "需求确认", "Requirements", 1, 0],
  ["SAMPLE", "样品开发", "Sampling", 2, 1],
  ["QUOTE", "成本报价", "Costing", 1, 1],
  ["PO_REVIEW", "订单复核", "PO review", 2, 0],
  ["MATERIAL", "物料保障", "Materials", 0, 0],
  ["PRODUCTION", "生产跟进", "Production", 2, 0],
  ["QUALITY", "质量放行", "Quality", 0, 0],
  ["SHIPPING", "出货单证", "Shipping docs", 0, 0],
  ["COLLECTION", "回款跟进", "Collection", 0, 0],
] as const;

function salesBoard(): Pick<BoardDto, "kpis" | "charts"> & { tables: Record<string, TableDto> } {
  const charts: ChartDto[] = [
    { key: "tasksByCategory", title: L("各类任务应完成数量", "Tasks due by type"), kind: "bar", unit: "count", series: [{ key: "due", label: L("应完成", "Due") }, { key: "done", label: L("已完成", "Done") }], data: CATEGORY_DATA.map(([key, label, labelEn, due, done]) => ({ key, label, labelEn, due, done })) },
    { key: "overdueByCategory", title: L("各类任务到期未完成", "Overdue by type"), kind: "donut", unit: "count", series: [{ key: "value", label: L("到期未完成", "Overdue") }], data: [{ key: "PO_REVIEW", label: "订单复核", labelEn: "PO review", value: 1 }, { key: "QUOTE", label: "成本报价", labelEn: "Costing", value: 1 }] },
  ];
  return {
    kpis: [
      kpi("dueTasks", 8, "count", ["截止日在所选期间内", "Due in the period"]),
      kpi("completionRate", 25, "percent", ["2 项已完成 / 8 项到期", "2 done / 8 due"], { numerator: 2, denominator: 8, tone: "success" }),
      kpi("onTimeRate", 12.5, "percent", ["1 项按时 / 8 项到期", "1 on time / 8 due"], { numerator: 1, denominator: 8 }),
      kpi("overdueOpen", 2, "count", ["截至 2026-10-21 仍未完成", "Open at 2026-10-21"], { tone: "danger" }),
      kpi("avgCycleDays", 3, "days", ["3 项完成 · 创建至完成按自然日", "3 completed · created → done"], { numerator: 3 }),
      kpi("reworkRate", 33.3, "percent", ["1 项返工 / 3 项完成", "1 rework / 3 completed"], { numerator: 1, denominator: 3, tone: "warning" }),
    ],
    charts,
    tables: {
      work: { key: "work", title: BOARD_TABS.sales[0]!.label, columns: [{ key: "category", label: L("类别", "Type") }, { key: "due", label: L("应完成", "Due"), unit: "count" }, { key: "done", label: L("已完成", "Done"), unit: "count" }, { key: "overdue", label: L("到期未完成", "Overdue"), unit: "count" }, { key: "completionRate", label: L("完成率", "Rate"), unit: "percent" }], rows: CATEGORY_DATA.filter((c) => c[3] > 0).map(([key, label, , due, done]) => ({ key, category: label, due, done, overdue: key === "PO_REVIEW" || key === "QUOTE" ? 1 : 0, completionRate: due ? Math.round((done / due) * 1000) / 10 : null })) },
      progress: { key: "progress", title: BOARD_TABS.sales[1]!.label, columns: [{ key: "module", label: L("模块", "Module") }, { key: "stage", label: L("阶段", "Stage") }, { key: "count", label: L("数量", "Count"), unit: "count" }, { key: "red", label: L("红灯巡检", "Red hits"), unit: "count" }], rows: [{ key: "planning.extracted", module: "企划管理", stage: "待确认", count: 1, red: null }, { key: "order.pending", module: "订单管理", stage: "待确认", count: 1, red: 0 }, { key: "order.production", module: "订单管理", stage: "生产中", count: 1, red: null }] },
      contribution: { key: "contribution", title: BOARD_TABS.sales[2]!.label, columns: [{ key: "customer", label: L("客户", "Customer") }, { key: "confirmedOrders", label: L("确认订单（张）", "Confirmed POs"), unit: "count" }, { key: "confirmedPairs", label: L("确认双数", "Confirmed pairs"), unit: "count" }, { key: "activeOrders", label: L("在手订单", "Open POs"), unit: "count" }], rows: [{ key: "c-nsr", customer: "北岸运动", confirmedOrders: 0, confirmedPairs: 0, activeOrders: 1 }, { key: "c-mrn", customer: "晨跑者", confirmedOrders: 1, confirmedPairs: 12600, activeOrders: 1 }] },
    },
  };
}

const HEALTH_ROWS = [
  { key: "c-mrn", customer: "晨跑者", level: "高风险", levelCode: "HIGH_RISK", activeOrders: 1, overdueOrders: 0, riskWan: 18.2, qualityIssues: 1, overdueArWan: 52.2, reasons: "逾期应收 52.2 万元" },
  { key: "c-plf", customer: "素野", level: "高风险", levelCode: "HIGH_RISK", activeOrders: 0, overdueOrders: 0, riskWan: 0, qualityIssues: 0, overdueArWan: 48.9, reasons: "逾期应收 48.9 万元" },
  { key: "c-apx", customer: "极线", level: "高风险", levelCode: "HIGH_RISK", activeOrders: 1, overdueOrders: 0, riskWan: 7.6, qualityIssues: 0, overdueArWan: 41.3, reasons: "逾期应收 41.3 万元" },
  { key: "c-mpt", customer: "枫林户外", level: "高风险", levelCode: "HIGH_RISK", activeOrders: 1, overdueOrders: 0, riskWan: 5.6, qualityIssues: 0, overdueArWan: 22.4, reasons: "逾期应收 22.4 万元" },
  { key: "c-bby", customer: "蓝湾生活", level: "关注", levelCode: "WATCH", activeOrders: 1, overdueOrders: 0, riskWan: 7.9, qualityIssues: 0, overdueArWan: 0, reasons: "14 天内到期的风险订单 1 张" },
  { key: "c-nsr", customer: "北岸运动", level: "稳定", levelCode: "STABLE", activeOrders: 1, overdueOrders: 0, riskWan: 24.4, qualityIssues: 0, overdueArWan: 0, reasons: "—" },
];

function managerBoard(): Pick<BoardDto, "kpis" | "charts"> & { tables: Record<string, TableDto> } {
  return {
    kpis: [
      kpi("deptCustomers", 6, "count", ["当前范围内负责的客户", "Customers in scope"]),
      kpi("highRiskCustomers", 4, "count", ["逾期订单 ≥ 2 / 质量问题 ≥ 3 / 逾期应收 ≥ 20 万元", "By high-risk rules"], { tone: "danger" }),
      kpi("watchCustomers", 1, "count", ["临近交期风险或待客户反馈", "Near-due risk or awaiting feedback"], { tone: "warning" }),
      kpi("overdueArWan", 164.8, "wan", ["6 笔 · 截至 2026-10-21", "6 items · at 2026-10-21"], { numerator: 6, tone: "danger" }),
      kpi("aged30ArWan", 51.8, "wan", ["1 笔逾期超 30 天", "1 item > 30 days"], { numerator: 1, tone: "warning" }),
      kpi("dueDateChangeRate", 0, "percent", ["0 张变更 / 1 张确认", "0 changed / 1 confirmed"], { numerator: 0, denominator: 1 }),
    ],
    charts: [
      { key: "riskByCustomer", title: L("客户在手风险订单金额（万元）", "At-risk open orders by customer (¥10k)"), kind: "barH", unit: "wan", series: [{ key: "value", label: L("风险订单金额", "At-risk amount") }], data: HEALTH_ROWS.filter((r) => r.riskWan > 0).sort((a, b) => b.riskWan - a.riskWan).map((r) => ({ key: r.key, label: r.customer, value: r.riskWan })) },
      { key: "issuesByCustomer", title: L("客户未关闭异常", "Open issues by customer"), kind: "stacked", unit: "count", series: [{ key: "red", label: L("红灯巡检", "Red hits") }, { key: "yellow", label: L("黄灯巡检", "Amber hits") }, { key: "quality", label: L("质量问题", "Quality issues") }], data: [{ key: "c-mrn", label: "晨跑者", red: 2, yellow: 0, quality: 1 }, { key: "c-apx", label: "极线", red: 3, yellow: 0, quality: 0 }, { key: "c-nsr", label: "北岸运动", red: 0, yellow: 1, quality: 0 }] },
    ],
    tables: {
      health: { key: "health", title: BOARD_TABS.manager[0]!.label, columns: [{ key: "customer", label: L("客户", "Customer") }, { key: "level", label: L("健康度", "Health") }, { key: "activeOrders", label: L("在手订单", "Open POs"), unit: "count" }, { key: "riskWan", label: L("风险订单金额（万元）", "At-risk (¥10k)"), unit: "wan" }, { key: "overdueArWan", label: L("逾期应收（万元）", "Overdue AR (¥10k)"), unit: "wan" }, { key: "reasons", label: L("依据", "Basis") }], rows: HEALTH_ROWS },
      team: { key: "team", title: BOARD_TABS.manager[1]!.label, columns: [{ key: "user", label: L("成员", "Member") }, { key: "openTasks", label: L("未完成任务", "Open tasks"), unit: "count" }, { key: "overdueOpen", label: L("到期未完成", "Overdue"), unit: "count" }, { key: "completionRate", label: L("完成率", "Completion"), unit: "percent" }], rows: [{ key: "u-1", user: "王芳", openTasks: 5, overdueOpen: 1, completionRate: 0 }, { key: "u-4", user: "张伟", openTasks: 3, overdueOpen: 1, completionRate: 0 }] },
      contribution: { key: "contribution", title: BOARD_TABS.manager[2]!.label, columns: [{ key: "customer", label: L("客户", "Customer") }, { key: "confirmedWan", label: L("确认订单额（万元）", "Confirmed (¥10k)"), unit: "wan" }, { key: "share", label: L("占比", "Share"), unit: "percent" }], rows: [{ key: "c-apx", customer: "极线", confirmedWan: 7.6, share: 100 }] },
      bottleneck: { key: "bottleneck", title: BOARD_TABS.manager[3]!.label, columns: [{ key: "module", label: L("模块", "Module") }, { key: "rule", label: L("卡点（巡检规则）", "Bottleneck (rule)") }, { key: "red", label: L("红灯", "Red"), unit: "count" }, { key: "yellow", label: L("黄灯", "Amber"), unit: "count" }], rows: [{ key: "IR-012", moduleCode: "M10", module: "验货管理", rule: "IR-012 验货前置条件缺失", red: 2, yellow: 0 }, { key: "IR-001", moduleCode: "M03", module: "样品管理", rule: "IR-001 打样轮次超期未出样", red: 1, yellow: 0 }] },
    },
  };
}

function gmBoard(): Pick<BoardDto, "kpis" | "charts"> & { tables: Record<string, TableDto> } {
  const weeks = ["08-31", "09-07", "09-14", "09-21", "09-28", "10-05", "10-12", "10-19"];
  const confirmed = [18.4, 9.8, 24.1, 15.3, 21.7, 11.2, 19.5, 0];
  const onTime = [58.3, 66.7, 71.4, 60, 75, 68.8, 72.7, null];
  return {
    kpis: [
      kpi("confirmedAmountWan", 7.6, "wan", ["目标达成 63.3%", "63.3% of target"], { numerator: 7.6, denominator: 12, tone: "primary" }),
      kpi("deliveredAmountWan", 7.9, "wan", ["毛利率 18.7%", "Margin 18.7%"]),
      kpi("receivedAmountWan", 239, "wan", ["逾期应收 197.6 · 回款率 3032.7%", "Overdue 197.6 · collected 3032.7%"], { tone: "warning" }),
      kpi("onTimeDeliveryRate", 100, "percent", ["1 张按时 / 1 张应交付", "1 on time / 1 due"], { numerator: 1, denominator: 1, tone: "success" }),
      kpi("riskAmountWan", 72.8, "wan", ["7 张风险订单", "7 at-risk POs"], { numerator: 7, tone: "danger" }),
      kpi("fulfillmentIndex", 68.8, "percent", ["订舱 0.0 · 验货 100.0 · 齐料 75.0 · 交付 100.0", "Booking 0.0 · first pass 100.0 · materials 75.0 · on time 100.0"], { tone: "primary" }),
    ],
    charts: [
      { key: "confirmedByCustomer", title: L("客户确认订单额（万元）", "Confirmed by customer (¥10k)"), kind: "barH", unit: "wan", series: [{ key: "value", label: L("确认订单额", "Confirmed") }], data: [{ key: "c-apx", label: "极线", value: 7.6 }] },
      { key: "confirmTrend", title: L("周期内订单确认趋势（万元 / 周）", "Weekly confirmations (¥10k)"), kind: "combo", unit: "wan", series: [{ key: "confirmedWan", label: L("确认订单额", "Confirmed"), unit: "wan" }, { key: "onTimeRate", label: L("准时交付率", "On-time rate"), unit: "percent" }], data: weeks.map((label, i) => ({ key: `2026-${label}`, label, confirmedWan: confirmed[i]!, onTimeRate: onTime[i] ?? null, source: i === weeks.length - 1 ? "LIVE" : "SNAPSHOT" })) },
    ],
    tables: {
      overview: { key: "overview", title: BOARD_TABS.gm[0]!.label, columns: [{ key: "metric", label: L("指标", "Metric") }, { key: "current", label: L("本期", "This period") }, { key: "previous", label: L("上期", "Previous") }, { key: "change", label: L("变化", "Change") }], rows: [{ key: "confirmedAmountWan", metric: "确认订单额（万元）", unit: "wan", current: 7.6, previous: 39.7, change: -32.1 }, { key: "onTimeDeliveryRate", metric: "准时交付率", unit: "percent", current: 100, previous: null, change: null }] },
      dept: { key: "dept", title: BOARD_TABS.gm[1]!.label, columns: [{ key: "dept", label: L("部门", "Department") }, { key: "confirmedWan", label: L("确认订单额（万元）", "Confirmed (¥10k)"), unit: "wan" }, { key: "overdueArWan", label: L("逾期应收（万元）", "Overdue AR (¥10k)"), unit: "wan" }], rows: [{ key: "o-3", dept: "业务一部", confirmedWan: 0, overdueArWan: 74.6 }, { key: "o-4", dept: "业务二部", confirmedWan: 7.6, overdueArWan: 90.1 }, { key: "o-6", dept: "业务三部", confirmedWan: 0, overdueArWan: 32.8 }] },
      customer: { key: "customer", title: BOARD_TABS.gm[2]!.label, columns: [{ key: "customer", label: L("客户", "Customer") }, { key: "confirmedWan", label: L("确认订单额（万元）", "Confirmed (¥10k)"), unit: "wan" }, { key: "level", label: L("健康度", "Health") }], rows: [{ key: "c-apx", customer: "极线", confirmedWan: 7.6, level: "高风险", levelCode: "HIGH_RISK" }] },
      employee: { key: "employee", title: BOARD_TABS.gm[3]!.label, columns: [{ key: "user", label: L("员工", "Employee") }, { key: "confirmedWan", label: L("确认订单额（万元）", "Confirmed (¥10k)"), unit: "wan" }, { key: "activeOrders", label: L("在手订单", "Open POs"), unit: "count" }], rows: [{ key: "u-5", user: "刘洋", confirmedWan: 7.6, activeOrders: 1 }] },
    },
  };
}

const BUILDERS: Record<BoardKey, () => Pick<BoardDto, "kpis" | "charts"> & { tables: Record<string, TableDto> }> = { sales: salesBoard, manager: managerBoard, gm: gmBoard };

export function mockBoard(board: BoardKey, url: URL): BoardDto {
  const built = BUILDERS[board]();
  const tabs = BOARD_TABS[board];
  const tab = url.searchParams.get("tab") ?? tabs[0]!.key;
  const period = PERIOD_LABEL[url.searchParams.get("period") ?? "month"] ?? PERIOD_LABEL.month!;
  const first = tab === tabs[0]!.key;
  return {
    board,
    title: BOARD_TITLES[board],
    tabs,
    tab,
    period: { key: (url.searchParams.get("period") ?? "month") as BoardDto["period"]["key"], ...period },
    asOf: "2026-10-21",
    scope: { key: board === "gm" ? "ALL" : `${board}:mock`, label: L(`${period.label.zh} · ${board === "gm" ? "全部组织" : board === "manager" ? "棉袜事业部" : "业务一部"} · ${board === "gm" ? "企业范围" : board === "manager" ? "本组织及下级" : "个人范围"}`, `${period.label.en} · ${board === "gm" ? "Company" : board === "manager" ? "Own org & below" : "Personal"}`), dataScope: board === "gm" ? "ALL" : board === "manager" ? "ORG_AND_CHILDREN" : "SELF", orgId: url.searchParams.get("orgId"), customerId: url.searchParams.get("customerId") },
    kpis: built.kpis,
    charts: first ? built.charts : [],
    table: built.tables[tab] ?? null,
  };
}

const DIAGNOSIS_ITEMS: Record<BoardKey, DiagnosisDto["items"]> = {
  sales: [
    { no: 1, level: "PRIORITY", title: "到期未完成 2 项，集中在「订单复核」1 项", basis: "本期应完成任务 8 项，截至数据截点仍有 2 项未完成", suggestion: "先清到期未完成，今日内逐项给出完成时间承诺", signalKey: "sales.overdueTasks", numbers: { overdue: 2, topCategory: "订单复核", topCount: 1, due: 8 } },
    { no: 2, level: "WATCH", title: "任务完成率 25.0%（2 / 8）", basis: "低于 80% 的目标线", suggestion: "按截止日排序处理，并在承诺日前设内部提醒", signalKey: "sales.completionLow", numbers: { rate: "25.0", done: 2, due: 8, target: 80 } },
    { no: 3, level: "WATCH", title: "返工率 33.3%（1 / 3）", basis: "超过 10% 的关注线", suggestion: "按环节复盘首次提交质量，减少改样与重复提交", signalKey: "sales.reworkHigh", numbers: { rate: "33.3", rework: 1, completed: 3, threshold: 10 } },
  ],
  manager: [
    { no: 1, level: "PRIORITY", title: "逾期应收 164.8 万元（6 笔），其中账龄超 30 天 51.8 万元", basis: "截至数据截点已逾期未收的金额，按月度汇率折人民币", suggestion: "纳入部门周度清收清单，按账龄倒序处理", signalKey: "manager.overdueAr", numbers: { overdueWan: "164.8", count: 6, agedDays: 30, aged30Wan: "51.8" } },
    { no: 2, level: "PRIORITY", title: "晨跑者：逾期应收 52.2 万元", basis: "满足高风险规则（逾期订单 ≥ 2 张 / 质量问题 ≥ 3 个 / 逾期应收 ≥ 20 万元）", suggestion: "本周内对齐交期并同步客户，按账龄倒序跟进回款", signalKey: "manager.highRisk", numbers: { customer: "晨跑者", overdueOrders: 0, quality: 1, arWan: "52.2", t1: 2, t2: 3, t3: 20 } },
    { no: 3, level: "WATCH", title: "关注客户 1 个，如蓝湾生活", basis: "有临近交期的风险订单或待客户反馈事项超期", suggestion: "提前与客户确认物料与交期，避免转为高风险", signalKey: "manager.watchCustomers", numbers: { count: 1, customer: "蓝湾生活" } },
  ],
  gm: [
    { no: 1, level: "PRIORITY", title: "逾期应收 197.6 万元，其中账龄超 30 天 56.1 万元", basis: "截至数据截点已逾期未收的金额，按月度汇率折人民币", suggestion: "按账龄倒序清收，账龄长的由业务经理牵头", signalKey: "gm.overdueAr", numbers: { overdueWan: "197.6", agedDays: 30, aged30Wan: "56.1" } },
    { no: 2, level: "PRIORITY", title: "在手风险 7 张、72.8 万元", basis: "其中有红灯巡检 5 张、节点受阻 7 张", suggestion: "逐单确认物料与产能后重定交期，并同步客户", signalKey: "gm.risk", numbers: { count: 7, wan: "72.8", red: 5, blocked: 7 } },
    { no: 3, level: "WATCH", title: "全链路履约：订舱及时率 0.0%、验货一次通过率 100.0%、齐料率 75.0%，综合履约指数 68.8%", basis: "综合履约指数低于 80%", suggestion: "把验货标准前置到生产首件，并与采购对齐备料计划", signalKey: "gm.fulfillment", numbers: { booking: "0.0", firstPass: "100.0", material: "75.0", index: "68.8", target: 80 } },
  ],
};

const DIAG_TITLES: Record<BoardKey, string> = { sales: "本期任务分析", manager: "本期客户分析", gm: "本期经营分析" };

export function mockDiagnosis(board: BoardKey, cached: boolean): DiagnosisDto {
  const items = DIAGNOSIS_ITEMS[board];
  return {
    board,
    scopeKey: board === "gm" ? "ALL" : `${board}:mock`,
    period: "2026-10",
    title: DIAG_TITLES[board],
    scopeLabel: board === "gm" ? "2026 年 10 月 · 全部组织 · 企业范围" : "2026 年 10 月 · 业务一部 · 个人范围",
    asOf: "2026-10-21",
    summary: `共 ${items.length} 条结论，其中 ${items.filter((i) => i.level === "PRIORITY").length} 条需优先处理`,
    items,
    signals: items.map((i) => ({ key: i.signalKey, level: i.level, impact: 1, numbers: i.numbers })),
    model: null,
    generatedAt: cached ? "2026-10-21T01:00:00.000Z" : "2026-10-21T03:20:00.000Z",
    cached,
  };
}

const isBoard = (value: unknown): value is BoardKey => value === "sales" || value === "manager" || value === "gm";

export const metricsHandlers: HttpHandler[] = [
  http.get("*/metrics/definitions", () => HttpResponse.json(envelope(METRIC_DEFINITIONS))),
  http.get("*/metrics/boards/:board/diagnosis", ({ params }) => (isBoard(params.board) ? HttpResponse.json(envelope(mockDiagnosis(params.board, true))) : fail("COMMON_VALIDATION_FAILED", "请求参数校验失败", 422))),
  http.post("*/metrics/boards/:board/diagnosis/refresh", ({ params }) => (isBoard(params.board) ? HttpResponse.json(envelope(mockDiagnosis(params.board, false))) : fail("COMMON_VALIDATION_FAILED", "请求参数校验失败", 422))),
  http.get("*/metrics/boards/:board", ({ params, request }) => (isBoard(params.board) ? HttpResponse.json(envelope(mockBoard(params.board, new URL(request.url)))) : fail("COMMON_VALIDATION_FAILED", "请求参数校验失败", 422))),
];

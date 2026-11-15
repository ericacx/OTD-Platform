import { z } from "zod";
import { labelSchema } from "./common.js";
import { defineErrors } from "./errors.js";

export const metricsErrors = defineErrors({
  METRICS_TAB_UNKNOWN: { status: 422, zh: "看板没有页签「{tab}」", en: "Unknown tab {tab}" },
  METRICS_ORG_UNKNOWN: { status: 422, zh: "组织不存在", en: "Unknown organization" },
});

export const boardKeySchema = z.enum(["sales", "manager", "gm"]);
export type BoardKey = z.infer<typeof boardKeySchema>;
export const periodKeySchema = z.enum(["month", "quarter", "year"]);
export type PeriodKey = z.infer<typeof periodKeySchema>;
export const metricUnitSchema = z.enum(["count", "percent", "wan", "days"]);
export type MetricUnit = z.infer<typeof metricUnitSchema>;

export const boardQuerySchema = z.object({
  period: periodKeySchema.default("month"),
  orgId: z.uuid().optional(),
  customerId: z.uuid().optional(),
  tab: z.string().trim().max(40).optional(),
});
export type BoardQuery = z.infer<typeof boardQuerySchema>;

export const BOARD_TABS: Record<BoardKey, { key: string; label: { zh: string; en: string } }[]> = {
  sales: [
    { key: "work", label: { zh: "我的工作完成统计", en: "My task completion" } },
    { key: "progress", label: { zh: "我的业务进展统计", en: "My business progress" } },
    { key: "contribution", label: { zh: "我的业绩与贡献统计", en: "My performance" } },
  ],
  manager: [
    { key: "health", label: { zh: "部门客户健康度表", en: "Customer health" } },
    { key: "team", label: { zh: "团队负荷与人效表", en: "Team load" } },
    { key: "contribution", label: { zh: "客户贡献分析表", en: "Customer contribution" } },
    { key: "bottleneck", label: { zh: "流程卡点与异常统计表", en: "Bottlenecks" } },
  ],
  gm: [
    { key: "overview", label: { zh: "企业经营总览表", en: "Business overview" } },
    { key: "dept", label: { zh: "部门经营对比表", en: "Departments" } },
    { key: "customer", label: { zh: "客户经营分析表", en: "Customers" } },
    { key: "employee", label: { zh: "员工贡献与人才表现表", en: "People" } },
  ],
};

export const BOARD_TITLES: Record<BoardKey, { zh: string; en: string }> = {
  sales: { zh: "业务看板", en: "Sales board" },
  manager: { zh: "经理看板", en: "Manager board" },
  gm: { zh: "总经理看板", en: "GM board" },
};

export const kpiSchema = z.object({
  key: z.string(),
  label: labelSchema,
  value: z.number().nullable(),
  unit: metricUnitSchema,
  display: z.string(),
  sub: labelSchema,
  numerator: z.number().nullable(),
  denominator: z.number().nullable(),
  tone: z.enum(["primary", "success", "warning", "danger"]).nullable(),
});
export type KpiDto = z.infer<typeof kpiSchema>;

export const chartSchema = z.object({
  key: z.string(),
  title: labelSchema,
  kind: z.enum(["bar", "barH", "donut", "line", "stacked", "combo"]),
  unit: metricUnitSchema,
  series: z.array(z.object({ key: z.string(), label: labelSchema, unit: metricUnitSchema.optional() })),
  data: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
});
export type ChartDto = z.infer<typeof chartSchema>;

export const tableSchema = z.object({
  key: z.string(),
  title: labelSchema,
  columns: z.array(z.object({ key: z.string(), label: labelSchema, unit: metricUnitSchema.optional() })),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
});
export type TableDto = z.infer<typeof tableSchema>;

export const periodSchema = z.object({ key: periodKeySchema, code: z.string(), start: z.string(), end: z.string(), label: labelSchema });
export type PeriodDto = z.infer<typeof periodSchema>;

export const boardSchema = z.object({
  board: boardKeySchema,
  title: labelSchema,
  tabs: z.array(z.object({ key: z.string(), label: labelSchema })),
  tab: z.string(),
  period: periodSchema,
  asOf: z.string(),
  scope: z.object({ key: z.string(), label: labelSchema, dataScope: z.enum(["SELF", "ORG", "ORG_AND_CHILDREN", "ALL"]), orgId: z.string().nullable(), customerId: z.string().nullable() }),
  kpis: z.array(kpiSchema),
  charts: z.array(chartSchema),
  table: tableSchema.nullable(),
});
export type BoardDto = z.infer<typeof boardSchema>;

export const diagnosisLevelSchema = z.enum(["PRIORITY", "WATCH"]);
export const diagnosisItemSchema = z.object({
  no: z.number().int(),
  level: diagnosisLevelSchema,
  title: z.string(),
  basis: z.string(),
  suggestion: z.string(),
  signalKey: z.string(),
  numbers: z.record(z.string(), z.union([z.number(), z.string()])),
});
export type DiagnosisItemDto = z.infer<typeof diagnosisItemSchema>;

export const diagnosisSchema = z.object({
  board: boardKeySchema,
  scopeKey: z.string(),
  period: z.string(),
  title: z.string(),
  scopeLabel: z.string(),
  asOf: z.string(),
  summary: z.string(),
  items: z.array(diagnosisItemSchema),
  signals: z.array(z.object({ key: z.string(), level: diagnosisLevelSchema, impact: z.number(), numbers: z.record(z.string(), z.union([z.number(), z.string()])) })),
  model: z.string().nullable(),
  generatedAt: z.string(),
  cached: z.boolean(),
});
export type DiagnosisDto = z.infer<typeof diagnosisSchema>;

export const metricDefinitionSchema = z.object({
  key: z.string(),
  boards: z.array(boardKeySchema),
  name: labelSchema,
  unit: metricUnitSchema,
  definition: labelSchema,
  formula: labelSchema,
  timeBasis: labelSchema,
  source: labelSchema,
  refresh: labelSchema,
});
export type MetricDefinitionDto = z.infer<typeof metricDefinitionSchema>;

const HOURLY = { zh: "实时计算，页面每小时刷新；智能诊断每日生成一次", en: "Computed on request, refreshed hourly; diagnosis generated daily" };
const def = (key: string, boards: BoardKey[], unit: MetricUnit, name: [string, string], definition: [string, string], formula: [string, string], timeBasis: [string, string], source: [string, string]): MetricDefinitionDto => ({
  key,
  boards,
  unit,
  name: { zh: name[0], en: name[1] },
  definition: { zh: definition[0], en: definition[1] },
  formula: { zh: formula[0], en: formula[1] },
  timeBasis: { zh: timeBasis[0], en: timeBasis[1] },
  source: { zh: source[0], en: source[1] },
  refresh: HOURLY,
});

const DUE_IN_PERIOD: [string, string] = ["截止日落在所选期间内", "Due date within the period"];
const DONE_IN_PERIOD: [string, string] = ["完成时间落在所选期间内", "Completed within the period"];
const AS_OF: [string, string] = ["截至数据截点", "As of the cut-off"];
const TODOS: [string, string] = ["今日待办（todos）", "To-dos"];
const RECEIVABLES: [string, string] = ["应收单、收款记录、月度汇率", "Receivables, receipts, monthly FX"];

export const METRIC_DEFINITIONS: MetricDefinitionDto[] = [
  def("dueTasks", ["sales"], "count", ["应完成任务", "Tasks due"], ["分配给本人（或范围内人员）、截止日在期间内的待办数，不含已取消", "To-dos assigned in scope with a due date in the period, excluding cancelled"], ["count(todo | dueAt ∈ 期间)", "count(todo | dueAt ∈ period)"], DUE_IN_PERIOD, TODOS),
  def("completionRate", ["sales"], "percent", ["任务完成率", "Completion rate"], ["应完成任务中已完成的比例", "Share of due tasks that are done"], ["已完成 ÷ 应完成任务", "done ÷ due"], DUE_IN_PERIOD, TODOS),
  def("onTimeRate", ["sales"], "percent", ["按时完成率", "On-time rate"], ["应完成任务中在截止时间（含）前完成的比例", "Share of due tasks done by the due time"], ["按时完成 ÷ 应完成任务", "on time ÷ due"], DUE_IN_PERIOD, TODOS),
  def("overdueOpen", ["sales"], "count", ["到期未完成", "Overdue open"], ["应完成任务中截至数据截点已过截止时间且仍未完成的数", "Due tasks past their due time and still open at the cut-off"], ["count(未完成 且 dueAt < 截点)", "count(open and dueAt < cut-off)"], AS_OF, TODOS),
  def("avgCycleDays", ["sales"], "days", ["平均处理周期（天）", "Avg cycle (days)"], ["期间内完成的待办（含非本期到期）从创建到完成的平均自然日", "Average calendar days from creation to completion for to-dos completed in the period"], ["Σ(完成时间 − 创建时间) ÷ 期间内完成数", "Σ(done − created) ÷ completed"], DONE_IN_PERIOD, TODOS),
  def("reworkRate", ["sales"], "percent", ["返工率", "Rework rate"], ["期间内完成的待办中属于返工的比例。系统没有「退回」标记，返工按同一单据同一类任务再次下达（如改样后新一轮打样、包装方案新版本）或整改复验类任务计", "Share of completed to-dos that are rework: the same task type re-issued on the same document, or a re-inspection task"], ["返工完成数 ÷ 期间内完成数", "rework ÷ completed"], DONE_IN_PERIOD, TODOS),
  def("deptCustomers", ["manager"], "count", ["部门客户", "Customers"], ["范围内存在款式、未取消订单或未结应收的客户数", "Customers with styles, open orders or open receivables in scope"], ["count(distinct 客户)", "count(distinct customer)"], AS_OF, ["款式、客户订单、应收单", "Styles, orders, receivables"]),
  def("highRiskCustomers", ["manager"], "count", ["高风险客户", "High-risk customers"], ["满足任一：逾期订单 ≥ 2 张；未关闭质量问题 ≥ 3 个；逾期应收 ≥ 20 万元", "Any of: ≥ 2 late orders; ≥ 3 open quality issues; ≥ ¥200k overdue receivables"], ["count(客户 | 满足高风险规则)", "count(customer | high-risk rule)"], AS_OF, ["订单、验货单、送测单、应收单", "Orders, inspections, test requests, receivables"]),
  def("watchCustomers", ["manager"], "count", ["关注客户", "Watch customers"], ["非高风险，且有 14 天内到期的风险订单，或有未关闭的「客户批复等待超期 / 报价超期未反馈」巡检命中", "Not high-risk, with an at-risk order due within 14 days or an open customer-feedback patrol hit"], ["count(客户 | 满足关注规则)", "count(customer | watch rule)"], AS_OF, ["订单、巡检命中", "Orders, patrol hits"]),
  def("overdueArWan", ["manager", "gm"], "wan", ["逾期应收（万元）", "Overdue AR (¥10k)"], ["已过到期日、未收齐的正数应收未收金额合计，按月度汇率折人民币", "Outstanding positive receivables past due, converted to CNY"], ["Σ(金额 − 已收) ÷ 10000", "Σ(amount − received) ÷ 10000"], AS_OF, RECEIVABLES),
  def("aged30ArWan", ["manager"], "wan", ["账龄超 30 天应收（万元）", "AR > 30 days (¥10k)"], ["逾期天数超过 30 天的应收未收金额合计", "Outstanding receivables more than 30 days past due"], ["Σ(逾期 > 30 天未收) ÷ 10000", "Σ(outstanding, > 30 days overdue) ÷ 10000"], AS_OF, RECEIVABLES),
  def("dueDateChangeRate", ["manager"], "percent", ["交期变更率", "Due-date change rate"], ["期间内确认的订单中发生过交期变更的比例：工厂交期回复超过 1 版或有延期，或 PO 改版改了客户交期", "Share of orders confirmed in the period whose dates changed (factory reply revised or delayed, or the PO revision changed the due date)"], ["变更订单数 ÷ 确认订单数", "changed ÷ confirmed"], ["订单确认时间落在期间内", "Confirmed within the period"], ["客户订单、工厂交期回复、PO 版本", "Orders, factory replies, PO revisions"]),
  def("confirmedAmountWan", ["gm"], "wan", ["确认订单额（万元）", "Confirmed (¥10k)"], ["期间内进入「待排产」（确认）的未取消订单 FOB 金额合计；副标题为目标达成率", "FOB amount of orders confirmed in the period; subtitle shows target achievement"], ["Σ FOB × 汇率 ÷ 10000；达成率 = 确认额 ÷ 目标", "Σ FOB × FX ÷ 10000; achievement = confirmed ÷ target"], ["订单确认时间落在期间内", "Confirmed within the period"], ["客户订单、月度目标（metric_snapshots）", "Orders, monthly targets"]),
  def("deliveredAmountWan", ["gm"], "wan", ["已交付金额（万元）", "Delivered (¥10k)"], ["期间内已开船出货的金额（出货双数 × 订单单价）；副标题为按客户已接受报价毛利率加权的毛利率", "Value of shipments sailed in the period; subtitle is the margin weighted by accepted customer quotes"], ["Σ 出货双数 × FOB 单价 × 汇率 ÷ 10000", "Σ pairs × FOB unit price × FX ÷ 10000"], ["开船时间落在期间内", "Sailed within the period"], ["出货单、出货节点、客户订单、报价轮次", "Shipments, events, orders, quote rounds"]),
  def("receivedAmountWan", ["gm"], "wan", ["回款金额（万元）", "Collected (¥10k)"], ["期间内收款合计；回款率 = 回款 ÷ 已交付", "Receipts in the period; collection rate = collected ÷ delivered"], ["Σ 收款 × 汇率 ÷ 10000", "Σ receipts × FX ÷ 10000"], ["收款日落在期间内", "Received within the period"], RECEIVABLES),
  def("onTimeDeliveryRate", ["gm"], "percent", ["准时交付率", "On-time delivery"], ["客户交期落在期间内且不晚于数据截点的订单中，按交期（含）前开船的比例；已开船双数需达到订单双数的 97%", "Of orders due in the period up to the cut-off, the share that sailed by the due date (≥ 97% of pairs sailed)"], ["准时订单数 ÷ 应交订单数", "on-time ÷ due"], ["客户交期落在期间内", "Customer due date within the period"], ["客户订单、出货单、出货节点", "Orders, shipments, events"]),
  def("riskAmountWan", ["gm", "manager"], "wan", ["在手风险金额（万元）", "At-risk (¥10k)"], ["在手订单（待确认 / 待排产 / 生产中 / 待发货）中节点受阻或有未关闭红灯巡检命中的订单金额合计", "Open orders with a blocked node or an open red patrol hit"], ["Σ 风险订单 FOB × 汇率 ÷ 10000", "Σ FOB of at-risk orders × FX ÷ 10000"], AS_OF, ["客户订单、节点状态、巡检命中", "Orders, node states, patrol hits"]),
  def("fulfillmentIndex", ["gm"], "percent", ["履约指数", "Fulfilment index"], ["订舱及时率、验货一次通过率、齐料率、准时交付率四项的平均（无样本的项不参与平均）", "Average of booking timeliness, first-pass rate, material readiness and on-time delivery (items without samples are skipped)"], ["(订舱及时率 + 验货一次通过率 + 齐料率 + 准时交付率) ÷ 4", "(booking + first pass + materials + on-time) ÷ 4"], ["各分项各自的时间口径", "Per component"], ["订舱单、验货单、采购单、出货单", "Bookings, inspections, purchases, shipments"]),
  def("bookingTimelyRate", ["gm"], "percent", ["订舱及时率", "Booking timeliness"], ["计划 ETD 落在期间内的订舱中，在 ETD 前 14 天（含）完成订舱确认的比例；未确认且未到截止的不计入", "Bookings with ETD in the period confirmed at least 14 days before ETD"], ["及时订舱数 ÷ 应订舱数", "timely ÷ due"], ["计划 ETD 落在期间内", "ETD within the period"], ["订舱单", "Bookings"]),
  def("firstPassRate", ["gm"], "percent", ["验货一次通过率", "First-pass rate"], ["首轮结论落在期间内的终验（FRI）中，首轮即合格的比例", "FRI inspections whose first round in the period passed"], ["首轮合格数 ÷ 首轮验货数", "first-round pass ÷ inspected"], ["首轮验货日落在期间内", "First round within the period"], ["验货单", "Inspections"]),
  def("materialReadyRate", ["gm"], "percent", ["齐料率", "Material readiness"], ["承诺到货日落在期间内的采购单中，按承诺日（含）前全部到货的比例。系统没有计划开机日，以采购承诺到货日近似", "Purchase orders due in the period that were fully received by the promised date (promised date stands in for the planned start)"], ["按期到齐数 ÷ 应到货采购单数", "on time ÷ due"], ["承诺到货日落在期间内", "Promised date within the period"], ["采购单", "Purchase orders"]),
];

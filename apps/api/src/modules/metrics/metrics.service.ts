import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { BOARD_TABS, BOARD_TITLES, type BoardDto, type BoardKey, type BoardQuery, type ChartDto, type KpiDto, METRIC_DEFINITIONS, type MetricUnit, type TableDto, metricsErrors } from "@otd/contracts/metrics";
import { type Database, customers, metricSnapshots, orgs, plannings, quoteRounds, quotes, sampleRounds, samples, shipments, testRequests } from "@otd/db";
import { MODULES } from "@otd/shared";
import { and, eq, inArray, like } from "drizzle-orm";
import { type AccessContext, systemContext } from "../../core/access/access.types.js";
import { requirePermission } from "../../core/access/scope.js";
import { Clock } from "../../core/clock.js";
import { AppError } from "../../core/errors.js";
import { Scheduler } from "../../core/scheduler.js";
import { DB } from "../../core/tokens.js";
import type { Numbers, Signal } from "./diagnosis.js";
import {
  ACTIVE_ORDER,
  BOOKING_LEAD_DAYS,
  CATEGORIES,
  type CoreMetrics,
  HIGH_RISK,
  coreMetrics,
  customerHealth,
  deptCustomers,
  dueDateChange,
  onTimeDelivery,
  orderCny,
  overdueAr,
  pct,
  riskOrders,
  round1,
  taskStats,
  wan,
} from "./metrics.calc.js";
import { type MetricsData, loadMetricsData } from "./metrics.data.js";
import { type Period, addDays, dateOf, inRange, monthsBetween, periodOf, weekStart } from "./metrics.period.js";
import { type MetricsScope, owned, scopeKeyOf } from "./metrics.scope.js";

export const TARGET_METRIC = "target.confirmedAmount";
export const TREND_METRIC = "confirmedAmount";
export const ON_TIME_METRIC = "onTimeRate";
const TREND_WEEKS = 8;
const DEF = new Map(METRIC_DEFINITIONS.map((d) => [d.key, d]));
const L = (zh: string, en: string) => ({ zh, en });
const f1 = (n: number) => n.toFixed(1);
const pctOrDash = (n: number | null) => (n === null ? "—" : f1(n));
const MODE_LABEL = { SELF: L("个人范围", "Personal"), ORG: L("本组织", "Own org"), ORG_AND_CHILDREN: L("本组织及下级", "Own org & below"), ALL: L("企业范围", "Company") } as const;
const LEVEL_LABEL = { HIGH_RISK: "高风险", WATCH: "关注", STABLE: "稳定" } as const;

export type Computed = { dto: BoardDto; signals: Signal[]; scope: MetricsScope; period: Period; today: string };

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly logger = new Logger("Metrics");

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly clock: Clock,
    private readonly scheduler: Scheduler,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({ name: "metrics.weekly-snapshot", dailyAt: "02:10", run: () => this.snapshotLastWeek() });
  }

  async board(ctx: AccessContext, board: BoardKey, q: BoardQuery): Promise<BoardDto> {
    return (await this.compute(ctx, board, q)).dto;
  }

  async compute(ctx: AccessContext, board: BoardKey, q: BoardQuery): Promise<Computed> {
    requirePermission(ctx, `metrics.${board}.view`);
    const tabs = BOARD_TABS[board];
    const tab = q.tab ?? tabs[0]!.key;
    if (!tabs.some((t) => t.key === tab)) throw new AppError(metricsErrors.METRICS_TAB_UNKNOWN, { tab });
    const today = this.clock.today();
    const now = this.clock.now();
    const period = periodOf(q.period, today);
    const scope = await this.scopeOf(ctx, q);
    const data = await loadMetricsData(this.db, scope, period.end < today ? period.end : today);
    const label = await this.scopeLabel(ctx, scope, period);
    const base = {
      board,
      title: BOARD_TITLES[board],
      tabs,
      tab,
      period: { key: period.key, code: period.code, start: period.start, end: period.end, label: period.label },
      asOf: today,
      scope: { key: scope.key, label, dataScope: ctx.dataScope.mode, orgId: scope.orgId, customerId: scope.customerId },
    };
    const first = tab === tabs[0]!.key;
    const built = board === "sales" ? await this.sales(data, scope, period, today, now, tab) : board === "manager" ? this.manager(data, period, today, now, tab) : await this.gm(data, scope, period, today, tab);
    return { dto: { ...base, kpis: built.kpis, charts: first ? built.charts : [], table: built.table }, signals: built.signals, scope, period, today };
  }

  private async scopeOf(ctx: AccessContext, q: BoardQuery): Promise<MetricsScope> {
    let orgIds: string[] | null = null;
    if (q.orgId) {
      const org = (await this.db.select({ path: orgs.path }).from(orgs).where(eq(orgs.id, q.orgId)))[0];
      if (!org) throw new AppError(metricsErrors.METRICS_ORG_UNKNOWN);
      orgIds = (await this.db.select({ id: orgs.id }).from(orgs).where(like(orgs.path, `${org.path}%`))).map((o) => o.id);
    }
    return { ctx, orgIds, orgId: q.orgId ?? null, customerId: q.customerId ?? null, key: scopeKeyOf(ctx, q.orgId ?? null, q.customerId ?? null) };
  }

  private async scopeLabel(ctx: AccessContext, scope: MetricsScope, period: Period): Promise<{ zh: string; en: string }> {
    const orgId = scope.orgId ?? (ctx.dataScope.mode === "ALL" ? null : ctx.orgId);
    const org = orgId ? (await this.db.select({ name: orgs.name, nameEn: orgs.nameEn }).from(orgs).where(eq(orgs.id, orgId)))[0] : undefined;
    const customer = scope.customerId ? (await this.db.select({ name: customers.name, nameEn: customers.nameEn }).from(customers).where(eq(customers.id, scope.customerId)))[0] : undefined;
    const mode = MODE_LABEL[ctx.dataScope.mode];
    const zh = [period.label.zh, org?.name ?? "全部组织", customer?.name, mode.zh].filter(Boolean).join(" · ");
    const en = [period.label.en, org?.nameEn ?? org?.name ?? "All orgs", customer?.nameEn ?? customer?.name, mode.en].filter(Boolean).join(" · ");
    return { zh, en };
  }

  private kpi(key: string, value: number | null, unit: MetricUnit, sub: { zh: string; en: string }, opts: { numerator?: number | null; denominator?: number | null; tone?: KpiDto["tone"] } = {}): KpiDto {
    const display = value === null ? "—" : unit === "percent" ? `${f1(value)}%` : unit === "count" ? String(value) : f1(value);
    return { key, label: DEF.get(key)?.name ?? L(key, key), value, unit, display, sub, numerator: opts.numerator ?? null, denominator: opts.denominator ?? null, tone: opts.tone ?? null };
  }

  private async sales(data: MetricsData, scope: MetricsScope, period: Period, today: string, now: Date, tab: string): Promise<{ kpis: KpiDto[]; charts: ChartDto[]; table: TableDto | null; signals: Signal[] }> {
    const s = taskStats(data.todos, period.start, period.end, now);
    const completion = pct(s.done, s.due);
    const onTime = pct(s.onTime, s.due);
    const rework = pct(s.rework, s.completed);
    const kpis = [
      this.kpi("dueTasks", s.due, "count", L("截止日在所选期间内", "Due in the period")),
      this.kpi("completionRate", completion, "percent", L(`${s.done} 项已完成 / ${s.due} 项到期`, `${s.done} done / ${s.due} due`), { numerator: s.done, denominator: s.due, tone: "success" }),
      this.kpi("onTimeRate", onTime, "percent", L(`${s.onTime} 项按时 / ${s.due} 项到期`, `${s.onTime} on time / ${s.due} due`), { numerator: s.onTime, denominator: s.due }),
      this.kpi("overdueOpen", s.overdueOpen, "count", L(`截至 ${today} 仍未完成`, `Open at ${today}`), { tone: s.overdueOpen ? "danger" : null }),
      this.kpi("avgCycleDays", s.avgCycleDays, "days", L(`${s.completed} 项完成 · 创建至完成按自然日`, `${s.completed} completed · created → done`), { numerator: s.completed }),
      this.kpi("reworkRate", rework, "percent", L(`${s.rework} 项返工 / ${s.completed} 项完成`, `${s.rework} rework / ${s.completed} completed`), { numerator: s.rework, denominator: s.completed, tone: "warning" }),
    ];
    const cats = CATEGORIES.filter((c) => c.key !== "OTHER" || s.byCategory.OTHER.due > 0 || s.byCategory.OTHER.overdueOpen > 0);
    const charts: ChartDto[] = [
      { key: "tasksByCategory", title: L("各类任务应完成数量", "Tasks due by type"), kind: "bar", unit: "count", series: [{ key: "due", label: L("应完成", "Due") }, { key: "done", label: L("已完成", "Done") }], data: cats.map((c) => ({ key: c.key, label: c.label.zh, labelEn: c.label.en, due: s.byCategory[c.key].due, done: s.byCategory[c.key].done })) },
      { key: "overdueByCategory", title: L("各类任务到期未完成", "Overdue by type"), kind: "donut", unit: "count", series: [{ key: "value", label: L("到期未完成", "Overdue") }], data: CATEGORIES.filter((c) => s.byCategory[c.key].overdueOpen > 0).map((c) => ({ key: c.key, label: c.label.zh, labelEn: c.label.en, value: s.byCategory[c.key].overdueOpen })) },
    ];
    const table = tab === "progress" ? await this.salesProgress(data, scope) : tab === "contribution" ? await this.salesContribution(data, scope, period) : this.categoryTable(s);

    const signals: Signal[] = [];
    if (s.overdueOpen > 0) {
      const top = CATEGORIES.map((c) => ({ c, n: s.byCategory[c.key].overdueOpen })).sort((a, b) => b.n - a.n)[0]!;
      signals.push({ key: "sales.overdueTasks", level: "PRIORITY", impact: s.overdueOpen * 10_000, numbers: { overdue: s.overdueOpen, topCategory: top.c.label.zh, topCount: top.n, due: s.due } });
    }
    const red = data.hits.filter((h) => h.light === "RED" && h.assigneeId && data.scopeUsers.includes(h.assigneeId)).length;
    if (red > 0) signals.push({ key: "sales.redAssigned", level: "PRIORITY", impact: red * 10_000, numbers: { red } });
    if (completion !== null && completion < 80) signals.push({ key: "sales.completionLow", level: "WATCH", impact: (80 - completion) * 100, numbers: { rate: f1(completion), done: s.done, due: s.due, target: 80 } });
    if (onTime !== null && onTime < 80) signals.push({ key: "sales.onTimeLow", level: "WATCH", impact: (80 - onTime) * 90, numbers: { rate: f1(onTime), onTime: s.onTime, due: s.due, target: 80 } });
    if (rework !== null && rework > 10) signals.push({ key: "sales.reworkHigh", level: "WATCH", impact: rework * 50, numbers: { rate: f1(rework), rework: s.rework, completed: s.completed, threshold: 10 } });
    if (s.avgCycleDays !== null) signals.push({ key: "sales.cycle", level: "WATCH", impact: 0, filler: true, numbers: { completed: s.completed, avg: f1(s.avgCycleDays) } });
    signals.push({ key: "sales.dueSummary", level: "WATCH", impact: 0, filler: true, numbers: { due: s.due, done: s.done } });
    return { kpis, charts, table, signals };
  }

  private categoryTable(s: ReturnType<typeof taskStats>): TableDto {
    return {
      key: "work",
      title: BOARD_TABS.sales[0]!.label,
      columns: [
        { key: "category", label: L("类别", "Type") },
        { key: "due", label: L("应完成", "Due"), unit: "count" },
        { key: "done", label: L("已完成", "Done"), unit: "count" },
        { key: "overdue", label: L("到期未完成", "Overdue"), unit: "count" },
        { key: "avgCycleDays", label: L("平均周期（天）", "Avg cycle (d)"), unit: "days" },
        { key: "completionRate", label: L("完成率", "Rate"), unit: "percent" },
      ],
      rows: CATEGORIES.map((c) => {
        const b = s.byCategory[c.key];
        return { key: c.key, category: c.label.zh, due: b.due, done: b.done, overdue: b.overdueOpen, avgCycleDays: b.completed ? round1(b.cycleDays / b.completed) : null, completionRate: pct(b.done, b.due) };
      }).filter((r) => r.due > 0 || r.overdue > 0 || (r.done ?? 0) > 0),
    };
  }

  private async salesProgress(data: MetricsData, scope: MetricsScope): Promise<TableDto> {
    const planningRows = await this.db.select({ status: plannings.status }).from(plannings).where(and(owned(plannings, scope), inArray(plannings.status, ["RECOGNIZING", "EXTRACTED"])));
    const sampleRows = await this.db.select({ id: samples.id }).from(samples).where(owned(samples, scope));
    const rounds = sampleRows.length ? await this.db.select({ sampleId: sampleRounds.sampleId, roundNo: sampleRounds.roundNo, status: sampleRounds.status }).from(sampleRounds).where(inArray(sampleRounds.sampleId, sampleRows.map((x) => x.id))) : [];
    const latest = new Map<string, { roundNo: number; status: string }>();
    for (const r of rounds) if ((latest.get(r.sampleId)?.roundNo ?? 0) < r.roundNo) latest.set(r.sampleId, r);
    const latestList = [...latest.values()];
    const testing = await this.db.select({ id: testRequests.id }).from(testRequests).where(and(owned(testRequests, scope), inArray(testRequests.status, ["AWAITING_SAMPLE", "TESTING"])));
    const quoted = await this.db.select({ id: quoteRounds.id }).from(quoteRounds).innerJoin(quotes, eq(quotes.id, quoteRounds.quoteId)).where(and(owned(quotes, scope), eq(quoteRounds.kind, "CUSTOMER"), eq(quoteRounds.status, "QUOTED")));
    const transit = await this.db.select({ id: shipments.id }).from(shipments).where(and(owned(shipments, scope), inArray(shipments.status, ["SAILED", "ARRIVED"])));
    const red = (module: string) => data.hits.filter((h) => h.module === module && h.light === "RED").length;
    const order = (status: string) => data.orders.filter((o) => o.status === status).length;
    const rows = [
      { key: "planning.recognizing", module: "企划管理", stage: "识别中", count: planningRows.filter((p) => p.status === "RECOGNIZING").length, red: red("M02") },
      { key: "planning.extracted", module: "企划管理", stage: "待确认", count: planningRows.filter((p) => p.status === "EXTRACTED").length, red: null },
      { key: "sample.active", module: "样品管理", stage: "打样进行中", count: latestList.filter((r) => !["APPROVED", "AWAITING_APPROVAL"].includes(r.status)).length, red: red("M03") },
      { key: "sample.awaiting", module: "样品管理", stage: "待客户批复", count: latestList.filter((r) => r.status === "AWAITING_APPROVAL").length, red: null },
      { key: "testing.active", module: "测试管理", stage: "送测在途", count: testing.length, red: red("M06") },
      { key: "quote.feedback", module: "报价管理", stage: "待客户反馈", count: quoted.length, red: red("M04") },
      { key: "order.pending", module: "订单管理", stage: "待确认", count: order("PENDING_CONFIRM"), red: red("M09") },
      { key: "order.schedule", module: "订单管理", stage: "待排产", count: order("TO_SCHEDULE"), red: null },
      { key: "order.production", module: "订单管理", stage: "生产中", count: order("IN_PRODUCTION"), red: null },
      { key: "order.ship", module: "订单管理", stage: "待发货", count: order("TO_SHIP"), red: null },
      { key: "shipment.transit", module: "出货管理", stage: "在途（已开船 / 已到港）", count: transit.length, red: red("M11") },
    ];
    return { key: "progress", title: BOARD_TABS.sales[1]!.label, columns: [{ key: "module", label: L("模块", "Module") }, { key: "stage", label: L("阶段", "Stage") }, { key: "count", label: L("数量", "Count"), unit: "count" }, { key: "red", label: L("红灯巡检", "Red hits"), unit: "count" }], rows };
  }

  private async salesContribution(data: MetricsData, scope: MetricsScope, period: Period): Promise<TableDto> {
    const approved = await this.db
      .select({ customerId: samples.customerId, approvedAt: sampleRounds.approvedAt })
      .from(sampleRounds)
      .innerJoin(samples, eq(samples.id, sampleRounds.sampleId))
      .where(and(owned(samples, scope), eq(sampleRounds.status, "APPROVED")));
    const ids = new Set([...data.orders.map((o) => o.customerId), ...approved.map((a) => a.customerId)]);
    const rows = [...ids]
      .map((customerId) => {
        const confirmed = data.orders.filter((o) => o.customerId === customerId && o.status !== "CANCELLED" && inRange(o.confirmedAt, period.start, period.end));
        const shipped = data.shipments.filter((x) => x.customerId === customerId && inRange(x.sailedAt, period.start, period.end));
        return {
          key: customerId,
          customer: data.customerNames.get(customerId) ?? customerId,
          confirmedOrders: confirmed.length,
          confirmedPairs: confirmed.reduce((sum, o) => sum + o.totalPairs, 0),
          shippedPairs: shipped.reduce((sum, x) => sum + x.pairs, 0),
          activeOrders: data.orders.filter((o) => o.customerId === customerId && ACTIVE_ORDER.has(o.status)).length,
          approvedRounds: approved.filter((a) => a.customerId === customerId && inRange(dateOf(a.approvedAt), period.start, period.end)).length,
        };
      })
      .sort((a, b) => b.confirmedPairs - a.confirmedPairs || b.activeOrders - a.activeOrders);
    return {
      key: "contribution",
      title: BOARD_TABS.sales[2]!.label,
      columns: [
        { key: "customer", label: L("客户", "Customer") },
        { key: "confirmedOrders", label: L("确认订单（张）", "Confirmed POs"), unit: "count" },
        { key: "confirmedPairs", label: L("确认双数", "Confirmed pairs"), unit: "count" },
        { key: "shippedPairs", label: L("开船双数", "Shipped pairs"), unit: "count" },
        { key: "activeOrders", label: L("在手订单", "Open POs"), unit: "count" },
        { key: "approvedRounds", label: L("样品批准（轮）", "Approved rounds"), unit: "count" },
      ],
      rows,
    };
  }

  private manager(data: MetricsData, period: Period, today: string, now: Date, tab: string): { kpis: KpiDto[]; charts: ChartDto[]; table: TableDto | null; signals: Signal[] } {
    const health = customerHealth(data, today);
    const ar = overdueAr(data, today);
    const change = dueDateChange(data, period.start, period.end);
    const changeRate = pct(change.changed, change.confirmed);
    const high = health.filter((h) => h.level === "HIGH_RISK");
    const watch = health.filter((h) => h.level === "WATCH");
    const kpis = [
      this.kpi("deptCustomers", health.length, "count", L("当前范围内负责的客户", "Customers in scope")),
      this.kpi("highRiskCustomers", high.length, "count", L(`逾期订单 ≥ ${HIGH_RISK.overdueOrders} / 质量问题 ≥ ${HIGH_RISK.qualityIssues} / 逾期应收 ≥ ${HIGH_RISK.overdueArCny / 10_000} 万元`, "By high-risk rules"), { tone: "danger" }),
      this.kpi("watchCustomers", watch.length, "count", L("临近交期风险或待客户反馈", "Near-due risk or awaiting feedback"), { tone: "warning" }),
      this.kpi("overdueArWan", wan(ar.cny), "wan", L(`${ar.count} 笔 · 截至 ${today}`, `${ar.count} items · at ${today}`), { numerator: ar.count, tone: "danger" }),
      this.kpi("aged30ArWan", wan(ar.aged30Cny), "wan", L(`${ar.aged30Count} 笔逾期超 30 天`, `${ar.aged30Count} items > 30 days`), { numerator: ar.aged30Count, tone: "warning" }),
      this.kpi("dueDateChangeRate", changeRate, "percent", L(`${change.changed} 张变更 / ${change.confirmed} 张确认`, `${change.changed} changed / ${change.confirmed} confirmed`), { numerator: change.changed, denominator: change.confirmed }),
    ];
    const charts: ChartDto[] = [
      { key: "riskByCustomer", title: L("客户在手风险订单金额（万元）", "At-risk open orders by customer (¥10k)"), kind: "barH", unit: "wan", series: [{ key: "value", label: L("风险订单金额", "At-risk amount") }], data: health.filter((h) => h.riskCny > 0).sort((a, b) => b.riskCny - a.riskCny).map((h) => ({ key: h.customerId, label: h.name, value: wan(h.riskCny) })) },
      {
        key: "issuesByCustomer",
        title: L("客户未关闭异常", "Open issues by customer"),
        kind: "stacked",
        unit: "count",
        series: [{ key: "red", label: L("红灯巡检", "Red hits") }, { key: "yellow", label: L("黄灯巡检", "Amber hits") }, { key: "quality", label: L("质量问题", "Quality issues") }],
        data: health.filter((h) => h.openRed + h.openYellow + h.qualityIssues > 0).sort((a, b) => b.openRed + b.openYellow + b.qualityIssues - (a.openRed + a.openYellow + a.qualityIssues)).map((h) => ({ key: h.customerId, label: h.name, red: h.openRed, yellow: h.openYellow, quality: h.qualityIssues })),
      },
    ];
    let table: TableDto | null = null;
    if (tab === "health") table = this.healthTable(health);
    if (tab === "team") table = this.teamTable(data, period, now);
    if (tab === "contribution") table = this.contributionTable(data, period, today);
    if (tab === "bottleneck") table = this.bottleneckTable(data);

    const signals: Signal[] = [];
    for (const h of [...high].sort((a, b) => b.overdueArCny - a.overdueArCny).slice(0, 2)) {
      signals.push({ key: "manager.highRisk", level: "PRIORITY", impact: h.overdueArCny + h.overdueOrders * 100_000 + h.qualityIssues * 50_000, numbers: { customer: h.name, overdueOrders: h.overdueOrders, quality: h.qualityIssues, arWan: f1(wan(h.overdueArCny)), t1: HIGH_RISK.overdueOrders, t2: HIGH_RISK.qualityIssues, t3: HIGH_RISK.overdueArCny / 10_000 } });
    }
    if (ar.cny > 0) signals.push({ key: "manager.overdueAr", level: "PRIORITY", impact: ar.cny, numbers: { overdueWan: f1(wan(ar.cny)), count: ar.count, agedDays: 30, aged30Wan: f1(wan(ar.aged30Cny)) } });
    const concentration = topShare(ar.byCustomer, ar.cny);
    if (concentration && concentration.share > 30) signals.push({ key: "manager.arConcentration", level: "PRIORITY", impact: concentration.cny * 0.5, numbers: { customer: data.customerNames.get(concentration.id) ?? concentration.id, wan: f1(wan(concentration.cny)), share: f1(concentration.share), threshold: 30 } });
    signals.push(...this.redPatrolSignal(data, "manager"));
    if (changeRate !== null && changeRate > 20) signals.push({ key: "manager.changeRate", level: "WATCH", impact: changeRate * 100, numbers: { rate: f1(changeRate), changed: change.changed, confirmed: change.confirmed, threshold: 20 } });
    if (watch.length) signals.push({ key: "manager.watchCustomers", level: "WATCH", impact: watch.length * 1_000, numbers: { count: watch.length, customer: watch[0]!.name } });
    const team = data.scopeUsers.map((id) => ({ id, overdue: data.todos.filter((t) => t.assigneeId === id && t.status === "OPEN" && t.dueAt && t.dueAt < now).length })).sort((a, b) => b.overdue - a.overdue)[0];
    if (team && team.overdue > 0) signals.push({ key: "manager.teamOverdue", level: "WATCH", impact: team.overdue * 500, numbers: { user: data.users.get(team.id)?.name ?? "", overdue: team.overdue } });
    signals.push({ key: "manager.customers", level: "WATCH", impact: 0, filler: true, numbers: { customers: health.length, high: high.length, watch: watch.length, stable: health.length - high.length - watch.length } });
    return { kpis, charts, table, signals };
  }

  private redPatrolSignal(data: MetricsData, board: "manager" | "gm"): Signal[] {
    const red = data.hits.filter((h) => h.light === "RED");
    if (!red.length) return [];
    if (board === "manager") {
      const byRule = countBy(red, (h) => h.ruleName);
      return [{ key: "manager.redPatrol", level: "PRIORITY", impact: red.length * 10_000, numbers: { red: red.length, rule: byRule[0]![0], ruleCount: byRule[0]![1] } }];
    }
    const byModule = countBy(red, (h) => h.module);
    const label = MODULES.find((m) => m.code === byModule[0]![0])?.label.zh ?? byModule[0]![0];
    return [{ key: "gm.redPatrol", level: "PRIORITY", impact: red.length * 10_000, numbers: { red: red.length, module: label, moduleCount: byModule[0]![1] } }];
  }

  private healthTable(health: ReturnType<typeof customerHealth>): TableDto {
    return {
      key: "health",
      title: BOARD_TABS.manager[0]!.label,
      columns: [
        { key: "customer", label: L("客户", "Customer") },
        { key: "level", label: L("健康度", "Health") },
        { key: "activeOrders", label: L("在手订单", "Open POs"), unit: "count" },
        { key: "overdueOrders", label: L("逾期订单", "Late POs"), unit: "count" },
        { key: "riskWan", label: L("风险订单金额（万元）", "At-risk (¥10k)"), unit: "wan" },
        { key: "qualityIssues", label: L("未关闭质量问题", "Open quality issues"), unit: "count" },
        { key: "overdueArWan", label: L("逾期应收（万元）", "Overdue AR (¥10k)"), unit: "wan" },
        { key: "reasons", label: L("依据", "Basis") },
      ],
      rows: health.map((h) => ({ key: h.customerId, customer: h.name, level: LEVEL_LABEL[h.level], levelCode: h.level, activeOrders: h.activeOrders, overdueOrders: h.overdueOrders, riskWan: wan(h.riskCny), qualityIssues: h.qualityIssues, overdueArWan: wan(h.overdueArCny), reasons: h.reasons.join("；") || "—" })),
    };
  }

  private teamTable(data: MetricsData, period: Period, now: Date): TableDto {
    const rows = data.scopeUsers
      .map((id) => {
        const user = data.users.get(id)!;
        const mine = data.todos.filter((t) => t.assigneeId === id);
        const s = taskStats(mine, period.start, period.end, now, data.todos);
        return {
          key: id,
          user: user.name,
          openTasks: mine.filter((t) => t.status === "OPEN").length,
          overdueOpen: mine.filter((t) => t.status === "OPEN" && t.dueAt && t.dueAt < now).length,
          due: s.due,
          done: s.done,
          completionRate: pct(s.done, s.due),
          onTimeRate: pct(s.onTime, s.due),
          avgCycleDays: s.avgCycleDays,
          activeOrders: data.orders.filter((o) => o.ownerId === id && ACTIVE_ORDER.has(o.status)).length,
          openHits: data.hits.filter((h) => h.assigneeId === id).length,
        };
      })
      .filter((r) => r.openTasks + r.due + r.activeOrders + r.openHits > 0)
      .sort((a, b) => b.overdueOpen - a.overdueOpen || b.openTasks - a.openTasks);
    return {
      key: "team",
      title: BOARD_TABS.manager[1]!.label,
      columns: [
        { key: "user", label: L("成员", "Member") },
        { key: "openTasks", label: L("未完成任务", "Open tasks"), unit: "count" },
        { key: "overdueOpen", label: L("到期未完成", "Overdue"), unit: "count" },
        { key: "due", label: L("本期应完成", "Due"), unit: "count" },
        { key: "completionRate", label: L("完成率", "Completion"), unit: "percent" },
        { key: "onTimeRate", label: L("按时率", "On time"), unit: "percent" },
        { key: "avgCycleDays", label: L("平均周期（天）", "Avg cycle (d)"), unit: "days" },
        { key: "activeOrders", label: L("在手订单", "Open POs"), unit: "count" },
        { key: "openHits", label: L("巡检命中", "Patrol hits"), unit: "count" },
      ],
      rows,
    };
  }

  private contributionTable(data: MetricsData, period: Period, today: string): TableDto {
    const total = coreMetrics(data, period.start, period.end, today).confirmedCny;
    const rows = deptCustomers(data)
      .map((customerId) => {
        const c = coreMetrics(data, period.start, period.end, today, (r) => r.customerId === customerId);
        return { key: customerId, customer: data.customerNames.get(customerId) ?? customerId, confirmedWan: wan(c.confirmedCny), share: pct(c.confirmedCny, total), deliveredWan: wan(c.deliveredCny), receivedWan: wan(c.receivedCny), overdueArWan: wan(c.overdueCny), activeOrders: c.activeOrders };
      })
      .sort((a, b) => b.confirmedWan - a.confirmedWan || b.activeOrders - a.activeOrders);
    return {
      key: "contribution",
      title: BOARD_TABS.manager[2]!.label,
      columns: [
        { key: "customer", label: L("客户", "Customer") },
        { key: "confirmedWan", label: L("确认订单额（万元）", "Confirmed (¥10k)"), unit: "wan" },
        { key: "share", label: L("占比", "Share"), unit: "percent" },
        { key: "deliveredWan", label: L("已交付（万元）", "Delivered (¥10k)"), unit: "wan" },
        { key: "receivedWan", label: L("回款（万元）", "Collected (¥10k)"), unit: "wan" },
        { key: "overdueArWan", label: L("逾期应收（万元）", "Overdue AR (¥10k)"), unit: "wan" },
        { key: "activeOrders", label: L("在手订单", "Open POs"), unit: "count" },
      ],
      rows,
    };
  }

  private bottleneckTable(data: MetricsData): TableDto {
    const byRule = new Map<string, MetricsData["hits"]>();
    for (const h of data.hits) byRule.set(h.ruleCode, [...(byRule.get(h.ruleCode) ?? []), h]);
    const rows = [...byRule.entries()]
      .map(([code, list]) => {
        const overdue = list.filter((h) => h.overdueDays > 0).map((h) => h.overdueDays);
        return {
          key: code,
          moduleCode: list[0]!.module,
          ruleType: list[0]!.ruleType,
          module: MODULES.find((m) => m.code === list[0]!.module)?.label.zh ?? list[0]!.module,
          rule: `${code} ${list[0]!.ruleName}`,
          red: list.filter((h) => h.light === "RED").length,
          yellow: list.filter((h) => h.light === "YELLOW").length,
          avgOverdueDays: overdue.length ? round1(overdue.reduce((s, x) => s + x, 0) / overdue.length) : null,
          maxOverdueDays: overdue.length ? Math.max(...overdue) : null,
        };
      })
      .sort((a, b) => b.red - a.red || b.yellow - a.yellow || a.key.localeCompare(b.key));
    return {
      key: "bottleneck",
      title: BOARD_TABS.manager[3]!.label,
      columns: [
        { key: "module", label: L("模块", "Module") },
        { key: "rule", label: L("卡点（巡检规则）", "Bottleneck (rule)") },
        { key: "red", label: L("红灯", "Red"), unit: "count" },
        { key: "yellow", label: L("黄灯", "Amber"), unit: "count" },
        { key: "avgOverdueDays", label: L("平均超期（天）", "Avg overdue (d)"), unit: "days" },
        { key: "maxOverdueDays", label: L("最长超期（天）", "Max overdue (d)"), unit: "count" },
      ],
      rows,
    };
  }

  private async gm(data: MetricsData, scope: MetricsScope, period: Period, today: string, tab: string): Promise<{ kpis: KpiDto[]; charts: ChartDto[]; table: TableDto | null; signals: Signal[] }> {
    const core = coreMetrics(data, period.start, period.end, today);
    const snapshots = await this.db.select().from(metricSnapshots).where(eq(metricSnapshots.scopeKey, scope.key));
    const targetWan = monthsBetween(period.start, period.end).reduce<number | null>((sum, m) => {
      const t = snapshots.find((s) => s.metric === TARGET_METRIC && s.period === `month:${m}`);
      return t ? (sum ?? 0) + t.value : sum;
    }, null);
    const confirmedWan = wan(core.confirmedCny);
    const achievement = targetWan ? pct(confirmedWan, targetWan) : null;
    const overdueWan = wan(core.overdueCny);
    const collection = pct(core.receivedCny, core.deliveredCny);
    const onTime = pct(core.onTime.on, core.onTime.due);
    const booking = pct(core.booking.timely, core.booking.due);
    const fp = pct(core.firstPass.pass, core.firstPass.total);
    const material = pct(core.material.ready, core.material.due);
    const risk = riskOrders(data);
    const kpis = [
      this.kpi("confirmedAmountWan", confirmedWan, "wan", achievement !== null ? L(`目标达成 ${f1(achievement)}%`, `${f1(achievement)}% of target`) : L("未设目标", "No target"), { numerator: confirmedWan, denominator: targetWan, tone: "primary" }),
      this.kpi("deliveredAmountWan", wan(core.deliveredCny), "wan", L(`毛利率 ${core.margin === null ? "—" : `${f1(core.margin)}%`}`, `Margin ${core.margin === null ? "—" : `${f1(core.margin)}%`}`)),
      this.kpi("receivedAmountWan", wan(core.receivedCny), "wan", L(`逾期应收 ${f1(overdueWan)} · 回款率 ${collection === null ? "—" : `${f1(collection)}%`}`, `Overdue ${f1(overdueWan)} · collected ${collection === null ? "—" : `${f1(collection)}%`}`), { tone: "warning" }),
      this.kpi("onTimeDeliveryRate", onTime, "percent", L(`${core.onTime.on} 张按时 / ${core.onTime.due} 张应交付`, `${core.onTime.on} on time / ${core.onTime.due} due`), { numerator: core.onTime.on, denominator: core.onTime.due, tone: onTime !== null && onTime < 90 ? "danger" : "success" }),
      this.kpi("riskAmountWan", wan(core.riskCny), "wan", L(`${core.riskCount} 张风险订单`, `${core.riskCount} at-risk POs`), { numerator: core.riskCount, tone: "danger" }),
      this.kpi("fulfillmentIndex", core.fulfillment, "percent", L(`订舱 ${pctOrDash(booking)} · 验货 ${pctOrDash(fp)} · 齐料 ${pctOrDash(material)} · 交付 ${pctOrDash(onTime)}`, `Booking ${pctOrDash(booking)} · first pass ${pctOrDash(fp)} · materials ${pctOrDash(material)} · on time ${pctOrDash(onTime)}`), { tone: "primary" }),
    ];
    const byCustomer = new Map<string, number>();
    for (const o of data.orders) if (o.status !== "CANCELLED" && inRange(o.confirmedAt, period.start, period.end)) byCustomer.set(o.customerId, (byCustomer.get(o.customerId) ?? 0) + orderCny(data, o));
    const charts: ChartDto[] = [
      { key: "confirmedByCustomer", title: L("客户确认订单额（万元）", "Confirmed by customer (¥10k)"), kind: "barH", unit: "wan", series: [{ key: "value", label: L("确认订单额", "Confirmed") }], data: [...byCustomer.entries()].sort((a, b) => b[1] - a[1]).map(([id, cny]) => ({ key: id, label: data.customerNames.get(id) ?? id, value: wan(cny) })) },
      { key: "confirmTrend", title: L("周期内订单确认趋势（万元 / 周）", "Weekly confirmations (¥10k)"), kind: "combo", unit: "wan", series: [{ key: "confirmedWan", label: L("确认订单额", "Confirmed"), unit: "wan" }, { key: "onTimeRate", label: L("准时交付率", "On-time rate"), unit: "percent" }], data: this.trend(data, snapshots, today) },
    ];
    let table: TableDto | null = null;
    if (tab === "overview") table = this.overviewTable(data, core, period, today);
    if (tab === "dept") table = this.deptTable(data, scope, period, today);
    if (tab === "customer") table = this.customerTable(data, period, today);
    if (tab === "employee") table = this.employeeTable(data, period, today);

    const signals: Signal[] = [];
    if (onTime !== null && onTime < 90) {
      const late = onTimeDelivery(data, period.start, period.end, today).late.length;
      signals.push({ key: "gm.onTimeLow", level: "PRIORITY", impact: (90 - onTime) * 10_000, numbers: { rate: f1(onTime), on: core.onTime.on, due: core.onTime.due, target: 90, late, leadDays: BOOKING_LEAD_DAYS } });
    }
    if (core.riskCount > 0) signals.push({ key: "gm.risk", level: "PRIORITY", impact: core.riskCny, numbers: { count: core.riskCount, wan: f1(wan(core.riskCny)), red: risk.red, blocked: risk.blocked } });
    if (core.overdueCny > 0) signals.push({ key: "gm.overdueAr", level: "PRIORITY", impact: core.overdueCny, numbers: { overdueWan: f1(overdueWan), agedDays: 30, aged30Wan: f1(wan(core.aged30Cny)) } });
    const arTop = topShare(overdueAr(data, today).byCustomer, core.overdueCny);
    if (arTop && arTop.share > 30) signals.push({ key: "gm.arConcentration", level: "PRIORITY", impact: arTop.cny * 0.5, numbers: { customer: data.customerNames.get(arTop.id) ?? arTop.id, wan: f1(wan(arTop.cny)), share: f1(arTop.share), threshold: 30 } });
    signals.push(...this.redPatrolSignal(data, "gm"));
    if (core.fulfillment !== null && core.fulfillment < 80) signals.push({ key: "gm.fulfillment", level: "WATCH", impact: (80 - core.fulfillment) * 1_000, numbers: { booking: pctOrDash(booking), firstPass: pctOrDash(fp), material: pctOrDash(material), index: f1(core.fulfillment), target: 80 } });
    if (targetWan && achievement !== null && achievement < 100) signals.push({ key: "gm.target", level: "WATCH", impact: (targetWan - confirmedWan) * 10_000, numbers: { confirmedWan: f1(confirmedWan), targetWan: f1(targetWan), rate: f1(achievement) } });
    const custTop = topShare(byCustomer, core.confirmedCny);
    if (custTop && custTop.share > 30) signals.push({ key: "gm.customerConcentration", level: "WATCH", impact: custTop.cny * 0.1, numbers: { customer: data.customerNames.get(custTop.id) ?? custTop.id, wan: f1(wan(custTop.cny)), share: f1(custTop.share), threshold: 30 } });
    signals.push({ key: "gm.overview", level: "WATCH", impact: 0, filler: true, numbers: { confirmedWan: f1(confirmedWan), deliveredWan: f1(wan(core.deliveredCny)), receivedWan: f1(wan(core.receivedCny)) } });
    return { kpis, charts, table, signals };
  }

  private trend(data: MetricsData, snapshots: (typeof metricSnapshots.$inferSelect)[], today: string): Record<string, string | number | null>[] {
    const current = weekStart(today);
    return Array.from({ length: TREND_WEEKS }, (_, i) => addDays(current, -7 * (TREND_WEEKS - 1 - i))).map((w) => {
      const end = addDays(w, 6);
      const snap = (metric: string) => snapshots.find((s) => s.metric === metric && s.period === `week:${w}`)?.value;
      const live = data.orders.filter((o) => o.status !== "CANCELLED" && inRange(o.confirmedAt, w, end)).reduce((s, o) => s + orderCny(data, o), 0);
      const confirmed = w === current ? wan(live) : (snap(TREND_METRIC) ?? wan(live));
      return { key: w, label: w.slice(5), confirmedWan: round1(confirmed), onTimeRate: snap(ON_TIME_METRIC) ?? null, source: w === current || snap(TREND_METRIC) === undefined ? "LIVE" : "SNAPSHOT" };
    });
  }

  private overviewTable(data: MetricsData, core: CoreMetrics, period: Period, today: string): TableDto {
    const prev = coreMetrics(data, period.prev.start, period.prev.end, today);
    const rate = (c: CoreMetrics) => pct(c.onTime.on, c.onTime.due);
    const items: [string, string, number | null, number | null, MetricUnit][] = [
      ["confirmedAmountWan", "确认订单额（万元）", wan(core.confirmedCny), wan(prev.confirmedCny), "wan"],
      ["deliveredAmountWan", "已交付金额（万元）", wan(core.deliveredCny), wan(prev.deliveredCny), "wan"],
      ["receivedAmountWan", "回款金额（万元）", wan(core.receivedCny), wan(prev.receivedCny), "wan"],
      ["onTimeDeliveryRate", "准时交付率", rate(core), rate(prev), "percent"],
      ["riskAmountWan", "在手风险金额（万元）", wan(core.riskCny), null, "wan"],
      ["overdueArWan", "逾期应收（万元）", wan(core.overdueCny), null, "wan"],
      ["fulfillmentIndex", "履约指数", core.fulfillment, prev.fulfillment, "percent"],
    ];
    return {
      key: "overview",
      title: BOARD_TABS.gm[0]!.label,
      columns: [
        { key: "metric", label: L("指标", "Metric") },
        { key: "current", label: L("本期", "This period") },
        { key: "previous", label: L("上期", "Previous") },
        { key: "change", label: L("变化", "Change") },
      ],
      rows: items.map(([key, name, cur, prev2, unit]) => ({ key, metric: name, unit, current: cur, previous: prev2, change: cur !== null && prev2 !== null ? round1(cur - prev2) : null })),
    };
  }

  private deptTable(data: MetricsData, scope: MetricsScope, period: Period, today: string): TableDto {
    const ctx = scope.ctx;
    const depts = data.orgs.filter((o) => o.fn === "SALES" && o.type === "DEPARTMENT" && (ctx.system || ctx.dataScope.mode === "ALL" || ctx.dataScope.orgIds.includes(o.id) || o.id === ctx.orgId) && (!scope.orgIds || scope.orgIds.includes(o.id)));
    const rows = depts.map((d) => {
      const ids = new Set(data.orgs.filter((o) => o.path.startsWith(d.path)).map((o) => o.id));
      const c = coreMetrics(data, period.start, period.end, today, (r) => !!r.orgId && ids.has(r.orgId));
      return { key: d.id, dept: d.name, confirmedWan: wan(c.confirmedCny), deliveredWan: wan(c.deliveredCny), receivedWan: wan(c.receivedCny), overdueArWan: wan(c.overdueCny), riskWan: wan(c.riskCny), onTimeRate: pct(c.onTime.on, c.onTime.due), activeOrders: c.activeOrders };
    });
    return {
      key: "dept",
      title: BOARD_TABS.gm[1]!.label,
      columns: [
        { key: "dept", label: L("部门", "Department") },
        { key: "confirmedWan", label: L("确认订单额（万元）", "Confirmed (¥10k)"), unit: "wan" },
        { key: "deliveredWan", label: L("已交付（万元）", "Delivered (¥10k)"), unit: "wan" },
        { key: "receivedWan", label: L("回款（万元）", "Collected (¥10k)"), unit: "wan" },
        { key: "overdueArWan", label: L("逾期应收（万元）", "Overdue AR (¥10k)"), unit: "wan" },
        { key: "riskWan", label: L("在手风险（万元）", "At-risk (¥10k)"), unit: "wan" },
        { key: "onTimeRate", label: L("准时交付率", "On-time"), unit: "percent" },
        { key: "activeOrders", label: L("在手订单", "Open POs"), unit: "count" },
      ],
      rows,
    };
  }

  private customerTable(data: MetricsData, period: Period, today: string): TableDto {
    const health = new Map(customerHealth(data, today).map((h) => [h.customerId, h.level]));
    const rows = deptCustomers(data)
      .map((customerId) => {
        const c = coreMetrics(data, period.start, period.end, today, (r) => r.customerId === customerId);
        const level = health.get(customerId) ?? "STABLE";
        return { key: customerId, customer: data.customerNames.get(customerId) ?? customerId, confirmedWan: wan(c.confirmedCny), deliveredWan: wan(c.deliveredCny), receivedWan: wan(c.receivedCny), overdueArWan: wan(c.overdueCny), riskWan: wan(c.riskCny), onTimeRate: pct(c.onTime.on, c.onTime.due), level: LEVEL_LABEL[level], levelCode: level };
      })
      .sort((a, b) => b.confirmedWan - a.confirmedWan || b.overdueArWan - a.overdueArWan);
    return {
      key: "customer",
      title: BOARD_TABS.gm[2]!.label,
      columns: [
        { key: "customer", label: L("客户", "Customer") },
        { key: "confirmedWan", label: L("确认订单额（万元）", "Confirmed (¥10k)"), unit: "wan" },
        { key: "deliveredWan", label: L("已交付（万元）", "Delivered (¥10k)"), unit: "wan" },
        { key: "receivedWan", label: L("回款（万元）", "Collected (¥10k)"), unit: "wan" },
        { key: "overdueArWan", label: L("逾期应收（万元）", "Overdue AR (¥10k)"), unit: "wan" },
        { key: "riskWan", label: L("在手风险（万元）", "At-risk (¥10k)"), unit: "wan" },
        { key: "onTimeRate", label: L("准时交付率", "On-time"), unit: "percent" },
        { key: "level", label: L("健康度", "Health") },
      ],
      rows,
    };
  }

  private employeeTable(data: MetricsData, period: Period, today: string): TableDto {
    const now = this.clock.now();
    const rows = data.scopeUsers
      .map((id) => data.users.get(id)!)
      .filter((u) => u.roles.includes("R001"))
      .map((u) => {
        const c = coreMetrics(data, period.start, period.end, today, (r) => r.ownerId === u.id);
        const s = taskStats(data.todos.filter((t) => t.assigneeId === u.id), period.start, period.end, now, data.todos);
        return { key: u.id, user: u.name, confirmedWan: wan(c.confirmedCny), deliveredWan: wan(c.deliveredCny), activeOrders: c.activeOrders, completionRate: pct(s.done, s.due), onTimeRate: pct(s.onTime, s.due), openRedHits: data.hits.filter((h) => h.light === "RED" && (h.assigneeId === u.id || h.ownerId === u.id)).length };
      })
      .sort((a, b) => b.confirmedWan - a.confirmedWan || b.activeOrders - a.activeOrders);
    return {
      key: "employee",
      title: BOARD_TABS.gm[3]!.label,
      columns: [
        { key: "user", label: L("员工", "Employee") },
        { key: "confirmedWan", label: L("确认订单额（万元）", "Confirmed (¥10k)"), unit: "wan" },
        { key: "deliveredWan", label: L("已交付（万元）", "Delivered (¥10k)"), unit: "wan" },
        { key: "activeOrders", label: L("在手订单", "Open POs"), unit: "count" },
        { key: "completionRate", label: L("任务完成率", "Task completion"), unit: "percent" },
        { key: "onTimeRate", label: L("任务按时率", "Task on time"), unit: "percent" },
        { key: "openRedHits", label: L("红灯巡检", "Red hits"), unit: "count" },
      ],
      rows,
    };
  }

  async snapshotLastWeek(): Promise<{ week: string; confirmedWan: number; onTimeRate: number | null; written: string[] }> {
    const ctx = systemContext();
    const today = this.clock.today();
    const week = addDays(weekStart(today), -7);
    const end = addDays(week, 6);
    const scope: MetricsScope = { ctx, orgIds: null, orgId: null, customerId: null, key: "ALL" };
    const data = await loadMetricsData(this.db, scope, end);
    const confirmed = data.orders.filter((o) => o.status !== "CANCELLED" && inRange(o.confirmedAt, week, end)).reduce((s, o) => s + orderCny(data, o), 0);
    const onTime = onTimeDelivery(data, week, end, today);
    const values = { confirmedWan: wan(confirmed), onTimeRate: pct(onTime.on, onTime.due) };
    const now = this.clock.now();
    const rows: Numbers = { [TREND_METRIC]: values.confirmedWan, ...(values.onTimeRate !== null ? { [ON_TIME_METRIC]: values.onTimeRate } : {}) };
    const written: string[] = [];
    for (const [metric, value] of Object.entries(rows)) {
      const inserted = await this.db
        .insert(metricSnapshots)
        .values({ metric, scopeKey: "ALL", period: `week:${week}`, value: Number(value), computedAt: now })
        .onConflictDoNothing({ target: [metricSnapshots.metric, metricSnapshots.scopeKey, metricSnapshots.period] })
        .returning({ id: metricSnapshots.id });
      if (inserted.length) written.push(metric);
    }
    if (written.length) this.logger.log(`weekly snapshot ${week}: ${values.confirmedWan} 万元`);
    return { week, ...values, written };
  }
}

function topShare(map: Map<string, number>, total: number): { id: string; cny: number; share: number } | null {
  if (total <= 0) return null;
  const top = [...map.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? { id: top[0], cny: top[1], share: (top[1] / total) * 100 } : null;
}

function countBy<T>(list: T[], key: (x: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const x of list) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

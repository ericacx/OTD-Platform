import { Inject, Injectable } from "@nestjs/common";
import { COLLECTION_CHANNELS, COLLECTION_RESULTS, COLLECTION_RESULT_LABELS } from "@otd/contracts/receivable";
import type { SearchType } from "@otd/contracts/mainline";
import {
  type Database,
  capacityLedgerVersions,
  customerOrders,
  customers,
  exchangeRates,
  kbDocuments,
  patrolHits,
  patrolRules,
  quoteRounds,
  quotes,
  receivables,
  styles,
  users,
  uuidv7,
} from "@otd/db";
import { LIGHTS, MODULES, SEVERITIES, addDays, daysBetween, round, statusLabel } from "@otd/shared";
import { type SQL, and, asc, desc, eq, gt, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { AiTool } from "../../core/ai/ai.types.js";
import { type AccessContext, hasPermission } from "../../core/access/access.types.js";
import { customerScoped, scoped } from "../../core/access/scope.js";
import { Clock } from "../../core/clock.js";
import { AppError } from "../../core/errors.js";
import { likeKeyword } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";
import { CapacityService } from "../capacity/capacity.service.js";
import { MainlineService } from "../mainline/mainline.service.js";
import { SearchService } from "../mainline/search.service.js";
import { TodoService } from "../todo/todo.service.js";
import type {
  CapacityOutput,
  CapacityRowBrief,
  DocsOutput,
  KbHit,
  KbOutput,
  MyTodosOutput,
  OrderStatsOutput,
  OrderStatusOutput,
  PatrolOutput,
  ProposalOutput,
  ProposalPreview,
  QuoteOutput,
  ReceivableBrief,
  ReceivablesOutput,
  RunState,
  TodoBrief,
  ToolName,
  ToolOutput,
} from "./assistant.types.js";

const ACTIVE_ORDER = ["PENDING_CONFIRM", "TO_SCHEDULE", "IN_PRODUCTION", "TO_SHIP"];
const OPEN_RECEIVABLE = ["NOT_DUE", "DUE", "PARTIAL"];
const SCOPE_LABEL: Record<string, string> = { SELF: "仅本人", ORG: "本组织", ORG_AND_CHILDREN: "本组织及下级", ALL: "全部数据" };
const SEARCH_TYPE_LABEL: Record<SearchType, string> = {
  order: "订单",
  customer: "客户",
  style: "款号",
  planning: "企划",
  sample: "打样",
  sampleShipment: "寄样",
  testRequest: "送测",
  testReport: "测试报告",
  quote: "报价",
  handover: "开发移交包",
  packaging: "包装方案",
  carton: "装箱单",
  purchase: "采购单",
  inspection: "验货",
  booking: "订舱",
  shipment: "出货",
  receivable: "应收",
};
const PATROL_LINK: Record<string, (id: string) => string> = {
  order: (id) => `/orders/${id}`,
  handover: (id) => `/documents/handovers/${id}`,
  inspection: (id) => `/inspections/${id}`,
  ledgerTask: () => "/capacity/tasks",
  packagingPlan: (id) => `/packaging/${id}`,
  planning: (id) => `/planning/${id}`,
  purchase: (id) => `/purchases/${id}`,
  quoteRound: () => "/quotes",
  sampleRound: () => "/samples",
  shipment: (id) => `/shipments/${id}`,
  testReport: (id) => `/tests/reports/${id}`,
  testRequest: (id) => `/tests/${id}`,
};
const CHANNEL_LABEL: Record<(typeof COLLECTION_CHANNELS)[number], string> = { EMAIL: "邮件", PHONE: "电话", WECHAT: "微信", CUSTOMER_SYSTEM: "客户系统" };

const empty = z.object({}).strict();
const poNoSchema = z.object({ poNo: z.string().trim().min(3).max(40) });
const querySchema = z.object({ query: z.string().trim().min(1).max(100) });
const patrolSchema = z.object({ light: z.enum(["RED", "YELLOW", "ALL"]).optional() });
const quoteSchema = z.object({ keyword: z.string().trim().min(1).max(40) });
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const proposeTodoSchema = z.object({
  title: z.string().trim().min(1).max(200),
  assignee: z.string().trim().max(40).optional(),
  dueDate: dateText.optional(),
  note: z.string().trim().max(1000).optional(),
  poNo: z.string().trim().max(40).optional(),
});
const proposeCollectionSchema = z.object({
  receivableNo: z.string().trim().min(3).max(40),
  channel: z.enum(COLLECTION_CHANNELS),
  result: z.enum(COLLECTION_RESULTS),
  note: z.string().trim().max(1000).optional(),
  nextFollowUp: dateText.optional(),
});

type ToolDef = { name: ToolName; description: string; inputSchema: Record<string, unknown>; schema: z.ZodType<Record<string, unknown>> };

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });

export const TOOL_DEFS: ToolDef[] = [
  { name: "order_stats", description: "统计当前用户权限范围内的在手客户订单：订单数、双数、货值（折美元）、生产中 / 待确认等状态数、按客户分布、未来 8 周每周到期订单数。", inputSchema: obj({}), schema: empty },
  { name: "order_status", description: "按客户 PO 号查询订单基本信息与主线 10 节点进度（当前节点、受阻原因）。", inputSchema: obj({ poNo: str("客户 PO 号，如 PO0010459") }, ["poNo"]), schema: poNoSchema },
  { name: "my_todos", description: "查询当前用户的待办，按已逾期 / 今日到期 / 后续分组。", inputSchema: obj({}), schema: empty },
  { name: "receivables_summary", description: "汇总权限范围内的应收：逾期笔数与金额（折美元）、本月到期、按客户的逾期分布与明细。", inputSchema: obj({}), schema: empty },
  { name: "capacity_summary", description: "读取最新发布的产能台账：集团余量、平均余量率、紧张的基地 × 针型。", inputSchema: obj({}), schema: empty },
  { name: "patrol_hits", description: "查询未关闭的业务巡检命中（红灯 / 黄灯），含规则、对象、判定说明。", inputSchema: obj({ light: str("灯色筛选，默认全部", { enum: ["RED", "YELLOW", "ALL"] }) }), schema: patrolSchema },
  { name: "quote_summary", description: "按款号（如 12593）或报价单号（如 QT-12593-04）查询报价轮次、价格与状态；有成本权限时附带成本与毛利。", inputSchema: obj({ keyword: str("款号或报价单号") }, ["keyword"]), schema: quoteSchema },
  { name: "search_kb", description: "检索知识库与客户手册（制度、操作指南、常见问题、客户规则口径），返回相关文档片段。", inputSchema: obj({ query: str("检索关键词，如「QRS」「箱唛」「测试报告复用」") }, ["query"]), schema: querySchema },
  { name: "search_docs", description: "全局搜索单据：订单号、款号、客户名或内部单号（如 INSP-2610-020、AR-202610-001）。", inputSchema: obj({ query: str("单号、款号或客户名") }, ["query"]), schema: querySchema },
  {
    name: "propose_todo",
    description: "为当前用户或其下属起草一条待办。只生成草稿，用户在界面确认后才会创建。",
    inputSchema: obj(
      {
        title: str("待办标题"),
        assignee: str("指派给谁（姓名），不填为当前用户"),
        dueDate: str("截止日期 YYYY-MM-DD"),
        note: str("补充说明"),
        poNo: str("关联的客户 PO 号"),
      },
      ["title"],
    ),
    schema: proposeTodoSchema,
  },
  {
    name: "propose_collection_log",
    description: "为一张应收单起草催收记录。只生成草稿，用户在界面确认后才会写入。",
    inputSchema: obj(
      {
        receivableNo: str("应收单号，如 AR-202610-001"),
        channel: str("催收渠道", { enum: [...COLLECTION_CHANNELS] }),
        result: str("催收结果", { enum: [...COLLECTION_RESULTS] }),
        note: str("催收说明"),
        nextFollowUp: str("下次跟进日期 YYYY-MM-DD"),
      },
      ["receivableNo", "channel", "result"],
    ),
    schema: proposeCollectionSchema,
  },
];

@Injectable()
export class AssistantTools {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly clock: Clock,
    private readonly mainline: MainlineService,
    private readonly search: SearchService,
    private readonly todos: TodoService,
    private readonly capacity: CapacityService,
  ) {}

  build(ctx: AccessContext, state: RunState): AiTool[] {
    return TOOL_DEFS.map((def) => ({
      name: def.name,
      description: def.description,
      inputSchema: def.inputSchema,
      run: async (raw: Record<string, unknown>) => {
        const parsed = def.schema.safeParse(raw ?? {});
        if (!parsed.success) throw new Error(`参数无效：${parsed.error.issues.map((i) => `${i.path.join(".") || "input"} ${i.message}`).join("；")}`);
        const output = await this.exec(def.name, ctx, state, parsed.data);
        state.calls.push({ tool: def.name, input: parsed.data, output });
        return output;
      },
    }));
  }

  private exec(name: ToolName, ctx: AccessContext, state: RunState, input: Record<string, unknown>): Promise<ToolOutput> {
    switch (name) {
      case "order_stats":
        return this.orderStats(ctx, state);
      case "order_status":
        return this.orderStatus(ctx, state, input as z.infer<typeof poNoSchema>);
      case "my_todos":
        return this.myTodos(ctx, state);
      case "receivables_summary":
        return this.receivablesSummary(ctx, state);
      case "capacity_summary":
        return this.capacitySummary(ctx);
      case "patrol_hits":
        return this.patrolHits(ctx, state, input as z.infer<typeof patrolSchema>);
      case "quote_summary":
        return this.quoteSummary(ctx, state, input as z.infer<typeof quoteSchema>);
      case "search_kb":
        return this.searchKb(ctx, state, input as z.infer<typeof querySchema>);
      case "search_docs":
        return this.searchDocs(ctx, state, input as z.infer<typeof querySchema>);
      case "propose_todo":
        return this.proposeTodo(ctx, state, input as z.infer<typeof proposeTodoSchema>);
      case "propose_collection_log":
        return this.proposeCollection(ctx, state, input as z.infer<typeof proposeCollectionSchema>);
    }
  }

  private base<N extends ToolName>(tool: N, module: string, label: string, asOf?: string) {
    return { tool, source: { module, label, asOf: asOf ?? this.clock.now().toISOString() }, excluded: 0, denied: null as string | null };
  }

  private allowed(ctx: AccessContext, codes: string[]): boolean {
    return codes.some((c) => hasPermission(ctx, c));
  }

  async blockedCustomers(state: RunState, ids: (string | null | undefined)[]): Promise<Set<string>> {
    const uniq = [...new Set(ids.filter((x): x is string => !!x))];
    if (!state.external || !uniq.length) return new Set();
    const rows = await this.db.select({ id: customers.id }).from(customers).where(and(inArray(customers.id, uniq), eq(customers.aiAllowed, false)));
    return new Set(rows.map((r) => r.id));
  }

  private async customerNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
    const uniq = [...new Set(ids.filter((x): x is string => !!x))];
    if (!uniq.length) return new Map();
    return new Map((await this.db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, uniq))).map((c) => [c.id, c.name]));
  }

  private async rates(): Promise<(amount: number, currency: string) => number> {
    const today = this.clock.today();
    const rows = await this.db.select().from(exchangeRates).orderBy(desc(exchangeRates.effectiveDate));
    const rate = (cur: string) => (rows.find((r) => r.currency === cur && r.effectiveDate <= today) ?? rows.find((r) => r.currency === cur))?.rateToCny;
    const usd = rate("USD") ?? 1;
    return (amount, currency) => {
      if (currency === "USD") return amount;
      const r = currency === "CNY" ? (rate("CNY") ?? 1) : rate(currency);
      return r === undefined ? 0 : (amount * r) / usd;
    };
  }

  scopeLabel(ctx: AccessContext): string {
    const customerPart = ctx.customerScope.mode === "ALL" ? "全部客户" : `${ctx.customerScope.customerIds.length} 家客户`;
    return `${SCOPE_LABEL[ctx.dataScope.mode] ?? ctx.dataScope.mode} · ${customerPart}`;
  }

  private async orderStats(ctx: AccessContext, state: RunState): Promise<OrderStatsOutput> {
    const out = this.base("order_stats", "order", "订单管理 · 客户订单");
    const scope = this.scopeLabel(ctx);
    const blank = { scope, totals: { orders: 0, pairs: 0, valueUsd: 0, inProduction: 0, pendingConfirm: 0, toSchedule: 0, toShip: 0, customers: 0, overdue: 0 }, byCustomer: [], weeks: [], weeklyAverage: 0 };
    if (!this.allowed(ctx, ["order.order.view", "order.monitor.view"])) return { ...out, ...blank, denied: "无权查看订单数据" };
    const rows = await this.db
      .select({ id: customerOrders.id, customerId: customerOrders.customerId, status: customerOrders.status, totalPairs: customerOrders.totalPairs, fobAmount: customerOrders.fobAmount, currency: customerOrders.currency, customerDueDate: customerOrders.customerDueDate })
      .from(customerOrders)
      .where(and(scoped(customerOrders, ctx), inArray(customerOrders.status, ACTIVE_ORDER)));
    const blocked = await this.blockedCustomers(state, rows.map((r) => r.customerId));
    const kept = rows.filter((r) => !blocked.has(r.customerId));
    const toUsd = await this.rates();
    const names = await this.customerNames(kept.map((r) => r.customerId));
    const today = this.clock.today();
    const total = kept.length;
    const groups = new Map<string, { orders: number; pairs: number }>();
    for (const r of kept) {
      const g = groups.get(r.customerId) ?? { orders: 0, pairs: 0 };
      g.orders += 1;
      g.pairs += r.totalPairs;
      groups.set(r.customerId, g);
    }
    const byCustomer = [...groups.entries()]
      .map(([customerId, g]) => ({ customerId, customerName: names.get(customerId) ?? "", orders: g.orders, pairs: g.pairs, share: total ? round((g.orders / total) * 100, 1) : 0 }))
      .sort((a, b) => b.orders - a.orders || b.pairs - a.pairs || a.customerName.localeCompare(b.customerName));
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const start = addDays(today, i * 7);
      const end = addDays(today, (i + 1) * 7);
      return { start, label: start.slice(5), due: kept.filter((r) => r.customerDueDate >= start && r.customerDueDate < end).length };
    });
    const count = (s: string) => kept.filter((r) => r.status === s).length;
    return {
      ...out,
      excluded: rows.length - kept.length,
      scope,
      totals: {
        orders: total,
        pairs: kept.reduce((s, r) => s + r.totalPairs, 0),
        valueUsd: round(kept.reduce((s, r) => s + toUsd(r.fobAmount ?? 0, r.currency), 0), 2),
        inProduction: count("IN_PRODUCTION"),
        pendingConfirm: count("PENDING_CONFIRM"),
        toSchedule: count("TO_SCHEDULE"),
        toShip: count("TO_SHIP"),
        customers: groups.size,
        overdue: kept.filter((r) => r.customerDueDate < today).length,
      },
      byCustomer,
      weeks,
      weeklyAverage: round(weeks.reduce((s, w) => s + w.due, 0) / weeks.length, 2),
    };
  }

  private async orderStatus(ctx: AccessContext, state: RunState, input: z.infer<typeof poNoSchema>): Promise<OrderStatusOutput> {
    const poNo = input.poNo.trim().toUpperCase();
    const out = { ...this.base("order_status", "order", "订单管理 · 订单监控"), poNo, found: false, order: null, mainline: null };
    if (!this.allowed(ctx, ["order.monitor.view", "order.order.view"])) return { ...out, denied: "无权查看订单进度" };
    let dto;
    try {
      dto = await this.mainline.monitor(ctx, poNo);
    } catch (err) {
      if (err instanceof AppError && err.status === 404) return out;
      throw err;
    }
    if ((await this.blockedCustomers(state, [dto.order.customerId])).size) return { ...out, excluded: 1 };
    const m = dto.mainline;
    return {
      ...out,
      found: true,
      order: {
        id: dto.order.id,
        poNo: dto.order.poNo,
        customerName: dto.order.customerName,
        styleSummary: dto.order.styleSummary,
        totalPairs: dto.order.totalPairs,
        customerDueDate: dto.order.customerDueDate,
        factoryName: dto.order.factoryName,
        status: dto.order.status,
        statusLabel: statusLabel("order", dto.order.status).zh,
      },
      mainline: {
        headline: m.headline.zh,
        completedCount: m.completedCount,
        total: m.total,
        currentNode: m.currentNode,
        nodes: m.nodes.map((n) => ({ code: n.code, name: n.name.zh, state: n.state, gate: n.gate, summary: n.summary.zh, blockedReasons: n.blockedReasons.map((b) => b.zh), link: n.link })),
      },
    };
  }

  private async myTodos(ctx: AccessContext, state: RunState): Promise<MyTodosOutput> {
    const out = this.base("my_todos", "todo", "今日待办 · 我的待办");
    const blank = { counts: { total: 0, overdue: 0, today: 0, later: 0 }, overdue: [], today: [], later: [] };
    if (!this.allowed(ctx, ["todo.todo.view"])) return { ...out, ...blank, denied: "无权查看待办" };
    const board = await this.todos.board(ctx);
    const all = [...board.overdue, ...board.today, ...board.later];
    const blocked = await this.blockedCustomers(state, all.map((i) => i.customerId));
    const keep = (items: typeof all) => items.filter((i) => !i.customerId || !blocked.has(i.customerId));
    const brief = (i: (typeof all)[number]): TodoBrief => ({ title: i.title, docNo: i.docNo, customerName: i.customerName, dueAt: i.dueAt, overdueDays: i.overdueDays, link: i.link });
    const overdue = keep(board.overdue);
    const today = keep(board.today);
    const later = keep(board.later);
    return {
      ...out,
      excluded: all.length - overdue.length - today.length - later.length,
      counts: { total: overdue.length + today.length + later.length, overdue: overdue.length, today: today.length, later: later.length },
      overdue: overdue.slice(0, 10).map(brief),
      today: today.slice(0, 10).map(brief),
      later: later.slice(0, 6).map(brief),
    };
  }

  private async receivablesSummary(ctx: AccessContext, state: RunState): Promise<ReceivablesOutput> {
    const out = this.base("receivables_summary", "receivable", "应收结算 · 应收台账");
    const blank = { totals: { overdueCount: 0, overdueUsd: 0, avgOverdueDays: 0, dueThisMonthCount: 0, dueThisMonthUsd: 0, openCount: 0, openUsd: 0 }, byCustomer: [], overdue: [], dueThisMonth: [] };
    if (!this.allowed(ctx, ["receivable.receivable.view", "receivable.collection.view"])) return { ...out, ...blank, denied: "无权查看应收数据" };
    const rows = await this.db.select().from(receivables).where(and(scoped(receivables, ctx), inArray(receivables.status, OPEN_RECEIVABLE), gt(receivables.amount, 0)));
    const blocked = await this.blockedCustomers(state, rows.map((r) => r.customerId));
    const kept = rows.filter((r) => !blocked.has(r.customerId));
    const toUsd = await this.rates();
    const names = await this.customerNames(kept.map((r) => r.customerId));
    const today = this.clock.today();
    const month = today.slice(0, 7);
    const brief = (r: (typeof kept)[number]): ReceivableBrief => {
      const outstanding = round(r.amount - r.receivedAmount, 2);
      return { id: r.id, docNo: r.docNo, customerName: names.get(r.customerId) ?? "", currency: r.currency, outstanding, outstandingUsd: round(toUsd(outstanding, r.currency), 2), dueDate: r.dueDate, overdueDays: Math.max(0, daysBetween(r.dueDate, today)), link: `/receivables/${r.id}` };
    };
    const all = kept.map(brief);
    const overdue = all.filter((r) => r.dueDate < today).sort((a, b) => b.overdueDays - a.overdueDays || b.outstandingUsd - a.outstandingUsd);
    const dueThisMonth = all.filter((r) => r.dueDate >= today && r.dueDate.startsWith(month)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const groups = new Map<string, { count: number; usd: number }>();
    for (const r of overdue) {
      const g = groups.get(r.customerName) ?? { count: 0, usd: 0 };
      g.count += 1;
      g.usd = round(g.usd + r.outstandingUsd, 2);
      groups.set(r.customerName, g);
    }
    const sum = (list: ReceivableBrief[]) => round(list.reduce((s, r) => s + r.outstandingUsd, 0), 2);
    return {
      ...out,
      excluded: rows.length - kept.length,
      totals: {
        overdueCount: overdue.length,
        overdueUsd: sum(overdue),
        avgOverdueDays: overdue.length ? round(overdue.reduce((s, r) => s + r.overdueDays, 0) / overdue.length, 1) : 0,
        dueThisMonthCount: dueThisMonth.length,
        dueThisMonthUsd: sum(dueThisMonth),
        openCount: all.length,
        openUsd: sum(all),
      },
      byCustomer: [...groups.entries()].map(([customerName, g]) => ({ customerName, ...g })).sort((a, b) => b.usd - a.usd),
      overdue: overdue.slice(0, 10),
      dueThisMonth: dueThisMonth.slice(0, 10),
    };
  }

  private async capacitySummary(ctx: AccessContext): Promise<CapacityOutput> {
    const out = { ...this.base("capacity_summary", "capacity", "计划管理 · 产能台账"), found: false, versionLabel: null, kpis: null, tight: [], lowest: [] };
    if (!this.allowed(ctx, ["capacity.ledger.view"])) return { ...out, denied: "无权查看产能台账" };
    const published = (await this.db.select({ id: capacityLedgerVersions.id }).from(capacityLedgerVersions).where(eq(capacityLedgerVersions.status, "PUBLISHED")).limit(1))[0];
    if (!published) return out;
    const detail = await this.capacity.summary(true);
    const knit = detail.rows.filter((r) => r.ledger === "KNIT" && r.spareRate !== null);
    const brief = (r: (typeof knit)[number]): CapacityRowBrief => ({ baseName: r.baseName, needleCode: r.needleCode, spareRate: r.spareRate, spareCapacity: r.spareCapacity, unproducedQty: r.unproducedQty, cumulativeCapacity: r.cumulativeCapacity, tight: r.tight });
    const asOf = detail.version.publishedAt ?? `${detail.version.asOfDate}T00:00:00.000Z`;
    return {
      ...out,
      source: { module: "capacity", label: `计划管理 · 产能台账 ${detail.version.label}`, asOf },
      found: true,
      versionLabel: detail.version.label,
      kpis: { groupSpareWan: detail.kpis.groupSpareWan, avgSpareRate: detail.kpis.avgSpareRate, tightCount: detail.kpis.tightCount, tightThreshold: detail.kpis.tightThreshold },
      tight: knit.filter((r) => r.tight).sort((a, b) => (a.spareRate ?? 0) - (b.spareRate ?? 0)).map(brief),
      lowest: [...knit].sort((a, b) => (a.spareRate ?? 0) - (b.spareRate ?? 0)).slice(0, 8).map(brief),
    };
  }

  private async patrolHits(ctx: AccessContext, state: RunState, input: z.infer<typeof patrolSchema>): Promise<PatrolOutput> {
    const out = { ...this.base("patrol_hits", "patrol", "业务巡检 · 巡检命中"), red: 0, yellow: 0, byModule: [], hits: [] };
    if (!this.allowed(ctx, ["patrol.dashboard.view"])) return { ...out, denied: "无权查看业务巡检" };
    const lights = !input.light || input.light === "ALL" ? ["RED", "YELLOW"] : [input.light];
    const conds: SQL[] = [ne(patrolHits.status, "CLOSED"), inArray(patrolHits.light, lights), or(isNull(patrolHits.customerId), customerScoped(patrolHits.customerId, ctx))!];
    if (!ctx.system && ctx.dataScope.mode === "SELF") conds.push(eq(patrolHits.assigneeId, ctx.userId));
    const rows = await this.db
      .select({ hit: patrolHits, ruleCode: patrolRules.code, ruleName: patrolRules.name })
      .from(patrolHits)
      .leftJoin(patrolRules, eq(patrolRules.id, patrolHits.ruleId))
      .where(and(...conds))
      .orderBy(asc(patrolHits.light), desc(patrolHits.overdueDays), asc(patrolHits.firstSeenAt));
    const blocked = await this.blockedCustomers(state, rows.map((r) => r.hit.customerId));
    const kept = rows.filter((r) => !r.hit.customerId || !blocked.has(r.hit.customerId));
    const moduleLabel = (key: string) => MODULES.find((m) => m.key === key)?.label.zh ?? key;
    const byModule = new Map<string, number>();
    for (const r of kept) byModule.set(r.hit.module, (byModule.get(r.hit.module) ?? 0) + 1);
    return {
      ...out,
      excluded: rows.length - kept.length,
      red: kept.filter((r) => r.hit.light === "RED").length,
      yellow: kept.filter((r) => r.hit.light === "YELLOW").length,
      byModule: [...byModule.entries()].map(([module, count]) => ({ module, label: moduleLabel(module), count })).sort((a, b) => b.count - a.count),
      hits: kept.slice(0, 12).map((r) => ({
        light: LIGHTS[r.hit.light as keyof typeof LIGHTS]?.label.zh ?? r.hit.light,
        severity: SEVERITIES[r.hit.severity as keyof typeof SEVERITIES]?.label.zh ?? r.hit.severity,
        ruleCode: r.ruleCode ?? "",
        ruleName: r.ruleName ?? "",
        module: moduleLabel(r.hit.module),
        targetNo: r.hit.targetNo,
        targetName: r.hit.targetName,
        message: r.hit.message.zh,
        overdueDays: r.hit.overdueDays,
        link: PATROL_LINK[r.hit.targetType]?.(r.hit.targetId) ?? "/patrol",
      })),
    };
  }

  private async quoteSummary(ctx: AccessContext, state: RunState, input: z.infer<typeof quoteSchema>): Promise<QuoteOutput> {
    const keyword = input.keyword.trim().replace(/^#/, "").toUpperCase();
    const costVisible = hasPermission(ctx, "quote.cost.view");
    const out = { ...this.base("quote_summary", "quote", "报价管理 · 报价单"), keyword, costVisible, quotes: [] };
    if (!this.allowed(ctx, ["quote.quote.view"])) return { ...out, denied: "无权查看报价" };
    const strategyVisible = hasPermission(ctx, "quote.strategy.view");
    const roundHit = keyword.startsWith("QT-") ? await this.db.select({ quoteId: quoteRounds.quoteId }).from(quoteRounds).where(sql`upper(${quoteRounds.docNo}) = ${keyword}`) : [];
    const styleHit = await this.db.select({ id: styles.id }).from(styles).where(sql`upper(${styles.styleNo}) = ${keyword}`);
    const matchers: SQL[] = [];
    if (roundHit.length) matchers.push(inArray(quotes.id, roundHit.map((r) => r.quoteId)));
    if (styleHit.length) matchers.push(inArray(quotes.styleId, styleHit.map((s) => s.id)));
    if (!matchers.length) return out;
    const rows = await this.db.select({ quote: quotes, styleNo: styles.styleNo }).from(quotes).innerJoin(styles, eq(styles.id, quotes.styleId)).where(and(scoped(quotes, ctx), or(...matchers)));
    const blocked = await this.blockedCustomers(state, rows.map((r) => r.quote.customerId));
    const kept = rows.filter((r) => !blocked.has(r.quote.customerId));
    const names = await this.customerNames(kept.map((r) => r.quote.customerId));
    const rounds = kept.length ? await this.db.select().from(quoteRounds).where(inArray(quoteRounds.quoteId, kept.map((r) => r.quote.id))).orderBy(asc(quoteRounds.roundNo)) : [];
    return {
      ...out,
      excluded: rows.length - kept.length,
      quotes: kept.map(({ quote, styleNo }) => ({
        quoteId: quote.id,
        styleNo,
        customerName: names.get(quote.customerId) ?? "",
        status: quote.status,
        ...(strategyVisible ? { targetPriceUsd: quote.targetPriceUsd } : {}),
        ...(costVisible ? { costTotal: quote.costTotal } : {}),
        link: `/quotes/${quote.id}`,
        rounds: rounds
          .filter((r) => r.quoteId === quote.id)
          .map((r) => ({
            docNo: r.docNo,
            kind: r.kind === "INTERNAL" ? "内部报价" : "客户报价",
            roundNo: r.roundNo,
            status: statusLabel("quoteRound", r.status).zh,
            priceUsd: r.priceUsd,
            priceCny: r.priceCny,
            quantity: r.quantity,
            quotedAt: r.quotedAt ? r.quotedAt.toISOString() : null,
            ...(costVisible ? { costTotal: r.costTotal, margin: r.margin, guardrailPassed: r.guardrailPassed } : {}),
          })),
      })),
    };
  }

  private async searchKb(ctx: AccessContext, state: RunState, input: z.infer<typeof querySchema>): Promise<KbOutput> {
    const terms = extractTerms(input.query);
    const out = { ...this.base("search_kb", "document", "资料管理 · 知识库"), query: input.query, terms, hits: [] as KbHit[] };
    const kinds = [hasPermission(ctx, "document.kb.view") ? "KB" : null, hasPermission(ctx, "document.manual.view") ? "MANUAL" : null].filter((k): k is string => !!k);
    if (!kinds.length) return { ...out, denied: "无权查看知识库" };
    if (!terms.length) return out;
    const matchers = terms.flatMap((t) => {
      const kw = likeKeyword(t)!;
      return [ilike(kbDocuments.title, kw), ilike(kbDocuments.content, kw)];
    });
    const rows = await this.db
      .select()
      .from(kbDocuments)
      .where(and(inArray(kbDocuments.kind, kinds), or(isNull(kbDocuments.customerId), customerScoped(kbDocuments.customerId, ctx)), or(...matchers)))
      .limit(50);
    const blocked = await this.blockedCustomers(state, rows.map((r) => r.customerId));
    const kept = rows.filter((r) => !r.customerId || !blocked.has(r.customerId));
    const names = await this.customerNames(kept.map((r) => r.customerId));
    const scored = kept
      .map((r) => {
        const title = r.title.toLowerCase();
        const content = r.content.toLowerCase();
        let score = 0;
        let best: string | null = null;
        for (const t of terms) {
          const lt = t.toLowerCase();
          const weight = t.length >= 3 ? 2 : 1;
          const inTitle = title.includes(lt);
          const inContent = content.includes(lt);
          if (inTitle) score += 3 * weight;
          if (inContent) score += weight;
          if (inContent && (!best || t.length > best.length)) best = t;
        }
        return { r, score, best };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.r.updatedAt.getTime() - a.r.updatedAt.getTime())
      .slice(0, 3);
    const hits: KbHit[] = scored.map(({ r, best }) => ({
      id: r.id,
      title: r.title,
      kind: r.kind === "MANUAL" ? "客户手册" : "知识库",
      customerName: r.customerId ? (names.get(r.customerId) ?? null) : null,
      snippet: snippetOf(r.content, best),
      link: r.kind === "MANUAL" ? `/documents/manuals?id=${r.id}` : `/documents/kb?id=${r.id}`,
      updatedAt: r.updatedAt.toISOString(),
    }));
    return { ...out, excluded: rows.length - kept.length, hits };
  }

  private async searchDocs(ctx: AccessContext, state: RunState, input: z.infer<typeof querySchema>): Promise<DocsOutput> {
    const out = { ...this.base("search_docs", "search", "全局搜索 · 有权限的单据"), query: input.query, results: [] };
    const results = await this.search.search(ctx, input.query, 5);
    let kept = results;
    if (state.external && results.length) {
      const orderIds = results.filter((r) => r.type === "order").map((r) => r.id);
      const orderCustomers = orderIds.length ? await this.db.select({ id: customerOrders.id, customerId: customerOrders.customerId }).from(customerOrders).where(inArray(customerOrders.id, orderIds)) : [];
      const customerOf = new Map(orderCustomers.map((o) => [o.id, o.customerId]));
      const blocked = await this.blockedCustomers(state, [...orderCustomers.map((o) => o.customerId), ...results.filter((r) => r.type === "customer").map((r) => r.id)]);
      kept = results.filter((r) => (r.type === "order" ? !blocked.has(customerOf.get(r.id) ?? "") : r.type === "customer" ? !blocked.has(r.id) : true));
    }
    return { ...out, excluded: results.length - kept.length, results: kept.slice(0, 12).map((r) => ({ type: r.type, typeLabel: SEARCH_TYPE_LABEL[r.type], docNo: r.docNo, title: r.title, link: r.link })) };
  }

  async assignableUsers(ctx: AccessContext): Promise<{ id: string; name: string }[]> {
    const conds: SQL[] = [eq(users.status, "ACTIVE")];
    if (ctx.dataScope.mode === "SELF") conds.push(eq(users.id, ctx.userId));
    else if (ctx.dataScope.mode !== "ALL") conds.push(or(eq(users.id, ctx.userId), ctx.dataScope.orgIds.length ? inArray(users.primaryOrgId, ctx.dataScope.orgIds) : sql`false`)!);
    return this.db.select({ id: users.id, name: users.name }).from(users).where(and(...conds));
  }

  private async proposeTodo(ctx: AccessContext, state: RunState, input: z.infer<typeof proposeTodoSchema>): Promise<ProposalOutput> {
    const out = { ...this.base("propose_todo", "todo", "今日待办 · 起草待办"), ok: false, message: "", proposalId: null, preview: null };
    if (!this.allowed(ctx, ["todo.todo.view"])) return { ...out, denied: "无权创建待办", message: "无权创建待办" };
    const candidates = await this.assignableUsers(ctx);
    const wanted = input.assignee?.trim();
    const assignee = !wanted || /^(我|自己|本人)$/.test(wanted) ? candidates.find((u) => u.id === ctx.userId) : candidates.find((u) => u.name === wanted);
    if (!assignee) return { ...out, message: wanted ? `「${wanted}」不是你可以指派的人，只能给自己或下属建待办` : "只能给自己或下属建待办" };
    let order: { id: string; poNo: string; customerId: string } | undefined;
    if (input.poNo) {
      order = (await this.db.select({ id: customerOrders.id, poNo: customerOrders.poNo, customerId: customerOrders.customerId }).from(customerOrders).where(and(scoped(customerOrders, ctx), sql`upper(${customerOrders.poNo}) = ${input.poNo.trim().toUpperCase()}`)).limit(1))[0];
    }
    const id = uuidv7();
    const dueDate = input.dueDate ?? null;
    const payload = { title: input.title, note: input.note ?? null, assigneeId: assignee.id, assigneeName: assignee.name, dueDate, orderId: order?.id ?? null, poNo: order?.poNo ?? null, customerId: order?.customerId ?? null };
    const targets: ProposalPreview["targets"] = [{ type: "user", id: assignee.id, label: `指派给 ${assignee.name}`, link: null }];
    if (order) targets.push({ type: "order", id: order.id, label: `关联订单 ${order.poNo}`, link: `/orders/${order.id}` });
    const fields = [
      { label: "标题", value: input.title },
      { label: "负责人", value: assignee.name },
      { label: "截止日期", value: dueDate ?? "未设置" },
    ];
    if (input.note) fields.push({ label: "说明", value: input.note });
    if (order) fields.push({ label: "关联订单", value: order.poNo });
    const preview = { title: "新建待办", summary: `给 ${assignee.id === ctx.userId ? "自己" : assignee.name} 建一条待办「${input.title}」${dueDate ? `，截止 ${dueDate}` : ""}`, targets, fields };
    state.proposals.push({ id, kind: "TODO", payload, preview });
    return { ...out, ok: true, message: "已生成待办草稿，等待用户确认", proposalId: id, preview };
  }

  private async proposeCollection(ctx: AccessContext, state: RunState, input: z.infer<typeof proposeCollectionSchema>): Promise<ProposalOutput> {
    const out = { ...this.base("propose_collection_log", "receivable", "应收结算 · 起草催收记录"), ok: false, message: "", proposalId: null, preview: null };
    if (!this.allowed(ctx, ["receivable.collection.log"])) return { ...out, denied: "无权记录催收", message: "无权记录催收" };
    const docNo = input.receivableNo.trim().toUpperCase();
    const row = (await this.db.select().from(receivables).where(and(scoped(receivables, ctx), sql`upper(${receivables.docNo}) = ${docNo}`)).limit(1))[0];
    if (!row) return { ...out, message: `没有找到你有权查看的应收单 ${docNo}` };
    if ((await this.blockedCustomers(state, [row.customerId])).size) return { ...out, excluded: 1, message: `应收单 ${docNo} 所属客户不参与 AI 处理，请在催收工作台手工记录` };
    if (!OPEN_RECEIVABLE.includes(row.status)) return { ...out, message: `应收单 ${docNo} 当前状态为「${statusLabel("receivable", row.status).zh}」，不需要催收` };
    const customerName = (await this.customerNames([row.customerId])).get(row.customerId) ?? "";
    const id = uuidv7();
    const payload = { receivableId: row.id, docNo: row.docNo, channel: input.channel, result: input.result, note: input.note ?? null, nextFollowUp: input.nextFollowUp ?? null };
    const fields = [
      { label: "应收单", value: `${row.docNo} · ${customerName}` },
      { label: "未收金额", value: `${row.currency} ${round(row.amount - row.receivedAmount, 2).toLocaleString("en-US")}` },
      { label: "渠道", value: CHANNEL_LABEL[input.channel] },
      { label: "结果", value: COLLECTION_RESULT_LABELS[input.result].zh },
      { label: "下次跟进", value: input.nextFollowUp ?? "未设置" },
    ];
    if (input.note) fields.push({ label: "说明", value: input.note });
    const preview = { title: "记录催收", summary: `给应收单 ${row.docNo}（${customerName}）记录一次${CHANNEL_LABEL[input.channel]}催收：${COLLECTION_RESULT_LABELS[input.result].zh}`, targets: [{ type: "receivable", id: row.id, label: `应收单 ${row.docNo}`, link: `/receivables/${row.id}` }], fields };
    state.proposals.push({ id, kind: "COLLECTION_LOG", payload, preview });
    return { ...out, ok: true, message: "已生成催收记录草稿，等待用户确认", proposalId: id, preview };
  }
}

const STOP_WORDS = /(请问|请|帮我|帮忙|麻烦|一下|怎么做|怎么办|怎么弄|怎么|如何|什么是|是什么|是啥|啥是|什么|有哪些|哪些|能否|能不能|可以吗|可不可以|要不要|需要|要求|规定|有关|关于|相关|知识库|资料|告诉我|查查|查一下|查询|查|吗|呢|吧|的|了|我们|我|你)/g;

export function extractTerms(query: string): string[] {
  const cleaned = query.replace(/[？?！!。，,、；;：:“”"'‘’（）()【】[\]《》<>]/g, " ").replace(STOP_WORDS, " ");
  const tokens = cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  const out: string[] = [];
  for (const t of tokens) {
    if (!out.includes(t)) out.push(t);
    if (/^[一-龥]{5,}$/.test(t)) {
      for (let i = 0; i + 2 <= t.length; i++) {
        const bi = t.slice(i, i + 2);
        if (!out.includes(bi)) out.push(bi);
      }
    }
  }
  return out.slice(0, 16);
}

function snippetOf(content: string, term: string | null): string {
  const flat = content.replace(/\s+/g, " ").trim();
  if (!term) return flat.slice(0, 160) + (flat.length > 160 ? "…" : "");
  const idx = flat.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return flat.slice(0, 160) + (flat.length > 160 ? "…" : "");
  const start = Math.max(0, idx - 40);
  const end = Math.min(flat.length, idx + 180);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

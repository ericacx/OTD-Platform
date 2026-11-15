import type { AssistantAction, AssistantCard, AssistantSource, TableCard } from "@otd/contracts/assistant";
import { TOOL_ORDER, type ToolCallRecord, type ToolOutput } from "./assistant.types.js";

const fmt = (n: number, digits = 2) => n.toLocaleString("en-US", { maximumFractionDigits: digits });
const pct = (fraction: number | null) => (fraction === null ? 0 : Math.round(fraction * 1000) / 10);

export function latestCalls(calls: ToolCallRecord[]): ToolCallRecord[] {
  const byKey = new Map<string, ToolCallRecord>();
  for (const c of calls) byKey.set(`${c.tool}:${JSON.stringify(c.input)}`, c);
  return [...byKey.values()].sort((a, b) => TOOL_ORDER.indexOf(a.tool) - TOOL_ORDER.indexOf(b.tool));
}

export function present(calls: ToolCallRecord[]): { cards: AssistantCard[]; sources: AssistantSource[]; actions: AssistantAction[] } {
  const cards: AssistantCard[] = [];
  const sources: AssistantSource[] = [];
  const actions: AssistantAction[] = [];
  for (const { output } of latestCalls(calls)) {
    const part = presentOne(output);
    cards.push(...part.cards);
    actions.push(...part.actions);
    if (!sources.some((s) => s.module === output.source.module && s.label === output.source.label)) sources.push(output.source);
  }
  const uniqueActions = actions.filter((a, i) => actions.findIndex((b) => b.link === a.link) === i);
  return { cards: cards.slice(0, 16), sources, actions: uniqueActions.slice(0, 6) };
}

export function excludedCount(calls: ToolCallRecord[]): number {
  return latestCalls(calls).reduce((s, c) => s + c.output.excluded, 0);
}

function deniedCard(reason: string): AssistantCard {
  return { type: "highlight", tone: "danger", label: "无权查看", value: reason, link: null };
}

function table(title: string | null, columns: [string, string, ("left" | "right")?][], rows: TableCard["rows"]): TableCard {
  return { type: "table", title, columns: columns.map(([key, label, align]) => ({ key, label, align: align ?? "left" })), rows };
}

function presentOne(o: ToolOutput): { cards: AssistantCard[]; actions: AssistantAction[] } {
  if (o.denied) return { cards: [deniedCard(o.denied)], actions: [] };
  switch (o.tool) {
    case "order_stats": {
      const t = o.totals;
      const cards: AssistantCard[] = [
        {
          type: "kpis",
          title: null,
          items: [
            { label: "订单总数", value: t.orders, unit: "张", format: "int", currency: null, link: "/orders" },
            { label: "双数", value: t.pairs, unit: "双", format: "int", currency: null, link: null },
            { label: "货值（USD）", value: t.valueUsd, unit: null, format: "money", currency: "USD", link: null },
            { label: "生产中", value: t.inProduction, unit: "张", format: "int", currency: null, link: "/orders?status=IN_PRODUCTION" },
          ],
        },
        { type: "highlight", tone: t.pendingConfirm > 0 ? "warning" : "success", label: "待确认", value: `${t.pendingConfirm} 张`, link: "/orders?status=PENDING_CONFIRM" },
      ];
      if (o.byCustomer.length) {
        cards.push({ type: "bar", title: "按客户订单分布", unit: "张", items: o.byCustomer.map((c) => ({ label: c.customerName, value: c.orders, display: `${c.orders} 张 · ${c.share}%`, link: `/orders?customerId=${c.customerId}` })) });
      }
      if (o.weeks.length) cards.push({ type: "line", title: "未来 8 周交期压力（每周到期订单数）", unit: "张", points: o.weeks.map((w) => ({ label: w.label, value: w.due })), average: o.weeklyAverage });
      return { cards, actions: [{ label: "查看订单列表", link: "/orders" }] };
    }
    case "order_status": {
      if (!o.found || !o.order || !o.mainline) return { cards: [], actions: [] };
      const m = o.mainline;
      const monitor = `/orders/monitor?poNo=${encodeURIComponent(o.order.poNo)}`;
      const cards: AssistantCard[] = [
        { type: "timeline", title: `${o.order.poNo} · ${o.order.customerName} · ${o.order.styleSummary}`, headline: m.headline, completedCount: m.completedCount, total: m.total, currentNode: m.currentNode, nodes: m.nodes, link: monitor },
      ];
      for (const n of m.nodes.filter((x) => x.state === "BLOCKED")) {
        cards.push({ type: "highlight", tone: "danger", label: `${n.code} ${n.name} 受阻`, value: n.blockedReasons.join("；") || n.summary, link: n.link });
      }
      return { cards, actions: [{ label: "查看十节点", link: monitor }, { label: "打开订单", link: `/orders/${o.order.id}` }] };
    }
    case "my_todos": {
      const c = o.counts;
      const cards: AssistantCard[] = [
        {
          type: "kpis",
          title: null,
          items: [
            { label: "已逾期", value: c.overdue, unit: "条", format: "int", currency: null, link: "/todo" },
            { label: "今日到期", value: c.today, unit: "条", format: "int", currency: null, link: "/todo" },
            { label: "后续待办", value: c.later, unit: "条", format: "int", currency: null, link: "/todo" },
          ],
        },
      ];
      const urgent = [...o.overdue.map((i) => ({ i, tone: "danger" as const })), ...o.today.map((i) => ({ i, tone: "warning" as const }))];
      const list = urgent.length ? urgent : o.later.map((i) => ({ i, tone: null }));
      if (list.length) {
        cards.push(
          table(
            urgent.length ? "优先处理" : "后续待办",
            [["title", "事项"], ["docNo", "单号"], ["customer", "客户"], ["due", "截止", "right"]],
            list.slice(0, 8).map(({ i, tone }) => ({ cells: { title: i.title, docNo: i.docNo, customer: i.customerName, due: i.overdueDays > 0 ? `逾期 ${i.overdueDays} 天` : (i.dueAt?.slice(0, 10) ?? "—") }, link: i.link, tone })),
          ),
        );
      }
      return { cards, actions: [{ label: "打开今日待办", link: "/todo" }] };
    }
    case "receivables_summary": {
      const t = o.totals;
      const cards: AssistantCard[] = [
        {
          type: "kpis",
          title: null,
          items: [
            { label: "逾期笔数", value: t.overdueCount, unit: "笔", format: "int", currency: null, link: "/receivables/collection" },
            { label: "逾期金额（USD）", value: t.overdueUsd, unit: null, format: "money", currency: "USD", link: null },
            { label: "平均逾期", value: t.avgOverdueDays, unit: "天", format: "decimal", currency: null, link: null },
            { label: "本月到期", value: t.dueThisMonthCount, unit: "笔", format: "int", currency: null, link: "/receivables" },
          ],
        },
      ];
      if (o.byCustomer.length) cards.push({ type: "bar", title: "逾期按客户（USD）", unit: "USD", items: o.byCustomer.map((c) => ({ label: c.customerName, value: c.usd, display: `$${fmt(c.usd)} · ${c.count} 笔`, link: null })) });
      if (o.overdue.length) {
        cards.push(
          table(
            "逾期明细",
            [["docNo", "应收单"], ["customer", "客户"], ["outstanding", "未收", "right"], ["dueDate", "到期日"], ["overdueDays", "逾期天数", "right"]],
            o.overdue.map((r) => ({ cells: { docNo: r.docNo, customer: r.customerName, outstanding: `${r.currency} ${fmt(r.outstanding)}`, dueDate: r.dueDate, overdueDays: r.overdueDays }, link: r.link, tone: r.overdueDays > 30 ? "danger" : "warning" })),
          ),
        );
      }
      return { cards, actions: [{ label: "打开催收工作台", link: "/receivables/collection" }] };
    }
    case "capacity_summary": {
      if (!o.found || !o.kpis) return { cards: [{ type: "highlight", tone: "info", label: "产能台账", value: "暂无已发布的台账版本", link: "/capacity" }], actions: [{ label: "打开产能台账", link: "/capacity" }] };
      const cards: AssistantCard[] = [
        {
          type: "kpis",
          title: o.versionLabel,
          items: [
            { label: "集团余量", value: o.kpis.groupSpareWan, unit: "万双", format: "decimal", currency: null, link: null },
            { label: "平均余量率", value: pct(o.kpis.avgSpareRate), unit: "%", format: "percent", currency: null, link: null },
            { label: "紧张针型", value: o.kpis.tightCount, unit: "处", format: "int", currency: null, link: "/capacity" },
          ],
        },
      ];
      if (o.lowest.length) {
        cards.push({ type: "bar", title: "余量率最低的基地 × 针型（%）", unit: "%", items: o.lowest.map((r) => ({ label: `${r.baseName} ${r.needleCode ?? ""}`.trim(), value: pct(r.spareRate), display: `${pct(r.spareRate)}%`, link: "/capacity" })) });
      }
      if (o.tight.length) {
        cards.push(
          table(
            `紧张明细（余量率低于 ${pct(o.kpis.tightThreshold)}%）`,
            [["base", "基地"], ["needle", "针型"], ["spareRate", "余量率", "right"], ["spare", "余量", "right"], ["unproduced", "未产", "right"]],
            o.tight.map((r) => ({ cells: { base: r.baseName, needle: r.needleCode, spareRate: `${pct(r.spareRate)}%`, spare: r.spareCapacity === null ? null : fmt(r.spareCapacity, 0), unproduced: r.unproducedQty === null ? null : fmt(r.unproducedQty, 0) }, link: "/capacity", tone: "danger" })),
          ),
        );
      }
      return { cards, actions: [{ label: "打开产能台账", link: "/capacity" }] };
    }
    case "patrol_hits": {
      const cards: AssistantCard[] = [
        {
          type: "kpis",
          title: null,
          items: [
            { label: "红灯", value: o.red, unit: "条", format: "int", currency: null, link: "/patrol" },
            { label: "黄灯", value: o.yellow, unit: "条", format: "int", currency: null, link: "/patrol" },
          ],
        },
      ];
      if (o.hits.length) {
        cards.push(
          table(
            "未关闭的巡检命中",
            [["light", "灯色"], ["rule", "规则"], ["target", "对象"], ["message", "判定说明"], ["overdue", "超期", "right"]],
            o.hits.map((h) => ({ cells: { light: h.light, rule: `${h.ruleCode} ${h.ruleName}`.trim(), target: h.targetNo ?? h.targetName, message: h.message, overdue: h.overdueDays ? `${h.overdueDays} 天` : "—" }, link: h.link, tone: h.light === "红灯" ? "danger" : "warning" })),
          ),
        );
      }
      return { cards, actions: [{ label: "打开巡检仪表盘", link: "/patrol" }] };
    }
    case "quote_summary": {
      const cards: AssistantCard[] = o.quotes.map((q) => {
        const columns: [string, string, ("left" | "right")?][] = [["docNo", "报价单"], ["kind", "类型"], ["status", "状态"], ["priceUsd", "单价（USD）", "right"], ["quantity", "数量", "right"]];
        if (o.costVisible) columns.push(["margin", "毛利率", "right"]);
        return table(
          `#${q.styleNo} · ${q.customerName}`,
          columns,
          q.rounds.map((r) => ({ cells: { docNo: r.docNo, kind: r.kind, status: r.status, priceUsd: r.priceUsd, quantity: r.quantity, ...(o.costVisible && r.margin !== undefined ? { margin: `${pct(r.margin)}%` } : {}) }, link: q.link, tone: o.costVisible && r.guardrailPassed === false ? "danger" : null })),
        );
      });
      return { cards, actions: o.quotes.slice(0, 2).map((q) => ({ label: `打开 #${q.styleNo} 报价`, link: q.link })) };
    }
    case "search_kb": {
      if (!o.hits.length) return { cards: [], actions: [] };
      return {
        cards: [table("知识库检索结果", [["doc", "文档"], ["snippet", "相关内容"]], o.hits.map((h) => ({ cells: { doc: h.customerName ? `${h.title}（${h.customerName}）` : h.title, snippet: h.snippet }, link: h.link, tone: null })))],
        actions: [{ label: "打开知识库", link: "/documents/kb" }],
      };
    }
    case "search_docs": {
      if (!o.results.length) return { cards: [], actions: [] };
      return { cards: [table("匹配的单据", [["type", "类型"], ["docNo", "单号"], ["title", "说明"]], o.results.map((r) => ({ cells: { type: r.typeLabel, docNo: r.docNo, title: r.title }, link: r.link, tone: null })))], actions: [] };
    }
    case "propose_todo":
    case "propose_collection_log":
      return { cards: o.ok ? [] : [{ type: "highlight", tone: "warning", label: "未能起草", value: o.message, link: null }], actions: [] };
  }
}

export function describe(o: ToolOutput): string {
  if (o.denied) return `${o.denied}：你的账号没有对应的菜单权限，如需查看请联系管理员授权。`;
  switch (o.tool) {
    case "order_stats": {
      const t = o.totals;
      if (!t.orders) return `你的权限范围内（${o.scope}）目前没有在手客户订单。`;
      const parts = [`在手 ${t.orders} 张客户订单，共 ${fmt(t.pairs, 0)} 双（${t.customers} 家客户），货值约 $${fmt(t.valueUsd)}（按当日汇率折美元）。`];
      const [a, b] = o.byCustomer;
      if (a && b) parts.push(`客户集中度：${a.customerName}与${b.customerName}合计占在手订单 ${Math.round((a.share + b.share) * 10) / 10}%。`);
      else if (a) parts.push(`全部来自${a.customerName}。`);
      const peak = o.weeks.reduce<(typeof o.weeks)[number] | null>((best, w) => (w.due > (best?.due ?? 0) ? w : best), null);
      if (peak) parts.push(`未来 8 周交期高峰在 ${peak.label} 那一周（${peak.due} 张到期），周均 ${o.weeklyAverage} 张${peak.due >= 2 && peak.due > o.weeklyAverage * 1.5 ? "，产能要提前排" : ""}。`);
      if (t.overdue) parts.push(`另有 ${t.overdue} 张已过客户交期仍未完成。`);
      if (t.pendingConfirm) parts.push(`还有 ${t.pendingConfirm} 张卡在待确认，客户不回就没法排产，这是当前最该催的一类。`);
      return parts.join("");
    }
    case "order_status": {
      if (o.excluded) return `${o.poNo} 所属客户设置为不参与 AI 分析，请到订单监控页查看进度。`;
      if (!o.found || !o.order || !o.mainline) return `没有找到你有权查看的 ${o.poNo}，请确认 PO 号是否正确。`;
      const m = o.mainline;
      const current = m.nodes.find((n) => n.code === m.currentNode);
      const parts = [`${o.order.poNo}（${o.order.customerName} · ${o.order.styleSummary} · ${fmt(o.order.totalPairs, 0)} 双，客户交期 ${o.order.customerDueDate}）订单状态「${o.order.statusLabel}」，主线已完成 ${m.completedCount} / ${m.total}${current ? `，当前在 ${current.code}「${current.name}」：${current.summary}` : ""}。`];
      const blocked = m.nodes.filter((n) => n.state === "BLOCKED");
      if (blocked.length) parts.push(`受阻：${blocked.map((n) => `${n.code} ${n.name}（${n.blockedReasons.join("；") || n.summary}）`).join("；")}。`);
      return parts.join("");
    }
    case "my_todos": {
      const c = o.counts;
      if (!c.total) return "你目前没有未完成的待办。";
      const urgent = [...o.overdue, ...o.today].slice(0, 3);
      const list = urgent.map((i, idx) => `${idx + 1}. ${i.title}${i.docNo ? `（${i.docNo}）` : ""}${i.overdueDays > 0 ? `，已逾期 ${i.overdueDays} 天` : "，今天到期"}`);
      return `你有 ${c.total} 条未完成待办：已逾期 ${c.overdue} 条、今日到期 ${c.today} 条、后续 ${c.later} 条。${list.length ? `建议先处理：${list.join("；")}。` : "今天没有到期的事项，可以提前处理后续待办。"}`;
    }
    case "receivables_summary": {
      const t = o.totals;
      if (!t.openCount) return "你的权限范围内没有未收清的应收。";
      const parts = [t.overdueCount ? `逾期应收 ${t.overdueCount} 笔，合计约 $${fmt(t.overdueUsd)}（折美元），平均逾期 ${t.avgOverdueDays} 天。` : "目前没有逾期应收。"];
      const top = o.byCustomer[0];
      if (top) parts.push(`逾期金额最多的是${top.customerName}（${top.count} 笔，约 $${fmt(top.usd)}）。`);
      if (t.dueThisMonthCount) parts.push(`本月还有 ${t.dueThisMonthCount} 笔即将到期（约 $${fmt(t.dueThisMonthUsd)}）。`);
      const first = o.overdue[0];
      if (first) parts.push(`建议先跟进 ${first.docNo}（${first.customerName}，逾期 ${first.overdueDays} 天）。`);
      return parts.join("");
    }
    case "capacity_summary": {
      if (!o.found || !o.kpis) return "目前没有已发布的产能台账。";
      const parts = [`最新产能台账 ${o.versionLabel}：集团余量 ${o.kpis.groupSpareWan} 万双，平均余量率 ${pct(o.kpis.avgSpareRate)}%。`];
      const label = (r: (typeof o.tight)[number]) => `${r.baseName} ${r.needleCode ?? ""}（${pct(r.spareRate)}%）`.replace(" （", "（");
      if (o.tight.length) parts.push(`余量率低于 ${pct(o.kpis.tightThreshold)}% 的有 ${o.tight.length} 处：${o.tight.slice(0, 5).map(label).join("、")}，接单和排产要优先协调这些针型。`);
      else if (o.lowest[0]) parts.push(`目前没有余量率低于 ${pct(o.kpis.tightThreshold)}% 的针型，最紧的是 ${label(o.lowest[0])}。`);
      return parts.join("");
    }
    case "patrol_hits": {
      if (!o.red && !o.yellow) return "目前没有未关闭的红灯或黄灯巡检命中。";
      const reds = o.hits.filter((h) => h.light === "红灯").slice(0, 3);
      return `未关闭的巡检命中：红灯 ${o.red} 条、黄灯 ${o.yellow} 条。${reds.length ? `红灯：${reds.map((h) => `${h.targetNo ?? h.targetName ?? ""} ${h.ruleName}（${h.message}）`.trim()).join("；")}。` : ""}`;
    }
    case "quote_summary": {
      if (!o.quotes.length) return `没有找到你有权查看的「${o.keyword}」报价。`;
      return o.quotes
        .map((q) => {
          const last = q.rounds.at(-1);
          if (!last) return `#${q.styleNo}（${q.customerName}）还没有报价轮次。`;
          const margin = o.costVisible && last.margin !== undefined ? `，毛利率 ${pct(last.margin)}%${last.guardrailPassed === false ? "（低于护栏）" : ""}` : "";
          return `#${q.styleNo}（${q.customerName}）最新一轮 ${last.docNo}（${last.kind}）报价 $${fmt(last.priceUsd, 4)} / ¥${fmt(last.priceCny, 4)}，数量 ${fmt(last.quantity, 0)} 双，状态「${last.status}」${margin}。`;
        })
        .join("");
    }
    case "search_kb": {
      const [first, ...rest] = o.hits;
      if (!first) return `知识库里没有找到与「${o.query}」相关的内容。`;
      return `根据《${first.title}》${first.customerName ? `（${first.customerName}）` : ""}：${first.snippet}${rest.length ? `\n另可参考：${rest.map((h) => `《${h.title}》`).join("")}。` : ""}`;
    }
    case "search_docs": {
      if (!o.results.length) return `没有找到与「${o.query}」匹配且你有权查看的单据。`;
      return `找到 ${o.results.length} 条匹配的单据：${o.results.slice(0, 5).map((r) => `${r.typeLabel} ${r.docNo}`).join("、")}。`;
    }
    case "propose_todo":
    case "propose_collection_log":
      if (!o.ok || !o.preview) return o.message;
      return `我起草了「${o.preview.title}」：${o.preview.summary}。请在下方确认卡里核对，点「确认」后才会执行。`;
  }
}

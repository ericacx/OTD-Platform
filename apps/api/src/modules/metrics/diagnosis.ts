import type { BoardKey } from "@otd/contracts/metrics";
import type { AiProvider } from "../../core/ai/ai.types.js";
import { FakeAiProvider } from "../../core/ai/fake.provider.js";

export type Numbers = Record<string, number | string>;
export type Signal = { key: string; level: "PRIORITY" | "WATCH"; impact: number; numbers: Numbers; filler?: boolean };
export type RenderedItem = { level: "PRIORITY" | "WATCH"; title: string; basis: string; suggestion: string; signalKey: string; numbers: Numbers };

export const MAX_ITEMS = 6;
export const MIN_ITEMS = 3;

const v = (n: Numbers, k: string) => String(n[k]);
const pctText = (n: Numbers, k: string) => (n[k] === "—" ? "—" : `${v(n, k)}%`);

const TEMPLATES: Record<string, (n: Numbers) => { title: string; basis: string; suggestion: string }> = {
  "sales.overdueTasks": (n) => ({ title: `到期未完成 ${v(n, "overdue")} 项，集中在「${v(n, "topCategory")}」${v(n, "topCount")} 项`, basis: `本期应完成任务 ${v(n, "due")} 项，截至数据截点仍有 ${v(n, "overdue")} 项未完成`, suggestion: "先清到期未完成，今日内逐项给出完成时间承诺" }),
  "sales.redAssigned": (n) => ({ title: `派给我的红灯巡检 ${v(n, "red")} 条未处理`, basis: "红灯表示已逾期或要素缺失，需今日处理", suggestion: "进入业务巡检逐条去处理，问题解决后下次巡检自动关闭" }),
  "sales.completionLow": (n) => ({ title: `任务完成率 ${v(n, "rate")}%（${v(n, "done")} / ${v(n, "due")}）`, basis: `低于 ${v(n, "target")}% 的目标线`, suggestion: "按截止日排序处理，并在承诺日前设内部提醒" }),
  "sales.onTimeLow": (n) => ({ title: `按时完成率 ${v(n, "rate")}%（${v(n, "onTime")} / ${v(n, "due")}）`, basis: `低于 ${v(n, "target")}% 的目标线`, suggestion: "计划排期偏紧，提前识别可能逾期的任务并协调资源" }),
  "sales.reworkHigh": (n) => ({ title: `返工率 ${v(n, "rate")}%（${v(n, "rework")} / ${v(n, "completed")}）`, basis: `超过 ${v(n, "threshold")}% 的关注线`, suggestion: "按环节复盘首次提交质量，减少改样与重复提交" }),
  "sales.cycle": (n) => ({ title: `本期完成 ${v(n, "completed")} 项，平均处理周期 ${v(n, "avg")} 天`, basis: "从创建到完成按自然日计", suggestion: "周期偏长的环节可前置资料准备或拆分节点" }),
  "sales.dueSummary": (n) => ({ title: `本期应完成任务 ${v(n, "due")} 项，已完成 ${v(n, "done")} 项`, basis: "截止日落在所选期间内的待办", suggestion: "保持节奏，优先处理临近截止的任务" }),
  "manager.highRisk": (n) => ({
    title: `${v(n, "customer")}：${[
      Number(n.overdueOrders) >= Number(n.t1) ? `逾期订单 ${v(n, "overdueOrders")} 张` : null,
      Number(n.quality) >= Number(n.t2) ? `未关闭质量问题 ${v(n, "quality")} 个` : null,
      Number(n.arWan) >= Number(n.t3) ? `逾期应收 ${v(n, "arWan")} 万元` : null,
    ]
      .filter(Boolean)
      .join("、")}`,
    basis: `满足高风险规则（逾期订单 ≥ ${v(n, "t1")} 张 / 质量问题 ≥ ${v(n, "t2")} 个 / 逾期应收 ≥ ${v(n, "t3")} 万元）`,
    suggestion: "本周内对齐交期并同步客户，按账龄倒序跟进回款",
  }),
  "manager.overdueAr": (n) => ({ title: `逾期应收 ${v(n, "overdueWan")} 万元（${v(n, "count")} 笔），其中账龄超 ${v(n, "agedDays")} 天 ${v(n, "aged30Wan")} 万元`, basis: "截至数据截点已逾期未收的金额，按月度汇率折人民币", suggestion: "纳入部门周度清收清单，按账龄倒序处理" }),
  "manager.arConcentration": (n) => ({ title: `逾期应收集中在${v(n, "customer")}：${v(n, "wan")} 万元，占 ${v(n, "share")}%`, basis: `单一客户占比超过 ${v(n, "threshold")}%`, suggestion: "由客户负责人牵头对账，确认付款计划" }),
  "manager.redPatrol": (n) => ({ title: `红灯巡检 ${v(n, "red")} 条未关闭，最多的是「${v(n, "rule")}」${v(n, "ruleCount")} 条`, basis: "红灯表示已逾期或要素缺失", suggestion: "按规则责任人逐条处理，问题解决后下次巡检自动关闭" }),
  "manager.changeRate": (n) => ({ title: `交期变更率 ${v(n, "rate")}%（${v(n, "changed")} / ${v(n, "confirmed")}）`, basis: `高于 ${v(n, "threshold")}% 的关注线`, suggestion: "PO 复核阶段提前确认物料与产能，减少交期反复" }),
  "manager.watchCustomers": (n) => ({ title: `关注客户 ${v(n, "count")} 个，如${v(n, "customer")}`, basis: "有临近交期的风险订单或待客户反馈事项超期", suggestion: "提前与客户确认物料与交期，避免转为高风险" }),
  "manager.teamOverdue": (n) => ({ title: `${v(n, "user")} 到期未完成任务 ${v(n, "overdue")} 项，团队最多`, basis: "按团队负荷与人效统计", suggestion: "评估个人负荷，必要时调配任务" }),
  "manager.customers": (n) => ({ title: `当前范围 ${v(n, "customers")} 个客户：高风险 ${v(n, "high")} 个、关注 ${v(n, "watch")} 个、稳定 ${v(n, "stable")} 个`, basis: "按客户健康度规则分级", suggestion: "高风险客户逐个指定负责人和处置计划" }),
  "gm.onTimeLow": (n) => ({ title: `准时交付率 ${v(n, "rate")}%（${v(n, "on")} / ${v(n, "due")}）`, basis: `低于 ${v(n, "target")}% 的目标，${v(n, "late")} 张未按时交付`, suggestion: `把订舱节点前置到 ETD 前 ${v(n, "leadDays")} 天并设预警，工厂交期回复前先确认产能` }),
  "gm.risk": (n) => ({ title: `在手风险 ${v(n, "count")} 张、${v(n, "wan")} 万元`, basis: `其中有红灯巡检 ${v(n, "red")} 张、节点受阻 ${v(n, "blocked")} 张`, suggestion: "逐单确认物料与产能后重定交期，并同步客户" }),
  "gm.overdueAr": (n) => ({ title: `逾期应收 ${v(n, "overdueWan")} 万元，其中账龄超 ${v(n, "agedDays")} 天 ${v(n, "aged30Wan")} 万元`, basis: "截至数据截点已逾期未收的金额，按月度汇率折人民币", suggestion: "按账龄倒序清收，账龄长的由业务经理牵头" }),
  "gm.arConcentration": (n) => ({ title: `逾期应收集中在${v(n, "customer")}：${v(n, "wan")} 万元，占 ${v(n, "share")}%`, basis: `单一客户占比超过 ${v(n, "threshold")}%`, suggestion: "由客户负责人牵头对账，确认付款计划" }),
  "gm.redPatrol": (n) => ({ title: `红灯巡检 ${v(n, "red")} 条未关闭，集中在${v(n, "module")}（${v(n, "moduleCount")} 条）`, basis: "红灯表示已逾期或要素缺失", suggestion: "按模块责任人限期处理，处理后下次巡检自动关闭" }),
  "gm.fulfillment": (n) => ({
    title: `全链路履约：订舱及时率 ${pctText(n, "booking")}、验货一次通过率 ${pctText(n, "firstPass")}、齐料率 ${pctText(n, "material")}，综合履约指数 ${pctText(n, "index")}`,
    basis: `综合履约指数低于 ${v(n, "target")}%`,
    suggestion: "把验货标准前置到生产首件，并与采购对齐备料计划",
  }),
  "gm.target": (n) => ({ title: `确认订单额 ${v(n, "confirmedWan")} 万元，目标 ${v(n, "targetWan")} 万元，达成 ${v(n, "rate")}%`, basis: "目标值按月维护，期间内各月目标合计", suggestion: "跟进在谈报价与待确认 PO，补足目标缺口" }),
  "gm.customerConcentration": (n) => ({ title: `订单贡献第一：${v(n, "customer")} ${v(n, "wan")} 万元（占比 ${v(n, "share")}%）`, basis: `单一客户占比超过 ${v(n, "threshold")}%`, suggestion: "关注大客户依赖度，同步开拓其他客户" }),
  "gm.overview": (n) => ({ title: `本期确认订单额 ${v(n, "confirmedWan")} 万元，交付 ${v(n, "deliveredWan")} 万元，回款 ${v(n, "receivedWan")} 万元`, basis: "按所选期间与数据范围统计", suggestion: "关注交付与回款的衔接，避免应收积压" }),
};

export function renderSignal(signal: Signal): RenderedItem {
  const template = TEMPLATES[signal.key];
  if (!template) throw new Error(`no diagnosis template for ${signal.key}`);
  return { level: signal.level, ...template(signal.numbers), signalKey: signal.key, numbers: signal.numbers };
}

export function selectSignals(signals: Signal[]): Signal[] {
  const main = signals.filter((s) => !s.filler).sort((a, b) => (a.level === b.level ? b.impact - a.impact : a.level === "PRIORITY" ? -1 : 1));
  const picked = main.slice(0, MAX_ITEMS);
  for (const f of signals.filter((s) => s.filler)) {
    if (picked.length >= MIN_ITEMS) break;
    picked.push(f);
  }
  return picked;
}

export function numberSequence(text: string): string[] {
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).map((t) => String(Number(t)));
}

export function numericTokens(text: string): Set<string> {
  return new Set(numberSequence(text));
}

export function sameNumbers(a: string, b: string): boolean {
  const x = numberSequence(a);
  const y = numberSequence(b);
  return x.length === y.length && x.every((t, i) => t === y[i]);
}

type Wording = { title: string; basis: string; suggestion: string };
const FIELDS = ["title", "basis", "suggestion"] as const;

export function keepsFacts(original: Wording & { numbers: Numbers }, polished: Wording): boolean {
  if (!FIELDS.every((f) => sameNumbers(original[f], polished[f]))) return false;
  const text = FIELDS.map((f) => polished[f]).join("\n");
  const names = Object.values(original.numbers).filter((v): v is string => typeof v === "string" && /[^\d.\-—%\s]/.test(v));
  return names.every((name) => !FIELDS.some((f) => original[f].includes(name)) || text.includes(name));
}

const POLISH_SYSTEM = [
  "你是经营看板「智能诊断」的文字编辑。",
  "输入是一个 JSON 数组，每个元素有 title、basis、suggestion 三个字段，是按规则生成的结论、依据和建议。",
  "只润色措辞，使其简洁、专业、口语化程度适中；不得增加、删除或改写任何数字、百分比、金额、客户名和单号，也不得引入输入里没有的事实。",
  "只输出 JSON 数组，元素为 {\"title\": string, \"basis\": string, \"suggestion\": string}，顺序和数量与输入一致，不要输出任何其他文字。",
].join("\n");

export async function polishItems(ai: AiProvider, items: RenderedItem[], userId?: string): Promise<{ items: RenderedItem[]; model: string | null }> {
  if (ai instanceof FakeAiProvider || !ai.available || !items.length) return { items, model: null };
  const result = await ai.chat({ purpose: "metrics.diagnosis", system: POLISH_SYSTEM, messages: [{ role: "user", content: JSON.stringify(items.map(({ title, basis, suggestion }) => ({ title, basis, suggestion }))) }], ...(userId ? { userId } : {}) });
  const polished = parsePolished(result.text);
  if (!polished) return { items, model: null };
  return {
    items: items.map((item, i) => {
      const p = polished[i];
      return p && keepsFacts(item, p) ? { ...item, ...p } : item;
    }),
    model: ai.name,
  };
}

function parsePolished(text: string): { title: string; basis: string; suggestion: string }[] | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed)) return null;
    return parsed.map((p) => {
      const o = (p ?? {}) as Record<string, unknown>;
      return typeof o.title === "string" && typeof o.basis === "string" && typeof o.suggestion === "string" ? { title: o.title, basis: o.basis, suggestion: o.suggestion } : { title: "", basis: "", suggestion: "" };
    });
  } catch {
    return null;
  }
}

export function summaryOf(board: BoardKey, items: RenderedItem[]): string {
  const priority = items.filter((i) => i.level === "PRIORITY").length;
  const lead = board === "sales" ? "本期任务" : board === "manager" ? "本期客户与团队" : "本期经营";
  return priority ? `${lead}共 ${items.length} 条结论，其中 ${priority} 条需优先处理` : `${lead}共 ${items.length} 条结论，暂无需优先处理的事项`;
}

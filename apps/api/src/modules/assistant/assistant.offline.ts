import { ASSISTANT_EXAMPLES, type PageContext } from "@otd/contracts/assistant";
import { addDays } from "@otd/shared";
import type { ToolName } from "./assistant.types.js";

export type PlannedCall = { tool: ToolName; input: Record<string, unknown> };
export type Plan = { calls: PlannedCall[]; prefix: string | null; fallback: boolean };

const PO = /PO\d{5,}/i;
const AR = /AR-\d{6}-\d{3,}/i;
const QT = /QT-[A-Z0-9]+-\d{2,}/i;
const DOC_NO = /\b(?:BR|SP|SM|TST|RPT|DH|PUR|PK|CT|INSP|BK|SH|AR|AUD|PT|IR|SYN)-\d{4,6}(?:-\d{2,})?\b/i;
const STYLE = /(?:#|款号\s*)(\d{4,6})/;
const WEEKDAY: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
const DATE_WORD = /^(?:今天|今日|明天|后天|大后天|\d+\s*天[后内]|(?:下|本|这)?(?:周|星期|礼拜)[一二三四五六日天]|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}月\d{1,2}[日号]?|\d{1,2}[-/]\d{1,2})(?:之前|前|内)?\s*/;

const TODO_INTENT = /((建|创建|新建|加|添加|生成|安排|记|布置|派)\s*(一?个|一条|条)?\s*(待办|任务|提醒))|提醒我|待办\s*[:：]/;
const COLLECTION_INTENT = /((记录|登记|记一下|记一笔|写一条|写个|补一条)\s*.{0,8}催收)|催收记录/;

export const EXAMPLES_TEXT = `我还不太明白这个问题。可以试试这样问我：\n${ASSISTANT_EXAMPLES.map((q) => `· ${q}`).join("\n")}`;

const pad = (n: number) => String(n).padStart(2, "0");

export function parseDate(text: string, today: string): string | null {
  let m = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  const year = today.slice(0, 4);
  m = text.match(/(\d{1,2})月(\d{1,2})[日号]?/) ?? text.match(/(?<![\d-])(\d{1,2})[-/](\d{1,2})(?![\d-])/);
  if (m) return `${year}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`;
  if (/大后天/.test(text)) return addDays(today, 3);
  if (/后天/.test(text)) return addDays(today, 2);
  if (/明天/.test(text)) return addDays(today, 1);
  if (/今天|今日/.test(text)) return today;
  m = text.match(/(\d+)\s*天[后内]/);
  if (m) return addDays(today, Number(m[1]));
  m = text.match(/(下|本|这)?(?:周|星期|礼拜)([一二三四五六日天])/);
  if (m) {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    const target = WEEKDAY[m[2]!]!;
    const mondayOffset = (dow + 6) % 7;
    const targetOffset = (target + 6) % 7;
    if (m[1] === "下") return addDays(today, 7 - mondayOffset + targetOffset);
    if (m[1] === "本" || m[1] === "这") return addDays(today, targetOffset - mondayOffset);
    const diff = (target - dow + 7) % 7 || 7;
    return addDays(today, diff);
  }
  return null;
}

function stripDate(text: string): string {
  return text.replace(DATE_WORD, "").trim();
}

function planTodo(q: string, today: string): PlannedCall {
  const assigneeMatch = q.match(/给\s*([一-龥]{2,4}?)\s*(?:建|创建|新建|加|添加|安排|派|布置|记)/);
  const assignee = assigneeMatch && !/^(我|自己|本人)$/.test(assigneeMatch[1]!) ? assigneeMatch[1]! : undefined;
  const colon = q.search(/[:：]/);
  let body = colon >= 0 ? q.slice(colon + 1) : q.replace(/^.*?(待办|任务|提醒我?)[，,\s]*/, "");
  body = body.trim();
  const dueDate = parseDate(body, today) ?? parseDate(q, today);
  const title = stripDate(body).replace(/[。！!]+$/, "").trim() || body || q.trim();
  const po = q.match(PO)?.[0];
  return { tool: "propose_todo", input: { title: title.slice(0, 200), ...(assignee ? { assignee } : {}), ...(dueDate ? { dueDate } : {}), ...(po ? { poNo: po.toUpperCase() } : {}) } };
}

function planCollection(q: string, today: string): Plan {
  const ar = q.match(AR)?.[0];
  if (!ar) return { calls: [{ tool: "receivables_summary", input: {} }], prefix: "要记录哪张应收单的催收？请告诉我应收单号（如 AR-202610-001）、联系渠道和结果。先把你名下需要跟进的应收列在下面：", fallback: false };
  const channel = /电话|打了|致电|call/i.test(q) ? "PHONE" : /微信/.test(q) ? "WECHAT" : /系统|平台|portal/i.test(q) ? "CUSTOMER_SYSTEM" : "EMAIL";
  const result = /联系不上|没接|不接|未接|不回|没回|未回复|失联/.test(q) ? "UNREACHABLE" : /争议|异议|扣款有问题|不认/.test(q) ? "DISPUTED" : /申请付款|已申请|提交付款|走流程|付款流程/.test(q) ? "APPLIED" : "PROMISED";
  const followText = q.match(/(?:下次|再|之后)(.{0,12}?)(?:跟进|联系|催)/)?.[1] ?? "";
  const nextFollowUp = parseDate(followText, today) ?? parseDate(q.replace(AR, ""), today);
  const colon = q.search(/[:：]/);
  const note = colon >= 0 ? q.slice(colon + 1).trim() : undefined;
  return { calls: [{ tool: "propose_collection_log", input: { receivableNo: ar.toUpperCase(), channel, result, ...(note ? { note: note.slice(0, 1000) } : {}), ...(nextFollowUp ? { nextFollowUp } : {}) } }], prefix: null, fallback: false };
}

export function plan(question: string, context: PageContext | null, today: string): Plan {
  const q = question.trim();
  const one = (tool: ToolName, input: Record<string, unknown> = {}): Plan => ({ calls: [{ tool, input }], prefix: null, fallback: false });
  if (TODO_INTENT.test(q)) return { calls: [planTodo(q, today)], prefix: null, fallback: false };
  if (COLLECTION_INTENT.test(q)) return planCollection(q, today);
  const po = q.match(PO)?.[0];
  if (po) return one("order_status", { poNo: po.toUpperCase() });
  const qt = q.match(QT)?.[0];
  if (qt) return one("quote_summary", { keyword: qt.toUpperCase() });
  const docNo = q.match(DOC_NO)?.[0];
  if (docNo) return one("search_docs", { query: docNo.toUpperCase() });
  if (context?.docNo && PO.test(context.docNo) && /(这单|这张单|这个订单|这一单|卡在哪|卡住|到哪|进度|哪一步)/.test(q)) return one("order_status", { poNo: context.docNo.toUpperCase() });
  if (/(应收|回款|收款|欠款|账款|逾期款|催收|催款|账期)/.test(q)) return one("receivables_summary");
  if (/(产能|针型|机台|余量|排产|开机率)/.test(q)) return one("capacity_summary");
  if (/(巡检|红灯|黄灯|预警|亮灯)/.test(q)) return one("patrol_hits", { light: /红灯/.test(q) && !/黄灯/.test(q) ? "RED" : /黄灯/.test(q) && !/红灯/.test(q) ? "YELLOW" : "ALL" });
  const style = q.match(STYLE)?.[1];
  if (/(报价|毛利|成本|单价)/.test(q) && style) return one("quote_summary", { keyword: style });
  if (/(订单|单子|PO)/i.test(q) && /(多少|几张|几单|分布|在手|手上|数量|货值|统计|概况|总共|一共|交期压力|集中度|情况)/.test(q)) return one("order_stats");
  if (/(待办|跟进|要做|要处理|需要我|事情|事儿|任务)/.test(q)) return one("my_todos");
  if (style) return one("search_docs", { query: style });
  if (/(怎么(?!样)|如何|什么是|是什么|是啥|要求|规定|制度|流程|标准|手册|指南|能否|能不能|可以吗|注意|规则)/.test(q)) return one("search_kb", { query: q });
  return { calls: [], prefix: null, fallback: true };
}

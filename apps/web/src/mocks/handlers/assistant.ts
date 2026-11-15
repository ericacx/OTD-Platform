import { ASSISTANT_EXAMPLES } from "@otd/contracts/assistant";
import { HttpResponse, http } from "msw";

import { envelope, fail } from "./util";

import type {
  AssistantAnswer,
  AssistantMessageDto,
  AssistantProfileDto,
  ConversationDto,
  ProposalDto,
} from "@otd/contracts/assistant";

const AS_OF = "2026-10-21T01:00:00.000Z";
const VIDEO_QUESTION = "现在手上有多少张客户订单？按客户分布如何？";

export const mockVideoAnswer: AssistantAnswer = {
  text: "在手 18 张客户订单，共 285,631 双（6 家客户），货值约 $461,004.5（按当日汇率折美元）。客户集中度：北岸运动与晨跑者合计占在手订单 50%。未来 8 周交期高峰在 12-09 那一周（4 张到期），周均 1.63 张，产能要提前排。还有 3 张卡在待确认，客户不回就没法排产，这是当前最该催的一类。",
  cards: [
    {
      type: "kpis",
      title: null,
      items: [
        { label: "订单总数", value: 18, unit: "张", format: "int", currency: null, link: "/orders" },
        { label: "双数", value: 285631, unit: "双", format: "int", currency: null, link: null },
        { label: "货值（USD）", value: 461004.5, unit: null, format: "money", currency: "USD", link: null },
        { label: "生产中", value: 6, unit: "张", format: "int", currency: null, link: "/orders?status=IN_PRODUCTION" },
      ],
    },
    { type: "highlight", tone: "warning", label: "待确认", value: "3 张", link: "/orders?status=PENDING_CONFIRM" },
    {
      type: "bar",
      title: "按客户订单分布",
      unit: "张",
      items: [
        { label: "北岸运动", value: 5, display: "5 张 · 27.8%", link: "/orders?customerId=c-nsr" },
        { label: "晨跑者", value: 4, display: "4 张 · 22.2%", link: "/orders?customerId=c-mrn" },
        { label: "枫林户外", value: 3, display: "3 张 · 16.7%", link: null },
        { label: "蓝湾生活", value: 3, display: "3 张 · 16.7%", link: null },
        { label: "极线", value: 2, display: "2 张 · 11.1%", link: null },
        { label: "云栖童装", value: 1, display: "1 张 · 5.6%", link: null },
      ],
    },
    {
      type: "line",
      title: "未来 8 周交期压力（每周到期订单数）",
      unit: "张",
      points: [
        { label: "10-21", value: 2 },
        { label: "10-28", value: 1 },
        { label: "11-04", value: 2 },
        { label: "11-11", value: 1 },
        { label: "11-18", value: 1 },
        { label: "11-25", value: 1 },
        { label: "12-02", value: 1 },
        { label: "12-09", value: 4 },
      ],
      average: 1.63,
    },
  ],
  sources: [{ module: "order", label: "订单管理 · 客户订单", asOf: AS_OF }],
  actions: [{ label: "查看订单列表", link: "/orders" }],
};

const NODE_NAMES = [
  "企划接入",
  "打样与批复",
  "测试",
  "报价",
  "开发移交",
  "PO 复核",
  "辅料与包装",
  "备料与生产",
  "验货与放行",
  "出货与结算",
];

function timelineAnswer(poNo: string): AssistantAnswer {
  return {
    text: `${poNo}（晨跑者 · #11151 · 12,600 双，客户交期 2026-11-03）订单状态「生产中」，主线已完成 7 / 10，当前在 N08「备料与生产」。`,
    cards: [
      {
        type: "timeline",
        title: `${poNo} · 晨跑者 · #11151`,
        headline: "已完成 7 / 10 · 当前：备料与生产",
        completedCount: 7,
        total: 10,
        currentNode: "N08",
        link: `/orders/monitor?poNo=${poNo}`,
        nodes: NODE_NAMES.map((name, i) => ({
          code: `N${String(i + 1).padStart(2, "0")}`,
          name,
          state: i < 7 ? "DONE" : i === 7 ? "IN_PROGRESS" : "NOT_STARTED",
          gate: i === 4 ? "G1" : i === 8 ? "G2" : null,
          summary: i < 7 ? "已完成" : i === 7 ? "生产进度 62%" : "待启动",
          blockedReasons: [],
          link: null,
        })),
      },
    ],
    sources: [{ module: "order", label: "订单管理 · 订单监控", asOf: AS_OF }],
    actions: [{ label: "查看十节点", link: `/orders/monitor?poNo=${poNo}` }],
  };
}

function proposalAnswer(id: string): AssistantAnswer {
  return {
    text: "我起草了「新建待办」：给 自己 建一条待办「跟进 PO0010459 客户确认」，截止 2026-10-22。请在下方确认卡里核对，点「确认」后才会执行。",
    cards: [],
    sources: [{ module: "todo", label: "今日待办 · 起草待办", asOf: AS_OF }],
    actions: [],
    proposals: [
      {
        id,
        kind: "TODO",
        title: "新建待办",
        summary: "给 自己 建一条待办「跟进 PO0010459 客户确认」，截止 2026-10-22",
        targets: [{ type: "order", id: "o-1", label: "关联订单 PO0010459", link: "/orders/o-1" }],
        fields: [
          { label: "标题", value: "跟进 PO0010459 客户确认" },
          { label: "截止日期", value: "2026-10-22" },
        ],
        status: "PENDING",
        version: 1,
        result: null,
        decidedAt: null,
      },
    ],
  };
}

function fallbackAnswer(): AssistantAnswer {
  return {
    text: `我还不太明白这个问题。可以试试这样问我：\n${ASSISTANT_EXAMPLES.map((q) => `· ${q}`).join("\n")}`,
    cards: [],
    sources: [{ module: "assistant", label: "OTD 助手 · 未读取业务数据", asOf: AS_OF }],
    actions: [],
  };
}

type State = {
  seq: number;
  used: number;
  conversations: ConversationDto[];
  messages: Map<string, AssistantMessageDto[]>;
  proposals: Map<string, { conversationId: string; proposal: ProposalDto }>;
};

let state: State = initialState();

function initialState(): State {
  const conversation: ConversationDto = {
    id: "conv-1",
    title: VIDEO_QUESTION.slice(0, 40),
    messageCount: 2,
    createdAt: AS_OF,
    updatedAt: AS_OF,
  };
  return {
    seq: 10,
    used: 0,
    conversations: [conversation],
    messages: new Map([
      [
        conversation.id,
        [
          { id: "m-1", role: "user", text: VIDEO_QUESTION, answer: null, createdAt: AS_OF },
          { id: "m-2", role: "assistant", text: mockVideoAnswer.text, answer: mockVideoAnswer, createdAt: AS_OF },
        ],
      ],
    ]),
    proposals: new Map(),
  };
}

export function resetAssistantMocks() {
  state = initialState();
}

function nextId(prefix: string) {
  state.seq += 1;
  return `${prefix}-${state.seq}`;
}

function answerFor(content: string, contextDocNo: string | undefined): AssistantAnswer {
  if (/(建|创建|新建).{0,3}(待办|任务)/.test(content)) return proposalAnswer(nextId("prop"));
  const po = content.match(/PO\d{5,}/i)?.[0] ?? (/(这单|卡在哪|进度)/.test(content) ? contextDocNo : undefined);
  if (po) return timelineAnswer(po.toUpperCase());
  if (/订单/.test(content)) return mockVideoAnswer;
  return fallbackAnswer();
}

function withProposals(message: AssistantMessageDto): AssistantMessageDto {
  if (!message.answer?.proposals?.length) return message;
  return {
    ...message,
    answer: {
      ...message.answer,
      proposals: message.answer.proposals.map((p) => state.proposals.get(p.id)?.proposal ?? p),
    },
  };
}

export function chunksOf(text: string, size = 24): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

export function sseResponse(events: { event: string; data: unknown }[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const e of events)
        controller.enqueue(encoder.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`));
      controller.close();
    },
  });
  return new HttpResponse(body, { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8" } });
}

export const assistantHandlers = [
  http.get("*/assistant/profile", () => {
    const profile: AssistantProfileDto = {
      name: { zh: "OTD 助手", en: "OTD Assistant" },
      examples: [...ASSISTANT_EXAMPLES],
      mode: "offline",
      quota: { limit: 200, used: state.used },
    };
    return HttpResponse.json(envelope(profile));
  }),

  http.get("*/assistant/conversations", () =>
    HttpResponse.json(envelope([...state.conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))),
  ),

  http.post("*/assistant/conversations", () => {
    const now = new Date().toISOString();
    const conversation: ConversationDto = {
      id: nextId("conv"),
      title: "新对话",
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    state.conversations.push(conversation);
    state.messages.set(conversation.id, []);
    return HttpResponse.json(envelope(conversation), { status: 201 });
  }),

  http.delete("*/assistant/conversations/:id", ({ params }) => {
    const id = String(params.id);
    if (!state.messages.has(id)) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    state.conversations = state.conversations.filter((c) => c.id !== id);
    state.messages.delete(id);
    return HttpResponse.json(envelope(null));
  }),

  http.get("*/assistant/conversations/:id/messages", ({ params }) => {
    const list = state.messages.get(String(params.id));
    if (!list) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    return HttpResponse.json(envelope(list.map(withProposals)));
  }),

  http.post("*/assistant/conversations/:id/messages", async ({ params, request }) => {
    const id = String(params.id);
    const list = state.messages.get(id);
    const conversation = state.conversations.find((c) => c.id === id);
    if (!list || !conversation) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    const body = (await request.json()) as { content: string; context?: { docNo?: string } };
    const now = new Date().toISOString();
    const answer = answerFor(body.content, body.context?.docNo);
    for (const p of answer.proposals ?? []) state.proposals.set(p.id, { conversationId: id, proposal: p });
    const question: AssistantMessageDto = {
      id: nextId("m"),
      role: "user",
      text: body.content,
      answer: null,
      createdAt: now,
    };
    const reply: AssistantMessageDto = {
      id: nextId("m"),
      role: "assistant",
      text: answer.text,
      answer,
      createdAt: now,
    };
    list.push(question, reply);
    if (conversation.title === "新对话") conversation.title = body.content.slice(0, 40);
    conversation.messageCount += 2;
    conversation.updatedAt = now;
    state.used += 1;
    const data = { conversation: { ...conversation }, question, answer: reply };
    if (!request.headers.get("accept")?.includes("text/event-stream")) {
      return HttpResponse.json(envelope(data), { status: 201 });
    }
    return sseResponse([
      ...chunksOf(answer.text).map((text) => ({ event: "delta", data: { text } })),
      { event: "done", data },
    ]);
  }),

  http.post("*/assistant/proposals/:id/:decision", async ({ params, request }) => {
    const entry = state.proposals.get(String(params.id));
    if (!entry) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    const body = (await request.json()) as { version: number };
    const current = entry.proposal;
    if (current.status !== "PENDING") {
      return fail(
        "FLOW_ILLEGAL_TRANSITION",
        `当前状态「${current.status}」不允许执行「${String(params.decision)}」`,
        409,
      );
    }
    if (current.version !== body.version) return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    const confirmed = params.decision === "confirm";
    entry.proposal = {
      ...current,
      status: confirmed ? "CONFIRMED" : "REJECTED",
      version: current.version + 1,
      decidedAt: new Date().toISOString(),
      result: confirmed
        ? { message: "已创建待办「跟进 PO0010459 客户确认」", link: "/todo" }
        : { message: "已放弃，未执行任何操作", link: null },
    };
    return HttpResponse.json(envelope(entry.proposal));
  }),
];

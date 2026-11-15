import { assistantAnswerSchema } from "@otd/contracts/assistant";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import { setActiveConversation } from "@/features/assistant/assistant.active";
import { AssistantDrawer } from "@/features/assistant/components/assistant-drawer";
import { registerRefreshHandler } from "@/lib/auth/refresh";
import { setTokenInfo } from "@/lib/auth/token-storage";
import { createAppI18n } from "@/lib/i18n/i18n";
import { createQueryClient } from "@/lib/query/query-client";
import { mockVideoAnswer, resetAssistantMocks, sseResponse } from "@/mocks/handlers/assistant";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/render-with-providers";

describe("智能助手页面", () => {
  beforeEach(() => {
    resetAssistantMocks();
    setActiveConversation(null);
    setTokenInfo({ accessToken: "mock-access-13800000001", refreshToken: "mock-refresh-13800000001" });
  });

  it("MSW 夹具符合回答契约", () => {
    expect(() => assistantAnswerSchema.parse(mockVideoAnswer)).not.toThrow();
  });

  it("左栏列出最近会话，打开后渲染视频那条回答的卡片、来源与跳转按钮", async () => {
    const user = userEvent.setup();
    await renderWithProviders({ route: "/assistant" });

    expect(await screen.findByRole("heading", { name: "智能助手" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "有什么我能帮你的吗？" })).toBeInTheDocument();
    const recent = await screen.findByRole("list", { name: "最近" });
    await user.click(within(recent).getByRole("button", { name: /现在手上有多少张客户订单/ }));

    const log = screen.getByRole("log", { name: "对话记录" });
    expect(await within(log).findByText("订单总数")).toBeInTheDocument();
    expect(within(log).getByText("18")).toBeInTheDocument();
    expect(within(log).getByText("285,631")).toBeInTheDocument();
    expect(within(log).getByText("$461,004.50")).toBeInTheDocument();
    expect(within(log).getByText("3 张")).toBeInTheDocument();
    const bars = within(log).getByRole("list", { name: "按客户订单分布" });
    expect(within(bars).getByText("北岸运动")).toBeInTheDocument();
    expect(within(bars).getByText("5 张 · 27.8%")).toBeInTheDocument();
    expect(within(log).getByText("均值 1.63")).toBeInTheDocument();
    expect(within(log).getByRole("table", { name: "未来 8 周交期压力（每周到期订单数）" })).toBeInTheDocument();
    expect(within(log).getByRole("link", { name: "查看订单列表" })).toHaveAttribute("href", "/orders");
    expect(within(log).getByText(/订单管理 · 客户订单 · 截至/)).toBeInTheDocument();
  });

  it("欢迎态点示例问题发起新会话，PO 问题渲染 10 节点时间线", async () => {
    const user = userEvent.setup();
    await renderWithProviders({ route: "/assistant" });

    const examples = await screen.findByRole("group", { name: "示例问题" });
    await user.click(within(examples).getByRole("button", { name: "PO0010459 到哪一步了" }));

    const log = screen.getByRole("log", { name: "对话记录" });
    expect(await within(log).findByText("已完成 7 / 10")).toBeInTheDocument();
    expect(within(log).getByText("N01 企划接入")).toBeInTheDocument();
    expect(within(log).getByText("N10 出货与结算")).toBeInTheDocument();
    const recent = screen.getByRole("list", { name: "最近" });
    expect(await within(recent).findByRole("button", { name: /PO0010459 到哪一步了/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("Enter 发送、Shift+Enter 换行；Proposal 确认后才执行", async () => {
    const user = userEvent.setup();
    await renderWithProviders({ route: "/assistant" });

    const input = await screen.findByRole("textbox", { name: "输入问题" });
    await user.type(input, "帮我建个待办：{Shift>}{Enter}{/Shift}明天跟进 PO0010459 客户确认");
    expect(input).toHaveValue("帮我建个待办：\n明天跟进 PO0010459 客户确认");
    await user.keyboard("{Enter}");

    const card = await screen.findByRole("region", { name: "新建待办" });
    expect(within(card).getByText("待确认")).toBeInTheDocument();
    expect(input).toHaveValue("");
    await user.click(within(card).getByRole("button", { name: "确认" }));
    await waitFor(() => expect(within(card).getByText("已执行")).toBeInTheDocument());
    expect(within(card).getByRole("link", { name: /已创建待办/ })).toHaveAttribute("href", "/todo");
    expect(within(card).queryByRole("button", { name: "确认" })).not.toBeInTheDocument();
  });

  it("超出限额时就地提示并保留输入", async () => {
    server.use(
      http.post("*/assistant/conversations/:id/messages", () =>
        HttpResponse.json(
          {
            errcode: "ASSISTANT_QUOTA_EXCEEDED",
            errmsg: "今日助手调用次数已达上限（200 次），请明天再试",
            requestId: "t",
          },
          { status: 429 },
        ),
      ),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/assistant" });

    const input = await screen.findByRole("textbox", { name: "输入问题" });
    await user.type(input, "逾期应收有哪些{Enter}");
    expect(await screen.findByText(/今日助手调用次数已达上限/)).toBeInTheDocument();
    expect(input).toHaveValue("逾期应收有哪些");
  });

  it("流式显示增量文字，done 后换成正式回答", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let accept = "";
    server.use(
      http.post("*/assistant/conversations/:id/messages", async ({ request }) => {
        accept = request.headers.get("accept") ?? "";
        const encoder = new TextEncoder();
        const frame = (event: string, data: unknown) =>
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        const done = {
          conversation: {
            id: "conv-s",
            title: "在手订单",
            messageCount: 2,
            createdAt: "2026-10-21T01:00:00.000Z",
            updatedAt: "2026-10-21T01:00:00.000Z",
          },
          question: { id: "q-s", role: "user", text: "在手订单", answer: null, createdAt: "2026-10-21T01:00:00.000Z" },
          answer: {
            id: "a-s",
            role: "assistant",
            text: mockVideoAnswer.text,
            answer: mockVideoAnswer,
            createdAt: "2026-10-21T01:00:00.000Z",
          },
        };
        const body = new ReadableStream<Uint8Array>({
          async start(controller) {
            controller.enqueue(frame("delta", { text: "在手 18 张，" }));
            controller.enqueue(encoder.encode(": ping\n\n"));
            controller.enqueue(frame("delta", { text: "正在整理分布" }));
            await gate;
            controller.enqueue(frame("done", done));
            controller.close();
          },
        });
        return new HttpResponse(body, { headers: { "Content-Type": "text/event-stream" } });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/assistant" });

    const input = await screen.findByRole("textbox", { name: "输入问题" });
    await user.type(input, "在手订单{Enter}");
    const streaming = await screen.findByTestId("assistant-streaming");
    await waitFor(() => expect(streaming).toHaveTextContent("在手 18 张，正在整理分布"));
    expect(accept).toContain("text/event-stream");

    release();
    const log = screen.getByRole("log", { name: "对话记录" });
    expect(await within(log).findByText("订单总数")).toBeInTheDocument();
    expect(screen.queryByTestId("assistant-streaming")).not.toBeInTheDocument();
  });

  it("SSE error 事件就地提示并保留输入", async () => {
    server.use(
      http.post("*/assistant/conversations/:id/messages", () =>
        sseResponse([
          { event: "error", data: { errcode: "ASSISTANT_AI_UNAVAILABLE", errmsg: "AI 服务暂时不可用：超时" } },
        ]),
      ),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/assistant" });

    const input = await screen.findByRole("textbox", { name: "输入问题" });
    await user.type(input, "产能哪里紧张{Enter}");
    expect(await screen.findByText(/AI 服务暂时不可用：超时/)).toBeInTheDocument();
    expect(input).toHaveValue("产能哪里紧张");
  });

  it("401 时刷新令牌后重放流式请求", async () => {
    let calls = 0;
    const auths: string[] = [];
    server.use(
      http.post("*/assistant/conversations/:id/messages", ({ request }) => {
        calls += 1;
        auths.push(request.headers.get("authorization") ?? "");
        if (calls === 1) {
          return HttpResponse.json({ errcode: "AUTH_TOKEN_EXPIRED", requestId: "t" }, { status: 401 });
        }
        return undefined;
      }),
    );
    registerRefreshHandler(async (refreshToken) => ({ accessToken: "mock-access-13800000001", refreshToken }));
    setTokenInfo({ accessToken: "expired-token", refreshToken: "mock-refresh-13800000001" });
    try {
      const user = userEvent.setup();
      await renderWithProviders({ route: "/assistant" });
      const input = await screen.findByRole("textbox", { name: "输入问题" });
      await user.type(input, "现在手上有多少张客户订单{Enter}");
      const log = screen.getByRole("log", { name: "对话记录" });
      expect(await within(log).findByText("订单总数")).toBeInTheDocument();
      expect(auths).toEqual(["Bearer expired-token", "Bearer mock-access-13800000001"]);
    } finally {
      registerRefreshHandler(null);
    }
  });
});

describe("AssistantDrawer", () => {
  beforeEach(() => {
    resetAssistantMocks();
    setActiveConversation(null);
    setTokenInfo({ accessToken: "mock-access-13800000001", refreshToken: "mock-refresh-13800000001" });
  });

  it("与整页共享当前会话，并带上页面上下文发问", async () => {
    let body: { content: string; context?: { docNo?: string } } | null = null;
    server.use(
      http.post("*/assistant/conversations/:id/messages", async ({ request }) => {
        body = (await request.clone().json()) as typeof body;
        return undefined;
      }),
    );
    setActiveConversation("conv-1");
    const i18n = await createAppI18n({ lng: "zh-CN" });
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter>
            <AssistantDrawer context={{ docType: "order", docNo: "PO0009631" }} onOpenChange={() => {}} open />
          </MemoryRouter>
        </QueryClientProvider>
      </I18nextProvider>,
    );

    const dialog = await screen.findByRole("dialog", { name: "智能助手" });
    expect(await within(dialog).findByText("订单总数")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "打开整页" })).toHaveAttribute("href", "/assistant");
    await user.type(within(dialog).getByRole("textbox", { name: "输入问题" }), "这单卡在哪{Enter}");
    expect(await within(dialog).findByText("已完成 7 / 10")).toBeInTheDocument();
    expect(body).toMatchObject({ content: "这单卡在哪", context: { docNo: "PO0009631" } });
  });
});

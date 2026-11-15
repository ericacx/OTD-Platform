import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { setTokenInfo } from "@/lib/auth/token-storage";
import { mockSample } from "@/mocks/handlers/sample";
import { server } from "@/mocks/server";
import { usePageDocStore } from "@/stores/page-doc.store";
import { renderWithProviders } from "@/test/render-with-providers";

describe("sample pages", () => {
  beforeEach(() => {
    setTokenInfo({ accessToken: "mock-access-13800000000", refreshToken: "mock-refresh-13800000000" });
  });

  it("shows the sampling detail with the five-stage timeline and slow stages", async () => {
    let advanced: Record<string, unknown> | null = null;
    server.use(
      http.post("*/samples/rounds/:roundId/advance", async ({ request }) => {
        advanced = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ errcode: 0, requestId: "t", data: mockSample });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/samples/s-1" });

    expect(await screen.findByRole("heading", { name: "打样详情" }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText("#12593 · 散点花卉瑜伽防滑隐形袜")).toBeInTheDocument();
    expect(screen.getByText("1 次重打结转")).toBeInTheDocument();
    expect(usePageDocStore.getState().doc).toEqual({ docType: "sample", docId: "s-1", docNo: "SP-2610-012" });
    expect(screen.getByText("成本审核中")).toBeInTheDocument();
    expect(screen.getByText("SR0006192 - FA27 - Flow 2 Protos")).toBeInTheDocument();
    const timeline = screen.getByText("阶段 04 · 质检").closest("li")!;
    expect(within(timeline).getByText("慢于平均")).toBeInTheDocument();
    expect(within(timeline).getByText("1.2 天")).toBeInTheDocument();
    expect(
      screen
        .getAllByText("阶段 05 · 待取样")
        .map((el) => el.closest("li"))
        .find(Boolean),
    ).toHaveAttribute("data-state", "current");
    expect(screen.getByText("40S/1*2 T80C20 纱线")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "推进到「待批复」" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "确认推进" }));
    await waitFor(() => expect(advanced).toMatchObject({ to: "AWAITING_APPROVAL", version: 8 }));
  });

  it("lists sampling orders with KPIs and the sample library", async () => {
    await renderWithProviders({ route: "/samples" });
    expect(await screen.findByRole("heading", { name: "打样管理" }, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText("SP-2610-012")).toBeInTheDocument();
    expect(screen.getByText("进度正常")).toBeInTheDocument();
    expect(screen.getByText("打样进行中")).toBeInTheDocument();
  });

  it("shows the library and material registers", async () => {
    const { unmount } = await renderWithProviders({ route: "/samples/library" });
    expect(await screen.findByRole("heading", { name: "样品库" }, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText("样品间 A-03-2")).toBeInTheDocument();
    expect(screen.getAllByText("QRS 品质参考样").length).toBeGreaterThan(0);
    unmount();
    await renderWithProviders({ route: "/samples/materials" });
    expect(await screen.findByRole("heading", { name: "备料登记" }, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText("到料逾期")).toBeInTheDocument();
  });

  it("lets sales move a READY round to awaiting approval but not advance knitting stages", async () => {
    setTokenInfo({ accessToken: "mock-access-13800000001", refreshToken: "mock-refresh-13800000001" });
    await renderWithProviders({ route: "/samples/s-1" });
    expect(await screen.findByRole("button", { name: "推进到「待批复」" }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "登记备料" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "登记样品" })).not.toBeInTheDocument();
  });
});

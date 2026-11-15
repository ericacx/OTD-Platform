import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setTokenInfo } from "@/lib/auth/token-storage";
import { mockQuote } from "@/mocks/handlers/quote";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/render-with-providers";

describe("quote pages", () => {
  beforeEach(() => {
    setTokenInfo({ accessToken: "mock-access-13800000000", refreshToken: "mock-refresh-13800000000" });
  });

  const originalUrl = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL };

  afterEach(() => {
    Object.assign(URL, originalUrl);
  });

  it("lists quotes with the latest round and opens the detail", async () => {
    const user = userEvent.setup();
    const { router } = await renderWithProviders({ route: "/quotes" });
    expect(await screen.findByRole("heading", { name: "报价单管理" })).toBeInTheDocument();
    const row = (await screen.findByText("QT-12593-04")).closest("tr")!;
    expect(within(row).getByText("$2.80")).toBeInTheDocument();
    expect(within(row).getByText("14.4%")).toBeInTheDocument();
    expect(within(row).getByText("已报价")).toBeInTheDocument();
    await user.click(within(row).getByText("北岸运动"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/quotes/q-12593"));
  });

  it("shows the #12593 header numbers and both round tabs", async () => {
    const user = userEvent.setup();
    await renderWithProviders({ route: "/quotes/q-12593" });
    expect(await screen.findByRole("heading", { name: "报价单详情" })).toBeInTheDocument();
    expect(screen.getByText("#12593 · 散点花卉瑜伽防滑隐形袜")).toBeInTheDocument();
    expect(screen.getAllByText("16.09 元/双").length).toBeGreaterThan(0);
    expect(screen.getByText("$2.82 ｜ ¥18.33（锁汇 6.5）")).toBeInTheDocument();
    expect(screen.getByText("19.31 元/双 ｜ $2.87")).toBeInTheDocument();
    expect(screen.getByText(/18\.79 元\/双 ｜ \$2\.80 ｜ 毛利 14\.4%/)).toBeInTheDocument();
    expect(screen.getAllByText("低 $0.02").length).toBeGreaterThan(0);
    const customerRow = screen.getByText("QT-12593-04").closest("tr")!;
    expect(within(customerRow).getByText("第 3 轮")).toBeInTheDocument();
    expect(within(customerRow).getByRole("button", { name: "客户接受" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "内部报价 1" }));
    const internalRow = (await screen.findByText("QT-12593-01")).closest("tr")!;
    expect(within(internalRow).getByText("16.7%")).toBeInTheDocument();
    expect(within(internalRow).getByText("2,400")).toBeInTheDocument();
  });

  it("previews a new round, blocks it below the guardrail and submits with the quote version", async () => {
    let submitted: { kind: string; priceCny: number; quantity: number; version: number } | null = null;
    server.use(
      http.post("*/quotes/:id/rounds", async ({ request }) => {
        submitted = (await request.json()) as typeof submitted;
        return HttpResponse.json({ errcode: 0, data: { ...mockQuote, version: 6 }, requestId: "t" });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/quotes/q-12593" });
    await user.click(await screen.findByRole("button", { name: "+ 新建报价" }));
    const dialog = await screen.findByRole("dialog");
    const price = within(dialog).getByLabelText("客户报价（元/双）");
    await user.clear(price);
    await user.type(price, "17.5");
    expect((await within(dialog).findAllByText("8.1%", {}, { timeout: 3000 })).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/毛利低于护栏/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "生成报价" })).toBeDisabled();

    await user.clear(price);
    await user.type(price, "18.79");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "生成报价" })).toBeEnabled(), {
      timeout: 3000,
    });
    expect(within(dialog).getAllByText("14.4%").length).toBeGreaterThan(0);
    await user.click(within(dialog).getByRole("button", { name: "生成报价" }));
    await waitFor(() => expect(submitted).not.toBeNull());
    expect(submitted).toMatchObject({ kind: "CUSTOMER", priceCny: 18.79, quantity: 30000, version: 5 });
  });

  it("downloads export forms and customer template files as blobs", async () => {
    const createObjectURL = vi.fn(() => "blob:otd");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    server.use(
      http.get(
        "*/files/:id",
        () =>
          new HttpResponse(new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer, {
            headers: {
              "content-type": "application/pdf",
              "content-disposition": "inline; filename*=UTF-8''W27%20BONDS.pdf",
            },
          }),
      ),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/quotes/q-12593" });
    const row = (await screen.findByText("报价记录汇总")).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "下载" }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "下载 W27 BONDS RFQ 报价单.xlsx" }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(2));
    const blob = (createObjectURL.mock.calls[1] as unknown as [Blob])[0];
    expect(blob.type).toBe("application/pdf");
    expect(revokeObjectURL).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("lists strategies with their parameters", async () => {
    await renderWithProviders({ route: "/quotes/strategies" });
    expect(await screen.findByRole("heading", { name: "策略管理" })).toBeInTheDocument();
    const row = (await screen.findByText("PS-002")).closest("tr")!;
    expect(within(row).getByText("大单进取 · 让利换量")).toBeInTheDocument();
    expect(within(row).getByText("目标毛利")).toBeInTheDocument();
    expect(within(row).getByText(/≥50万 -1%/)).toBeInTheDocument();
  });
});

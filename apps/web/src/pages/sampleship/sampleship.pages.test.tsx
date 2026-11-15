import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { setTokenInfo } from "@/lib/auth/token-storage";
import { mockShipments } from "@/mocks/handlers/sampleship";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/render-with-providers";

describe("sample shipping pages", () => {
  beforeEach(() => {
    setTokenInfo({ accessToken: "mock-access-13800000001", refreshToken: "mock-refresh-13800000001" });
  });

  it("lists shipments with recipients and items", async () => {
    await renderWithProviders({ route: "/sample-shipments" });
    expect(await screen.findByRole("heading", { name: "寄样列表" })).toBeInTheDocument();
    const row = (await screen.findByText("SM-2610-004")).closest("tr")!;
    expect(within(row).getByText("NorthShore Design Studio")).toBeInTheDocument();
    expect(within(row).getByText("#12593 PROTO × 6")).toBeInTheDocument();
    expect(within(row).getByText("草稿")).toBeInTheDocument();
  });

  it("marks a draft shipment as sent with the tracking number and version", async () => {
    let submitted: { trackingNo: string; version: number } | null = null;
    server.use(
      http.post("*/sample-shipments/:id/send", async ({ request }) => {
        submitted = (await request.json()) as typeof submitted;
        return HttpResponse.json({
          errcode: 0,
          data: { ...mockShipments[0], status: "SENT", trackingNo: "SF7710003425", version: 2 },
          requestId: "t",
        });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/sample-shipments/sm-1" });
    await user.click(await screen.findByRole("button", { name: "登记寄出" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("快递单号"), "SF7710003425");
    await user.click(within(dialog).getByRole("button", { name: "登记寄出" }));
    await waitFor(() => expect(submitted).toEqual({ trackingNo: "SF7710003425", courier: "DHL", version: 1 }));
  });

  it("lists recipients", async () => {
    await renderWithProviders({ route: "/sample-shipments/recipients" });
    expect(await screen.findByRole("heading", { name: "收件人管理" })).toBeInTheDocument();
    expect(await screen.findByText("Milena")).toBeInTheDocument();
    expect(screen.getByText("默认")).toBeInTheDocument();
  });
});

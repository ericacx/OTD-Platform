import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { setTokenInfo } from "@/lib/auth/token-storage";
import { mockBookings, mockShipments } from "@/mocks/handlers/shipment";
import { server } from "@/mocks/server";
import { usePageDocStore } from "@/stores/page-doc.store";
import { renderWithProviders } from "@/test/render-with-providers";

describe("shipment pages", () => {
  beforeEach(() => {
    setTokenInfo({ accessToken: "mock-access-13800000000", refreshToken: "mock-refresh-13800000000" });
  });

  it("lists shipments with KPIs", async () => {
    await renderWithProviders({ route: "/shipments" });
    expect(await screen.findByRole("heading", { name: "出货明细" })).toBeInTheDocument();
    expect(await screen.findByText("待船司确认订舱")).toBeInTheDocument();
    const row = (await screen.findByText("SH-2611-001")).closest("tr")!;
    expect(within(row).getByText("已到港")).toBeInTheDocument();
    expect(within(row).getByText("BK-2611-001")).toBeInTheDocument();
  });

  it("shows five milestones and records POD with the version", async () => {
    let submitted: { version: number; signedAt?: string } | null = null;
    server.use(
      http.post("*/shipments/:id/sign", async ({ request }) => {
        submitted = (await request.json()) as { version: number };
        return HttpResponse.json({
          errcode: 0,
          data: { ...mockShipments[0], status: "SIGNED", version: 5 },
          requestId: "t",
        });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/shipments/sh-arrived" });

    expect(await screen.findByRole("heading", { name: "出货详情" })).toBeInTheDocument();
    expect(usePageDocStore.getState().doc).toEqual({ docType: "shipment", docId: "sh-arrived", docNo: "SH-2611-001" });
    const steps = screen.getAllByRole("listitem").filter((li) => li.hasAttribute("data-state"));
    expect(steps.map((li) => li.getAttribute("data-state"))).toEqual(["done", "done", "done", "done", "current"]);
    expect(screen.getByText(/12 行装箱单/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /返回 INSP-2611-003/ })).toHaveAttribute("href", "/inspections/insp-fri");

    await user.click(screen.getByRole("button", { name: "登记签收" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "登记签收" }));
    await waitFor(() => expect(submitted).not.toBeNull());
    expect(submitted!.version).toBe(4);
    expect(submitted!.signedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("confirms a booking awaiting the carrier", async () => {
    let submitted: { version: number; vessel?: string } | null = null;
    server.use(
      http.post("*/bookings/:id/confirm", async ({ request }) => {
        submitted = (await request.json()) as { version: number };
        return HttpResponse.json({
          errcode: 0,
          data: { ...mockBookings[0], status: "CONFIRMED", version: 3 },
          requestId: "t",
        });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/shipments/bookings" });
    const row = (await screen.findByText("BK-2611-001")).closest("tr")!;
    expect(within(row).getByText("待船司确认")).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "确认订舱" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "确认订舱" }));
    await waitFor(() => expect(submitted).not.toBeNull());
    expect(submitted!.version).toBe(2);
    expect(submitted!.vessel).toBe("EVER ACE");
  });
});

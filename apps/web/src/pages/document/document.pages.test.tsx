import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { setTokenInfo } from "@/lib/auth/token-storage";
import { renderWithProviders } from "@/test/render-with-providers";

describe("document pages", () => {
  beforeEach(() => {
    setTokenInfo({ accessToken: "mock-access-13800000000", refreshToken: "mock-refresh-13800000000" });
  });

  it("lists handover packages with progress and missing items", async () => {
    await renderWithProviders({ route: "/documents/handovers" });
    expect(await screen.findByRole("heading", { name: "技术资料包" })).toBeInTheDocument();
    const row = (await screen.findByText("DH-2610-001")).closest("tr")!;
    expect(within(row).getByText("4 / 5")).toBeInTheDocument();
    expect(within(row).getByText("QRS 品质参考样已留存")).toBeInTheDocument();
  });

  it("shows the G1 checklist and keeps handover disabled while QRS is missing", async () => {
    await renderWithProviders({ route: "/documents/handovers/h-1" });
    expect(await screen.findByRole("heading", { name: "开发移交包详情" })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "五项齐套清单" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[3]).toHaveAttribute("data-state", "missing");
    expect(items[0]).toHaveAttribute("data-state", "ok");
    expect(screen.getByRole("button", { name: "确认移交" })).toBeDisabled();
  });

  it("treats trimmed conditions as not applicable and hands over", async () => {
    const user = userEvent.setup();
    await renderWithProviders({ route: "/documents/handovers/h-2" });
    const list = await screen.findByRole("list", { name: "五项齐套清单" });
    expect(within(list).getAllByRole("listitem")[2]).toHaveAttribute("data-state", "na");
    await user.click(screen.getByRole("button", { name: "确认移交" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "确认" }));
    await waitFor(() => expect(screen.getAllByText("已移交").length).toBeGreaterThan(0));
  });

  it("lists knowledge base documents and opens one", async () => {
    const user = userEvent.setup();
    await renderWithProviders({ route: "/documents/kb" });
    expect(await screen.findByRole("heading", { name: "知识库" })).toBeInTheDocument();
    await user.click(await screen.findByText("报价护栏与例外审批制度"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("护栏是报价的最低毛利率底线。")).toBeInTheDocument();
  });
});

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { setTokenInfo } from "@/lib/auth/token-storage";
import { resetFactoryauditMocks } from "@/mocks/handlers/factoryaudit";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/render-with-providers";

function capture(method: "post" | "put", path: string) {
  const calls: unknown[] = [];
  server.use(
    http[method](path, async ({ request }) => {
      calls.push(await request.clone().json());
      return undefined;
    }),
  );
  return calls;
}

describe("factory audit pages", () => {
  beforeEach(() => {
    resetFactoryauditMocks();
    setTokenInfo({ accessToken: "mock-access-13800000000", refreshToken: "mock-refresh-13800000000" });
  });

  it("lists plans and creates a new audit plan", async () => {
    const created = capture("post", "*/factory-audits");
    const user = userEvent.setup();
    await renderWithProviders({ route: "/factory-audits" });

    expect(await screen.findByRole("heading", { name: "审计计划" })).toBeInTheDocument();
    const row = (await screen.findByText("AUD-2611-002")).closest("tr")!;
    expect(within(row).getByText("计划中")).toBeInTheDocument();
    expect(within(row).getByText("反恐")).toBeInTheDocument();
    expect(screen.getByText("AUD-2611-001").closest("tr")!).toHaveTextContent("审计中");
    expect(screen.queryByText("AUD-2610-001")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "新建审计计划" }));
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("审计类型"), "CUSTOMER");
    fireEvent.change(within(dialog).getByLabelText("计划日期"), { target: { value: "2026-12-20" } });
    await user.type(within(dialog).getByLabelText("审计方"), "晨跑者 QA");
    await user.selectOptions(within(dialog).getByLabelText("客户"), "c-mrn");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toEqual({
      factoryId: "f-1",
      auditType: "CUSTOMER",
      plannedDate: "2026-12-20",
      auditor: "晨跑者 QA",
      customerId: "c-mrn",
      note: null,
    });
    expect(await screen.findByText("AUD-2611-003")).toBeInTheDocument();
  });

  it("starts a planned audit with its version", async () => {
    const started = capture("post", "*/factory-audits/:id/start");
    const user = userEvent.setup();
    await renderWithProviders({ route: "/factory-audits" });

    const row = (await screen.findByText("AUD-2611-002")).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "开始审计" }));

    await waitFor(() => expect(started).toEqual([{ version: 1 }]));
    await waitFor(() => expect(screen.getByText("AUD-2611-002").closest("tr")!).toHaveTextContent("审计中"));
  });

  it("refuses to close an audit that still has open findings", async () => {
    const user = userEvent.setup();
    await renderWithProviders({ route: "/factory-audits/records" });

    const row = (await screen.findByText("AUD-2610-001")).closest("tr")!;
    expect(within(row).getByText("有条件通过")).toBeInTheDocument();
    expect(within(row).getByText("2 未关闭 · 1 逾期")).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "AUD-2610-001" }));

    const sheet = await screen.findByRole("dialog");
    expect(await within(sheet).findByText("化学品仓 MSDS 不全（缺 6 种助剂）")).toBeInTheDocument();
    expect(within(sheet).getByText("逾期 3 天")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "关闭审计" }));
    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: "确认" }));

    expect(await within(confirm).findByText("还有 2 项整改未关闭，不能关闭审计")).toBeInTheDocument();
  });

  it("closes an open finding from the findings tracker", async () => {
    const closed = capture("post", "*/factory-audits/findings/:id/close");
    const user = userEvent.setup();
    await renderWithProviders({ route: "/factory-audits/findings?status=OPEN" });

    expect(await screen.findByRole("heading", { name: "整改跟踪" })).toBeInTheDocument();
    const row = (await screen.findByText("化学品仓 MSDS 不全（缺 6 种助剂）")).closest("tr")!;
    expect(within(row).getByText("逾期 3 天")).toBeInTheDocument();
    expect(within(row).getByText("高")).toBeInTheDocument();
    expect(screen.queryByText("车间急救箱药品过期")).not.toBeInTheDocument();

    await user.click(within(row).getByRole("button", { name: "关闭整改" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("关闭说明"), "MSDS 已补齐张贴");
    await user.click(within(dialog).getByRole("button", { name: "关闭整改" }));

    await waitFor(() => expect(closed).toEqual([{ version: 1, closeNote: "MSDS 已补齐张贴" }]));
    await waitFor(() => expect(screen.queryByText("化学品仓 MSDS 不全（缺 6 种助剂）")).not.toBeInTheDocument());
    expect(screen.getByText("员工加班记录与工资单不一致")).toBeInTheDocument();
  });
});

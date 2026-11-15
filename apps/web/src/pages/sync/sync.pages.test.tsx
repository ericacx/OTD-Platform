import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { setTokenInfo } from "@/lib/auth/token-storage";
import { resetSyncMock } from "@/mocks/handlers/sync";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/render-with-providers";

const FIRST = { timeout: 15_000 };

describe("sync pages", () => {
  beforeEach(() => {
    resetSyncMock();
    setTokenInfo({ accessToken: "mock-access-13800000000", refreshToken: "mock-refresh-13800000000" });
  });

  it("shows the task detail like the video and clears failures on retry", async () => {
    const user = userEvent.setup();
    await renderWithProviders({ route: "/sync/tasks/task-nsr" });

    expect(await screen.findByRole("heading", { name: /同步任务详情/ }, FIRST)).toBeInTheDocument();
    expect(screen.getByText("SYN-2026-003 · NSR 订单交期同步（OTD 平台 → 客户系统）")).toBeInTheDocument();
    expect(screen.getAllByText("部分成功").length).toBeGreaterThan(0);
    expect(screen.getAllByText("每半天一次").length).toBeGreaterThan(0);
    expect(screen.getByText("少量记录因编码映射未命中失败，已进重试队列。")).toBeInTheDocument();

    const batches = screen.getByRole("heading", { name: "同步批次明细" }).closest("section")!;
    const b04 = within(batches).getByText("B04").closest("tr")!;
    expect(within(b04).getByText("371")).toBeInTheDocument();
    expect(within(b04).getByText("1 分 17 秒")).toBeInTheDocument();

    const failures = screen.getByRole("heading", { name: "失败明细（重试队列）" }).closest("section")!;
    expect(within(failures).getByText("订单交期-1101")).toBeInTheDocument();
    expect(within(failures).getByText("接口超时")).toBeInTheDocument();
    expect(within(failures).getByText("在转换规则里统一为 YYYY-MM-DD")).toBeInTheDocument();

    const logs = screen.getByRole("heading", { name: "操作日志" }).closest("section")!;
    expect(await within(logs).findByText("执行完成：成功 1,490 条，失败 2 条，跳过 0 条")).toBeInTheDocument();
    expect(within(logs).getAllByText("系统").length).toBe(2);

    const mappingCard = screen.getByRole("heading", { name: "字段映射（主数据适配器）" }).closest("section")!;
    expect(await within(mappingCard).findByText("VendorSiteCode")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重试失败记录" }));
    expect(await screen.findByText("重试队列已清空")).toBeInTheDocument();
    expect(await within(logs).findByText("手动重试失败记录 2 条：成功 2 条，仍失败 0 条")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试失败记录" })).toBeDisabled();
  });

  it("lists sync tasks with KPIs and filters", async () => {
    await renderWithProviders({ route: "/sync/tasks" });
    expect(await screen.findByRole("heading", { name: "同步任务管理" }, FIRST)).toBeInTheDocument();
    const row = (await screen.findByText("SYN-2026-003")).closest("tr")!;
    expect(within(row).getByText("NSR")).toBeInTheDocument();
    expect(within(row).getByText("OTD 平台 → NSR 客户系统（模拟）")).toBeInTheDocument();
    expect(within(row).getByText("部分成功")).toBeInTheDocument();
    const erp = screen.getByText("SYN-2026-001").closest("tr")!;
    expect(within(erp).getByText("环思 ERP（模拟） → OTD 平台")).toBeInTheDocument();
    expect(within(erp).getByText("拉取")).toBeInTheDocument();
  });

  it("manages endpoint credentials without revealing them", async () => {
    let submitted: { credential: Record<string, string> | null; version: number } | null = null;
    server.use(
      http.put("*/sync/endpoints/:id/credential", async ({ request }) => {
        submitted = (await request.json()) as typeof submitted;
        return HttpResponse.json({ errcode: 0, data: null, requestId: "t" });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/sync/endpoints" });

    const row = (await screen.findByText("NSR 客户系统（模拟）", {}, FIRST)).closest("tr")!;
    expect(within(row).getByText("已配置")).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "管理凭据" }));
    const dialog = await screen.findByRole("dialog");
    const password = within(dialog).getByLabelText("值 password");
    expect(password).toHaveAttribute("placeholder", "当前 ******");
    expect(password).toHaveValue("");
    await user.type(within(dialog).getByLabelText("值 username"), "otd-sync");
    await user.type(password, "N3w-secret");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(submitted).not.toBeNull());
    expect(submitted!).toEqual({ credential: { username: "otd-sync", password: "N3w-secret" }, version: 1 });

    const mrn = screen.getByText("MRN Supplier Portal").closest("tr")!;
    expect(within(mrn).getByText("REST API")).toBeInTheDocument();
    expect(within(mrn).getByText("未配置")).toBeInTheDocument();
  });

  it("edits a mapping and previews it with a sample", async () => {
    const user = userEvent.setup();
    await renderWithProviders({ route: "/sync/mappings" });
    const row = (await screen.findByText("NSR 订单交期映射", {}, FIRST)).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "编辑" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("目标字段 3")).toHaveValue("VendorSiteCode");
    await user.click(within(dialog).getByRole("button", { name: "用样例预览" }));
    expect(await within(dialog).findByText("全部字段转换成功")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("转换结果")).toHaveTextContent("SITE-NH5");

    await user.clear(within(dialog).getByLabelText("对应关系（每行 来源=目标） plant"));
    await user.click(within(dialog).getByRole("button", { name: "用样例预览" }));
    expect(await within(dialog).findByText("映射未命中")).toBeInTheDocument();
  });

  it("retries selected records from the retry queue", async () => {
    const user = userEvent.setup();
    await renderWithProviders({ route: "/sync/retry" });
    expect(await screen.findByRole("heading", { name: "重试队列" }, FIRST)).toBeInTheDocument();
    const row = (await screen.findByText("订单交期-1102")).closest("tr")!;
    expect(within(row).getByText("待人工处理")).toBeInTheDocument();
    expect(screen.getByText("测试报告-2201").closest("tr")).toHaveTextContent("已放弃");
    await user.click(within(row).getByRole("checkbox", { name: "选择 订单交期-1102" }));
    await user.click(screen.getByRole("button", { name: "重试所选（1）" }));
    await waitFor(() => expect(screen.queryByText("订单交期-1102")).not.toBeInTheDocument());
  });
});

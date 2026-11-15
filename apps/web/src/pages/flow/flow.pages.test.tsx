import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { setTokenInfo } from "@/lib/auth/token-storage";
import { resetFlowMocks } from "@/mocks/handlers/flow";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/render-with-providers";

type DraftBody = {
  modules: { moduleCode: string; items: { itemCode: string }[] }[];
  params: Record<string, unknown>;
  version: number;
};

describe("flow config pages", () => {
  beforeEach(() => {
    resetFlowMocks();
    setTokenInfo({ accessToken: "mock-access-13800000000", refreshToken: "mock-refresh-13800000000" });
  });

  it("lists the service catalog with planned modules greyed and opens the item list", async () => {
    const user = userEvent.setup();
    await renderWithProviders({ route: "/flow/modules" });

    expect(await screen.findByRole("heading", { name: "模块配置" })).toBeInTheDocument();
    const pending = (await screen.findByText("TNA 与预警管理")).closest("tr")!;
    expect(pending).toHaveAttribute("data-pending", "true");
    expect(within(pending).getByText("暂无承载页面")).toBeInTheDocument();
    expect(within(pending).queryByRole("button", { name: "选择客户" })).not.toBeInTheDocument();

    const sampling = screen.getByText("打样开发").closest("tr")!;
    expect(within(sampling).getByText("6 / 8 家")).toBeInTheDocument();
    await user.click(within(sampling).getByRole("button", { name: "服务项" }));
    const sheet = await screen.findByRole("dialog");
    expect(await within(sheet).findByText("QRS 品质参考样")).toBeInTheDocument();
    expect(within(sheet).getByText("G1.qrsRetained")).toBeInTheDocument();
  });

  it("shows the customer card wall with flow status", async () => {
    await renderWithProviders({ route: "/flow/customers" });

    const card = await screen.findByRole("link", { name: "北岸运动" });
    expect(within(card).getByText("v1 · 有未发布改动")).toBeInTheDocument();
    expect(within(card).getByText(/NSR · Milena Ortiz · 月结 60 天/)).toBeInTheDocument();
    expect(card).toHaveAttribute("href", "/flow/customers/c-nsr");
    expect(within(screen.getByRole("link", { name: "枫林户外" })).getByText("已发布 v1")).toBeInTheDocument();
  });

  it("edits the draft with the flow version and publishes after comparing", async () => {
    const drafts: DraftBody[] = [];
    let published: { version: number; note?: string } | null = null;
    server.use(
      http.put("*/flow/customers/:customerId/draft", async ({ request }) => {
        drafts.push((await request.clone().json()) as DraftBody);
        return undefined;
      }),
      http.post("*/flow/customers/:customerId/publish", async ({ request }) => {
        published = (await request.clone().json()) as { version: number; note?: string };
        return undefined;
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/flow/customers/c-nsr" });

    expect(await screen.findByRole("heading", { name: "流程配置 · 北岸运动" })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "已启用的服务模块" });
    const testing = within(list).getByRole("listitem", { name: "测试服务" });
    const roundness = within(testing).getByRole("button", { name: "圆率测试" });
    expect(roundness).toHaveAttribute("aria-pressed", "false");

    await user.click(roundness);
    await waitFor(() => expect(drafts).toHaveLength(1));
    expect(drafts[0]!.version).toBe(3);
    expect(drafts[0]!.modules.find((m) => m.moduleCode === "SM05")!.items.map((i) => i.itemCode)).toEqual([
      "SM05-01",
      "SM05-02",
      "SM05-03",
      "SM05-04",
    ]);
    await waitFor(() =>
      expect(
        within(screen.getByRole("listitem", { name: "测试服务" })).getByRole("button", { name: "圆率测试" }),
      ).toHaveAttribute("aria-pressed", "true"),
    );

    await user.click(within(screen.getByRole("listitem", { name: "打样开发" })).getByRole("button", { name: "上移" }));
    await waitFor(() => expect(drafts).toHaveLength(2));
    expect(drafts[1]!.version).toBe(4);
    expect(drafts[1]!.modules.map((m) => m.moduleCode).slice(0, 3)).toEqual(["SM01", "SM03", "SM02"]);

    await user.click(screen.getByRole("button", { name: "发布" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/同厂同日验货上限（款）：5 → 4/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("变更说明（可选）"), "调整测试项");
    await user.click(within(dialog).getByRole("button", { name: "发布" }));
    await waitFor(() => expect(published).toEqual({ version: 5, note: "调整测试项" }));
  });

  it("removes a module and adds it back with all of its items", async () => {
    const drafts: DraftBody[] = [];
    server.use(
      http.put("*/flow/customers/:customerId/draft", async ({ request }) => {
        drafts.push((await request.clone().json()) as DraftBody);
        return undefined;
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/flow/customers/c-nsr" });

    const add = await screen.findByRole("button", { name: "添加模块" });
    expect(add).toBeDisabled();
    await user.click(within(screen.getByRole("listitem", { name: "包装服务" })).getByRole("button", { name: "移除" }));
    await waitFor(() => expect(drafts).toHaveLength(1));
    expect(drafts[0]!.modules.map((m) => m.moduleCode)).not.toContain("SM07");
    await waitFor(() => expect(screen.queryByRole("listitem", { name: "包装服务" })).not.toBeInTheDocument());

    await waitFor(() => expect(screen.getByRole("button", { name: "添加模块" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "添加模块" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /包装服务/ }));
    await waitFor(() => expect(drafts).toHaveLength(2));
    expect(drafts[1]!.version).toBe(4);
    const added = drafts[1]!.modules.at(-1)!;
    expect(added.moduleCode).toBe("SM07");
    expect(added.items.map((i) => i.itemCode)).toEqual(["SM07-01", "SM07-02"]);
    expect(await screen.findByRole("listitem", { name: "包装服务" })).toBeInTheDocument();
  });

  it("previews and migrates in-flight orders", async () => {
    let migrated: { targetVersionId: string } | null = null;
    server.use(
      http.post("*/flow/customers/:customerId/migrate", async ({ request }) => {
        migrated = (await request.json()) as { targetVersionId: string };
        return HttpResponse.json({
          errcode: 0,
          data: { migrated: 1, orderIds: ["o-1"], target: { versionId: "v-nsr-2", versionNo: 2 } },
          requestId: "t",
        });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/flow/customers/c-nsr" });

    await user.click(await screen.findByRole("button", { name: "迁移在途订单" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("PO0010459")).toBeInTheDocument();
    expect(within(dialog).getByText("1 张在途订单可迁移到 v2")).toBeInTheDocument();
    expect(within(dialog).getByText(/N03 测试/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "确认迁移 1 张" }));
    expect(await within(dialog).findByText("已迁移 1 张订单")).toBeInTheDocument();
    expect(migrated).toEqual({ targetVersionId: "v-nsr-2" });
  });

  it("lists rule packs and only lets customer overrides be deleted", async () => {
    let deleted = "";
    server.use(
      http.delete("*/flow/rule-packs/:id", ({ params }) => {
        deleted = params.id as string;
        return HttpResponse.json({ errcode: 0, data: null, requestId: "t" });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/flow/rule-packs" });

    const global = (await screen.findByText("RP-RELEASE")).closest("tr")!;
    expect(within(global).getByText("全局默认")).toBeInTheDocument();
    expect(within(global).queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
    const override = screen.getByText("RP-RELEASE-NSR").closest("tr")!;
    expect(within(override).getByText("NSR 北岸运动")).toBeInTheDocument();
    await user.click(within(override).getByRole("button", { name: "删除" }));
    await user.click(await within(await screen.findByRole("alertdialog")).findByRole("button", { name: "确认" }));
    await waitFor(() => expect(deleted).toBe("rp-3"));
  });

  it("shows rule pack versions and rolls back to a snapshot", async () => {
    let rollbackBody: { snapshotId: string; reason: string } | null = null;
    server.use(
      http.post("*/flow/rule-packs/:id/rollback", async ({ request }) => {
        rollbackBody = (await request.json()) as { snapshotId: string; reason: string };
        return undefined;
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/flow/rule-packs" });

    const override = (await screen.findByText("RP-RELEASE-NSR")).closest("tr")!;
    await user.click(within(override).getByRole("button", { name: "版本记录" }));
    const sheet = await screen.findByRole("dialog");
    expect(await within(sheet).findByText("规则包版本记录：北岸运动放行规则")).toBeInTheDocument();
    expect(within(sheet).getByText("临时收紧")).toBeInTheDocument();

    await user.click(within(sheet).getByRole("button", { name: "回退到 v2" }));
    await user.type(within(sheet).getByLabelText("回退原因"), "恢复原参数");
    await user.click(within(sheet).getByRole("button", { name: "确认回退" }));
    await waitFor(() => expect(rollbackBody).toEqual({ snapshotId: "snap-rp-2", reason: "恢复原参数" }));
  });

  it("deletes an unused module but shows the in-use error for a mandatory one", async () => {
    const user = userEvent.setup();
    await renderWithProviders({ route: "/flow/modules" });

    const sampling = (await screen.findByText("打样开发")).closest("tr")!;
    await user.click(within(sampling).getByRole("button", { name: "删除" }));
    let dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "确认" }));
    expect(await within(dialog).findByText(/仍被 6 个客户流程使用，不能删除/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());

    const quote = screen.getByText("报价与定价").closest("tr")!;
    await user.click(within(quote).getByRole("button", { name: "删除" }));
    dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "确认" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("warns and blocks publishing when a mandatory module is cut from the draft", async () => {
    const user = userEvent.setup();
    await renderWithProviders({ route: "/flow/customers/c-nsr" });

    expect(await screen.findByRole("heading", { name: "流程配置 · 北岸运动" })).toBeInTheDocument();
    expect(screen.queryByText(/必选服务模块被裁掉/)).not.toBeInTheDocument();

    await user.click(
      within(screen.getByRole("listitem", { name: "企划与开发" })).getByRole("button", { name: "移除" }),
    );
    expect(await screen.findByText(/必选服务模块被裁掉：N01/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发布" })).toBeDisabled();
  });
});

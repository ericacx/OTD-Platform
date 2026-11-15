import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { setTokenInfo } from "@/lib/auth/token-storage";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/render-with-providers";

describe("system pages", () => {
  beforeEach(() => {
    setTokenInfo({ accessToken: "mock-access-13800000000", refreshToken: "mock-refresh-13800000000" });
  });

  it("lists roles with KPIs and saves grants with the role version", async () => {
    let submitted: { permissions: string[]; allCustomers: boolean; customerIds: string[]; version: number } | null =
      null;
    server.use(
      http.put("*/system/roles/:id/grants", async ({ request }) => {
        submitted = (await request.json()) as typeof submitted;
        return HttpResponse.json({
          errcode: 0,
          data: {
            id: "r-1",
            code: "R001",
            name: "业务员",
            nameEn: null,
            type: "BUSINESS",
            dataScope: "SELF",
            allCustomers: false,
            customers: [],
            permissionCount: 1,
            menuPermissionCount: 1,
            memberCount: 1,
            status: "ACTIVE",
            description: null,
            version: 2,
            permissions: ["todo.todo.view"],
          },
          requestId: "t",
        });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/system/roles" });

    expect(await screen.findByRole("heading", { name: "角色管理" })).toBeInTheDocument();
    const row = (await screen.findByText("业务员")).closest("tr")!;
    expect(within(row).getByText("仅本人")).toBeInTheDocument();

    await user.click(within(row).getByRole("button", { name: "权限管理" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/角色权限管理/)).toBeInTheDocument();
    await within(dialog).findByText("客户数据范围");
    await user.click(within(dialog).getByRole("button", { name: "清空" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "今日待办" }));
    await user.click(within(dialog).getByRole("button", { name: "保存权限" }));

    await waitFor(() => expect(submitted).not.toBeNull());
    expect(submitted!.permissions).toEqual(["todo.todo.view"]);
    expect(submitted!.version).toBe(1);
    expect(submitted!.customerIds).toHaveLength(6);
  });

  it("shows the org tree, detail and members", async () => {
    const user = userEvent.setup();
    await renderWithProviders({ route: "/system/orgs" });

    const tree = await screen.findByRole("list", { name: "组织架构" });
    await user.click(within(tree).getByRole("button", { name: /业务一部/ }));
    expect(await screen.findByText("ORG003")).toBeInTheDocument();
    expect(await screen.findByText(/部门成员/)).toBeInTheDocument();
  });

  it("creates a user and displays the one-time initial password", async () => {
    const user = userEvent.setup();
    await renderWithProviders({ route: "/system/users" });

    expect(await screen.findByText("王芳")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "新建用户" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("姓名"), "新同事");
    await user.type(within(dialog).getByLabelText("手机号"), "13900000001");
    await user.selectOptions(within(dialog).getByLabelText("所属组织"), "o-3");
    await user.click(within(dialog).getByRole("checkbox", { name: "业务员" }));
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(await screen.findByTestId("initial-password")).toHaveTextContent("OtdMock12345");
  });

  it("lists customers and opens the edit dialog", async () => {
    const user = userEvent.setup();
    await renderWithProviders({ route: "/masterdata/customers" });

    const row = (await screen.findByText("北岸运动")).closest("tr")!;
    expect(within(row).getByText("月结 60 天")).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "编辑" }));
    expect(await screen.findByRole("heading", { name: "编辑客户" })).toBeInTheDocument();
    expect(screen.getByLabelText("客户简码")).toBeDisabled();
  });
});

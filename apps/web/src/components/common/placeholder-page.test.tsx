import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { RouterProvider, createMemoryRouter } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";

import { createAppI18n } from "@/lib/i18n/i18n";

import { PlaceholderPage, leafByPermission, leafHandle, leafPath, placeholderRoutes } from "./placeholder-page";

import type { i18n as I18n } from "i18next";

let i18n: I18n;

beforeAll(async () => {
  i18n = await createAppI18n({ lng: "zh-CN" });
});

describe("placeholder page", () => {
  it("renders the menu label and the module code", async () => {
    const { leaf, group } = leafByPermission("sync.task.view");
    const router = createMemoryRouter([
      { path: "/", element: <PlaceholderPage leaf={leaf} moduleCode={group.module} /> },
    ]);
    render(
      <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nextProvider>,
    );
    expect(await screen.findByRole("heading", { name: "同步任务管理" })).toBeInTheDocument();
    expect(screen.getByText("该功能正在建设中")).toBeInTheDocument();
    expect(screen.getByText("模块 M18 将在后续迭代上线")).toBeInTheDocument();
  });

  it("derives route paths and permission handles from the shared menu", () => {
    expect(leafPath("order.monitor.view")).toBe("orders/monitor");
    expect(leafHandle("order.monitor.view").permissions).toEqual(["order.monitor.view"]);
    const routes = placeholderRoutes("sync", ["sync.task.view"]);
    expect(routes.map((r) => r.path)).not.toContain("sync/tasks");
    expect(routes.length).toBeGreaterThan(0);
  });
});

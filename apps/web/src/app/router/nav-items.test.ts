import { PERMISSION_PRESETS, expandPermissionPatterns } from "@otd/shared";
import { describe, expect, it } from "vitest";

import { buildNavItems, firstAllowedPath } from "./nav-items";

describe("nav items", () => {
  it("builds all 22 groups for admins in shared menu order", () => {
    const items = buildNavItems(expandPermissionPatterns(["*"]), "zh-CN");
    expect(items).toHaveLength(22);
    expect(items[0]).toMatchObject({ label: "今日待办", to: "/todo" });
    expect(items.at(-1)?.label).toBe("系统管理");
    expect(items.find((i) => i.code === "M09")?.children?.map((c) => c.to)).toEqual(["/orders", "/orders/monitor"]);
  });

  it("drops groups and leaves without permission and localizes labels", () => {
    const items = buildNavItems(expandPermissionPatterns(PERMISSION_PRESETS.SALES), "en-US");
    expect(items.some((i) => i.code === "M21")).toBe(false);
    expect(items.find((i) => i.code === "M02")?.label).toBe("Briefs");
  });

  it("finds the first allowed path", () => {
    expect(firstAllowedPath(["iam.role.view"])).toBe("/system/roles");
    expect(firstAllowedPath([])).toBe("/403");
  });
});

import { expect, test } from "@playwright/test";

test("demo login reaches today and the roles page", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "欢迎登录" })).toBeVisible();

  await page.getByRole("button", { name: "系统管理员 · 管理员" }).click();
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page).toHaveURL(/\/todo$/);
  await expect(page.getByRole("heading", { name: /管理员/ })).toBeVisible();

  await page.goto("/system/roles");
  await expect(page.getByRole("heading", { name: "角色管理" })).toBeVisible();
  await expect(page.getByText("业务员").first()).toBeVisible();
});

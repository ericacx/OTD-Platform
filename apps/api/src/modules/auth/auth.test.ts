import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PHONES, type TestApp, createTestApp } from "../../testing/test-app.js";

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ demo: false });
});
afterEach(async () => {
  await t.close();
});

describe("auth", () => {
  it("rejects unauthenticated access with an envelope", async () => {
    const res = await t.anon.get("/auth/session");
    expect(res.status).toBe(401);
    expect(res.body.errcode).toBe("AUTH_UNAUTHENTICATED");
    expect(res.body.errmsg).toBe("请先登录");
    expect(res.body.requestId).toBeTruthy();
  });

  it("logs in with phone and password and returns the session", async () => {
    const res = await t.anon.post("/auth/login", { phone: PHONES.sales, password: "otd2026demo" });
    expect(res.status).toBe(200);
    expect(res.body.errcode).toBe(0);
    const { user, accessToken, refreshToken } = res.body.data;
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();
    expect(user.name).toBe("王芳");
    expect(user.roles).toEqual(["R001"]);
    expect(user.dataScope).toBe("SELF");
    expect(user.allCustomers).toBe(false);
    expect(user.customerIds).toHaveLength(6);
    expect(user.permissions).toContain("order.order.view");
    expect(user.permissions).not.toContain("iam.role.grant");
  });

  it("rejects wrong passwords and locks after five failures", async () => {
    for (let i = 0; i < 4; i++) {
      const res = await t.anon.post("/auth/login", { phone: PHONES.sales, password: "wrong" });
      expect(res.body.errcode).toBe("AUTH_INVALID_CREDENTIALS");
    }
    const locked = await t.anon.post("/auth/login", { phone: PHONES.sales, password: "wrong" });
    expect(locked.status).toBe(423);
    const stillLocked = await t.anon.post("/auth/login", { phone: PHONES.sales, password: "otd2026demo" });
    expect(stillLocked.body.errcode).toBe("AUTH_ACCOUNT_LOCKED");
  });

  it("rotates refresh tokens and detects reuse", async () => {
    const login = await t.anon.post("/auth/login", { phone: PHONES.manager, password: "otd2026demo" });
    const first = login.body.data.refreshToken;
    const r1 = await t.anon.post("/auth/refresh", { refreshToken: first });
    expect(r1.status).toBe(200);
    const second = r1.body.data.refreshToken;
    expect(second).not.toBe(first);
    const reuse = await t.anon.post("/auth/refresh", { refreshToken: first });
    expect(reuse.body.errcode).toBe("AUTH_REFRESH_INVALID");
    const afterReuse = await t.anon.post("/auth/refresh", { refreshToken: second });
    expect(afterReuse.body.errcode).toBe("AUTH_REFRESH_INVALID");
  });

  it("logout revokes the session family", async () => {
    const login = await t.anon.post("/auth/login", { phone: PHONES.gm, password: "otd2026demo" });
    const gm = login.body.data;
    const res = await t.app.getHttpAdapter().getInstance().inject({ method: "POST", url: "/api/v1/auth/logout", headers: { authorization: `Bearer ${gm.accessToken}` } });
    expect(res.statusCode).toBe(200);
    const refresh = await t.anon.post("/auth/refresh", { refreshToken: gm.refreshToken });
    expect(refresh.body.errcode).toBe("AUTH_REFRESH_INVALID");
  });

  it("saves preferences", async () => {
    const sales = await t.as("sales");
    const res = await sales.put("/me/preferences", { themeId: "night", locale: "en-US" });
    expect(res.status).toBe(200);
    expect(res.body.data.preferences.themeId).toBe("night");
    expect(res.body.data.locale).toBe("en-US");
  });

  it("health is public", async () => {
    expect((await t.anon.get("/health/ready")).status).toBe(200);
  });
});

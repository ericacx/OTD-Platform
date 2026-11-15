import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type TestApp, createTestApp } from "../../testing/test-app.js";

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ demo: false });
});
afterEach(async () => {
  await t.close();
});

describe("iam", () => {
  it("lists roles with video-visible scopes", async () => {
    const admin = await t.as("admin");
    const res = await admin.get("/system/roles");
    expect(res.status).toBe(200);
    const byCode = Object.fromEntries(res.body.data.map((r: { code: string }) => [r.code, r]));
    expect(byCode.R001.dataScope).toBe("SELF");
    expect(byCode.R001.customers).toHaveLength(6);
    expect(byCode.R002.dataScope).toBe("ORG_AND_CHILDREN");
    expect(byCode.R003.dataScope).toBe("ALL");
    expect(byCode.R001.memberCount).toBe(4);
  });

  it("forbids sales reps from managing roles", async () => {
    const sales = await t.as("sales");
    const res = await sales.get("/system/roles");
    expect(res.status).toBe(403);
    expect(res.body.errcode).toBe("IAM_FORBIDDEN");
  });

  it("grants permissions with snapshot, takes effect immediately, and rolls back", async () => {
    const admin = await t.as("admin");
    const roles = (await admin.get("/system/roles")).body.data;
    const r001 = roles.find((r: { code: string }) => r.code === "R001");
    const detail = (await admin.get(`/system/roles/${r001.id}`)).body.data;
    const sales = await t.as("sales");
    expect((await sales.get("/system/audit-logs")).status).toBe(403);

    const grant = await admin.put(`/system/roles/${r001.id}/grants`, { permissions: [...detail.permissions, "iam.audit.view"], allCustomers: false, customerIds: detail.customers.map((c: { id: string }) => c.id), reason: "test", version: detail.version });
    expect(grant.status).toBe(200);
    expect(grant.body.data.permissions).toContain("iam.audit.view");
    expect((await sales.get("/system/audit-logs")).status).toBe(200);

    const stale = await admin.put(`/system/roles/${r001.id}/grants`, { permissions: detail.permissions, allCustomers: false, customerIds: [], version: detail.version });
    expect(stale.body.errcode).toBe("COMMON_VERSION_CONFLICT");

    const snaps = (await admin.get(`/system/snapshots?objectType=role&objectId=${r001.id}`)).body.data;
    expect(snaps).toHaveLength(1);
    const rb = await admin.post(`/system/snapshots/${snaps[0].id}/rollback`, { reason: "undo" });
    expect(rb.status).toBe(200);
    expect((await sales.get("/system/audit-logs")).status).toBe(403);
  });

  it("manages the org tree and users", async () => {
    const admin = await t.as("admin");
    const tree = (await admin.get("/system/orgs")).body.data;
    expect(tree).toHaveLength(14);
    const division = tree.find((o: { code: string }) => o.code === "ORG002");
    const created = await admin.post("/system/orgs", { name: "业务五部", type: "DEPARTMENT", parentId: division.id });
    expect(created.status).toBe(201);
    const roles = (await admin.get("/system/roles")).body.data;
    const user = await admin.post("/system/users", { name: "新同事", phone: "13900000001", orgId: created.body.data.id, roleIds: [roles[0].id] });
    expect(user.status).toBe(201);
    expect(user.body.data.initialPassword).toMatch(/^Otd/);
    const login = await t.anon.post("/auth/login", { phone: "13900000001", password: user.body.data.initialPassword });
    expect(login.body.data.user.mustChangePassword).toBe(true);
    const list = await admin.get(`/system/users?orgId=${division.id}&includeChildren=true`);
    expect(list.body.data.total).toBeGreaterThanOrEqual(5);
    const del = await admin.del(`/system/orgs/${created.body.data.id}`);
    expect(del.body.errcode).toBe("IAM_ORG_HAS_CHILDREN");
  });

  it("records audit logs", async () => {
    const admin = await t.as("admin");
    await admin.put("/system/params/testing.expiringDays", { value: 45, reason: "test" });
    const logs = await admin.get("/system/audit-logs?action=iam.param.update");
    expect(logs.body.data.total).toBe(1);
  });
});

describe("customer scope", () => {
  it("sales reps only see their customers; managers see all", async () => {
    const sales = await t.as("sales");
    const manager = await t.as("manager");
    const mine = await sales.get("/lookups");
    expect(mine.body.data.customers.map((c: { code: string }) => c.code).sort()).toEqual(["APX", "BBY", "CKD", "MPT", "MRN", "NSR"]);
    const all = await manager.get("/masterdata/customers?pageSize=50");
    expect(all.body.data.total).toBe(8);
    const ssh = all.body.data.items.find((c: { code: string }) => c.code === "SSH");
    const denied = await sales.get(`/masterdata/customers/${ssh.id}`);
    expect(denied.status).toBe(403);
  });
});

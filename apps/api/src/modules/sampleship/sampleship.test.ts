import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type TestApp, createTestApp } from "../../testing/test-app.js";

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ now: "2026-10-21T01:00:00Z" });
});
afterEach(async () => {
  await t.close();
});

async function styleOf(code: string, styleNo: string) {
  const { styles } = await import("@otd/db");
  const { and, eq } = await import("drizzle-orm");
  return (await t.db.select().from(styles).where(and(eq(styles.customerId, t.refs.customers[code]!), eq(styles.styleNo, styleNo))))[0]!;
}

describe("sample shipments (business module reference)", () => {
  it("creates, sends and signs with doc numbers, version checks and audit", async () => {
    const sales = await t.as("sales");
    const style = await styleOf("NSR", "12593");
    const recipient = await sales.post("/sample-shipments/recipients", { customerId: t.refs.customers.NSR, company: "NorthShore Design", name: "Milena", address: "1 Harbor Rd", isDefault: true });
    expect(recipient.status).toBe(201);
    expect(recipient.body.data.customerName).toBe("北岸运动");

    const created = await sales.post("/sample-shipments", { customerId: t.refs.customers.NSR, recipientId: recipient.body.data.id, method: "COURIER", courier: "DHL", items: [{ styleId: style.id, kind: "PROTO", quantity: 6 }] });
    expect(created.status).toBe(201);
    const s = created.body.data;
    expect(s.docNo).toMatch(/^SM-2610-\d{3}$/);
    expect(s.status).toBe("DRAFT");
    expect(s.items[0].styleNo).toBe("12593");

    const bad = await sales.post(`/sample-shipments/${s.id}/sign`, { version: s.version });
    expect(bad.body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");

    const sent = await sales.post(`/sample-shipments/${s.id}/send`, { trackingNo: "SF7710003425", version: s.version });
    expect(sent.status).toBe(200);
    expect(sent.body.data.status).toBe("SENT");
    expect(sent.body.data.sentAt).toBe("2026-10-21T01:00:00.000Z");

    const stale = await sales.post(`/sample-shipments/${s.id}/sign`, { version: s.version });
    expect(stale.body.errcode).toBe("COMMON_VERSION_CONFLICT");
    const signed = await sales.post(`/sample-shipments/${s.id}/sign`, { version: sent.body.data.version });
    expect(signed.body.data.status).toBe("SIGNED");

    const admin = await t.as("admin");
    const logs = await admin.get(`/system/audit-logs?keyword=${s.docNo}`);
    expect(logs.body.data.items.map((l: { action: string }) => l.action).sort()).toEqual(["sampleship.shipment.create", "sampleship.shipment.send", "sampleship.shipment.sign"]);
  });

  it("applies data scope: other sales reps cannot see it, the manager can", async () => {
    const sales = await t.as("sales");
    const style = await styleOf("NSR", "12593");
    const created = (await sales.post("/sample-shipments", { customerId: t.refs.customers.NSR, method: "COURIER", items: [{ styleId: style.id, kind: "PROTO", quantity: 2 }] })).body.data;
    const other = await t.as("sales3");
    expect((await other.get(`/sample-shipments/${created.id}`)).status).toBe(404);
    expect((await other.get("/sample-shipments")).body.data.total).toBe(0);
    const manager = await t.as("manager");
    expect((await manager.get(`/sample-shipments/${created.id}`)).status).toBe(200);
    const tech = await t.as("tech");
    expect((await tech.get(`/sample-shipments/${created.id}`)).status).toBe(200);
    expect((await tech.get("/sample-shipments")).body.data.total).toBeGreaterThanOrEqual(1);
  });

  it("keeps functional-department visibility within customer scope only", async () => {
    const { AccessService } = await import("../../core/access/access.service.js");
    const access = t.app.get(AccessService);
    const tech = await t.as("tech");
    const sales = await t.as("sales");
    const techCtx = (await access.load(tech.userId))!;
    const salesCtx = (await access.load(sales.userId))!;
    expect(techCtx.functional).toBe(true);
    expect(techCtx.orgFunction).toBe("TECH");
    expect(salesCtx.functional).toBe(false);
    const manager = (await access.load((await t.as("manager")).userId))!;
    expect(manager.functional).toBe(false);
  });

  it("rejects styles the user cannot see", async () => {
    const sales3 = await t.as("sales3");
    const style = await styleOf("NSR", "12593");
    const res = await sales3.post("/sample-shipments", { customerId: t.refs.customers.NSR, method: "COURIER", items: [{ styleId: style.id, kind: "PROTO", quantity: 2 }] });
    expect(res.status).toBe(404);
  });
});

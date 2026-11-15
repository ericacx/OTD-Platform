import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "./client.js";
import { uuidv7 } from "./id.js";
import { customers, rolePermissions, roles, styles, users } from "./schema/index.js";
import { seedAll } from "./seed/index.js";
import { nextSequence } from "./seed/demo/context.js";
import { createTestDatabase } from "./testing.js";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

describe("database", () => {
  it("generates time-ordered uuid v7", () => {
    const a = uuidv7(1_000);
    const b = uuidv7(2_000);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
  });

  it("seeds reference and demo data", async () => {
    const refs = await seedAll(db);
    const allUsers = await db.select().from(users);
    expect(allUsers.length).toBe(14);
    const salesRole = (await db.select().from(roles).where(eq(roles.code, "R001")))[0]!;
    expect(salesRole.dataScope).toBe("SELF");
    const perms = await db.select().from(rolePermissions).where(eq(rolePermissions.roleId, salesRole.id));
    expect(perms.map((p) => p.permission)).toContain("order.order.view");
    expect((await db.select().from(customers)).length).toBe(8);
    expect((await db.select().from(styles)).length).toBeGreaterThan(5);
    expect(refs.customers.NSR).toBeTruthy();
  });

  it("enforces unique customer PO per customer style", async () => {
    const refs = await seedAll(db, { demo: false });
    const base = { styleNo: "X1", nameZh: "测试", ownerId: refs.users["13800000001"]!, orgId: refs.orgs.ORG003!, customerId: refs.customers.NSR! };
    await db.insert(styles).values(base);
    await expect(db.insert(styles).values(base)).rejects.toThrow();
  });

  it("issues gapless sequences per prefix and period", async () => {
    expect(await nextSequence(db, "INSP", "2610")).toBe(1);
    expect(await nextSequence(db, "INSP", "2610")).toBe(2);
    expect(await nextSequence(db, "INSP", "2611")).toBe(1);
  });
});

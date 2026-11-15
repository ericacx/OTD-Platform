import { Inject, Injectable } from "@nestjs/common";
import { type Database, orgs, roleCustomers, rolePermissions, roles, userRoles, users } from "@otd/db";
import type { DataScope } from "@otd/shared";
import { and, eq, inArray, like } from "drizzle-orm";
import { DB } from "../tokens.js";
import type { AccessContext } from "./access.types.js";

const SCOPE_RANK: Record<DataScope, number> = { SELF: 0, ORG: 1, ORG_AND_CHILDREN: 2, ALL: 3 };
const TTL_MS = 60_000;

@Injectable()
export class AccessService {
  private readonly cache = new Map<string, { ctx: Omit<AccessContext, "sessionId">; expires: number }>();

  constructor(@Inject(DB) private readonly db: Database) {}

  invalidate(userId?: string): void {
    if (userId) this.cache.delete(userId);
    else this.cache.clear();
  }

  async load(userId: string): Promise<Omit<AccessContext, "sessionId"> | null> {
    const hit = this.cache.get(userId);
    if (hit && hit.expires > Date.now()) return hit.ctx;
    const user = (await this.db.select().from(users).where(eq(users.id, userId)))[0];
    if (!user || user.status !== "ACTIVE") return null;
    const roleRows = await this.db
      .select({ id: roles.id, code: roles.code, dataScope: roles.dataScope, allCustomers: roles.allCustomers })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(userRoles.userId, userId), eq(roles.status, "ACTIVE")));
    const roleIds = roleRows.map((r) => r.id);
    const perms = roleIds.length ? await this.db.select({ p: rolePermissions.permission }).from(rolePermissions).where(inArray(rolePermissions.roleId, roleIds)) : [];
    let mode: DataScope = "SELF";
    for (const r of roleRows) if (SCOPE_RANK[r.dataScope as DataScope] > SCOPE_RANK[mode]) mode = r.dataScope as DataScope;
    let orgIds: string[] = [];
    if (mode === "ORG") orgIds = [user.primaryOrgId];
    if (mode === "ORG_AND_CHILDREN") {
      const own = (await this.db.select({ path: orgs.path }).from(orgs).where(eq(orgs.id, user.primaryOrgId)))[0];
      orgIds = own ? (await this.db.select({ id: orgs.id }).from(orgs).where(like(orgs.path, `${own.path}%`))).map((o) => o.id) : [user.primaryOrgId];
    }
    const allCustomers = roleRows.some((r) => r.allCustomers);
    const customerIds = allCustomers || !roleIds.length ? [] : [...new Set((await this.db.select({ c: roleCustomers.customerId }).from(roleCustomers).where(inArray(roleCustomers.roleId, roleIds))).map((r) => r.c))];
    const ctx: Omit<AccessContext, "sessionId"> = {
      userId: user.id,
      userName: user.name,
      orgId: user.primaryOrgId,
      locale: user.locale,
      roles: roleRows.map((r) => r.code),
      permissions: new Set(perms.map((p) => p.p)),
      dataScope: { mode, orgIds },
      customerScope: allCustomers ? { mode: "ALL" } : { mode: "LIST", customerIds },
    };
    this.cache.set(userId, { ctx, expires: Date.now() + TTL_MS });
    return ctx;
  }
}

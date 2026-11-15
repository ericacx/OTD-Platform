import { Inject, Injectable } from "@nestjs/common";
import type { RoleGrantInput, RoleSummary, roleUpsertSchema } from "@otd/contracts/iam";
import { iamErrors } from "@otd/contracts/iam";
import { type Database, type DbOrTx, customers, roleCustomers, rolePermissions, roles, userRoles } from "@otd/db";
import { allPermissionCodes, menuPermissionCodes } from "@otd/shared";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import { AccessService } from "../../core/access/access.service.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { AuditService, diffOf } from "../../core/audit.service.js";
import { AppError, assertFound, badRequest, versionConflict } from "../../core/errors.js";
import { NumberingService } from "../../core/numbering.service.js";
import { DB } from "../../core/tokens.js";

const MENU_CODES = new Set(menuPermissionCodes());
const ALL_CODES = new Set(allPermissionCodes());

@Injectable()
export class RoleService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly numbering: NumberingService,
  ) {}

  async list(): Promise<RoleSummary[]> {
    const rows = await this.db.select().from(roles).orderBy(asc(roles.code));
    return Promise.all(rows.map((r) => this.summary(r.id)));
  }

  async detail(id: string, db: DbOrTx = this.db): Promise<RoleSummary & { permissions: string[] }> {
    const summary = await this.summary(id, db);
    const perms = await db.select({ p: rolePermissions.permission }).from(rolePermissions).where(eq(rolePermissions.roleId, id));
    return { ...summary, permissions: perms.map((p) => p.p).sort() };
  }

  async summary(id: string, db: DbOrTx = this.db): Promise<RoleSummary> {
    const r = assertFound((await db.select().from(roles).where(eq(roles.id, id)))[0]);
    const perms = await db.select({ p: rolePermissions.permission }).from(rolePermissions).where(eq(rolePermissions.roleId, id));
    const cust = await db.select({ id: customers.id, code: customers.code, name: customers.name }).from(roleCustomers).innerJoin(customers, eq(customers.id, roleCustomers.customerId)).where(eq(roleCustomers.roleId, id)).orderBy(asc(customers.code));
    const members = await db.select({ n: sql<number>`cast(count(*) as int)` }).from(userRoles).where(eq(userRoles.roleId, id));
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      nameEn: r.nameEn,
      type: r.type as RoleSummary["type"],
      dataScope: r.dataScope as RoleSummary["dataScope"],
      allCustomers: r.allCustomers,
      customers: cust,
      permissionCount: perms.length,
      menuPermissionCount: perms.filter((p) => MENU_CODES.has(p.p)).length,
      memberCount: members[0]?.n ?? 0,
      status: r.status,
      description: r.description,
      version: r.version,
    };
  }

  async create(ctx: AccessContext, input: z.infer<typeof roleUpsertSchema>): Promise<RoleSummary> {
    const id = await this.db.transaction(async (tx) => {
      const code = await this.numbering.next("role", tx);
      const row = (await tx.insert(roles).values({ code, name: input.name, nameEn: input.nameEn ?? null, type: input.type, dataScope: input.dataScope, description: input.description ?? null, status: input.status, createdBy: ctx.userId }).returning())[0]!;
      await this.audit.log(ctx, { action: "iam.role.create", objectType: "role", objectId: row.id, docNo: code }, tx);
      return row.id;
    });
    return this.summary(id);
  }

  async update(ctx: AccessContext, id: string, input: z.infer<typeof roleUpsertSchema>): Promise<RoleSummary> {
    await this.db.transaction(async (tx) => {
      const before = assertFound((await tx.select().from(roles).where(eq(roles.id, id)))[0]);
      if (input.version !== undefined && input.version !== before.version) throw versionConflict();
      const patch = { name: input.name, nameEn: input.nameEn ?? null, type: input.type, dataScope: input.dataScope, description: input.description ?? null, status: input.status };
      await tx.update(roles).set({ ...patch, version: before.version + 1, updatedBy: ctx.userId }).where(eq(roles.id, id));
      await this.audit.log(ctx, { action: "iam.role.update", objectType: "role", objectId: id, docNo: before.code, diff: diffOf(before, patch) }, tx);
    });
    this.access.invalidate();
    return this.summary(id);
  }

  async remove(ctx: AccessContext, id: string): Promise<void> {
    const s = await this.summary(id);
    if (s.memberCount > 0) throw new AppError(iamErrors.IAM_ROLE_IN_USE, { count: s.memberCount });
    await this.db.transaction(async (tx) => {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
      await tx.delete(roleCustomers).where(eq(roleCustomers.roleId, id));
      await tx.delete(roles).where(eq(roles.id, id));
      await this.audit.log(ctx, { action: "iam.role.delete", objectType: "role", objectId: id, docNo: s.code }, tx);
    });
  }

  async grant(ctx: AccessContext, id: string, input: RoleGrantInput): Promise<RoleSummary & { permissions: string[] }> {
    const unknown = input.permissions.filter((p) => !ALL_CODES.has(p));
    if (unknown.length) throw badRequest(`unknown permissions: ${unknown.join(", ")}`);
    await this.db.transaction(async (tx) => {
      const role = assertFound((await tx.select().from(roles).where(eq(roles.id, id)))[0]);
      if (role.version !== input.version) throw versionConflict();
      const before = await this.detail(id, tx);
      await this.audit.snapshot(ctx, "role", id, role.version, { permissions: before.permissions, allCustomers: before.allCustomers, customerIds: before.customers.map((c) => c.id) }, input.reason, tx);
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
      if (input.permissions.length) await tx.insert(rolePermissions).values([...new Set(input.permissions)].map((p) => ({ roleId: id, permission: p })));
      await tx.delete(roleCustomers).where(eq(roleCustomers.roleId, id));
      if (!input.allCustomers && input.customerIds.length) await tx.insert(roleCustomers).values([...new Set(input.customerIds)].map((c) => ({ roleId: id, customerId: c })));
      await tx.update(roles).set({ allCustomers: input.allCustomers, version: role.version + 1, updatedBy: ctx.userId }).where(eq(roles.id, id));
      const added = input.permissions.filter((p) => !before.permissions.includes(p));
      const removed = before.permissions.filter((p) => !input.permissions.includes(p));
      await this.audit.log(ctx, { action: "iam.role.grant", objectType: "role", objectId: id, docNo: role.code, diff: { added, removed, allCustomers: { from: before.allCustomers, to: input.allCustomers }, customerIds: input.customerIds } }, tx);
    });
    this.access.invalidate();
    return this.detail(id);
  }

  async applySnapshot(ctx: AccessContext, id: string, snapshot: Record<string, unknown>, reason: string): Promise<void> {
    const role = assertFound((await this.db.select().from(roles).where(eq(roles.id, id)))[0]);
    await this.grant(ctx, id, {
      permissions: (snapshot.permissions as string[]) ?? [],
      allCustomers: Boolean(snapshot.allCustomers),
      customerIds: (snapshot.customerIds as string[]) ?? [],
      reason,
      version: role.version,
    });
  }

  async membersOf(roleIds: string[]): Promise<string[]> {
    if (!roleIds.length) return [];
    return (await this.db.select({ u: userRoles.userId }).from(userRoles).where(and(inArray(userRoles.roleId, roleIds)))).map((r) => r.u);
  }
}

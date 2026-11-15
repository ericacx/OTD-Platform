import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { hash } from "@node-rs/argon2";
import type { Page } from "@otd/contracts/common";
import type { UserSummary, userListQuerySchema, userUpsertSchema } from "@otd/contracts/iam";
import { type Database, orgs, refreshTokens, roles, userRoles, users } from "@otd/db";
import { type SQL, and, asc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import type { z } from "zod";
import { AccessService } from "../../core/access/access.service.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { AuditService, diffOf } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { assertFound, duplicate, versionConflict } from "../../core/errors.js";
import { countAll, iso, likeKeyword, paginate } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";
import { OrgService } from "./org.service.js";

function tempPassword(): string {
  return `Otd${randomBytes(6).toString("base64url")}9`;
}

@Injectable()
export class UserService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly orgs: OrgService,
    private readonly clock: Clock,
  ) {}

  async list(q: z.infer<typeof userListQuerySchema>): Promise<Page<UserSummary>> {
    const conds: SQL[] = [];
    if (q.orgId) conds.push(q.includeChildren ? inArray(users.primaryOrgId, await this.orgs.descendantIds(q.orgId)) : eq(users.primaryOrgId, q.orgId));
    if (q.status) conds.push(eq(users.status, q.status));
    if (q.roleId) conds.push(inArray(users.id, this.db.select({ id: userRoles.userId }).from(userRoles).where(eq(userRoles.roleId, q.roleId))));
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(or(ilike(users.name, kw), ilike(users.phone, kw), ilike(users.employeeNo, kw))!);
    const where = conds.length ? and(...conds) : undefined;
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(users).where(where))[0]!.n,
      async (limit, offset) => {
        const rows = await this.db.select().from(users).where(where).orderBy(asc(users.phone)).limit(limit).offset(offset);
        return Promise.all(rows.map((u) => this.toSummary(u.id)));
      },
    );
  }

  async toSummary(id: string): Promise<UserSummary> {
    const u = assertFound((await this.db.select().from(users).where(eq(users.id, id)))[0]);
    const org = (await this.db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, u.primaryOrgId)))[0];
    const r = await this.db.select({ id: roles.id, code: roles.code, name: roles.name }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.userId, id));
    return { id: u.id, name: u.name, nameEn: u.nameEn, phone: u.phone, email: u.email, employeeNo: u.employeeNo, orgId: u.primaryOrgId, orgName: org?.name ?? "", roles: r, status: u.status, lastLoginAt: iso(u.lastLoginAt), version: u.version };
  }

  async create(ctx: AccessContext, input: z.infer<typeof userUpsertSchema>): Promise<UserSummary & { initialPassword: string }> {
    const exists = (await this.db.select({ id: users.id }).from(users).where(eq(users.phone, input.phone)))[0];
    if (exists) throw duplicate("phone");
    const password = tempPassword();
    const id = await this.db.transaction(async (tx) => {
      const row = (await tx.insert(users).values({ phone: input.phone, name: input.name, nameEn: input.nameEn ?? null, email: input.email ?? null, employeeNo: input.employeeNo ?? null, primaryOrgId: input.orgId, status: input.status, passwordHash: await hash(password), mustChangePassword: true, createdBy: ctx.userId }).returning())[0]!;
      await tx.insert(userRoles).values(input.roleIds.map((roleId) => ({ userId: row.id, roleId })));
      await this.audit.log(ctx, { action: "iam.user.create", objectType: "user", objectId: row.id, diff: { phone: input.phone, roleIds: input.roleIds } }, tx);
      return row.id;
    });
    return { ...(await this.toSummary(id)), initialPassword: password };
  }

  async update(ctx: AccessContext, id: string, input: z.infer<typeof userUpsertSchema>): Promise<UserSummary> {
    await this.db.transaction(async (tx) => {
      const before = assertFound((await tx.select().from(users).where(eq(users.id, id)))[0]);
      if (input.version !== undefined && input.version !== before.version) throw versionConflict();
      const patch = { name: input.name, nameEn: input.nameEn ?? null, phone: input.phone, email: input.email ?? null, employeeNo: input.employeeNo ?? null, primaryOrgId: input.orgId, status: input.status };
      await tx.update(users).set({ ...patch, version: before.version + 1, updatedBy: ctx.userId }).where(eq(users.id, id));
      await tx.delete(userRoles).where(eq(userRoles.userId, id));
      await tx.insert(userRoles).values(input.roleIds.map((roleId) => ({ userId: id, roleId })));
      if (input.status !== "ACTIVE") await tx.update(refreshTokens).set({ revokedAt: this.clock.now() }).where(and(eq(refreshTokens.userId, id), isNull(refreshTokens.revokedAt)));
      await this.audit.log(ctx, { action: "iam.user.update", objectType: "user", objectId: id, diff: { ...diffOf(before, patch), roleIds: input.roleIds } }, tx);
    });
    this.access.invalidate(id);
    return this.toSummary(id);
  }

  async resetPassword(ctx: AccessContext, id: string): Promise<{ initialPassword: string }> {
    assertFound((await this.db.select({ id: users.id }).from(users).where(eq(users.id, id)))[0]);
    const password = tempPassword();
    await this.db.update(users).set({ passwordHash: await hash(password), mustChangePassword: true, failedLogins: 0, lockedUntil: null }).where(eq(users.id, id));
    await this.db.update(refreshTokens).set({ revokedAt: this.clock.now() }).where(and(eq(refreshTokens.userId, id), isNull(refreshTokens.revokedAt)));
    await this.audit.log(ctx, { action: "iam.user.reset_password", objectType: "user", objectId: id });
    return { initialPassword: password };
  }
}

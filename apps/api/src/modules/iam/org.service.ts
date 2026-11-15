import { Inject, Injectable } from "@nestjs/common";
import { type OrgNode, iamErrors, type orgUpsertSchema } from "@otd/contracts/iam";
import { type Database, orgs, users } from "@otd/db";
import { asc, eq, like, sql } from "drizzle-orm";
import type { z } from "zod";
import { AccessService } from "../../core/access/access.service.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { AuditService, diffOf } from "../../core/audit.service.js";
import { AppError, assertFound, badRequest, versionConflict } from "../../core/errors.js";
import { NumberingService } from "../../core/numbering.service.js";
import { DB } from "../../core/tokens.js";

@Injectable()
export class OrgService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly numbering: NumberingService,
  ) {}

  async tree(): Promise<OrgNode[]> {
    const rows = await this.db.select().from(orgs).orderBy(asc(orgs.sort), asc(orgs.code));
    const counts = await this.db.select({ orgId: users.primaryOrgId, n: sql<number>`cast(count(*) as int)` }).from(users).groupBy(users.primaryOrgId);
    const countMap = new Map(counts.map((c) => [c.orgId, c.n]));
    const userRows = await this.db.select({ id: users.id, name: users.name }).from(users);
    const names = new Map(userRows.map((u) => [u.id, u.name]));
    return rows.map((o) => ({
      id: o.id,
      code: o.code,
      name: o.name,
      nameEn: o.nameEn,
      type: o.type as OrgNode["type"],
      function: o.function as OrgNode["function"],
      parentId: o.parentId,
      leaderId: o.leaderId,
      leaderName: o.leaderId ? (names.get(o.leaderId) ?? null) : null,
      status: o.status,
      memberCount: countMap.get(o.id) ?? 0,
      description: o.description,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      version: o.version,
    }));
  }

  async descendantIds(orgId: string): Promise<string[]> {
    const own = assertFound((await this.db.select({ path: orgs.path }).from(orgs).where(eq(orgs.id, orgId)))[0]);
    return (await this.db.select({ id: orgs.id }).from(orgs).where(like(orgs.path, `${own.path}%`))).map((o) => o.id);
  }

  async create(ctx: AccessContext, input: z.infer<typeof orgUpsertSchema>): Promise<OrgNode> {
    const parent = input.parentId ? assertFound((await this.db.select().from(orgs).where(eq(orgs.id, input.parentId)))[0]) : null;
    const id = await this.db.transaction(async (tx) => {
      const code = await this.numbering.next("org", tx);
      const row = (await tx.insert(orgs).values({ code, name: input.name, nameEn: input.nameEn ?? null, type: input.type, function: input.function, parentId: parent?.id ?? null, path: "/", leaderId: input.leaderId ?? null, description: input.description ?? null, status: input.status, createdBy: ctx.userId }).returning())[0]!;
      await tx.update(orgs).set({ path: `${parent?.path ?? "/"}${row.id}/` }).where(eq(orgs.id, row.id));
      await this.audit.log(ctx, { action: "iam.org.create", objectType: "org", objectId: row.id, docNo: code }, tx);
      return row.id;
    });
    return assertFound((await this.tree()).find((o) => o.id === id));
  }

  async update(ctx: AccessContext, id: string, input: z.infer<typeof orgUpsertSchema>): Promise<OrgNode> {
    await this.db.transaction(async (tx) => {
      const before = assertFound((await tx.select().from(orgs).where(eq(orgs.id, id)))[0]);
      if (input.version !== undefined && input.version !== before.version) throw versionConflict();
      let path = before.path;
      if ((input.parentId ?? null) !== before.parentId) {
        const parent = input.parentId ? assertFound((await tx.select().from(orgs).where(eq(orgs.id, input.parentId)))[0]) : null;
        if (parent && parent.path.startsWith(before.path)) throw badRequest("cannot move an org under its own subtree");
        path = `${parent?.path ?? "/"}${id}/`;
        const subtree = await tx.select().from(orgs).where(like(orgs.path, `${before.path}%`));
        for (const o of subtree) {
          if (o.id === id) continue;
          await tx.update(orgs).set({ path: path + o.path.slice(before.path.length) }).where(eq(orgs.id, o.id));
        }
      }
      const patch = { name: input.name, nameEn: input.nameEn ?? null, type: input.type, function: input.function, parentId: input.parentId ?? null, leaderId: input.leaderId ?? null, description: input.description ?? null, status: input.status };
      await tx.update(orgs).set({ ...patch, path, version: before.version + 1, updatedBy: ctx.userId }).where(eq(orgs.id, id));
      await this.audit.log(ctx, { action: "iam.org.update", objectType: "org", objectId: id, docNo: before.code, diff: diffOf(before, patch) }, tx);
    });
    this.access.invalidate();
    return assertFound((await this.tree()).find((o) => o.id === id));
  }

  async remove(ctx: AccessContext, id: string): Promise<void> {
    const node = assertFound((await this.tree()).find((o) => o.id === id));
    const children = await this.db.select({ id: orgs.id }).from(orgs).where(eq(orgs.parentId, id));
    if (children.length || node.memberCount) throw new AppError(iamErrors.IAM_ORG_HAS_CHILDREN);
    await this.db.transaction(async (tx) => {
      await tx.delete(orgs).where(eq(orgs.id, id));
      await this.audit.log(ctx, { action: "iam.org.delete", objectType: "org", objectId: id, docNo: node.code }, tx);
    });
  }
}

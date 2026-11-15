import { patrolHits } from "@otd/db";
import { type SQL, and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { AccessContext } from "../../core/access/access.types.js";
import { canSeeCustomer } from "../../core/access/access.types.js";

export function visibleHits(ctx: AccessContext): SQL {
  if (ctx.system) return sql`true`;
  const conditions: SQL[] = [];
  if (ctx.dataScope.mode === "SELF") conditions.push(or(eq(patrolHits.assigneeId, ctx.userId), eq(patrolHits.ownerId, ctx.userId))!);
  if (!ctx.functional && (ctx.dataScope.mode === "ORG" || ctx.dataScope.mode === "ORG_AND_CHILDREN")) {
    conditions.push(ctx.dataScope.orgIds.length ? or(eq(patrolHits.assigneeId, ctx.userId), inArray(patrolHits.orgId, ctx.dataScope.orgIds))! : eq(patrolHits.assigneeId, ctx.userId));
  }
  if (ctx.customerScope.mode === "LIST") {
    conditions.push(ctx.customerScope.customerIds.length ? or(isNull(patrolHits.customerId), inArray(patrolHits.customerId, ctx.customerScope.customerIds))! : isNull(patrolHits.customerId));
  }
  return conditions.length ? and(...conditions)! : sql`true`;
}

export function canSeeHit(ctx: AccessContext, row: { assigneeId: string | null; ownerId: string | null; orgId: string | null; customerId: string | null }): boolean {
  if (ctx.system) return true;
  if (!canSeeCustomer(ctx, row.customerId)) return false;
  const mine = row.assigneeId === ctx.userId;
  if (ctx.dataScope.mode === "SELF") return mine || row.ownerId === ctx.userId;
  if (ctx.functional) return true;
  if (ctx.dataScope.mode === "ORG" || ctx.dataScope.mode === "ORG_AND_CHILDREN") return mine || (!!row.orgId && ctx.dataScope.orgIds.includes(row.orgId));
  return true;
}

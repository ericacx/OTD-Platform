import { type SQL, and, eq, inArray, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { forbidden, notFound } from "../errors.js";
import { type AccessContext, canSeeCustomer, hasPermission } from "./access.types.js";

export type OwnedColumns = { ownerId: PgColumn; orgId: PgColumn; customerId: PgColumn };

export function scoped(table: OwnedColumns, ctx: AccessContext): SQL {
  if (ctx.system) return sql`true`;
  const conditions: SQL[] = [];
  if (ctx.dataScope.mode === "SELF") conditions.push(eq(table.ownerId, ctx.userId));
  if (ctx.dataScope.mode === "ORG" || ctx.dataScope.mode === "ORG_AND_CHILDREN") {
    conditions.push(ctx.dataScope.orgIds.length ? inArray(table.orgId, ctx.dataScope.orgIds) : sql`false`);
  }
  if (ctx.customerScope.mode === "LIST") {
    conditions.push(ctx.customerScope.customerIds.length ? inArray(table.customerId, ctx.customerScope.customerIds) : sql`false`);
  }
  return conditions.length ? and(...conditions)! : sql`true`;
}

export function customerScoped(column: PgColumn, ctx: AccessContext): SQL {
  if (ctx.system || ctx.customerScope.mode === "ALL") return sql`true`;
  return ctx.customerScope.customerIds.length ? inArray(column, ctx.customerScope.customerIds) : sql`false`;
}

export function canSeeRow(ctx: AccessContext, row: { ownerId: string; orgId: string; customerId: string }): boolean {
  if (ctx.system) return true;
  if (!canSeeCustomer(ctx, row.customerId)) return false;
  if (ctx.dataScope.mode === "SELF") return row.ownerId === ctx.userId;
  if (ctx.dataScope.mode === "ORG" || ctx.dataScope.mode === "ORG_AND_CHILDREN") return ctx.dataScope.orgIds.includes(row.orgId);
  return true;
}

export function assertCanSee<T extends { ownerId: string; orgId: string; customerId: string }>(ctx: AccessContext, row: T | undefined | null): T {
  if (!row || !canSeeRow(ctx, row)) throw notFound();
  return row;
}

export function requirePermission(ctx: AccessContext, code: string): void {
  if (!hasPermission(ctx, code)) throw forbidden(code);
}

export function ownership(ctx: AccessContext, customerId: string, ownerId?: string, orgId?: string) {
  return { ownerId: ownerId ?? ctx.userId, orgId: orgId ?? ctx.orgId, customerId };
}

import { createHash } from "node:crypto";
import { type SQL, and, eq, inArray, sql } from "drizzle-orm";
import type { AccessContext } from "../../core/access/access.types.js";
import { type OwnedColumns, scoped } from "../../core/access/scope.js";

export type MetricsScope = {
  ctx: AccessContext;
  orgIds: string[] | null;
  orgId: string | null;
  customerId: string | null;
  key: string;
};

export function owned(table: OwnedColumns, scope: MetricsScope): SQL {
  return and(scoped(table, scope.ctx), scope.orgIds ? (scope.orgIds.length ? inArray(table.orgId, scope.orgIds) : sql`false`) : sql`true`, scope.customerId ? eq(table.customerId, scope.customerId) : sql`true`)!;
}

export function rowInScope(scope: MetricsScope, row: { orgId: string | null; customerId: string | null }): boolean {
  if (scope.orgIds && (!row.orgId || !scope.orgIds.includes(row.orgId))) return false;
  if (scope.customerId && row.customerId !== scope.customerId) return false;
  return true;
}

export function scopeKeyOf(ctx: AccessContext, orgId: string | null, customerId: string | null): string {
  const mode = ctx.dataScope.mode;
  const personal = mode === "SELF" || ctx.functional;
  const parts = {
    mode,
    user: personal ? ctx.userId : null,
    orgs: !personal && (mode === "ORG" || mode === "ORG_AND_CHILDREN") ? [...ctx.dataScope.orgIds].sort() : null,
    customers: ctx.customerScope.mode === "LIST" ? [...ctx.customerScope.customerIds].sort() : null,
    orgId,
    customerId,
  };
  if (mode === "ALL" && !parts.customers && !orgId && !customerId && !ctx.functional) return "ALL";
  return `${mode}:${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 20)}`;
}

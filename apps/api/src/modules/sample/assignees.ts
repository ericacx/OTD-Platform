import { type DbOrTx, roles, userRoles, users } from "@otd/db";
import { and, asc, eq } from "drizzle-orm";

export async function firstUserWithRole(db: DbOrTx, roleCode: string): Promise<{ id: string; orgId: string } | null> {
  const rows = await db
    .select({ id: users.id, orgId: users.primaryOrgId })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(roles.code, roleCode), eq(users.status, "ACTIVE")))
    .orderBy(asc(users.phone))
    .limit(1);
  return rows[0] ?? null;
}

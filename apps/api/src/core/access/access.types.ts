import type { DataScope } from "@otd/shared";

export type AccessContext = {
  userId: string;
  userName: string;
  orgId: string;
  locale: string;
  roles: string[];
  permissions: ReadonlySet<string>;
  dataScope: { mode: DataScope; orgIds: string[] };
  customerScope: { mode: "ALL" } | { mode: "LIST"; customerIds: string[] };
  orgFunction: string;
  functional: boolean;
  sessionId?: string;
  system?: boolean;
};

export const NON_FUNCTIONAL_ORG = new Set(["SALES", "MANAGEMENT"]);

export function systemContext(): AccessContext {
  return {
    userId: "00000000-0000-7000-8000-000000000000",
    userName: "system",
    orgId: "00000000-0000-7000-8000-000000000000",
    locale: "zh-CN",
    roles: [],
    permissions: new Set(["*"]),
    dataScope: { mode: "ALL", orgIds: [] },
    customerScope: { mode: "ALL" },
    orgFunction: "MANAGEMENT",
    functional: false,
    system: true,
  };
}

export function hasPermission(ctx: AccessContext, code: string): boolean {
  return ctx.system === true || ctx.permissions.has(code);
}

export function canSeeCustomer(ctx: AccessContext, customerId: string | null | undefined): boolean {
  if (ctx.customerScope.mode === "ALL" || !customerId) return true;
  return ctx.customerScope.customerIds.includes(customerId);
}

import { HttpResponse, http } from "msw";

import { mockOrgs, mockRoles, mockUsers } from "../fixtures/iam";

import { envelope, fail, pageOf } from "./util";

import type { RoleDetail } from "@otd/contracts/iam";

const summary = (role: RoleDetail) => ({ ...role, permissions: undefined });

export const iamHandlers = [
  http.get("*/system/roles", () => HttpResponse.json(envelope(mockRoles.map(summary)))),
  http.get("*/system/roles/:id", ({ params }) => {
    const role = mockRoles.find((r) => r.id === params.id);
    return role ? HttpResponse.json(envelope(role)) : fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
  }),
  http.put("*/system/roles/:id/grants", async ({ params, request }) => {
    const role = mockRoles.find((r) => r.id === params.id);
    const body = (await request.json()) as {
      permissions: string[];
      allCustomers: boolean;
      customerIds: string[];
      version: number;
    };
    if (!role) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    if (body.version !== role.version) return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    return HttpResponse.json(
      envelope({
        ...role,
        permissions: body.permissions,
        permissionCount: body.permissions.length,
        allCustomers: body.allCustomers,
        version: role.version + 1,
      }),
    );
  }),
  http.post("*/system/roles", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      envelope({ ...summary(mockRoles[0]!), ...body, id: "r-new", code: "R091", memberCount: 0 }),
      { status: 201 },
    );
  }),
  http.put("*/system/roles/:id", async ({ params, request }) => {
    const role = mockRoles.find((r) => r.id === params.id);
    const body = (await request.json()) as Record<string, unknown>;
    return role
      ? HttpResponse.json(envelope({ ...summary(role), ...body, version: role.version + 1 }))
      : fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
  }),
  http.delete("*/system/roles/:id", ({ params }) => {
    const role = mockRoles.find((r) => r.id === params.id);
    if (role && role.memberCount > 0)
      return fail("IAM_ROLE_IN_USE", `角色仍有 ${role.memberCount} 个成员，不能删除`, 409);
    return HttpResponse.json(envelope(null));
  }),
  http.get("*/system/orgs", () => HttpResponse.json(envelope(mockOrgs))),
  http.post("*/system/orgs", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(envelope({ ...mockOrgs[2]!, ...body, id: "o-new", code: "ORG015", memberCount: 0 }), {
      status: 201,
    });
  }),
  http.put("*/system/orgs/:id", async ({ params, request }) => {
    const org = mockOrgs.find((o) => o.id === params.id);
    const body = (await request.json()) as Record<string, unknown>;
    return org
      ? HttpResponse.json(envelope({ ...org, ...body }))
      : fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
  }),
  http.delete("*/system/orgs/:id", () => fail("IAM_ORG_HAS_CHILDREN", "组织下还有下级组织或成员，不能删除", 409)),
  http.get("*/system/users", ({ request }) => {
    const url = new URL(request.url);
    const orgId = url.searchParams.get("orgId");
    const list = orgId
      ? mockUsers.filter((u) => u.orgId === orgId || url.searchParams.get("includeChildren") === "true")
      : mockUsers;
    return HttpResponse.json(envelope(pageOf(list, url)));
  }),
  http.post("*/system/users", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(envelope({ ...mockUsers[1]!, ...body, id: "u-new", initialPassword: "OtdMock12345" }), {
      status: 201,
    });
  }),
  http.put("*/system/users/:id", async ({ params, request }) => {
    const user = mockUsers.find((u) => u.id === params.id);
    const body = (await request.json()) as Record<string, unknown>;
    return user
      ? HttpResponse.json(envelope({ ...user, ...body }))
      : fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
  }),
  http.post("*/system/users/:id/reset-password", () =>
    HttpResponse.json(envelope({ initialPassword: "OtdReset9999" })),
  ),
  http.get("*/system/audit-logs", ({ request }) =>
    HttpResponse.json(
      envelope(
        pageOf(
          [
            {
              id: "l-1",
              at: "2026-10-21T08:00:00.000Z",
              userName: "管理员",
              action: "iam.role.grant",
              objectType: "role",
              objectId: "r-1",
              docNo: "R001",
              ip: "127.0.0.1",
              diff: { added: ["iam.audit.view"], removed: [] },
            },
          ],
          new URL(request.url),
        ),
      ),
    ),
  ),
  http.get("*/system/params", () =>
    HttpResponse.json(
      envelope([
        {
          key: "testing.expiringDays",
          value: 30,
          description: "报告即将过期提前天数",
          updatedAt: "2026-10-21T08:00:00.000Z",
        },
      ]),
    ),
  ),
  http.put("*/system/params/:key", async ({ params, request }) => {
    const body = (await request.json()) as { value: unknown };
    return HttpResponse.json(
      envelope({ key: params.key, value: body.value, description: null, updatedAt: new Date().toISOString() }),
    );
  }),
];

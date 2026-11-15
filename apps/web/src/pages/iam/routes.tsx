import { lazyRouteComponent } from "@/app/router/lazy";
import { leafHandle, leafPath } from "@/components/common/placeholder-page";

import type { RouteObject } from "react-router";

export const routes: RouteObject[] = [
  {
    path: leafPath("iam.user.view"),
    handle: leafHandle("iam.user.view"),
    lazy: lazyRouteComponent(() => import("./users.page"), "UsersPage"),
  },
  {
    path: leafPath("iam.role.view"),
    handle: leafHandle("iam.role.view"),
    lazy: lazyRouteComponent(() => import("./roles.page"), "RolesPage"),
  },
  {
    path: leafPath("iam.org.view"),
    handle: leafHandle("iam.org.view"),
    lazy: lazyRouteComponent(() => import("./orgs.page"), "OrgsPage"),
  },
  {
    path: leafPath("iam.audit.view"),
    handle: leafHandle("iam.audit.view"),
    lazy: lazyRouteComponent(() => import("./audit-logs.page"), "AuditLogsPage"),
  },
  {
    path: leafPath("iam.param.view"),
    handle: leafHandle("iam.param.view"),
    lazy: lazyRouteComponent(() => import("./params.page"), "ParamsPage"),
  },
];

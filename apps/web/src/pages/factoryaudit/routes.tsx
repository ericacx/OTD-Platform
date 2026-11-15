import { lazyRouteComponent } from "@/app/router/lazy";
import { leafHandle, leafPath } from "@/components/common/placeholder-page";

import type { RouteObject } from "react-router";

export const routes: RouteObject[] = [
  {
    path: leafPath("factoryaudit.plan.view"),
    handle: leafHandle("factoryaudit.plan.view"),
    lazy: lazyRouteComponent(() => import("./plans.page"), "AuditPlansPage"),
  },
  {
    path: leafPath("factoryaudit.record.view"),
    handle: leafHandle("factoryaudit.record.view"),
    lazy: lazyRouteComponent(() => import("./records.page"), "AuditRecordsPage"),
  },
  {
    path: leafPath("factoryaudit.finding.view"),
    handle: leafHandle("factoryaudit.finding.view"),
    lazy: lazyRouteComponent(() => import("./findings.page"), "FindingsPage"),
  },
];

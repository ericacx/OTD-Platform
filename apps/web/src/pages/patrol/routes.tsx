import { lazyRouteComponent } from "@/app/router/lazy";
import { leafHandle, leafPath } from "@/components/common/placeholder-page";

import type { RouteObject } from "react-router";

export const routes: RouteObject[] = [
  {
    path: leafPath("patrol.dashboard.view"),
    handle: leafHandle("patrol.dashboard.view"),
    lazy: lazyRouteComponent(() => import("./patrol-dashboard.page"), "PatrolDashboardPage"),
  },
  {
    path: leafPath("patrol.rule.view"),
    handle: leafHandle("patrol.rule.view"),
    lazy: lazyRouteComponent(() => import("./patrol-rules.page"), "PatrolRulesPage"),
  },
  {
    path: leafPath("patrol.run.view"),
    handle: leafHandle("patrol.run.view"),
    lazy: lazyRouteComponent(() => import("./patrol-runs.page"), "PatrolRunsPage"),
  },
];

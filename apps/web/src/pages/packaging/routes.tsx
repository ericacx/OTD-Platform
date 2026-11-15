import { lazyRouteComponent } from "@/app/router/lazy";
import { leafHandle, leafPath } from "@/components/common/placeholder-page";

import type { RouteObject } from "react-router";

export const routes: RouteObject[] = [
  {
    path: leafPath("packaging.plan.view"),
    handle: leafHandle("packaging.plan.view"),
    lazy: lazyRouteComponent(() => import("./plans.page"), "PackagingPlansPage"),
  },
  {
    path: leafPath("packaging.carton.view"),
    handle: leafHandle("packaging.carton.view"),
    lazy: lazyRouteComponent(() => import("./cartons.page"), "CartonsPage"),
  },
  {
    path: `${leafPath("packaging.plan.view")}/:id`,
    handle: leafHandle("packaging.plan.view"),
    lazy: lazyRouteComponent(() => import("./plan-detail.page"), "PackagingPlanDetailPage"),
  },
];

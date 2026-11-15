import { lazyRouteComponent } from "@/app/router/lazy";
import { leafHandle, leafPath } from "@/components/common/placeholder-page";

import type { RouteObject } from "react-router";

const listHandle = leafHandle("planning.planning.view");

export const routes: RouteObject[] = [
  {
    path: leafPath("planning.planning.view"),
    handle: listHandle,
    lazy: lazyRouteComponent(() => import("./planning-list.page"), "PlanningListPage"),
  },
  {
    path: leafPath("planning.archive.view"),
    handle: leafHandle("planning.archive.view"),
    lazy: lazyRouteComponent(() => import("./planning-list.page"), "PlanningArchivedPage"),
  },
  {
    path: `${leafPath("planning.planning.view")}/:id`,
    handle: { permissions: ["planning.planning.view", "planning.archive.view"], breadcrumb: listHandle.breadcrumb },
    lazy: lazyRouteComponent(() => import("./planning-detail.page"), "PlanningDetailPage"),
  },
];

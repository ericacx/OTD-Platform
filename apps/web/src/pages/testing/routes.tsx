import { lazyRouteComponent } from "@/app/router/lazy";
import { leafHandle, leafPath } from "@/components/common/placeholder-page";

import type { RouteObject } from "react-router";

const listHandle = leafHandle("testing.request.view");

export const routes: RouteObject[] = [
  {
    path: leafPath("testing.request.view"),
    handle: listHandle,
    lazy: lazyRouteComponent(() => import("./tests.page"), "TestsPage"),
  },
  {
    path: leafPath("testing.report.view"),
    handle: leafHandle("testing.report.view"),
    lazy: lazyRouteComponent(() => import("./reports.page"), "ReportsPage"),
  },
  {
    path: `${leafPath("testing.request.view")}/:id`,
    handle: listHandle,
    lazy: lazyRouteComponent(() => import("./test-detail.page"), "TestDetailPage"),
  },
];

import { lazyRouteComponent } from "@/app/router/lazy";
import { leafHandle, leafPath } from "@/components/common/placeholder-page";

import type { RouteObject } from "react-router";

export const routes: RouteObject[] = [
  {
    path: leafPath("metrics.sales.view"),
    handle: leafHandle("metrics.sales.view"),
    lazy: lazyRouteComponent(() => import("./board.page"), "SalesBoardPage"),
  },
  {
    path: leafPath("metrics.manager.view"),
    handle: leafHandle("metrics.manager.view"),
    lazy: lazyRouteComponent(() => import("./board.page"), "ManagerBoardPage"),
  },
  {
    path: leafPath("metrics.gm.view"),
    handle: leafHandle("metrics.gm.view"),
    lazy: lazyRouteComponent(() => import("./board.page"), "GmBoardPage"),
  },
  {
    path: leafPath("metrics.definition.view"),
    handle: leafHandle("metrics.definition.view"),
    lazy: lazyRouteComponent(() => import("./definitions.page"), "MetricDefinitionsPage"),
  },
];

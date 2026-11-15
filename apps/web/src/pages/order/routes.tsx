import { lazyRouteComponent } from "@/app/router/lazy";
import { leafHandle, leafPath } from "@/components/common/placeholder-page";

import type { RouteObject } from "react-router";

export const routes: RouteObject[] = [
  {
    path: leafPath("order.order.view"),
    handle: leafHandle("order.order.view"),
    lazy: lazyRouteComponent(() => import("./order-list.page"), "OrderListPage"),
  },
  {
    path: leafPath("order.monitor.view"),
    handle: leafHandle("order.monitor.view"),
    lazy: lazyRouteComponent(() => import("./order-monitor.page"), "OrderMonitorPage"),
  },
  {
    path: `${leafPath("order.order.view")}/:id`,
    handle: leafHandle("order.order.view"),
    lazy: lazyRouteComponent(() => import("./order-detail.page"), "OrderDetailPage"),
  },
];

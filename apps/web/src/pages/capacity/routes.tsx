import { lazyRouteComponent } from "@/app/router/lazy";
import { leafHandle, leafPath } from "@/components/common/placeholder-page";

import type { RouteObject } from "react-router";

export const routes: RouteObject[] = [
  {
    path: leafPath("capacity.ledger.view"),
    handle: leafHandle("capacity.ledger.view"),
    lazy: lazyRouteComponent(() => import("./capacity.page"), "CapacityLedgerPage"),
  },
  {
    path: leafPath("capacity.task.view"),
    handle: leafHandle("capacity.task.view"),
    lazy: lazyRouteComponent(() => import("./tasks.page"), "LedgerTasksPage"),
  },
];

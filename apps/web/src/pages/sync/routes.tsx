import { lazyRouteComponent } from "@/app/router/lazy";
import { leafHandle, leafPath } from "@/components/common/placeholder-page";

import type { RouteObject } from "react-router";

export const routes: RouteObject[] = [
  {
    path: leafPath("sync.endpoint.view"),
    handle: leafHandle("sync.endpoint.view"),
    lazy: lazyRouteComponent(() => import("./endpoints.page"), "EndpointsPage"),
  },
  {
    path: leafPath("sync.mapping.view"),
    handle: leafHandle("sync.mapping.view"),
    lazy: lazyRouteComponent(() => import("./mappings.page"), "MappingsPage"),
  },
  {
    path: leafPath("sync.task.view"),
    handle: leafHandle("sync.task.view"),
    lazy: lazyRouteComponent(() => import("./tasks.page"), "TasksPage"),
  },
  {
    path: `${leafPath("sync.task.view")}/:id`,
    handle: leafHandle("sync.task.view"),
    lazy: lazyRouteComponent(() => import("./task-detail.page"), "TaskDetailPage"),
  },
  {
    path: leafPath("sync.retry.view"),
    handle: leafHandle("sync.retry.view"),
    lazy: lazyRouteComponent(() => import("./retry-queue.page"), "RetryQueuePage"),
  },
];

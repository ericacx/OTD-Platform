import { lazyRouteComponent } from "@/app/router/lazy";
import { leafHandle, leafPath } from "@/components/common/placeholder-page";

import type { RouteObject } from "react-router";

export const routes: RouteObject[] = [
  {
    path: leafPath("todo.todo.view"),
    handle: leafHandle("todo.todo.view"),
    lazy: lazyRouteComponent(() => import("./todo.page"), "TodoPage"),
  },
];

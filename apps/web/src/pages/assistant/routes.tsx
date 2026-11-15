import { lazyRouteComponent } from "@/app/router/lazy";
import { leafHandle, leafPath } from "@/components/common/placeholder-page";

import type { RouteObject } from "react-router";

export const routes: RouteObject[] = [
  {
    path: leafPath("assistant.chat.use"),
    handle: leafHandle("assistant.chat.use"),
    lazy: lazyRouteComponent(() => import("./assistant.page"), "AssistantPage"),
  },
];

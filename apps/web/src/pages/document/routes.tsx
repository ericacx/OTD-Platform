import { lazyRouteComponent } from "@/app/router/lazy";
import { leafHandle, leafPath } from "@/components/common/placeholder-page";

import type { RouteObject } from "react-router";

export const routes: RouteObject[] = [
  {
    path: leafPath("document.handover.view"),
    handle: leafHandle("document.handover.view"),
    lazy: lazyRouteComponent(() => import("./handovers.page"), "HandoversPage"),
  },
  {
    path: `${leafPath("document.handover.view")}/:id`,
    handle: leafHandle("document.handover.view"),
    lazy: lazyRouteComponent(() => import("./handover-detail.page"), "HandoverDetailPage"),
  },
  {
    path: leafPath("document.manual.view"),
    handle: leafHandle("document.manual.view"),
    lazy: lazyRouteComponent(() => import("./kb.page"), "ManualsPage"),
  },
  {
    path: leafPath("document.kb.view"),
    handle: leafHandle("document.kb.view"),
    lazy: lazyRouteComponent(() => import("./kb.page"), "KnowledgeBasePage"),
  },
];

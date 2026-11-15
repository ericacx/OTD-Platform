import { lazyRouteComponent } from "@/app/router/lazy";
import { leafHandle, leafPath } from "@/components/common/placeholder-page";

import type { RouteObject } from "react-router";

export const routes: RouteObject[] = [
  {
    path: leafPath("inspection.inspection.view"),
    handle: leafHandle("inspection.inspection.view"),
    lazy: lazyRouteComponent(() => import("./inspections.page"), "InspectionsPage"),
  },
  {
    path: leafPath("inspection.schedule.view"),
    handle: leafHandle("inspection.schedule.view"),
    lazy: lazyRouteComponent(() => import("./inspection-schedule.page"), "InspectionSchedulePage"),
  },
  {
    path: `${leafPath("inspection.inspection.view")}/:id`,
    handle: leafHandle("inspection.inspection.view"),
    lazy: lazyRouteComponent(() => import("./inspection-detail.page"), "InspectionDetailPage"),
  },
];

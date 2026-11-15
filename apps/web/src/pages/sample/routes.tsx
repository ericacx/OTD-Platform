import { lazyRouteComponent } from "@/app/router/lazy";
import { leafHandle, leafPath } from "@/components/common/placeholder-page";

import type { RouteObject } from "react-router";

const listHandle = leafHandle("sample.sample.view");

export const routes: RouteObject[] = [
  {
    path: leafPath("sample.library.view"),
    handle: leafHandle("sample.library.view"),
    lazy: lazyRouteComponent(() => import("./library.page"), "LibraryPage"),
  },
  {
    path: leafPath("sample.sample.view"),
    handle: listHandle,
    lazy: lazyRouteComponent(() => import("./samples.page"), "SamplesPage"),
  },
  {
    path: leafPath("sample.material.view"),
    handle: leafHandle("sample.material.view"),
    lazy: lazyRouteComponent(() => import("./materials.page"), "MaterialsPage"),
  },
  {
    path: `${leafPath("sample.sample.view")}/:id`,
    handle: listHandle,
    lazy: lazyRouteComponent(() => import("./sample-detail.page"), "SampleDetailPage"),
  },
];

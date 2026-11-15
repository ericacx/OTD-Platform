import { lazyRouteComponent } from "@/app/router/lazy";
import { leafHandle, leafPath, placeholderRoutes } from "@/components/common/placeholder-page";

import type { RouteObject } from "react-router";

export const routes: RouteObject[] = [
  {
    path: leafPath("masterdata.customer.view"),
    handle: leafHandle("masterdata.customer.view"),
    lazy: lazyRouteComponent(() => import("./customers.page"), "CustomersPage"),
  },
  ...placeholderRoutes("masterdata", ["masterdata.customer.view"]),
];

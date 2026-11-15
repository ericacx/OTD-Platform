import { lazyRouteComponent } from "@/app/router/lazy";
import { leafHandle, leafPath } from "@/components/common/placeholder-page";

import type { RouteObject } from "react-router";

export const routes: RouteObject[] = [
  {
    path: leafPath("purchase.order.view"),
    handle: leafHandle("purchase.order.view"),
    lazy: lazyRouteComponent(() => import("./purchases.page"), "PurchasesPage"),
  },
  {
    path: leafPath("purchase.receipt.view"),
    handle: leafHandle("purchase.receipt.view"),
    lazy: lazyRouteComponent(() => import("./receipts.page"), "PurchaseReceiptsPage"),
  },
  {
    path: `${leafPath("purchase.order.view")}/:id`,
    handle: leafHandle("purchase.order.view"),
    lazy: lazyRouteComponent(() => import("./purchase-detail.page"), "PurchaseDetailPage"),
  },
];

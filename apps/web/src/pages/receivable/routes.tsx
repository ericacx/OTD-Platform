import { lazyRouteComponent } from "@/app/router/lazy";
import { leafHandle, leafPath } from "@/components/common/placeholder-page";

import type { RouteObject } from "react-router";

export const routes: RouteObject[] = [
  {
    path: leafPath("receivable.receivable.view"),
    handle: leafHandle("receivable.receivable.view"),
    lazy: lazyRouteComponent(() => import("./receivables.page"), "ReceivablesPage"),
  },
  {
    path: leafPath("receivable.collection.view"),
    handle: leafHandle("receivable.collection.view"),
    lazy: lazyRouteComponent(() => import("./collection.page"), "CollectionPage"),
  },
  {
    path: leafPath("receivable.invoice.view"),
    handle: leafHandle("receivable.invoice.view"),
    lazy: lazyRouteComponent(() => import("./invoices.page"), "InvoicesPage"),
  },
  {
    path: `${leafPath("receivable.receivable.view")}/:id`,
    handle: {
      ...leafHandle("receivable.receivable.view"),
      permissions: ["receivable.receivable.view", "receivable.collection.view"],
    },
    lazy: lazyRouteComponent(() => import("./receivable-detail.page"), "ReceivableDetailPage"),
  },
];

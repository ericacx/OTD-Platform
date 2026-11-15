import { lazyRouteComponent } from "@/app/router/lazy";
import { leafHandle, leafPath } from "@/components/common/placeholder-page";

import type { RouteObject } from "react-router";

export const routes: RouteObject[] = [
  {
    path: leafPath("sampleship.shipment.view"),
    handle: leafHandle("sampleship.shipment.view"),
    lazy: lazyRouteComponent(() => import("./shipments.page"), "ShipmentsPage"),
  },
  {
    path: leafPath("sampleship.recipient.view"),
    handle: leafHandle("sampleship.recipient.view"),
    lazy: lazyRouteComponent(() => import("./recipients.page"), "RecipientsPage"),
  },
  {
    path: `${leafPath("sampleship.shipment.view")}/:id`,
    handle: leafHandle("sampleship.shipment.view"),
    lazy: lazyRouteComponent(() => import("./shipment-detail.page"), "ShipmentDetailPage"),
  },
];

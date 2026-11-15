import { lazyRouteComponent } from "@/app/router/lazy";
import { leafHandle, leafPath } from "@/components/common/placeholder-page";

import type { RouteObject } from "react-router";

export const routes: RouteObject[] = [
  {
    path: leafPath("shipment.shipment.view"),
    handle: leafHandle("shipment.shipment.view"),
    lazy: lazyRouteComponent(() => import("./shipments.page"), "ShipmentsPage"),
  },
  {
    path: leafPath("shipment.booking.view"),
    handle: leafHandle("shipment.booking.view"),
    lazy: lazyRouteComponent(() => import("./bookings.page"), "BookingsPage"),
  },
  {
    path: `${leafPath("shipment.shipment.view")}/:id`,
    handle: leafHandle("shipment.shipment.view"),
    lazy: lazyRouteComponent(() => import("./shipment-detail.page"), "ShipmentDetailPage"),
  },
];

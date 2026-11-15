import { lazyRouteComponent } from "@/app/router/lazy";
import { leafHandle, leafPath } from "@/components/common/placeholder-page";

import type { RouteObject } from "react-router";

const customersHandle = leafHandle("flow.customer.view");

export const routes: RouteObject[] = [
  {
    path: leafPath("flow.module.view"),
    handle: leafHandle("flow.module.view"),
    lazy: lazyRouteComponent(() => import("./modules.page"), "ServiceModulesPage"),
  },
  {
    path: leafPath("flow.customer.view"),
    handle: customersHandle,
    lazy: lazyRouteComponent(() => import("./customers.page"), "FlowCustomersPage"),
  },
  {
    path: `${leafPath("flow.customer.view")}/:customerId`,
    handle: customersHandle,
    lazy: lazyRouteComponent(() => import("./customer-flow.page"), "CustomerFlowPage"),
  },
  {
    path: leafPath("flow.rulepack.view"),
    handle: leafHandle("flow.rulepack.view"),
    lazy: lazyRouteComponent(() => import("./rule-packs.page"), "RulePacksPage"),
  },
];

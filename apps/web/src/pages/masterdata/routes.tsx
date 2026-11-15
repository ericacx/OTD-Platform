import { lazyRouteComponent } from "@/app/router/lazy";
import { leafHandle, leafPath } from "@/components/common/placeholder-page";

import type { RouteObject } from "react-router";

export const routes: RouteObject[] = [
  {
    path: leafPath("masterdata.customer.view"),
    handle: leafHandle("masterdata.customer.view"),
    lazy: lazyRouteComponent(() => import("./customers.page"), "CustomersPage"),
  },
  {
    path: leafPath("masterdata.factory.view"),
    handle: leafHandle("masterdata.factory.view"),
    lazy: lazyRouteComponent(() => import("./factories.page"), "FactoriesPage"),
  },
  {
    path: leafPath("masterdata.needle.view"),
    handle: leafHandle("masterdata.needle.view"),
    lazy: lazyRouteComponent(() => import("./needle-types.page"), "NeedleTypesPage"),
  },
  {
    path: leafPath("masterdata.material.view"),
    handle: leafHandle("masterdata.material.view"),
    lazy: lazyRouteComponent(() => import("./materials.page"), "MaterialsPage"),
  },
  {
    path: leafPath("masterdata.agency.view"),
    handle: leafHandle("masterdata.agency.view"),
    lazy: lazyRouteComponent(() => import("./test-agencies.page"), "TestAgenciesPage"),
  },
  {
    path: leafPath("masterdata.forwarder.view"),
    handle: leafHandle("masterdata.forwarder.view"),
    lazy: lazyRouteComponent(() => import("./forwarders.page"), "ForwardersPage"),
  },
  {
    path: leafPath("masterdata.dictionary.view"),
    handle: leafHandle("masterdata.dictionary.view"),
    lazy: lazyRouteComponent(() => import("./dictionaries.page"), "DictionariesPage"),
  },
];

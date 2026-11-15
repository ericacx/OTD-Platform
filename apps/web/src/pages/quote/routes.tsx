import { lazyRouteComponent } from "@/app/router/lazy";
import { leafHandle, leafPath } from "@/components/common/placeholder-page";

import type { RouteObject } from "react-router";

export const routes: RouteObject[] = [
  {
    path: leafPath("quote.quote.view"),
    handle: leafHandle("quote.quote.view"),
    lazy: lazyRouteComponent(() => import("./quotes.page"), "QuotesPage"),
  },
  {
    path: leafPath("quote.strategy.view"),
    handle: leafHandle("quote.strategy.view"),
    lazy: lazyRouteComponent(() => import("./strategies.page"), "StrategiesPage"),
  },
  {
    path: `${leafPath("quote.quote.view")}/:id`,
    handle: leafHandle("quote.quote.view"),
    lazy: lazyRouteComponent(() => import("./quote-detail.page"), "QuoteDetailPage"),
  },
];

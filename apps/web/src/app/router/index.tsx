import { createBrowserRouter, createMemoryRouter, Navigate } from "react-router";

import { RouteErrorBoundary } from "@/app/error-boundary";
import { useAuth } from "@/app/providers/auth-provider";
import { LoadingState } from "@/components/common/loading-state";
import { routes as assistantRoutes } from "@/pages/assistant/routes";
import { routes as capacityRoutes } from "@/pages/capacity/routes";
import { routes as documentRoutes } from "@/pages/document/routes";
import { routes as factoryauditRoutes } from "@/pages/factoryaudit/routes";
import { routes as flowRoutes } from "@/pages/flow/routes";
import { routes as iamRoutes } from "@/pages/iam/routes";
import { routes as inspectionRoutes } from "@/pages/inspection/routes";
import { loginRoute } from "@/pages/login/login.route";
import { routes as masterdataRoutes } from "@/pages/masterdata/routes";
import { routes as metricsRoutes } from "@/pages/metrics/routes";
import { routes as orderRoutes } from "@/pages/order/routes";
import { routes as packagingRoutes } from "@/pages/packaging/routes";
import { routes as patrolRoutes } from "@/pages/patrol/routes";
import { routes as planningRoutes } from "@/pages/planning/routes";
import { routes as purchaseRoutes } from "@/pages/purchase/routes";
import { routes as quoteRoutes } from "@/pages/quote/routes";
import { routes as receivableRoutes } from "@/pages/receivable/routes";
import { routes as sampleRoutes } from "@/pages/sample/routes";
import { routes as sampleshipRoutes } from "@/pages/sampleship/routes";
import { routes as shipmentRoutes } from "@/pages/shipment/routes";
import { routes as syncRoutes } from "@/pages/sync/routes";
import { routes as testingRoutes } from "@/pages/testing/routes";
import { routes as todoRoutes } from "@/pages/todo/routes";

import { AppShellRoute } from "./app-shell-route";
import { AuthGuard, PermissionGuard } from "./guards";
import { lazyRouteComponent } from "./lazy";
import { firstAllowedPath } from "./nav-items";

import type { InitialEntry, RouteObject } from "react-router";

type CreateAppRouterOptions = {
  initialEntries?: InitialEntry[];
};

const pageFallback = <LoadingState />;

function IndexRedirect() {
  const { user } = useAuth();
  if (!user) return <LoadingState />;
  return <Navigate replace to={firstAllowedPath(user.permissions)} />;
}

export const moduleRoutes: RouteObject[] = [
  ...todoRoutes,
  ...assistantRoutes,
  ...planningRoutes,
  ...sampleRoutes,
  ...quoteRoutes,
  ...sampleshipRoutes,
  ...testingRoutes,
  ...packagingRoutes,
  ...capacityRoutes,
  ...orderRoutes,
  ...inspectionRoutes,
  ...shipmentRoutes,
  ...receivableRoutes,
  ...purchaseRoutes,
  ...factoryauditRoutes,
  ...documentRoutes,
  ...patrolRoutes,
  ...metricsRoutes,
  ...syncRoutes,
  ...flowRoutes,
  ...masterdataRoutes,
  ...iamRoutes,
];

export const routes = [
  loginRoute,
  {
    element: <AuthGuard />,
    errorElement: <RouteErrorBoundary />,
    path: "/",
    children: [
      {
        element: <AppShellRoute />,
        children: [
          { element: <IndexRedirect />, index: true },
          {
            hydrateFallbackElement: pageFallback,
            lazy: lazyRouteComponent(() => import("@/pages/403"), "ForbiddenPage"),
            path: "403",
          },
          {
            hydrateFallbackElement: pageFallback,
            lazy: lazyRouteComponent(() => import("@/pages/500"), "ServerErrorPage"),
            path: "500",
          },
          { element: <PermissionGuard />, children: moduleRoutes },
        ],
      },
    ],
  },
  {
    hydrateFallbackElement: pageFallback,
    lazy: lazyRouteComponent(() => import("@/pages/404"), "NotFoundPage"),
    path: "*",
  },
] satisfies RouteObject[];

export function createAppRouter(options: CreateAppRouterOptions = {}) {
  if (options.initialEntries) {
    return createMemoryRouter(routes, { initialEntries: options.initialEntries });
  }

  return createBrowserRouter(routes);
}

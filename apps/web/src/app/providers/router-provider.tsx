import { useMemo } from "react";
import { RouterProvider as ReactRouterProvider } from "react-router";

import { createAppRouter } from "@/app/router";

export function RouterProvider() {
  // React Router expects the router instance to be stable across renders
  // but recreated when the provider itself remounts (dev HMR, tests).
  const router = useMemo(() => createAppRouter(), []);

  return <ReactRouterProvider router={router} />;
}

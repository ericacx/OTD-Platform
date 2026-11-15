import { createElement } from "react";

import { lazyRouteComponent } from "@/app/router/lazy";

import type { RouteObject } from "react-router";

const loginFallback = createElement("div", { className: "p-6 text-sm text-muted-foreground" }, "Loading...");

export const loginRoute = {
  hydrateFallbackElement: loginFallback,
  lazy: lazyRouteComponent(() => import("./login.page"), "LoginPage"),
  path: "/login",
} satisfies RouteObject;

import { Navigate, Outlet, useLocation, useMatches } from "react-router";

import { useAuth } from "@/app/providers/auth-provider";
import { LoadingState } from "@/components/common/loading-state";
import { ForbiddenPage } from "@/pages/403";

import type { ReactNode } from "react";

export function AuthGuard() {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingState className="m-6" />;
  }

  if (!isAuthenticated) {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  return <Outlet />;
}

type RouteHandleWithPermissions = {
  permissions?: string[];
  roles?: string[];
};

export function PermissionGuard() {
  const matches = useMatches();
  const { hasPermission, hasRole, user } = useAuth();

  if (!user) {
    return <LoadingState />;
  }

  for (const match of matches) {
    const handle = match.handle as RouteHandleWithPermissions | undefined;
    const permissions = handle?.permissions ?? [];
    const roles = handle?.roles ?? [];

    const permissionPasses = permissions.length === 0 || permissions.some((code) => hasPermission(code));
    const rolePasses = roles.length === 0 || roles.every((role) => hasRole(role));

    if (!permissionPasses || !rolePasses) {
      return <ForbiddenPage />;
    }
  }

  return <Outlet />;
}

interface RequirePermissionProps {
  code: string | string[];
  children: ReactNode;
  fallback?: ReactNode;
}

export function RequirePermission({ code, children, fallback = null }: RequirePermissionProps) {
  const { hasPermission } = useAuth();
  const codes = Array.isArray(code) ? code : [code];

  if (!codes.some((c) => hasPermission(c))) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

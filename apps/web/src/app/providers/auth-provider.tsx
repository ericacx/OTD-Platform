import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

import { useLogoutMutation } from "@/features/auth/auth.mutations";
import { useSessionQuery } from "@/features/auth/auth.queries";
import { getAccessToken, subscribeTokenChange } from "@/lib/auth/token-storage";
import { AuthError } from "@/lib/http/errors";

import type { SessionUser } from "@/features/auth/auth.types";
import type { HttpError } from "@/lib/http/errors";
import type { PropsWithChildren } from "react";

interface AuthContextValue {
  user: SessionUser | undefined;
  /** True as soon as an access token is available. Session profile may still be loading. */
  isAuthenticated: boolean;
  /** True on first mount while the initial session fetch is in flight. Never re-enters after profile is known. */
  isLoading: boolean;
  /** Present when the session query has failed *and* the failure is fatal for auth (401). */
  authError: AuthError | undefined;
  /** Transient session profile fetch error (network / 5xx). Does NOT log the user out. */
  sessionError: HttpError | undefined;
  hasPermission(code: string): boolean;
  hasRole(role: string): boolean;
  logout(): Promise<void>;
  refetchSession(): Promise<unknown>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getSnapshot() {
  return getAccessToken();
}

function getServerSnapshot() {
  return null;
}

function useAccessToken() {
  return useSyncExternalStore(subscribeTokenChange, getSnapshot, getServerSnapshot);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const accessToken = useAccessToken();
  const hasToken = Boolean(accessToken);
  const sessionQuery = useSessionQuery({ enabled: hasToken });
  const logoutMutation = useLogoutMutation();

  // Token existence is the source of truth for "authenticated". A transient
  // session fetch failure (5xx, network blip) MUST NOT force the user back to
  // the login page — the refresh interceptor already handles genuine 401s by
  // clearing the token upstream. See docs/architecture/auth.md.
  const isAuthenticated = hasToken;

  // Loading only during the initial profile fetch, so guards can render a
  // spinner. After the first success/failure we stop blocking the UI.
  const isLoading = hasToken && sessionQuery.isPending && !sessionQuery.data && !sessionQuery.error;

  const authError = sessionQuery.error instanceof AuthError ? sessionQuery.error : undefined;
  const sessionError = sessionQuery.error && !authError ? sessionQuery.error : undefined;

  const hasPermission = useCallback(
    (code: string) => Boolean(sessionQuery.data?.permissions?.includes(code)),
    [sessionQuery.data],
  );
  const hasRole = useCallback((role: string) => Boolean(sessionQuery.data?.roles?.includes(role)), [sessionQuery.data]);

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const refetchSession = useCallback(() => sessionQuery.refetch(), [sessionQuery]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: sessionQuery.data,
      isAuthenticated,
      isLoading,
      authError,
      sessionError,
      hasPermission,
      hasRole,
      logout,
      refetchSession,
    }),
    [
      sessionQuery.data,
      isAuthenticated,
      isLoading,
      authError,
      sessionError,
      hasPermission,
      hasRole,
      logout,
      refetchSession,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }

  return value;
}

export function useHasPermission(code: string) {
  return useAuth().hasPermission(code);
}

export function useHasRole(role: string) {
  return useAuth().hasRole(role);
}

import { clearTokenInfo, getTokenInfo, setTokenInfo, type TokenInfo } from "./token-storage";

export type RefreshTokenHandler = (refreshToken: string) => Promise<TokenInfo>;

let refreshPromise: Promise<TokenInfo> | null = null;
let refreshHandler: RefreshTokenHandler | null = null;

/**
 * Wire a concrete refresh implementation. Called once during application boot
 * (see `src/lib/http/refresh-adapter.ts`). Keeping the handler pluggable lets
 * both real APIs and tests substitute their own logic without touching the
 * lock or the interceptor.
 */
export function registerRefreshHandler(handler: RefreshTokenHandler | null) {
  refreshHandler = handler;
}

/**
 * Single-flight token refresh: concurrent 401 responses share one refresh
 * request instead of stampeding the server. The promise is cleared as soon
 * as it settles so the next 401 can start a fresh cycle.
 */
export async function refreshTokenOnce() {
  const tokenInfo = getTokenInfo();

  if (!tokenInfo?.refreshToken) {
    clearTokenInfo();
    throw new Error("Refresh token is missing.");
  }

  if (!refreshHandler) {
    clearTokenInfo();
    throw new Error("Refresh handler is not registered.");
  }

  const handler = refreshHandler;

  refreshPromise ??= handler(tokenInfo.refreshToken)
    .then((nextTokenInfo) => {
      setTokenInfo(nextTokenInfo);
      refreshPromise = null;
      return nextTokenInfo;
    })
    .catch((error: unknown) => {
      refreshPromise = null;
      clearTokenInfo();
      throw error;
    });

  return refreshPromise;
}

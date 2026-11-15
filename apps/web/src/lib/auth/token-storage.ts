import { readStorage, removeStorage, writeStorage } from "@/lib/storage";

const TOKEN_STORAGE_KEY = "otd.token";
const listeners = new Set<() => void>();

export interface TokenInfo {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

export function getTokenInfo() {
  return readStorage<TokenInfo | null>(TOKEN_STORAGE_KEY, null);
}

export function setTokenInfo(tokenInfo: TokenInfo) {
  writeStorage(TOKEN_STORAGE_KEY, tokenInfo);
  emitChange();
}

export function clearTokenInfo() {
  removeStorage(TOKEN_STORAGE_KEY);
  emitChange();
}

export function getAccessToken() {
  return getTokenInfo()?.accessToken ?? null;
}

// React-friendly subscription so AuthProvider stays in sync with token
// mutations that happen outside React (interceptor refresh, other tabs).
export function subscribeTokenChange(listener: () => void) {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key === TOKEN_STORAGE_KEY) {
      listener();
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }

  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

import axios from "axios";

import { registerRefreshHandler, type RefreshTokenHandler } from "@/lib/auth/refresh";
import { config } from "@/lib/config";

import { bipoEnvelopeAdapter } from "./adapters";

import type { TokenInfo } from "@/lib/auth/token-storage";

interface RefreshPayload {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

const refreshClient = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: 15_000,
});

export function extractTokenInfo(raw: unknown): TokenInfo {
  const bizError = bipoEnvelopeAdapter.extractError(raw);
  if (bizError) {
    throw bizError;
  }
  const source = bipoEnvelopeAdapter.unwrap<RefreshPayload | null>(raw);

  if (!source?.accessToken || !source.refreshToken) {
    throw new Error("Refresh response missing tokens");
  }

  const next: TokenInfo = { accessToken: source.accessToken, refreshToken: source.refreshToken };

  if (source.expiresAt !== undefined) {
    next.expiresAt = source.expiresAt;
  }

  return next;
}

export const defaultRefreshHandler: RefreshTokenHandler = async (refreshToken) => {
  try {
    const response = await refreshClient.post<unknown>("/auth/refresh", { refreshToken });
    return extractTokenInfo(response.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return extractTokenInfo(error.response.data);
    }
    throw error;
  }
};

let installed = false;

export function installRefreshHandler(handler: RefreshTokenHandler = defaultRefreshHandler) {
  if (installed) {
    return;
  }
  registerRefreshHandler(handler);
  installed = true;
}

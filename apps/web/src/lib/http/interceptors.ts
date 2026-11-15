import axios, { AxiosHeaders, type AxiosInstance, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";

import { refreshTokenOnce } from "@/lib/auth/refresh";
import { getAccessToken } from "@/lib/auth/token-storage";

import { bipoEnvelopeAdapter } from "./adapters";
import { AuthError, BizError, NetworkError, ServerError } from "./errors";

import type { RequestExtras, ResponseAdapter } from "./types";
import type { AxiosError } from "axios";

declare module "axios" {
  export interface AxiosRequestConfig {
    extras?: RequestExtras;
  }

  export interface InternalAxiosRequestConfig {
    extras?: RequestExtras;
    _retryCount?: number;
  }
}

const REQUEST_ID_HEADER = "X-Trace-Id";
const LANGUAGE_HEADER = "X-LANGUAGE";
const TIMEZONE_HEADER = "X-TimeZone";
const MAX_REFRESH_RETRIES = 1;

function createTraceId() {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let localeGetter: () => string = () => "zh-CN";

/**
 * Called by the i18n bootstrapper so the request layer can read the active
 * language from a single source of truth instead of hardcoding a storage key.
 */
export function setLocaleGetter(getter: () => string) {
  localeGetter = getter;
}

function getTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function setCommonHeaders(requestConfig: InternalAxiosRequestConfig) {
  const headers = AxiosHeaders.from(requestConfig.headers);

  headers.set(LANGUAGE_HEADER, localeGetter());
  headers.set(TIMEZONE_HEADER, getTimeZone());
  if (!headers.get(REQUEST_ID_HEADER)) {
    headers.set(REQUEST_ID_HEADER, createTraceId());
  }

  if (!requestConfig.extras?.noAuth) {
    const accessToken = getAccessToken();

    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
  }

  if (requestConfig.extras?.isUploadFile) {
    headers.set("Content-Type", "multipart/form-data");
  }

  requestConfig.headers = headers;
}

function decodeArrayBufferJsonError(response: AxiosResponse<unknown>) {
  if (response.config.responseType !== "arraybuffer" || !(response.data instanceof ArrayBuffer)) {
    return;
  }

  const contentType = response.headers["content-type"];

  if (typeof contentType !== "string" || !contentType.includes("application/json")) {
    return;
  }

  const decoder = new TextDecoder();
  response.data = JSON.parse(decoder.decode(response.data)) as unknown;
}

function extractBizErrorFromBody(adapter: ResponseAdapter, data: unknown) {
  if (data === undefined || data === null) {
    return null;
  }
  return adapter.extractError(data);
}

function toHttpError(error: AxiosError<unknown>, adapter: ResponseAdapter) {
  if (!error.response) {
    return new NetworkError(error.message, error);
  }

  // 4xx/5xx bodies may still be envelope-shaped (server returns a status but
  // the payload has {errcode, errmsg}). Prefer the biz error message if any.
  const bizError = extractBizErrorFromBody(adapter, error.response.data);
  if (bizError) {
    return bizError;
  }

  if (error.response.status === 401) {
    return new AuthError("Unauthorized", error.response.data);
  }

  if (error.response.status >= 500) {
    return new ServerError(error.response.status, error.message, error.response.data);
  }

  return error;
}

function canRetryAfterRefresh(requestConfig: InternalAxiosRequestConfig | undefined): boolean {
  if (!requestConfig) {
    return false;
  }
  if (requestConfig.extras?.noAuth) {
    return false;
  }
  const count = requestConfig._retryCount ?? 0;
  return count < MAX_REFRESH_RETRIES;
}

async function retryWithRefresh(instance: AxiosInstance, requestConfig: InternalAxiosRequestConfig) {
  const next: InternalAxiosRequestConfig = {
    ...requestConfig,
    _retryCount: (requestConfig._retryCount ?? 0) + 1,
  };
  const tokenInfo = await refreshTokenOnce();
  const headers = AxiosHeaders.from(next.headers);
  headers.set("Authorization", `Bearer ${tokenInfo.accessToken}`);
  next.headers = headers;
  return instance.request(next);
}

export function attachRequestInterceptors(instance: AxiosInstance) {
  instance.interceptors.request.use((requestConfig) => {
    setCommonHeaders(requestConfig);
    return requestConfig;
  });
}

export function attachResponseInterceptors(instance: AxiosInstance, adapter: ResponseAdapter = bipoEnvelopeAdapter) {
  instance.interceptors.response.use(
    (response) => {
      decodeArrayBufferJsonError(response);

      if (response.config.extras?.returnRawResponse) {
        return response;
      }

      const bizError = adapter.extractError(response.data);
      if (bizError) {
        throw bizError;
      }

      return adapter.unwrap(response.data);
    },
    async (error: unknown) => {
      if (!axios.isAxiosError(error)) {
        throw error;
      }

      // If we get a 401 and the request supports auth + hasn't retried yet,
      // attempt a single-flight refresh and replay the original request.
      const originalConfig = error.config;
      if (error.response?.status === 401 && canRetryAfterRefresh(originalConfig)) {
        try {
          return await retryWithRefresh(instance, originalConfig!);
        } catch (refreshError) {
          // Fall through to normal error normalization if refresh failed.
          if (refreshError instanceof BizError) {
            throw refreshError;
          }
          throw new AuthError(refreshError instanceof Error ? refreshError.message : "Unauthorized", refreshError);
        }
      }

      throw toHttpError(error, adapter);
    },
  );
}

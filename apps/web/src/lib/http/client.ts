import axios, { type AxiosRequestConfig } from "axios";

import { config } from "@/lib/config";

import { bipoEnvelopeAdapter, restAdapter } from "./adapters";
import { attachRequestInterceptors, attachResponseInterceptors } from "./interceptors";

import type { ResponseAdapter } from "./types";
import type { RequestParams } from "./types";

const adapterRegistry: Record<"bipo" | "rest", ResponseAdapter> = {
  bipo: bipoEnvelopeAdapter,
  rest: restAdapter,
};

// The adapter is selected from config so switching contracts is a one-line
// env change (VITE_RESPONSE_ADAPTER=rest) instead of a source edit.
export const responseAdapter = adapterRegistry[config.responseAdapter];

export const http = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: 30_000,
});

attachRequestInterceptors(http);
attachResponseInterceptors(http, responseAdapter);

export const api = {
  get<T>(url: string, params?: RequestParams, requestConfig?: AxiosRequestConfig) {
    return http.get<unknown, T>(url, { params, ...requestConfig });
  },

  post<T>(url: string, body?: unknown, requestConfig?: AxiosRequestConfig) {
    return http.post<unknown, T>(url, body, requestConfig);
  },

  put<T>(url: string, body?: unknown, requestConfig?: AxiosRequestConfig) {
    return http.put<unknown, T>(url, body, requestConfig);
  },

  patch<T>(url: string, body?: unknown, requestConfig?: AxiosRequestConfig) {
    return http.patch<unknown, T>(url, body, requestConfig);
  },

  delete<T>(url: string, requestConfig?: AxiosRequestConfig) {
    return http.delete<unknown, T>(url, requestConfig);
  },
};

import type { BizError } from "./errors";

export type RequestParams = Record<string, string | number | boolean | null | undefined>;

export interface ResponseEnvelope<T = unknown> {
  errcode: string | number;
  errmsg?: string;
  errParams?: Record<string, unknown>;
  data?: T;
}

export interface ResponseAdapter {
  isSuccess(raw: unknown): boolean;
  unwrap<T>(raw: unknown): T;
  extractError(raw: unknown): BizError | null;
}

export interface RequestExtras {
  noAuth?: boolean;
  noErrorToast?: boolean;
  returnRawResponse?: boolean;
  isUploadFile?: boolean;
  isDownloadFile?: boolean;
}

export interface RequestOptions {
  extras?: RequestExtras;
}

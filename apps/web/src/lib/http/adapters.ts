import { BizError } from "./errors";

import type { ResponseAdapter, ResponseEnvelope } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getEnvelope(raw: unknown): ResponseEnvelope | null {
  if (!isRecord(raw) || !("errcode" in raw)) {
    return null;
  }

  const { data, errcode, errmsg, errParams } = raw;

  if (typeof errcode !== "string" && typeof errcode !== "number") {
    return null;
  }

  const envelope: ResponseEnvelope = { errcode };

  if (typeof errmsg === "string") {
    envelope.errmsg = errmsg;
  }

  if (isRecord(errParams)) {
    envelope.errParams = errParams;
  }

  if ("data" in raw) {
    envelope.data = data;
  }

  return envelope;
}

function isSuccessCode(code: string | number | undefined) {
  return code === "0" || code === 0;
}

export const bipoEnvelopeAdapter: ResponseAdapter = {
  isSuccess(raw) {
    const envelope = getEnvelope(raw);
    // Non-envelope responses (raw JSON) are treated as successful pass-through.
    if (!envelope) return true;
    return isSuccessCode(envelope.errcode);
  },

  unwrap<T>(raw: unknown): T {
    const envelope = getEnvelope(raw);
    if (!envelope) {
      // Passthrough for endpoints that return raw JSON without the envelope.
      return raw as T;
    }
    return envelope.data as T;
  },

  extractError(raw: unknown) {
    const envelope = getEnvelope(raw);

    if (!envelope || isSuccessCode(envelope.errcode)) {
      return null;
    }

    return new BizError(String(envelope.errcode), envelope.errmsg || "Unknown error", raw, envelope.errParams ?? {});
  },
};

export const restAdapter: ResponseAdapter = {
  isSuccess() {
    return true;
  },

  unwrap<T>(raw: unknown): T {
    return raw as T;
  },

  extractError() {
    return null;
  },
};

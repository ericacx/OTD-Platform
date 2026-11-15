import { describe, expect, it } from "vitest";

import { bipoEnvelopeAdapter, restAdapter } from "./adapters";
import { BizError } from "./errors";

describe("bipoEnvelopeAdapter", () => {
  it("unwraps successful string errcode responses", () => {
    expect(
      bipoEnvelopeAdapter.unwrap<{ id: string }>({
        errcode: "0",
        data: { id: "1" },
      }),
    ).toEqual({ id: "1" });
  });

  it("unwraps successful numeric errcode responses", () => {
    expect(
      bipoEnvelopeAdapter.unwrap<{ id: string }>({
        errcode: 0,
        data: { id: "2" },
      }),
    ).toEqual({ id: "2" });
  });

  it("converts failed envelope into BizError", () => {
    const error = bipoEnvelopeAdapter.extractError({
      errcode: "E001",
      errmsg: "Failed",
    });

    expect(error).toBeInstanceOf(BizError);
    expect(error?.message).toBe("Failed");
    expect(error?.code).toBe("E001");
  });

  it("returns null error for successful envelope", () => {
    expect(bipoEnvelopeAdapter.extractError({ errcode: "0", errmsg: "" })).toBeNull();
  });
});

describe("restAdapter", () => {
  it("returns raw data and never extracts business errors", () => {
    const payload = { ok: true };

    expect(restAdapter.unwrap(payload)).toBe(payload);
    expect(restAdapter.extractError(payload)).toBeNull();
  });
});

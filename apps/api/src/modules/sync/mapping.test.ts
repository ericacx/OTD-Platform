import type { SyncMappingField, SyncTransform } from "@otd/contracts/sync";
import { describe, expect, it } from "vitest";
import { applyMapping, applyTransform, readPath } from "./mapping.js";

const codeMaps = { size: { S: "01", M: "02", L: "03" }, plant: { NH5: "SITE-NH5", DC1: "SITE-DC1" } };
const record = { poNo: " PO0010459 ", customerCode: "NSR", styleNo: "12593", seasonCode: "AW26", size: "M", tags: "red, blue ,green", lines: [{ size: "XL2" }] };

type Case = [name: string, transform: SyncTransform, value: unknown, args: Record<string, unknown>, expected: { value?: unknown; error?: "MAPPING_MISS" | "FORMAT_MISMATCH" | "REQUIRED_MISSING" }];

const cases: Case[] = [
  ["trim removes surrounding spaces", "trim", "  PO0010459 ", {}, { value: "PO0010459" }],
  ["trim keeps null", "trim", null, {}, { value: null }],
  ["trim converts numbers to text", "trim", 42, {}, { value: "42" }],
  ["trim rejects objects", "trim", { a: 1 }, {}, { error: "FORMAT_MISMATCH" }],
  ["required passes a value", "required", "PO1", {}, { value: "PO1" }],
  ["required rejects empty string", "required", "  ", {}, { error: "REQUIRED_MISSING" }],
  ["required rejects null", "required", null, {}, { error: "REQUIRED_MISSING" }],
  ["default fills empty", "default", null, { value: "OTD-0001" }, { value: "OTD-0001" }],
  ["default keeps existing", "default", "V1", { value: "OTD-0001" }, { value: "V1" }],
  ["number parses thousands separators", "number", "1,234.50", {}, { value: 1234.5 }],
  ["number rounds decimals", "number", 3.14159, { decimals: 2 }, { value: 3.14 }],
  ["number rounds to integer", "number", "12.6", { integer: true }, { value: 13 }],
  ["number rejects text", "number", "12 pairs", {}, { error: "FORMAT_MISMATCH" }],
  ["unit pair to dozen", "unit", 37080, { from: "pair", to: "dozen" }, { value: 3090 }],
  ["unit kg to lb rounds", "unit", 1, { from: "kg", to: "lb", decimals: 3 }, { value: 2.205 }],
  ["unit uses explicit factor", "unit", 10, { factor: 0.5 }, { value: 5 }],
  ["unit rejects incompatible units", "unit", 10, { from: "kg", to: "dozen" }, { error: "FORMAT_MISMATCH" }],
  ["dateFormat ISO date to compact", "dateFormat", "2026-11-21", { to: "YYYYMMDD" }, { value: "20261121" }],
  ["dateFormat compact to ISO", "dateFormat", "20261121", { to: "YYYY-MM-DD" }, { value: "2026-11-21" }],
  ["dateFormat timestamp to date", "dateFormat", "2026-11-21T08:30:00.000Z", {}, { value: "2026-11-21" }],
  ["dateFormat Date object", "dateFormat", new Date("2026-03-05T00:00:00Z"), { to: "DD/MM/YYYY" }, { value: "05/03/2026" }],
  ["dateFormat with explicit source pattern", "dateFormat", "21/11/2026", { from: "DD/MM/YYYY", to: "YYYY-MM-DD" }, { value: "2026-11-21" }],
  ["dateFormat rejects ambiguous day-first without pattern", "dateFormat", "21/11/2026", {}, { error: "FORMAT_MISMATCH" }],
  ["dateFormat rejects impossible date", "dateFormat", "2026-02-30", {}, { error: "FORMAT_MISMATCH" }],
  ["dateFormat rejects pattern mismatch", "dateFormat", "2026-11-21", { from: "DD/MM/YYYY" }, { error: "FORMAT_MISMATCH" }],
  ["codeMap hits", "codeMap", "M", { map: "size" }, { value: "02" }],
  ["codeMap misses", "codeMap", "XL2", { map: "size" }, { error: "MAPPING_MISS" }],
  ["codeMap fallback on miss", "codeMap", "XL2", { map: "size", fallback: "99" }, { value: "99" }],
  ["codeMap unknown table", "codeMap", "M", { map: "color" }, { error: "MAPPING_MISS" }],
  ["enumMap hits", "enumMap", "IN_PRODUCTION", { values: { IN_PRODUCTION: "PROD", COMPLETED: "DONE" } }, { value: "PROD" }],
  ["enumMap misses", "enumMap", "CANCELLED", { values: { IN_PRODUCTION: "PROD" } }, { error: "MAPPING_MISS" }],
  ["concat joins sources", "concat", null, { sources: ["customerCode", "styleNo", "seasonCode"], separator: "-" }, { value: "NSR-12593-AW26" }],
  ["concat skips empty parts", "concat", null, { sources: ["customerCode", "missing", "styleNo"] }, { value: "NSR12593" }],
  ["split into list", "split", "red, blue ,green", {}, { value: ["red", "blue", "green"] }],
  ["split picks index", "split", "A|B|C", { separator: "|", index: 1 }, { value: "B" }],
  ["split rejects numbers", "split", 12, {}, { error: "FORMAT_MISMATCH" }],
];

describe("sync mapping DSL", () => {
  it.each(cases)("%s", (_name, transform, value, args, expected) => {
    const res = applyTransform(transform, value, args, { record, codeMaps, source: "src", target: "dst" });
    if (expected.error) {
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.type).toBe(expected.error);
        expect(res.message.length).toBeGreaterThan(0);
        expect(res.suggestion.length).toBeGreaterThan(0);
      }
    } else {
      expect(res).toEqual({ ok: true, value: expected.value });
    }
  });

  it("reads nested paths", () => {
    expect(readPath(record, "lines.0.size")).toBe("XL2");
    expect(readPath(record, "lines.3.size")).toBeUndefined();
    expect(readPath(record, "")).toBeUndefined();
  });

  it("maps a whole record and collects classified errors", () => {
    const fields: SyncMappingField[] = [
      { source: "poNo", target: "PONumber", transform: "trim", required: true },
      { source: "size", target: "SizeCode", transform: "codeMap", args: { map: "size" } },
      { source: "lines.0.size", target: "LineSize", transform: "codeMap", args: { map: "size" } },
      { source: "dueDate", target: "ShipDate", transform: "dateFormat", args: { to: "YYYY-MM-DD" }, required: true },
      { source: "", target: "SupplierCode", transform: "default", args: { value: "OTD-0001" } },
    ];
    const res = applyMapping(fields, codeMaps, record);
    expect(res.ok).toBe(false);
    expect(res.output).toEqual({ PONumber: "PO0010459", SizeCode: "02", SupplierCode: "OTD-0001" });
    expect(res.errors.map((e) => [e.field, e.type])).toEqual([
      ["LineSize", "MAPPING_MISS"],
      ["ShipDate", "REQUIRED_MISSING"],
    ]);
    expect(res.errors[0]!.suggestion).toContain("size");
  });

  it("passes the record through when no fields are configured", () => {
    expect(applyMapping([], {}, { a: 1 })).toEqual({ ok: true, output: { a: 1 }, errors: [] });
  });
});

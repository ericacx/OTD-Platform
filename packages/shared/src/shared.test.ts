import { describe, expect, it } from "vitest";
import {
  MENU,
  MODULES,
  NODES,
  PERMISSION_PRESETS,
  PRESET_ROLES,
  STATUS_MACHINES,
  allPermissionCodes,
  canTransition,
  expandPermissionPatterns,
  formatDocNo,
  marginRate,
  parseDocNo,
  quoteNo,
  statusCodes,
} from "./index.js";

describe("doc numbers", () => {
  const d = new Date(2026, 9, 21);
  it("formats monthly sequences", () => {
    expect(formatDocNo("inspection", d, 20)).toBe("INSP-2610-020");
    expect(formatDocNo("testRequest", d, 1234)).toBe("TST-2610-1234");
    expect(formatDocNo("receivable", d, 14)).toBe("AR-202610-014");
    expect(formatDocNo("syncTask", d, 11)).toBe("SYN-2026-011");
  });
  it("formats unperiodized codes", () => {
    expect(formatDocNo("patrolRun", d, 2)).toBe("PT-0002");
    expect(formatDocNo("role", d, 1)).toBe("R001");
    expect(formatDocNo("org", d, 1)).toBe("ORG001");
    expect(quoteNo("#12593", 4)).toBe("QT-12593-04");
  });
  it("parses doc numbers", () => {
    expect(parseDocNo("INSP-2610-020")).toEqual({ prefix: "INSP", period: "2610", seq: 20 });
    expect(parseDocNo("PT-0002")).toEqual({ prefix: "PT", period: "", seq: 2 });
    expect(parseDocNo("bad")).toBeNull();
  });
  it("rejects invalid sequence", () => {
    expect(() => formatDocNo("planning", d, 0)).toThrow();
  });
});

describe("conventions", () => {
  it("has 22 modules and a menu group for each", () => {
    expect(MODULES).toHaveLength(22);
    expect(MENU.map((g) => g.module)).toEqual(MODULES.map((m) => m.code));
  });
  it("has 10 mainline nodes with two gates", () => {
    expect(NODES).toHaveLength(10);
    expect(NODES.filter((n) => "gate" in n).map((n) => n.code)).toEqual(["N05", "N09"]);
  });
  it("permission codes are unique and well formed", () => {
    const codes = allPermissionCodes();
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toMatch(/^[a-z]+\.[a-zA-Z]+\.[a-zA-Z]+$/);
  });
  it("every preset role expands to a non-empty permission set", () => {
    for (const r of PRESET_ROLES) {
      const perms = expandPermissionPatterns(PERMISSION_PRESETS[r.permissionPreset]);
      expect(perms.length, r.code).toBeGreaterThan(3);
      expect(perms).toContain("todo.todo.view");
    }
  });
  it("sales cannot override guardrail or edit roles", () => {
    const perms = expandPermissionPatterns(PERMISSION_PRESETS.SALES);
    expect(perms).not.toContain("quote.quote.override");
    expect(perms).not.toContain("iam.role.edit");
    expect(perms).toContain("quote.quote.create");
  });
  it("gm sees everything except system edits", () => {
    const perms = expandPermissionPatterns(PERMISSION_PRESETS.GM);
    expect(perms).toContain("metrics.gm.view");
    expect(perms).not.toContain("iam.role.grant");
  });
});

describe("status machines", () => {
  it("initial status exists and transitions reference known statuses", () => {
    for (const [key, m] of Object.entries(STATUS_MACHINES)) {
      const codes = Object.keys(m.statuses);
      expect(codes, key).toContain(m.initial);
      for (const [from, tos] of Object.entries(m.transitions)) {
        expect(codes, `${key}.${from}`).toContain(from);
        for (const to of tos as string[]) expect(codes, `${key}.${from}->${to}`).toContain(to);
      }
    }
  });
  it("order lifecycle follows the five stages", () => {
    expect(statusCodes("order")).toEqual(["PENDING_CONFIRM", "TO_SCHEDULE", "IN_PRODUCTION", "TO_SHIP", "COMPLETED", "CANCELLED"]);
    expect(canTransition("order", "PENDING_CONFIRM", "TO_SCHEDULE")).toBe(true);
    expect(canTransition("order", "TO_SHIP", "CANCELLED")).toBe(false);
  });
  it("test request uses the video status names", () => {
    expect(statusCodes("testRequest")).toEqual(["DRAFT", "AWAITING_SAMPLE", "TESTING", "COMPLETED"]);
  });
});

describe("money", () => {
  it("computes margin on price as in the video quote", () => {
    expect(marginRate(19.31, 16.09)).toBe(0.1668);
    expect(marginRate(18.79, 16.09)).toBe(0.1437);
  });
});

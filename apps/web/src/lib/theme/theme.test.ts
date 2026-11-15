import { describe, expect, it } from "vitest";

import { THEME_IDS, applyThemeToElement, derivePrimaryVars, isHexColor, isThemeId, mixColor } from "./theme";

describe("theme", () => {
  it("defines seven themes", () => {
    expect(THEME_IDS).toHaveLength(7);
    expect(isThemeId("night")).toBe(true);
    expect(isThemeId("dark")).toBe(false);
  });

  it("mixes colors toward a target", () => {
    expect(mixColor("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mixColor("#B5121B", "#FFFFFF", 0)).toBe("#B5121B");
  });

  it("derives readable foregrounds and soft backgrounds", () => {
    const vars = derivePrimaryVars("#2563EB", false);
    expect(vars["--primary-foreground"]).toBe("#FFFFFF");
    expect(vars["--primary-soft"]).not.toBe("#2563EB");
    expect(derivePrimaryVars("#FDE047", false)["--primary-foreground"]).toBe("#111827");
  });

  it("validates hex colors", () => {
    expect(isHexColor("#a1b2c3")).toBe(true);
    expect(isHexColor("red")).toBe(false);
  });

  it("applies theme attributes and custom primary to an element", () => {
    const el = document.createElement("div");
    applyThemeToElement(el, { themeId: "night", customPrimary: "#2F8F5B" });
    expect(el.dataset.theme).toBe("night");
    expect(el.classList.contains("dark")).toBe(true);
    expect(el.style.getPropertyValue("--primary")).toBe("#2F8F5B");
    applyThemeToElement(el, { themeId: "brand-red", customPrimary: null });
    expect(el.classList.contains("dark")).toBe(false);
    expect(el.style.getPropertyValue("--primary")).toBe("");
  });
});

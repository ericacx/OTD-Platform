import { describe, expect, it } from "vitest";

import { formatMoney, formatNumber, formatPercent } from "./format";

describe("format", () => {
  it("formats money with currency code and thousands separators", () => {
    expect(formatMoney(62480, "USD")).toBe("USD 62,480.00");
    expect(formatMoney(9860000, "JPY")).toBe("JPY 9,860,000");
    expect(formatMoney(null, "USD")).toBe("—");
  });

  it("formats numbers and percents", () => {
    expect(formatNumber(37080)).toBe("37,080");
    expect(formatPercent(0.1437)).toBe("14.4%");
  });
});

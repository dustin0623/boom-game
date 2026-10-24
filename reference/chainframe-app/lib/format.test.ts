import { describe, expect, it } from "vitest";
import {
  formatHash,
  formatShopPrice,
  formatMiningRate,
  formatPercent,
} from "./format";

describe("trimmed stat precision", () => {
  it("trims zeros without losing fractional stat values", () => {
    expect(formatHash(2, 2, false)).toBe("2");
    expect(formatHash(10.567, 2, false)).toBe("10.57");
    expect(formatHash(0, 4, false)).toBe("0");
    expect(formatHash(0.163249, 4, false)).toBe("0.1632");
  });
  it("keeps large stat values precise without changing existing compact or shop formatting", () => {
    expect(formatHash(100_000.125, 2, false)).toBe("100,000.13");
    expect(formatHash(100_000.125, 4, false)).toBe("100,000.125");
    expect(formatHash(100_000)).toBe("100,000");
    expect(formatHash(100_000, 4, true)).toBe("100K");
    expect(formatPercent(0.012345)).toBe("0.0123%");
    expect(formatMiningRate(0)).toBe("0");
    expect(formatMiningRate(2 / 86400)).toBe("0.00002");
    expect(formatMiningRate(0.000000123)).toBe("0.0000001");
    expect(formatMiningRate(1e-22)).toBe("1e-22");
    expect(formatShopPrice(1.1)).toBe("1.1");
    expect(formatHash(2 / 86400, 5)).toBe("0.00002");
  });
});

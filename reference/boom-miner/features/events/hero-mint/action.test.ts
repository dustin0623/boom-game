/**
 * features/events/hero-mint/action.test.ts
 */

import { describe, it, expect } from "vitest";
import { heroMint, MAX_MINT_PER_TX } from "./action";
import { MINT_COST } from "@/features/store/gameStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validAction(count = 1) {
  return {
    count,
    minted_numbers: Array.from({ length: count }, (_, i) => i + 1),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("heroMint", () => {
  it("approves a valid single mint and reports the on-chain cost", () => {
    const result = heroMint({ action: validAction(1) });
    expect(result.ok).toBe(true);
    expect(result.totalCost).toBe(MINT_COST);
  });

  it("approves a batch mint and computes the correct cost", () => {
    const count  = 3;
    const result = heroMint({ action: validAction(count) });
    expect(result.ok).toBe(true);
    expect(result.totalCost).toBe(count * MINT_COST);
  });

  it("rejects count = 0", () => {
    const result = heroMint({ action: { count: 0, minted_numbers: [] } });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INVALID_COUNT");
  });

  it(`rejects count > MAX_MINT_PER_TX (${MAX_MINT_PER_TX})`, () => {
    const count  = MAX_MINT_PER_TX + 1;
    const result = heroMint({
      action: { count, minted_numbers: Array.from({ length: count }, (_, i) => i + 1) },
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INVALID_COUNT");
  });

  it("rejects when minted_numbers length mismatches count", () => {
    const result = heroMint({
      action: { count: 3, minted_numbers: [1, 2] }, // only 2 numbers for count=3
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INVALID_MINTED_NUMBERS");
  });

  it("rejects when minted_numbers contains non-positive integers", () => {
    const result = heroMint({
      action: { count: 2, minted_numbers: [1, -5] },
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INVALID_MINTED_NUMBERS");
  });

  it("rejects when minted_numbers contains floats", () => {
    const result = heroMint({
      action: { count: 1, minted_numbers: [1.5] },
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INVALID_MINTED_NUMBERS");
  });
});

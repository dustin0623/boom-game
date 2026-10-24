import { describe, expect, it } from "vitest";
import { MAX_MINT_PER_TX, mintCost, validMintCount } from "./mint";

describe("hero minting rules", () => {
  it("costs 500,000 coins per hero", () => {
    expect(mintCost(1)).toBe(500_000);
    expect(mintCost(3)).toBe(1_500_000);
  });
  it("allows 1 to 10 heroes per mint", () => {
    expect(MAX_MINT_PER_TX).toBe(10);
    expect(validMintCount(0)).toBe(false);
    expect(validMintCount(10)).toBe(true);
    expect(validMintCount(11)).toBe(false);
    expect(validMintCount(2.5)).toBe(false);
  });
});

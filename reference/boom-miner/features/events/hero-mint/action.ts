/**
 * features/events/hero-mint/action.ts
 *
 * Pure event function for validating a hero mint request.
 * No DB calls, no coin balance — minting is paid for by an on-chain
 * player -> treasury token transfer (verified server-side), not in-game coins.
 *
 * Rules enforced:
 *  1. count must be between 1 and MAX_MINT_PER_TX.
 *  2. minted_numbers must be a non-empty array with exactly `count` entries,
 *     all positive integers — assigned by the client and passed through.
 *
 * The route handler is responsible for:
 *  - Calling this function first (fast structural validation).
 *  - Verifying the on-chain transfer and inserting hero documents via
 *    verifyAndMintHeroes().
 */

import { MINT_COST } from "@/lib/constants/game";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum heroes mintable in a single transaction. */
export const MAX_MINT_PER_TX = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MintAction {
  count:          number;
  minted_numbers: number[];
}

export interface MintResult {
  ok:         boolean;
  error?:     string;
  code?:      string;
  /** Expected on-chain token cost for this mint (count × MINT_COST). */
  totalCost?: number;
}

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

/**
 * heroMint({ action })
 *
 * Pure structural validation — returns ok:true and the expected on-chain cost
 * if the request shape is valid. Payment is settled by an on-chain transfer
 * verified in verifyAndMintHeroes(); this function only pre-validates so the
 * route can fail fast before hitting the chain.
 */
export function heroMint({ action }: { action: MintAction }): MintResult {
  const { count, minted_numbers } = action;

  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > MAX_MINT_PER_TX
  ) {
    return {
      ok:    false,
      error: `count must be an integer between 1 and ${MAX_MINT_PER_TX}`,
      code:  "INVALID_COUNT",
    };
  }

  if (
    !Array.isArray(minted_numbers) ||
    minted_numbers.length !== count ||
    !minted_numbers.every((n) => typeof n === "number" && Number.isInteger(n) && n > 0)
  ) {
    return {
      ok:    false,
      error: `minted_numbers must be an array of ${count} positive integer(s)`,
      code:  "INVALID_MINTED_NUMBERS",
    };
  }

  return {
    ok:        true,
    totalCost: count * MINT_COST,
  };
}

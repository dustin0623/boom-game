import { vi } from "vitest";

/** Repository-only read stubs for payout-policy unit tests. */
export function createTreasuryReadStubs() {
  return { pending: vi.fn(), archived: vi.fn() };
}

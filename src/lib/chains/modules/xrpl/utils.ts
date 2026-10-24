/** Shared XRPL helpers (no secrets, no browser APIs). */
export const toHex = (s: string) =>
  Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
export const fromHex = (h: string) =>
  new TextDecoder().decode(new Uint8Array((h.match(/../g) ?? []).map((b) => parseInt(b, 16))));

/** The unsubmitted transaction carrying the login challenge as a memo. */
export function buildLoginTx(address: string, message: string) {
  return {
    TransactionType: "AccountSet",
    Account: address,
    Memos: [{ Memo: { MemoType: toHex("login"), MemoData: toHex(message) } }],
  };
}

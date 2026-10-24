import { HeroModel } from "./model.server";
import type { IHero } from "./types.server";
import { generateHero } from "./generate";
import { HeroRarity } from "@/features/types/HeroRarity";
import { connectDatabase } from "@/lib/config/database";
import { MINT_COST } from "@/lib/constants/game";
import { verifyDepositFromPlayer } from "@/lib/chain/verify";
import {
  claimProcessedTransaction,
  findProcessedTransaction,
  patchTransactionMetadata,
} from "@/lib/modules/transactions-processed/repository.server";
/**
 * Case-insensitive wallet filter for MongoDB queries.
 * ownerWallet is always stored with the same casing as player.wallet (the
 * original mixed-case EIP-55 value from the wallet provider). Using $regex
 * with the "i" flag means queries match regardless of what casing MetaMask,
 * WalletConnect, or any other provider returns at login time.
 */
function walletFilter(wallet: string) {
  return { $regex: new RegExp(`^${wallet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };
}

export type { IHero } from "./types.server";

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getHeroesByWallet(wallet: string): Promise<IHero[]> {
  await connectDatabase();
  return HeroModel.find({ ownerWallet: walletFilter(wallet) }).lean<IHero[]>();
}

/**
 * Fetches heroes by their Mongoose _id strings. Used by the shop to load
 * freshly minted heroes from the metadata heroIds immediately after settlement,
 * without waiting for the WebSocket roster refresh.
 */
export async function getHeroesByIds(ids: string[]): Promise<IHero[]> {
  await connectDatabase();
  if (ids.length === 0) return [];
  return HeroModel.find({ _id: { $in: ids } }).lean<IHero[]>();
}

/**
 * Returns the next available minted_number by finding the global max across
 * ALL heroes in the collection and adding 1. This is the authoritative source
 * of truth — the client must NEVER derive this from its local roster count.
 */
export async function getNextMintedNumber(): Promise<number> {
  await connectDatabase();
  const result = await HeroModel.findOne({}, { minted_number: 1 })
    .sort({ minted_number: -1 })
    .lean<{ minted_number: number }>();
  return (result?.minted_number ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Starter hero (one Common hero, onMap:true)
// ---------------------------------------------------------------------------

/**
 * Ensures the player has at least one hero. If the roster is empty, creates
 * one Common starter hero with onMap=true. Returns the full roster.
 */
export async function ensureStarterHero(wallet: string): Promise<IHero[]> {
  await connectDatabase();
  const existing = await HeroModel.find({ ownerWallet: walletFilter(wallet) }).lean<IHero[]>();
  if (existing.length > 0) return existing;

  const totalCount = await HeroModel.countDocuments();
  // Store ownerWallet exactly as passed — same casing as player.wallet.
  const seed = { ...generateHero(wallet, totalCount + 1, HeroRarity.Common), onMap: true };
  await HeroModel.create(seed);
  return HeroModel.find({ ownerWallet: walletFilter(wallet) }).lean<IHero[]>();
}

// ---------------------------------------------------------------------------
// Mint (client-transfer)
// ---------------------------------------------------------------------------

/** Machine-readable failure codes surfaced by verifyAndMintHeroes. */
export type MintErrorCode =
  | "INVALID_MINTED_NUMBERS"
  | "ALREADY_PROCESSED"
  | "NOT_CONFIRMED"
  | "VERIFICATION_FAILED";

export interface VerifyAndMintResult {
  ok:      boolean;
  code?:   MintErrorCode;
  error?:  string;
  heroes:  IHero[];
}

/** Options controlling how the worker verifies the on-chain payment. */
export interface VerifyAndMintOptions {
  /** Confirmation polls before returning NOT_CONFIRMED. Worker passes a small value. */
  verifyMaxTries?: number;
  /** Delay between confirmation polls, in ms. */
  verifyDelayMs?: number;
}

/**
 * Verifies an on-chain player -> treasury payment and, if valid, mints
 * `count` heroes for `wallet`.
 *
 * Minting is no longer paid with in-game coins. Instead the player signs a
 * token transfer in the browser (lib/client/solana/deposit.ts); this function:
 *   1. Verifies the transfer landed on-chain: signed by `wallet`, treasury
 *      received exactly count × MINT_COST of the configured mint.
 *   2. Atomically claims the signature in the settlement ledger (unique index)
 *      so the same transaction can never mint twice.
 *   3. Inserts the hero documents.
 *
 * `mintedNumbers` are the sequential display numbers assigned by the client —
 * one per hero, in order. Stored as-is.
 */
export async function verifyAndMintHeroes(
  wallet: string,
  count: number,
  mintedNumbers: number[],
  txId: string,
  opts: VerifyAndMintOptions = {},
): Promise<VerifyAndMintResult> {
  await connectDatabase();

  if (mintedNumbers.length !== count) {
    return { ok: false, code: "INVALID_MINTED_NUMBERS", error: "minted_numbers length mismatch", heroes: [] };
  }

  const cost = count * MINT_COST;

  // 1. Verify the on-chain transfer before touching the DB. In the worker we
  //    poll only briefly and let the queue retry a not-yet-confirmed payment.
  const verification = await verifyDepositFromPlayer(txId, wallet, cost, {
    maxTries: opts.verifyMaxTries,
    delayMs:  opts.verifyDelayMs,
  });
  if (!verification.valid) {
    // NOT_CONFIRMED is transient (retry); everything else is terminal.
    const code: MintErrorCode =
      verification.code === "NOT_CONFIRMED" ? "NOT_CONFIRMED" : "VERIFICATION_FAILED";
    return {
      ok:    false,
      code,
      error: verification.reason ?? "On-chain payment could not be verified",
      heroes: [],
    };
  }

  // 2. Claim the signature — atomic idempotency gate. A replay (or concurrent
  //    duplicate request) with the same txId gets claimed:false and mints nothing.
  const { claimed } = await claimProcessedTransaction({
    txHash: txId,
    wallet,
    type:   "mint",
    amount: -cost,
    // metadata.heroIds will be patched in below after insertMany succeeds
    metadata: {
      type: "mint",
      heroIds: [],
      mintedNumbers,
      count,
    },
  });

  if (!claimed) {
    // The ledger row already exists. Check whether heroes were actually inserted —
    // if the worker crashed between claimProcessedTransaction and insertMany,
    // the heroes are missing and we must recover them here.
    const existing = await findProcessedTransaction(txId);
    const storedIds: string[] = (existing?.metadata as { heroIds?: string[] } | undefined)?.heroIds ?? [];

    if (storedIds.length === count) {
      // Heroes were fully inserted on a prior run — return them.
      const heroes = await HeroModel.find({ _id: { $in: storedIds } }).lean<IHero[]>();
      return { ok: true, heroes };
    }

    // heroIds is empty (crash between claim and insert) — re-insert now.
    // Re-run insertMany idempotently by checking which minted_numbers already exist.
    const alreadyMinted = await HeroModel.find({
      ownerWallet: walletFilter(wallet),
      minted_number: { $in: mintedNumbers },
    }).lean<IHero[]>();

    const alreadyNumbers = new Set(alreadyMinted.map((h) => h.minted_number));
    const missing = mintedNumbers.filter((n) => !alreadyNumbers.has(n));

    let recovered: IHero[] = [...alreadyMinted];
    if (missing.length > 0) {
      const seeds = missing.map((n) => generateHero(wallet, n));
      const newDocs = await HeroModel.insertMany(seeds);
      recovered = [...recovered, ...(newDocs as unknown as IHero[])];
    }

    // Patch the metadata with the recovered hero IDs.
    await patchTransactionMetadata(txId, {
      type: "mint",
      heroIds: recovered.map((h) => String(h._id)),
      mintedNumbers,
      count,
    });

    return { ok: true, heroes: recovered };
  }

  // 3. Insert the heroes and patch metadata with their IDs.
  const seeds = mintedNumbers.map((n) => generateHero(wallet, n));
  const docs  = await HeroModel.insertMany(seeds);
  const heroes = docs as unknown as IHero[];

  // Patch the metadata with the real hero ObjectIds now that we have them.
  await patchTransactionMetadata(txId, {
    type: "mint",
    heroIds: heroes.map((h) => String(h._id)),
    mintedNumbers,
    count,
  });

  return { ok: true, heroes };
}

// ---------------------------------------------------------------------------
// Deploy / recall
// ---------------------------------------------------------------------------


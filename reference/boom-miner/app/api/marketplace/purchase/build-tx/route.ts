/**
 * POST /api/marketplace/purchase/build-tx
 *
 * Builds (but does NOT sign) the unsigned player → treasury token transfer
 * transaction the buyer must sign to purchase a listed hero.
 *
 * Same pattern as /api/mint/build-tx:
 *   - Server constructs the transaction using server-side RPC (Helius key stays secret)
 *   - Client receives a base64-serialised Transaction, signs it via their wallet,
 *     broadcasts it on-chain, then calls POST /api/marketplace/purchase with the txId
 *
 * Body: { heroId: string; buyerWallet: string }
 *
 * The buyer sends `hero.market.price` tokens to TREASURY_ADDRESS.
 * The treasury worker will later verify the payment and forward the seller's net
 * (price × 0.95) from the treasury to the seller wallet using TREASURY_KEY.
 *
 * SERVER-ONLY.
 */

import { apiOk, apiError } from "@/lib/api/error-response";
import { getWallet } from "@/lib/api/get-wallet";
import { config } from "@/lib/config/config";
import { HeroModel } from "@/lib/modules/heroes/model.server";
import { connectDatabase } from "@/lib/config/database";
import { getMintDecimals, getMintPublicKey, getConnection } from "@/lib/chain/solana/rpc";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAccount,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from "@solana/spl-token";

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

export async function POST(req: Request): Promise<Response> {
  // Server-side gate: NEXT_PUBLIC_MARKETPLACE_ENABLED must be exactly "true".
  // Defaults to disabled when the variable is absent or any other value.
  if (process.env.NEXT_PUBLIC_MARKETPLACE_ENABLED !== "true") {
    return apiError(
      "Marketplace is currently disabled",
      "MARKETPLACE_DISABLED",
      503,
    );
  }

  const wallet = await getWallet(req);
  if (!wallet) {
    return apiError("Not authenticated", "UNAUTHORIZED", 401);
  }

  const chain = config.blockchain.chain;
  if (chain !== "solana") {
    return apiError(
      `Marketplace purchases are not configured for chain "${chain}"`,
      "UNSUPPORTED_CHAIN",
      400,
    );
  }

  let body: { heroId?: string; buyerWallet?: string };
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body", "BAD_REQUEST", 400);
  }

  const { heroId, buyerWallet } = body;
  if (!heroId)       return apiError("heroId is required", "BAD_REQUEST", 400);
  if (!buyerWallet)  return apiError("buyerWallet is required", "BAD_REQUEST", 400);
  if (buyerWallet !== wallet) {
    return apiError("buyerWallet does not match authenticated wallet", "FORBIDDEN", 403);
  }

  await connectDatabase();

  const hero = await HeroModel.findById(heroId).lean<{
    _id: unknown;
    ownerWallet: string;
    name: string;
    market?: { listed?: boolean; price?: number; seller?: string | null };
  }>();

  if (!hero) return apiError("Hero not found", "HERO_NOT_FOUND", 404);
  if (!hero.market?.listed) return apiError("Hero is not listed for sale", "NOT_LISTED", 409);
  if (hero.ownerWallet.toLowerCase() === wallet.toLowerCase()) {
    return apiError("You cannot purchase your own hero", "CANNOT_BUY_OWN", 403);
  }

  const price = hero.market.price ?? 0;
  if (price <= 0) return apiError("Invalid listing price", "INVALID_PRICE", 409);

  const solana = config.blockchain.solana;
  if (!solana.mint) {
    return apiError("Server mint address is not configured", "MINT_NOT_CONFIGURED", 500);
  }

  const connection  = getConnection();
  const mintPk      = getMintPublicKey();
  const treasuryPk  = new PublicKey(config.blockchain.treasuryAddress);
  const buyerPk     = new PublicKey(buyerWallet);

  let decimals: number;
  try {
    decimals = await getMintDecimals();
  } catch {
    return apiError("Failed to fetch mint decimals", "CHAIN_ERROR", 502);
  }

  // Convert whole-token price to base units (same approach as mint build-tx).
  const [whole, frac = ""] = String(price).split(".");
  const paddedFrac  = (frac + "0".repeat(decimals)).slice(0, decimals);
  const baseUnits   = BigInt(whole + paddedFrac);

  const buyerAta    = await getAssociatedTokenAddress(
    mintPk, buyerPk, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const treasuryAta = await getAssociatedTokenAddress(
    mintPk, treasuryPk, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const instructions: TransactionInstruction[] = [];

  // Create treasury ATA on-demand if it does not exist (buyer pays rent).
  try {
    await getAccount(connection, treasuryAta, "confirmed", TOKEN_2022_PROGRAM_ID);
  } catch (err) {
    if (
      err instanceof TokenAccountNotFoundError ||
      err instanceof TokenInvalidAccountOwnerError
    ) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          buyerPk, treasuryAta, treasuryPk, mintPk,
          TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      );
    } else {
      return apiError("Failed to check treasury token account", "CHAIN_ERROR", 502);
    }
  }

  // Transfer: buyer → treasury (full price; worker pays seller net from treasury)
  instructions.push(
    createTransferCheckedInstruction(
      buyerAta, mintPk, treasuryAta, buyerPk,
      baseUnits, decimals, [], TOKEN_2022_PROGRAM_ID,
    ),
  );

  // Memo binds this payment to the specific hero purchase so the worker can
  // identify it in the transaction log.
  instructions.push(
    new TransactionInstruction({
      keys:      [],
      programId: MEMO_PROGRAM_ID,
      data:      Buffer.from(`boom-miner:marketplace:${heroId}`, "utf8"),
    }),
  );

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer:       buyerPk,
    recentBlockhash: blockhash,
  }).add(...instructions);

  const serialized = tx.serialize({ requireAllSignatures: false }).toString("base64");

  return apiOk({
    transaction: serialized,
    decimals,
    price,
    heroId,
    heroName:   hero.name,
    sellerWallet: hero.ownerWallet,
  });
}

import { apiOk, apiError } from "@/lib/api/error-response";
import { getWallet } from "@/lib/api/get-wallet";
import { config } from "@/lib/config/config";
import { getConnection, getMintDecimals, getMintPublicKey } from "@/lib/chain/solana/rpc";
import { MINT_COST } from "@/lib/constants/game";
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

/**
 * POST /api/mint/build-tx
 *
 * Server builds the unsigned player -> treasury Token-2022 transfer transaction
 * using Helius RPC (server-side only). Returns a base64-serialised Transaction
 * the browser deserialises, has the wallet sign, then broadcasts.
 *
 * This mirrors the luckyfrog-farm stash/purchase pattern: transaction
 * construction never happens in the browser, so the Helius key stays secret.
 *
 * Body: { playerWallet: string; qty: number }
 */
export async function POST(req: Request): Promise<Response> {
  const wallet = await getWallet(req);
  if (!wallet) {
    return apiError("Not authenticated", "UNAUTHORIZED", 401);
  }

  const chain = config.blockchain.chain;
  if (chain !== "solana") {
    return apiError(`Minting is not configured for chain "${chain}"`, "UNSUPPORTED_CHAIN", 400);
  }

  let body: { playerWallet?: string; qty?: number };
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body", "BAD_REQUEST", 400);
  }

  const { playerWallet, qty = 1 } = body;
  if (!playerWallet) {
    return apiError("playerWallet is required", "BAD_REQUEST", 400);
  }
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
    return apiError("qty must be 1–10", "BAD_REQUEST", 400);
  }

  const solana = config.blockchain.solana;
  if (!solana.mint) {
    return apiError("Server mint address is not configured", "MINT_NOT_CONFIGURED", 500);
  }

  const connection = getConnection();
  const mintPk = getMintPublicKey();
  const treasuryPk = new PublicKey(config.blockchain.treasuryAddress);
  const playerPk = new PublicKey(playerWallet);

  let decimals: number;
  try {
    decimals = await getMintDecimals();
  } catch {
    return apiError("Failed to fetch mint decimals", "CHAIN_ERROR", 502);
  }

  const amount = qty * MINT_COST;
  // Convert whole-token amount to base units using string arithmetic to avoid
  // floating-point precision loss.
  const [whole, frac = ""] = String(amount).split(".");
  const paddedFrac = (frac + "0".repeat(decimals)).slice(0, decimals);
  const baseUnits = BigInt(whole + paddedFrac);

  const playerAta = await getAssociatedTokenAddress(
    mintPk,
    playerPk,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const treasuryAta = await getAssociatedTokenAddress(
    mintPk,
    treasuryPk,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const instructions: TransactionInstruction[] = [];

  // Create treasury ATA on-demand if it doesn't exist yet (player pays rent).
  try {
    await getAccount(connection, treasuryAta, "confirmed", TOKEN_2022_PROGRAM_ID);
  } catch (err) {
    if (
      err instanceof TokenAccountNotFoundError ||
      err instanceof TokenInvalidAccountOwnerError
    ) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          playerPk,
          treasuryAta,
          treasuryPk,
          mintPk,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      );
    } else {
      return apiError("Failed to check treasury token account", "CHAIN_ERROR", 502);
    }
  }

  instructions.push(
    createTransferCheckedInstruction(
      playerAta,
      mintPk,
      treasuryAta,
      playerPk,
      baseUnits,
      decimals,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  // Memo so the settlement worker can identify this payment.
  instructions.push(
    new TransactionInstruction({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from("boom-miner:mint", "utf8"),
    }),
  );

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer: playerPk,
    recentBlockhash: blockhash,
  }).add(...instructions);

  const serialized = tx.serialize({ requireAllSignatures: false }).toString("base64");

  return apiOk({
    transaction: serialized,
    decimals,
    mintCost: MINT_COST,
  });
}

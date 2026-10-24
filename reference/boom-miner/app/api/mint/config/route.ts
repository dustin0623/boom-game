import { apiOk, apiError } from "@/lib/api/error-response";
import { getWallet } from "@/lib/api/get-wallet";
import { config } from "@/lib/config/config";
import { getMintDecimals } from "@/lib/chain/solana/rpc";
import { MINT_COST } from "@/lib/constants/game";

/**
 * GET /api/mint/config
 *
 * Returns the public, chain-appropriate parameters the browser needs to build
 * a player → treasury mint payment. The response shape is chain-specific but
 * all fields are non-sensitive (no private keys, no server-only secrets).
 *
 * Solana:    treasury address (base58), SPL mint, live decimals, public RPC url
 * Robinhood: treasury address (0x…), ERC-20 address, token decimals
 * Hive:      treasury account name, token symbol, token precision, engine id
 */
export async function GET(req: Request): Promise<Response> {
  const wallet = await getWallet(req);
  if (!wallet) {
    return apiError("Not authenticated", "UNAUTHORIZED", 401);
  }

  const chain = config.blockchain.chain;

  // ----- Robinhood -----
  if (chain === "robinhood") {
    const rh = config.blockchain.robinhood;
    if (!rh.tokenAddress) {
      return apiError("ROBINHOOD_TOKEN_ADDRESS is not configured", "MINT_NOT_CONFIGURED", 500);
    }
    return apiOk({
      chain,
      treasury: config.blockchain.treasuryAddress,
      token:    rh.tokenAddress,
      decimals: rh.decimals,
      mintCost: MINT_COST,
    });
  }

  // ----- Hive -----
  if (chain === "hive") {
    const hive = config.blockchain.hive;
    if (!hive.tokenSymbol) {
      return apiError("HIVE_TOKEN_SYMBOL is not configured", "MINT_NOT_CONFIGURED", 500);
    }
    return apiOk({
      chain,
      treasury:       config.blockchain.treasuryAddress,
      token:          hive.tokenSymbol,
      decimals:       hive.precision,
      tokenPrecision: hive.precision,
      engineId:       hive.engineId,
      mintCost:       MINT_COST,
    });
  }

  // ----- Solana (default) -----
  const solana = config.blockchain.solana;
  if (!solana.mint) {
    return apiError("Server mint address is not configured", "MINT_NOT_CONFIGURED", 500);
  }

  // Fetch live decimals from the Token-2022 mint so the browser builds the
  // transfer with the correct base-unit amount regardless of the mint's decimals.
  let decimals: number;
  try {
    decimals = await getMintDecimals();
  } catch {
    return apiError("Failed to fetch mint decimals from chain", "CHAIN_ERROR", 502);
  }

  return apiOk({
    chain,
    treasury: config.blockchain.treasuryAddress,
    token:    solana.mint,
    decimals,
    mintCost: MINT_COST,
  });
}

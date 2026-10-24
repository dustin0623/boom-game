/**
 * Wallet: the player sends SOL or an SPL token from their browser wallet
 * (Phantom, Solflare, Backpack, MetaMask). A returned signature only proves
 * broadcast — the server must confirm with `validatePayment` before crediting.
 */
import { z } from "zod";
import bs58 from "bs58";
import type { Transaction } from "@solana/web3.js";
import { getSolanaClient, type SolanaClient } from "../../../client";
import { solanaChainConfig } from "@/lib/chains/modules/config";
import { buildTransferTransaction } from "../../../transfer-builder";
import { getInjectedSolanaProvider } from "../login/action";
import { SolanaWalletSchema, type SolanaWallet } from "../login/types";
import {
  SolanaAddressSchema,
  SolanaSymbolSchema,
  QuantitySchema,
  MetadataSchema,
  ok,
  fail,
  type SolanaActionResult,
} from "../../../types";

export const TransferTokenInput = z.object({
  /** The connected player address. */
  from: SolanaAddressSchema,
  wallet: SolanaWalletSchema.default("phantom"),
  to: SolanaAddressSchema,
  amount: QuantitySchema,
  /** "SOL" for native, otherwise the SPL mint address. */
  symbol: SolanaSymbolSchema.default("SOL"),
  /** Standardized game action, written into the memo. */
  action: z.string().trim().min(1).optional(),
  metadata: MetadataSchema,
  client: z.custom<SolanaClient>().optional(),
});

export type TransferTokenInput = z.input<typeof TransferTokenInput>;

export type WalletTransferResult = { signature: string; symbol: string; amount: string; from: string; to: string };

type MetaMaskSendFeature = {
  features: {
    "solana:signAndSendTransaction": {
      signAndSendTransaction: (input: {
        account: { address: string };
        transaction: Uint8Array;
        chain: string;
      }) => Promise<Array<{ signature: Uint8Array | string }>>;
    };
  };
};

/** Resolve a browser wallet function that signs and sends a transaction. */
async function walletSender(wallet: SolanaWallet, from: string): Promise<(tx: Transaction) => Promise<string>> {
  if (wallet === "metamask") {
    const { createSolanaClient } = await import("@metamask/connect-solana");
    const mmClient = await createSolanaClient({
      dapp: { name: solanaChainConfig.dappName, url: typeof window !== "undefined" ? window.location.origin : "" },
    });
    const mm = mmClient.getWallet() as unknown as MetaMaskSendFeature;
    if (!mm) throw new Error("MetaMask wallet not found. Install it from https://metamask.io/download.");
    return async (tx) => {
      const [result] = await mm.features["solana:signAndSendTransaction"].signAndSendTransaction({
        account: { address: from },
        transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
        chain: "solana:mainnet",
      });
      if (!result) throw new Error("MetaMask did not return a signature.");
      return typeof result.signature === "string" ? result.signature : bs58.encode(result.signature);
    };
  }

  const provider = getInjectedSolanaProvider(wallet);
  if (!provider.signAndSendTransaction) {
    throw new Error("This wallet cannot send transactions. Try Phantom, Solflare or Backpack.");
  }
  return async (tx) => (await provider.signAndSendTransaction!(tx)).signature;
}

export async function transferToken(input: TransferTokenInput): Promise<SolanaActionResult<WalletTransferResult>> {
  const parsed = TransferTokenInput.safeParse(input);
  if (!parsed.success) return fail(new Error(parsed.error.issues[0]?.message ?? "Invalid input"));

  const { from, wallet, to, amount, symbol, action, metadata } = parsed.data;
  const solana = parsed.data.client ?? getSolanaClient();

  try {
    const send = await walletSender(wallet, from);
    const tx = await buildTransferTransaction(solana, { payer: from, to, amount, symbol, action, metadata });
    const signature = await send(tx);
    return ok({ signature, symbol, amount, from, to });
  } catch (error) {
    return fail(error);
  }
}

import { createServerFn } from "@tanstack/react-start";
import { requirePlayer } from "@/lib/game/session/player.server";

const sessionInput = (input: { playerId?: string; token?: string }) => {
  if (typeof input?.playerId !== "string" || typeof input?.token !== "string")
    throw new Error("Invalid input");
  return { playerId: input.playerId, token: input.token };
};

/** Stable numeric destination tag so deposits can be matched to a player. */
function destinationTag(playerId: string): number {
  return parseInt(playerId.replace(/-/g, "").slice(0, 8), 16) % 4294967295;
}

export interface DepositInfo {
  /** Treasury address; null when deposits are not configured yet. */
  address: string | null;
  tag: number;
}

/** Where to send a deposit. The tag identifies the player on the treasury account. */
export const getDepositInfo = createServerFn({ method: "POST" })
  .inputValidator(sessionInput)
  .handler(async ({ data }): Promise<DepositInfo> => {
    const row = await requirePlayer(data.playerId, data.token);
    return {
      address: process.env["XRPL_TREASURY_ADDRESS"] ?? null,
      tag: destinationTag(row.id),
    };
  });

export interface WalletTransaction {
  id: string;
  action: string;
  status: string;
  amount: number;
  txHash: string | null;
  createdAt: string;
}

/** Recent pending + processed wallet transactions for the history tab. */
export const listWalletTransactions = createServerFn({ method: "POST" })
  .inputValidator(sessionInput)
  .handler(async ({ data }): Promise<WalletTransaction[]> => {
    const row = await requirePlayer(data.playerId, data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [pending, processed] = await Promise.all([
      supabaseAdmin
        .from("transactions_pending")
        .select("id, action, status, payload, created_at")
        .eq("player_id", row.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("transactions_processed")
        .select("id, action, status, tx_hash, result, created_at")
        .eq("player_id", row.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    const rows: WalletTransaction[] = [
      ...(pending.data ?? []).map((t) => ({
        id: t.id,
        action: t.action,
        status: t.status,
        amount: Number((t.payload as { amount?: number })?.amount ?? 0),
        txHash: null,
        createdAt: t.created_at,
      })),
      ...(processed.data ?? []).map((t) => ({
        id: t.id,
        action: t.action,
        status: t.status,
        amount: Number((t.result as { amount?: number })?.amount ?? 0),
        txHash: t.tx_hash,
        createdAt: t.created_at,
      })),
    ];
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
  });

/**
 * Queues a withdrawal of mined coins to the player's own wallet. The coin
 * debit and the queued payout happen in one atomic database transaction
 * (request_withdrawal); a worker picks up the pending row and sends the
 * on-chain payment.
 */
export const requestWithdrawal = createServerFn({ method: "POST" })
  .inputValidator((input: { playerId?: string; token?: string; amount?: number }) => {
    const base = sessionInput(input);
    const amount = Math.floor(Number(input.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount");
    return { ...base, amount };
  })
  .handler(async ({ data }): Promise<{ coins: number; transactionId: string }> => {
    const row = await requirePlayer(data.playerId, data.token);
    if (!row.wallet_address) throw new Error("No wallet linked to this account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: result, error } = await supabaseAdmin.rpc("request_withdrawal", {
      p_player_id: row.id,
      p_amount: data.amount,
      p_address: row.wallet_address,
    });
    if (error) {
      if (error.message.includes("not_enough_coins")) throw new Error("Not enough coins");
      throw new Error("Could not queue the withdrawal — try again");
    }
    const { coins, transaction_id } = result as { coins: number; transaction_id: string };
    return { coins: Number(coins), transactionId: transaction_id };
  });

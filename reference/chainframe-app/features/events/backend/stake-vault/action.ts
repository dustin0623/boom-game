import { playerRepository } from "@/lib/modules/players/server.repository";
import { logRepository } from "@/lib/modules/logs/server.repository";
import { z } from "zod";

/** Input schema for the `stake-vault` event — shared by the route and its tests. */
export const stakeVaultInput = z.object({ amount: z.number().positive() });

export type StakeVaultInput = z.infer<typeof stakeVaultInput>;

export interface StakeVaultResult {
  ok: boolean;
  vaultStaked?: number;
  error?: string;
}

/**
 * Stakes HASH into the vault (increases capacity, Luck, and Firewall — see
 * luckFromVault/firewallFromVault in features/types/game/stats.ts). This is
 * distinct from notoriety actions: staked HASH increments `vaultStaked`, while
 * notoriety is earned through raid, sabotage, and help according to game rules.
 */
export async function stakeVault(
  wallet: string,
  input: StakeVaultInput,
): Promise<StakeVaultResult> {
  const { amount } = input;
  if (amount <= 0) return { ok: false, error: "Amount must be positive" };

  const { ok } = await playerRepository.debitHash(wallet, amount);
  if (!ok) return { ok: false, error: "Not enough HASH" };

  await playerRepository.recordStake(wallet, amount);

  await logRepository.create({
    type: "vault",
    wallet,
    amount: -amount,
    data: { event: "stake", vaultStakedGain: amount },
  });

  return { ok: true, vaultStaked: amount };
}

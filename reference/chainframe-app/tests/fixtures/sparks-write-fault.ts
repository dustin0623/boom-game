import { vi } from "vitest";
import { PlayerModel } from "@/lib/modules/players/server.model";
import { playerRepository } from "@/lib/modules/players/server.repository";

/** Simulate a stale affordability read; the real database debit still sees zero. */
export function staleSparksBalance(wallet: string) {
  const original = playerRepository.findByWallet.bind(playerRepository);
  const spy = vi
    .spyOn(playerRepository, "findByWallet")
    .mockImplementation(async (account) => {
      const player = await original(account);
      return player && account === wallet ? { ...player, sparks: 100 } : player;
    });
  return () => spy.mockRestore();
}

/** Lose the acknowledgment after the real guarded SPARKS debit commits. */
export function loseSparksDebitAcknowledgment() {
  const original = PlayerModel.updateOne.bind(PlayerModel);
  const spy = vi.spyOn(PlayerModel, "updateOne").mockImplementation(((
    ...args: Parameters<typeof original>
  ) => {
    const query = original(...args);
    if ((args[1] as { $inc?: { sparks?: number } }).$inc?.sparks! < 0) {
      const execute = query.exec.bind(query);
      query.exec = async () => {
        await execute();
        throw new Error("Synthetic SPARKS acknowledgment loss");
      };
    }
    return query;
  }) as typeof PlayerModel.updateOne);
  return () => spy.mockRestore();
}

import { vi } from "vitest";
import { PlayerModel } from "@/lib/modules/players/server.model";
import type {
  ActiveRaid,
  RaidStage,
} from "@/features/types/game/raid-settlement";
import { LogModel } from "@/lib/modules/logs/server.model";
import { GameStatModel } from "@/lib/modules/game-stats/server.model";
import { ProcessedTransactionModel } from "@/lib/modules/transactions-processed/server.model";
import { createSeededRng } from "@/lib/utils/game/rng.server";

export function syntheticRaidSeed(clientSeed: string, success: boolean) {
  for (let index = 0; index < 100; index++) {
    const seed = `raid-test-${index}`;
    if (createSeededRng(`alice:bob:${clientSeed}:${seed}`)() < 0.5 === success)
      return seed;
  }
  throw new Error("Synthetic seed search exhausted");
}

export function interruptRaidWrite(
  stage: RaidStage,
  afterAcknowledgment: boolean,
) {
  const original = PlayerModel.updateOne.bind(PlayerModel);
  let interrupted = false;
  const spy = vi.spyOn(PlayerModel, "updateOne").mockImplementation(((
    ...args: Parameters<typeof original>
  ) => {
    const update = args[1] as { $set?: { activeRaid?: ActiveRaid } };
    if (
      !interrupted &&
      update.$set?.activeRaid?.steps.at(-1)?.stage === stage
    ) {
      interrupted = true;
      if (!afterAcknowledgment)
        return Promise.reject(new Error("synthetic raid write failure"));
      return original(...args).then(() => {
        throw new Error("synthetic lost acknowledgment");
      });
    }
    return original(...args);
  }) as typeof PlayerModel.updateOne);
  return { restore: () => spy.mockRestore(), interrupted: () => interrupted };
}

export function interruptRaidFinalization(
  stage: "log" | "counters" | "receipt" | "cleanup",
  afterAcknowledgment: boolean,
) {
  let interrupted = false;
  // Wrap the actual thenable: commit-then-throw tests acknowledgment loss, not rollback.
  const run = (matches: boolean, execute: () => PromiseLike<unknown>) => {
    if (!matches || interrupted) return execute();
    interrupted = true;
    if (!afterAcknowledgment)
      return Promise.reject(new Error("synthetic finalization failure"));
    return Promise.resolve(execute()).then(() => {
      throw new Error("synthetic lost finalization acknowledgment");
    });
  };
  let restore: () => void;
  if (stage === "receipt") {
    const original = ProcessedTransactionModel.create.bind(
      ProcessedTransactionModel,
    );
    const spy = vi
      .spyOn(ProcessedTransactionModel, "create")
      .mockImplementation(((...args: Parameters<typeof original>) =>
        run((args[0] as { type?: string }).type === "game_action", () =>
          original(...args),
        )) as typeof ProcessedTransactionModel.create);
    restore = () => spy.mockRestore();
  } else if (stage === "log") {
    const original = LogModel.findOneAndUpdate.bind(LogModel);
    const spy = vi
      .spyOn(LogModel, "findOneAndUpdate")
      .mockImplementation(((...args: Parameters<typeof original>) =>
        run(
          !!(args[0] as { settlementKey?: string }).settlementKey?.startsWith(
            "raid:",
          ),
          () => original(...args),
        )) as typeof LogModel.findOneAndUpdate);
    restore = () => spy.mockRestore();
  } else if (stage === "counters") {
    const original = GameStatModel.updateOne.bind(GameStatModel);
    const spy = vi
      .spyOn(GameStatModel, "updateOne")
      .mockImplementation(((...args: Parameters<typeof original>) =>
        run(!!(args[1] as { $inc?: object }).$inc, () =>
          original(...args),
        )) as typeof GameStatModel.updateOne);
    restore = () => spy.mockRestore();
  } else {
    const original = PlayerModel.updateOne.bind(PlayerModel);
    const spy = vi
      .spyOn(PlayerModel, "updateOne")
      .mockImplementation(((...args: Parameters<typeof original>) =>
        run(
          !!(args[1] as { $unset?: { activeRaid?: unknown } }).$unset
            ?.activeRaid,
          () => original(...args),
        )) as typeof PlayerModel.updateOne);
    restore = () => spy.mockRestore();
  }
  return { restore, interrupted: () => interrupted };
}

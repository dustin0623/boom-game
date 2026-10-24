import { getFixtureState } from "./persistence/store";

/** Component suites without queued gameplay use an explicitly empty queue. */
export async function* emptyGameQueue() {
  yield [];
}

export function fixtureGameplayQueue() {
  return {
    readQueuedGameBatches: emptyGameQueue,
    setGameDependencies: async () => {},
    getPendingGameEvent: async (key: string) =>
      getFixtureState().gameEvents.get(key) ?? null,
    setRaidStage: async () => {},
  };
}

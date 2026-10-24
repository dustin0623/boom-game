import { isDeepStrictEqual } from "node:util";
import { getFixtureState } from "./persistence/store";
import type {
  RaidSettlement,
  RaidStep,
} from "@/features/types/game/raid-settlement";
import { RaidEvidenceConflict } from "@/features/types/game/raid-settlement";

const journals = new WeakMap<object, Map<string, RaidSettlement>>();
const applied = new WeakMap<object, Map<string, RaidStep[]>>();
function journalStore() {
  const state = getFixtureState();
  if (!journals.has(state)) journals.set(state, new Map());
  return journals.get(state)!;
}
export const raidJournalFixture = {
  async readActiveRaid() {
    return null;
  },
  consumedEffects() {
    return [...journalStore().values()].map(
      (journal) =>
        (journal.inputs.defender as { statEffects?: object }).statEffects ?? {},
    );
  },
  async getPendingGameEvent(key: string) {
    return { raidSettlement: journalStore().get(key) };
  },
  async saveRaidSettlement(key: string, journal: RaidSettlement) {
    journalStore().set(key, structuredClone(journal));
  },
  async setRaidStage() {},
  async applyRaidStep(key: string, step: RaidStep) {
    const state = getFixtureState();
    if (!applied.has(state)) applied.set(state, new Map());
    const steps = applied.get(state)!.get(key) ?? [];
    if (steps.some((value) => isDeepStrictEqual(value, step))) return;
    const player = state.players.get(step.wallet) as unknown as Record<
      string,
      unknown
    >;
    for (const [field, value] of Object.entries(step.before)) {
      const parts = field.split(".");
      const parent =
        parts.length === 2
          ? (player.milestones as Record<string, unknown>)
          : player;
      if (!isDeepStrictEqual(parent[parts.at(-1)!] ?? null, value))
        throw new RaidEvidenceConflict("Raid precondition changed");
    }
    for (const [field, value] of Object.entries(step.after)) {
      const parts = field.split(".");
      const parent =
        parts.length === 2
          ? (player.milestones as Record<string, unknown>)
          : player;
      if (isDeepStrictEqual(value, { $raidAbsent: true }))
        delete parent[parts.at(-1)!];
      else parent[parts.at(-1)!] = value;
    }
    steps.push(structuredClone(step));
    applied.get(state)!.set(key, steps);
  },
};

import { describe, expect, it } from "vitest";
import { seedFixturePlayer } from "@/tests/fixtures/persistence/store";
import { resolvedPlayerStats } from "@/features/types/game/stats";
import { toPlayerDto } from "./player";

describe("profile Luck", () => {
  it.each([[0, 0], [1, 0.025]] as const)("derives Luck from stake %s instead of stale stored totals", (stake, luck) => {
    const player = seedFixturePlayer({ wallet: "alice", vaultStaked: stake });
    player.stats.luck = 99;
    expect(toPlayerDto(player).stats.luck).toBe(luck);
  });

  it("includes validated equipped Luck once without exposing equipment evidence", () => {
    const player = seedFixturePlayer({ wallet: "alice", vaultStaked: 1 });
    player.equipment.asicMiner = "gear";
    const gear = { id: "gear", slot: "asicMiner" as const, owner: "alice", equipped: true, salvaged: false, stats: { luck: 2 } };
    const dto = toPlayerDto(player, resolvedPlayerStats(player, [gear]));
    expect(dto.stats.luck).toBe(2.025);
    expect(dto).not.toHaveProperty("equipment");
    expect(dto).not.toHaveProperty("loginNonce");
  });
});

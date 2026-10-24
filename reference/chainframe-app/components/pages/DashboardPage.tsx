import { Flame, Vault } from "lucide-react";

import { PlayerLevelHeader } from "@/components/game/PlayerLevelHeader";
import { PageHeader } from "@/components/layout/PageHeader";
import { RigSlotsSection } from "@/components/game/RigSlotsSection";
import { StatUpgradeModal } from "@/components/modals/StatUpgradeModal";
import {
  StatTableModal,
  StatUpgradeCard,
  UpgradeTableModal,
} from "@/components/cards/StatUpgradeCard";
import { VaultCard } from "@/components/cards/VaultCard";
import { VaultStakeModal } from "@/components/modals/VaultStakeModal";
import { STAT_META } from "@/lib/config/constants/game";
import { RaidTable } from "@/components/tables/RaidTable";
import { ActiveEffectsSection } from "@/components/game/ActiveEffectsSection";
import {
  DERIVED_STAT_KEYS,
  EXPLOIT_TABLE,
  FIREWALL_TABLE,
  LUCK_TABLE,
  luckFromVault,
  UPGRADEABLE_STAT_KEYS,
  upgradeCost,
  statValueFromLevel,
  type BonusTable,
} from "@/features/types/game/stats";
import { useGameStats } from "@/hooks/useGameStats";
import { useNow } from "@/hooks/useNow";
import {
  miningPerSecond,
  msUntilNextDecayStep,
} from "@/features/types/game/mining";
import {
  formatMiningRate,
  formatHash,
  formatInt,
  formatPercent,
} from "@/lib/format";
import { statIcon } from "@/lib/icons";
import { notify } from "@/lib/notify";

import { useGameActionFlow } from "@/hooks/useGameActionFlow";
import { buildClaimAction } from "@/lib/utils/game/action-protocol";
import { useAuthStore } from "@/features/stores/authStore";
import { usePlayerStore } from "@/features/stores/playerStore";

const DERIVED_TABLES: Record<string, { table: BonusTable; unit: string }> = {
  luck: { table: LUCK_TABLE, unit: "HASH in vault" },
  firewall: { table: FIREWALL_TABLE, unit: "HASH in vault" },
  exploit: { table: EXPLOIT_TABLE, unit: "Notoriety" },
};

export function DashboardPage() {
  const {
    wallet,
    vault,
    capacity,
    fillPercent,
    perSecond,
    secondsToFull,
    total,
    gear,
    base,
    levels,
    claims,
    vaultStaked,
    notoriety,
    decay,
  } = useGameStats();
  const xp = usePlayerStore((state) => state.xp);
  const lastSinkAt = usePlayerStore((state) => state.lastSinkAt);

  const username = useAuthStore((state) => state.username);
  const {
    run: runClaim,
    reset: resetClaim,
    busy: claimBusy,
    unavailable: claimUnavailable,
    lifecycle: claimLifecycle,
    errorMessage: claimError,
  } = useGameActionFlow();
  const claiming =
    claimBusy ||
    claimLifecycle === "broadcast" ||
    claimLifecycle === "processed";
  const now = useNow(1000);

  const handleClaim = () => {
    if (claiming) return;
    if (claims.current <= 0) {
      notify("No claim charges left — one regenerates every 4 hours", "danger");
      return;
    }
    resetClaim();
    void executeClaim();
  };

  const executeClaim = async () => {
    if (claiming) return;
    await runClaim({ build: (nonce) => buildClaimAction({ nonce }) });
  };

  return (
    <div className="space-y-6">
      {claimError ? (
        <p role="alert" className="text-sm text-destructive">
          {claimError}
        </p>
      ) : null}
      {claimLifecycle === "broadcasting" ? (
        <p role="status" className="text-xs text-muted-foreground">
          Waiting for Hive Keychain approval…
        </p>
      ) : null}
      <PageHeader
        title="Dashboard"
        description="Overview of your rig, vault, permanent stats and raid targets."
      />
      <PlayerLevelHeader username={username ?? "Miner"} xp={xp} />

      <VaultCard
        vault={vault}
        capacity={capacity}
        fillPercent={fillPercent}
        perSecond={perSecond}
        secondsToFull={secondsToFull}
        onClaim={handleClaim}
        claiming={claiming}
        unavailable={claimUnavailable}
        charges={claims.current}
        maxCharges={claims.max}
        msUntilNextCharge={claims.msUntilNext}
        decay={decay}
        msUntilNextDecay={msUntilNextDecayStep(lastSinkAt, now)}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <StatUpgradeCard
          title="Vault size"
          value={formatHash(capacity, 4, false)}
          unit="HASH"
          icon={Vault}
          meta={
            <div className="space-y-1">
              <div>Stake HASH to boost Luck and Firewall bonuses.</div>
              <div className="flex items-center gap-1.5">
                <span className="text-primary">
                  +{formatHash(luckFromVault(vaultStaked), 4, false)}%
                </span>
                <span>Luck</span>
                <StatTableModal
                  title="Luck stats"
                  unitLabel="HASH in vault"
                  rows={LUCK_TABLE}
                  current={vaultStaked}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-primary">
                  +{formatHash(base.firewall - 1, 4, false)}%
                </span>
                <span>Firewall</span>
                <StatTableModal
                  title="Firewall stats"
                  unitLabel="HASH in vault"
                  rows={FIREWALL_TABLE}
                  current={vaultStaked}
                />
              </div>
            </div>
          }
          action={
            <VaultStakeModal
              wallet={wallet}
              vaultStaked={vaultStaked}
              hashRate={total.hashRate}
            />
          }
        />

        <StatUpgradeCard
          title="Notoriety"
          value={formatHash(notoriety, 4, false)}
          icon={Flame}
          meta={
            <div className="space-y-1">
              <div>
                Notoriety from raid outcomes unlocks Exploit and higher withdrawal limits.
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-primary">
                  +{formatHash(base.exploit - 1, 4, false)}%
                </span>
                <span>Exploit</span>
                <StatTableModal
                  title="Exploit stats"
                  unitLabel="Notoriety"
                  rows={EXPLOIT_TABLE}
                  current={notoriety}
                />
              </div>
            </div>
          }
        />
      </div>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Permanent stats</h2>
            <p className="text-xs text-muted-foreground">
              Upgrades are permanent and cost level squared HASH. Gear bonuses
              stack on top.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {UPGRADEABLE_STAT_KEYS.map((key) => {
            const level = levels[key];
            const baseValue = base[key];
            const bonus = gear[key];
            const derived =
              key === "hashRate"
                ? // At low levels perSecond is a small fraction (e.g. 0.00391);
                  // 2 decimals rounds that down to "0.00". Match the Vault
                  // card's precision (5 decimals) so the real rate is visible.
                  `${formatMiningRate(perSecond)} HASH/sec · ${formatHash(capacity, 4, false)} vault capacity`
                : key === "hackPower"
                  ? `Can raid targets with Security below ${formatHash(total[key], 4, false)}`
                  : `Blocks raiders with Hack Power up to ${formatHash(total[key], 4, false)}`;
            // Hash Rate's projection column must show the mine rate that
            // level would actually produce (server formula), not the raw
            // stat number — the level is already shown on the left side of
            // the row, so repeating it on the right adds no information.
            const formatValue =
              key === "hashRate"
                ? (lvl: number) =>
                    `${formatMiningRate(miningPerSecond(statValueFromLevel(key, lvl) + bonus) * 3600)}/h`
                : (lvl: number) =>
                    formatHash(statValueFromLevel(key, lvl) + bonus, 4, false);
            return (
              <StatUpgradeCard
                key={key}
                title={STAT_META[key].label}
                value={formatHash(total[key], 4, false)}
                icon={statIcon(key)}
                meta={
                  <div className="space-y-1">
                    <span className="inline-flex items-center gap-1.5">
                      Lv {formatInt(level)} · Base{" "}
                      {formatHash(baseValue, 4, false)} · Gear{" "}
                      <span className="text-success">
                        +{formatHash(bonus, 4, false)}
                      </span>
                      <UpgradeTableModal
                        title={`${STAT_META[key].label} upgrades`}
                        currentLevel={level}
                        computeCost={upgradeCost}
                        formatValue={formatValue}
                      />
                    </span>
                    <div>{derived}</div>
                  </div>
                }
                action={
                  <StatUpgradeModal
                    statKey={key}
                    label={STAT_META[key].label}
                    currentLevel={level}
                    gearBonus={bonus}
                    wallet={wallet}
                  />
                }
              />
            );
          })}
          {DERIVED_STAT_KEYS.map((key) => {
            const source = DERIVED_TABLES[key] ?? {
              table: LUCK_TABLE,
              unit: "HASH in vault",
            };
            const current = key === "exploit" ? notoriety : vaultStaked;
            return (
              <StatUpgradeCard
                key={key}
                title={STAT_META[key].label}
                value={formatPercent(total[key], 4)}
                icon={statIcon(key)}
                meta={
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      {key === "luck" ? `Stake +${formatPercent(luckFromVault(vaultStaked), 4)}` : `Base ${formatPercent(base[key], 4)}`} · Gear{" "}
                      <span className="text-success">
                        +{formatPercent(gear[key], 4)}
                      </span>
                      <StatTableModal
                        title={`${STAT_META[key].label} stats`}
                        unitLabel={source.unit}
                        rows={source.table}
                        current={current}
                      />
                    </div>
                    <div>
                      {key === "exploit"
                        ? `${formatHash(notoriety, 4, false)} Notoriety — earned through raid outcomes`
                        : `${formatHash(vaultStaked, 4, false)} HASH staked — increase vault to raise`}
                    </div>
                  </div>
                }
              />
            );
          })}
        </div>
      </section>

      <ActiveEffectsSection />

      <RigSlotsSection />

      <RaidTable />
    </div>
  );
}

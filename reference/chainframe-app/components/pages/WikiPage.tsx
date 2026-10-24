import { registrationStarterItems, describeShopItems } from "@/features/types/game/inventory";
import { REGISTRATION_STARTER_STARTS_AT } from "@/lib/config/constants/game";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpen, CheckCircle2 } from "lucide-react";
import { WikiNavigation } from "@/components/wiki/WikiNavigation";
import { Button } from "@/components/ui/button";
import {
  CHARGE_REGEN_MS,
  DECAY_FLOOR,
  DECAY_GRACE_DAYS,
  DECAY_PER_WEEK,
  EQUIPMENT_CHEST_BASE_PRICE,
  EQUIPMENT_CHEST_HIVE_PRICE,
  EQUIPMENT_CHEST_ODDS,
  HASHRATE_SOFTCAP,
  HASHRATE_SOFTCAP_RATE,
  MARKET_FEE_BPS,
  MAX_CLAIM_CHARGES,
  MAX_RAID_CHARGES,
  RARITY_INDEX,
  RARITY_KEYS,
  RARITY_META,
  REGISTRATION_FEE_HIVE,
  REGISTRATION_STARTING_HASH,
  RIVAL_RAID_COOLDOWN_MS,
  SLOT_KEYS,
  SLOT_META,
  STAT_META,
  VAULT_BASE_CAPACITY,
  UPGRADE_TARGET_SECONDS,
} from "@/lib/config/constants/game";
import { SOCIAL_ECONOMY } from "@/lib/config/constants/economy";
import { LEADERBOARD_WEIGHTS } from "@/lib/api/types";
import {
  CONSUMABLE_HIVE_PRICE,
  CONSUMABLES,
} from "@/features/types/game/consumables";
import { miningPerSecond, vaultCapacity } from "@/features/types/game/mining";
import { totalUpgradeCost, upgradeCost } from "@/features/types/game/stats";
import { UPGRADE_MULTIPLIER, UPGRADE_RATE } from "@/features/types/game/items";
import {
  XP_PER_HASH,
  XP_PER_SPARK,
  xpForLevel,
} from "@/features/types/game/level";
import {
  getEmissionShopPrice,
  getMarketAmounts,
} from "@/lib/utils/game/pricing";
import {
  formatHash,
  formatInt,
  formatMiningRate,
  formatPercent,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const sections = [
  { id: "getting-started", label: "Start playing" },
  { id: "resources", label: "Currencies & balances" },
  { id: "mining", label: "Mining & upgrades" },
  { id: "gear", label: "Equipment" },
  { id: "raiding", label: "Raids & effects" },
  { id: "market", label: "Shop & marketplace" },
  { id: "wallet", label: "Deposits & withdrawals" },
  { id: "progress", label: "Progress & history" },
  { id: "reference", label: "Reference & help" },
] as const;

function Section({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      tabIndex={-1}
      className="scroll-mt-24 space-y-5 border-t border-border pt-8 first:border-0 first:pt-0"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 font-mono text-xs text-primary"
        >
          {number}
        </span>
        <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight">
          {title}
        </h2>
      </div>
      <div className="space-y-4 text-sm leading-7 text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
function GuideTable({
  caption,
  headings,
  rows,
}: {
  caption: string;
  headings: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-sm leading-6">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/30 text-xs text-muted-foreground">
          <tr>
            {headings.map((heading) => (
              <th key={heading} scope="col" className="px-4 py-3 font-medium">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-border/60">
              {row.map((value, column) =>
                column === 0 ? (
                  <th
                    key={column}
                    scope="row"
                    className="px-4 py-3 font-medium text-foreground"
                  >
                    {value}
                  </th>
                ) : (
                  <td key={column} className="px-4 py-3">
                    {value}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Details({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="rounded-xl border border-border bg-card/40 px-4 py-3">
      <summary className="cursor-pointer font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {title}
      </summary>
      <div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground">
        {children}
      </div>
    </details>
  );
}
function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside
      aria-label={title}
      className="rounded-xl border border-primary/20 bg-primary/5 p-4"
    >
      <p className="mb-1 font-semibold text-foreground">{title}</p>
      {children}
    </aside>
  );
}

/** Public player guide. Examples reuse shared calculations; no game reads or writes. */
export function WikiPage() {
  const regenHours = CHARGE_REGEN_MS / 3_600_000;
  const freshRate = miningPerSecond(1);
  const marketExample = getMarketAmounts(0.1);
  return (
    <div className="min-w-0 space-y-8 pb-16 pt-4">
      <header className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-background p-6 sm:p-8">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
          <BookOpen className="size-4" />
          Chainframe Wiki
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Your guide to the game
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
          Build your rig, claim its HASH, and compete with other miners. Start
          with the basics, then explore equipment, trading and the rules behind
          each action.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/dashboard">
              Start playing
              <ArrowUpRight className="ml-2 size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <a href="#getting-started">Read the quick start</a>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Hive Keychain required · One-time registration:{" "}
          {formatHash(REGISTRATION_FEE_HIVE, 3)} HIVE · This guide is public
        </p>
      </header>
      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <WikiNavigation sections={sections} />
        <div className="min-w-0 space-y-10">
          <Section id="getting-started" number="01" title="Start playing">
            <p>
              Your Hive account is your game identity. Signing in proves wallet
              ownership; paid registration enables gameplay.
            </p>
            <ol className="space-y-3 pl-5 marker:font-semibold marker:text-primary list-decimal">
              <li>
                <strong className="text-foreground">
                  Connect with Hive Keychain.
                </strong>{" "}
                Use your Hive username and approve the login signature. There is
                no separate game username to choose.
              </li>
              <li>
                <strong className="text-foreground">
                  Register through the app.
                </strong>{" "}
                Approve the one-time {formatHash(REGISTRATION_FEE_HIVE, 3)} HIVE
                payment. Once registration is confirmed, you receive{" "}
                {formatHash(REGISTRATION_STARTING_HASH)} spendable HASH as your
                starting balance. Login alone does not grant it.
              </li>
              <li>
                <strong className="text-foreground">Limited-time starter pack.</strong>{" "}
                For qualifying new registrations after the offer goes live, a verified payment from 19 October 2026, 8:00 AM Singapore (00:00 UTC), before 2 November 2026, 8:00 AM Singapore (00:00 UTC), also awards {registrationStarterItems(REGISTRATION_STARTER_STARTS_AT).map(({ itemId, quantity }) => describeShopItems(itemId, quantity)).join(", ")}. Find them in Inventory → Items and open chests individually. Delayed confirmation does not change payment-time eligibility. Earlier completed registrations receive no retrospective award. Discord invite rankings are separate and do not gate this package.
              </li>
              <li>
                <strong className="text-foreground">Open Dashboard.</strong>{" "}
                Your starting Hash Rate level is 1. Mining fills your vault;
                claim it to receive spendable game HASH.
              </li>
              <li>
                <strong className="text-foreground">
                  Buy your first stat upgrade.
                </strong>{" "}
                Hash Rate level 1 → 2 costs {formatHash(upgradeCost(1))} HASH.
                Hack Power and Security upgrades use the same current-level
                pricing.
              </li>
              <li>
                <strong className="text-foreground">Build from there.</strong>{" "}
                Use Inventory to manage equipment and consumables, Shop to buy
                them, and Marketplace to trade gear.
              </li>
            </ol>
            <GuideTable
              caption="Page access requirements"
              headings={["Access", "Pages"]}
              rows={[
                ["Public", "Homepage and Wiki"],
                [
                  "Signed in",
                  "Marketplace and Leaderboard, including before registration",
                ],
                [
                  "Signed in and registered",
                  "Dashboard, Inventory, Shop and Profile; marketplace purchases also require registration",
                ],
              ]}
            />
            <Note title="A broadcast is only the first step">
              <p>
                Keychain success means your request was submitted. The app opens
                Submitted while the backend checks and processes it. Game state
                changes after authoritative confirmation.
              </p>
            </Note>
          </Section>

          <Section id="resources" number="02" title="Currencies & balances">
            <p>
              Check which balance an action spends. Your Hive wallet, spendable
              game HASH and unclaimed vault are separate.
            </p>
            <GuideTable
              caption="Game currencies and resources"
              headings={["Resource", "How you receive it", "What it is for"]}
              rows={[
                [
                  "Wallet HASH",
                  "Hive Engine token balance",
                  "Depositing into the game or receiving a paid withdrawal",
                ],
                [
                  "Game HASH",
                  "Vault claims, settled deposits and referral rewards",
                  "Permanent upgrades, vault staking and HASH shop purchases",
                ],
                [
                  "Vault HASH",
                  "Mining and successful raid credits",
                  "Claiming into game HASH; exposed to raids",
                ],
                ["SPARKS", "Salvaging equipment", "Upgrading equipment"],
                [
                  "HIVE",
                  "Native Hive wallet balance",
                  "Registration, fixed-price shop payments and marketplace trading",
                ],
                [
                  "Notoriety",
                  "HASH actually credited from raids, or defending against a failed raid",
                  "Competitive ranking and withdrawal capacity",
                ],
                [
                  "Experience (XP)",
                  "Stat upgrades, salvage, equipment value gains and raid wins",
                  "Player-level badges and progression ranking",
                ],
              ]}
            />
            <p>
              Claiming moves HASH from your vault into your game balance.
              Withdrawing moves game HASH back to your Hive wallet after payout.
              SPARKS have no external transfer flow.
            </p>
          </Section>

          <Section id="mining" number="03" title="Mine, claim and upgrade">
            <p>
              Mining fills your vault until it reaches capacity. Additional
              output cannot be stored in a full vault. The live counter is a
              projection; completed actions settle the authoritative amount.
            </p>
            <Note title="Your starting rig">
              <p>
                At level 1 and full mining strength:{" "}
                {formatMiningRate(freshRate)} HASH/second, or{" "}
                {formatHash(freshRate * 86400)} HASH/day before capacity limits.
                An unstaked vault holds {formatHash(vaultCapacity(0))} HASH and
                fills in about {formatHash(vaultCapacity(0) / freshRate / 3600)}{" "}
                hours.
              </p>
            </Note>
            <h3 className="text-base font-semibold text-foreground">
              Claims and charges
            </h3>
            <p>
              A claim moves the entire available vault into spendable game HASH,
              consumes one claim charge and clears your active stat effects. You
              can hold {MAX_CLAIM_CHARGES} claim charges; one regenerates every{" "}
              {regenHours} hours. Empty-vault claims are rejected.
            </p>
            <h3
              id="staking"
              className="scroll-mt-24 text-base font-semibold text-foreground"
            >
              Increase vault capacity
            </h3>
            <p>
              Increase Vault spends game HASH and permanently adds it to your
              vault stake. Capacity is rounded to a whole number, so a
              fractional stake may not immediately increase capacity. There is
              no unstake action, and staking awards no XP.
            </p>
            <p>
              Player Luck comes from permanent vault stake and equipped gear.
              Sabotage and Help add a separate 25% base success chance to your
              Luck, capped at 100%. Firewall also includes staking and gear bonuses.
            </p>
            <h3
              id="stats"
              className="scroll-mt-24 text-base font-semibold text-foreground"
            >
              Permanent stat upgrades
            </h3>
            <p>
              Dashboard offers upgrades for Hash Rate, Hack Power and Security.
              Each step costs the{" "}
              <strong className="text-foreground">current level squared</strong>
              , with a minimum of 1 HASH. Bulk purchases add those individual
              steps.
            </p>
            <GuideTable
              caption="Permanent stat upgrade examples"
              headings={["Upgrade", "HASH spent", "XP earned"]}
              rows={[
                [1, 1],
                [2, 1],
                [1, 2],
                [1, 3],
                [5, 2],
              ].map(([from, count]) => {
                const cost = totalUpgradeCost(from, count);
                return [
                  `Level ${from} → ${from + count}`,
                  formatHash(cost),
                  formatInt(Math.round(cost * XP_PER_HASH)),
                ];
              })}
            />
            <Details title="What each stat does">
              <GuideTable
                caption="Stat roles in the current implementation"
                headings={["Stat", "Role"]}
                rows={[
                  [
                    STAT_META.hashRate.label,
                    "Sets mining output, with softcap, decay and active Hash Rate effects.",
                  ],
                  [
                    STAT_META.hackPower.label,
                    "Must strictly exceed defender Security to allow a raid.",
                  ],
                  [
                    STAT_META.security.label,
                    "Prevents raid eligibility when it equals or exceeds attacker Hack Power.",
                  ],
                  [
                    STAT_META.luck.label,
                    "Vault-staking plus equipped gear bonuses. Sabotage and Help success chance is 25% plus your Luck, capped at 100%.",
                  ],
                  [
                    STAT_META.firewall.label,
                    "Percentage chance to block an eligible incoming raid.",
                  ],
                  [
                    STAT_META.exploit.label,
                    "Raid-only critical chance from Notoriety and gear; criticals double the rolled stolen percentage.",
                  ],
                ]}
              />
            </Details>
            <Details title="Mining softcap and inactivity">
              <p>
                Hash Rate above {HASHRATE_SOFTCAP} contributes at{" "}
                {formatPercent(HASHRATE_SOFTCAP_RATE * 100)} of the additional
                value. Mining retains full strength for {DECAY_GRACE_DAYS} days
                after the activity timestamp resets. The first weekly reduction
                occurs on day {DECAY_GRACE_DAYS + 7}; subsequent weeks multiply
                output by {DECAY_PER_WEEK}, down to{" "}
                {formatPercent(DECAY_FLOOR * 100)}.
              </p>
              <p>
                Currently, claims, permanent stat upgrades, vault stakes,
                registration and HIVE shop grants reset this clock. Merely
                opening a page does not. HASH shop purchases and equipment
                upgrades currently do not reset it.
              </p>
            </Details>
          </Section>

          <Section id="gear" number="04" title="Manage equipment">
            <p>
              Buy Equipment Chests in Shop and keep them in Inventory. Open one
              owned chest at a time to mint gear with a random slot, rarity and
              rolled stats, without another payment. Luck applies when opening.
              Each equipment starts at level 1. Your rig has six slots:
            </p>
            <Note title="Find your items and equipment">
              Inventory opens on Items, showing the chests and consumables you
              own. Open one chest there to find gear. The Equipment tab has your
              gear, filters, and Equip, Upgrade, Salvage and Sell actions.
              Listed gear is managed through Marketplace → My listings. Visit
              Shop buys more stock; Refresh reloads your inventory. If a refresh
              fails, cached data is marked stale and actions pause until it is
              available.
            </Note>
            <div className="flex flex-wrap gap-2">
              {SLOT_KEYS.map((slot) => (
                <span
                  key={slot}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground"
                >
                  {SLOT_META[slot].label}
                </span>
              ))}
            </div>
            <p>
              Equipping an item replaces the current item in its slot. Listed,
              reserved or salvaged gear cannot be used as available equipment.
              Cancel an available listing before equipping, upgrading or
              salvaging it. Equipped bonuses affect mining and combat. Mining is
              settled at the previous rate before equipment changes.
            </p>
            <GuideTable
              caption="Equipment rarity and base chest odds"
              headings={[
                "Rarity",
                "Distinct stats",
                "Unscaled roll",
                "Base chance",
              ]}
              rows={RARITY_KEYS.map((rarity) => {
                const index = RARITY_INDEX[rarity];
                return [
                  <span
                    key={rarity}
                    className={cn(
                      "font-semibold",
                      RARITY_META[rarity].textClass,
                    )}
                  >
                    {RARITY_META[rarity].label}
                  </span>,
                  rarity === "epic" ? "4 or 5 (50/50)" : String(index),
                  rarity === "epic"
                    ? "0.4–4 or 0.5–5"
                    : `${formatHash(index / 10)}–${index}`,
                  formatPercent(EQUIPMENT_CHEST_ODDS[rarity]),
                ];
              })}
            />
            <p>
              Hack Power and Security rolls use a ×10 scale. An item never
              repeats a stat. ASIC Miners guarantee a Hash Rate roll, Network
              Modules Hack Power, and Cooling Systems Security. The odds above
              are fixed; Luck never changes chest rarity.
            </p>
            <h3
              id="upgrades"
              className="scroll-mt-24 text-base font-semibold text-foreground"
            >
              Upgrade with SPARKS
            </h3>
            <p>
              Each successful equipment level multiplies its rolled stats by{" "}
              {UPGRADE_MULTIPLIER}, a{" "}
              {formatPercent((UPGRADE_MULTIPLIER - 1) * 100)} increase rounded
              to four decimals. The cost uses the item&apos;s current salvage
              value and level, rather than permanent-stat pricing.
            </p>
            <h3 className="text-base font-semibold text-foreground">
              Salvage for SPARKS
            </h3>
            <p>
              Salvaging an available, unequipped item removes it from your
              inventory and credits its current salvage value in SPARKS. This
              cannot be undone. Check the displayed payout before submitting.
            </p>
            <Details title="Equipment cost and salvage formulas">
              <pre className="overflow-x-auto rounded-lg bg-muted/30 p-3 font-mono text-xs leading-6 text-foreground">{`Salvage value = 0.5 × Hack Power + 0.5 × Security\n              + 5 × Hash Rate + 5 × Firewall\n              + 5 × Exploit + 10 × Luck\nUpgrade cost = salvage value × ${UPGRADE_RATE} × current item level`}</pre>
              <p>
                Equipment upgrade XP is based on the increase in salvage value,
                at {XP_PER_SPARK} XP per SPARK of value gained, rounded per
                level. Salvage awards {XP_PER_SPARK} XP per SPARK credited,
                rounded to an integer.
              </p>
            </Details>
          </Section>

          <Section id="raiding" number="05" title="Raid and use consumables">
            <p>
              A raid risks your unclaimed vault to steal from another
              player&apos;s vault. Game HASH already claimed into a liquid
              balance is not raid loot. You cannot raid yourself.
            </p>
            <GuideTable
              caption="Raid outcomes"
              headings={["Outcome", "What happens"]}
              rows={[
                [
                  "Successful raid",
                  "HASH leaves the defender's vault. Your free vault space limits the actual credit; excess is destroyed. You gain Notoriety equal to the actual credit and 10 XP.",
                ],
                [
                  "Failed raid",
                  "A rolled share of your own vault is destroyed, preserving fractional HASH. The defender gains Notoriety equal to the actual deduction, not a HASH payment.",
                ],
                [
                  "Protected target",
                  "No HASH is transferred. A blocked attempt is distinct from a failed success roll.",
                ],
              ]}
            />
            <p>
              The base exposed share ranges from{" "}
              {formatPercent(SOCIAL_ECONOMY.raidExposureMin * 100)} to{" "}
              {formatPercent(SOCIAL_ECONOMY.raidExposureMax * 100)}. A critical
              can double it, up to the full vault. Transfers round down to six
              decimal places and display up to four. A successful roll can still
              credit zero when your vault is full or loot is below settlement precision.
            </p>
            <p>
              Raid attempts use charges. The current worker uses a maximum of{" "}
              {MAX_RAID_CHARGES}, regenerating one every {regenHours} hours. A
              landed raid protects the defender for{" "}
              {RIVAL_RAID_COOLDOWN_MS / 1000} seconds. Leave free space in your
              vault if you want to collect raid proceeds.
            </p>
            <h3
              id="social"
              className="scroll-mt-24 text-base font-semibold text-foreground"
            >
              Sabotage Devices and Help Kits
            </h3>
            <p>
              Each use consumes one owned unit and targets another player&apos;s
              Hash Rate, Hack Power or Security. Sabotage reduces that
              stat&apos;s strength; Help counters an existing Sabotage on that
              stat. Protected players cannot receive new Sabotage.
            </p>
            <p>
              You cannot help a player while any Sabotage you applied to them
              remains active, even on a different stat. Other players can still
              help them. You can help again once all your Sabotage on that
              player is fully countered or cleared by their claim or a raid. A
              rejected Help attempt does not consume a Help Kit.
            </p>
            <p>
              Strength is rolled between{" "}
              {formatPercent(SOCIAL_ECONOMY.statEffects.strengthMin * 100)} and{" "}
              {formatPercent(SOCIAL_ECONOMY.statEffects.strengthMax * 100)},
              after a successful Luck roll. There are no new social criticals.
              Each valid attempt consumes one item even when its Luck roll fails;
              failed rolls change no effects.
              Each stat can have one active Sabotage. Help subtracts from its
              remaining strength; it does not raise the stat above its base
              value.
            </p>
            <Note title="Effects have no timed expiry">
              <p>
                Effects clear when the affected player claims their vault or is
                raided. Applying Help or Sabotage awards no immediate HASH, XP
                or Notoriety. Your Active effects are on Dashboard; owned
                consumables are in Inventory.
              </p>
            </Note>
            <Details title="Shared raid calculation">
              <pre className="overflow-x-auto rounded-lg bg-muted/30 p-3 font-mono text-xs leading-6 text-foreground">{`Eligibility: affected total Hack Power > affected total Security\nEligible success chance = 100% − clamp(defender total Firewall, 0%, 100%)\nCritical chance = clamp(attacker total Exploit, 0%, 100%)\nCritical stolen percentage = 2 × rolled stolen percentage`}</pre>
              <p>
                Equipment contributes to the corresponding totals. Stronger
                players can still be sabotaged even when you cannot raid them.
                Use recorded outcomes to see what settled.
                Private execution seeds are not published in Histories, so it is
                not a public seed-verification tool.
              </p>
            </Details>
          </Section>

          <Section id="market" number="06" title="Shop and trade">
            <h3
              id="chests"
              className="scroll-mt-24 text-base font-semibold text-foreground"
            >
              Shop purchases
            </h3>
            <p>
              Shop sells the Equipment Chest, Sabotage Devices and Help Kits.
              HASH purchases spend game HASH. HIVE purchases use your native
              Hive wallet balance.
            </p>
            <p>
              Shop shows chests and consumables together. Cards show current
              price, owned quantity and a purchase quantity of 1–25. Use the
              info button to flip the card to base rarity odds, then Back to
              purchase. Buying with HASH or HIVE adds owned chests; it does not
              open them. Inventory&apos;s Open one reveals equipment only after
              authoritative confirmation and an inventory refresh.
            </p>
            <GuideTable
              caption="Shop payment choices"
              headings={["Product", "Base HASH price", "Fixed HIVE price"]}
              rows={[
                [
                  "Equipment Chest",
                  `${EQUIPMENT_CHEST_BASE_PRICE} HASH`,
                  `${EQUIPMENT_CHEST_HIVE_PRICE} HIVE`,
                ],
                ...Object.values(CONSUMABLES).map((item) => [
                  item.name,
                  `${item.basePrice} HASH`,
                  `${CONSUMABLE_HIVE_PRICE} HIVE`,
                ]),
              ]}
            />
            <p>
              HASH prices use the highest completed UTC day&apos;s recorded
              claims above{" "}
              {formatInt(SOCIAL_ECONOMY.pricing.emissionThresholdPerDay)} HASH.
              They are shared by all players, round half-up to whole HASH and do
              not decrease with lower later days. Today&apos;s claims do not
              immediately change today&apos;s tier. HIVE shop prices stay fixed.
            </p>
            <p>
              Check current prices in Shop and{" "}
              <strong className="text-foreground">Pricing excess</strong> in
              Game activity → Stats. A stale quote is rejected before spending;
              refresh the quote and review it before submitting again.
            </p>
            <h3 className="text-base font-semibold text-foreground">
              Marketplace uses HIVE
            </h3>
            <p>
              Browse shows all available listings, including yours. My listings
              shows only your gear. Search by name and filter by slot, rarity or
              maximum HIVE price; on mobile, expand Filters for these controls.
              Sort by listing date, price, power or item level. Check your
              native HIVE balance in the header and use Refresh to reload it
              with the listings. Marketplace activity and global sales are under
              avatar → Histories.
            </p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                List available, unequipped gear at a manually chosen HIVE price,
                with at most three decimals.
              </li>
              <li>
                The buyer sends native HIVE to the configured market account
                through the app.
              </li>
              <li>
                The backend verifies the payment and reserves that exact
                listing. The seller keeps ownership until their payout is
                verified.
              </li>
              <li>
                The seller receives the price less a{" "}
                {formatPercent(MARKET_FEE_BPS / 100)} fee; the verified
                settlement completes ownership transfer.
              </li>
            </ol>
            <Note title="An exact fee example">
              <p>
                A 0.1 HIVE sale retains {formatHash(marketExample.fee, 3)} HIVE
                and pays {formatHash(marketExample.proceeds, 3)} HIVE to the
                seller. The fee rounds down to the nearest 0.001 HIVE.
              </p>
            </Note>
            <p>
              Signed-in wallets may browse Marketplace before registering, but
              purchases and listing changes require registration. Unavailable or
              ineligible verified purchases follow the refund workflow. Pending
              or uncertain payouts/refunds are not automatically rebroadcast.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/marketplace">
                Browse marketplace
                <ArrowUpRight className="ml-2 size-3.5" />
              </Link>
            </Button>
          </Section>

          <Section id="wallet" number="07" title="Deposit and withdraw HASH">
            <h3 className="text-base font-semibold text-foreground">
              Deposit from your Hive wallet
            </h3>
            <p>
              Open the wallet controls, enter a positive whole-HASH amount and
              approve the app&apos;s Keychain transfer to treasury. The app
              tracks the submission automatically. The backend verifies the
              token transfer before crediting game HASH; there is no manual
              transaction-signature submission step.
            </p>
            <h3 className="text-base font-semibold text-foreground">
              Withdraw to your Hive wallet
            </h3>
            <p>
              Request a positive whole-HASH amount from your game balance. A
              confirmed request reserves/debits game HASH and queues the payout.{" "}
              <strong className="text-foreground">
                Withdrawal queued does not mean withdrawal paid.
              </strong>{" "}
              The later financial outcome records the payout.
            </p>
            <p>
              Available withdrawal capacity is based on Notoriety: floor(
              {SOCIAL_ECONOMY.baseWithdrawal} + Notoriety ×{" "}
              {SOCIAL_ECONOMY.withdrawalNotorietyRate}) HASH in the current
              24-hour window, less what has already been reserved or withdrawn.
              The rolling window is not a UTC-midnight reset.
            </p>
            <Note title="If a payout is delayed">
              <p>
                Definitive payout failure can restore the reserved game HASH
                once. Missing IDs, RPC failures and unknown broadcasts do not
                prove failure; they remain unresolved for verification. Do not
                submit a second payment just because the first is taking longer.
              </p>
            </Note>
          </Section>

          <Section id="progress" number="08" title="Follow your progress">
            <h3 className="text-base font-semibold text-foreground">
              Know where to look
            </h3>
            <GuideTable
              caption="Activity, history and statistics views"
              headings={["View", "What it tells you"]}
              rows={[
                [
                  "Submitted",
                  "Your current wallet session's locally broadcast requests awaiting confirmation. Missing IDs and timeouts remain uncertain.",
                ],
                [
                  "Recent history",
                  "Recent activity and market outcomes, published through personal confirmation.",
                ],
                [
                  "Avatar menu → Histories",
                  "Latest 100 logs per selection, starting with Claims. Outgoing raids are green and incoming raids red. Personal market actions and global sales are separate.",
                ],
                [
                  "Game activity → Stats",
                  "The default activity tab: registered players, current mining output, pricing excess and completed lifetime activity. The Activity button badge counts your ongoing submissions.",
                ],
                [
                  "Daily graphs",
                  "Click a historical Stats metric for UTC daily bars over 7, 30 or 90 days. Today is partial.",
                ],
              ]}
            />
            <p>
              Current HASH/day in Stats is an estimate at current mining rates,
              independent of vault fullness. Claimed HASH and claim-based
              pricing excess are different measures. Mining history is not
              stored or graphed.
            </p>
            <h3
              id="leveling"
              className="scroll-mt-24 text-base font-semibold text-foreground"
            >
              Experience and player level
            </h3>
            <p>
              Permanent stat upgrades award {XP_PER_HASH} XP per HASH spent.
              Salvage and equipment upgrades use value-based XP; a successful
              raid awards 10 XP. Claims, chest purchases, staking, deposits and
              consumable effects do not directly award XP.
            </p>
            <p>
              Player level comes from cumulative experience: level 2 begins at{" "}
              {formatInt(xpForLevel(2))} XP and level 3 at{" "}
              {formatInt(xpForLevel(3))} XP. It appears in the badge beside your
              name. It is separate from an individual stat or equipment level.
            </p>
            <h3 className="text-base font-semibold text-foreground">
              Leaderboard
            </h3>
            <p>
              Registered players are ranked by a combined result:{" "}
              {LEADERBOARD_WEIGHTS.notoriety} points for Notoriety,{" "}
              {LEADERBOARD_WEIGHTS.mining} for current mining output and{" "}
              {LEADERBOARD_WEIGHTS.progression} for total XP. Each contribution
              compares your value with that category&apos;s highest registered
              player. A zero maximum contributes zero.
            </p>
            <p>
              The table shows mining level (Minerate), Notoriety and Experience,
              with a player-level badge. The score is hidden; mining ranking
              still uses current HASH/second, including decay and effects. Equal
              scores share competition ranks such as 1, 1, 3. The first 100 are
              paginated in groups of 25, with your own rank shown separately
              even below the top 100. Stats and Leaderboard may reuse a
              completed snapshot for 60 seconds; check the update timestamp.
            </p>
            <h3
              id="cosmetics"
              className="scroll-mt-24 text-base font-semibold text-foreground"
            >
              Cosmetics and referrals
            </h3>
            <p>
              Default avatar, banner and background are available from the
              start. Other catalog entries have level requirements; current
              stored-level authorization can differ from the XP-derived badge,
              as explained below.
            </p>
            <p>
              Open your inviter&apos;s referral link and sign in before your first
              registration payment. An existing unregistered account without a
              referrer can also accept the link before payment records exist.
              Existing referrals cannot be replaced. Your referrer earns 5% of your first successful
              paid registration and every Shop purchase, including chests,
              Sabotage Devices and Help Kits, in the currency paid. HASH rewards
              credit their in-game balance; HIVE rewards go directly to their
              Hive wallet from treasury, rounded down to 0.001 HIVE. For example,
              75 HIVE registration pays 3.75 HIVE; a 1 HASH purchase pays 0.05 HASH.
              Registration and purchased stock confirm independently of a delayed
              HIVE referral payout. Marketplace trades and opening owned chests
              earn no reward. Rewards do not increase your quoted price.
            </p>
          </Section>

          <Section id="reference" number="09" title="Reference and help">
            <Details title="Pricing examples and formulas">
              <GuideTable
                caption="Completed-day pricing examples"
                headings={[
                  "Pricing claims per UTC day",
                  "Equipment Chest",
                  "Consumable",
                ]}
                rows={[100000, 101000, 105000, 110000].map((emission) => [
                  formatInt(emission),
                  `${getEmissionShopPrice({ basePrice: EQUIPMENT_CHEST_BASE_PRICE, emission })} HASH`,
                  `${getEmissionShopPrice({ basePrice: CONSUMABLES["help-kit"].basePrice, emission })} HASH`,
                ])}
              />
              <pre className="overflow-x-auto rounded-lg bg-muted/30 p-3 font-mono text-xs leading-6 text-foreground">{`Stat step = max(1, current level²) HASH\nBulk upgrade = sum of each current-level step\nVault capacity = round(${VAULT_BASE_CAPACITY} + nonnegative vault stake)\nMining = (softcapped affected Hash Rate + 1)² / ${UPGRADE_TARGET_SECONDS} × decay\nChest HASH = roundHalfUp(${EQUIPMENT_CHEST_BASE_PRICE} + excess × ${SOCIAL_ECONOMY.pricing.excessRate})\nConsumable HASH = roundHalfUp(${CONSUMABLES["help-kit"].basePrice} + excess × ${SOCIAL_ECONOMY.pricing.excessRate / EQUIPMENT_CHEST_BASE_PRICE})\nExcess = max(0, pricing claims − ${SOCIAL_ECONOMY.pricing.emissionThresholdPerDay})`}</pre>
              <p>
                Stats and HASH/SPARKS amounts use up to four trimmed decimals;
                HIVE amounts use up to three. Levels, quantities and XP are
                integers. Mining rates show additional precision when a positive
                value would otherwise look like zero. Historical graphs use the
                recorded spend or credit, not a recalculation at current prices.
              </p>
            </Details>
            <Details title="Why is my submission taking longer?">
              <p>
                Signing, blockchain observation, irreversible verification and
                game processing are separate stages. Submitted remains
                unresolved until matching receipts and required refreshes are
                ready. Closing a form or reaching a timeout does not reject the
                action.
              </p>
              <p>
                Missing transaction IDs show an uncertain outcome. Submitted is
                session-only and clears on reload, logout or reconnection;
                recorded history remains available after signing in. Do not
                automatically repeat an uncertain payment.
              </p>
            </Details>
            <Details title="Why are signing and purchase controls unavailable?">
              <p>
                New broadcasts require backend readiness and a current
                authenticated session. Use the existing Retry control when
                processing is unavailable. Signed-in browsing, history and
                confirmation of already submitted work remain available when
                their reads work.
              </p>
            </Details>
            <Details title="Why can't I use or sell an item?">
              <p>
                Check ownership, equipment status and its listing. Listed gear
                must be cancelled before another use. Reserved purchases protect
                the item until settlement; salvage is permanent.
              </p>
            </Details>
            <div id="implementation-notes" className="scroll-mt-24">
              <Details title="Current implementation limitations">
                <p>
                  This guide describes the current game. Some displayed
                  limits and estimates still have documented differences:
                </p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>
                    The client shows an inactivity-reduced
                    raid charge cap, while the current worker reserves against a
                    maximum of {MAX_RAID_CHARGES}.
                  </li>
                  <li>
                    The player-level badge derives from XP. Cosmetic permission
                    currently checks a separately stored player level, which XP
                    writes do not automatically update.
                  </li>
                </ul>
                <p>
                  These notes explain differences; they do not change settled
                  outcomes or promise a gameplay update.
                </p>
              </Details>
            </div>
            <p className="flex items-start gap-2 text-xs">
              <CheckCircle2 className="mt-1 size-4 shrink-0 text-success" />
              Registration, gameplay and payments are confirmed by backend
              processing. Client mining projections are display information.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

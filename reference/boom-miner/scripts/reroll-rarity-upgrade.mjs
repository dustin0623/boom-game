/**
 * scripts/reroll-rarity-upgrade.mjs
 *
 * Rerolls EVERY hero in the database up by exactly +1 rarity tier and
 * re-rolls their attributes to the new rarity's stat ranges.
 *
 * Rarity ladder (upgrade path):
 *   common    → uncommon
 *   uncommon  → rare
 *   rare      → epic
 *   epic      → legendary
 *   legendary → stays legendary (already at max)
 *
 * What gets updated per hero:
 *   - rarity          → next tier
 *   - attributes      → freshly rolled within the new tier's stat ranges
 *   - maxEnergy       → stamina × ENERGY_PER_STAMINA (recalculated)
 *   - currentEnergy   → reset to full maxEnergy (fully recharged after upgrade)
 *
 * What is NOT touched:
 *   - ownerWallet, minted_number, name, type, level, onMap, market, lastRegenAt
 *
 * Usage:
 *   node --env-file-if-exists=/vercel/share/.env.project scripts/reroll-rarity-upgrade.mjs
 *
 *   Or with a local env file:
 *   MONGODB_URI=mongodb+srv://... node scripts/reroll-rarity-upgrade.mjs
 *
 * Flags:
 *   --dry-run    Print what would change without writing to the database.
 *   --wallet=0x  Only reroll heroes owned by this wallet address (case-insensitive).
 */

import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Auto-load env files — tries the Vercel shared env first, then falls back
// to .env.development.local in the project root. This means the script works
// both in the Vercel sandbox (node scripts/...) and locally without needing
// to prefix the command with env vars or --env-file flags.
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key   = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    // Only set if not already defined — process env vars take precedence.
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

// Vercel sandbox shared env (set by v0 integrations)
loadEnvFile("/vercel/share/.env.project");
// Local dev env (Next.js convention)
loadEnvFile(path.resolve(__dirname, "../.env.development.local"));
loadEnvFile(path.resolve(__dirname, "../.env.local"));
loadEnvFile(path.resolve(__dirname, "../.env"));

// ---------------------------------------------------------------------------
// Config / constants (mirrors lib/constants/game.ts and HeroRarity.ts)
// ---------------------------------------------------------------------------

const ENERGY_PER_STAMINA = 100;

/** +1 tier upgrade map. Legendary stays legendary. */
const RARITY_UPGRADE = {
  common:    "uncommon",
  uncommon:  "rare",
  rare:      "epic",
  epic:      "legendary",
  legendary: "legendary",
};

/**
 * Stat ranges per rarity — mirrors HERO_RARITY_DEFS in HeroRarity.ts exactly.
 * bombNum is fixed (not a range), bombRange and others use [min, max] inclusive.
 */
const RARITY_DEFS = {
  common:    { power: [1, 3],   speed: [1, 3],   stamina: [1, 3],   bombNum: 1, bombRange: [1, 2]  },
  uncommon:  { power: [3, 6],   speed: [3, 6],   stamina: [3, 6],   bombNum: 2, bombRange: [2, 3]  },
  rare:      { power: [6, 8],   speed: [6, 8],   stamina: [6, 8],   bombNum: 3, bombRange: [3, 5]  },
  epic:      { power: [8, 11],  speed: [8, 11],  stamina: [8, 11],  bombNum: 4, bombRange: [5, 7]  },
  legendary: { power: [11, 16], speed: [11, 16], stamina: [11, 16], bombNum: 6, bombRange: [7, 11] },
};

// ---------------------------------------------------------------------------
// Inline Hero schema — avoids @/ alias resolution issues in plain Node.js
// ---------------------------------------------------------------------------

const HeroSchema = new mongoose.Schema(
  {
    ownerWallet:   { type: String, required: true },
    minted_number: { type: Number, required: true },
    name:          { type: String, required: true },
    type:          { type: String, required: true },
    rarity:        { type: String, required: true },
    level:         { type: Number, default: 1 },
    attributes: {
      power:      Number,
      speed:      Number,
      stamina:    Number,
      bombNumber: Number,
      bombRange:  Number,
    },
    currentEnergy: Number,
    maxEnergy:     Number,
    onMap:         Boolean,
    lastRegenAt:   Number,
  },
  { collection: "heroes", strict: false },
);

const HeroModel = mongoose.model("Hero", HeroSchema);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Roll an inclusive integer between min and max. */
function rollInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Roll fresh attributes for a given rarity. */
function rollAttributes(rarity) {
  const def     = RARITY_DEFS[rarity];
  const stamina = rollInt(...def.stamina);
  return {
    power:      rollInt(...def.power),
    speed:      rollInt(...def.speed),
    stamina,
    bombNumber: def.bombNum,
    bombRange:  rollInt(...def.bombRange),
  };
}

function pad(str, len) {
  return String(str).padEnd(len, " ");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error("[reroll] ERROR: MONGODB_URI is not set. Pass it via env file or env var.");
    process.exit(1);
  }

  const isDryRun   = process.argv.includes("--dry-run");
  const walletFlag = process.argv.find((a) => a.startsWith("--wallet="));
  // Case-insensitive regex so the filter works regardless of EIP-55 casing.
  const walletFilter = walletFlag
    ? new RegExp(`^${walletFlag.split("=")[1].trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
    : null;

  if (isDryRun)     console.log("[reroll] DRY RUN — no writes will be made.");
  if (walletFilter) console.log(`[reroll] Filtering to wallet: ${walletFilter}`);

  await mongoose.connect(MONGODB_URI, { retryWrites: false });
  console.log("[reroll] Connected to MongoDB via mongoose.");

  // Build query filter
  const query = walletFilter ? { ownerWallet: { $regex: walletFilter } } : {};

  const total = await HeroModel.countDocuments(query);
  console.log(`[reroll] Found ${total} heroes to process.`);

  if (total === 0) {
    console.log("[reroll] Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  // Tally counters
  const counts = { upgraded: 0, alreadyMax: 0, unknown: 0, errors: 0 };

  // Print header
  console.log(
    "\n" +
    pad("minted#", 10) +
    pad("wallet (truncated)", 22) +
    pad("old rarity", 12) +
    pad("new rarity", 12) +
    "stamina → maxEnergy",
  );
  console.log("-".repeat(75));

  const cursor = HeroModel.find(query).lean().cursor();
  const bulkOps = [];

  for await (const hero of cursor) {
    const oldRarity = (hero.rarity ?? "").toLowerCase();
    const newRarity = RARITY_UPGRADE[oldRarity];

    if (!newRarity) {
      console.warn(`[reroll] WARN: Hero #${hero.minted_number} has unknown rarity "${hero.rarity}" — skipping.`);
      counts.unknown++;
      continue;
    }

    if (oldRarity === "legendary") {
      counts.alreadyMax++;
      console.log(
        pad(`#${hero.minted_number}`, 10) +
        pad((hero.ownerWallet ?? "").slice(0, 20), 22) +
        pad(oldRarity, 12) +
        pad("(max — skip)", 12),
      );
      continue;
    }

    const attrs     = rollAttributes(newRarity);
    const maxEnergy = attrs.stamina * ENERGY_PER_STAMINA;

    console.log(
      pad(`#${hero.minted_number}`, 10) +
      pad((hero.ownerWallet ?? "").slice(0, 20), 22) +
      pad(oldRarity, 12) +
      pad(newRarity, 12) +
      `stamina ${attrs.stamina} → maxEnergy ${maxEnergy}`,
    );

    if (!isDryRun) {
      bulkOps.push({
        updateOne: {
          filter: { _id: hero._id },
          update: {
            $set: {
              rarity:        newRarity,
              attributes:    attrs,
              maxEnergy,
              currentEnergy: maxEnergy,
            },
          },
        },
      });
    }

    counts.upgraded++;
  }

  console.log("-".repeat(75));

  if (!isDryRun && bulkOps.length > 0) {
    try {
      const result = await HeroModel.bulkWrite(bulkOps, { ordered: false });
      console.log(`\n[reroll] Bulk write complete. Modified: ${result.modifiedCount} / ${bulkOps.length}`);
    } catch (err) {
      console.error("[reroll] Bulk write failed:", err.message);
      counts.errors++;
    }
  }

  console.log(
    `\n[reroll] Summary:\n` +
    `  Upgraded:    ${counts.upgraded}\n` +
    `  Already max: ${counts.alreadyMax}\n` +
    `  Unknown:     ${counts.unknown}\n` +
    `  Errors:      ${counts.errors}\n` +
    (isDryRun ? "  (DRY RUN — no writes made)" : "  Writes committed."),
  );

  await mongoose.disconnect();
  console.log("[reroll] Disconnected. Done.");
}

main().catch((err) => {
  console.error("[reroll] Fatal error:", err);
  process.exit(1);
});

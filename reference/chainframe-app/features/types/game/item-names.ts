import type { SlotKey } from "@/features/types/game/types";

export const ITEM_NAME_POOLS: Record<SlotKey, string[]> = {
  asicMiner: [
    "USB ASIC Miner",
    "Gridseed Blade",
    "Antminer S9",
    "Overclocked S19",
    "Quantum Miner",
  ],
  motherboard: [
    "Breadboard Mobo",
    "Mining Rig Mobo",
    "Dual CPU Server Board",
    "Liquid-Cooled Board",
    "Neural Net Board",
  ],
  powerSupply: [
    "80+ Bronze PSU",
    "80+ Gold PSU",
    "80+ Platinum PSU",
    "Redundant PSU",
    "Fusion Reactor",
  ],
  coolingSystem: [
    "Case Fan",
    "AIO Cooler",
    "Immersion Tank",
    "Liquid Nitrogen Rig",
    "Deep Space Radiator",
  ],
  networkModule: [
    "USB Wi-Fi Dongle",
    "Gigabit PCIe NIC",
    "10Gb SFP+ Module",
    "40Gb QSFP+ NIC",
    "Orbital Laser Uplink",
  ],
  firmwareChip: [
    "Bootleg BIOS",
    "Open Source Firmware",
    "Custom HiveOS",
    "Kernel Hack",
    "Singularity BIOS",
  ],
};

export function randomItemName(slot: SlotKey, seed: string): string {
  const pool = ITEM_NAME_POOLS[slot];
  const index =
    seed.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % pool.length;
  return pool[index] ?? pool[0]!;
}

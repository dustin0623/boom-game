import { vi } from "vitest";

export const players = {
  findPlayerByWallet: vi.fn(),
  findRaidTargets: vi.fn(),
};

export const equipments = {
  findEquipmentsByIds: vi.fn(async () => []),
};

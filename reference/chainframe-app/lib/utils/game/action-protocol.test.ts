import { describe, expect, it } from "vitest";
import {
  GAME_ACTION_NAMES,
  buildClaimAction,
  buildEquipmentAction,
  buildHelpAction,
  buildRaidAction,
  buildUpgradeStatAction,
  parseGameActionPayload,
} from "@/lib/utils/game/action-protocol";

describe("game action protocol", () => {
  it.each(["player123", "player-one", "player.one", "abc.def-123"])(
    "uses the shared Hive name rules for target %s",
    (target) => {
      expect(
        buildRaidAction({ target, nonce: "account-123456" }).metadata,
      ).toMatchObject({ target });
      expect(
        buildHelpAction({
          target,
          consumableId: "help-kit",
          stat: "security",
          nonce: "account-123456",
        }).metadata,
      ).toMatchObject({ target });
    },
  );
  it("rejects paid-opening payloads and opens only one inventory chest", () => {
    for (const metadata of [
      { chestId: "equipment" },
      { itemId: "equipment", expectedPrice: 100 },
      { itemId: "equipment", quantity: 2 },
    ]) {
      expect(() =>
        parseGameActionPayload({
          version: 1,
          action: "open_chest",
          metadata: { ...metadata, nonce: "chest-123456" },
        }),
      ).toThrow();
    }
    expect(
      parseGameActionPayload({
        version: 1,
        action: "open_chest",
        metadata: { itemId: "equipment", nonce: "chest-123456" },
      }),
    ).toMatchObject({ version: 1, action: "open_chest" });
    expect(
      parseGameActionPayload({
        version: 1,
        action: "purchase_chest",
        metadata: { itemId: "equipment", nonce: "chest-123456" },
      }).metadata,
    ).toMatchObject({ quantity: 1 });
  });
  it.each([
    { price: 1 },
    { price: 1, currency: "HASH" },
    { price: 0.0001, currency: "HIVE" },
    { price: Number.MAX_SAFE_INTEGER, currency: "HIVE" },
  ])("rejects legacy or invalid listing metadata %j", (metadata) => {
    expect(() =>
      parseGameActionPayload({
        version: 1,
        action: "market_list",
        metadata: { itemId: "item", nonce: "fixture-123456", ...metadata },
      }),
    ).toThrow();
  });
  it("accepts a manual three-decimal HIVE listing", () => {
    expect(
      parseGameActionPayload({
        version: 1,
        action: "market_list",
        metadata: {
          itemId: "item",
          nonce: "fixture-123456",
          price: 0.101,
          currency: "HIVE",
        },
      }).metadata,
    ).toMatchObject({ price: 0.101, currency: "HIVE" });
  });
  it("rejects unsupported payload versions without normalizing them", () => {
    const claim = buildClaimAction({ nonce: "protocol-123456" });
    expect(claim.version).toBe(1);
    for (const version of [0, 2, 99, "1", undefined]) {
      expect(() => parseGameActionPayload({ ...claim, version })).toThrow();
    }
  });
  it.each([
    [
      "equip",
      "equip",
      { equipmentId: "item-1", slot: "asicMiner", nonce: "equipment-123456" },
    ],
    [
      "unequip",
      "unequip",
      { equipmentId: "item-1", slot: "asicMiner", nonce: "equipment-123456" },
    ],
    [
      "upgrade",
      "upgrade_equipment",
      { equipmentId: "item-1", levels: 1, nonce: "equipment-123456" },
    ],
    [
      "salvage",
      "salvage_equipment",
      { equipmentId: "item-1", nonce: "equipment-123456" },
    ],
  ] as const)(
    "builds the existing %s equipment payload",
    (kind, action, metadata) => {
      expect(
        buildEquipmentAction(
          kind,
          { id: "item-1", slot: "asicMiner" },
          "equipment-123456",
        ),
      ).toEqual({ version: 1, action, metadata });
    },
  );

  it("validates equipment inputs through the existing action schemas", () => {
    expect(() =>
      buildEquipmentAction(
        "equip",
        { id: "", slot: "asicMiner" },
        "equipment-123456",
      ),
    ).toThrow();
    expect(() =>
      buildEquipmentAction(
        "salvage",
        { id: "item-1", slot: "asicMiner" },
        "short",
      ),
    ).toThrow();
  });

  it.each([1, 2, 45])("accepts shop expected price %s", (expectedUnitPrice) => {
    expect(() =>
      parseGameActionPayload({
        version: 1,
        action: "purchase_consumable",
        metadata: {
          itemId: "help-kit",
          quantity: 3,
          expectedUnitPrice,
          nonce: "shop-price-123456",
        },
      }),
    ).not.toThrow();
  });
  it.each([
    1.1,
    45.6,
    1.01,
    1.11,
    0,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects shop expected price %s", (expectedUnitPrice) => {
    expect(() =>
      parseGameActionPayload({
        version: 1,
        action: "purchase_consumable",
        metadata: {
          itemId: "help-kit",
          quantity: 3,
          expectedUnitPrice,
          nonce: "shop-price-123456",
        },
      }),
    ).toThrow();
  });
  it("exposes exactly the approved action inventory", () => {
    expect(GAME_ACTION_NAMES).toEqual([
      "claim",
      "increase_vault",
      "upgrade_stat",
      "upgrade_equipment",
      "raid",
      "sabotage",
      "help",
      "equip",
      "unequip",
      "salvage_equipment",
      "open_chest",
      "purchase_chest",
      "purchase_consumable",
      "market_list",
      "market_cancel",
      "equip_cosmetic",
      "request_withdrawal",
    ]);
  });

  it("accepts valid payloads for every action", () => {
    const payloads = [
      buildClaimAction({ nonce: "claim-123456" }),
      {
        version: 1,
        action: "increase_vault",
        metadata: { amount: 2, nonce: "vault-123456" },
      },
      buildUpgradeStatAction({
        stat: "hackPower",
        levels: 2,
        nonce: "stat-123456",
      }),
      {
        version: 1,
        action: "upgrade_equipment",
        metadata: { equipmentId: "item-1", levels: 1, nonce: "item-123456" },
      },
      buildRaidAction({ target: "alice", nonce: "raid-123456" }),
      {
        version: 1,
        action: "sabotage",
        metadata: {
          target: "alice",
          consumableId: "sabotage-device",
          stat: "security",
          nonce: "sab-123456",
        },
      },
      buildHelpAction({
        target: "alice",
        consumableId: "help-kit",
        stat: "security",
        nonce: "help-123456",
      }),
      {
        version: 1,
        action: "equip",
        metadata: {
          equipmentId: "item-1",
          slot: "asicMiner",
          nonce: "equip-123456",
        },
      },
      {
        version: 1,
        action: "unequip",
        metadata: {
          equipmentId: "item-1",
          slot: "asicMiner",
          nonce: "unequip-123456",
        },
      },
      buildEquipmentAction(
        "salvage",
        { id: "item-1", slot: "asicMiner" },
        "salvage-123456",
      ),
      ...[
        ["open_chest", { itemId: "equipment" }],
        [
          "purchase_chest",
          { itemId: "equipment", quantity: 2, expectedUnitPrice: 100 },
        ],
        ["purchase_consumable", { itemId: "help-kit", quantity: 1 }],
        ["market_list", { itemId: "item-1", price: 5, currency: "HIVE" }],
        ["market_cancel", { itemId: "item-1" }],
        ["equip_cosmetic", { kind: "avatar", templateId: 1 }],
        ["request_withdrawal", { amount: 5 }],
      ].map(([action, metadata]) => ({
        version: 1,
        action,
        metadata: { ...(metadata as object), nonce: "valid-123456" },
      })),
    ];
    for (const payload of payloads)
      expect(parseGameActionPayload(payload)).toEqual(payload);
  });

  it.each([
    { version: 2, action: "claim", metadata: { nonce: "claim-123456" } },
    {
      version: 1,
      action: "destroy_equipment",
      metadata: { equipmentId: "item-1", nonce: "destroy-123456" },
    },
    { version: 1, action: "raid", metadata: { target: "alice", nonce: "x" } },
    {
      version: 1,
      action: "upgrade_stat",
      metadata: {
        stat: "hashRate",
        levels: 1,
        nonce: "valid-1234",
        reward: 99,
      },
    },
    {
      version: 1,
      action: "claim",
      metadata: { nonce: "claim-123456", reward: 99 },
    },
  ])("rejects unsafe payload %#", (payload) => {
    expect(() => parseGameActionPayload(payload)).toThrow();
  });
});

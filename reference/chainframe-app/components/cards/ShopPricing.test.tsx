import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { HookHarness } from "@/tests/helpers/hook-harness";
let scope: HookHarness;
const shop = vi.hoisted(() => ({
  refresh: vi.fn(),
  purchase: vi.fn(),
  hive: vi.fn(),
  unavailable: false,
  reducedMotion: false,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (...args: Parameters<HookHarness["useState"]>) =>
    scope.useState(...args),
  useRef: (...args: Parameters<HookHarness["useRef"]>) => scope.useRef(...args),
  useEffect: (...args: Parameters<HookHarness["useEffect"]>) =>
    scope.useEffect(...args),
}));
vi.mock("@/features/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({ mode: "wallet", address: "alice", connectedAt: 1 }),
  },
}));
vi.mock("@/features/stores/inventoryStore", () => ({
  useInventoryStore: (select: (s: unknown) => unknown) =>
    select({ items: { "help-kit": 3, "sabotage-device": 3 }, loaded: true }),
}));
vi.mock("@/features/stores/workerStore", () => ({
  useWorkerStore: (select: (s: unknown) => unknown) =>
    select({ available: true }),
}));
vi.mock("@/hooks/useGameStats", () => ({
  useGameStats: () => ({ wallet: 100 }),
}));
vi.mock("@/hooks/useShopPrices", () => ({
  useShopPrices: () => ({
    consumablePrice: () => 1,
    consumableHivePrice: () => 0.1,
    consumableOwned: () => 3,
    emission: { pricedAt: 500000, excess: 400000 },
    refresh: shop.refresh,
    unavailable: shop.unavailable,
  }),
}));
vi.mock("@/hooks/useHiveShopPurchase", () => ({
  useHiveShopPurchase: () => ({ busy: false, buy: shop.hive }),
}));
vi.mock("@/components/shop/EquipmentChestPurchaseCard", () => ({
  EquipmentChestPurchaseCard: "chest-purchase",
}));
vi.mock("@/lib/api/client", () => ({ purchaseConsumable: shop.purchase }));
vi.mock("@/components/ui/button", () => ({ Button: "button" }));
vi.mock("framer-motion", () => ({
  motion: { div: "div" },
  useReducedMotion: () => shop.reducedMotion,
}));
import { ConsumableCard } from "./ConsumableCard";
import { ChestCard } from "./ChestCard";
import { CONSUMABLES } from "@/features/types/game/consumables";
import { ShopPage } from "@/components/pages/ShopPage";

type Node = ReactElement<
  Record<string, unknown> & {
    children?: ReactNode;
    "aria-label"?: string;
    onClick?: () => void;
    disabled?: boolean;
  }
>;
const nodes = (node: ReactNode): Node[] =>
  Array.isArray(node)
    ? node.flatMap(nodes)
    : node && typeof node === "object" && "props" in node
      ? [node as Node, ...nodes((node as Node).props.children)]
      : [];
const text = (node: ReactNode): string =>
  Array.isArray(node)
    ? node.map(text).join("")
    : node && typeof node === "object" && "props" in node
      ? text((node as Node).props.children)
      : typeof node === "string"
        ? node
        : "";
const button = (tree: ReactNode, label: string) =>
  nodes(tree).find(
    (node) =>
      node.type === "button" &&
      (text(node).trim() === label || node.props["aria-label"] === label),
  )!;
beforeEach(() => {
  scope = new HookHarness();
  vi.clearAllMocks();
  shop.unavailable = false;
  shop.reducedMotion = false;
  shop.purchase.mockResolvedValue({ ok: true });
  shop.hive.mockResolvedValue({ ok: true });
});
afterEach(() => scope.unmount());

describe("shop amounts and quantity interaction", () => {
  it("buys chest quantities, flips odds accessibly and restores button focus", () => {
    const buy = vi.fn(),
      hive = vi.fn(),
      backFocus = vi.fn(),
      infoFocus = vi.fn();
    const draw = () =>
      scope.render(() =>
        ChestCard({
          chest: "equipment",
          wallet: 10000,
          price: 100,
          owned: 3,
          onBuy: buy,
          hivePrice: 10,
          onBuyWithHive: hive,
        }),
      );
    let tree = draw();
    button(tree, "Increase Equipment Chest quantity").props.onClick!();
    tree = draw();
    button(tree, "Buy 2 — 200 HASH").props.onClick!();
    button(tree, "Buy with HIVE — 20 HIVE").props.onClick!();
    expect(buy).toHaveBeenCalledExactlyOnceWith("equipment", 2);
    expect(hive).toHaveBeenCalledExactlyOnceWith("equipment", 2);
    const info = button(tree, "Show Equipment Chest drop rates"),
      back = button(tree, "Back to purchase");
    (info.props.ref as { current: unknown }).current = { focus: infoFocus };
    (back.props.ref as { current: unknown }).current = { focus: backFocus };
    info.props.onClick!();
    tree = draw();
    expect(backFocus).toHaveBeenCalledOnce();
    expect(
      nodes(tree).find((node) => node.props["aria-hidden"] === true)?.props
        .inert,
    ).toBe(true);
    expect(text(tree)).toContain("Base odds before Luck");
    button(tree, "Back to purchase").props.onClick!();
    expect(button(draw(), "Buy 2 — 200 HASH")).toBeDefined();
    expect(infoFocus).toHaveBeenCalledOnce();
    for (let i = 2; i < 25; i++) {
      button(draw(), "Increase Equipment Chest quantity").props.onClick!();
    }
    expect(
      button(draw(), "Increase Equipment Chest quantity").props.disabled,
    ).toBe(true);
    expect(text(draw())).toContain("Buy 25 — 2,500 HASH");
    shop.reducedMotion = true;
    expect(
      nodes(draw()).find((node) => node.props.animate)?.props.transition,
    ).toMatchObject({ duration: 0 });
  });
  it("puts all products in one responsive grid without separate headings while preserving quotes and payments", async () => {
    const tree = scope.render(() => ShopPage());
    expect(text(tree)).not.toContain("Pricing Emission");
    expect(text(tree)).not.toContain("Excess Above");
    expect(text(tree)).not.toContain("400000");
    const all = nodes(tree);
    const grid = all.find(
      (node) => node.props["aria-label"] === "Shop products",
    )!;
    expect(grid.props.className).toBe(
      "grid gap-3 sm:grid-cols-2 xl:grid-cols-3",
    );
    const products = nodes(grid).filter(
      (node) => node.type === "chest-purchase" || node.type === ConsumableCard,
    );
    expect(
      products.map((node) =>
        node.type === "chest-purchase"
          ? "equipment"
          : (node.props.consumable as { id: string }).id,
      ),
    ).toEqual(["equipment", "sabotage-device", "help-kit"]);
    expect(
      all.some(
        (node) =>
          node.type === "h2" ||
          node.props["aria-labelledby"] === "consumables-heading",
      ),
    ).toBe(false);
    expect(text(tree)).toContain("open them one at a time in Inventory");
    const card = all.find((node) => node.type === ConsumableCard)!;
    expect(card.props).toMatchObject({
      unitPrice: 1,
      hiveUnitPrice: 0.1,
      owned: 3,
      wallet: 100,
      purchasable: true,
    });
    (card.props.onBuy as (id: string, quantity: number) => void)("help-kit", 2);
    await vi.waitFor(() =>
      expect(shop.purchase).toHaveBeenCalledWith(
        "help-kit",
        2,
        1,
        expect.any(Function),
      ),
    );
    (card.props.onBuyWithHive as (id: string, quantity: number) => void)(
      "help-kit",
      2,
    );
    await vi.waitFor(() =>
      expect(shop.hive).toHaveBeenCalledWith(
        {
          kind: "consumable",
          itemId: "help-kit",
          quantity: 2,
          hiveAmount: 0.2,
        },
        expect.any(Function),
      ),
    );
    shop.unavailable = true;
    expect(text(scope.render(() => ShopPage()))).toContain(
      "Live prices are unavailable",
    );
  });
  it("shows 2 HASH units, a 6 HASH total and a 0.3 HIVE total for three units", () => {
    const buy = vi.fn(),
      pay = vi.fn();
    const render = () =>
      scope.render(() =>
        ConsumableCard({
          consumable: CONSUMABLES["help-kit"],
          unitPrice: 2,
          owned: 2,
          wallet: 6,
          busy: false,
          purchasable: true,
          onBuy: buy,
          hiveUnitPrice: 0.1,
          onBuyWithHive: pay,
        }),
      );
    let tree = render();
    expect(text(tree)).toContain("2 HASH");
    button(tree, "Increase Help Kit quantity").props.onClick!();
    tree = render();
    button(tree, "Increase Help Kit quantity").props.onClick!();
    tree = render();
    const hashButton = nodes(tree).find(
      (node) => node.type === "button" && text(node).includes("6 HASH"),
    )!;
    const hiveButton = nodes(tree).find(
      (node) => node.type === "button" && text(node).includes("0.3 HIVE"),
    )!;
    expect(hashButton.props.disabled).toBe(false);
    expect(hashButton.props.className).toContain("min-h-11");
    expect(hiveButton.props.className).toContain("min-h-11");
    expect(button(tree, "Increase Help Kit quantity").props.className).toBe(
      "size-11",
    );
    hashButton.props.onClick!();
    hiveButton.props.onClick!();
    expect(buy).toHaveBeenCalledWith("help-kit", 3);
    expect(pay).toHaveBeenCalledWith("help-kit", 3);
    scope.unmount();
  });
  it("keeps a finer-grained insufficient balance disabled and shows a nonzero shortfall", () => {
    const tree = scope.render(() =>
      ConsumableCard({
        consumable: CONSUMABLES["help-kit"],
        unitPrice: 2,
        owned: 0,
        wallet: 1.99999,
        busy: false,
        purchasable: true,
        onBuy: vi.fn(),
      }),
    );
    expect(button(tree, "Need 0.0001 more HASH").props.disabled).toBe(true);
  });
  it("shows full chest prices and fixed HIVE prices with trimmed decimals", () => {
    const tree = scope.render(() =>
      ChestCard({
        chest: "equipment",
        wallet: 200_000,
        price: 100_000,
        onBuy: vi.fn(),
        owned: 2,
        hivePrice: 10,
        onBuyWithHive: vi.fn(),
      }),
    );
    expect(text(tree)).toContain("100,000 HASH");
    expect(text(tree)).toContain("10 HIVE");
    expect(text(tree)).not.toContain("100K");
  });
  it("disables purchases while a quote is unavailable", () => {
    const tree = scope.render(() =>
      ConsumableCard({
        consumable: CONSUMABLES["help-kit"],
        unitPrice: null,
        owned: 0,
        wallet: 100,
        busy: false,
        purchasable: true,
        onBuy: vi.fn(),
      }),
    );
    expect(button(tree, "Loading price…").props.disabled).toBe(true);
  });
  it("retains unavailable owned counts and disables both purchases and quantities during HIVE approval", () => {
    const tree = scope.render(() =>
      ConsumableCard({
        consumable: CONSUMABLES["help-kit"],
        unitPrice: 1,
        owned: null,
        wallet: 100,
        busy: false,
        purchasable: true,
        hiveUnitPrice: 0.1,
        hiveBusy: true,
        onBuy: vi.fn(),
        onBuyWithHive: vi.fn(),
      }),
    );
    expect(text(tree)).toContain("Unavailable");
    for (const label of [
      "Increase Help Kit quantity",
      "Decrease Help Kit quantity",
      "Buy 1 — 1 HASH",
      "Waiting for HIVE payment…",
    ])
      expect(button(tree, label).props.disabled).toBe(true);
  });
});

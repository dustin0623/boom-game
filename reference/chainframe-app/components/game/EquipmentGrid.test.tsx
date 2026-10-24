import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { HookHarness } from "@/tests/helpers/hook-harness";
import type { Equipment } from "@/features/types/game/types";

let scope: HookHarness;
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (...args: Parameters<HookHarness["useState"]>) =>
    scope.useState(...args),
  useMemo: (...args: Parameters<HookHarness["useMemo"]>) =>
    scope.useMemo(...args),
}));
vi.mock("@radix-ui/react-select", () => ({ Root: "select", Value: "value" }));
vi.mock("@/components/ui/select", () => ({
  SelectTrigger: "select-trigger",
  SelectContent: "options",
  SelectItem: "option",
}));
vi.mock("@/components/ui/button", () => ({ Button: "button" }));
vi.mock("@/components/ui/input", () => ({ Input: "input" }));
vi.mock("framer-motion", () => ({
  motion: { article: "article" },
  AnimatePresence: "presence",
}));
vi.mock("@radix-ui/react-dropdown-menu", () => ({
  Root: "menu",
  Trigger: "menu-trigger",
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenuContent: "menu-content",
  DropdownMenuItem: "menu-item",
}));
import { EquipmentGrid } from "./EquipmentGrid";
import { EquipmentCard } from "@/components/cards/EquipmentCard";

const nodes = (node: ReactNode): ReactElement<Record<string, unknown>>[] =>
  Array.isArray(node)
    ? node.flatMap(nodes)
    : node && typeof node === "object" && "props" in node
      ? [
          node as ReactElement<Record<string, unknown>>,
          ...nodes(
            (node as ReactElement<{ children?: ReactNode }>).props.children,
          ),
        ]
      : [];
const text = (node: ReactNode): string =>
  Array.isArray(node)
    ? node.map(text).join("")
    : node && typeof node === "object" && "props" in node
      ? text((node as ReactElement<{ children?: ReactNode }>).props.children)
      : typeof node === "string" || typeof node === "number"
        ? String(node)
        : "";
const call = (
  node: ReactElement<Record<string, unknown>>,
  event: string,
  ...args: unknown[]
) => (node.props[event] as (...args: unknown[]) => unknown)(...args);
const button = (tree: ReactNode, label: string) =>
  nodes(tree).find(
    (node) =>
      node.type === "button" &&
      (text(node) === label || node.props["aria-label"] === label),
  )!;
const rows: Equipment[] = [
  {
    id: "a",
    name: "Alpha miner",
    slot: "asicMiner",
    rarity: "common",
    equipped: false,
    level: 1,
    stats: { hashRate: 1 },
    createdAt: 1,
  },
  {
    id: "b",
    name: "Beta module",
    slot: "networkModule",
    rarity: "epic",
    equipped: false,
    level: 2,
    stats: { hashRate: 4 },
    createdAt: 2,
  },
  {
    id: "c",
    name: "Gamma cooler",
    slot: "coolingSystem",
    rarity: "rare",
    equipped: false,
    level: 1,
    stats: { hashRate: 2 },
    createdAt: 3,
  },
  {
    id: "d",
    name: "Equipped miner",
    slot: "asicMiner",
    rarity: "common",
    equipped: true,
    level: 1,
    stats: { hashRate: 0.1 },
    createdAt: 0,
  },
];
let props: Parameters<typeof EquipmentGrid>[0];
const draw = () => scope.render(() => EquipmentGrid(props));
const cards = (tree: ReactNode) =>
  nodes(tree).filter((node) => node.type === EquipmentCard);
const ids = (tree: ReactNode) =>
  cards(tree).map((node) => (node.props.item as Equipment).id);
const choose = (index: number, value: string) =>
  call(
    nodes(draw()).filter((node) => node.type === "select")[index],
    "onValueChange",
    value,
  );
beforeEach(() => {
  scope = new HookHarness();
  props = {
    items: rows,
    loaded: true,
    unavailable: false,
    actionsDisabled: false,
    hasOwnedChests: false,
    onViewChests: vi.fn(),
    onEquip: vi.fn(),
    onUnequip: vi.fn(),
    onUpgrade: vi.fn(),
    onSalvage: vi.fn(),
    onSell: vi.fn(),
  };
});
afterEach(() => scope.unmount());

it("keeps equipped gear first in each existing sort and shows compact result/equipped counts", () => {
  for (const [sort, expected] of [
    ["score", ["d", "b", "c", "a"]],
    ["rarity", ["d", "b", "c", "a"]],
    ["newest", ["d", "c", "b", "a"]],
    ["name", ["d", "a", "b", "c"]],
  ] as const) {
    choose(0, sort);
    expect(ids(draw())).toEqual(expected);
  }
  expect(text(draw())).toContain("4 of 4 equipment · 1 equipped");
});

it("combines search, slot, rarity and status, with removable chips and clear preserving sort", () => {
  choose(0, "newest");
  choose(1, "asicMiner");
  choose(2, "common");
  choose(3, "unequipped");
  call(
    nodes(draw()).find(
      (node) => node.props["aria-label"] === "Search equipment",
    )!,
    "onChange",
    { target: { value: " ALPHA " } },
  );
  expect(ids(draw())).toEqual(["a"]);
  expect(
    nodes(draw()).filter((node) =>
      String(node.props["aria-label"]).startsWith("Remove filter:"),
    ).length,
  ).toBe(4);
  call(button(draw(), "Remove filter: Unequipped"), "onClick");
  choose(3, "equipped");
  expect(text(draw())).toContain("No gear matches these filters");
  call(button(draw(), "Clear filters"), "onClick");
  expect(ids(draw())).toEqual(["d", "c", "b", "a"]);
  expect(
    nodes(draw()).filter((node) => node.type === "select")[0].props.value,
  ).toBe("newest");
  expect(
    nodes(draw()).some(
      (node) => node.props["aria-label"] === "Active equipment filters",
    ),
  ).toBe(false);
});

it("collapses mobile filters, keeps desktop controls available and reports active filter counts", () => {
  let tree = draw();
  const toggle = nodes(tree).find(
    (node) => node.props["aria-controls"] === "inventory-filters",
  )!;
  expect(toggle.props["aria-expanded"]).toBe(false);
  expect(
    nodes(tree).find((node) => node.props.id === "inventory-filters")!.props
      .className,
  ).toContain("lg:block");
  call(toggle, "onClick");
  choose(1, "asicMiner");
  choose(3, "equipped");
  tree = draw();
  expect(
    nodes(tree).find(
      (node) => node.props["aria-controls"] === "inventory-filters",
    )!.props["aria-expanded"],
  ).toBe(true);
  expect(text(tree)).toContain("Filters (2)");
  expect(ids(tree)).toEqual(["d"]);
});

it("offers owned-chest navigation or buying, never an opening link to Shop", () => {
  props.items = [];
  let tree = draw();
  expect(text(tree)).toContain("No equipment yet");
  expect(
    nodes(tree).find((node) => node.props.href === "/shop")!.props.children,
  ).toBe("Buy chests");
  props.hasOwnedChests = true;
  tree = draw();
  call(button(tree, "View chests"), "onClick");
  expect(props.onViewChests).toHaveBeenCalledOnce();
});

it("separates loading and unavailable data from empty inventory and disables stale actions", () => {
  props.loaded = false;
  expect(text(draw())).toContain("Loading equipment");
  expect(cards(draw())).toHaveLength(0);
  props.unavailable = true;
  expect(text(draw())).not.toContain("No equipment yet");
  props.loaded = true;
  props.actionsDisabled = true;
  const tree = draw();
  expect(text(tree)).toContain("Stale");
  expect(cards(tree)).toHaveLength(4);
  expect(cards(tree).every((card) => card.props.actionsDisabled === true)).toBe(
    true,
  );
});

it("keeps Inventory names wrapping and actions accessible without changing reward or marketplace layouts", async () => {
  const item = {
    ...rows[0],
    name: "Averylongequipmentnamewithoutspaces that should wrap",
  };
  const equip = vi.fn();
  const render = (extra: Partial<Parameters<typeof EquipmentCard>[0]> = {}) =>
    scope.render(() => EquipmentCard({ item, onEquip: equip, ...extra }));
  let tree = render();
  expect(
    nodes(tree).find((node) => node.type === "h3")!.props.className,
  ).toContain("overflow-wrap:anywhere");
  expect(button(tree, "Equip").props.className).toContain("min-h-11");
  call(button(tree, "Equip"), "onClick");
  await Promise.resolve();
  expect(equip).toHaveBeenCalledExactlyOnceWith(item);
  tree = render({ actionsDisabled: true });
  call(button(tree, "Equip"), "onClick");
  await Promise.resolve();
  expect(equip).toHaveBeenCalledOnce();
  expect(button(tree, "More actions").props.disabled).toBe(true);
  tree = render({ hideActions: true });
  expect(
    nodes(tree).find((node) => node.type === "h3")!.props.className,
  ).toContain("truncate");
  expect(button(tree, "Equip")).toBeUndefined();
  tree = render({ variant: "marketplace" });
  expect(text(tree)).toContain("Power");
  expect(button(tree, "Equip").props.className).not.toContain("min-h-11");
});

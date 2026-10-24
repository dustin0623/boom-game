import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import type { MarketListingDto } from "@/lib/api/types";
import { HookHarness } from "@/tests/helpers/hook-harness";

const m = vi.hoisted(() => ({
  auth: {
    mode: "wallet" as string | null,
    address: "alice" as string | null,
    connectedAt: 1,
    apiConnected: true,
    isRegistered: true,
  },
  listeners: new Set<(state: unknown) => void>(),
  listings: vi.fn(),
  balance: vi.fn(),
  buy: vi.fn(),
  cancel: vi.fn(),
  notify: vi.fn(),
  available: true,
  configured: true,
}));
let scope: HookHarness;
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (...args: Parameters<HookHarness["useState"]>) =>
    scope.useState(...args),
  useRef: (...args: Parameters<HookHarness["useRef"]>) => scope.useRef(...args),
  useEffect: (...args: Parameters<HookHarness["useEffect"]>) =>
    scope.useEffect(...args),
  useMemo: (...args: Parameters<HookHarness["useMemo"]>) =>
    scope.useMemo(...args),
  useCallback: (...args: Parameters<HookHarness["useCallback"]>) =>
    scope.useCallback(...args),
}));
vi.mock("@/features/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (select: (state: typeof m.auth) => unknown) => select(m.auth),
    {
      getState: () => m.auth,
      subscribe: (listener: (state: unknown) => void) => {
        m.listeners.add(listener);
        return () => {
          m.listeners.delete(listener);
        };
      },
    },
  ),
}));
vi.mock("@/features/stores/workerStore", () => ({
  useWorkerStore: (select: (state: { available: boolean }) => unknown) =>
    select({ available: m.available }),
}));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/lib/api/client", () => ({
  getMarketListings: m.listings,
  getWalletBalance: m.balance,
  cancelMarketListing: m.cancel,
}));
vi.mock("@/features/events/frontend/purchase-market-item/client", () => ({
  purchaseMarketItem: m.buy,
}));
vi.mock("@/lib/utils/hive/wallet", () => ({
  isMarketPaymentConfigured: () => m.configured,
}));
vi.mock("@/lib/notify", () => ({ notify: m.notify }));
vi.mock("@/components/auth/ConnectWalletModal", () => ({
  ConnectWalletModal: "connect",
}));
vi.mock("@radix-ui/react-tabs", () => ({
  Root: "tabs",
  List: "tabs-list",
  Trigger: "tab",
  Content: "tab-content",
}));
vi.mock("@radix-ui/react-select", () => ({ Root: "select", Value: "value" }));
vi.mock("@/components/ui/select", () => ({
  SelectTrigger: "select-trigger",
  SelectContent: "options",
  SelectItem: "option",
}));
vi.mock("@radix-ui/react-dropdown-menu", () => ({
  Root: "dropdown",
  Trigger: "trigger",
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenuContent: "menu",
  DropdownMenuItem: "menu-item",
  DropdownMenuCheckboxItem: "checkbox",
}));

import { MarketplacePage } from "./MarketplacePage";
import { EquipmentCard } from "@/components/cards/EquipmentCard";
import { MarketFilters } from "@/components/marketplace/MarketFilters";

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
  key: string,
  ...args: unknown[]
) => (node.props[key] as (...args: unknown[]) => unknown)(...args);
const button = (tree: ReactNode, label: string) =>
  nodes(tree).find(
    (node) => typeof node.props.onClick === "function" && text(node) === label,
  )!;
const byLabel = (tree: ReactNode, label: string) =>
  nodes(tree).find((node) => node.props["aria-label"] === label)!;
const draw = () => scope.render(MarketplacePage);
const filters = (tree: ReactNode) =>
  nodes(tree).find((node) => node.type === MarketFilters)!;
const cards = (tree: ReactNode) =>
  nodes(tree).filter((node) => node.type === EquipmentCard);
const ids = (tree: ReactNode) =>
  cards(tree).map((node) => (node.props.item as { id: string }).id);
const chooseSort = (tree: ReactNode, value: string) =>
  call(
    nodes(tree).find((node) => node.type === "select")!,
    "onValueChange",
    value,
  );
const chooseTab = (tree: ReactNode, value: string) =>
  call(
    nodes(tree).find((node) => node.type === "tabs")!,
    "onValueChange",
    value,
  );
const changeSearch = (tree: ReactNode, value: string) =>
  call(byLabel(tree, "Search equipment name"), "onChange", {
    target: { value },
  });
function footer(card: ReactElement<Record<string, unknown>>) {
  const node = card.props.footer as ReactElement<Record<string, unknown>>;
  return (node.type as (props: Record<string, unknown>) => ReactElement)(
    node.props,
  );
}
const rows: MarketListingDto[] = [
  {
    currency: "HIVE",
    refId: "a",
    owner: "alice",
    price: 0.1,
    listedAt: 100,
    name: "Alpha miner",
    slot: "asicMiner",
    rarity: "common",
    level: 1,
    stats: { hashRate: 1 },
  },
  {
    currency: "HIVE",
    refId: "b",
    owner: "a-very-long-seller-name",
    price: 0.25,
    listedAt: 300,
    name: "Beta network module with an exceptionally long equipment name",
    slot: "networkModule",
    rarity: "rare",
    level: 3,
    stats: { hashRate: 4, luck: 0.1234 },
  },
  {
    currency: "HIVE",
    refId: "c",
    owner: "alice",
    price: 1.25,
    listedAt: 200,
    name: "Gamma cooler",
    slot: "coolingSystem",
    rarity: "epic",
    level: 2,
    stats: { hashRate: 2 },
  },
];
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
async function ready() {
  draw();
  await flush();
  return draw();
}
function replace(change: Partial<typeof m.auth>) {
  m.auth = { ...m.auth, ...change };
  for (const listener of m.listeners) listener(m.auth);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  scope = new HookHarness();
  Object.assign(m.auth, {
    mode: "wallet",
    address: "alice",
    connectedAt: 1,
    apiConnected: true,
    isRegistered: true,
  });
  m.available = m.configured = true;
  m.listings.mockResolvedValue({ ok: true, listings: rows });
  m.balance.mockResolvedValue({
    ok: true,
    balance: 10,
    symbol: "HIVE",
    precision: 3,
  });
  m.buy.mockResolvedValue({ ok: true });
  m.cancel.mockResolvedValue({ ok: true });
});
afterEach(() => {
  scope.unmount();
  m.listeners.clear();
  vi.useRealTimers();
});

it("keeps filters and sort across Browse/My listings, including own items in Browse", async () => {
  let tree = await ready();
  expect(ids(tree)).toEqual(["b", "c", "a"]);
  chooseSort(tree, "price-desc");
  chooseTab(draw(), "mine");
  tree = draw();
  expect(ids(tree)).toEqual(["c", "a"]);
  changeSearch(tree, "Alpha");
  expect(ids(draw())).toEqual(["a"]);
  chooseTab(draw(), "browse");
  tree = draw();
  expect(ids(tree)).toEqual(["a"]);
  call(button(tree, "Clear filters"), "onClick");
  tree = draw();
  expect(ids(tree)).toEqual(["c", "b", "a"]);
  expect(m.listings).toHaveBeenCalledTimes(1);
});

it("supports every explicit sort direction using raw numeric values", async () => {
  let tree = await ready();
  for (const [sort, expected] of [
    ["listed-desc", ["b", "c", "a"]],
    ["listed-asc", ["a", "c", "b"]],
    ["price-asc", ["a", "b", "c"]],
    ["price-desc", ["c", "b", "a"]],
    ["score-desc", ["b", "c", "a"]],
    ["score-asc", ["a", "c", "b"]],
    ["level-desc", ["b", "c", "a"]],
    ["level-asc", ["a", "c", "b"]],
  ] as const) {
    chooseSort(tree, sort);
    tree = draw();
    expect(ids(tree), sort).toEqual(expected);
  }
});

it("combines search, single slot, multiple rarities and removable chips", async () => {
  let tree = await ready();
  call(filters(tree), "onRarity", "rare");
  call(filters(draw()), "onRarity", "epic");
  expect(ids(draw())).toEqual(["b", "c"]);
  call(filters(draw()), "onSlot", "networkModule");
  changeSearch(draw(), "BETA");
  tree = draw();
  expect(ids(tree)).toEqual(["b"]);
  call(byLabel(tree, "Remove filter: Rare"), "onClick");
  expect(text(draw())).toContain("No listings match your filters");
  chooseTab(draw(), "mine");
  chooseSort(draw(), "price-asc");
  call(filters(draw()), "onClear");
  tree = draw();
  expect(ids(tree)).toEqual(["a", "c"]);
  expect(nodes(tree).find((node) => node.type === "select")!.props.value).toBe(
    "price-asc",
  );
  expect(byLabel(tree, "Active listing filters")).toBeUndefined();
});

it("accepts milli-HIVE limits and preserves the last valid cap on malformed drafts", async () => {
  await ready();
  for (const [input, expected] of [
    ["0.001", []],
    ["0.1", ["a"]],
    ["1.250", ["b", "c", "a"]],
  ] as const) {
    call(filters(draw()), "onMaxPrice", input);
    expect(ids(draw())).toEqual(expected);
    expect(filters(draw()).props.priceError).toBeUndefined();
  }
  call(filters(draw()), "onMaxPrice", "0.1");
  for (const invalid of ["0.0001", "abc", "-1", "1e3", "9007199254740992"]) {
    call(filters(draw()), "onMaxPrice", invalid);
    expect(ids(draw())).toEqual(["a"]);
    expect(filters(draw()).props.maxPrice).toBe(invalid);
    expect(filters(draw()).props.priceError).toContain("previous valid limit");
  }
  call(byLabel(draw(), "Remove filter: Max 0.1 HIVE"), "onClick");
  expect(ids(draw())).toHaveLength(3);
});

it("starts mobile filters collapsed with desktop visibility and accessible controls", async () => {
  let tree = await ready();
  const toggle = nodes(tree).find(
    (node) => node.props["aria-controls"] === "market-filters",
  )!;
  expect(toggle.props["aria-expanded"]).toBe(false);
  call(toggle, "onClick");
  tree = draw();
  expect(filters(tree).props.open).toBe(true);
  const content = MarketFilters(
    filters(tree).props as Parameters<typeof MarketFilters>[0],
  );
  expect(content.props.className).toContain("lg:block");
  expect(
    nodes(content).find((node) => node.props.id === "market-max-price")!.props
      .inputMode,
  ).toBe("decimal");
  expect(
    cards(tree).every((card) => card.props.variant === "marketplace"),
  ).toBe(true);
});

it("distinguishes initial loading, unavailable balances, read failure and same-session stale listings", async () => {
  const pending = deferred<{ ok: false }>();
  m.balance.mockReturnValueOnce(pending.promise);
  let tree = draw();
  expect(text(tree)).toContain("Loading listings...");
  expect(text(tree)).toContain("Loading...");
  await flush();
  pending.resolve({ ok: false });
  await flush();
  tree = draw();
  expect(text(tree)).toContain("Unavailable");
  expect(text(tree)).not.toContain("0 HIVE");
  m.listings.mockResolvedValueOnce({ ok: false });
  call(button(tree, "Refresh"), "onClick");
  await flush();
  tree = draw();
  expect(text(tree)).toContain("showing stale listings");
  expect(cards(tree)).toHaveLength(3);
  replace({ address: "bob", connectedAt: 2 });
  m.listings.mockResolvedValueOnce({ ok: false });
  draw();
  await flush();
  tree = draw();
  expect(text(tree)).toContain("Marketplace is unavailable");
  expect(cards(tree)).toHaveLength(0);
});

it("distinguishes empty marketplace, empty own listings and filtered results", async () => {
  m.listings.mockResolvedValueOnce({ ok: true, listings: [] });
  let tree = await ready();
  expect(text(tree)).toContain("No equipment listed yet");
  chooseTab(tree, "mine");
  tree = draw();
  expect(text(tree)).toContain("You have no listings yet");
  expect(nodes(tree).some((node) => node.props.href === "/inventory")).toBe(
    true,
  );
  m.listings.mockResolvedValue({ ok: true, listings: rows });
  call(button(tree, "Refresh"), "onClick");
  await flush();
  tree = draw();
  changeSearch(tree, "missing");
  expect(text(draw())).toContain("No listings match your filters");
});

it("shows full sellers, exact proceeds and one guarded workflow per card action", async () => {
  let tree = await ready();
  const other = cards(tree)[0]!;
  expect(text(footer(other))).toContain("@a-very-long-seller-name");
  expect(text(footer(cards(tree)[2]!))).toContain("You receive 0.095 HIVE");
  call(button(footer(other), "Buy"), "onClick");
  tree = draw();
  expect(
    nodes(footer(cards(tree)[0]!)).find(
      (node) =>
        node.props.disabled === true &&
        typeof node.props.onClick === "function",
    ),
  ).toBeDefined();
  expect(m.buy).toHaveBeenCalledTimes(1);
  expect(m.buy.mock.calls[0]!.slice(0, 2)).toEqual(["b", 0.25]);
  await flush();
  tree = draw();
  call(button(footer(cards(tree)[2]!), "Cancel listing"), "onClick");
  expect(m.cancel).toHaveBeenCalledTimes(1);
  expect(m.cancel.mock.calls[0]![0]).toBe("a");
  await flush();
  expect(ids(draw())).toEqual(["b", "c"]);
});

it("retains registration, readiness and affordability restrictions before signing", async () => {
  let tree = await ready();
  m.auth.isRegistered = false;
  tree = draw();
  expect(
    button(footer(cards(tree)[0]!), "Register to buy").props.disabled,
  ).toBe(true);
  call(
    cards(tree)[0]!.props.footer as ReactElement<Record<string, unknown>>,
    "onBuy",
  );
  expect(m.buy).not.toHaveBeenCalled();
  m.auth.isRegistered = true;
  m.available = false;
  tree = draw();
  expect(
    button(footer(cards(tree)[0]!), "Backend unavailable").props.disabled,
  ).toBe(true);
  m.available = true;
  m.balance.mockResolvedValueOnce({ ok: true, balance: 0.01 });
  call(button(tree, "Refresh"), "onClick");
  await flush();
  tree = draw();
  expect(button(footer(cards(tree)[0]!), "Need 0.24 HIVE").props.disabled).toBe(
    true,
  );
  expect(m.buy).not.toHaveBeenCalled();
});

it.each(["logout", "switch", "reconnect"])(
  "hides previous reads and ignores late requests after %s",
  async (change) => {
    let tree = await ready();
    const pending = deferred<{ ok: true; listings: MarketListingDto[] }>();
    const balance = deferred<{ ok: true; balance: number }>();
    m.listings.mockReturnValueOnce(pending.promise);
    m.balance.mockReturnValueOnce(balance.promise);
    call(button(tree, "Refresh"), "onClick");
    replace(
      change === "logout"
        ? { mode: null, address: null, apiConnected: false }
        : { address: change === "switch" ? "bob" : "alice", connectedAt: 2 },
    );
    m.listings.mockResolvedValue({ ok: true, listings: [] });
    m.balance.mockResolvedValue({ ok: false });
    tree = draw();
    expect(cards(tree)).toHaveLength(0);
    expect(text(tree)).not.toContain("10 HIVE");
    await flush();
    pending.resolve({ ok: true, listings: rows });
    balance.resolve({ ok: true, balance: 999 });
    await flush();
    tree = draw();
    expect(cards(tree)).toHaveLength(0);
    expect(text(tree)).not.toContain("999 HIVE");
  },
);

it("ignores detached action completion and adds no polling timer or inline sales read", async () => {
  vi.useFakeTimers();
  let tree = await ready();
  const pending = deferred<{ ok: true }>();
  m.cancel.mockReturnValueOnce(pending.promise);
  call(button(footer(cards(tree)[2]!), "Cancel listing"), "onClick");
  replace({ address: "bob", connectedAt: 2 });
  tree = draw();
  await flush();
  tree = draw();
  pending.resolve({ ok: true });
  await flush();
  expect(ids(draw())).toHaveLength(3);
  const requests = m.listings.mock.calls.length;
  await vi.advanceTimersByTimeAsync(30_000);
  expect(m.listings).toHaveBeenCalledTimes(requests);
  expect(vi.getTimerCount()).toBe(0);
  expect(text(tree)).not.toContain("History");
  expect(m.notify).not.toHaveBeenCalled();
});

it("rejects stale card callbacks before signing and ignores pending reads after unmount", async () => {
  const tree = await ready();
  replace({ connectedAt: 2 });
  call(button(footer(cards(tree)[0]!), "Buy"), "onClick");
  call(button(footer(cards(tree)[2]!), "Cancel listing"), "onClick");
  expect(m.buy).not.toHaveBeenCalled();
  expect(m.cancel).not.toHaveBeenCalled();
  const pending = deferred<{ ok: true; listings: MarketListingDto[] }>();
  m.listings.mockReturnValueOnce(pending.promise);
  draw();
  scope.unmount();
  pending.resolve({ ok: true, listings: rows });
  await flush();
  expect(m.notify).not.toHaveBeenCalled();
});

it("preserves marketplace stats and Inventory actions with the shared top-right power header", async () => {
  const tree = await ready();
  const item = cards(tree)[0]!.props.item as Parameters<
    typeof EquipmentCard
  >[0]["item"];
  scope.unmount();
  scope = new HookHarness();
  const market = scope.render(() =>
    EquipmentCard({ item, variant: "marketplace", footer: "Buy" }),
  );
  expect(
    nodes(market).find((node) => node.type === "h3")!.props.className,
  ).toContain("break-words");
  expect(nodes(market).filter((node) => node.type === "li")).toHaveLength(2);
  expect(
    nodes(market).find(
      (node) => node.props.title === "Power score = SPARKS value if salvaged",
    )!.type,
  ).toBe("div");
  const inventory = scope.render(() => EquipmentCard({ item }));
  expect(
    nodes(inventory).find((node) => node.type === "h3")!.props.className,
  ).toContain("break-words");
  expect(
    nodes(inventory).find(
      (node) => node.props.title === "Power score = SPARKS value if salvaged",
    )!.type,
  ).toBe("div");
  expect(button(inventory, "Equip")).toBeDefined();
  expect(byLabel(inventory, "More actions")).toBeDefined();
  const reward = scope.render(() => EquipmentCard({ item, hideActions: true }));
  expect(
    nodes(reward).find((node) => node.type === "h3")!.props.className,
  ).toContain("truncate");
  expect(
    nodes(reward).find(
      (node) => node.props.title === "Power score = SPARKS value if salvaged",
    )!.type,
  ).toBe("div");
});

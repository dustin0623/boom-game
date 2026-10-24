import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import type { Equipment } from "@/features/types/game/types";
import type { ItemQuantities } from "@/features/types/game/inventory";
import { HookHarness } from "@/tests/helpers/hook-harness";
const m = vi.hoisted(() => ({
  auth: {
    mode: "wallet" as string | null,
    address: "alice" as string | null,
    connectedAt: 1,
    apiConnected: true,
    isRegistered: true,
  },
  inventory: {
    items: { equipment: 2 } as ItemQuantities,
    inventory: [] as Equipment[],
    loaded: true,
    error: null as string | null,
  },
  available: true,
  locks: {} as Record<string, string>,
  open: vi.fn(),
  sync: vi.fn(),
  notify: vi.fn(),
}));
let scope: HookHarness;
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (...args: Parameters<HookHarness["useState"]>) =>
    scope.useState(...args),
  useRef: (...args: Parameters<HookHarness["useRef"]>) => scope.useRef(...args),
  useEffect: (...args: Parameters<HookHarness["useEffect"]>) =>
    scope.useEffect(...args),
}));
vi.mock("@/features/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (select: (state: typeof m.auth) => unknown) => select(m.auth),
    { getState: () => m.auth },
  ),
}));
vi.mock("@/features/stores/inventoryStore", () => ({
  useInventoryStore: Object.assign(
    (select: (state: typeof m.inventory) => unknown) => select(m.inventory),
    { getState: () => ({ ...m.inventory, syncFromApi: m.sync }) },
  ),
}));
vi.mock("@/features/stores/workerStore", () => ({
  useWorkerStore: (select: (state: { available: boolean }) => unknown) =>
    select({ available: m.available }),
}));
vi.mock("@/features/stores/transactionStore", () => ({
  useTransactionStore: (
    select: (state: { submissionLocks: Record<string, string> }) => unknown,
  ) => select({ submissionLocks: m.locks }),
}));
vi.mock("@/lib/api/client", () => ({ openChest: m.open }));
vi.mock("@/lib/notify", () => ({ notify: m.notify }));
vi.mock("@/components/ui/button", () => ({ Button: "button" }));
vi.mock("@/components/modals/ChestModal", () => ({ ChestModal: "reward" }));
vi.mock("@radix-ui/react-tabs", () => ({ Root: "tabs" }));
vi.mock("@/components/ui/tabs", () => ({
  TabsList: "tab-list",
  TabsTrigger: "tab",
  TabsContent: "tab-content",
}));
import { InventoryPage } from "./InventoryPage";
import { InventoryItemCard } from "@/components/cards/InventoryItemCard";
import { EquipmentGrid } from "@/components/game/EquipmentGrid";
import { EquipmentActionDialog } from "@/components/modals/EquipmentActionDialog";
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
const draw = () => scope.render(InventoryPage);
const text = (node: ReactNode): string =>
  Array.isArray(node)
    ? node.map(text).join("")
    : node && typeof node === "object" && "props" in node
      ? text((node as ReactElement<{ children?: ReactNode }>).props.children)
      : typeof node === "string" || typeof node === "number"
        ? String(node)
        : "";
const button = (tree: ReactNode) =>
  nodes(tree).find(
    (node) => node.type === "button" && /Open one|Awaiting/.test(text(node)),
  )!;
const byText = (tree: ReactNode, label: string) =>
  nodes(tree).find(
    (node) => typeof node.props.onClick === "function" && text(node) === label,
  )!;
const cards = (tree: ReactNode) =>
  nodes(tree).filter((node) => node.type === InventoryItemCard);
const equipment = (tree: ReactNode) =>
  nodes(tree).find((node) => node.type === EquipmentGrid)!;
const chooseTab = (value: string) =>
  (draw().props.onValueChange as (value: string) => void)(value);
const reward = (tree: ReactNode) =>
  nodes(tree).find((node) => node.type === "reward")!;
const click = (tree: ReactNode) => (button(tree).props.onClick as () => void)();
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  scope = new HookHarness();
  vi.clearAllMocks();
  Object.assign(m.auth, {
    mode: "wallet",
    address: "alice",
    connectedAt: 1,
    apiConnected: true,
    isRegistered: true,
  });
  m.inventory = {
    items: { equipment: 2 },
    inventory: [],
    loaded: true,
    error: null,
  };
  m.available = true;
  m.locks = {};
  m.open.mockResolvedValue({ ok: false, error: "Cancelled" });
  m.sync.mockResolvedValue(true);
});
afterEach(() => scope.unmount());
it("blocks empty/unavailable inventory, readiness, registration and unresolved openings", () => {
  expect(button(draw()).props.disabled).toBe(false);
  m.inventory.items.equipment = 0;
  expect(button(draw())).toBeUndefined();
  m.inventory.items.equipment = 2;
  m.inventory.error = "Unavailable";
  expect(button(draw()).props.disabled).toBe(true);
  m.inventory.error = null;
  m.available = false;
  expect(button(draw()).props.disabled).toBe(true);
  m.available = true;
  m.auth.isRegistered = false;
  expect(button(draw()).props.disabled).toBe(true);
  m.auth.isRegistered = true;
  m.locks = { 'game:open_chest:{"itemId":"equipment"}': "lock" };
  expect(button(draw()).props.disabled).toBe(true);
  click(draw());
  expect(m.open).not.toHaveBeenCalled();
});
it("keeps opening mounted across tabs and the last unit disappearing, then presents the confirmed refreshed reward", async () => {
  const pending = deferred<{ ok: true; itemId: string }>();
  m.open.mockReturnValueOnce(pending.promise);
  const trigger = button(draw()).props.onClick as () => void;
  trigger();
  trigger();
  expect(button(draw()).props.disabled).toBe(true);
  expect(reward(draw()).props.open).toBe(false);
  expect(m.open).toHaveBeenCalledExactlyOnceWith(
    "equipment",
    expect.any(Function),
  );
  (m.open.mock.calls[0][1] as () => void)();
  chooseTab("equipment");
  const minted = { id: "minted", name: "Rig" } as Equipment;
  m.inventory.inventory = [minted];
  m.inventory.items.equipment = 0;
  expect(cards(draw())).toHaveLength(0);
  expect(reward(draw()).props.open).toBe(false);
  pending.resolve({ ok: true, itemId: "minted" });
  await flush();
  expect(reward(draw()).props).toMatchObject({ open: true, reward: minted });
  (reward(draw()).props.onClose as () => void)();
  expect(reward(draw()).props.open).toBe(false);
});
it("keeps uncertain submitted openings protected across unmount without another broadcast", async () => {
  m.open.mockImplementationOnce(
    async (_id: string, onSubmitted: () => void) => {
      m.locks = { 'game:open_chest:{"itemId":"equipment"}': "lock" };
      onSubmitted();
      return { ok: false, error: "Outcome uncertain" };
    },
  );
  click(draw());
  await flush();
  expect(m.notify).not.toHaveBeenCalled();
  expect(reward(draw()).props.open).toBe(false);
  scope.unmount();
  scope = new HookHarness();
  expect(button(draw()).props.disabled).toBe(true);
  click(draw());
  expect(m.open).toHaveBeenCalledTimes(1);
});
it.each(["switch", "reconnect", "logout", "unmount"])(
  "ignores detached rewards after %s",
  async (change) => {
    const pending = deferred<{ ok: true; itemId: string }>();
    m.open.mockReturnValueOnce(pending.promise);
    click(draw());
    if (change === "unmount") scope.unmount();
    else {
      m.auth = {
        ...m.auth,
        connectedAt: 2,
        address:
          change === "switch" ? "bob" : change === "logout" ? null : "alice",
        apiConnected: change !== "logout",
      };
      draw();
    }
    m.inventory.inventory = [{ id: "minted" } as Equipment];
    pending.resolve({ ok: true, itemId: "minted" });
    await flush();
    if (change !== "unmount") expect(reward(draw()).props.open).toBe(false);
    expect(m.notify).not.toHaveBeenCalled();
    expect(m.open).toHaveBeenCalledTimes(1);
  },
);
it("does not reveal a reward if the authoritative inventory refresh failed", async () => {
  m.open.mockResolvedValueOnce({ ok: true, itemId: "minted" });
  click(draw());
  m.inventory.error = "Refresh failed";
  await flush();
  expect(reward(draw()).props.open).toBe(false);
});

it("defaults to Items, shows owned stacks in order and uses a shared responsive card layout", () => {
  m.inventory.items = { "help-kit": 3, equipment: 2, "sabotage-device": 1 };
  let tree = draw();
  expect(tree.props.value).toBe("items");
  expect(
    nodes(tree)
      .filter((node) => node.type === "tab")
      .map(text),
  ).toEqual(["Items", "Equipment"]);
  expect(cards(tree).map((node) => node.props.itemId)).toEqual([
    "equipment",
    "sabotage-device",
    "help-kit",
  ]);
  for (const card of cards(tree)) {
    const rendered = InventoryItemCard(
      card.props as Parameters<typeof InventoryItemCard>[0],
    );
    expect(text(rendered)).toContain("Owned");
    expect(
      nodes(rendered).some((node) =>
        String(node.props.className).includes("truncate"),
      ),
    ).toBe(false);
  }
  expect(
    nodes(tree).some(
      (node) =>
        node.props.className === "grid gap-3 sm:grid-cols-2 xl:grid-cols-3",
    ),
  ).toBe(true);
  m.inventory.items = { equipment: 0, "help-kit": 0, "sabotage-device": 1 };
  tree = draw();
  expect(cards(tree).map((node) => node.props.itemId)).toEqual([
    "sabotage-device",
  ]);
  expect(
    nodes(tree)
      .filter((node) => node.type === "tab-content")
      .every((node) => node.props.forceMount === true),
  ).toBe(true);
  chooseTab("equipment");
  tree = draw();
  expect(
    nodes(tree).find(
      (node) => node.type === "tab-content" && node.props.value === "items",
    )!.props.hidden,
  ).toBe(true);
  // Rewards and action dialogs are siblings of tab content, never inside it.
  const panels = nodes(tree).filter((node) => node.type === "tab-content");
  expect(
    panels.every(
      (node) =>
        !nodes(node).some(
          (child) =>
            child.type === "reward" || child.type === EquipmentActionDialog,
        ),
    ),
  ).toBe(true);
});

it("distinguishes loading, empty, unavailable and stale inventory, disabling stale actions", () => {
  m.inventory.loaded = false;
  m.inventory.items = {};
  expect(text(draw())).toContain("Loading inventory");
  m.inventory.error = "Offline";
  expect(text(draw())).toContain("Inventory is unavailable");
  expect(text(draw())).not.toContain("No owned items");
  expect(cards(draw())).toHaveLength(0);
  m.inventory.loaded = true;
  m.inventory.error = null;
  expect(text(draw())).toContain("No owned items yet");
  expect(equipment(draw()).props.hasOwnedChests).toBe(false);
  m.inventory.items = { equipment: 2 };
  m.inventory.error = "Offline";
  expect(text(draw())).toContain("showing stale inventory");
  expect(button(draw()).props.disabled).toBe(true);
  expect(equipment(draw()).props.actionsDisabled).toBe(true);
});

it("View chests switches tabs and focuses the open control, falling back to the card when disabled", () => {
  const focus = vi.fn(),
    fallback = vi.fn();
  let tree = draw();
  (button(tree).props.ref as { current: unknown }).current = {
    disabled: false,
    focus,
  };
  (cards(tree)[0].props.cardRef as { current: unknown }).current = {
    focus: fallback,
  };
  chooseTab("equipment");
  (equipment(draw()).props.onViewChests as () => void)();
  expect(draw().props.value).toBe("items");
  expect(focus).toHaveBeenCalledOnce();
  tree = draw();
  (button(tree).props.ref as { current: unknown }).current = {
    disabled: true,
    focus,
  };
  chooseTab("equipment");
  (equipment(draw()).props.onViewChests as () => void)();
  draw();
  expect(fallback).toHaveBeenCalledOnce();
});

it("refreshes once at a time without timers, retains stale data on failure and retries", async () => {
  const pending = deferred<boolean>();
  m.sync.mockReturnValueOnce(pending.promise);
  vi.useFakeTimers();
  const clickRefresh = byText(draw(), "Refresh").props.onClick as () => void;
  clickRefresh();
  clickRefresh();
  expect(m.sync).toHaveBeenCalledOnce();
  expect(byText(draw(), "Refreshing…").props.disabled).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  pending.resolve(false);
  await flush();
  expect(text(draw())).toContain("showing stale inventory");
  expect(cards(draw())).toHaveLength(1);
  (byText(draw(), "Retry").props.onClick as () => void)();
  await flush();
  expect(text(draw())).not.toContain("showing stale inventory");
  expect(m.sync).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});

it("resets local selections on session replacement and ignores earlier refresh completion", async () => {
  const pending = deferred<boolean>();
  m.sync.mockReturnValueOnce(pending.promise);
  chooseTab("equipment");
  const oldKey = equipment(draw()).key;
  (byText(draw(), "Refresh").props.onClick as () => void)();
  m.auth = { ...m.auth, connectedAt: 2, address: "bob" };
  m.inventory.items = {};
  const tree = draw();
  expect(tree.props.value).toBe("items");
  expect(equipment(tree).key).not.toBe(oldKey);
  expect(byText(tree, "Refresh").props.disabled).toBe(false);
  pending.resolve(false);
  await flush();
  expect(text(draw())).not.toContain("showing stale inventory");
});

it("rejects earlier-session callbacks before opening, refreshing or selecting old equipment", () => {
  const tree = draw();
  const oldOpen = button(tree).props.onClick as () => void;
  const oldRefresh = byText(tree, "Refresh").props.onClick as () => void;
  const oldEquip = equipment(tree).props.onEquip as (item: Equipment) => void;
  const oldSell = equipment(tree).props.onSell as (item: Equipment) => void;
  m.auth = { ...m.auth, connectedAt: 2, address: "bob" };
  oldOpen();
  oldRefresh();
  oldEquip({ id: "old" } as Equipment);
  oldSell({ id: "old" } as Equipment);
  expect(m.open).not.toHaveBeenCalled();
  expect(m.sync).not.toHaveBeenCalled();
  const current = draw();
  expect(
    nodes(current).find((node) => node.type === EquipmentActionDialog)!.props
      .request,
  ).toBeNull();
});

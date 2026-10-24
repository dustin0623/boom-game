import { useTransactionStore } from "@/features/stores/transactionStore";
vi.mock("@/features/events/frontend/check-worker-readiness/client", () => ({
  requireWorkerReadiness: vi.fn(async (current: () => boolean) => {
    if (!current()) throw new Error("Wallet session changed before signing");
  }),
}));
vi.mock("@/features/stores/workerStore", () => ({
  useWorkerStore: Object.assign(
    (selector: (state: { available: boolean }) => unknown) => selector(worker),
    { getState: () => ({ ...worker, set: vi.fn() }) },
  ),
}));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const worker = vi.hoisted(() => ({ available: true }));
import type { ReactElement, ReactNode } from "react";
import { HookHarness } from "@/tests/helpers/hook-harness";

const auth = vi.hoisted(() => ({
  state: {
    mode: "wallet" as string | null,
    address: "alice" as string | null,
    connectedAt: 1,
    apiConnected: true,
    isRegistered: true,
  },
  listeners: new Set<() => void>(),
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
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) =>
    snapshot(),
  useDebugValue: () => {},
}));
vi.mock("@/features/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (selector: (s: typeof auth.state) => unknown) => selector(auth.state),
    {
      getState: () => ({ ...auth.state }),
      subscribe: (fn: () => void) => {
        auth.listeners.add(fn);
        return () => auth.listeners.delete(fn);
      },
    },
  ),
}));
vi.mock("@/features/stores/playerStore", async (original) => {
  const actual =
    await original<typeof import("@/features/stores/playerStore")>();
  return {
    ...actual,
    usePlayerStore: Object.assign(
      (
        selector: (
          state: ReturnType<typeof actual.usePlayerStore.getState>,
        ) => unknown,
      ) => selector(actual.usePlayerStore.getState()),
      actual.usePlayerStore,
    ),
  };
});
vi.mock("@/features/stores/inventoryStore", async (original) => {
  const actual =
    await original<typeof import("@/features/stores/inventoryStore")>();
  return {
    ...actual,
    useInventoryStore: Object.assign(
      (
        selector: (
          state: ReturnType<typeof actual.useInventoryStore.getState>,
        ) => unknown,
      ) => selector(actual.useInventoryStore.getState()),
      actual.useInventoryStore,
    ),
  };
});
vi.mock("@/features/stores/transactionStore", async (original) => {
  const actual =
    await original<typeof import("@/features/stores/transactionStore")>();
  return {
    ...actual,
    useTransactionStore: Object.assign(
      (
        selector: (
          state: ReturnType<typeof actual.useTransactionStore.getState>,
        ) => unknown,
      ) => selector(actual.useTransactionStore.getState()),
      actual.useTransactionStore,
    ),
  };
});
vi.mock("@/features/stores/raidStore", async (original) => {
  const actual = await original<typeof import("@/features/stores/raidStore")>();
  return {
    ...actual,
    useRaidStore: Object.assign(
      (
        selector: (
          state: ReturnType<typeof actual.useRaidStore.getState>,
        ) => unknown,
      ) => selector(actual.useRaidStore.getState()),
      actual.useRaidStore,
    ),
  };
});
vi.mock("@/lib/notify", () => ({ notify: vi.fn() }));
vi.mock("@/lib/chains/modules/hive/wallet/events/custom-json/action", () => ({
  broadcastCustomJson: vi.fn(),
}));
vi.mock(
  "@/features/events/frontend/confirm-transaction/client",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/features/events/frontend/confirm-transaction/client")
    >()),
    waitForTransaction: vi.fn(),
    TransactionRejected: class extends Error {},
  }),
);
vi.mock("@/components/cards/StatUpgradeCard", () => ({
  StatActionButton: "trigger",
  StatUpgradeCard: "stat-card",
}));
vi.mock("@radix-ui/react-dialog", () => ({
  Root: "dialog",
  Trigger: "dialog-trigger",
}));
vi.mock("@radix-ui/react-alert-dialog", () => ({ Root: "alert-dialog" }));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: "dialog",
  DialogContent: "content",
  DialogHeader: "header",
  DialogTitle: "title",
  DialogTrigger: "trigger",
  DialogDescription: "description",
  DialogFooter: "footer",
}));
vi.mock("@/components/ui/button", () => ({ Button: "button" }));
vi.mock("@/components/ui/input", () => ({ Input: "input" }));
vi.mock("@/components/ui/label", () => ({ Label: "label" }));
vi.mock("@/components/ui/slider", () => ({ Slider: "slider" }));
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: "alert-dialog",
  AlertDialogAction: "alert-action",
  AlertDialogCancel: "alert-cancel",
  AlertDialogContent: "alert-content",
  AlertDialogDescription: "alert-description",
  AlertDialogFooter: "alert-footer",
  AlertDialogHeader: "alert-header",
  AlertDialogTitle: "alert-title",
}));

import { ProfilePage } from "@/components/pages/ProfilePage";
import { InventoryPage } from "@/components/pages/InventoryPage";
import { EquipmentGrid } from "@/components/game/EquipmentGrid";
import { ActiveEffectsSection } from "@/components/game/ActiveEffectsSection";
import { StatUpgradeModal } from "./StatUpgradeModal";
import { VaultStakeModal } from "./VaultStakeModal";
import { EquipmentActionDialog } from "./EquipmentActionDialog";
import { PlayerModal } from "./PlayerModal";
import { HelpModal } from "./HelpModal";
import { SocialActionModal } from "./SocialActionModal";
import { EditCosmeticsModal } from "./EditCosmeticsModal";
import { usePlayerStore } from "@/features/stores/playerStore";
import { useInventoryStore } from "@/features/stores/inventoryStore";
import { broadcastCustomJson } from "@/lib/chains/modules/hive/wallet/events/custom-json/action";
import { waitForTransaction } from "@/features/events/frontend/confirm-transaction/client";
import type { Equipment, Rival } from "@/features/types/game/types";
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
      : String(node ?? "");
const find = (tree: ReactNode, type: string) =>
  nodes(tree).find((n) => n.type === type)!;
const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
beforeEach(() => {
  useTransactionStore.getState().begin(null);
  worker.available = true;
  vi.useFakeTimers();
  vi.clearAllMocks();
  scope = new HookHarness();
  auth.state = {
    mode: "wallet",
    address: "alice",
    connectedAt: 1,
    apiConnected: true,
    isRegistered: true,
  };
  usePlayerStore.getState().reset();
  useInventoryStore.getState().reset();
  vi.mocked(broadcastCustomJson).mockResolvedValue({
    ok: true,
    transactionId: "tx",
    username: "alice",
    status: "broadcast",
  });
  vi.mocked(waitForTransaction).mockResolvedValue({
    receipt: { status: "success" },
  } as never);
});
afterEach(() => {
  scope.unmount();
  vi.useRealTimers();
  auth.listeners.clear();
});
describe("wallet-only action dialogs", () => {
  it.each([true, undefined] as const)(
    "blocks the Help entry for eligibility %s and forwards it to the dialog",
    (eligibility) => {
      useInventoryStore.setState({ items: { "help-kit": 2 } });
      const refresh = vi.fn();
      const rival = {
        id: "bob",
        username: "bob",
        level: 1,
        hashRate: 1,
        sabotageActive: true,
        activeEffects: { hashRate: 0.5, security: 0.3 },
        helpBlockedByOwnSabotage: eligibility,
      } as unknown as Rival;
      const render = () =>
        scope.render(() =>
          PlayerModal({
            rival,
            open: true,
            onOpenChange: vi.fn(),
            onRaid: vi.fn(),
            raidBlockedReason: null,
            onSocialApplied: refresh,
          }),
        );
      let tree = render();
      const button = nodes(tree).find(
        (node) => node.type === "button" && text(node).includes("Help @bob"),
      )!;
      expect(button.props.disabled).toBe(true);
      (button.props.onClick as () => void)();
      tree = render();
      expect(
        nodes(tree).find((node) => node.type === HelpModal)!.props,
      ).toMatchObject({
        open: false,
        helpBlockedByOwnSabotage: eligibility,
      });
      expect(text(tree)).toContain(
        eligibility === true
          ? "You cannot help a player you have sabotaged."
          : "Refresh targets to check Help eligibility.",
      );
      if (eligibility === undefined) {
        const refreshButton = nodes(tree).find(
          (node) => node.type === "button" && text(node) === "Refresh targets",
        )!;
        (refreshButton.props.onClick as () => void)();
        expect(refresh).toHaveBeenCalledOnce();
      }
      rival.helpBlockedByOwnSabotage = false;
      tree = render();
      expect(
        nodes(tree).find(
          (node) => node.type === "button" && text(node).includes("Help @bob"),
        )!.props.disabled,
      ).toBe(false);
    },
  );

  it.each(["help", "sabotage"] as const)("adds the social base once in the %s dialog and reflects refreshed Luck", (kind) => {
    useInventoryStore.setState({ items: { "help-kit": 2, "sabotage-device": 2 }, loaded: true });
    const render = () => scope.render(() => SocialActionModal({
      kind, target: { id: "bob", username: "bob" }, open: true,
      onOpenChange: vi.fn(), sabotageActive: true,
      activeEffects: { security: 0.4 }, helpBlockedByOwnSabotage: false,
    }));
    expect(usePlayerStore.getState().stats.luck).toBe(0);
    expect(text(render())).toContain("Success chance: 25%");
    expect(text(render())).toContain("25% base success chance + your Luck, capped at 100%.");
    usePlayerStore.setState({ stats: { ...usePlayerStore.getState().stats, luck: 0.025 } });
    expect(text(render())).toContain("Success chance: 25.025%");
    usePlayerStore.setState({ stats: { ...usePlayerStore.getState().stats, luck: 80 } });
    expect(text(render())).toContain("Success chance: 100%");
    expect(broadcastCustomJson).not.toHaveBeenCalled();
  });

  it("shows only staking Luck on the profile instead of a general 25% base", () => {
    usePlayerStore.setState({ vaultStaked: 1 });
    const tree = scope.render(() => ProfilePage());
    const vault = nodes(tree).find((node) => node.props.title === "Vault size")!;
    expect(text(vault.props.meta as ReactNode)).toContain("+0.025% Luck from staking");
    expect(text(vault.props.meta as ReactNode)).not.toContain("25% base Luck");
  });

  it("blocks final Help submission when eligibility changes or is unavailable", async () => {
    useInventoryStore.setState({ items: { "help-kit": 2 }, loaded: true });
    let eligibility: boolean | undefined = false;
    const refresh = vi.fn();
    const render = () =>
      scope.render(() =>
        SocialActionModal({
          kind: "help",
          target: { id: "bob", username: "bob" },
          open: true,
          onOpenChange: vi.fn(),
          sabotageActive: true,
          activeEffects: { security: 0.4 },
          helpBlockedByOwnSabotage: eligibility,
          onApplied: refresh,
        }),
      );
    const submit = (tree: ReactNode) =>
      nodes(tree).find(
        (node) => node.type === "button" && text(node) === "Use Help",
      )!;
    expect(submit(render()).props.disabled).toBe(false);
    for (const value of [true, undefined]) {
      eligibility = value;
      const tree = render();
      expect(submit(tree).props.disabled).toBe(true);
      await (submit(tree).props.onClick as () => Promise<void>)();
      expect(broadcastCustomJson).not.toHaveBeenCalled();
      expect(text(tree)).toContain(
        value === true
          ? "You cannot help a player you have sabotaged."
          : "Refresh targets to check Help eligibility.",
      );
    }
    const refreshButton = nodes(render()).find(
      (node) => node.type === "button" && text(node) === "Refresh targets",
    )!;
    (refreshButton.props.onClick as () => void)();
    expect(refresh).toHaveBeenCalledOnce();
    eligibility = false;
    expect(submit(render()).props.disabled).toBe(false);
  });
  it("retains equipment action wiring in the Equipment tab without effects", () => {
    const tree = scope.render(() => InventoryPage());
    const all = nodes(tree);
    expect(all.some((node) => node.type === ActiveEffectsSection)).toBe(false);
    const gear = all.find((node) => node.type === EquipmentGrid)!;
    expect(gear.props.onEquip).toBeTypeOf("function");
    expect(gear.props.onUpgrade).toBeTypeOf("function");
    expect(gear.props.onSalvage).toBeTypeOf("function");
  });
  it("closes a cosmetic form once on submission without closing it again after confirmation", async () => {
    let resolve!: (value: never) => void;
    vi.mocked(waitForTransaction).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    usePlayerStore.setState({ xp: 1_000_000 });
    const onOpenChange = vi.fn();
    const render = () =>
      scope.render(() => EditCosmeticsModal({ open: true, onOpenChange }));
    const option = nodes(render()).find(
      (node) =>
        node.props.kind === "avatar" &&
        node.props.selected === false &&
        node.props.unlocked === true,
    )!;
    (option.props.onSelect as () => void)();
    const tree = render();
    (
      nodes(tree)
        .filter((node) => node.type === "button")
        .at(-1)!.props.onClick as () => void
    )();
    await flush();
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(useTransactionStore.getState().submitted).toHaveLength(1);
    resolve({ receipt: { status: "success" } } as never);
    await flush();
    expect(onOpenChange).toHaveBeenCalledOnce();
  });
  it("closes the sell form on broadcast and preserves its receipt wait through navigation", async () => {
    let resolve!: (value: never) => void;
    vi.mocked(waitForTransaction).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const item = {
      id: "item",
      name: "Miner",
      slot: "asicMiner",
      rarity: "common",
      stats: {},
      level: 1,
      equipped: false,
      createdAt: 1,
    } as Equipment;
    useInventoryStore.setState({
      inventory: [item],
      loaded: true,
      error: null,
    });
    const render = () => scope.render(() => InventoryPage());
    const tree = render();
    (
      nodes(tree).find((node) => typeof node.props.onSell === "function")!.props
        .onSell as (item: Equipment) => void
    )(item);
    expect(find(render(), "alert-dialog").props.open).toBe(true);
    (find(render(), "input").props.onChange as (e: unknown) => void)({
      target: { value: "5.125" },
    });
    (find(render(), "alert-action").props.onClick as (event: unknown) => void)({
      preventDefault: vi.fn(),
    });
    await flush();
    expect(find(render(), "alert-dialog").props.open).toBe(false);
    expect(useTransactionStore.getState().submitted).toHaveLength(1);
    expect(broadcastCustomJson).toHaveBeenCalledOnce();
    scope.unmount();
    resolve({ receipt: { status: "success" } } as never);
    await flush();
    expect(useTransactionStore.getState().submitted).toHaveLength(1);
  });
  it("allows a submitted form to reopen without retaining its completed display state", async () => {
    const render = () =>
      scope.render(() =>
        VaultStakeModal({ wallet: 100, vaultStaked: 0, hashRate: 1 }),
      );
    (find(render(), "dialog").props.onOpenChange as (open: boolean) => void)(
      true,
    );
    let tree = render();
    (find(tree, "input").props.onChange as (e: unknown) => void)({
      target: { value: "7" },
    });
    tree = render();
    (
      nodes(tree)
        .filter((node) => node.type === "button")
        .at(-1)!.props.onClick as () => void
    )();
    await flush();
    expect(find(render(), "dialog").props.open).toBe(false);
    (find(render(), "dialog").props.onOpenChange as (open: boolean) => void)(
      true,
    );
    tree = render();
    (find(tree, "input").props.onChange as (e: unknown) => void)({
      target: { value: "8" },
    });
    tree = render();
    expect(
      nodes(tree)
        .filter((node) => node.type === "button")
        .at(-1)!.props.disabled,
    ).toBe(false);
    expect(useTransactionStore.getState().submitted).toHaveLength(1);
  });
  it("closes immediately on submission and keeps tracking after the form unmounts", async () => {
    let resolve!: (value: never) => void;
    vi.mocked(waitForTransaction).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const close = vi.fn();
    const request = {
      kind: "equip" as const,
      item: { id: "item", name: "Miner", slot: "asicMiner" } as Equipment,
    };
    const render = () =>
      scope.render(() => EquipmentActionDialog({ request, onClose: close }));
    (
      nodes(render())
        .filter((node) => node.type === "button")
        .at(-1)!.props.onClick as () => void
    )();
    await flush();
    expect(close).toHaveBeenCalledOnce();
    expect(useTransactionStore.getState().submitted).toHaveLength(1);
    scope.unmount();
    expect(useTransactionStore.getState().submitted).toHaveLength(1);
    expect(
      vi.mocked(waitForTransaction).mock.calls[0][2]?.signal?.aborted,
    ).toBe(false);
    resolve({ receipt: { status: "success" } } as never);
    await flush();
    expect(close).toHaveBeenCalledOnce();
  });
  it("disables new equipment signing while unavailable but keeps dismissal available", () => {
    worker.available = false;
    const onClose = vi.fn();
    const tree = scope.render(() =>
      EquipmentActionDialog({
        request: {
          kind: "equip",
          item: { id: "item", name: "Miner", slot: "asicMiner" } as Equipment,
        },
        onClose,
      }),
    );
    const buttons = nodes(tree).filter((node) => node.type === "button");
    expect(buttons.at(-1)!.props.disabled).toBe(true);
    expect(buttons.at(-1)!.props.loading).toBe(false);
    (find(tree, "dialog").props.onOpenChange as (value: boolean) => void)(
      false,
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(broadcastCustomJson).not.toHaveBeenCalled();
  });
  it("pauses an already-open equipment form when inventory becomes unavailable, preserving dismissal", () => {
    const onClose = vi.fn();
    const request = {
      kind: "equip" as const,
      item: { id: "item", name: "Miner" } as Equipment,
    };
    let disabled = false;
    const render = () =>
      scope.render(() =>
        EquipmentActionDialog({ request, onClose, actionsDisabled: disabled }),
      );
    expect(
      nodes(render())
        .filter((node) => node.type === "button")
        .at(-1)!.props.disabled,
    ).toBe(false);
    disabled = true;
    const tree = render();
    const buttons = nodes(tree).filter((node) => node.type === "button");
    expect(buttons.at(-1)!.props.disabled).toBe(true);
    expect(text(tree)).toContain("Refresh Inventory before confirming");
    (buttons.at(-1)!.props.onClick as () => void)();
    expect(broadcastCustomJson).not.toHaveBeenCalled();
    (find(tree, "dialog").props.onOpenChange as (open: boolean) => void)(false);
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("charges the displayed current-level cost and closes on submission before confirmation", async () => {
    let confirm!: (result: never) => void;
    vi.mocked(waitForTransaction).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          confirm = resolve;
        }),
    );
    const render = () =>
      scope.render(() =>
        StatUpgradeModal({
          statKey: "hashRate",
          label: "Hash Rate",
          currentLevel: 1,
          gearBonus: 0,
          wallet: 1,
        }),
      );
    let tree = render();
    (find(tree, "dialog").props.onOpenChange as (open: boolean) => void)(true);
    tree = render();
    expect(text(tree)).toContain("Total cost1 HASH");
    expect(find(tree, "input").props.max).toBe(1);
    const submit = nodes(tree)
      .filter((n) => n.type === "button")
      .at(-1)!;
    expect(submit.props.disabled).toBe(false);
    (submit.props.onClick as () => void)();
    await flush();
    expect(broadcastCustomJson).toHaveBeenCalledOnce();
    expect(
      JSON.parse(vi.mocked(broadcastCustomJson).mock.calls[0][0].json),
    ).toMatchObject({
      action: "upgrade_stat",
      metadata: { stat: "hashRate", levels: 1 },
    });
    expect(find(render(), "dialog").props.open).toBe(false);
    expect(useTransactionStore.getState().submitted).toHaveLength(1);
    expect(usePlayerStore.getState().statLevels.hashRate).toBe(1);
    confirm({ receipt: { status: "success" } } as never);
    await flush();
    expect(find(render(), "dialog").props.open).toBe(false);
    expect(broadcastCustomJson).toHaveBeenCalledOnce();
    expect(usePlayerStore.getState().statLevels.hashRate).toBe(1);
  });
  it("limits bulk selection by the real balance and displays the shared total", () => {
    let wallet = 5;
    const render = () =>
      scope.render(() =>
        StatUpgradeModal({
          statKey: "hashRate",
          label: "Hash Rate",
          currentLevel: 1,
          gearBonus: 0,
          wallet,
        }),
      );
    let tree = render();
    (find(tree, "dialog").props.onOpenChange as (open: boolean) => void)(true);
    tree = render();
    expect(find(tree, "input").props.max).toBe(2);
    (find(tree, "input").props.onChange as (event: unknown) => void)({
      target: { value: "2" },
    });
    tree = render();
    expect(text(tree)).toContain("Total cost5 HASH");
    expect(
      nodes(tree)
        .filter((n) => n.type === "button")
        .at(-1)!.props.disabled,
    ).toBe(false);
    wallet = 4.9999;
    tree = render();
    expect(find(tree, "input").props.max).toBe(1);
    expect(find(tree, "input").props.value).toBe(1);
    wallet = 0.9999;
    tree = render();
    expect(
      nodes(tree)
        .filter((n) => n.type === "button")
        .at(-1)!.props.disabled,
    ).toBe(true);
    expect(broadcastCustomJson).not.toHaveBeenCalled();
  });
  it("vault stake signs the original amount without spending local funds", async () => {
    const render = () =>
      scope.render(() =>
        VaultStakeModal({ wallet: 100, vaultStaked: 0, hashRate: 1 }),
      );
    let tree = render();
    (find(tree, "input").props.onChange as (e: unknown) => void)({
      target: { value: "7" },
    });
    tree = render();
    const buttons = nodes(tree).filter((n) => n.type === "button");
    (buttons.at(-1)!.props.onClick as () => void)();
    await flush();
    expect(broadcastCustomJson).toHaveBeenCalledOnce();
    expect(
      JSON.parse(vi.mocked(broadcastCustomJson).mock.calls[0][0].json).metadata,
    ).toMatchObject({ amount: 7 });
    expect(usePlayerStore.getState().vaultStaked).toBe(0);
  });
  it("equipment closes on submission without granting or removing local items", async () => {
    const item = {
      id: "item",
      name: "Miner",
      slot: "asicMiner",
      rarity: "common",
      stats: { hashRate: 0.5, hackPower: 2 },
      level: 1,
      equipped: false,
      createdAt: 0,
    } as Equipment;
    const onClose = vi.fn();
    const request = { kind: "salvage" as const, item };
    const render = () =>
      scope.render(() => EquipmentActionDialog({ request, onClose }));
    const tree = render();
    (
      nodes(tree)
        .filter((node) => node.type === "button")
        .at(-1)!.props.onClick as () => void
    )();
    await flush();
    render();
    expect(broadcastCustomJson).toHaveBeenCalledOnce();
    expect(useInventoryStore.getState().inventory).toEqual([]);
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("previews item upgrade cost and stat changes before signing", () => {
    usePlayerStore.setState({ sparks: 10 });
    const tree = scope.render(() =>
      EquipmentActionDialog({
        request: {
          kind: "upgrade",
          item: {
            id: "item",
            name: "Miner",
            slot: "asicMiner",
            rarity: "common",
            stats: { hashRate: 0.5, hackPower: 2 },
            level: 1,
            equipped: false,
            createdAt: 0,
          },
        },
        onClose: vi.fn(),
      }),
    );
    expect(text(tree)).toContain("Upgrade Item");
    expect(text(tree)).toContain("Upgrade this item for ~0.174 SPARKS");
    expect(text(tree)).toContain("Your SPARKS10→-0.174");
    expect(text(tree)).toContain("Level1→2");
    expect(text(tree)).toContain("Hash Rate0.5→0.525");
    expect(text(tree)).toContain("Hack Power2→2.1");
    expect(text(tree)).toContain("Every rolled stat gains 5% per level.");
  });
  it("previews salvage value and per-stat multipliers before signing", () => {
    const tree = scope.render(() =>
      EquipmentActionDialog({
        request: {
          kind: "salvage",
          item: {
            id: "item",
            name: "Miner",
            slot: "asicMiner",
            rarity: "common",
            stats: { hashRate: 0.5, hackPower: 2 },
            level: 1,
            equipped: false,
            createdAt: 0,
          },
        },
        onClose: vi.fn(),
      }),
    );
    expect(text(tree)).toContain("Salvage Item");
    expect(text(tree)).toContain("Salvage this item for 3.5 SPARKS");
    expect(text(tree)).toContain("Hash Rate0.5x52.5");
    expect(text(tree)).toContain("Hack Power2x0.51");
    expect(text(tree)).toContain("The item is destroyed in the process.");
    expect(text(tree)).toContain("Cancel");
    expect(text(tree)).toContain("Confirm with Hive Keychain");
  });
  it("keeps interrupted confirmation and transaction IDs in Submitted rather than the form", async () => {
    vi.mocked(waitForTransaction).mockRejectedValueOnce(
      new Error("Still awaiting processing"),
    );
    const render = () =>
      scope.render(() =>
        EquipmentActionDialog({
          request: {
            kind: "equip",
            item: { id: "item", name: "Miner", slot: "asicMiner" } as Equipment,
          },
          onClose: vi.fn(),
        }),
      );
    (
      nodes(render())
        .filter((node) => node.type === "button")
        .at(-1)!.props.onClick as () => void
    )();
    await flush();
    expect(useTransactionStore.getState().submitted).toMatchObject([
      { transactionId: "tx" },
    ]);
    expect(text(render())).not.toContain("Transaction: tx");
    expect(text(render())).not.toContain("Still awaiting processing");
  });
  it("a session replacement prevents delayed completion from closing another session", async () => {
    let complete!: (result: never) => void;
    vi.mocked(waitForTransaction).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const close = vi.fn();
    const request = {
      kind: "equip" as const,
      item: { id: "item", name: "Miner", slot: "asicMiner" } as Equipment,
    };
    const render = () =>
      scope.render(() => EquipmentActionDialog({ request, onClose: close }));
    (
      nodes(render())
        .filter((node) => node.type === "button")
        .at(-1)!.props.onClick as () => void
    )();
    await flush();
    render();
    expect(close).toHaveBeenCalledOnce();
    close.mockClear();
    auth.state.connectedAt = 2;
    for (const fn of auth.listeners) fn();
    render();
    complete({ receipt: { status: "success" } } as never);
    await flush();
    expect(close).not.toHaveBeenCalled();
  });
});

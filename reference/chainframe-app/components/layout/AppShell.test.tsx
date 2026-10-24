vi.mock("@/features/stores/workerStore", () => ({
  useWorkerStore: (selector: (state: { available: boolean }) => unknown) =>
    selector({ available: state.workerAvailable }),
}));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { HookHarness } from "@/tests/helpers/hook-harness";
const state = vi.hoisted(() => ({
  path: "/dashboard",
  workerAvailable: true,
  auth: {
    mode: null as string | null,
    address: null as string | null,
    apiConnected: null as boolean | null,
    isRegistered: null as boolean | null,
  },
  player: { loaded: false, error: null as string | null, background: 200 },
  inventory: { loaded: false, error: null as string | null },
  poll: vi.fn(),
}));
let scope: HookHarness;
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
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: () => {},
  useState: (...args: Parameters<HookHarness["useState"]>) =>
    scope.useState(...args),
}));
vi.mock("next/navigation", () => ({ usePathname: () => state.path }));
vi.mock("next/link", () => ({ default: "link" }));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/hooks/usePersonalHistory", () => ({
  usePersonalHistory: state.poll,
}));
vi.mock("@/features/stores/authStore", () => ({
  useAuthStore: (selector: (s: typeof state.auth) => unknown) =>
    selector(state.auth),
}));
vi.mock("@/features/stores/playerStore", () => ({
  usePlayerStore: (selector: (s: typeof state.player) => unknown) =>
    selector(state.player),
}));
vi.mock("@/features/stores/inventoryStore", () => ({
  useInventoryStore: (selector: (s: typeof state.inventory) => unknown) =>
    selector(state.inventory),
}));
vi.mock("@/components/auth/ConnectGate", () => ({ ConnectGate: "gate" }));
vi.mock("@/components/auth/ConnectWalletModal", () => ({
  ConnectWalletModal: "registration",
}));
vi.mock("@/components/game/GameActivityPanel", () => ({
  GameActivityPanel: "activity-panel",
}));
vi.mock("@/components/layout/SidebarNav", () => ({ SidebarNav: "sidebar" }));
vi.mock("@/components/ui/sheet", () => ({
  Sheet: "sheet",
  SheetContent: "sheet-content",
  SheetTitle: "sheet-title",
}));
import { AppShell } from "./AppShell";
import { useTransactionStore } from "@/features/stores/transactionStore";
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
      : typeof node === "string"
        ? node
        : "";
beforeEach(() => {
  useTransactionStore.getState().begin(null);
  scope = new HookHarness();
  vi.clearAllMocks();
  state.path = "/dashboard";
  state.workerAvailable = true;
  state.auth = {
    mode: null,
    address: null,
    apiConnected: null,
    isRegistered: null,
  };
  state.player.loaded = false;
  state.inventory.loaded = false;
  state.player.error = null;
  state.inventory.error = null;
});
afterEach(() => scope.unmount());
const render = () =>
  scope.render(() => AppShell({ children: "protected-game" }));
describe("wallet-only application access", () => {
  it("keeps activity accessible after registration submission without admitting gameplay", () => {
    state.workerAvailable = false;
    state.auth = {
      mode: "wallet",
      address: "alice",
      apiConnected: true,
      isRegistered: false,
    };
    const key = JSON.stringify(["alice", undefined]);
    useTransactionStore.getState().begin(key);
    useTransactionStore.setState({ registrationSubmitted: true });
    const tree = render();
    expect(nodes(tree).some((n) => n.type === "activity-panel")).toBe(true);
    expect(nodes(tree).some((n) => n.type === "registration")).toBe(false);
    expect(text(tree)).not.toContain("protected-game");
    expect(nodes(tree).some((n) => n.type === "gate")).toBe(true);
    expect(text(tree)).toContain("Game processing is unavailable");
    expect(state.poll).toHaveBeenLastCalledWith(true);
  });
  it.each(["/", "/wiki"])("retains guest access to %s", (route) => {
    state.path = route;
    expect(text(render())).toContain("protected-game");
    expect(state.poll).toHaveBeenLastCalledWith(false);
  });
  it.each([
    "/marketplace",
    "/leaderboard",
    "/profile",
    "/shop",
    "/inventory",
    "/other",
  ])("requires authentication for %s", (route) => {
    state.path = route;
    expect(text(render())).not.toContain("protected-game");
    state.auth = {
      mode: "wallet",
      address: "alice",
      apiConnected: false,
      isRegistered: true,
    };
    expect(text(render())).not.toContain("protected-game");
  });
  it.each(["/marketplace", "/leaderboard"])(
    "allows authenticated browsing on %s without registration or gameplay caches",
    (route) => {
      state.path = route;
      state.auth = {
        mode: "wallet",
        address: "alice",
        apiConnected: true,
        isRegistered: false,
      };
      expect(text(render())).toContain("protected-game");
      expect(
        nodes(render())
          .filter((node) => node.type === "registration")
          .every((node) => node.props.open !== true),
      ).toBe(true);
      state.auth.isRegistered = null;
      expect(text(render())).toContain("protected-game");
      state.auth.apiConnected = null;
      expect(text(render())).not.toContain("protected-game");
    },
  );
  it("does not render gameplay for a guest", () => {
    const tree = render();
    expect(text(tree)).not.toContain("protected-game");
    expect(nodes(tree).some((n) => n.type === "gate")).toBe(true);
  });
  it("does not admit a persisted address without wallet mode and keeps public pages free of a forced gate", () => {
    state.auth = {
      mode: null,
      address: "alice",
      apiConnected: true,
      isRegistered: true,
    };
    state.player.loaded = true;
    state.inventory.loaded = true;
    expect(text(render())).not.toContain("protected-game");
    state.auth = {
      mode: "wallet",
      address: "alice",
      apiConnected: true,
      isRegistered: false,
    };
    for (const route of ["/", "/wiki"]) {
      state.path = route;
      expect(text(render())).toContain("protected-game");
      expect(
        nodes(render()).some(
          (node) => node.type === "registration" && node.props.open === true,
        ),
      ).toBe(false);
    }
  });
  it("waits for restored authentication without playing or requesting registration", () => {
    state.auth = {
      mode: "wallet",
      address: "alice",
      apiConnected: null,
      isRegistered: null,
    };
    const tree = render();
    expect(text(tree)).toContain("Restoring");
    expect(nodes(tree).some((n) => n.type === "registration")).toBe(false);
    expect(text(tree)).not.toContain("protected-game");
  });
  it("requires authoritative registration", () => {
    state.auth = {
      mode: "wallet",
      address: "alice",
      apiConnected: true,
      isRegistered: false,
    };
    const tree = render();
    expect(nodes(tree).some((n) => n.type === "registration")).toBe(true);
    expect(text(tree)).not.toContain("protected-game");
    expect(state.poll).toHaveBeenLastCalledWith(true);
  });
  it("waits for both authoritative caches and retains unavailable state", () => {
    state.auth = {
      mode: "wallet",
      address: "alice",
      apiConnected: true,
      isRegistered: true,
    };
    expect(text(render())).toContain("Waiting");
    state.player.loaded = true;
    expect(text(render())).not.toContain("protected-game");
    state.inventory.error = "unavailable";
    expect(text(render())).toContain("unavailable");
    state.inventory.error = null;
    state.inventory.loaded = true;
    expect(text(render())).toContain("protected-game");
  });
});

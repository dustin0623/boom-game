import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { HookHarness } from "@/tests/helpers/hook-harness";
const mocks = vi.hoisted(() => ({
  watches: vi.fn(),
  focus: vi.fn(),
  auth: {
    address: "alice" as string | null,
    mode: "wallet" as string | null,
    connectedAt: 1,
    apiConnected: true,
  },
}));
let scope: HookHarness;
vi.mock("@/features/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (selector: (state: unknown) => unknown) => selector(mocks.auth),
    { getState: () => ({ ...mocks.auth }) },
  ),
}));
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
  useState: (...args: Parameters<HookHarness["useState"]>) =>
    scope.useState(...args),
  useEffect: (...args: Parameters<HookHarness["useEffect"]>) =>
    scope.useEffect(...args),
  useRef: (...args: Parameters<HookHarness["useRef"]>) => scope.useRef(...args),
}));
vi.mock("hivexph-sdk", () => ({
  HiveClient: class {
    blocks = { watch: mocks.watches };
  },
}));
import { GameActivityPanel } from "./GameActivityPanel";
import { GameStatsPanel } from "./GameStatsPanel";
import { GameStatsChartModal } from "@/components/modals/GameStatsChartModal";
import {
  useTransactionStore,
  transactionSessionKey,
} from "@/features/stores/transactionStore";
import type { SubmittedTransaction } from "@/features/types/game/payments";

type Node = ReactElement<Record<string, unknown>>;
const nodes = (node: ReactNode): Node[] =>
  Array.isArray(node)
    ? node.flatMap(nodes)
    : node && typeof node === "object" && "props" in node
      ? [node as Node, ...nodes((node as Node).props.children as ReactNode)]
      : [];
const text = (node: ReactNode): string =>
  Array.isArray(node)
    ? node.map(text).join("")
    : node && typeof node === "object" && "props" in node
      ? text((node as Node).props.children as ReactNode)
      : typeof node === "string" || typeof node === "number"
        ? String(node)
        : "";
const render = () => scope.render(() => GameActivityPanel());
const trigger = (tree: ReactNode) =>
  nodes(tree).find((node) => node.props.id === "game-activity-trigger")!;
const selected = (tree: ReactNode) =>
  nodes(tree).find(
    (node) => node.props.role === "tab" && node.props["aria-selected"] === true,
  )!;
const click = (node: Node) => (node.props.onClick as () => void)();
function track(id: string, overrides: Partial<SubmittedTransaction> = {}) {
  useTransactionStore.getState().track({
    id,
    session: transactionSessionKey(mocks.auth)!,
    kind: "game",
    label: "Claim vault",
    transactionId: "tx-" + id,
    operationIndex: 0,
    type: "game_action",
    submittedAt: Date.now(),
    status: "submitted",
    ...overrides,
  });
}
function openChart() {
  let tree = render();
  click(nodes(tree).find((node) => node.props.id === "activity-tab-stats")!);
  tree = render();
  const stats = nodes(tree).find((node) => node.type === GameStatsPanel)!;
  (stats.props.onChart as (metric: string) => void)("claimed");
  return nodes(render()).find((node) => node.type === GameStatsChartModal)!;
}
beforeEach(() => {
  scope = new HookHarness();
  vi.clearAllMocks();
  vi.useFakeTimers();
  Object.assign(mocks.auth, {
    address: "alice",
    mode: "wallet",
    connectedAt: 1,
    apiConnected: true,
  });
  useTransactionStore.getState().begin(null);
  useTransactionStore.getState().begin(transactionSessionKey(mocks.auth));
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", {
    getElementById: vi.fn(() => ({ focus: mocks.focus })),
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
});
afterEach(() => {
  scope.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("starts on Stats, remembers the selected tab and creates no browser stream or timer", async () => {
  let tree = render();
  expect(nodes(tree).filter((node) => node.props.role === "tab")).toHaveLength(
    2,
  );
  expect(selected(tree).props.id).toBe("activity-tab-stats");
  expect(trigger(tree).props["aria-label"]).toBe("Game activity");
  expect(trigger(tree).props.className).toContain("min-h-11 min-w-11");
  expect(text(trigger(tree))).toBe("");
  click(trigger(tree));
  tree = render();
  click(
    nodes(tree).find((node) => node.props.id === "activity-tab-submitted")!,
  );
  tree = render();
  expect(text(tree)).toContain("No ongoing submissions.");
  expect(text(tree)).toContain("Awaiting backend confirmation.");
  click(trigger(tree));
  tree = render();
  click(trigger(tree));
  tree = render();
  expect(selected(tree).props.id).toBe("activity-tab-submitted");
  window.dispatchEvent(new Event("focus"));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(mocks.watches).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("counts all unresolved states exactly, retains valid links and ignores another session's entries", () => {
  track("submitted");
  track("unknown", {
    kind: "payment",
    type: "deposit",
    transactionId: null,
    status: "unknown",
    label: "Deposit 5 HASH",
  });
  track("delayed", { status: "delayed", label: "Withdraw request" });
  let tree = render();
  // Existing submissions must not defeat the initial Stats selection.
  expect(selected(tree).props.id).toBe("activity-tab-stats");
  expect(trigger(tree).props["aria-label"]).toBe(
    "Game activity, 3 ongoing submissions",
  );
  expect(text(trigger(tree))).toBe("3");
  click(
    nodes(tree).find((node) => node.props.id === "activity-tab-submitted")!,
  );
  tree = render();
  expect(text(tree)).toContain("Submission outcome uncertain");
  expect(text(tree)).toContain("Taking longer than expected");
  expect(text(tree)).toContain("Broadcast submitted");
  expect(text(tree)).toContain("just now");
  expect(
    nodes(tree)
      .filter((node) => node.type === "a")
      .map((node) => node.props.href),
  ).toEqual([
    "https://hivehub.dev/tx/tx-delayed",
    "https://hivehub.dev/tx/tx-submitted",
  ]);
  useTransactionStore.setState({ session: "another-session" });
  tree = render();
  expect(trigger(tree).props["aria-label"]).toBe("Game activity");
  expect(text(trigger(tree))).toBe("");
  expect(text(tree)).not.toContain("Deposit 5 HASH");
});

it("opens Submitted only for new broadcasts and never reopens or switches on receipt/removal updates", () => {
  render();
  track("new");
  let tree = render();
  expect(selected(tree).props.id).toBe("activity-tab-submitted");
  expect(trigger(tree).props["aria-expanded"]).toBe(true);
  expect(trigger(tree).props["aria-label"]).toBe(
    "Game activity, 1 ongoing submission",
  );
  click(nodes(tree).find((node) => node.props.id === "activity-tab-stats")!);
  tree = render();
  click(
    nodes(tree).find((node) => node.props["aria-label"] === "Close activity")!,
  );
  const session = transactionSessionKey(mocks.auth)!;
  useTransactionStore.getState().observe(session, [], [], []);
  useTransactionStore.getState().ready(session, true);
  useTransactionStore.getState().resolve(session, "new");
  tree = render();
  expect(trigger(tree).props["aria-expanded"]).toBe(false);
  expect(selected(tree).props.id).toBe("activity-tab-stats");
  expect(text(trigger(tree))).toBe("");
});

it("navigates two accessible tabs in both directions and with Home/End", () => {
  for (const [key, expected] of [
    ["ArrowRight", "submitted"],
    ["ArrowRight", "stats"],
    ["ArrowLeft", "submitted"],
    ["Home", "submitted"],
    ["End", "stats"],
  ]) {
    const tree = render();
    const preventDefault = vi.fn();
    (
      nodes(tree).find((node) => node.props.role === "tablist")!.props
        .onKeyDown as (event: unknown) => void
    )({ key, preventDefault });
    const updated = render();
    const tab = selected(updated);
    expect(tab.props.id).toBe("activity-tab-" + expected);
    expect(tab.props.tabIndex).toBe(0);
    const panel = nodes(updated).find(
      (node) => node.props.role === "tabpanel",
    )!;
    expect(tab.props["aria-controls"]).toBe(panel.props.id);
    expect(panel.props["aria-labelledby"]).toBe(tab.props.id);
    expect(document.getElementById).toHaveBeenLastCalledWith(tab.props.id);
    expect(preventDefault).toHaveBeenCalledOnce();
  }
});

it("opens charts separately, suppresses popover restoration and returns focus to the Stats metric", () => {
  const modal = openChart();
  let tree = render();
  expect(trigger(tree).props["aria-expanded"]).toBe(false);
  const preventDefault = vi.fn();
  (
    nodes(tree).find((node) => node.props.id === "game-activity-panel")!.props
      .onCloseAutoFocus as (event: unknown) => void
  )({ preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(modal.props.metric).toBe("claimed");
  (modal.props.onClose as () => void)();
  tree = render();
  expect(trigger(tree).props["aria-expanded"]).toBe(true);
  expect(selected(tree).props.id).toBe("activity-tab-stats");
  (modal.props.onRestoreFocus as () => void)();
  const frame = vi.mocked(requestAnimationFrame).mock.calls[0][0];
  frame(0);
  expect(document.getElementById).toHaveBeenLastCalledWith("game-stat-claimed");
  expect(mocks.focus).toHaveBeenCalledOnce();
});

it("gives new submissions priority over a chart and rejects its old close callback", () => {
  const modal = openChart();
  track("new");
  let tree = render();
  expect(nodes(tree).some((node) => node.type === GameStatsChartModal)).toBe(
    false,
  );
  expect(selected(tree).props.id).toBe("activity-tab-submitted");
  (modal.props.onClose as () => void)();
  tree = render();
  expect(selected(tree).props.id).toBe("activity-tab-submitted");
  expect(trigger(tree).props["aria-expanded"]).toBe(true);
});

it.each(["logout", "switch", "reconnect"])(
  "closes charts, clears visible data and rejects callbacks after %s",
  (change) => {
    track("old");
    const modal = openChart();
    mocks.auth.connectedAt = 2;
    if (change === "switch") mocks.auth.address = "bob";
    if (change === "logout") {
      mocks.auth.address = null;
      mocks.auth.mode = null;
      mocks.auth.apiConnected = false;
    }
    let tree = render();
    expect(nodes(tree).some((node) => node.type === GameStatsChartModal)).toBe(
      false,
    );
    expect(trigger(tree).props["aria-expanded"]).toBe(false);
    expect(selected(tree).props.id).toBe("activity-tab-stats");
    expect(text(trigger(tree))).toBe("");
    (modal.props.onClose as () => void)();
    (modal.props.onRestoreFocus as () => void)();
    tree = render();
    expect(trigger(tree).props["aria-expanded"]).toBe(false);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  },
);

it("cancels focus restoration and ignores detached chart callbacks after unmount", () => {
  const modal = openChart();
  (modal.props.onClose as () => void)();
  (modal.props.onRestoreFocus as () => void)();
  const frame = vi.mocked(requestAnimationFrame).mock.calls[0][0];
  scope.unmount();
  frame(0);
  (modal.props.onClose as () => void)();
  (modal.props.onRestoreFocus as () => void)();
  expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
  expect(requestAnimationFrame).toHaveBeenCalledOnce();
  expect(mocks.focus).not.toHaveBeenCalled();
});

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import type { Rival } from "@/features/types/game/types";
import { HookHarness } from "@/tests/helpers/hook-harness";

const mocks = vi.hoisted(() => ({
  rivals: [] as Rival[],
  refresh: vi.fn(),
  start: vi.fn(() => vi.fn()),
}));
let scope: HookHarness;
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (...args: Parameters<HookHarness["useState"]>) =>
    scope.useState(...args),
  useMemo: (...args: Parameters<HookHarness["useMemo"]>) =>
    scope.useMemo(...args),
  useEffect: (...args: Parameters<HookHarness["useEffect"]>) =>
    scope.useEffect(...args),
}));
vi.mock("@/features/stores/raidStore", () => ({
  useRaidStore: (selector: (state: unknown) => unknown) =>
    selector({
      rivals: mocks.rivals,
      loading: false,
      scaledFor: 20,
      refreshRivals: mocks.refresh,
      startPolling: mocks.start,
    }),
}));
vi.mock("@/hooks/useGameStats", () => ({
  useGameStats: () => ({
    total: { hackPower: 20 },
    vaultSpace: 1,
    raids: { current: 8, max: 8, msUntilNext: null },
  }),
}));
vi.mock("@/hooks/useGameActionFlow", () => ({
  useGameActionFlow: () => ({ lifecycle: "idle", unavailable: false }),
}));
vi.mock("@/components/modals/PlayerModal", () => ({
  PlayerModal: "player-modal",
}));
vi.mock("@/components/ui/button", () => ({ Button: "button" }));
import { RaidTable } from "./RaidTable";
import { TableRow } from "@/components/ui/table";

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
const render = () => scope.render(() => RaidTable());
beforeEach(() => {
  scope = new HookHarness();
  vi.clearAllMocks();
  mocks.rivals = [
    { id: "bob", username: "bob", vault: 0.163249, security: 10, firewall: 1 },
    {
      id: "carol",
      username: "carol",
      vault: 0.512349,
      security: 10,
      firewall: 1,
    },
  ] as Rival[];
});
afterEach(() => scope.unmount());

it("labels mobile and desktop estimates, formats fractions and sorts the same values", () => {
  let tree = render();
  expect(text(tree)).toContain(
    "The server determines actual amounts when the raid executes.",
  );
  expect(
    nodes(tree).filter(
      (node) =>
        (node.type === "p" || node.type === "button") &&
        text(node) === "Estimated vault",
    ),
  ).toHaveLength(3);
  const mobile = () =>
    nodes(tree).filter(
      (node) => node.props.className === "card-soft space-y-3 p-3",
    );
  const desktop = () =>
    nodes(tree).filter(
      (node) => node.type === TableRow && text(node).includes("Raid"),
    );
  for (const rows of [mobile(), desktop()]) {
    expect(rows).toHaveLength(2);
    expect(text(rows[0])).toContain("carol");
    expect(text(rows[0])).toContain("0.5123");
    expect(text(rows[1])).toContain("bob");
    expect(text(rows[1])).toContain("0.1632");
  }
  const sort = nodes(tree).find(
    (node) => node.type === "button" && text(node) === "Estimated vault",
  )!;
  (sort.props.onClick as () => void)();
  tree = render();
  expect(text(mobile()[0])).toContain("bob");
  expect(text(desktop()[0])).toContain("bob");
  expect(mocks.start).toHaveBeenCalledExactlyOnceWith(20);
  const refresh = nodes(tree).find(
    (node) => node.type === "button" && text(node) === "New targets",
  )!;
  (refresh.props.onClick as () => void)();
  expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith(20);
});

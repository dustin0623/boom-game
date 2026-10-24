import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import type { LeaderboardDto } from "@/lib/api/types";
import { HookHarness } from "@/tests/helpers/hook-harness";
const m = vi.hoisted(() => ({
  auth: {
    mode: "wallet" as string | null,
    address: "alice" as string | null,
    connectedAt: 1,
    apiConnected: true,
    isRegistered: true as boolean | null,
  },
  swr: vi.fn(),
  fetch: vi.fn(),
  mutate: vi.fn(async () => undefined),
  response: undefined as
    { wallet: string; connectedAt: number; data: LeaderboardDto } | undefined,
  error: undefined as unknown,
}));
let scope: HookHarness;
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (...args: Parameters<HookHarness["useState"]>) =>
    scope.useState(...args),
  useEffect: (...args: Parameters<HookHarness["useEffect"]>) =>
    scope.useEffect(...args),
}));
vi.mock("@/features/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (selector: (s: typeof m.auth) => unknown) => selector(m.auth),
    { getState: () => m.auth },
  ),
}));
vi.mock("swr", () => ({ default: m.swr }));
vi.mock("@/lib/api/client", () => ({ fetchLeaderboard: m.fetch }));
vi.mock("next/image", () => ({ default: "image" }));
import { LeaderboardPage } from "./LeaderboardPage";
import { LevelBadge } from "@/components/game/PlayerLevelHeader";
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
const data: LeaderboardDto = {
  ok: true,
  weights: { notoriety: 30, mining: 30, progression: 40 },
  asOf: Date.now(),
  page: 1,
  pageSize: 25,
  pageCount: 4,
  registeredPlayers: 200,
  displayedPlayers: 100,
  entries: [
    {
      rank: 1,
      username: "alice",
      avatarTemplateId: 0,
      level: 2,
      miningLevel: 7,
      notoriety: 45.163249,
      xp: 1200,
      score: 63.163249,
      points: { notoriety: 15, mining: 24, progression: 24.163249 },
    },
  ],
  self: {
    rank: 1,
    username: "alice",
    avatarTemplateId: 0,
    level: 2,
    miningLevel: 7,
    notoriety: 45.163249,
    xp: 1200,
    score: 63.163249,
    points: { notoriety: 15, mining: 24, progression: 24.163249 },
  },
};
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
  m.error = undefined;
  m.response = { wallet: "alice", connectedAt: 1, data };
  m.swr.mockImplementation(() => ({
    data: m.response,
    error: m.error,
    mutate: m.mutate,
    isLoading: false,
  }));
});
afterEach(() => scope.unmount());
const render = () => scope.render(() => LeaderboardPage());
it("shows the ranked mining level, Notoriety and experience with own rank and 25-row pagination", () => {
  const tree = render();
  expect(
    nodes(tree).filter((n) => n.props.role === "tab" || n.type === "tabs"),
  ).toHaveLength(0);
  expect(text(tree)).toContain("#1");
  expect(
    nodes(tree)
      .filter((node) => node.type === "th" && node.props.scope === "col")
      .map(text),
  ).toEqual(["Rank", "Player", "Minerate", "Notoriety", "Experience"]);
  expect(text(tree)).toContain("45.1632");
  expect(text(tree)).toContain("1,200 XP");
  expect(
    nodes(tree)
      .filter((node) => node.type === "td")
      .map(text),
  ).toEqual(["1", "7", "45.1632", "1,200 XP"]);
  expect(text(tree)).not.toContain("63.1632");
  expect(text(tree)).not.toContain("Breakdown");
  expect(nodes(tree).some((n) => n.props["aria-current"] === "true")).toBe(
    true,
  );
  const next = nodes(tree).find((n) => n.props.children === "Next")!;
  (next.props.onClick as () => void)();
  render();
  expect(m.swr.mock.lastCall?.[0]).toEqual(["leaderboard", "alice", 1, 2]);
});
it("retains failed-refresh data as stale, with explicit refresh and no recurring polling", async () => {
  m.error = Error("offline");
  const tree = render();
  expect(text(tree)).toContain("stale data");
  expect(m.swr.mock.lastCall?.[2]).toMatchObject({
    refreshInterval: 0,
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  });
  const refresh = nodes(tree).find((n) => n.props.children === "Refresh")!;
  (refresh.props.onClick as () => void)();
  await Promise.resolve();
  expect(m.mutate).toHaveBeenCalledOnce();
});
it("places the shared XP-derived player-level badge to the right of the username instead of a Level column", () => {
  const tree = render();
  const player = nodes(tree).find(
    (node) => node.type === "th" && node.props.scope === "row",
  )!;
  const badge = nodes(player).find((node) => node.type === LevelBadge)!;
  expect(badge.props.xp).toBe(1200);
  expect(
    nodes(player).findIndex((node) => node.type === LevelBadge),
  ).toBeGreaterThan(
    nodes(player).findIndex((node) => node.props.children === "alice"),
  );
  expect(LevelBadge({ xp: Number(badge.props.xp) }).props.title).toBe(
    "Level 2",
  );
  expect(nodes(tree).some((node) => node.type === "details")).toBe(false);
});
it("hides old data after logout, switching or reconnecting and guards fetches", async () => {
  render();
  const fetcher = m.swr.mock.lastCall?.[1] as (
    key: unknown,
  ) => Promise<unknown>;
  const key = m.swr.mock.lastCall?.[0];
  m.fetch.mockImplementationOnce(async (context) => {
    m.auth.connectedAt++;
    expect(context.isCurrent()).toBe(false);
    throw Error("Wallet session changed");
  });
  await expect(fetcher(key)).rejects.toThrow("session changed");
  expect(text(render())).not.toContain("45.1632");
  m.auth.connectedAt = 1;
  m.auth.address = "bob";
  expect(text(render())).not.toContain("45.1632");
  m.auth.apiConnected = false;
  render();
  expect(m.swr.mock.lastCall?.[0]).toBeNull();
});
it("shows unregistered and empty snapshots without fabricating a rank", () => {
  m.auth.isRegistered = false;
  m.response!.data = {
    ...data,
    self: null,
    entries: [],
    registeredPlayers: 0,
    pageCount: 0,
  };
  expect(text(render())).toContain("Register to enter the rankings");
  expect(text(render())).toContain("No registered players yet");
});

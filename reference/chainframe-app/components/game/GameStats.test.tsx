import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import type {
  GameStatsSummaryDto,
  GameStatsDailyDto,
  ShopPricesDto,
} from "@/lib/api/types";
import type { PublicStatEffects } from "@/features/types/game/stat-effects";
import { HookHarness } from "@/tests/helpers/hook-harness";
const state = vi.hoisted(() => ({
  auth: {
    address: "alice" as string | null,
    mode: "wallet" as string | null,
    connectedAt: 1,
    apiConnected: true,
  },
  swr: {
    data: undefined as
      | {
          wallet: string;
          connectedAt: number;
          data: GameStatsSummaryDto | GameStatsDailyDto;
        }
      | undefined,
    error: undefined as unknown,
    isLoading: false,
    mutate: vi.fn(async () => undefined),
  },
  useSWR: vi.fn(),
  fetch: vi.fn(),
  fetchPrices: vi.fn(),
  effects: {} as PublicStatEffects,
  pricing: {
    data: undefined as ShopPricesDto | undefined,
    error: undefined as unknown,
    isLoading: false,
    mutate: vi.fn(async () => undefined),
  },
}));
let scope: HookHarness;
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (...args: Parameters<HookHarness["useState"]>) =>
    scope.useState(...args),
}));
vi.mock("swr", () => ({ default: state.useSWR }));
vi.mock("@/lib/api/client", () => ({
  fetchGameStats: state.fetch,
  fetchShopPrices: state.fetchPrices,
}));
vi.mock("@/features/stores/playerStore", () => ({
  usePlayerStore: (select: (s: unknown) => unknown) =>
    select({ statEffects: state.effects }),
}));
vi.mock("@/features/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (selector: (auth: typeof state.auth) => unknown) => selector(state.auth),
    { getState: () => state.auth },
  ),
}));
vi.mock("@radix-ui/react-dialog", () => ({ Root: "dialog" }));
vi.mock("@/components/ui/dialog", () => ({
  DialogContent: "content",
  DialogHeader: "header",
  DialogTitle: "title",
  DialogDescription: "description",
}));
import { GameStatsData } from "./GameStatsData";
import type { GameStatsDataState } from "./GameStatsData";
import { GameStatsPanel } from "./GameStatsPanel";
import { ActiveEffectsSection } from "./ActiveEffectsSection";
import { DailyStatsChart } from "./DailyStatsChart";
import { GameStatsChartModal } from "@/components/modals/GameStatsChartModal";
import { GAME_STATS_METRICS, GAME_STATS_DEFINITIONS } from "@/lib/api/types";
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
const now = Date.parse("2026-10-14T12:00:00Z");
const summary: GameStatsSummaryDto = {
  ok: true,
  kind: "summary",
  asOf: now,
  mining: {
    registeredPlayers: 2,
    hashPerSecond: 0.0000001,
    hashPerDay: 0.00864,
  },
  totals: Object.fromEntries(
    GAME_STATS_METRICS.map((metric) => [
      metric,
      GAME_STATS_DEFINITIONS[metric].series.map(() => 0),
    ]),
  ) as GameStatsSummaryDto["totals"],
};
const daily: GameStatsDailyDto = {
  ok: true,
  kind: "daily",
  asOf: now,
  metric: "claimed",
  series: GAME_STATS_DEFINITIONS.claimed.series.map((entry) => ({ ...entry })),
  days: 30,
  points: [
    { day: "2026-10-13", values: [1.25, 1] },
    { day: "2026-10-14", values: [2.5, 2] },
  ],
  totals: [3.75, 3],
};
beforeEach(() => {
  scope = new HookHarness();
  vi.clearAllMocks();
  state.auth = {
    address: "alice",
    mode: "wallet",
    connectedAt: 1,
    apiConnected: true,
  };
  state.swr = {
    data: { wallet: "alice", connectedAt: 1, data: summary },
    error: undefined,
    isLoading: false,
    mutate: vi.fn(async () => undefined),
  };
  state.pricing = {
    data: {
      asOf: now,
      globalMinerate: 1,
      chests: { equipment: 100 },
      emission: {
        yesterday: 0,
        pricedAt: 100001.163249,
        threshold: 100000,
        excess: 1.163249,
      },
    },
    error: undefined,
    isLoading: false,
    mutate: vi.fn(async () => undefined),
  };
  state.effects = {};
  state.useSWR.mockImplementation((key) =>
    key?.[0] === "shop-prices"
      ? {
          ...state.pricing,
          data:
            key[1] === "alice" && key[2] === 1 ? state.pricing.data : undefined,
        }
      : state.swr,
  );
  vi.spyOn(Date, "now").mockReturnValue(now);
});
afterEach(() => {
  scope.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const readData = (props: Partial<Parameters<typeof GameStatsData>[0]> = {}) => {
  let result!: GameStatsDataState;
  GameStatsData({
    ...props,
    children: (view) => {
      result = view;
      return null;
    },
  });
  return result;
};
const renderPanel = (view: GameStatsDataState, onChart = vi.fn()) => {
  const tree = GameStatsPanel({ onChart });
  return (tree.props.children as (view: GameStatsDataState) => ReactNode)(view);
};
it("keeps mining numeric, exposes every activity chart and preserves tiny rates", () => {
  const onChart = vi.fn();
  const tree = renderPanel(readData(), onChart);
  expect(text(tree)).toContain("0.0000001 HASH/s");
  expect(text(tree)).toContain("0.0086 HASH/day");
  expect(
    nodes(tree).filter((node) =>
      node.props.id?.toString().startsWith("game-stat-"),
    ),
  ).toHaveLength(11);
  const button = nodes(tree).find(
    (node) => node.props.id === "game-stat-claimed",
  )!;
  (button.props.onClick as () => void)();
  expect(onChart).toHaveBeenCalledExactlyOnceWith("claimed");
  expect(
    nodes(tree)
      .filter((node) => node.type === "button")
      .some((node) => text(node).includes("Global mining rate")),
  ).toBe(false);
});
it("shows retry rather than fabricated zero values and retains stale successful data", () => {
  state.swr.error = new Error("unavailable");
  let view = readData();
  expect(view.stale).toBe(true);
  expect(text(renderPanel(view))).toContain("Showing saved values");
  state.swr.data = undefined;
  view = readData();
  const tree = renderPanel(view);
  expect(text(tree)).toContain("unavailable");
  expect(text(tree)).not.toContain("Registered players");
  const retry = nodes(tree).find((node) => node.type === "button")!;
  (retry.props.onClick as () => void)();
  expect(state.swr.mutate).toHaveBeenCalledOnce();
  expect(state.pricing.mutate).toHaveBeenCalledOnce();
});
it.each([0, 1.163249])(
  "shows exact server pricing excess %s independently of mining output",
  (excess) => {
    state.pricing.data!.emission.excess = excess;
    const tree = renderPanel(readData());
    expect(text(tree)).toContain(
      excess === 0 ? "0 HASH/day" : "1.1632 HASH/day",
    );
    expect(text(tree)).toContain("0.0086 HASH/day");
    expect(text(tree)).toContain(
      "100,000 HASH/day completed-day pricing threshold, based on recorded claims",
    );
    const all = nodes(tree);
    expect(
      all
        .filter((node) => node.type === "button")
        .some((node) => text(node).includes("Pricing excess")),
    ).toBe(false);
    expect(text(tree).indexOf("Pricing excess")).toBeLessThan(
      text(tree).indexOf("Lifetime completed activity"),
    );
  },
);
it("keeps mining and chart rows during pricing failures and marks only saved pricing stale", () => {
  state.pricing.error = Error("quote unavailable");
  let tree = renderPanel(readData());
  expect(text(tree)).toContain("Showing stale pricing");
  expect(text(tree)).toContain("0.0086 HASH/day");
  expect(
    nodes(tree).filter((node) =>
      node.props.id?.toString().startsWith("game-stat-"),
    ),
  ).toHaveLength(11);
  state.pricing.data = undefined;
  tree = renderPanel(readData());
  expect(text(tree)).toContain("Pricing excess is unavailable");
  const pricingRow = nodes(tree).find(
    (node) => node.type === "dl" && text(node).includes("Pricing excess"),
  )!;
  expect(text(pricingRow)).toContain("—");
  expect(text(pricingRow)).not.toContain("0 HASH/day");
});
it("reuses guarded session quote keys without introducing polling or cross-session pricing", async () => {
  renderPanel(readData());
  const [key, fetcher, options] = state.useSWR.mock.calls.find(
    (call) => call[0]?.[0] === "shop-prices",
  )!;
  expect(key).toEqual(["shop-prices", "alice", 1]);
  expect(options).toMatchObject({
    refreshInterval: 0,
    revalidateOnFocus: true,
    shouldRetryOnError: false,
    keepPreviousData: false,
  });
  state.fetchPrices.mockImplementationOnce(
    async ({ isCurrent }: { isCurrent: () => boolean }) => {
      expect(isCurrent()).toBe(true);
      state.auth.connectedAt++;
      expect(isCurrent()).toBe(false);
      throw Error("Wallet session changed");
    },
  );
  await expect(fetcher(key)).rejects.toThrow("session changed");
  expect(text(renderPanel(readData()))).not.toContain("1.1632 HASH/day");
  state.auth.address = "bob";
  expect(text(renderPanel(readData()))).not.toContain("1.1632 HASH/day");
  state.auth.apiConnected = false;
  renderPanel(readData());
  expect(state.useSWR.mock.lastCall?.[0]).toBeNull();
});
it("retains empty and helped critical effect presentation with accurate lifecycle text", () => {
  expect(text(ActiveEffectsSection())).toContain(
    "No stats are sabotaged right now",
  );
  state.effects = {
    hashRate: {
      strength: 0.123456,
      originalStrength: 0.5,
      critical: true,
      helped: true,
    },
  };
  const tree = ActiveEffectsSection();
  expect(text(tree)).toContain("Active effects (1)");
  expect(text(tree)).toContain("Critical sabotage");
  expect(text(tree)).toContain("reduced from -50%");
  expect(text(tree)).toContain("-12.3456%");
  expect(text(tree)).toContain("when you claim your vault or are raided");
  expect(text(tree)).not.toContain("expire on");
});
it("keys reads by wallet/session and disables polling and retry loops", async () => {
  readData({ metric: "claimed", days: 90 });
  const [key, fetcher, options] = state.useSWR.mock.calls[0];
  expect(key).toEqual(["game-stats", "alice", 1, "claimed", 90]);
  expect(options).toMatchObject({
    refreshInterval: 0,
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  });
  state.fetch.mockImplementation(
    async ({ isCurrent }: { isCurrent: () => boolean }) => {
      expect(isCurrent()).toBe(true);
      state.auth.connectedAt = 2;
      expect(isCurrent()).toBe(false);
      throw new Error("Wallet session changed");
    },
  );
  await expect(fetcher(key)).rejects.toThrow("Wallet session changed");
  expect(readData().data).toBeUndefined();
  state.auth.address = "bob";
  expect(readData().data).toBeUndefined();
  state.auth.apiConnected = false;
  readData();
  expect(state.useSWR.mock.calls.at(-1)![0]).toBeNull();
});
it("keeps a saved range explicitly stale while a different range is requested", () => {
  state.swr.data!.data = daily;
  expect(readData({ metric: "claimed", days: 90 }).stale).toBe(true);
  expect(readData({ metric: "stolen", days: 90 }).data).toBeUndefined();
});
it("uses one unit per SVG scale and makes daily values touch and keyboard accessible", () => {
  const focus = vi.fn();
  vi.stubGlobal("document", { getElementById: vi.fn(() => ({ focus })) });
  const render = () =>
    scope.render(() => DailyStatsChart({ data: daily, series: 0 }));
  let tree = render();
  expect(text(tree)).toContain("Period total: 3.75 HASH");
  expect(nodes(tree).find((node) => node.type === "svg")?.props.style).toEqual({
    minWidth: 600,
  });
  const bars = nodes(tree).filter(
    (node) => node.type === "rect" && node.props.role === "button",
  );
  expect(bars[0].props.height).toBe(155);
  (bars[1].props.onPointerDown as () => void)();
  tree = render();
  expect(text(tree)).toContain("2026-10-14 UTC: 2.5 HASH");
  const current = nodes(tree).find(
    (node) => node.props.id === "daily-stat-bar-1",
  )!;
  (current.props.onKeyDown as (event: unknown) => void)({
    key: "Home",
    preventDefault: vi.fn(),
  });
  expect(document.getElementById).toHaveBeenCalledWith("daily-stat-bar-0");
  expect(focus).toHaveBeenCalledOnce();
  expect(nodes(tree).some((node) => node.type === "table")).toBe(true);
  scope.unmount();
  scope = new HookHarness();
  const counts = scope.render(() =>
    DailyStatsChart({ data: daily, series: 1 }),
  );
  expect(text(counts)).toContain("Period total: 3");
  expect(text(counts)).not.toContain("HASH");
});
it("opens a responsive separate modal with ranges, series and controlled focus restoration", () => {
  const onClose = vi.fn(),
    onRestoreFocus = vi.fn();
  const render = () =>
    scope.render(() =>
      GameStatsChartModal({ metric: "claimed", onClose, onRestoreFocus }),
    );
  let tree = render();
  expect(tree.type).toBe("dialog");
  expect(
    nodes(tree).find((node) => node.type === "content")?.props.className,
  ).toContain("90dvh");
  const range = nodes(tree).find(
    (node) => node.type === "button" && text(node) === "90 days",
  )!;
  (range.props.onClick as () => void)();
  tree = render();
  expect(
    nodes(tree).find((node) => node.type === GameStatsData)?.props.days,
  ).toBe(90);
  const select = nodes(tree).find((node) => node.type === "select")!;
  (select.props.onChange as (event: unknown) => void)({
    target: { value: "1" },
  });
  tree = render();
  const renderData = nodes(tree).find((node) => node.type === GameStatsData)!
    .props.children as (state: GameStatsDataState) => ReactNode;
  const content = renderData({
    data: daily,
    loading: false,
    stale: true,
    unavailable: true,
    refresh: vi.fn(),
  });
  expect(text(content)).toContain("Showing saved 30-day data");
  expect(
    nodes(content).find((node) => node.type === DailyStatsChart)?.props.series,
  ).toBe(1);
  (tree.props.onOpenChange as (open: boolean) => void)(false);
  expect(onClose).toHaveBeenCalledOnce();
  (
    nodes(tree).find((node) => node.type === "content")!.props
      .onCloseAutoFocus as (event: unknown) => void
  )({ preventDefault: vi.fn() });
  expect(onRestoreFocus).toHaveBeenCalledOnce();
});

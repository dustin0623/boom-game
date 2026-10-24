import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { HookHarness } from "@/tests/helpers/hook-harness";
import type { ReferralsDto } from "@/lib/api/types";

let scope: HookHarness;
const m = vi.hoisted(() => ({
  auth: {
    mode: "wallet",
    address: "alice" as string | null,
    username: "alice",
    connectedAt: 1,
    apiConnected: true,
  },
  swr: vi.fn(),
  fetch: vi.fn(),
  refresh: vi.fn(async () => {}),
  close: vi.fn(),
  result: undefined as ReferralsDto | undefined,
  error: undefined as unknown,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (...args: Parameters<HookHarness["useState"]>) =>
    scope.useState(...args),
  useRef: (...args: Parameters<HookHarness["useRef"]>) => scope.useRef(...args),
  useEffect: (...args: Parameters<HookHarness["useEffect"]>) =>
    scope.useEffect(...args),
  useLayoutEffect: (...args: Parameters<HookHarness["useEffect"]>) =>
    scope.useEffect(...args),
}));
vi.mock("swr", () => ({ default: m.swr }));
vi.mock("@/features/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (select: (state: typeof m.auth) => unknown) => select(m.auth),
    { getState: () => m.auth },
  ),
}));
vi.mock("@/lib/api/client", () => ({ fetchReferrals: m.fetch }));
vi.mock("@radix-ui/react-dialog", () => ({ Root: "dialog" }));
vi.mock("@/components/ui/dialog", () => ({
  DialogContent: "section",
  DialogHeader: "header",
  DialogTitle: "h2",
}));
vi.mock("@/components/ui/button", () => ({ Button: "button" }));
import { ReferralModal } from "./ReferralModal";

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
const render = (open = true) =>
  scope.render(() => ReferralModal({ open, onClose: m.close }));
beforeEach(() => {
  scope = new HookHarness();
  vi.clearAllMocks();
  Object.assign(m.auth, {
    mode: "wallet",
    address: "alice",
    connectedAt: 1,
    apiConnected: true,
  });
  m.result = {
    ok: true,
    referralCode: "alice",
    referralCount: 2,
    referralEarned: 0.05,
    referralHiveEarned: 7.505,
    referred: [],
  };
  m.error = undefined;
  m.swr.mockImplementation(() => ({
    data: m.result,
    error: m.error,
    mutate: m.refresh,
  }));
  vi.stubGlobal("window", { location: { origin: "https://play.example" } });
});
afterEach(() => {
  scope.unmount();
  vi.unstubAllGlobals();
});

it("shows separate confirmed currencies, stale/unavailable states and explicit refresh without polling", () => {
  const tree = render();
  expect(text(tree)).toContain("0.05 HASH");
  expect(text(tree)).toContain("7.505 HIVE");
  expect(text(tree)).toContain("Paid to your Hive wallet");
  expect(text(tree)).toContain(
    "Marketplace trades and opening owned chests earn no reward",
  );
  expect(m.swr.mock.lastCall?.[0]).toEqual(["referrals", "alice", 1]);
  expect(m.swr.mock.lastCall?.[2]).toMatchObject({
    refreshInterval: 0,
    revalidateOnFocus: true,
    shouldRetryOnError: false,
    keepPreviousData: false,
  });
  (
    nodes(tree).find(
      (node) => node.type === "button" && text(node) === "Refresh",
    )!.props.onClick as () => void
  )();
  expect(m.refresh).toHaveBeenCalledOnce();
  m.error = Error("unavailable");
  expect(text(render())).toContain("totals are stale");
  expect(text(render())).toContain("7.505 HIVE");
  m.result = undefined;
  expect(text(render())).toContain("Referrals unavailable");
  expect(text(render())).not.toContain("0 HIVE");
});

it.each(["logout", "switch", "reconnect"])(
  "closes and hides prior-session data on %s and rejects detached reads",
  async (change) => {
    render();
    const [key, fetcher] = m.swr.mock.lastCall!;
    await fetcher(key);
    const guard = m.fetch.mock.lastCall![0].isCurrent as () => boolean;
    expect(guard()).toBe(true);
    if (change === "logout") m.auth.address = null;
    if (change === "switch") m.auth.address = "bob";
    if (change === "reconnect") m.auth.connectedAt = 2;
    const tree = render();
    expect(tree.props.open).toBe(false);
    expect(text(tree)).not.toContain("7.505 HIVE");
    expect(m.close).toHaveBeenCalledOnce();
    expect(guard()).toBe(false);
  },
);

it("fetches only while authenticated and open and invalidates reads after closing", async () => {
  render();
  const [key, fetcher] = m.swr.mock.lastCall!;
  await fetcher(key);
  const guard = m.fetch.mock.lastCall![0].isCurrent as () => boolean;
  render(false);
  expect(m.swr.mock.lastCall?.[0]).toBeNull();
  expect(guard()).toBe(false);
  m.auth.apiConnected = false;
  expect(render().props.open).toBe(false);
  expect(m.swr.mock.lastCall?.[0]).toBeNull();
});

it("enables guarded reads on initial opening and reopening", async () => {
  render(false);
  expect(m.swr.mock.lastCall?.[0]).toBeNull();
  for (let opening = 0; opening < 2; opening++) {
    render();
    const [key, fetcher] = m.swr.mock.lastCall!;
    await fetcher(key);
    expect(m.fetch.mock.lastCall![0].isCurrent()).toBe(true);
    render(false);
    expect(m.fetch.mock.lastCall![0].isCurrent()).toBe(false);
  }
});

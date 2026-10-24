import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { PERSONAL_HISTORY_CATEGORIES, type LogDto } from "@/lib/api/types";
import { HookHarness } from "@/tests/helpers/hook-harness";

const m = vi.hoisted(() => ({
  auth: {
    mode: "wallet" as string | null,
    address: "alice" as string | null,
    username: "alice",
    connectedAt: 1,
    apiConnected: true,
    isRegistered: false,
  },
  swr: vi.fn(),
  logs: vi.fn(),
  personal: vi.fn(),
  sales: vi.fn(),
  mutate: vi.fn(async () => undefined),
  data: undefined as { logs: LogDto[] } | undefined,
  error: undefined as unknown,
  loading: false,
  validating: false,
}));
let scope: HookHarness;
const scopes: HookHarness[] = [];
function render<T>(owner: HookHarness, fn: () => T): T {
  scope = owner;
  return owner.render(fn);
}
function harness() {
  const h = new HookHarness();
  scopes.push(h);
  return h;
}
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (...args: Parameters<HookHarness["useState"]>) =>
    scope.useState(...args),
  useRef: (...args: Parameters<HookHarness["useRef"]>) => scope.useRef(...args),
  useEffect: (...args: Parameters<HookHarness["useEffect"]>) =>
    scope.useEffect(...args),
}));
vi.mock("swr", () => ({ default: m.swr }));
vi.mock("@/features/stores/authStore", () => ({
  shortAddress: (address: string) => address,
  useAuthStore: Object.assign(
    (select: (auth: typeof m.auth) => unknown) => select(m.auth),
    { getState: () => m.auth },
  ),
}));
vi.mock("@/features/stores/playerStore", () => ({
  usePlayerStore: (select: (state: { xp: number }) => unknown) =>
    select({ xp: 0 }),
}));
vi.mock("@/lib/api/client", () => ({
  getActivityLogs: m.logs,
  getPersonalMarketHistory: m.personal,
  getMarketSales: m.sales,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/modals/ReferralModal", () => ({
  ReferralModal: "referrals",
}));
vi.mock("@/components/ui/dialog", () => ({
  DialogContent: "content",
  DialogTitle: "title",
  DialogHeader: "header",
  DialogDescription: "description",
}));
vi.mock("@radix-ui/react-dialog", () => ({ Root: "dialog" }));
vi.mock("@radix-ui/react-select", () => ({ Root: "select", Value: "value" }));
vi.mock("@/components/ui/select", () => ({
  SelectTrigger: "select-trigger",
  SelectContent: "options",
  SelectItem: "option",
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenuContent: "menu",
  DropdownMenuItem: "menu-item",
  DropdownMenuSeparator: "separator",
}));
vi.mock("@radix-ui/react-dropdown-menu", () => ({
  Root: "dropdown",
  Group: "group",
  Trigger: "trigger",
}));
import { HistoriesModal } from "./HistoriesModal";
import { AccountDropdown } from "@/components/layout/AccountDropdown";
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
function call(node: ReactElement<Record<string, unknown>>) {
  return (node.type as (props: Record<string, unknown>) => ReactElement)(
    node.props,
  );
}
const row = (id: string): LogDto => ({
  id,
  type: "claim",
  wallet: "alice",
  amount: 0.1632,
  createdAt: 1000,
});
function content() {
  const modal = HistoriesModal({
    open: true,
    onClose: vi.fn(),
    onRestoreFocus: vi.fn(),
  });
  return nodes(modal).find((node) => typeof node.type === "function")!;
}
function list(selection = "claims") {
  const tree = render(harness(), () => call(content()));
  const node = nodes(tree).find(
    (node) => typeof node.type === "function" && node.props.selection,
  )!;
  const owner = harness();
  const props = { ...node.props, selection };
  const draw = () => render(owner, () => call({ ...node, props }));
  return { owner, draw, tree: draw() };
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(m.auth, {
    mode: "wallet",
    address: "alice",
    connectedAt: 1,
    apiConnected: true,
    isRegistered: false,
  });
  m.data = undefined;
  m.error = undefined;
  m.loading = false;
  m.validating = false;
  for (const fn of [m.logs, m.personal, m.sales])
    fn.mockResolvedValue({ ok: true, logs: [], nextCursor: null });
  m.swr.mockImplementation(() => ({
    data: m.data,
    error: m.error,
    isLoading: m.loading,
    isValidating: m.validating,
    mutate: m.mutate,
  }));
});
afterEach(() => {
  for (const h of scopes.splice(0)) h.unmount();
});

it("adds Histories after Referrals, suppresses competing menu focus and closes on reconnect", () => {
  const owner = harness();
  const draw = () => render(owner, () => AccountDropdown({ collapsed: false }));
  let tree = draw();
  const items = nodes(tree).filter((node) => node.type === "menu-item");
  expect(items.map((node) => text(node))).toEqual([
    "Copy address",
    "Profile",
    "Referrals",
    "Histories",
    "Disconnect",
  ]);
  (items[3].props.onSelect as () => void)();
  tree = draw();
  expect(
    nodes(tree).find((node) => node.type === HistoriesModal)?.props.open,
  ).toBe(true);
  const preventDefault = vi.fn();
  (
    nodes(tree).find((node) => node.type === "menu")!.props
      .onCloseAutoFocus as (e: unknown) => void
  )({ preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  const focus = vi.fn();
  (
    nodes(tree).find((node) => node.type === "trigger")!.props.ref as {
      current: unknown;
    }
  ).current = { focus };
  (
    nodes(tree).find((node) => node.type === HistoriesModal)!.props
      .onRestoreFocus as () => void
  )();
  expect(focus).toHaveBeenCalledOnce();
  m.auth.connectedAt = 2;
  expect(
    nodes(draw()).find((node) => node.type === HistoriesModal)?.props.open,
  ).toBe(false);
});
it("defaults to Claims, removes All my history, and uses an accessible bounded dialog", () => {
  const restore = vi.fn();
  const preventDefault = vi.fn();
  const modal = HistoriesModal({
    open: true,
    onClose: vi.fn(),
    onRestoreFocus: restore,
  });
  expect(modal.props.open).toBe(true);
  const shell = nodes(modal).find((node) => node.type === "content")!;
  expect(shell.props.className).toContain("85dvh");
  (shell.props.onCloseAutoFocus as (e: unknown) => void)({ preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(restore).toHaveBeenCalledOnce();
  const tree = render(harness(), () => call(content()));
  expect(nodes(tree).find((node) => node.type === "select")?.props.value).toBe(
    "claims",
  );
  expect(nodes(tree).filter((node) => node.type === "option")).toHaveLength(11);
  expect(text(tree)).not.toContain("All my history");
  m.auth.apiConnected = false;
  expect(
    HistoriesModal({ open: true, onClose: vi.fn(), onRestoreFocus: restore })
      .props.open,
  ).toBe(false);
});
it("requests the latest 100 for every personal category, deduplicates records and refreshes without pagination or timers", async () => {
  m.data = { logs: [row("a"), row("a"), row("b")] };
  const { tree } = list("claims");
  expect(nodes(tree).filter((node) => node.type === "li")).toHaveLength(2);
  const [key, fetcher, options] = m.swr.mock.calls.at(-1)!;
  expect(key).toEqual(["histories", "alice", 1, "claims"]);
  for (const category of PERSONAL_HISTORY_CATEGORIES.filter(
    (value) => value !== "all",
  )) {
    list(category);
    const [categoryKey, categoryFetcher] = m.swr.mock.calls.at(-1)!;
    await categoryFetcher(categoryKey);
    expect(m.logs).toHaveBeenLastCalledWith(100, undefined, "older", category);
  }
  await fetcher(key);
  expect(options).toMatchObject({
    refreshInterval: 0,
    shouldRetryOnError: false,
    revalidateOnFocus: true,
    keepPreviousData: false,
  });
  const buttons = nodes(tree).filter(
    (node) => typeof node.props.onClick === "function",
  );
  expect(text(tree)).not.toContain("Load more");
  expect(text(tree)).toContain("Latest 100 logs");
  (
    buttons.find((node) => text(node).includes("Refresh"))!.props
      .onClick as () => void
  )();
  await Promise.resolve();
  await Promise.resolve();
  expect(m.mutate).toHaveBeenCalledOnce();
  m.data = {
    logs: Array.from({ length: 101 }, (_, index) => row(String(index))),
  };
  expect(nodes(list().tree).filter((node) => node.type === "li")).toHaveLength(
    100,
  );
  expect(
    nodes(tree)
      .filter((node) => node.type === "time")
      .every((node) => !!node.props.title && !!node.props.dateTime),
  ).toBe(true);
});

it("renders corrected purchases and refunds without cosmetic rich-text remnants", () => {
  m.data = {
    logs: [
      {
        ...row("shop"),
        type: "shop",
        amount: 0,
        data: {
          itemId: "help-kit",
          quantity: 5,
          paidWith: "hive",
          hiveAmount: 0.5,
        },
      },
      {
        ...row("refund"),
        type: "shop",
        amount: 0.5,
        data: { action: "refunded", kind: "avatar", name: "Old cosmetic name" },
      },
      {
        ...row("gear"),
        type: "chest",
        data: {
          name: "A very long equipment name that must remain readable in the history list",
          rarity: "rare",
        },
      },
    ],
  };
  const { tree } = list();
  expect(text(tree)).toContain("Purchased 5 Help Kits — spent 0.5 HIVE");
  expect(text(tree)).toContain("Shop refund: 0.5 HIVE");
  expect(text(tree)).not.toContain("Old cosmetic name");
  expect(text(tree)).toContain(
    "A very long equipment name that must remain readable in the history list",
  );
  expect(
    nodes(tree).some((node) =>
      String(node.props.className).includes("break-words"),
    ),
  ).toBe(true);
});
it("requests fixed latest-100 market feeds separately with no Load more or transaction presentation", async () => {
  for (const selection of ["my-market", "market-sales"]) {
    m.data = { logs: [] };
    const { tree } = list(selection);
    const [key, fetcher] = m.swr.mock.calls.at(-1)!;
    await fetcher(key);
    expect(text(tree)).toContain("Latest 100 logs");
    expect(text(tree)).not.toContain("Load more");
    expect(nodes(tree).some((node) => node.type === "a")).toBe(false);
  }
  expect(m.personal).toHaveBeenCalledExactlyOnceWith(100);
  expect(m.sales).toHaveBeenCalledExactlyOnceWith(100);
  expect(m.logs).not.toHaveBeenCalled();
});
it("shows loading, empty and stale failures while retaining only that selection's loaded rows", () => {
  m.loading = true;
  const view = list();
  expect(text(view.tree)).toContain("Loading history");
  m.loading = false;
  expect(text(view.draw())).toContain("No recorded activity");
  m.error = new Error("private infrastructure error");
  expect(text(view.draw())).toContain("History unavailable");
  m.data = { logs: [row("a")] };
  expect(text(view.draw())).toContain("History is stale");
  expect(text(view.draw())).toContain("Claimed 0.1632 HASH");
  expect(text(view.draw())).not.toContain("private infrastructure");
});
it("rekeys category changes and ignores responses from closed views, replaced wallets and same-wallet reconnects", async () => {
  const categoryOwner = harness();
  const node = content();
  let tree = render(categoryOwner, () => call(node));
  (
    nodes(tree).find((el) => el.type === "select")!.props.onValueChange as (
      v: string,
    ) => void
  )("raids");
  tree = render(categoryOwner, () => call(node));
  expect(nodes(tree).find((el) => el.props.selection)?.key).toBe("raids");
  for (const [index, change] of [
    () => {
      m.auth.connectedAt += 1;
    },
    () => {
      m.auth.address = "bob";
    },
    () => {
      m.auth.apiConnected = false;
    },
    () => {},
  ].entries()) {
    Object.assign(m.auth, {
      address: "alice",
      connectedAt: 1,
      apiConnected: true,
    });
    const view = list("raids");
    const [key, fetcher] = m.swr.mock.calls.at(-1)!;
    let finish!: (value: unknown) => void;
    m.logs.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = fetcher(key);
    change();
    if (index === 3) view.owner.unmount();
    finish({ ok: true, logs: [row("late")] });
    await expect(pending).rejects.toThrow("Wallet session changed");
    m.logs.mockClear();
    await expect(fetcher(key)).rejects.toThrow("Wallet session changed");
    expect(m.logs).not.toHaveBeenCalled();
    view.owner.unmount();
  }
});

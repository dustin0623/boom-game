import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HookHarness } from "@/tests/helpers/hook-harness";
vi.mock("@/hooks/useNow", () => ({ useNow: () => m.now }));
const m = vi.hoisted(() => ({
  now: 0,
  path: "/marketplace",
  push: vi.fn(),
  connect: vi.fn(),
  register: vi.fn(),
  sync: vi.fn(),
  workerAvailable: true as boolean | null,
  auth: {
    mode: "wallet" as string | null,
    address: "alice" as string | null,
    connectedAt: 1,
    apiConnected: true,
    isRegistered: false as boolean | null,
    referredBy: null as string | null,
    registrationPhase: "idle",
  },
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
vi.mock("next/navigation", () => ({
  usePathname: () => m.path,
  useRouter: () => ({ push: m.push }),
}));
vi.mock("@/features/stores/authStore", () => ({
  shortAddress: (value: string) => value,
  useAuthStore: Object.assign(
    (selector: (s: unknown) => unknown) =>
      selector({
        ...m.auth,
        connectWallet: m.connect,
        registerPlayer: m.register,
      }),
    { getState: () => m.auth },
  ),
}));
vi.mock("@/features/stores/playerStore", () => ({
  usePlayerStore: (selector: (s: unknown) => unknown) =>
    selector({ syncFromApi: m.sync }),
}));
vi.mock("@/features/stores/transactionStore", () => ({
  transactionSessionKey: () => "session",
  useTransactionStore: (selector: (s: unknown) => unknown) =>
    selector({ registrationSubmitted: false }),
}));
vi.mock("@/features/stores/workerStore", () => ({
  useWorkerStore: (selector: (s: unknown) => unknown) =>
    selector({ available: m.workerAvailable }),
}));
vi.mock("@/lib/chains/modules/hive/client", () => ({
  hiveClient: { keychain: { isAvailable: () => true } },
}));
vi.mock("@radix-ui/react-dialog", () => ({
  Root: "dialog",
  Trigger: "trigger",
  Portal: "div",
  Overlay: "div",
  Content: "section",
  Close: "button",
  Title: "h2",
  Description: "p",
}));
vi.mock("@/components/ui/dialog", () => ({
  DialogContent: "content",
  DialogHeader: "header",
  DialogTitle: "title",
  DialogDescription: "description",
}));
import { ConnectWalletModal } from "./ConnectWalletModal";
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
beforeEach(() => {
  scope = new HookHarness();
  m.now = 0;
  vi.clearAllMocks();
  m.path = "/marketplace";
  m.workerAvailable = true;
  Object.assign(m.auth, {
    mode: "wallet",
    address: "alice",
    connectedAt: 1,
    apiConnected: true,
    isRegistered: false,
    referredBy: null,
  });
  vi.stubGlobal("window", { self: 1, top: 1 });
  m.connect.mockResolvedValue("alice");
  m.sync.mockResolvedValue(undefined);
});
it("explains starting HASH without crediting it when the registration form opens", () => {
  const tree = scope.render(() => ConnectWalletModal({ open: true }));
  const description = nodes(tree).find(
    (node) =>
      node.type === "description" &&
      String(node.props.children).includes("starting balance"),
  )!;
  expect(description).toBeDefined();
  expect(description.props.children).toContain(10);
  expect(m.register).not.toHaveBeenCalled();
  expect(m.sync).not.toHaveBeenCalled();
});

it("shows the authoritative linked referrer before payment", () => {
  m.auth.referredBy = "corven";
  const tree = scope.render(() => ConnectWalletModal({ open: true }));
  expect(nodes(tree).some((node) => node.props.children === "corven")).toBe(
    true,
  );
  expect(
    nodes(tree).some((node) =>
      String(node.props.children).includes("None on file"),
    ),
  ).toBe(false);
  expect(m.register).not.toHaveBeenCalled();
});
afterEach(() => {
  scope.unmount();
  vi.unstubAllGlobals();
});
it.each(["player123", "player-one", "player.one", "abc.def-123"])(
  "allows signing in with valid Hive account %s",
  async (account) => {
    m.auth.apiConnected = false;
    const render = () => scope.render(() => ConnectWalletModal({ open: true }));
    const input = nodes(render()).find(
      (node) => node.props.id === "hive-username",
    )!;
    (input.props.onChange as (event: unknown) => void)({
      target: { value: ` ${account.toUpperCase()} ` },
    });
    const button = nodes(render()).find(
      (node) => node.props.className === "h-11 w-full justify-between",
    )!;
    expect(button.props.disabled).toBe(false);
    await (button.props.onClick as () => Promise<void>)();
    expect(m.connect).toHaveBeenCalledExactlyOnceWith(account);
  },
);
it.each([
  "player_name",
  "123player",
  "player-",
  "player..one",
  "ab.player",
  "a1234567890123456",
])("blocks invalid account %s before connecting", async (account) => {
  m.auth.apiConnected = false;
  const render = () => scope.render(() => ConnectWalletModal({ open: true }));
  const input = nodes(render()).find(
    (node) => node.props.id === "hive-username",
  )!;
  (input.props.onChange as (event: unknown) => void)({
    target: { value: account },
  });
  const button = nodes(render()).find(
    (node) => node.props.className === "h-11 w-full justify-between",
  )!;
  expect(button.props.disabled).toBe(true);
  await (button.props.onClick as () => Promise<void>)();
  expect(m.connect).not.toHaveBeenCalled();
});
it.each(["/marketplace", "/leaderboard", "/dashboard", "/", "/wiki"])(
  "registration dismissal respects access on %s",
  (path) => {
    m.path = path;
    const close = vi.fn();
    const tree = scope.render(() =>
      ConnectWalletModal({ open: true, onOpenChange: close }),
    );
    const content = nodes(tree).find((n) => n.type === "content")!;
    expect(content.props.showCloseButton).toBe(
      ["/marketplace", "/leaderboard"].includes(path),
    );
    const event = { preventDefault: vi.fn() };
    (content.props.onEscapeKeyDown as (e: unknown) => void)(event);
    (content.props.onInteractOutside as (e: unknown) => void)(event);
    (tree.props.onOpenChange as (value: boolean) => void)(false);
    if (["/marketplace", "/leaderboard"].includes(path)) {
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledWith(false);
    } else {
      expect(event.preventDefault).toHaveBeenCalledTimes(2);
      expect(close).not.toHaveBeenCalled();
    }
  },
);
it.each([true, false, null])(
  "renders the registration payment button with worker availability %s while omitting only the close control",
  async (available) => {
    m.path = "/dashboard";
    m.workerAvailable = available;
    const tree = scope.render(() => ConnectWalletModal({ open: true }));
    const content = nodes(tree).find((node) => node.type === "content")!;
    const actual = await vi.importActual<
      typeof import("@/components/ui/dialog")
    >("@/components/ui/dialog");
    const html = renderToStaticMarkup(
      createElement(actual.DialogContent, content.props),
    );
    const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
    const pay = buttons.find((button) =>
      button.includes("Pay &amp; register with Hive Keychain"),
    );
    expect(pay).toBeDefined();
    expect(pay).not.toMatch(/\bhidden\b/);
    expect(pay?.includes('disabled=""')).toBe(available !== true);
    expect(html).not.toContain('class="sr-only">Close</span>');
    expect(content.props.className).not.toContain("hidden");
    expect(html.includes("Retry availability")).toBe(available !== true);
    expect(m.register).not.toHaveBeenCalled();
  },
);
it.each(["/marketplace", "/leaderboard", "/dashboard", "/"])(
  "retains a controlled destination after connecting on %s",
  async (path) => {
    m.path = path;
    m.auth.apiConnected = false;
    m.auth.isRegistered = true;
    const close = vi.fn();
    const render = () =>
      scope.render(() =>
        ConnectWalletModal({ open: true, onOpenChange: close }),
      );
    const input = nodes(render()).find((n) => n.props.id === "hive-username")!;
    (input.props.onChange as (e: unknown) => void)({
      target: { value: "alice" },
    });
    const button = nodes(render()).find(
      (n) =>
        n.props.onClick && n.props.className === "h-11 w-full justify-between",
    )!;
    (button.props.onClick as () => void)();
    await vi.waitFor(() => expect(close).toHaveBeenCalledWith(false));
    if (["/marketplace", "/leaderboard"].includes(path))
      expect(m.push).not.toHaveBeenCalled();
    else expect(m.push).toHaveBeenCalledWith("/dashboard");
  },
);

it.each([[Date.parse("2026-10-18T23:59:59.999Z"), false], [Date.parse("2026-10-19T00:00:00Z"), true], [Date.parse("2026-11-01T23:59:59.999Z"), true], [Date.parse("2026-11-02T00:00:00Z"), false]])("shows the starter offer only inside its window %s", (now, active) => {
  m.now = now as number;
  const tree = scope.render(() => ConnectWalletModal({ open: true }));
  const allText = nodes(tree).map((node) => String(node.props.children)).join(" ");
  expect(allText.includes("Limited-time registration starter pack")).toBe(active);
  if (active) {
    expect(allText).toContain("4 Equipment Chests · 10 Sabotage Devices · 10 Help Kits");
    expect(allText).toContain("2 November 2026, 8:00 AM Singapore time");
  }
  expect(m.register).not.toHaveBeenCalled();
});

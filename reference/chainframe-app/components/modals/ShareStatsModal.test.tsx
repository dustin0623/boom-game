import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HookHarness } from "@/tests/helpers/hook-harness";

let scope: HookHarness;
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (...args: Parameters<HookHarness["useState"]>) => scope.useState(...args),
  useRef: (...args: Parameters<HookHarness["useRef"]>) => scope.useRef(...args),
  useEffect: (...args: Parameters<HookHarness["useEffect"]>) => scope.useEffect(...args),
  useLayoutEffect: (...args: Parameters<HookHarness["useEffect"]>) => scope.useEffect(...args),
}));
const m = vi.hoisted(() => ({ capture: vi.fn(), copy: vi.fn(), username: "alice&team" }));
vi.mock("html-to-image", () => ({ toPng: m.capture }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/stores/authStore", () => ({
  useAuthStore: (select: (state: unknown) => unknown) => select({ username: m.username, address: null }),
}));
vi.mock("@/features/stores/playerStore", () => ({
  usePlayerStore: (select: (state: unknown) => unknown) => select({ referralCount: 0, referralEarned: 0 }),
}));
vi.mock("@/lib/api/client", () => ({ fetchReferrals: vi.fn() }));
vi.mock("swr", () => ({ default: () => ({ mutate: vi.fn() }) }));
vi.mock("@/components/ui/button", () => ({ Button: "button" }));
vi.mock("@radix-ui/react-dialog", () => ({ Root: "dialog" }));
vi.mock("@/components/ui/dialog", () => ({ DialogContent: "section", DialogHeader: "header", DialogTitle: "h2" }));
import { ShareStatsModal } from "./ShareStatsModal";
import { ReferralModal } from "./ReferralModal";
import { ShareStatsCard } from "@/components/cards/ShareStatsCard";

type Node = ReactElement<Record<string, unknown>>;
const nodes = (node: ReactNode): Node[] => Array.isArray(node) ? node.flatMap(nodes)
  : node && typeof node === "object" && "props" in node
    ? [node as Node, ...nodes((node as Node).props.children as ReactNode)] : [];
const text = (node: ReactNode): string => Array.isArray(node) ? node.map(text).join("")
  : node && typeof node === "object" && "props" in node ? text((node as Node).props.children as ReactNode)
    : typeof node === "string" || typeof node === "number" ? String(node) : "";
const stats = { username: "alice&team", level: 2, address: "alice", vault: 1, capacity: 2, fillPercent: 50,
  perSecond: 0.00002, hashRate: 1, hackPower: 1, security: 1, notoriety: 0 };
beforeEach(() => {
  scope = new HookHarness();
  vi.clearAllMocks();
  vi.stubGlobal("window", { location: { origin: "https://play.example:8443" } });
  vi.stubGlobal("navigator", { clipboard: { writeText: m.copy } });
  m.copy.mockResolvedValue(undefined);
});
afterEach(() => { scope.unmount(); vi.unstubAllGlobals(); });

it("resolves origin after mounting and offers only the Chainframe image download", async () => {
  let rendering = false;
  vi.stubGlobal("window", { get location() {
    expect(rendering).toBe(false);
    return { origin: "https://play.example:8443" };
  } });
  let initial: ReactNode;
  const tree = scope.render(() => {
    rendering = true;
    const result = ShareStatsModal({ open: true, onClose: vi.fn(), cardProps: stats });
    initial ??= result;
    rendering = false;
    return result;
  });
  expect(nodes(initial).find(node => node.type === "button" && text(node) === "Download image")?.props.disabled).toBe(true);
  expect(nodes(tree).filter(node => node.type === "button").map(node => text(node))).toEqual(["Download image"]);
  expect(nodes(tree).some(node => node.props.readOnly)).toBe(false);
  expect(text(tree)).not.toContain("Post on X");
  expect(text(tree)).not.toContain("Post text for X");
  const card = nodes(tree).find(node => node.type === ShareStatsCard)!;
  expect(card.props.origin).toBe("https://play.example:8443");
  (card.props.ref as (element: unknown) => void)({});
  const link = { download: "", href: "", click: vi.fn() };
  vi.stubGlobal("document", { createElement: vi.fn(() => link) });
  m.capture.mockResolvedValue("data:image/png;base64,test");
  await (nodes(tree).find(node => node.type === "button" && text(node) === "Download image")!.props.onClick as () => Promise<void>)();
  expect(link.download).toBe("alice&team-chainframe-stats.png");
  expect(link.click).toHaveBeenCalledOnce();
  expect(m.capture).toHaveBeenCalledWith(expect.anything(), { pixelRatio: 2 });
});

it("copies the current-origin referral link without a configured domain", async () => {
  const tree = scope.render(() => ReferralModal({ open: true, onClose: vi.fn() }));
  expect(text(tree)).toContain("https://play.example:8443/?join=alice%26team");
  const copy = nodes(tree).find(node => node.props["aria-label"] === "Copy referral link")!;
  (copy.props.onClick as () => void)();
  expect(m.copy).toHaveBeenCalledWith("https://play.example:8443/?join=alice%26team");
});

it("renders exported branding and the supplied host without reading window", () => {
  vi.stubGlobal("window", undefined);
  const html = renderToStaticMarkup(createElement(ShareStatsCard, { ...stats, origin: "https://play.example:8443" }));
  expect(html).toContain('src="https://play.example:8443/brand/chainframe-logo.png"');
  expect(html).toContain('alt="Chainframe"');
  expect(html).toContain("play.example:8443");
});

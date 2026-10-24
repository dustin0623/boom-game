import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { HookHarness } from "@/tests/helpers/hook-harness";
let scope: HookHarness;
const focus = vi.fn();
const findSection = vi.fn(() => ({ focus }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (...args: Parameters<HookHarness["useState"]>) =>
    scope.useState(...args),
}));
import { WikiNavigation } from "./WikiNavigation";
const sections = [
  { id: "getting-started", label: "Start playing" },
  { id: "raiding", label: "Raids & effects" },
];
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
const render = () => scope.render(() => WikiNavigation({ sections }));
beforeEach(() => {
  scope = new HookHarness();
  vi.stubGlobal("window", { location: { hash: "" } });
  focus.mockClear();
  findSection.mockClear();
  vi.stubGlobal("document", { getElementById: findSection });
});
afterEach(() => {
  scope.unmount();
  vi.unstubAllGlobals();
});
it("uses the labelled mobile selector to navigate to the actual section and keeps desktop anchors keyboard accessible", () => {
  let tree = render();
  const select = nodes(tree).find((node) => node.type === "select")!;
  expect(select.props.value).toBe("getting-started");
  expect(nodes(tree).find((node) => node.type === "label")?.props.htmlFor).toBe(
    select.props.id,
  );
  (select.props.onChange as (event: unknown) => void)({
    currentTarget: { value: "raiding" },
  });
  expect(window.location.hash).toBe("raiding");
  expect(findSection).toHaveBeenCalledWith("raiding");
  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  tree = render();
  expect(nodes(tree).find((node) => node.type === "select")?.props.value).toBe(
    "raiding",
  );
  const link = nodes(tree).find(
    (node) => node.props.href === "#getting-started",
  )!;
  expect(link.props.className).toContain("focus-visible:ring-2");
  (link.props.onClick as () => void)();
  expect(
    nodes(render()).find((node) => node.type === "select")?.props.value,
  ).toBe("getting-started");
});

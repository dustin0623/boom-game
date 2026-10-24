'use client';

import dynamic from "next/dynamic";

/**
 * GameShell loaded with SSR disabled.
 * It uses useLayoutEffect and ResizeObserver — it cannot run in Node.
 */
export const DynamicGameShell = dynamic(
  () => import("./GameShell").then((m) => m.GameShell),
  { ssr: false }
);

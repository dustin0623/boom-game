import { useEffect, useState } from "react";

/** True after the first client render — use before reading browser-only state. */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

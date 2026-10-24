import { useEffect, useState } from "react";

/** True after client mount, keeping restored wallet authentication hydration-safe. */
export const useHydrated = (): boolean => {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
};

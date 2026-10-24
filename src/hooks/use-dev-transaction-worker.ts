import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { runTransactionBatch } from "@/lib/smart-contract/worker.functions";

/** Dev only: while the app is open, process the mock transaction queue on an interval. */
export function useDevTransactionWorker(intervalMs = 5000) {
  const run = useServerFn(runTransactionBatch);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let busy = false;
    const id = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        await run();
      } catch (e) {
        console.warn("dev transaction worker:", e);
      } finally {
        busy = false;
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [run, intervalMs]);
}

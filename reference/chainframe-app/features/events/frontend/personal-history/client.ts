import type { LogDto, SettledTxDto, PendingTxDto } from "@/lib/api/types";
import type { ActivityEntry } from "@/features/types/game/types";
import { historyEntry, receiptEntry } from "@/lib/utils/logs/presentation";
type Page<T> = {
  ok: boolean;
  nextCursor?: string | null;
  latestCursor?: string | null;
  error?: string;
} & T;
export interface PersonalHistoryTransport {
  logs(
    cursor?: string,
    direction?: "older" | "newer",
  ): Promise<Page<{ logs?: LogDto[] }>>;
  transactions(
    cursor?: string,
    direction?: "older" | "newer",
  ): Promise<Page<{ history?: SettledTxDto[]; pending?: PendingTxDto[] }>>;
}
interface PersonalHistoryOptions {
  wallet: string;
  transport: PersonalHistoryTransport;
  isCurrent: () => boolean;
  publish: (
    entries: ActivityEntry[],
    toastEntries: ActivityEntry[],
    changed: boolean,
  ) => void;
  observe: (
    logs: LogDto[],
    receipts: SettledTxDto[],
    pending: PendingTxDto[],
  ) => void;
  state: {
    refreshPlayer: () => Promise<boolean>;
    refreshInventory: () => Promise<boolean>;
    isRefreshed: () => boolean;
    onReady: () => void;
  };
}
const emptyCursor = JSON.stringify({ time: 0, id: "000000000000000000000000" });
/** One session's history comparison and authoritative refresh coordination. No timers. */
export function createPersonalHistoryPoller({
  wallet,
  transport,
  isCurrent,
  publish,
  observe,
  state,
}: PersonalHistoryOptions) {
  let stopped = false,
    refreshing = false,
    refreshPending = false,
    initialized = false,
    busy = false,
    logCursor: string | undefined,
    transactionCursor: string | undefined;
  const seenLogs = new Set<string>(),
    seenTransactions = new Set<string>(),
    announced = new Set<string>();
  const active = () => !stopped && isCurrent();
  const refresh = async () => {
    if (!active()) return;
    refreshPending = true;
    if (refreshing) return;
    refreshing = true;
    try {
      do {
        refreshPending = false;
        const results = await Promise.all([
          state.refreshPlayer(),
          state.refreshInventory(),
        ]);
        if (results.some((result) => !result)) {
          refreshPending = true;
          break;
        }
        if (active() && !refreshPending) state.onReady();
      } while (refreshPending && active());
    } catch {
      refreshPending = true;
    } finally {
      refreshing = false;
    }
  };
  return {
    async poll() {
      if (refreshPending && !refreshing) void refresh();
      if (busy || !active()) return;
      busy = true;
      try {
        const logs: LogDto[] = [];
        const transactions: SettledTxDto[] = [];
        const pending: PendingTxDto[] = [];
        let nextLog = logCursor,
          nextTransaction = transactionCursor;
        const direction = initialized ? "newer" : "older";
        let cursor = initialized ? logCursor : undefined;
        do {
          const page = await transport.logs(cursor, direction);
          if (!active()) return;
          if (!page.ok) throw new Error(page.error ?? "History request failed");
          logs.push(...(page.logs ?? []));
          if (page.latestCursor && (initialized || !nextLog))
            nextLog = page.latestCursor;
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
        cursor = initialized ? transactionCursor : undefined;
        do {
          const page = await transport.transactions(cursor, direction);
          if (!active()) return;
          if (!page.ok)
            throw new Error(page.error ?? "Transactions request failed");
          transactions.push(...(page.history ?? []));
          pending.push(...(page.pending ?? []));
          if (page.latestCursor && (initialized || !nextTransaction))
            nextTransaction = page.latestCursor;
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
        const entries: ActivityEntry[] = [],
          toasts: ActivityEntry[] = [];
        let newOutcome = false;
        const correlations = new Set(
          logs.map((log) => log.correlationKey ?? log.txHash).filter(Boolean),
        );
        for (const log of logs) {
          const key = log.id ?? log._id;
          if (!key || seenLogs.has(key)) continue;
          seenLogs.add(key);
          newOutcome = true;
          const entry = historyEntry(log, wallet);
          entries.push(entry);
          const correlation = log.correlationKey ?? log.txHash;
          if (initialized && (!correlation || !announced.has(correlation)))
            toasts.push(entry);
          if (correlation) announced.add(correlation);
        }
        for (const tx of transactions) {
          const key = tx.txHash + ":" + tx.status;
          if (seenTransactions.has(key)) continue;
          seenTransactions.add(key);
          newOutcome = true;
          if (
            tx.status === "success" &&
            (correlations.has(tx.txHash) || announced.has(tx.txHash))
          )
            continue;
          const entry = receiptEntry(tx);
          entries.push(entry);
          if (initialized) toasts.push(entry);
          announced.add(tx.txHash);
        }
        if (!active()) return;
        observe(logs, transactions, pending);
        if (
          logs.length ||
          transactions.length ||
          (!refreshing && !state.isRefreshed())
        )
          void refresh();
        const changed = initialized && newOutcome;
        if (!active()) return;
        publish(entries, toasts, changed || !initialized);
        logCursor = nextLog ?? emptyCursor;
        transactionCursor = nextTransaction ?? emptyCursor;
        initialized = true;
      } finally {
        busy = false;
      }
    },
    refresh,
    stop() {
      stopped = true;
    },
  };
}

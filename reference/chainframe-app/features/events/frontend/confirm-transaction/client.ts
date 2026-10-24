"use client";
import {
  useTransactionStore,
  transactionSessionKey,
  type TransactionSession,
} from "@/features/stores/transactionStore";
import { useAuthStore } from "@/features/stores/authStore";
import type { LogDto, SettledTxDto } from "@/lib/api/types";
import type {
  PaymentSessionContext,
  SubmittedTransaction,
} from "@/features/types/game/payments";
export class TransactionRejected extends Error {}
export interface Confirmation {
  receipt: SettledTxDto;
  log?: LogDto;
}
type Requirements = {
  operationIndex?: number;
  type?: string;
  requireLog?: string;
  registered?: boolean;
};

function readConfirmation(
  transactionId: string,
  options: Requirements,
): Confirmation | TransactionRejected | null {
  const state = useTransactionStore.getState();
  const receipt =
    state.receipts[transactionId + ":" + (options.operationIndex ?? 0)];
  if (!receipt || (options.type && receipt.type !== options.type)) return null;
  if (receipt.status === "failed")
    return new TransactionRejected(receipt.error ?? "Transaction rejected");
  const log = Object.values(state.logs).find(
    (entry) =>
      (entry.correlationKey === receipt.txHash ||
        entry.txHash === receipt.txHash) &&
      (!options.requireLog || entry.type === options.requireLog),
  );
  if (
    !state.refreshed ||
    (options.requireLog && !log) ||
    (options.registered && !state.registered)
  )
    return null;
  return { receipt, log };
}

export function claimSubmission(context: PaymentSessionContext, key: string) {
  const session = transactionSessionKey(context.session);
  if (!session || !context.isCurrent()) return null;
  useTransactionStore.getState().begin(session);
  const token = useTransactionStore.getState().claim(session, key);
  return token ? { session, key, token } : null;
}

export function releaseSubmission(
  lock: ReturnType<typeof claimSubmission>,
): void {
  if (lock)
    useTransactionStore.getState().release(lock.session, lock.key, lock.token);
}

export function reconcileSubmittedTransactions(
  session: TransactionSession,
): void {
  const key = transactionSessionKey(session);
  const state = useTransactionStore.getState();
  if (!key || state.session !== key) return;
  for (const entry of state.submitted) {
    if (entry.transactionId && readConfirmation(entry.transactionId, entry))
      state.resolve(key, entry.id);
    else if (
      entry.status === "submitted" &&
      Date.now() - entry.submittedAt >= 180000
    )
      state.delay(key, entry.id);
  }
}

export function recordSubmittedTransaction(
  context: PaymentSessionContext,
  input: Pick<
    SubmittedTransaction,
    "kind" | "label" | "transactionId" | "type"
  > &
    Requirements,
  lock?: ReturnType<typeof claimSubmission>,
): string | null {
  const session = transactionSessionKey(context.session);
  if (!session || !context.isCurrent()) return null;
  const state = useTransactionStore.getState();
  state.begin(session);
  const id = crypto.randomUUID();
  state.track({
    id,
    session,
    kind: input.kind,
    label: input.label,
    transactionId: input.transactionId,
    type: input.type,
    operationIndex: input.operationIndex ?? 0,
    submittedAt: Date.now(),
    status: input.transactionId ? "submitted" : "unknown",
    requireLog: input.requireLog,
    registered: input.registered,
    ...(lock ? { lock: { key: lock.key, token: lock.token } } : {}),
  });
  reconcileSubmittedTransactions(context.session);
  return id;
}
export function waitForTransaction(
  transactionId: string,
  session: TransactionSession,
  options: {
    operationIndex?: number;
    type?: string;
    signal?: AbortSignal;
    requireLog?: string;
    registered?: boolean;
  } = {},
): Promise<Confirmation> {
  const key = transactionSessionKey(session);
  if (!key || transactionSessionKey(useAuthStore.getState()) !== key)
    return Promise.reject(
      new Error("Wallet session changed; payment may still settle"),
    );
  useTransactionStore.getState().begin(key);
  return new Promise((resolve, reject) => {
    let remaining = 180000,
      started = Date.now(),
      timer: ReturnType<typeof setTimeout> | undefined,
      done = false;
    let stopStore = () => {},
      stopAuth = () => {};
    const visible = () =>
      typeof document === "undefined" || document.visibilityState === "visible";
    const finish = (error?: Error, value?: Confirmation) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      stopStore();
      stopAuth();
      options.signal?.removeEventListener("abort", abort);
      if (typeof document !== "undefined")
        document.removeEventListener("visibilitychange", visibility);
      if (error) reject(error);
      else resolve(value!);
    };
    const abort = () =>
      finish(new Error("Confirmation cancelled; transaction may still settle"));
    const check = () => {
      if (transactionSessionKey(useAuthStore.getState()) !== key) {
        finish(
          new Error("Wallet session changed; transaction may still settle"),
        );
        return;
      }
      const s = useTransactionStore.getState();
      if (s.session !== key) return;
      const outcome = readConfirmation(transactionId, options);
      if (outcome instanceof TransactionRejected) finish(outcome);
      else if (outcome) finish(undefined, outcome);
    };
    const timeout = () => {
      const state = useTransactionStore.getState();
      for (const entry of state.submitted)
        if (
          entry.transactionId === transactionId &&
          entry.operationIndex === (options.operationIndex ?? 0) &&
          (!options.type || entry.type === options.type)
        )
          state.delay(key, entry.id);
      finish(
        new Error(
          "Still awaiting processing for " +
            transactionId +
            ". Check transaction history before signing again.",
        ),
      );
    };
    const schedule = () => {
      started = Date.now();
      if (visible()) timer = setTimeout(timeout, remaining);
    };
    const visibility = () => {
      if (timer) {
        remaining -= Date.now() - started;
        clearTimeout(timer);
        timer = undefined;
      }
      if (remaining <= 0) timeout();
      else schedule();
    };
    stopStore = useTransactionStore.subscribe(check);
    stopAuth = useAuthStore.subscribe(check);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", visibility);
    if (options.signal?.aborted) abort();
    else {
      schedule();
      check();
    }
  });
}

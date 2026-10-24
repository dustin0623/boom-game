import { create } from "zustand";
import type { LogDto, PendingTxDto, SettledTxDto } from "@/lib/api/types";
import type { SubmittedTransaction } from "@/features/types/game/payments";
export interface TransactionSession {
  address: string | null;
  mode: string | null;
  connectedAt: number | null;
}
export const transactionSessionKey = (s: TransactionSession) =>
  s.mode === "wallet" && s.address
    ? JSON.stringify([s.address, s.connectedAt])
    : null;
export function receiptIdentity(tx: SettledTxDto) {
  const transactionId =
    tx.transactionId ??
    (typeof tx.metadata?.transactionId === "string"
      ? tx.metadata.transactionId
      : tx.type === "game_action"
        ? tx.txHash.slice(0, tx.txHash.lastIndexOf(":"))
        : tx.txHash);
  const operationIndex =
    tx.operationIndex ??
    (typeof tx.metadata?.operationIndex === "number"
      ? tx.metadata.operationIndex
      : tx.type === "game_action"
        ? Number(tx.txHash.slice(tx.txHash.lastIndexOf(":") + 1))
        : 0);
  return { transactionId, operationIndex };
}
interface TransactionState {
  submitted: SubmittedTransaction[];
  latestSubmissionId: string | null;
  registrationSubmitted: boolean;
  submissionLocks: Record<string, string>;
  claim: (session: string, key: string) => string | null;
  release: (session: string, key: string, token: string) => void;
  track: (submission: SubmittedTransaction) => void;
  resolve: (session: string, id: string) => void;
  delay: (session: string, id: string) => void;
  session: string | null;
  receipts: Record<string, SettledTxDto>;
  logs: Record<string, LogDto>;
  pending: PendingTxDto[];
  refreshed: boolean;
  registered: boolean;
  begin: (session: string | null) => void;
  observe: (
    session: string,
    logs: LogDto[],
    receipts: SettledTxDto[],
    pending: PendingTxDto[],
  ) => void;
  ready: (session: string, registered: boolean) => void;
}
export const useTransactionStore = create<TransactionState>((set, get) => ({
  submitted: [],
  latestSubmissionId: null,
  registrationSubmitted: false,
  submissionLocks: {},
  claim: (session, key) => {
    if (get().session !== session || get().submissionLocks[key]) return null;
    const token = crypto.randomUUID();
    set((s) => ({ submissionLocks: { ...s.submissionLocks, [key]: token } }));
    return token;
  },
  release: (session, key, token) => {
    if (get().session !== session || get().submissionLocks[key] !== token)
      return;
    set((s) => {
      const locks = { ...s.submissionLocks };
      delete locks[key];
      return { submissionLocks: locks };
    });
  },
  track: (submission) => {
    if (get().session !== submission.session) return;
    if (
      get().submitted.some(
        (s) =>
          s.id === submission.id ||
          (submission.transactionId &&
            s.transactionId === submission.transactionId &&
            s.operationIndex === submission.operationIndex &&
            s.type === submission.type),
      )
    )
      return;
    set((s) => ({
      submitted: [submission, ...s.submitted],
      latestSubmissionId: submission.id,
      registrationSubmitted:
        s.registrationSubmitted || submission.type === "registration",
    }));
  },
  resolve: (session, id) => {
    if (get().session !== session) return;
    const submission = get().submitted.find((s) => s.id === id);
    if (!submission) return;
    if (submission.lock)
      get().release(session, submission.lock.key, submission.lock.token);
    set((s) => ({ submitted: s.submitted.filter((entry) => entry.id !== id) }));
  },
  delay: (session, id) => {
    if (get().session !== session) return;
    set((s) => ({
      submitted: s.submitted.map((entry) =>
        entry.id === id && entry.status === "submitted"
          ? { ...entry, status: "delayed" }
          : entry,
      ),
    }));
  },
  session: null,
  receipts: {},
  logs: {},
  pending: [],
  refreshed: false,
  registered: false,
  begin: (session) => {
    if (get().session !== session)
      set({
        session,
        receipts: {},
        logs: {},
        pending: [],
        refreshed: false,
        registered: false,
        submitted: [],
        latestSubmissionId: null,
        registrationSubmitted: false,
        submissionLocks: {},
      });
  },
  observe: (session, logs, receipts, pending) => {
    if (get().session !== session) return;
    set((s) => ({
      receipts: {
        ...s.receipts,
        ...Object.fromEntries(
          receipts.map((tx) => {
            const id = receiptIdentity(tx);
            return [id.transactionId + ":" + id.operationIndex, tx];
          }),
        ),
      },
      logs: {
        ...s.logs,
        ...Object.fromEntries(logs.map((log) => [log.id ?? log._id!, log])),
      },
      pending,
      refreshed: logs.length > 0 || receipts.length > 0 ? false : s.refreshed,
    }));
  },
  ready: (session, registered) => {
    if (get().session === session) set({ refreshed: true, registered });
  },
}));

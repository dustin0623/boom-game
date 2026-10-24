"use client";
import { useWorkerStore } from "@/features/stores/workerStore";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  executeGameAction,
  captureGameActionContext,
  isGameActionSessionCurrent,
} from "@/features/events/frontend/execute-game-action/client";
import { useAuthStore } from "@/features/stores/authStore";
import type {
  GameActionFlowOptions,
  GameActionLifecycle,
  GameActionExecutionContext,
} from "@/features/types/game/actions";

export function useGameActionFlow({
  onSubmitted,
  onProcessed,
}: { onSubmitted?: () => void; onProcessed?: () => void } = {}) {
  const workerAvailable = useWorkerStore((state) => state.available);
  const [lifecycle, setLifecycle] = useState<GameActionLifecycle>("idle");
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [execution, setExecution] = useState<GameActionExecutionContext | null>(
    null,
  );
  const executionRef = useRef<GameActionExecutionContext | null>(null);
  const runRef = useRef(0);
  const busyRef = useRef(false);
  const submittedRef = useRef(false);
  const mountedRef = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);
  const onSubmittedRef = useRef(onSubmitted);
  const onProcessedRef = useRef(onProcessed);
  useEffect(() => {
    onSubmittedRef.current = onSubmitted;
  }, [onSubmitted]);
  useEffect(() => {
    onProcessedRef.current = onProcessed;
  }, [onProcessed]);

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = useAuthStore.subscribe(() => {
      const origin = executionRef.current;
      if (!origin || isGameActionSessionCurrent(origin)) return;
      controllerRef.current?.abort();
      runRef.current++;
      executionRef.current = null;
      busyRef.current = false;
      submittedRef.current = false;
      setLifecycle("idle");
      setTransactionId(null);
      setErrorMessage(null);
      setExecution(null);
      setBusy(false);
    });
    return () => {
      mountedRef.current = false;
      unsubscribe();
      // A closed submitted form must not cancel its receipt subscription.
      if (!submittedRef.current) controllerRef.current?.abort();
    };
  }, []);

  const run = useCallback(
    async (options: GameActionFlowOptions): Promise<GameActionLifecycle> => {
      if (busyRef.current) return "failed";
      busyRef.current = true;
      submittedRef.current = false;
      setBusy(true);
      const origin = captureGameActionContext();
      executionRef.current = origin;
      setExecution(origin);
      const runId = ++runRef.current;
      const active = () =>
        mountedRef.current &&
        runRef.current === runId &&
        isGameActionSessionCurrent(origin);
      try {
        controllerRef.current = new AbortController();
        return await executeGameAction(
          { ...options, context: origin, signal: controllerRef.current.signal },
          {
            onLifecycle: (value) => {
              if (active()) {
                setLifecycle(value);
                if (value === "processed") onProcessedRef.current?.();
              }
            },
            onTransactionId: (value) => {
              if (active()) setTransactionId(value);
            },
            onError: (value) => {
              if (active() && !submittedRef.current) setErrorMessage(value);
            },
            onAwaiting: () => {},
            onSubmitted: () => {
              if (runRef.current !== runId || submittedRef.current) return;
              submittedRef.current = true;
              if (active()) onSubmittedRef.current?.();
            },
          },
        );
      } finally {
        if (runRef.current === runId) {
          busyRef.current = false;
          if (mountedRef.current) {
            setBusy(false);
            if (submittedRef.current) {
              setLifecycle("idle");
              setTransactionId(null);
              setErrorMessage(null);
              setExecution(null);
              executionRef.current = null;
            }
          }
        }
      }
    },
    [],
  );

  const fail = useCallback((message: string) => {
    setErrorMessage(message);
    setLifecycle("failed");
  }, []);
  const reset = useCallback(() => {
    if (busyRef.current) return;
    runRef.current++;
    executionRef.current = null;
    setExecution(null);
    setLifecycle("idle");
    setTransactionId(null);
    setErrorMessage(null);
  }, []);
  return {
    lifecycle,
    transactionId,
    errorMessage,
    execution,
    busy,
    unavailable: workerAvailable !== true,
    run,
    fail,
    reset,
  };
}

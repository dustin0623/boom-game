"use client";
import { useWorkerStore } from "@/features/stores/workerStore";

let requestNumber = 0;
export async function refreshWorkerReadiness(isCurrent: () => boolean) {
  const request = ++requestNumber;
  if (!isCurrent()) throw new Error("Wallet session changed before signing");
  let available = false;
  let reason = "service-unavailable";
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const result = await response.json();
    available = response.ok && result?.worker?.available === true;
    reason =
      typeof result?.worker?.reason === "string"
        ? result.worker.reason
        : reason;
  } catch {
    /* An unavailable readiness lookup must never permit a new signature. */
  }
  if (!isCurrent()) throw new Error("Wallet session changed before signing");
  if (request !== requestNumber) return false;
  useWorkerStore.getState().set(available, reason);
  return available;
}

export async function requireWorkerReadiness(isCurrent: () => boolean) {
  if (!(await refreshWorkerReadiness(isCurrent)))
    throw new Error(
      "Game processing is unavailable. Retry when the worker is ready.",
    );
}

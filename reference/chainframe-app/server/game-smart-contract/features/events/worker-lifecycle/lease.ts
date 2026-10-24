import {
  contractStreamRepository,
  setContractReadiness,
} from "@/lib/modules/game-stats/server.repository";

/** Bind acquisition, readiness transitions and ownership checks to one worker lease. */
export async function acquireWorkerLease({
  owner,
  ttlMs,
}: {
  owner: string;
  ttlMs: number;
}) {
  if (!(await contractStreamRepository.acquireLease(owner, ttlMs)))
    throw new Error("Smart-contract worker lease already held");
  return {
    async check() {
      return contractStreamRepository.renewLease(owner, ttlMs);
    },
    async markStarting() {
      await setContractReadiness(owner, false);
    },
    async markBlockChecked() {
      await setContractReadiness(owner, true, true);
    },
    async release() {
      await contractStreamRepository.releaseLease(owner);
    },
  };
}

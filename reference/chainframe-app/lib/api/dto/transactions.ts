import type { IInboundTransaction } from "@/lib/modules/transactions-pending/server.types";
import { toEpoch } from "@/lib/api/dto";
export function toPendingTransactionDto(job: IInboundTransaction) {
  return {
    id: String(job._id),
    type: job.type,
    status: job.status,
    signature: job.signature,
    transactionId: job.gameEvent?.transactionId ?? job.signature,
    operationIndex:
      job.gameEvent?.operationIndex ?? job.paymentOperationIndex ?? 0,
    amount: job.withdrawAmount ?? job.depositAmount ?? job.price ?? 0,
    itemId: job.itemId ?? null,
    retryCount: job.retryCount,
    error: job.lastError ?? null,
    refunded: job.refunded ?? false,
    createdAt: toEpoch(job.createdAt),
  };
}

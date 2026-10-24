export type TreasuryIntent = {
  to: string;
  symbol: string;
  quantity: string;
  memo: string;
};
export class SettlementUncertainError extends Error {
  constructor(readonly key: string) {
    super(`Treasury transfer requires reconciliation: ${key}`);
    this.name = "SettlementUncertainError";
  }
}
export interface SettlementRepository {
  enqueueWithdrawal(input: {
    walletAddress: string;
    withdrawAmount: number;
    signature: string;
  }): Promise<{ jobId: string; signature: string }>;
  dispatch(
    key: string,
    intent: TreasuryIntent,
    send: () => Promise<{ success: boolean; transactionId?: string }>,
  ): Promise<{ success: boolean; transactionId?: string }>;
}

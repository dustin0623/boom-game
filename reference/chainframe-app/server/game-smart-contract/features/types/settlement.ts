export interface SettlementContext {
  checkLease: () => Promise<void>;
  maxRetries: number;
}

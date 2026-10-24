export class SettlementUncertainError extends Error {
  constructor(
    readonly key: string,
    options?: ErrorOptions,
  ) {
    super(`Treasury transfer requires reconciliation: ${key}`, options);
    this.name = "SettlementUncertainError";
  }
}

export class TreasuryPendingError extends Error {
  constructor() {
    super("Treasury payment submitted; waiting for verified execution");
    this.name = "TreasuryPendingError";
  }
}

export class TreasuryFailedError extends Error {
  constructor() {
    super("Treasury payment execution failed; operator review required");
    this.name = "TreasuryFailedError";
  }
}

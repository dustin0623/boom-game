import type { PaymentTrigger } from "hivexph-sdk";

export interface HiveBalance {
  hive: string;
  hbd: string;
  token: string;
  symbol: string;
  precision: { hive: number; hbd: number; token: number };
}
export interface HivePostingAuthority {
  weight_threshold: number;
  key_auths: Array<[string, number]>;
  account_auths: Array<[string, number]>;
}
export interface HivePaymentVerification {
  invalid?: boolean;
  failureProven?: boolean;
  operationIndex?: number;
  trigger?: PaymentTrigger | null;
  memo?: string | null;
  symbol: string;
  success: boolean;
  status: "pending" | "confirmed" | "failed";
  transactionId: string;
  blockNumber?: number;
  blockTimestamp?: string;
  from: string;
  to: string;
  amount: string;
  error?: string;
}
export interface HiveTransferResult {
  success: boolean;
  transactionId?: string;
  from: string;
  to: string;
  amount: string;
  symbol: string;
  memo: string;
}

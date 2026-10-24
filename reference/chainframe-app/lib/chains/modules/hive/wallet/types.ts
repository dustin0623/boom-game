export type CustomJsonBroadcastResult =
  | {
      ok: true;
      username: string;
      transactionId: string | null;
      status: "broadcast";
    }
  | {
      ok: false;
      username: string;
      status: "cancelled" | "unavailable" | "failed";
      error: string;
    };

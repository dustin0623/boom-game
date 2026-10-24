import { z } from "zod";

const shop = z
  .object({
    kind: z.enum(["chest", "consumable"]),
    itemId: z.string().min(1).max(64),
    quantity: z.number().int().positive().max(100),
  })
  .strict();
const trigger = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("registration"),
      metadata: z.object({}).strict(),
    })
    .strict(),
  z.object({ action: z.literal("shop_purchase"), metadata: shop }).strict(),
  z
    .object({ action: z.literal("deposit"), metadata: z.object({}).strict() })
    .strict(),
  z
    .object({
      action: z.literal("market_purchase"),
      metadata: z.object({ itemId: z.string().min(1).max(128) }).strict(),
    })
    .strict(),
]);
export type ChainframePaymentTrigger = z.infer<typeof trigger>;

/** Decode the current JSON payment envelope. */
export function parsePaymentMemo(
  memo: unknown,
): ChainframePaymentTrigger | null {
  if (typeof memo !== "string") return null;
  try {
    const result = trigger.safeParse(JSON.parse(memo));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Interpret application intent only after the Hive event has returned evidence. */
export function getPaymentTrigger(payment: {
  memo?: unknown;
  trigger?: unknown;
}): ChainframePaymentTrigger | null {
  return (
    parsePaymentMemo(payment.memo) ??
    parsePaymentMemo(JSON.stringify(payment.trigger))
  );
}

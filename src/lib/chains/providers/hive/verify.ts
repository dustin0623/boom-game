import { verifyHiveSignature } from "@/lib/chains/modules/hive/server/events/login/action";
import type { WalletLogin } from "@/features/types/auth.types";

/** Server: verify a Hive login via the module login event. */
export function verify(input: WalletLogin): Promise<boolean> {
  return verifyHiveSignature(input.address, input.message, input.signature);
}

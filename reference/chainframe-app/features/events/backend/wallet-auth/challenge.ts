import { buildLoginChallenge } from "@/lib/auth/login.server";
import { playerRepository } from "@/lib/modules/players/server.repository";
export async function generateLoginChallenge(wallet: string): Promise<string> {
  const challenge = buildLoginChallenge(wallet);
  await playerRepository.issueLoginNonce(
    challenge.wallet,
    challenge.nonceHash,
    challenge.expiresAt,
  );
  return challenge.message;
}

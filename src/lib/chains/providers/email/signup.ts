import { playerRepository, toPlayer, uniqueUsername } from "@/lib/modules/players/server.repository";
import type { EmailCredentials } from "./types";
import { hashPassword } from "./password";

export async function signupWithEmail({ email, password }: EmailCredentials) {
  if (await playerRepository.findByEmail(email)) throw new Error("Email already registered");
  const record = await playerRepository.create({
    username: await uniqueUsername(email.split("@")[0]!),
    email,
    passwordHash: await hashPassword(password),
    walletAddress: null,
  });
  return toPlayer(record);
}

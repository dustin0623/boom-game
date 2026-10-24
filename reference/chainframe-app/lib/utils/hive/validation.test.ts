import { describe, expect, it } from "vitest";
import {
  hiveUsernameSchema,
  isValidHiveUsername,
  normalizeHiveUsername,
} from "./validation";

describe("Hive account names", () => {
  it.each([
    "abc",
    "a12",
    "a-1",
    "player123",
    "player-one",
    "player.one",
    "abc.def-123",
    "abc--123",
    "abc.def.ghi",
    "a123456789012345",
  ])("accepts and normalizes valid name %s consistently", (account) => {
    const input = `  ${account.toUpperCase()}  `;
    expect(isValidHiveUsername(input)).toBe(true);
    expect(hiveUsernameSchema.parse(input)).toBe(account);
    expect(normalizeHiveUsername(input)).toBe(account);
  });

  it.each([
    "",
    "ab",
    "a1234567890123456",
    "123player",
    "player_name",
    "@player",
    "player!",
    "player name",
    "-player",
    "player-",
    ".player",
    "player.",
    "player..one",
    "ab.player",
    "player.ab",
    "player.123",
    "player.-abc",
    "player.abc-",
    "abc\n.def",
    "abc\r.def",
    "pläyer",
    "player/one",
  ])("rejects invalid name %j consistently", (account) => {
    expect(isValidHiveUsername(account)).toBe(false);
    expect(hiveUsernameSchema.safeParse(account).success).toBe(false);
    expect(() => normalizeHiveUsername(account)).toThrow(
      "Invalid Hive username",
    );
  });

  it("preserves the normalizer's custom error message", () => {
    expect(() =>
      normalizeHiveUsername("bad_name", "Enter a valid Hive username"),
    ).toThrow("Enter a valid Hive username");
  });
});

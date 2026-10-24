import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "./config";
import { getJwtSecret } from "@/lib/auth/secret.server";
const mutable = config as { jwtSecret: string };
const original = config.jwtSecret;
afterEach(() => {
  mutable.jwtSecret = original;
  vi.restoreAllMocks();
});
describe("lazy authentication secret validation", () => {
  it.each(["", "changeme-dev-secret", "short"])(
    'rejects unsafe configuration "%s"',
    (secret) => {
      mutable.jwtSecret = secret;
      expect(() => getJwtSecret()).toThrow("at least 32 UTF-8 bytes");
    },
  );
  it("accepts a configured secret without changing its bytes", () => {
    mutable.jwtSecret = "a-configured-test-secret-with-more-than-32-bytes";
    expect(getJwtSecret()).toBe(config.jwtSecret);
  });
});

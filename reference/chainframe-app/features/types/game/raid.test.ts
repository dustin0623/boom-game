import { describe, it, expect, vi, afterEach } from "vitest";
import { canRaid, raidSuccessChance } from "./raid";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("canRaid", () => {
  it("requires hack power to strictly exceed the target's security", () => {
    expect(canRaid(10, 5)).toBe(true);
    expect(canRaid(5, 5)).toBe(false);
    expect(canRaid(4, 5)).toBe(false);
  });
});

describe("raidSuccessChance", () => {
  it("is zero when outmatched", () => {
    expect(raidSuccessChance(5, 10, 0)).toBe(0);
  });

  it("is the inverse of firewall when able to raid", () => {
    expect(raidSuccessChance(10, 5, 30)).toBe(70);
  });

  it("clamps firewall to [0, 100]", () => {
    expect(raidSuccessChance(10, 5, 150)).toBe(0);
    expect(raidSuccessChance(10, 5, -20)).toBe(100);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { SOCIAL_ECONOMY } from "@/lib/config/constants/economy";
import { withGameExecution } from "./execution-context.server";
import {
  acquireSocialLock,
  acquirePurchaseLock,
  allowSocialAction,
  resetSocialGuards,
} from "./action-guards.server";

beforeEach(resetSocialGuards);

describe("shared action guards", () => {
  it("protects concurrent pairs and purchases until their release", () => {
    const social = acquireSocialLock("alice", "bob");
    const purchase = acquirePurchaseLock("alice", "item-1");
    expect(acquireSocialLock("alice", "bob")).toBeNull();
    expect(acquirePurchaseLock("alice", "item-1")).toBeNull();
    expect(acquireSocialLock("bob", "alice")).not.toBeNull();
    expect(acquirePurchaseLock("bob", "item-1")).not.toBeNull();
    social?.();
    purchase?.();
    expect(acquireSocialLock("alice", "bob")).not.toBeNull();
    expect(acquirePurchaseLock("alice", "item-1")).not.toBeNull();
  });

  it("resets held locks and rate-limit history together", () => {
    acquireSocialLock("alice", "bob");
    acquirePurchaseLock("alice", "item-1");
    const { maxActionsPerWindow } = SOCIAL_ECONOMY.socialActionLimits;
    for (let n = 0; n < maxActionsPerWindow; n++)
      allowSocialAction("alice", 1000);
    resetSocialGuards();
    expect(acquireSocialLock("alice", "bob")).not.toBeNull();
    expect(acquirePurchaseLock("alice", "item-1")).not.toBeNull();
    expect(allowSocialAction("alice", 1000)).toBe(true);
  });

  it("expires the caller window and bypasses limits for deterministic retries", async () => {
    const { maxActionsPerWindow, windowMs } = SOCIAL_ECONOMY.socialActionLimits;
    for (let n = 0; n < maxActionsPerWindow; n++)
      expect(allowSocialAction("alice", 1000)).toBe(true);
    expect(allowSocialAction("alice", 1000)).toBe(false);
    await withGameExecution(1000, "retry-seed", async () => {
      expect(allowSocialAction("alice", 1000)).toBe(true);
      expect(allowSocialAction("alice", 1000)).toBe(true);
    });
    expect(allowSocialAction("alice", 1000)).toBe(false);
    expect(allowSocialAction("alice", 1000 + windowMs)).toBe(true);
  });
});

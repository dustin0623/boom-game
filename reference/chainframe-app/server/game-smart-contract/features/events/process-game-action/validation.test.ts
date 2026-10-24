import { describe, expect, it } from "vitest";
import { z } from "zod";
import { hiveGameActionEvent } from "@/tests/fixtures/hive-game-action";
import {
  buildClaimAction,
  buildGameAction,
} from "@/lib/utils/game/action-protocol";
import { validateGameActionSubmission } from "@/lib/utils/game/action-validation";
import {
  GameActionRejectedError,
  validateGameActionProtocol,
  normalizeBlockchainTimestamp,
} from "@/server/game-smart-contract/features/events/process-game-action/validation";

describe("game submission validation stages", () => {
  it.each([
    buildClaimAction({ nonce: "posting-123456" }),
    buildGameAction("request_withdrawal", {
      nonce: "active-123456",
      amount: 1,
    }),
  ])("accepts the correct signing authority for $action", (payload) => {
    const event = hiveGameActionEvent(payload);
    expect(validateGameActionProtocol(event)).toEqual(payload);
    expect(normalizeBlockchainTimestamp(event.blockTimestamp)).toBe(
      Date.parse("2026-10-10T00:00:00Z"),
    );
    expect(validateGameActionSubmission(event)).toEqual(payload);
  });

  it("normalizes timestamps with or without UTC suffix identically", () => {
    const event = hiveGameActionEvent();
    expect(normalizeBlockchainTimestamp(event.blockTimestamp)).toEqual(
      normalizeBlockchainTimestamp(event.blockTimestamp + "Z"),
    );
  });

  it.each([
    {
      label: "wrong authority",
      requiredAuths: ["alice"],
      requiredPostingAuths: [],
    },
    {
      label: "both authorities",
      requiredAuths: ["alice"],
      requiredPostingAuths: ["alice"],
    },
    {
      label: "multiple signers",
      requiredAuths: [],
      requiredPostingAuths: ["alice", "bob"],
    },
    {
      label: "mismatched signer",
      requiredAuths: [],
      requiredPostingAuths: ["bob"],
    },
    { label: "missing signer", requiredAuths: [], requiredPostingAuths: [] },
  ])(
    "rejects $label in shared and processor validation",
    ({ label: _label, ...overrides }) => {
      const event = hiveGameActionEvent(undefined, overrides);
      expect(() => validateGameActionProtocol(event)).toThrow(
        GameActionRejectedError,
      );
      expect(() => validateGameActionProtocol(event)).toThrow(
        "game actions require exactly one matching posting authority",
      );
      expect(() => validateGameActionSubmission(event)).toThrow();
    },
  );

  it("rejects Posting authority on withdrawals", () => {
    const event = hiveGameActionEvent(
      buildGameAction("request_withdrawal", {
        nonce: "withdraw-123456",
        amount: 1,
      }),
      { requiredAuths: [], requiredPostingAuths: ["alice"] },
    );
    expect(() => validateGameActionProtocol(event)).toThrow(
      "game actions require exactly one matching active authority",
    );
    expect(() => validateGameActionSubmission(event)).toThrow();
  });

  it("rejects another application ID", () => {
    const event = hiveGameActionEvent(undefined, { id: "another-app" });
    expect(() => validateGameActionProtocol(event)).toThrow(
      "unexpected custom JSON id",
    );
    expect(() => validateGameActionSubmission(event)).toThrow(
      "unexpected custom JSON id",
    );
  });

  it.each([
    { raw: null },
    { raw: ["transfer", {}] },
    { raw: ["custom_json", { json: "{" }] },
  ])("rejects missing or malformed original JSON: %j", ({ raw }) => {
    const event = hiveGameActionEvent(undefined, { raw });
    expect(() => validateGameActionProtocol(event)).toThrow(
      GameActionRejectedError,
    );
    expect(() => validateGameActionProtocol(event)).toThrow(
      "missing or invalid original custom JSON",
    );
    expect(() => validateGameActionSubmission(event)).toThrow();
  });

  it("retains Zod errors for invalid payloads despite valid normalized metadata", () => {
    const event = hiveGameActionEvent(undefined, {
      raw: [
        "custom_json",
        {
          json: JSON.stringify({
            version: 99,
            action: "claim",
            metadata: { nonce: "invalid-123456" },
          }),
        },
      ],
    });
    expect(() => validateGameActionProtocol(event)).toThrow(z.ZodError);
    expect(() => validateGameActionSubmission(event)).toThrow(z.ZodError);
    expect(() => validateGameActionSubmission(event)).toThrow();
  });

  it("keeps protocol validation separate from execution timestamp validation", () => {
    const event = hiveGameActionEvent(undefined, {
      blockTimestamp: "invalid-time",
    });
    expect(validateGameActionProtocol(event)).toEqual(
      validateGameActionSubmission(event),
    );
    expect(() => normalizeBlockchainTimestamp(event.blockTimestamp)).toThrow(
      "invalid blockchain timestamp",
    );
  });
});

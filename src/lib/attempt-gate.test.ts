import { createHmac, randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { AttemptGateClient, AttemptGateError, signGateEnvelope, verifyGateEnvelope } from "@/lib/attempt-gate";

describe("signed attempt gate", () => {
  it("verifies an intact envelope and rejects tampering", () => {
    const envelope = signGateEnvelope(
      "progress",
      { submissionId: randomUUID(), status: "running", stage: "evaluation" },
      "test-secret",
      1_800_000_000_000,
      randomUUID(),
    );
    expect(verifyGateEnvelope(envelope, "test-secret")).toBe(true);
    expect(verifyGateEnvelope({ ...envelope, payload: { ...envelope.payload, stage: "complete" } }, "test-secret"))
      .toBe(false);
  });

  it("matches Apps Script's legacy HMAC encoding for Word-style punctuation", () => {
    const timestamp = 1_800_000_000_000;
    const nonce = "11111111-1111-4111-8111-111111111111";
    const payload = { answerParts: ["Dario’s response ¶10 — quoted"] };
    const envelope = signGateEnvelope("reserve", payload, "test-secret", timestamp, nonce);
    const canonical = `${timestamp}.${nonce}.reserve.${JSON.stringify(payload)}`
      .replace(/[^\x00-\x7f]/g, "?");
    expect(envelope.signature).toBe(
      createHmac("sha256", "test-secret").update(canonical).digest("base64url"),
    );
  });

  it("sends a signed request and validates the response", async () => {
    const submissionId = randomUUID();
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const envelope = JSON.parse(String(init?.body));
      expect(verifyGateEnvelope(envelope, "test-secret")).toBe(true);
      return new Response(JSON.stringify({
        ok: true,
        submissionId,
        attemptNumber: 1,
        remainingAttempts: 4,
      }));
    });
    const client = new AttemptGateClient("https://example.test/gate", "test-secret", fetchImpl as typeof fetch);
    const result = await client.reserve({
      studentId: randomUUID(),
      submissionId,
      requestKey: "request-1",
      examId: "2019-final",
      scope: "full_exam",
      mode: "full_draft",
      questionRef: "",
      createdAt: "2026-09-01T12:00:00.000Z",
      promptVersion: "test",
      answerParts: ["An answer"],
    });
    expect(result.remainingAttempts).toBe(4);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("authenticates only with a code hash and returns an opaque student ID", async () => {
    const studentId = randomUUID();
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const envelope = JSON.parse(String(init?.body));
      expect(envelope.action).toBe("authenticate");
      expect(envelope.payload).toEqual({
        codeHash: "a".repeat(64),
        loginAt: "2026-09-01T12:00:00.000Z",
      });
      expect(JSON.stringify(envelope)).not.toContain("email");
      return new Response(JSON.stringify({
        ok: true,
        studentId,
        pseudonym: "copper-horse",
        remainingAttempts: 5,
      }));
    });
    const client = new AttemptGateClient("https://example.test/gate", "test-secret", fetchImpl as typeof fetch);
    const result = await client.authenticate({
      codeHash: "a".repeat(64),
      loginAt: "2026-09-01T12:00:00.000Z",
    });
    expect(result).toMatchObject({ studentId, pseudonym: "copper-horse" });
  });

  it("preserves a known gate error code for safe API handling", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      code: "already_running",
      error: "A feedback submission is already in progress.",
    })));
    const client = new AttemptGateClient("https://example.test/gate", "test-secret", fetchImpl as typeof fetch);
    await expect(client.reserve({
      studentId: randomUUID(),
      submissionId: randomUUID(),
      requestKey: "request-2",
      examId: "2019-final",
      scope: "full_exam",
      mode: "full_draft",
      questionRef: "",
      createdAt: "2026-09-01T12:00:00.000Z",
      promptVersion: "test",
      answerParts: ["An answer"],
    })).rejects.toEqual(new AttemptGateError(
      "already_running",
      "A feedback submission is already in progress.",
    ));
  });
});

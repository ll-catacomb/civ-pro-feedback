import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { AttemptGateClient, signGateEnvelope, verifyGateEnvelope } from "@/lib/attempt-gate";

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
      googleSubject: "google-1",
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
});

import { describe, expect, it } from "vitest";

import { createGoogleIdentityProof, verifyGoogleIdentityProof } from "./google-identity-proof";

describe("Google identity handoff", () => {
  const secret = "a sufficiently long test-only Auth.js secret";
  const now = Date.parse("2026-09-27T20:00:00.000Z");

  it("round-trips a verified Google subject", () => {
    const proof = createGoogleIdentityProof("google-subject-123", secret, now);
    expect(verifyGoogleIdentityProof(proof, secret, now + 1_000)).toEqual({
      subject: "google-subject-123",
      expiresAt: now + 10 * 60 * 1_000,
    });
  });

  it("rejects tampering, the wrong secret, and expired handoffs", () => {
    const proof = createGoogleIdentityProof("google-subject-123", secret, now);
    expect(verifyGoogleIdentityProof(`${proof}x`, secret, now)).toBeNull();
    expect(verifyGoogleIdentityProof(proof, "different secret", now)).toBeNull();
    expect(verifyGoogleIdentityProof(proof, secret, now + 10 * 60 * 1_000 + 1)).toBeNull();
  });
});

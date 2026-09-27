import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

const GoogleIdentityProofSchema = z.object({
  subject: z.string().min(1),
  expiresAt: z.number().int().positive(),
});

export type GoogleIdentityProof = z.infer<typeof GoogleIdentityProofSchema>;

const PROOF_LIFETIME_MS = 10 * 60 * 1000;

function signature(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function createGoogleIdentityProof(
  subject: string,
  secret: string,
  now = Date.now(),
): string {
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  const payload = GoogleIdentityProofSchema.parse({
    subject,
    expiresAt: now + PROOF_LIFETIME_MS,
  });
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signature(body, secret)}`;
}

export function verifyGoogleIdentityProof(
  proof: string,
  secret: string,
  now = Date.now(),
): GoogleIdentityProof | null {
  if (!proof || !secret) return null;
  const [body, supplied, extra] = proof.split(".");
  if (!body || !supplied || extra) return null;
  const expected = signature(body, secret);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length
    || !timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;
  try {
    const payload = GoogleIdentityProofSchema.parse(
      JSON.parse(Buffer.from(body, "base64url").toString("utf8")),
    );
    return payload.expiresAt >= now ? payload : null;
  } catch {
    return null;
  }
}

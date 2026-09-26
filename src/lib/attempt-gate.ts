import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { z } from "zod";

const GateActionSchema = z.enum(["claim", "reserve", "complete", "refund", "progress"]);
export type GateAction = z.infer<typeof GateActionSchema>;

const GateEnvelopeSchema = z.object({
  timestamp: z.number().int().positive(),
  nonce: z.string().uuid(),
  action: GateActionSchema,
  payload: z.record(z.string(), z.unknown()),
  signature: z.string().min(1),
});

export type GateEnvelope = z.infer<typeof GateEnvelopeSchema>;

export const ClaimIdentityPayloadSchema = z.object({
  email: z.string().email(),
  googleSubject: z.string().min(1),
  loginAt: z.string().datetime(),
});
export type ClaimIdentityPayload = z.infer<typeof ClaimIdentityPayloadSchema>;

export const ReserveAttemptPayloadSchema = z.object({
  googleSubject: z.string().min(1),
  submissionId: z.string().uuid(),
  requestKey: z.string().min(1),
  examId: z.string().min(1),
  scope: z.enum(["full_exam", "single_question"]),
  mode: z.enum(["full_draft", "bullet_points"]),
  questionRef: z.string(),
  createdAt: z.string().datetime(),
  promptVersion: z.string().min(1),
  answerParts: z.array(z.string()).min(1),
});
export type ReserveAttemptPayload = z.infer<typeof ReserveAttemptPayloadSchema>;

const FinishAttemptPayloadSchema = z.object({
  googleSubject: z.string().min(1),
  submissionId: z.string().uuid(),
  updatedAt: z.string().datetime(),
  errorReference: z.string().optional(),
});
export type FinishAttemptPayload = z.infer<typeof FinishAttemptPayloadSchema>;

export const ProgressPayloadSchema = z.object({
  submissionId: z.string().uuid(),
  status: z.enum(["queued", "running"]),
  stage: z.string().min(1),
  updatedAt: z.string().datetime(),
});
export type ProgressPayload = z.infer<typeof ProgressPayloadSchema>;

export const GateResponseSchema = z.object({
  ok: z.boolean(),
  submissionId: z.string().uuid().optional(),
  attemptNumber: z.number().int().positive().optional(),
  remainingAttempts: z.number().int().nonnegative().optional(),
  duplicate: z.boolean().optional(),
  pseudonym: z.string().regex(/^[a-z]+-[a-z]+$/).optional(),
  error: z.string().optional(),
  code: z.enum([
    "invalid_request",
    "unauthorized",
    "not_enrolled",
    "disabled",
    "limit_reached",
    "already_running",
    "not_found",
    "conflict",
    "internal_error",
  ]).optional(),
});
export type GateResponse = z.infer<typeof GateResponseSchema>;

function canonicalMessage(envelope: Omit<GateEnvelope, "signature">): string {
  return `${envelope.timestamp}.${envelope.nonce}.${envelope.action}.${JSON.stringify(envelope.payload)}`;
}

export function signGateEnvelope(
  action: GateAction,
  payload: Record<string, unknown>,
  secret: string,
  now = Date.now(),
  nonce: string = randomUUID(),
): GateEnvelope {
  if (!secret) throw new Error("The attempt-gate secret is empty.");
  const unsigned = { timestamp: now, nonce, action, payload };
  const signature = createHmac("sha256", secret).update(canonicalMessage(unsigned)).digest("base64url");
  return GateEnvelopeSchema.parse({ ...unsigned, signature });
}

export function verifyGateEnvelope(envelope: GateEnvelope, secret: string): boolean {
  const expected = signGateEnvelope(
    envelope.action,
    envelope.payload,
    secret,
    envelope.timestamp,
    envelope.nonce,
  ).signature;
  const actualBuffer = Buffer.from(envelope.signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

type FetchLike = typeof fetch;

export class AttemptGateClient {
  constructor(
    private readonly endpoint: string,
    private readonly secret: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  claim(payload: ClaimIdentityPayload): Promise<GateResponse> {
    return this.call("claim", ClaimIdentityPayloadSchema.parse(payload));
  }

  reserve(payload: ReserveAttemptPayload): Promise<GateResponse> {
    return this.call("reserve", ReserveAttemptPayloadSchema.parse(payload));
  }

  complete(payload: FinishAttemptPayload): Promise<GateResponse> {
    return this.call("complete", FinishAttemptPayloadSchema.parse(payload));
  }

  refund(payload: FinishAttemptPayload): Promise<GateResponse> {
    return this.call("refund", FinishAttemptPayloadSchema.parse(payload));
  }

  progress(payload: ProgressPayload): Promise<GateResponse> {
    return this.call("progress", ProgressPayloadSchema.parse(payload));
  }

  private async call(action: GateAction, payload: Record<string, unknown>): Promise<GateResponse> {
    const envelope = signGateEnvelope(action, payload, this.secret);
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      redirect: "follow",
    });
    const raw = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`The attempt gate returned a non-JSON response (${response.status}).`);
    }
    const result = GateResponseSchema.parse(parsed);
    if (!response.ok || !result.ok) {
      throw new Error(result.error ?? `The attempt gate failed (${response.status}).`);
    }
    return result;
  }
}

export function createAttemptGateClient(): AttemptGateClient {
  const endpoint = process.env.GOOGLE_ATTEMPT_GATE_URL;
  const secret = process.env.GOOGLE_ATTEMPT_GATE_SECRET;
  if (!endpoint || !secret) {
    throw new Error("GOOGLE_ATTEMPT_GATE_URL and GOOGLE_ATTEMPT_GATE_SECRET must be configured.");
  }
  return new AttemptGateClient(endpoint, secret);
}

export function attemptGateConfigured(): boolean {
  return Boolean(process.env.GOOGLE_ATTEMPT_GATE_URL && process.env.GOOGLE_ATTEMPT_GATE_SECRET);
}

import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { z } from "zod";

const GateActionSchema = z.enum(["authenticate", "reserve", "complete", "refund", "progress"]);
export type GateAction = z.infer<typeof GateActionSchema>;

const GateEnvelopeSchema = z.object({
  timestamp: z.number().int().positive(),
  nonce: z.string().uuid(),
  action: GateActionSchema,
  payload: z.record(z.string(), z.unknown()),
  signature: z.string().min(1),
});

export type GateEnvelope = z.infer<typeof GateEnvelopeSchema>;

export const AuthenticateCodePayloadSchema = z.object({
  codeHash: z.string().regex(/^[a-f0-9]{64}$/),
  loginAt: z.string().datetime(),
});
export type AuthenticateCodePayload = z.infer<typeof AuthenticateCodePayloadSchema>;

export const ReserveAttemptPayloadSchema = z.object({
  studentId: z.string().uuid(),
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
  studentId: z.string().uuid(),
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
  studentId: z.string().uuid().optional(),
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
export type AttemptGateErrorCode = NonNullable<GateResponse["code"]>;

export class AttemptGateError extends Error {
  constructor(
    public readonly code: AttemptGateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AttemptGateError";
  }
}

function canonicalMessage(envelope: Omit<GateEnvelope, "signature">): string {
  const message = `${envelope.timestamp}.${envelope.nonce}.${envelope.action}.${JSON.stringify(envelope.payload)}`;
  // Apps Script's two-argument computeHmacSha256Signature overload encodes
  // unmappable non-ASCII characters as "?". Mirror that legacy behavior for
  // signatures only; the JSON request and stored student answer remain UTF-8.
  // A future gate version should use its explicit UTF_8 overload, coordinated
  // with removal of this compatibility transform.
  return message.replace(/[^\x00-\x7f]/g, "?");
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
const DEFAULT_RETRY_DELAYS_MS = [0, 250, 750] as const;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class AttemptGateClient {
  constructor(
    private readonly endpoint: string,
    private readonly secret: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly retryDelaysMs: readonly number[] = DEFAULT_RETRY_DELAYS_MS,
  ) {}

  authenticate(payload: AuthenticateCodePayload): Promise<GateResponse> {
    return this.call("authenticate", AuthenticateCodePayloadSchema.parse(payload));
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
    let lastTransientError: Error | undefined;
    for (let attempt = 0; attempt < this.retryDelaysMs.length; attempt += 1) {
      if (attempt > 0) await delay(this.retryDelaysMs[attempt]);
      const envelope = signGateEnvelope(action, payload, this.secret);
      let response: Response;
      try {
        response = await this.fetchImpl(this.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(envelope),
          redirect: "follow",
        });
      } catch (error) {
        lastTransientError = error instanceof Error ? error : new Error("The attempt gate request failed.");
        if (attempt + 1 < this.retryDelaysMs.length) continue;
        throw lastTransientError;
      }
      const raw = await response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        lastTransientError = new Error(`The attempt gate returned a non-JSON response (${response.status}).`);
        // Apps Script can finish a write and then transiently return an HTML
        // success page. Retrying is safe: reserve uses requestKey idempotency,
        // and every other action is idempotent for the same submission.
        if (response.ok && attempt + 1 < this.retryDelaysMs.length) continue;
        throw lastTransientError;
      }
      const result = GateResponseSchema.parse(parsed);
      if (!response.ok || !result.ok) {
        const gateError = new AttemptGateError(
          result.code ?? "internal_error",
          result.error ?? `The attempt gate failed (${response.status}).`,
        );
        const transient = result.code === "internal_error"
          || response.status === 429
          || response.status >= 500;
        if (transient && attempt + 1 < this.retryDelaysMs.length) {
          lastTransientError = gateError;
          continue;
        }
        throw gateError;
      }
      return result;
    }
    throw lastTransientError ?? new Error("The attempt gate request failed after retries.");
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

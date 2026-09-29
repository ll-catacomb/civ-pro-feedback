import "server-only";

const DEFAULT_BASE_URL = "https://apis.huit.harvard.edu/ais-bedrock-llm/v2";
// Keep one provider call comfortably inside Vercel's step lifetime so the
// stage-level fallback can run before infrastructure terminates the function.
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export type HuitClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: string; [key: string]: unknown };

export type HuitClaudeResponse = {
  id?: string;
  model?: string;
  content: HuitClaudeContentBlock[];
  stop_reason?: string | null;
  stop_details?: { type?: string; category?: string } | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

export type HuitClaudeRequest = {
  model: string;
  maxTokens: number;
  system: string;
  userPrompt: string;
  thinking: { type: "adaptive" };
  outputConfig: {
    effort: "low" | "medium" | "high" | "xhigh";
    format?: {
      type: "json_schema";
      schema: Record<string, unknown>;
    };
  };
};

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function errorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const record = body as Record<string, unknown>;
  if (typeof record.message === "string") return record.message;
  if (typeof record.error === "string") return record.error;
  if (record.error && typeof record.error === "object") {
    const nested = record.error as Record<string, unknown>;
    if (typeof nested.message === "string") return nested.message;
  }
  return fallback;
}

function unwrapResponse(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (!("body" in record)) return value;
  if (typeof record.body === "string") {
    try {
      return JSON.parse(record.body);
    } catch {
      return value;
    }
  }
  return record.body && typeof record.body === "object" ? record.body : value;
}

export class HuitBedrockError extends Error {
  readonly status: number;
  readonly requestID?: string;
  readonly retryAfterMs?: number;

  constructor(input: {
    message: string;
    status: number;
    requestID?: string;
    retryAfterMs?: number;
  }) {
    super(input.message);
    this.name = "HuitBedrockError";
    this.status = input.status;
    this.requestID = input.requestID;
    this.retryAfterMs = input.retryAfterMs;
  }
}

export class HuitBedrockClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(input?: { apiKey?: string; baseUrl?: string; timeoutMs?: number }) {
    this.apiKey = input?.apiKey ?? process.env.HUIT_BEDROCK_API_KEY ?? "";
    this.baseUrl = (input?.baseUrl ?? process.env.HUIT_BEDROCK_BASE_URL ?? DEFAULT_BASE_URL)
      .replace(/\/+$/, "");
    this.timeoutMs = input?.timeoutMs
      ?? positiveInteger(process.env.HUIT_BEDROCK_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  }

  async invoke(input: HuitClaudeRequest): Promise<HuitClaudeResponse> {
    if (!this.apiKey) throw new Error("HUIT_BEDROCK_API_KEY is not configured.");
    let response: Response;
    try {
      response = await fetch(
        `${this.baseUrl}/model/${encodeURIComponent(input.model)}/invoke`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
          },
          body: JSON.stringify({
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: input.maxTokens,
            thinking: input.thinking,
            output_config: input.outputConfig,
            system: input.system,
            messages: [{
              role: "user",
              content: [{ type: "text", text: input.userPrompt }],
            }],
          }),
          signal: AbortSignal.timeout(this.timeoutMs),
          cache: "no-store",
        },
      );
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new HuitBedrockError({
          message: `HUIT Bedrock request timed out after ${this.timeoutMs}ms.`,
          status: 504,
        });
      }
      throw error;
    }
    const requestID = response.headers.get("x-request-id")
      ?? response.headers.get("x-amzn-requestid")
      ?? response.headers.get("x-amzn-request-id")
      ?? undefined;
    const raw = await response.text();
    let parsed: unknown;
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      throw new HuitBedrockError({
        message: `HUIT Bedrock returned a non-JSON response (HTTP ${response.status}).`,
        status: response.status,
        requestID,
      });
    }
    const body = unwrapResponse(parsed);
    if (!response.ok) {
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      throw new HuitBedrockError({
        message: errorMessage(body, `HUIT Bedrock request failed with HTTP ${response.status}.`),
        status: response.status,
        requestID,
        retryAfterMs: Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : undefined,
      });
    }
    if (!body || typeof body !== "object" || !Array.isArray((body as HuitClaudeResponse).content)) {
      throw new HuitBedrockError({
        message: "HUIT Bedrock returned an unexpected Claude response shape.",
        status: response.status,
        requestID,
      });
    }
    return body as HuitClaudeResponse;
  }
}

export function huitBedrockConfigured(): boolean {
  return Boolean(process.env.HUIT_BEDROCK_API_KEY?.trim());
}

export function huitNativeStructuredOutputEnabled(): boolean {
  return process.env.HUIT_BEDROCK_STRUCTURED_OUTPUT?.trim().toLowerCase() === "true";
}

export const HUIT_BEDROCK_DEFAULT_BASE_URL = DEFAULT_BASE_URL;

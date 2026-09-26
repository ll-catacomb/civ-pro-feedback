import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HuitBedrockClient,
  HuitBedrockError,
  type HuitClaudeRequest,
} from "@/lib/huit-bedrock";

const request: HuitClaudeRequest = {
  model: "us.anthropic.claude-opus-4-6-v1",
  maxTokens: 64_000,
  system: "Return a structured result.",
  userPrompt: "Evaluate this answer.",
  thinking: { type: "adaptive" },
  outputConfig: {
    effort: "high",
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: { result: { type: "string" } },
        required: ["result"],
        additionalProperties: false,
      },
    },
  },
};

afterEach(() => vi.restoreAllMocks());

describe("HUIT Bedrock client", () => {
  it("sends a native Claude request with the key only in the header", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      id: "message-1",
      model: request.model,
      content: [{ type: "text", text: '{"result":"ok"}' }],
      stop_reason: "end_turn",
      usage: { input_tokens: 12, output_tokens: 4 },
    }), { status: 200 }));
    const client = new HuitBedrockClient({
      apiKey: "test-secret-key",
      baseUrl: "https://example.edu/bedrock/v2/",
      timeoutMs: 1_000,
    });

    const result = await client.invoke(request);

    expect(result.id).toBe("message-1");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.edu/bedrock/v2/model/us.anthropic.claude-opus-4-6-v1/invoke");
    expect(String(url)).not.toContain("test-secret-key");
    expect(init?.headers).toMatchObject({ "x-api-key": "test-secret-key" });
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 64_000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema" } },
      messages: [{ role: "user", content: [{ type: "text", text: "Evaluate this answer." }] }],
    });
    expect(JSON.stringify(body)).not.toContain("test-secret-key");
  });

  it("accepts a JSON body wrapped by an API gateway response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      body: JSON.stringify({
        content: [{ type: "text", text: '{"result":"ok"}' }],
        stop_reason: "end_turn",
      }),
    }), { status: 200 }));
    const client = new HuitBedrockClient({ apiKey: "key", baseUrl: "https://example.edu/v2" });

    await expect(client.invoke(request)).resolves.toMatchObject({ stop_reason: "end_turn" });
  });

  it("preserves status and request ID without exposing the API key", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ message: "Budget quota reached." }),
      { status: 429, headers: { "x-request-id": "request-42", "retry-after": "10" } },
    ));
    const client = new HuitBedrockClient({ apiKey: "never-print-this", baseUrl: "https://example.edu/v2" });

    const error = await client.invoke(request).catch((cause) => cause);

    expect(error).toBeInstanceOf(HuitBedrockError);
    expect(error).toMatchObject({ status: 429, requestID: "request-42", retryAfterMs: 10_000 });
    expect(String(error)).not.toContain("never-print-this");
  });
});

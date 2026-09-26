import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

async function getJson(url, apiKey) {
  const response = await fetch(url, {
    headers: { "x-api-key": apiKey },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${url.pathname} returned non-JSON HTTP ${response.status}.`);
  }
  if (!response.ok) {
    const message = body?.message ?? body?.error?.message ?? body?.error ?? `HTTP ${response.status}`;
    throw new Error(`${url.pathname} failed: ${message}`);
  }
  return body;
}

async function main() {
  const apiKey = required("HUIT_BEDROCK_API_KEY");
  const baseUrl = new URL(required("HUIT_BEDROCK_BASE_URL").replace(/\/+$/, "") + "/");
  const configuredModels = new Set([
    required("HUIT_BEDROCK_FAST_MODEL"),
    required("HUIT_BEDROCK_WORK_MODEL"),
    required("HUIT_BEDROCK_EVALUATOR_MODEL"),
    required("HUIT_BEDROCK_JUDGE_MODEL"),
  ]);
  const profilesUrl = new URL("inference-profiles?maxResults=1000", baseUrl);
  const profileBody = await getJson(profilesUrl, apiKey);
  const summaries = Array.isArray(profileBody.inferenceProfileSummaries)
    ? profileBody.inferenceProfileSummaries
    : [];
  const available = new Set(summaries
    .map((profile) => profile?.inferenceProfileId)
    .filter((id) => typeof id === "string"));
  if (!available.size) throw new Error("HUIT returned no inference profile IDs.");
  const missing = [...configuredModels].filter((model) => !available.has(model));
  if (missing.length) {
    throw new Error(`Configured model profile${missing.length === 1 ? " is" : "s are"} unavailable: ${missing.join(", ")}`);
  }

  const quotaUrl = new URL("../apigee/quota", baseUrl);
  const quotaBody = await getJson(quotaUrl, apiKey);
  const unit = quotaBody.quota?.limit_unit ?? "USD";
  const limit = quotaBody.quota?.limit ?? "unknown";
  const remaining = quotaBody.remaining_limit ?? "unknown";
  const period = [quotaBody.quota?.interval, quotaBody.quota?.unit].filter(Boolean).join(" ") || "period";
  console.log(`HUIT Bedrock access passed. Models available: ${[...configuredModels].join(", ")}.`);
  console.log(`Budget remaining: ${remaining} ${unit} of ${limit} ${unit} per ${period}.`);
  console.log("No billable model invocation was made.");
}

main().catch((error) => {
  console.error(`HUIT Bedrock check failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});

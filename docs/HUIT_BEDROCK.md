# HUIT Bedrock integration

The feedback chain calls Claude through HUIT AI Services' AWS Bedrock proxy. It
does not use a direct Anthropic credential or an AWS access key.

## Contract

- Base URL: `https://apis.huit.harvard.edu/ais-bedrock-llm/v2`
- Authentication: Harvard API Portal **key** in the `x-api-key` header
- Inference: `POST /model/{modelId}/invoke`
- Model discovery: `GET /inference-profiles`
- Budget status: `GET /apigee/quota` from the service root

The Portal also issues an app secret. This application does not use that secret.
Never put either value in a query string or a browser-visible environment
variable.

## Claude request format

The client sends Claude's native Bedrock Messages payload with
`anthropic_version: bedrock-2023-05-31`, adaptive thinking, and an effort level.
AWS Bedrock documents native structured output through `output_config.format`,
but HUIT's current proxy rejects that field. The production default therefore
places the JSON schema in the system instruction and validates every response
with the original Zod schema before it can enter the next workflow stage. Set
`HUIT_BEDROCK_STRUCTURED_OUTPUT=true` only after a live HUIT request confirms
that the proxy accepts the native field.

The default tier uses `us.anthropic.claude-sonnet-5` for intake, issue mapping,
retrieval, and feedback drafting. The band-setting evaluation, independent
responsiveness judge, final skeptical judge, and calibration analysis use
`us.anthropic.claude-opus-5-5`. This reserves the strongest model for decisions
where an error materially changes the student's result while keeping supporting
stages faster and less expensive. The `us.` profiles restrict processing to US
AWS regions. Do not switch to a `global.` profile without an explicit
data-processing decision. The app deliberately does not use Claude Fable models
because HUIT documents separate provider-data-share terms for that family.

When native structured output is eventually enabled, Bedrock may take several
minutes to compile a new schema the first time it sees it; compiled schemas are
subsequently cached. The client allows ten minutes per invocation by default,
and the student progress page continues to show the active stage during that
initial delay.

## Configuration

```text
HUIT_BEDROCK_API_KEY=
HUIT_BEDROCK_BASE_URL=https://apis.huit.harvard.edu/ais-bedrock-llm/v2
HUIT_BEDROCK_FAST_MODEL=us.anthropic.claude-sonnet-5
HUIT_BEDROCK_WORK_MODEL=us.anthropic.claude-sonnet-5
HUIT_BEDROCK_EVALUATOR_MODEL=us.anthropic.claude-opus-5-5
HUIT_BEDROCK_JUDGE_MODEL=us.anthropic.claude-opus-5-5
HUIT_BEDROCK_STRUCTURED_OUTPUT=false
# HUIT_BEDROCK_TIMEOUT_MS=600000
```

After the key is approved:

```bash
npm run huit:check
```

This checks authentication, confirms both configured inference-profile IDs, and
prints the current spending limit and remaining budget. It does not invoke a
model. After it passes, make one designated end-to-end feedback submission to
validate HUIT's accepted payload fields, cold schema-compilation latency, Vercel
step duration, response shape, and recorded token usage.

Because model changes can shift grading thresholds even when the newer model is
more capable overall, run the four-answer evaluator smoke sweep and then the
full benchmark before releasing this tier to students.

## Failure behavior

Authentication, forbidden-model, invalid-payload, and oversized-request errors
fail immediately and refund the student's reservation. Transient rate-limit and
service errors use the existing bounded stage retry ladder. HUIT budget caps
surface as HTTP 429 responses; the failed workflow is refunded and preserves its
submission ID as the support reference.

## Data classification

HUIT documents the Bedrock gateway as approved for Level 3 confidential data.
That statement applies to the gateway and its Bedrock processing path. Harvard
approval must separately cover Vercel hosting, Workflow execution/log retention,
Google Sheets configuration, staff access, and the course's retention policy.

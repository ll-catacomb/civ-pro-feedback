# Going Forward

This file records improvements and institutional follow-up that are useful but
not prerequisites for the current TA pilot.

## Request native structured-output support from HUIT

### What to request

Ask HUIT AI Services to support AWS Bedrock's native JSON Schema output format
on the v2 Anthropic Invoke endpoint:

```text
POST /ais-bedrock-llm/v2/model/{modelId}/invoke
output_config.format.type = json_schema
output_config.format.schema = <JSON Schema object>
```

AWS documents this field for Anthropic models using the Bedrock Runtime
`InvokeModel` API. Native enforcement would reduce malformed JSON retries and
make each feedback stage more predictable.

### Reproduction from the pilot

- Date: 2026-09-28
- Endpoint: `/ais-bedrock-llm/v2/model/us.anthropic.claude-sonnet-5/invoke`
- HTTP status: `400`
- Sanitized response message:

  ```text
  output_config.format: Extra inputs are not permitted
  ```

- HUIT/AWS request reference observed by the app:
  `e1900a1d-f298-44a9-b8d5-4376b8f3a86a`
- A small synthetic request using the same model, adaptive thinking, and effort
  setting—but omitting `output_config.format` and requesting JSON in the system
  instruction—returned valid JSON successfully on 2026-09-28.
- No API key, student identity, or student answer is included in this record.

Suggested questions for HUIT:

1. Does the v2 proxy currently route Anthropic Invoke requests through a
   surface or request validator that does not expose Bedrock Runtime structured
   outputs?
2. Can `output_config.format` be enabled for the supported `us.anthropic.*`
   inference profiles, including Sonnet 5 and Opus 5.5?
3. If Invoke cannot support it, does HUIT's `/converse` endpoint support
   Bedrock's `outputConfig.textFormat` field and unified structured-output
   response?
4. Can HUIT publish a feature matrix showing supported request fields by model
   and endpoint, in addition to the generic request object in the OpenAPI spec?

Acceptance test: the documented AWS JSON-schema extraction example should
return HTTP 200 through HUIT for both configured course models, and invalid
schemas should produce a schema-specific validation error rather than an
unknown-field error.

### Current application fallback

The app now puts the JSON Schema into the system instruction, requests JSON
only, and validates the response with the original Zod schema. Native Bedrock
structured output remains behind:

```text
HUIT_BEDROCK_STRUCTURED_OUTPUT=true
```

Leave the setting false or unset until a live HUIT request passes. After HUIT
adds support, enable it in a preview deployment, run a full feedback smoke test,
and compare schema-error and latency rates before enabling it in production.

## Before full student launch

- Obtain Harvard confirmation for the Vercel and Workflow data path at the
  intended student-response classification.
- Move the Google Cloud project, OAuth client, service account, Apps Script,
  and Sheets into a course-owned environment.
- Set a HUIT spending cap tied to the course billing ID.
- Rotate the Apps Script gate secret in both Script Properties and Vercel.
- Update the Apps Script HMAC call to pass `Utilities.Charset.UTF_8`, deploy the
  new gate version, and then remove Next.js's legacy non-ASCII-to-`?` signature
  compatibility transform. The current transform preserves the original answer
  payload but mirrors Apps Script's default signing behavior for Word-style
  punctuation.
- Convert remaining credential-like Vercel Config values to Sensitive values.
- Approve the student disclosure, support route, workbook access list, and
  record-retention/deletion date.
- Complete the Sonnet 5 / Opus 5.5 evaluator calibration before treating band
  estimates as ready for the full class.

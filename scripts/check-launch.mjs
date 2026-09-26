import nextEnv from "@next/env";
import { GoogleAuth } from "google-auth-library";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const REQUIRED = [
  "HUIT_BEDROCK_API_KEY",
  "HUIT_BEDROCK_BASE_URL",
  "HUIT_BEDROCK_FAST_MODEL",
  "HUIT_BEDROCK_WORK_MODEL",
  "HUIT_BEDROCK_EVALUATOR_MODEL",
  "HUIT_BEDROCK_JUDGE_MODEL",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
  "GOOGLE_IDENTITY_SPREADSHEET_ID",
  "GOOGLE_FEEDBACK_SPREADSHEET_ID",
  "GOOGLE_ATTEMPT_GATE_URL",
  "GOOGLE_ATTEMPT_GATE_SECRET",
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "GOOGLE_WORKSPACE_DOMAIN",
  "STAFF_EMAILS",
];
const EXPECTED_HEADERS = [
  ["Enrollment!A1:J1", [
    "student_id", "google_subject", "email", "pseudonym", "status",
    "max_attempts", "attempts_consumed", "active_submission_id", "created_at",
    "last_login_at",
  ]],
  ["Submissions!A1:N1", [
    "submission_id", "pseudonym", "request_key", "status", "stage",
    "attempt_number", "exam_id", "scope", "mode", "question_ref", "created_at",
    "updated_at", "prompt_version", "error_reference",
  ]],
  ["Content!A1:D1", ["submission_id", "content_type", "part", "text"]],
];

const failures = [];
const warnings = [];
const value = (name) => process.env[name]?.trim() ?? "";

for (const name of REQUIRED) {
  if (!value(name)) failures.push(`${name} is missing.`);
}
if (value("AUTH_SECRET") && value("AUTH_SECRET").length < 32) {
  failures.push("AUTH_SECRET must contain at least 32 characters.");
}
if (value("GOOGLE_ATTEMPT_GATE_SECRET") && value("GOOGLE_ATTEMPT_GATE_SECRET").length < 32) {
  failures.push("GOOGLE_ATTEMPT_GATE_SECRET must contain at least 32 characters.");
}
if (value("HUIT_BEDROCK_BASE_URL")) {
  try {
    const url = new URL(value("HUIT_BEDROCK_BASE_URL"));
    if (url.protocol !== "https:") failures.push("HUIT_BEDROCK_BASE_URL must use HTTPS.");
    if (url.hostname !== "apis.huit.harvard.edu") {
      failures.push("HUIT_BEDROCK_BASE_URL must use the HUIT API Gateway hostname.");
    }
    if (!url.pathname.replace(/\/+$/, "").endsWith("/ais-bedrock-llm/v2")) {
      failures.push("HUIT_BEDROCK_BASE_URL must end with /ais-bedrock-llm/v2.");
    }
  } catch {
    failures.push("HUIT_BEDROCK_BASE_URL is not a valid URL.");
  }
}
for (const name of [
  "HUIT_BEDROCK_FAST_MODEL",
  "HUIT_BEDROCK_WORK_MODEL",
  "HUIT_BEDROCK_EVALUATOR_MODEL",
  "HUIT_BEDROCK_JUDGE_MODEL",
]) {
  const model = value(name);
  if (model && !model.startsWith("us.anthropic.")) {
    failures.push(`${name} must use a US Anthropic cross-region inference profile.`);
  }
}
if (value("STUDENT_DEMO_MODE").toLowerCase() !== "false") {
  failures.push("STUDENT_DEMO_MODE must be explicitly set to false for launch.");
}
if (value("GOOGLE_IDENTITY_SPREADSHEET_ID")
  && value("GOOGLE_IDENTITY_SPREADSHEET_ID") === value("GOOGLE_FEEDBACK_SPREADSHEET_ID")) {
  failures.push("Production must use separate identity and feedback workbooks.");
}
if (value("GOOGLE_ATTEMPT_GATE_URL")) {
  try {
    const url = new URL(value("GOOGLE_ATTEMPT_GATE_URL"));
    if (url.protocol !== "https:") failures.push("GOOGLE_ATTEMPT_GATE_URL must use HTTPS.");
  } catch {
    failures.push("GOOGLE_ATTEMPT_GATE_URL is not a valid URL.");
  }
}
// Mirrors src/lib/workspace-domains.ts: each entry admits itself and subdomains.
const workspaceDomains = value("GOOGLE_WORKSPACE_DOMAIN").split(",")
  .map((domain) => domain.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
const inWorkspace = (email) => {
  const emailDomain = email.slice(email.lastIndexOf("@") + 1);
  return workspaceDomains.some((domain) => emailDomain === domain || emailDomain.endsWith(`.${domain}`));
};
const staff = value("STAFF_EMAILS").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
if (staff.length !== new Set(staff).size) failures.push("STAFF_EMAILS contains a duplicate address.");
for (const email of staff) {
  if (!/^\S+@\S+\.\S+$/.test(email)) failures.push(`STAFF_EMAILS contains invalid address ${email}.`);
  if (workspaceDomains.length && !inWorkspace(email)) {
    failures.push(`Staff address ${email} is outside GOOGLE_WORKSPACE_DOMAIN and will be rejected.`);
  }
}

async function readRange(token, spreadsheetId, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${range} returned ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text).values ?? [] : [];
}

async function checkLiveSheets() {
  if (failures.length) return;
  const auth = new GoogleAuth({
    credentials: {
      client_email: value("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
      private_key: value("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const token = await auth.getAccessToken();
  if (!token) throw new Error("Google did not return an access token.");
  for (const [range, expectedHeaders] of EXPECTED_HEADERS) {
    const spreadsheetId = range.startsWith("Enrollment")
      ? value("GOOGLE_IDENTITY_SPREADSHEET_ID")
      : value("GOOGLE_FEEDBACK_SPREADSHEET_ID");
    const rows = await readRange(token, spreadsheetId, range);
    if (JSON.stringify(rows[0] ?? []) !== JSON.stringify(expectedHeaders)) {
      failures.push(`${range} does not have the exact expected header row.`);
    }
  }
}

if (process.argv.includes("--live")) {
  try {
    await checkLiveSheets();
  } catch (error) {
    failures.push(`Live Google Sheets check failed: ${error instanceof Error ? error.message : error}`);
  }
}

for (const warning of warnings) console.warn(`WARNING: ${warning}`);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  console.error(`Launch readiness failed with ${failures.length} issue${failures.length === 1 ? "" : "s"}.`);
  process.exitCode = 1;
} else {
  console.log(`Launch readiness passed${process.argv.includes("--live") ? " including live Google Sheets access" : " (configuration only)"}.`);
}

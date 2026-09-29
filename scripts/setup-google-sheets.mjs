import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import nextEnv from "@next/env";
import { GoogleAuth } from "google-auth-library";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const IDENTITY_HEADERS = [
  "student_id", "enrollment_code_hash", "section", "pseudonym", "status",
  "max_attempts", "attempts_consumed", "active_submission_id", "created_at",
  "last_login_at",
];
const SUBMISSION_HEADERS = [
  "submission_id", "pseudonym", "request_key", "status", "stage",
  "attempt_number", "exam_id", "scope", "mode", "question_ref", "created_at",
  "updated_at", "prompt_version", "error_reference",
];
const CONTENT_HEADERS = ["submission_id", "content_type", "part", "text"];
const MATERIALS = [
  "amber", "brass", "bronze", "cedar", "copper", "crystal", "flint", "glass",
  "granite", "iron", "linen", "marble", "oak", "onyx", "paper", "pewter",
  "quartz", "silver", "slate", "willow",
];
const ANIMALS = [
  "badger", "bear", "beaver", "bison", "crane", "deer", "dolphin", "falcon",
  "fox", "hare", "heron", "horse", "lynx", "otter", "owl", "raven", "seal",
  "sparrow", "turtle", "wolf",
];

function fail(message) {
  console.error(`Setup failed: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) fail("The roster CSV ends inside a quoted field.");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((value) => value.trim()));
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function hashStudentEmail(value) {
  const secret = env("STUDENT_EMAIL_LOOKUP_SECRET");
  return createHmac("sha256", secret)
    .update(`civ-pro-feedback/student-email/v1\0${normalizeEmail(value)}`)
    .digest("hex");
}

function assignPseudonym(stableIdentity, used) {
  const capacity = MATERIALS.length * ANIMALS.length;
  const digest = createHash("sha256").update(stableIdentity).digest();
  const start = digest.readUInt32BE(0) % capacity;
  for (let offset = 0; offset < capacity; offset += 1) {
    const index = (start + offset) % capacity;
    const candidate = `${MATERIALS[Math.floor(index / ANIMALS.length)]}-${ANIMALS[index % ANIMALS.length]}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  fail("The 400-identifier pseudonym pool is exhausted.");
}

function buildEnrollment(csvRows) {
  if (!csvRows.length) fail("The roster CSV is empty.");
  const headers = csvRows[0].map((value) => value.trim().toLowerCase());
  const nameIndex = headers.indexOf("name");
  const sectionIndex = headers.indexOf("section");
  const emailIndex = headers.indexOf("email");
  const statusIndex = headers.indexOf("status");
  const attemptsIndex = headers.indexOf("max_attempts");
  if (nameIndex === -1 || sectionIndex === -1 || emailIndex === -1) {
    fail('The private roster CSV needs headers named "name", "section", and "email".');
  }
  const seen = new Set();
  const usedPseudonyms = new Set();
  const createdAt = new Date().toISOString();
  const rows = csvRows.slice(1).map((values, index) => {
    const name = (values[nameIndex] ?? "").trim();
    const section = (values[sectionIndex] ?? "").trim();
    const email = normalizeEmail(values[emailIndex] ?? "");
    if (!name || !section || !email) fail(`Row ${index + 2} is missing a name, section, or email.`);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(`Row ${index + 2} has an invalid email.`);
    const lookupHash = hashStudentEmail(email);
    if (seen.has(lookupHash)) fail(`The roster contains an email address more than once.`);
    seen.add(lookupHash);
    const status = (values[statusIndex] ?? "active").trim().toLowerCase() || "active";
    if (status !== "active" && status !== "disabled") {
      fail(`Row ${index + 2} has status ${status}; use active or disabled.`);
    }
    const maxAttempts = Number.parseInt((values[attemptsIndex] ?? "5").trim() || "5", 10);
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
      fail(`Row ${index + 2} has an invalid max_attempts value.`);
    }
    return [
      randomUUID(), lookupHash, section, assignPseudonym(`${section}\0${name}`, usedPseudonyms), status,
      maxAttempts, 0, "", createdAt, "",
    ];
  });
  if (!rows.length) fail("The roster CSV contains no student rows.");
  return rows;
}

function env(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is not configured.`);
  return value;
}

async function request(token, url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  const body = await response.text();
  if (!response.ok) fail(`Google Sheets returned ${response.status}: ${body.slice(0, 500)}`);
  return body ? JSON.parse(body) : {};
}

async function ensureTabs(token, spreadsheetId, names) {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  const metadata = await request(token, `${base}?fields=sheets.properties.title`);
  const existing = new Set((metadata.sheets ?? []).map((sheet) => sheet.properties?.title));
  const missing = names.filter((name) => !existing.has(name));
  if (!missing.length) return;
  await request(token, `${base}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: missing.map((title) => ({ addSheet: { properties: { title } } })) }),
  });
}

async function readRange(token, spreadsheetId, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
  return (await request(token, url)).values ?? [];
}

async function writeRange(token, spreadsheetId, range, values) {
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`);
  url.searchParams.set("valueInputOption", "RAW");
  await request(token, url.toString(), {
    method: "PUT",
    body: JSON.stringify({ range, majorDimension: "ROWS", values }),
  });
}

async function main() {
  const rosterFlagIndex = process.argv.indexOf("--roster");
  const rosterPath = rosterFlagIndex === -1
    ? process.argv.slice(2).find((argument) => !argument.startsWith("-"))
    : process.argv[rosterFlagIndex + 1];
  if (!rosterPath || rosterPath.startsWith("-")) {
    fail("Usage: npm run sheets:setup -- --roster path/to/private-roster.csv [--dry-run]");
  }
  const enrollment = buildEnrollment(parseCsv(await readFile(rosterPath, "utf8")));
  if (process.argv.includes("--dry-run")) {
    console.log(`Roster is valid: ${enrollment.length} students, ${new Set(enrollment.map((row) => row[3])).size} unique identifiers.`);
    return;
  }

  const identityId = env("GOOGLE_IDENTITY_SPREADSHEET_ID");
  const feedbackId = env("GOOGLE_FEEDBACK_SPREADSHEET_ID");
  if (identityId === feedbackId) {
    console.warn("Warning: production should use separate identity and feedback workbooks.");
  }
  const auth = new GoogleAuth({
    credentials: {
      client_email: env("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
      private_key: env("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const token = await auth.getAccessToken();
  if (!token) fail("Google did not return an access token.");

  await ensureTabs(token, identityId, ["Enrollment"]);
  await ensureTabs(token, feedbackId, ["Submissions", "Content"]);
  const populated = await Promise.all([
    readRange(token, identityId, "Enrollment!A1:J2"),
    readRange(token, feedbackId, "Submissions!A1:N2"),
    readRange(token, feedbackId, "Content!A1:D2"),
  ]);
  if (populated.some((rows) => rows.length > 0)) {
    fail("Setup refuses to overwrite a populated Enrollment, Submissions, or Content tab.");
  }
  await Promise.all([
    writeRange(token, identityId, "Enrollment!A1:J", [IDENTITY_HEADERS, ...enrollment]),
    writeRange(token, feedbackId, "Submissions!A1:N", [SUBMISSION_HEADERS]),
    writeRange(token, feedbackId, "Content!A1:D", [CONTENT_HEADERS]),
  ]);
  console.log(`Initialized Google Sheets for ${enrollment.length} students.`);
}

main().catch((error) => {
  if (!process.exitCode) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
});

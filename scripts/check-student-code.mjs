import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import nextEnv from "@next/env";
import { GoogleAuth } from "google-auth-library";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function fail(message) {
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
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((value) => value.trim()));
}

function flag(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? "" : process.argv[index + 1] ?? "";
}

function csvCell(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function createCode() {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = randomBytes(16);
  let body = "";
  for (const byte of bytes) body += alphabet[byte % alphabet.length];
  return `CIVP-${body.match(/.{1,4}/g).join("-")}`;
}

async function rotateTestCode(rosterPath, rows, test, codeIndex) {
  const newCode = createCode();
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const spreadsheetId = process.env.GOOGLE_IDENTITY_SPREADSHEET_ID;
  if (!serviceAccountEmail || !privateKey || !spreadsheetId) fail("Google Sheets credentials are not configured.");
  const auth = new GoogleAuth({
    credentials: { client_email: serviceAccountEmail, private_key: privateKey },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const token = await auth.getAccessToken();
  if (!token) fail("Google did not return an access token.");
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values`;
  const readResponse = await fetch(`${base}/${encodeURIComponent("Enrollment!A:J")}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const enrollment = await readResponse.json();
  if (!readResponse.ok) fail(`Could not read the identity workbook (${readResponse.status}).`);
  const matches = (enrollment.values ?? []).map((row, index) => ({ row, rowNumber: index + 1 }))
    .filter(({ row }) => row[2] === "Test");
  if (matches.length !== 1) fail("The identity workbook must contain exactly one Test account.");
  const hash = createHash("sha256").update(newCode.replace(/[^A-Z0-9]/g, "")).digest("hex");
  const range = `Enrollment!B${matches[0].rowNumber}`;
  const updateUrl = new URL(`${base}/${encodeURIComponent(range)}`);
  updateUrl.searchParams.set("valueInputOption", "RAW");
  const updateResponse = await fetch(updateUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ range, values: [[hash]] }),
  });
  if (!updateResponse.ok) fail(`Could not rotate the test code (${updateResponse.status}).`);
  test[codeIndex] = newCode;
  await writeFile(rosterPath, `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`, { mode: 0o600 });
  console.log("Rotated the designated test code in the private roster and identity workbook.");
  return newCode;
}

async function main() {
  const rosterPath = flag("--roster");
  if (!rosterPath) fail("Pass --roster with the private enrollment-code CSV path.");
  const rows = parseCsv(await readFile(rosterPath, "utf8"));
  const headers = rows[0].map((value) => value.trim().toLowerCase());
  const sectionIndex = headers.indexOf("section");
  const codeIndex = headers.indexOf("enrollment_code");
  const test = rows.slice(1).find((row) => row[sectionIndex] === "Test");
  if (!test?.[codeIndex]) fail("The private roster does not contain a Test account.");

  if (process.argv.includes("--rotate-test")) {
    await rotateTestCode(rosterPath, rows, test, codeIndex);
  }

  const normalized = test[codeIndex].trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const payload = {
    codeHash: createHash("sha256").update(normalized).digest("hex"),
    loginAt: new Date().toISOString(),
  };
  const unsigned = {
    timestamp: Date.now(),
    nonce: randomUUID(),
    action: "authenticate",
    payload,
  };
  const endpoint = process.env.GOOGLE_ATTEMPT_GATE_URL;
  const secret = process.env.GOOGLE_ATTEMPT_GATE_SECRET;
  if (!endpoint || !secret) fail("The attempt-gate URL and secret are not configured.");
  const canonical = `${unsigned.timestamp}.${unsigned.nonce}.${unsigned.action}.${JSON.stringify(unsigned.payload)}`;
  const signature = createHmac("sha256", secret).update(canonical).digest("base64url");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...unsigned, signature }),
    redirect: "follow",
  });
  const result = await response.json();
  if (!response.ok || !result.ok || !result.studentId || !result.pseudonym) {
    fail(result.error ?? `Attempt gate returned ${response.status}.`);
  }
  console.log(`Student-code authentication passed for the designated test account (${result.pseudonym}; ${result.remainingAttempts} attempts remaining).`);
  console.log("No feedback attempt was reserved or consumed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

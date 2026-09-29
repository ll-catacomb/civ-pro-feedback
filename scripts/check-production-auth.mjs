import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function fail(message) {
  throw new Error(message);
}

function flag(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
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

function responseCookies(response) {
  return response.headers.getSetCookie().map((value) => value.split(";", 1)[0]);
}

async function main() {
  const origin = new URL(flag("--origin", "https://civ-pro-feedback.vercel.app")).origin;
  const rosterPath = flag("--roster", ".data/fall-2026-enrollment-codes.csv");
  const rows = parseCsv(await readFile(rosterPath, "utf8"));
  const headers = rows[0].map((value) => value.trim().toLowerCase());
  const sectionIndex = headers.indexOf("section");
  const codeIndex = headers.indexOf("enrollment_code");
  const test = rows.slice(1).find((row) => row[sectionIndex] === "Test");
  const code = test?.[codeIndex];
  const authSecret = process.env.AUTH_SECRET;
  if (!code || !authSecret) fail("The diagnostic account or local AUTH_SECRET is missing.");

  const csrfResponse = await fetch(`${origin}/api/auth/csrf`);
  if (!csrfResponse.ok) fail(`Production CSRF endpoint returned ${csrfResponse.status}.`);
  const csrf = await csrfResponse.json();
  const initialCookies = responseCookies(csrfResponse);
  const proofBody = Buffer.from(JSON.stringify({
    subject: "production-gate-diagnostic",
    expiresAt: Date.now() + 10 * 60 * 1_000,
  })).toString("base64url");
  const googleIdentityProof = `${proofBody}.${createHmac("sha256", authSecret).update(proofBody).digest("base64url")}`;
  const form = new URLSearchParams({
    csrfToken: csrf.csrfToken,
    code,
    googleIdentityProof,
    callbackUrl: `${origin}/student`,
  });
  const callback = await fetch(`${origin}/api/auth/callback/student-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: initialCookies.join("; "),
    },
    body: form,
    redirect: "manual",
  });
  const location = callback.headers.get("location") ?? "";
  const signedIn = responseCookies(callback)
    .some((value) => value.startsWith("__Secure-authjs.session-token="));
  if (!signedIn || !location.startsWith(`${origin}/student`)) {
    fail(`Production diagnostic sign-in failed (${callback.status}). Check Vercel and Apps Script secrets.`);
  }
  console.log("Production authentication canary passed through Vercel, Auth.js, and Apps Script.");
  console.log("No feedback attempt was reserved and no model was called.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

# Google Sheets attempt gate

This Apps Script is the serialized write gate for student attempts. It uses a
script-wide `LockService` lock, signed requests, idempotency keys, and replay
protection so concurrent browser requests cannot both consume the fifth try.
Student codes reach this service only as SHA-256 hashes. The identity workbook
contains no student names, email addresses, or plaintext access codes.

## Deployment

1. Create a standalone Apps Script project owned by the course account.
2. Copy `Code.gs` and `appsscript.json` into the project.
3. In **Project Settings → Script Properties**, set:
   - `IDENTITY_SPREADSHEET_ID`
   - `FEEDBACK_SPREADSHEET_ID`
   - `API_SECRET` (a random value of at least 32 bytes)
4. Deploy as a web app that executes as the course owner. The endpoint may be
   reachable without an interactive Google login because every request is
   authenticated with a short-lived HMAC signature and single-use nonce.
5. Put the deployment URL in `GOOGLE_ATTEMPT_GATE_URL` and the same secret in
   `GOOGLE_ATTEMPT_GATE_SECRET` on the Next.js server.

Do not put the secret in this directory or commit it. A new Apps Script
deployment URL should be tested in the synthetic workbook before production.

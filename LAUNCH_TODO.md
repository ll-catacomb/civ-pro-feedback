# Student App Launch Checklist

Last updated: 2026-10-01

This file is the production handoff for the Civil Procedure feedback app. The
student application uses Google Sheets for permanent records and Vercel
Workflow for durable execution; it does not require Postgres.

Longer-term vendor requests and institutional follow-up are recorded in
[GOING_FORWARD.md](GOING_FORWARD.md).

## Engineering before launch

- [x] Remove the Quality Lab and Review Dossier pages from the student-facing app.
- [x] Disable the legacy unauthenticated practice endpoint in production.
- [x] Let students reopen completed and in-progress submissions from history.
- [x] Add a roster-to-Sheets setup command with duplicate and format checks.
- [x] Add a launch-readiness command for environment and live integration checks.
- [x] Update deployment documentation for Google Sheets, OAuth, Apps Script, and Vercel Workflow.
- [x] Upgrade security-sensitive dependencies and rerun audit, tests, and production build.
- [x] Replace direct Anthropic access with the HUIT AI Services Bedrock gateway,
      US inference-profile configuration, and a non-billable access/quota check.
- [x] Match Harvard Google OAuth directly to a keyed, one-way roster lookup;
      do not retain the verified email or require students to enter codes.
- [ ] Complete a live end-to-end smoke test with a synthetic or designated test account.
- [x] Add a root-level TA pilot script and incident-reporting checklist.
- [x] Return specific, recoverable messages for exhausted, disabled, and
      already-running accounts instead of treating them as generic server errors.
- [x] Preserve submission idempotency across ambiguous browser/network failures.
- [x] Add a non-consuming production authentication canary that detects Vercel,
      Auth.js, and Apps Script secret mismatches without invoking a model.
- [x] Fall back to schema-instruction plus Zod validation because the current
      HUIT proxy rejects Bedrock's native `output_config.format` field.
- [x] Skip the obsolete local JSON run/failure store on Vercel, where the
      application bundle is read-only and Google Sheets is authoritative.
- [x] Make signed attempt-gate requests compatible with Word-style Unicode
      punctuation while preserving the original UTF-8 answer payload.
- [x] Reject obvious accidental prompt pastes, incomplete fragments, and
      repeated placeholders before reserving an attempt or starting a workflow.
- [x] Keep internal bands, grounding diagnostics, and judge audits out of the
      student view; order improvements by priority within each question and
      attach the example revision to the improvement it demonstrates.
- [x] Retry transient non-JSON Apps Script success responses with the original
      idempotency key and refund any reservation whose response remains ambiguous.
- [x] Treat progress reporting as best-effort so an Apps Script display-update
      failure cannot abort or refund an otherwise healthy feedback workflow.
- [x] Bound HUIT calls to five minutes and fall back from Opus to Sonnet on the
      single controlled retry, keeping evaluation inside Vercel's step lifetime.
- [x] Use student-facing "bullet-point version" language, replace "pay for" with
      "make room for," and add copy plus print/PDF feedback actions.
- [x] Turn student-facing course citations into links to the exact retrieved
      excerpt and label opaque casebook titles such as "Day 9" by material type.
- [x] Extend transient Apps Script retries through the Google OAuth callback so
      a cold or propagating gate is less likely to require manual page reloads.
- [x] Add the 2024 final and its instructor model answer as a practicable exam.
- [x] Add both 2025 finals as separate choices, pairing the administered 8-hour
      exam and the shortened 3.5-hour exam with their corresponding model answers.
- [x] Show the student's full submitted response beside completed feedback and
      anchor new improvement cards with a short exact excerpt from that response.
- [x] Keep past student model answers out of course-source retrieval; identify
      any exemplars embedded in older saved runs as writing examples, not authority.
- [x] Hide the practice-form word counter because Exam4 uses a different counting
      method; internal intake and submission validation remain unchanged.
- [ ] Decide the public name. Professor Greiner proposed “Madeleine”; keep the
      current neutral “Civil Procedure Practice” label until Madeleine approves.

Automated verification completed through 2026-10-01:

- `npm run check`: clean lint and typecheck; 197 tests passing.
- `npm run build`: successful Next.js 16.3.6 production build; Workflow reports
  16 durable steps and one workflow.
- `npm audit`: zero known dependency vulnerabilities, including development tooling.
- roster preparation and dry run: 83 students in each section, 166 unique
  students and 166 unique emails, plus one separate diagnostic account.
- Apps Script syntax check: passed.
- `npm run huit:check`: HUIT authentication passed. US Sonnet 5 and US Opus 5.5
  are available. On 2026-09-26 the gateway reported a 10,000 USD monthly limit
  with 9,999.99997 USD remaining; no model was invoked.
- The two test workbooks are initialized with exact headers and 174 anonymous
  identity records: 166 students, 7 TAs, and 1 diagnostic account. Apps Script
  Version 2 is deployed at the existing URL.
- Live code authentication and the browser sign-in flow passed for the separate
  `quartz-owl` test account with five attempts remaining. Invalid-code handling
  also passed. The temporary test code was rotated after the check.
- The roster migration matched 173 accounts (166 students and 7 TAs), left the
  separate diagnostic row unchanged, and passed a non-consuming email-lookup
  authentication check. No model was invoked.
- On 2026-09-28, two pilot submissions exposed a Vercel/Apps Script gate-secret
  mismatch. Both failed before reservation, so no attempts were used. The
  protected Vercel secrets were resynchronized, the app was redeployed, and a
  production Auth.js-to-Apps-Script diagnostic passed without reserving an
  attempt or calling a model.
- On 2026-09-29, Apps Script completed one reservation but returned a non-JSON
  HTTP 200 response to Vercel, leaving the anonymous submission queued without
  a workflow. The reservation was explicitly refunded (five attempts remain).
  The gate client now retries transient malformed success responses using the
  original request key and refunds any reservation whose outcome stays ambiguous.
- Later that morning, the same pilot account reached source retrieval but an
  Apps Script progress update returned a transient non-JSON 404. The progress
  write incorrectly aborted the workflow; the run was refunded automatically.
  Progress updates are now non-fatal, and transient Apps Script 404s are retried.
- A later full-exam retry reached independent evaluation, but three Vercel step
  executions were each terminated while waiting on the evaluator; the run was
  refunded. Provider calls are now capped at five minutes, retry only once, and
  use Sonnet as the fallback for Opus-backed evaluation and final review.

## Google test environment (set up 2026-09-25)

These resources are for testing and are owned by madeleine_woods@g.harvard.edu.
Harvard does not allow creating projects at the harvard.edu org root, so the
project lives in the `self-paid` folder (no billing is needed). Before launch,
request a course-owned project from HUIT and recreate these resources there.

- Cloud project `civpro-feedback-test`; Google Sheets API enabled.
- Service account `civpro-sheets@civpro-feedback-test.iam.gserviceaccount.com`
  with no project roles. JSON key at `.data/google-service-account.json`
  (gitignored, mode 600).
- OAuth consent screen "Civil Procedure Feedback", audience **Internal**
  (harvard.edu Google organization only) for student access. Web client
  "civpro-feedback web (test)" with local and production redirects, including
  `https://civ-pro-feedback.vercel.app/api/auth/callback/google`. Backup JSON at
  `.data/google-oauth-client.json`.
- Workbooks in the owner's Drive, shared with the service account only:
  "CivPro Feedback – IDENTITY (test, private)" and
  "CivPro Feedback – FEEDBACK (test)". They now contain the initialized
  `Enrollment`, `Submissions`, and `Content` tabs. Enrollment holds opaque keyed
  lookup hashes, not names or emails.
- Apps Script "CivPro Feedback attempt gate (test)", deployed as a web app
  (execute as owner, access: Anyone; requests are HMAC-authenticated). Script
  Properties are set; the gate secret is also in `.data/gate-secret.txt`. If
  `google-apps-script/Code.gs` changes, redeploy it in Apps Script.
- Harvard shows an "external to Google Apps for Harvard" warning when sharing
  with service accounts. This is expected; choose "Share anyway".

## Credentials and decisions needed from the course team

- [x] Choose the production Vercel project and URL:
      `https://civ-pro-feedback.vercel.app/`.
- [ ] Obtain Harvard confirmation that the selected Vercel project, Workflow
      execution/log retention, and configuration are approved for the data
      classification of student exam responses. HUIT's Level 3 approval covers
      the AI gateway, not automatically the rest of the application stack.
- [x] Receive approval for the HUIT AI Services Bedrock API key.
- [ ] Add the HUIT billing ID and an explicit course spending cap to the API
      Portal app registration.
- [x] Confirm the selected `us.anthropic.*` inference profile IDs are available
      through `/v2/inference-profiles` once the key is active.
- [ ] Request a course-owned Google Cloud project from HUIT (the test project
      is personal, in the `self-paid` folder), then recreate the resources below
      in it.
- [x] Create a Google Cloud web OAuth client and add both the localhost and
      `https://civ-pro-feedback.vercel.app/api/auth/callback/google` redirects.
- [x] Provide `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and a generated `AUTH_SECRET`
      (test values in `.env.local`).
- [x] Configure the Google Workspace domains admitted for student verification
      as `law.harvard.edu,g.harvard.edu` (including their subdomains).
- [x] Create a Google Sheets service account, enable the Sheets API, and provide
      its email/private key (test project).
- [x] Create the private identity workbook and private feedback workbook; share
      both with the service account (test workbooks; access verified via API).
- [x] Deploy the Apps Script attempt gate and provide its deployment URL and
      shared secret (test deployment).
- [ ] Before student launch, rotate the Apps Script gate secret in both Script
      Properties and Vercel; an earlier Vercel Config version was readable.
- [x] Prepare both fall section rosters: 83 students each, with no duplicates or
      overlap. The private roster is in `.data/fall-2026-enrollment-codes.csv`.
- [x] Obtain student emails, populate only the private roster's `email` column,
      and create the local, gitignored mail-merge CSV. Do not upload that mapping.
- [x] Confirm the existing Apps Script gate accepts the new opaque lookup hashes;
      no Apps Script redeploy is required.
- [ ] Decide who may access the identity workbook versus the feedback workbook.
- [ ] Confirm the student disclosure, support contact, and record-retention date
      with the institution's privacy/IT guidance.

## Production environment variables

Checked items have values. The Google values in `.env.local` and Vercel point
to the test resources above.

- [x] `HUIT_BEDROCK_API_KEY`
- [x] `HUIT_BEDROCK_BASE_URL`
- [x] `HUIT_BEDROCK_FAST_MODEL`
- [x] `HUIT_BEDROCK_WORK_MODEL`
- [x] `HUIT_BEDROCK_EVALUATOR_MODEL`
- [x] `HUIT_BEDROCK_JUDGE_MODEL`
- [x] `GOOGLE_SERVICE_ACCOUNT_EMAIL` (test)
- [x] `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (test)
- [x] `GOOGLE_IDENTITY_SPREADSHEET_ID` (test)
- [x] `GOOGLE_FEEDBACK_SPREADSHEET_ID` (test)
- [x] `GOOGLE_ATTEMPT_GATE_URL` (test)
- [x] `GOOGLE_ATTEMPT_GATE_SECRET` (test)
- [x] `STUDENT_EMAIL_LOOKUP_SECRET` (test; separate from all other secrets)
- [x] `AUTH_SECRET` (test; generate a new one for production)
- [x] `AUTH_GOOGLE_ID` (test)
- [x] `AUTH_GOOGLE_SECRET` (test)
- [x] `GOOGLE_WORKSPACE_DOMAIN` = `law.harvard.edu,g.harvard.edu`
- [x] Set `STUDENT_DEMO_MODE=false`.

## Live acceptance test

- [x] A rostered Harvard Google account signs in and receives its expected pseudonym.
- [ ] An unlisted Harvard Google account is rejected without revealing roster state.
- [ ] Double-clicking submit creates only one reservation and one workflow.
- [x] A student can close the tab, return through history, and see live progress.
- [x] Completed feedback reopens from history after a new login.
- [x] A failed workflow is refunded and shows a support reference.
- [ ] The fifth attempt succeeds and a sixth is rejected.
- [x] The identity workbook contains keyed lookup hashes and account state but
      no names, student emails, plaintext codes, or student answers.
- [ ] The feedback workbook contains pseudonyms, answers, status, and feedback
      but no student emails.
- [ ] Legacy production endpoints cannot trigger model calls.
- [x] Vercel shows the split workflow steps and a complete production run.
- [ ] The first structured-output run completes within the configured Vercel
      step duration, including Bedrock's cold schema-compilation time.
- [ ] The Sonnet 5 / Opus 5.5 evaluator smoke sweep and full calibration
      benchmark meet the agreed band-accuracy threshold before student launch.

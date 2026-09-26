# Student App Launch Checklist

Last updated: 2026-09-26

This file is the production handoff for the Civil Procedure feedback app. The
student application uses Google Sheets for permanent records and Vercel
Workflow for durable execution; it does not require Postgres.

## Engineering before launch

- [x] Protect staff pages, calibration actions, run data, reviews, and exports.
- [x] Disable the legacy unauthenticated practice endpoint in production.
- [x] Let students reopen completed and in-progress submissions from history.
- [x] Add a roster-to-Sheets setup command with duplicate and format checks.
- [x] Add a launch-readiness command for environment and live integration checks.
- [x] Update deployment documentation for Google Sheets, OAuth, Apps Script, and Vercel Workflow.
- [x] Upgrade security-sensitive dependencies and rerun audit, tests, and production build.
- [x] Replace direct Anthropic access with the HUIT AI Services Bedrock gateway,
      US inference-profile configuration, and a non-billable access/quota check.
- [x] Accept multiple Google Workspace domains, including subdomains, so HLS
      class-year student addresses (`jd27.law.harvard.edu`) and staff
      `g.harvard.edu` accounts can both sign in (`src/lib/workspace-domains.ts`).
- [ ] Complete a live end-to-end smoke test with a synthetic or designated test account.

Automated verification completed on 2026-09-26:

- `npm run check`: clean lint and typecheck; 165 tests passing.
- `npm run build`: successful Next.js 16.3.6 production build; Workflow reports
  16 durable steps and one workflow.
- `npm audit`: zero known dependency vulnerabilities, including development tooling.
- roster dry run: two synthetic rows and two unique identifiers validated.
- Apps Script syntax check: passed.
- `npm run huit:check`: HUIT authentication passed. US Sonnet 5 and US Opus 5.5
  are available. On 2026-09-26 the gateway reported a 10,000 USD monthly limit
  with 9,999.99997 USD remaining; no model was invoked.
- `npm run launch:check`: with the test Google resources below in `.env.local`,
  the only remaining failure is `STAFF_EMAILS`. The `-- --live` check also needs
  the workbooks initialized with `npm run sheets:setup` and a roster. A live
  read-only check authenticated successfully with the service account and
  reached the identity workbook, then stopped because the `Enrollment` tab does
  not exist yet, as expected for the still-empty test workbooks.

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
  (harvard.edu Google organization only). Web client
  "civpro-feedback web (test)" with the redirect
  `http://localhost:3000/api/auth/callback/google` only. Backup JSON at
  `.data/google-oauth-client.json`.
- Workbooks in the owner's Drive, shared with the service account only:
  "CivPro Feedback – IDENTITY (test, private)" and
  "CivPro Feedback – FEEDBACK (test)". Both still contain only an empty `Sheet1`.
- Apps Script "CivPro Feedback attempt gate (test)", deployed as a web app
  (execute as owner, access: Anyone; requests are HMAC-authenticated). Script
  Properties are set; the gate secret is also in `.data/gate-secret.txt`. If
  `google-apps-script/Code.gs` changes, redeploy it in Apps Script.
- Harvard shows an "external to Google Apps for Harvard" warning when sharing
  with service accounts. This is expected; choose "Share anyway".
- HLS faculty do not get Harvard Gmail. Staff must sign in with a Harvard Google
  account (usually `g.harvard.edu`), and `STAFF_EMAILS` must list that address,
  not their Microsoft email.

## Credentials and decisions needed from the course team

- [ ] Choose the production Vercel project, owner, plan, and final URL.
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
- [x] Create a Google Cloud web OAuth client (test project; localhost redirect).
- [ ] Add `https://YOUR-DOMAIN/api/auth/callback/google` to the OAuth client
      once the Vercel URL is chosen.
- [x] Provide `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and a generated `AUTH_SECRET`
      (test values in `.env.local`).
- [x] Confirm the Google Workspace domain used for student accounts: HLS students
      use class-year subdomains (`jdNN.law.harvard.edu`); configured as
      `law.harvard.edu,g.harvard.edu`.
- [ ] Verify with a real HLS student account that sign-in succeeds (the Internal
      consent screen and domain check have not yet been exercised by a
      `law.harvard.edu` account).
- [x] Create a Google Sheets service account, enable the Sheets API, and provide
      its email/private key (test project).
- [x] Create the private identity workbook and private feedback workbook; share
      both with the service account (test workbooks; access verified via API).
- [x] Deploy the Apps Script attempt gate and provide its deployment URL and
      shared secret (test deployment).
- [ ] Provide the final roster as CSV or Google Sheet with one institutional
      email per active student, then run `npm run sheets:setup`. The setup
      refuses to overwrite a populated workbook, so use a test roster only on
      throwaway workbooks.
- [ ] Provide the staff email allowlist for professors and TAs, using the Harvard
      Google address each person signs in with.
- [ ] Decide who may access the identity workbook versus the feedback workbook.
- [ ] Confirm the student disclosure, support contact, and record-retention date
      with the institution's privacy/IT guidance.

## Production environment variables

Checked items have values. The Google values currently in `.env.local` point to
the test resources above; none have been added to Vercel yet.

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
- [x] `AUTH_SECRET` (test; generate a new one for production)
- [x] `AUTH_GOOGLE_ID` (test)
- [x] `AUTH_GOOGLE_SECRET` (test)
- [x] `GOOGLE_WORKSPACE_DOMAIN` = `law.harvard.edu,g.harvard.edu`
- [ ] `STAFF_EMAILS`
- [x] Set `STUDENT_DEMO_MODE=false`.

## Live acceptance test

- [ ] A rostered student can sign in and receives the expected pseudonym.
- [ ] A non-roster account and wrong-domain account are rejected.
- [ ] Double-clicking submit creates only one reservation and one workflow.
- [ ] A student can close the tab, return through history, and see live progress.
- [ ] Completed feedback reopens from history after a new login.
- [ ] A failed workflow is refunded and shows a support reference.
- [ ] The fifth attempt succeeds and a sixth is rejected.
- [ ] The identity workbook contains the email mapping but no student answers.
- [ ] The feedback workbook contains pseudonyms, answers, status, and feedback
      but no student emails.
- [ ] Staff routes work for allowlisted staff and reject student sessions.
- [ ] Legacy production endpoints cannot trigger model calls.
- [ ] Vercel shows the split workflow steps and a complete production run.
- [ ] The first structured-output run completes within the configured Vercel
      step duration, including Bedrock's cold schema-compilation time.
- [ ] The Sonnet 5 / Opus 5.5 evaluator smoke sweep and full calibration
      benchmark meet the agreed band-accuracy threshold before student launch.

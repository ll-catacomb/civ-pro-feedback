# Deploying the student app to Vercel

The production design uses Vercel, Vercel Workflow, Harvard Google verification,
private student access codes, two Google
Sheets workbooks, one Apps Script write gate, and Claude through HUIT AI
Services/AWS Bedrock. It does not require Postgres or a long-lived server.

HUIT documents its Bedrock gateway as approved for Level 3 confidential data.
That approval does not automatically cover Vercel, Workflow execution logs, or
the Google configuration. Confirm the complete hosting path with Harvard
Privacy/Security before accepting student responses at that classification.

## 1. Create the Google resources

1. Create an identity workbook and a feedback workbook in a course-owned Google
   Drive. Keep them private.
2. In Google Cloud, enable the Google Sheets API and create a service account.
   Share both workbooks with its email as an editor.
3. Create a Web OAuth client for student access. Add local callback
   `http://localhost:3000/api/auth/callback/google` while testing and production
   callback `https://YOUR-DOMAIN/api/auth/callback/google` before launch.
4. Deploy `google-apps-script/Code.gs` as a web app owned by the course account.
   Follow `google-apps-script/README.md` and use a random gate secret of at least
   32 bytes.

Do not give ordinary staff access to the identity workbook unless they need to
resolve student identities. The feedback workbook contains pseudonyms rather
than email addresses.

## 2. Initialize the workbooks

Prepare the private code-delivery roster, validate it, then initialize the empty
sheets. The delivery roster remains local and gitignored:

```bash
npm run roster:prepare -- --section "Section 2=/path/to/section-2.csv" --section "Section 3=/path/to/section-3.csv" --output .data/enrollment-codes.csv
npm run sheets:setup -- --roster .data/enrollment-codes.csv --dry-run
npm run sheets:setup -- --roster .data/enrollment-codes.csv
```

The generated delivery roster contains `name`, `section`, a blank `email` field
for later mail merge, `enrollment_code`, `status`, and `max_attempts`. The setup
command rejects duplicates, generates unique material-animal identifiers, hashes
codes before upload, and will not overwrite a populated workbook. No student
name, email address, or plaintext code is uploaded.

## 3. Configure Vercel

Import the repository into Vercel and select Node 22. Set every required value
listed in `.env.example` for the Production environment:

- `HUIT_BEDROCK_API_KEY`
- `HUIT_BEDROCK_BASE_URL`
- `HUIT_BEDROCK_FAST_MODEL`
- `HUIT_BEDROCK_WORK_MODEL`
- `HUIT_BEDROCK_EVALUATOR_MODEL`
- `HUIT_BEDROCK_JUDGE_MODEL`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_IDENTITY_SPREADSHEET_ID`
- `GOOGLE_FEEDBACK_SPREADSHEET_ID`
- `GOOGLE_ATTEMPT_GATE_URL`
- `GOOGLE_ATTEMPT_GATE_SECRET`
- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `GOOGLE_WORKSPACE_DOMAIN`
- `STUDENT_DEMO_MODE=false`

Use a generated high-entropy value for `AUTH_SECRET`. Preserve newlines in the
service-account private key; the app also accepts the common escaped `\\n`
environment-variable form.

Use the HUIT API Portal **key**, not the separately issued app secret. Keep the
default HUIT gateway URL and a `us.anthropic.*` inference profile unless Harvard
approves another processing geography. Before deployment, add a spending cap to
the Portal app registration and run `npm run huit:check`; it validates access,
model availability, and quota without invoking a billable model.

`GOOGLE_WORKSPACE_DOMAIN` is a comma-separated list of email domains admitted
for student Google sign-in; each entry also admits its subdomains. Students
then enter their private course code. The verified email is checked during the
OAuth callback but is not retained in the session or Google Sheets.

## 4. Validate before deploying

With production-equivalent values in `.env.local`, run:

```bash
npm run launch:check -- --live
npm run huit:check
npm run student-code:check -- --roster .data/enrollment-codes.csv
npm run check
npm run build
```

The live check confirms both workbooks are distinct, reachable by the service
account, and have exactly the headers expected by the application.

Push the verified commit and deploy it. Vercel installs the Workflow integration
during the Next.js build and exposes the generated `.well-known/workflow`
handlers. A student submission returns immediately after the attempt reservation
and durable workflow start; the multi-stage model chain does not run inside that
single request.

## 5. Production smoke test

Use the separately generated test code and a Harvard Google test account.
Verify OAuth rejection, code rejection, attempt reservation, visible stage progress, closing
and reopening the submission, completed feedback, and the
identity/feedback separation in Sheets. Then test the fifth-attempt boundary on
a disposable synthetic account or temporarily low-limit test row.

Record the results in [LAUNCH_TODO.md](LAUNCH_TODO.md). A failed workflow should
clear the active reservation, preserve a support reference, and not consume an
attempt.

## Operational notes

- Vercel Workflow provides durable step execution; Google Sheets remains the
  system of record for student-facing status and feedback.
- The Apps Script lock makes attempt reservation atomic and idempotency keys
  protect against double-click submission.
- The legacy direct feedback route returns 404 in production.
- Rotate an exposed credential immediately and update both Apps Script and
  Vercel when rotating the gate secret.
- Establish a course-owned retention date and delete Sheets records according
  to institutional policy after exports or review are complete.

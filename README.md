# CivPro Practice

A course-grounded Civil Procedure practice app. Enrolled students sign in with
private course access codes, submit a draft or bullet-point outline, and receive evidence-grounded
feedback from a durable, multi-step Claude workflow served through HUIT AI
Services and AWS Bedrock.

The production application is designed for Vercel and Google Sheets. It does
not require Postgres.

## What is included

- Harvard Google verification followed by a hashed, roster-issued student access code
- stable material-animal student identifiers, such as `golden-horse`
- a hard, concurrency-safe five-attempt limit per student
- separate private identity and feedback workbooks
- durable Vercel Workflow execution, split so no request remains open for the
  full feedback chain
- a student progress view that explains each stage and can be reopened later
- 451 cleaned course-context files, official practice exams, model answers, and
  anonymized calibration responses

See [Architecture](docs/ARCHITECTURE.md), [HUIT Bedrock integration](docs/HUIT_BEDROCK.md),
[QA protocol](docs/QA.md), and the [launch checklist](LAUNCH_TODO.md).

## Local setup

Use Node 22.13 or newer. The version is pinned in `.node-version`.

```bash
npm install
cp .env.example .env.local
npm run dev
```

For interface work without credentials, set `STUDENT_DEMO_MODE=true`. The
synthetic portal is available at `http://localhost:3000/student`; it does not
call Google Sheets or create real submissions. Production refuses demo mode.

Once authentication and Sheets are configured, students use `/student`. The
root URL redirects there. The older `/practice` endpoint is available only in
local development and is disabled in production.

## Prepare Google Sheets

Prepare one-column class-list exports locally. This command strips the seating
codes, generates high-entropy student access codes, and writes a private,
gitignored delivery roster with a blank email column for later mail merge:

```bash
npm run roster:prepare -- \
  --section "Section 2=/path/to/section-2.csv" \
  --section "Section 3=/path/to/section-3.csv" \
  --output .data/enrollment-codes.csv
```

The private output contains names and plaintext codes and must not be committed.
Only one-way code hashes, sections, pseudonyms, and attempt state are uploaded.
Validate the private roster without making external changes:

```bash
npm run sheets:setup -- --roster .data/enrollment-codes.csv --dry-run
```

After adding the Google service-account and spreadsheet variables to
`.env.local`, initialize empty workbooks with:

```bash
npm run sheets:setup -- --roster .data/enrollment-codes.csv
```

The command creates the expected tabs and headers, assigns unique identifiers,
and refuses to overwrite populated tabs. Production should use two workbooks:
the identity workbook holds code hashes and account state, while the feedback
workbook holds pseudonymous submissions and generated content. Neither workbook
needs student names or email addresses.

The serialized attempt gate lives in `google-apps-script/`; its README explains
deployment and Script Properties.

## Configure HUIT Bedrock

The app uses the Harvard API Gateway rather than a direct Anthropic key. Add the
API **key** from the Harvard API Portal—not the separately issued app secret—to
`HUIT_BEDROCK_API_KEY`. The key is sent server-side only in the `x-api-key`
header. Defaults use US cross-region profiles so inference stays within US AWS
regions: Sonnet 5 for supporting stages and Opus 5.5 for blind evaluation and
skeptical judging.

After approval, verify the key, selected inference profiles, and remaining
budget without making a billable model call:

```bash
npm run huit:check
```

The API Portal app registration should include the HUIT billing ID and an
explicit course spending cap. A real feedback-chain smoke test is still required
after this non-billable check.

## Verification

```bash
npm run check
npm run build
npm run huit:check
npm run launch:check
npm run launch:check -- --live
npm run student-code:check -- --roster .data/enrollment-codes.csv
```

The non-live launch check validates configuration shape. `--live` also verifies
service-account access and exact Google Sheets headers. Automated tests do not
make paid model calls; use a designated test account for the final end-to-end
check.

## Deployment

Deploy to Vercel with Node 22 and copy the production variables from
`.env.example`. Vercel Workflow persists and resumes each model stage, so the
browser request only reserves an attempt and starts the workflow. Students poll
the stored submission state and may close and reopen the page safely.

Complete instructions are in [DEPLOY.md](DEPLOY.md). The exact course-owned
credentials and final acceptance checks still needed are tracked in
[LAUNCH_TODO.md](LAUNCH_TODO.md).

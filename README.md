# CivPro Practice

A course-grounded Civil Procedure practice app. Enrolled students sign in with
Google, submit a draft or bullet-point outline, and receive evidence-grounded
feedback from a durable, multi-step Claude workflow served through HUIT AI
Services and AWS Bedrock. Professors and TAs have a
separate allowlisted QA area for blind calibration, run review, and exports.

The production application is designed for Vercel and Google Sheets. It does
not require Postgres.

## What is included

- Google OAuth with roster-only student access and an explicit staff allowlist
- stable material-animal student identifiers, such as `golden-horse`
- a hard, concurrency-safe five-attempt limit per student
- separate private identity and feedback workbooks
- durable Vercel Workflow execution, split so no request remains open for the
  full feedback chain
- a student progress view that explains each stage and can be reopened later
- 451 cleaned course-context files, official practice exams, model answers, and
  anonymized calibration responses
- staff-only calibration, audit, JSON, and CSV tools

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

Once OAuth and Sheets are configured, students use `/student`, while staff use
`/staff/sign-in` and then `/`. The older `/practice` endpoint is available only
in local development and is disabled in production.

## Prepare Google Sheets

Copy `scripts/roster-template.csv` and replace its synthetic rows. The required
column is `email`; `status` and `max_attempts` are optional. Validate it without
making external changes:

```bash
npm run sheets:setup -- --roster path/to/roster.csv --dry-run
```

After adding the Google service-account and spreadsheet variables to
`.env.local`, initialize empty workbooks with:

```bash
npm run sheets:setup -- --roster path/to/roster.csv
```

The command creates the expected tabs and headers, assigns unique identifiers,
and refuses to overwrite populated tabs. Production should use two workbooks:
the identity workbook holds email mappings, while the feedback workbook holds
pseudonymous submissions and generated content.

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

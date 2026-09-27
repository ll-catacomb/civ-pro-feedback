# Architecture

## Production request flow

```text
private course access code
  <- short-lived proof from verified Harvard Google OAuth
  -> hash and roster authentication under Apps Script lock
  -> signed Auth.js student session containing only the pseudonymous course identity

student submission
  -> validate session and input
  -> Apps Script atomically reserves one attempt + stores answer in Sheets
  -> start durable Vercel Workflow; return HTTP 202
  -> browser polls submission status and may safely close/reopen

Vercel Workflow
  -> responsiveness assessment
  -> independent responsiveness judgment
  -> issue map
  -> retrieval query expansion
  -> lexical course-corpus retrieval
  -> evidence reranking
  -> blind evaluation against calibration anchors
  -> coaching draft
  -> skeptical final judge
  -> store final feedback; atomically consume attempt

on workflow failure
  -> store support reference
  -> refund reservation; do not consume attempt
```

The workflow is divided into durable stages, with model calls isolated rather
than held inside one long HTTP request. This is the reason the production app can
run on Vercel despite a complete feedback chain taking much longer than a normal
serverless request. The status page explains the six student-facing phases while
the internal workflow retains finer-grained checkpoints for recovery and QA.

## Identity and authorization

Each student receives a random, high-entropy access code through a private course
channel. The Next.js server normalizes and hashes the submitted code before the
signed Apps Script gate matches it to an active Enrollment row. The signed
session contains only the internal student ID and pseudonym. Student names,
plaintext codes, and email addresses are not uploaded to either workbook.

Google OAuth verifies that the person has an account in a configured Harvard
Workspace domain. The verified email is used only during the OAuth callback and
is not retained. A short-lived signed handoff permits the subsequent course-code
check; the code endpoint rejects direct calls without that proof. The
unauthenticated legacy practice route is disabled in production.

## Attempt integrity

Apps Script is the single serialized writer for authentication, reservations,
progress, completion, and refunds. A script-wide `LockService` lock prevents two
requests from both claiming the last attempt. Calls from Next.js have a
short-lived HMAC signature, timestamp, and single-use nonce. Submission request
keys make double-clicks idempotent, and each student may have only one active
reservation.

By default a student receives five attempts. An attempt becomes consumed only
after final feedback is stored successfully. Queueing and workflow failures
refund the reservation.

## Feedback chain and corpus

The responsiveness gate is conservative: two model passes must independently
identify a clearly different exam before substantive grading stops. Responsive
answers proceed through issue mapping, query expansion, retrieval and reranking,
blind evaluation, coaching, and a skeptical final review. Every model stage uses
Claude's native Bedrock Messages request format through the HUIT API Gateway,
with adaptive thinking and JSON-schema output validated again by Zod.

Banding occurs in the blind evaluation against instructor-graded reference
answers. References calibrate quality but are forbidden as doctrinal authority,
and a calibration answer never sees its own grade. Internal feedback-QA scores
are not presented as official student grades.

The course corpus lives under `content/course/`. Retrieval builds a weighted
BM25 pool in memory from issue-map, expansion, and student-answer terms, then a
model reranker selects the evidence packet. There is no vector database or
persisted index.

## Storage

Production uses two private Google workbooks:

- **Identity workbook / `Enrollment`:** enrollment-code hash, section, internal
  student ID, pseudonym, account status, attempt limit and counts,
  active reservation, and login timestamps.
- **Feedback workbook / `Submissions` and `Content`:** pseudonym, submission and
  idempotency IDs, progress, attempt number, exam metadata, prompt version,
  student-answer chunks, workflow artifacts, final feedback, and error details.

The private local delivery roster is the only file that maps names to plaintext
codes; its blank email column can be populated later for mail merge. The workbook
split keeps authentication records out of routine feedback QA. Vercel Workflow also retains execution state and logs
needed to resume steps; it is not the student record of authority.

The local JSON run store remains for historical calibration and staff QA data.
It is not used to enforce production student attempts. Committed snapshots allow
read-only historical reporting when no local run store exists.

## Privacy boundary

- API, OAuth, service-account, and gate secrets remain server-side.
- HUIT's API Gateway and AWS Bedrock receive the exam response and contextual
  material needed to generate feedback. The configured US cross-region profile
  keeps inference processing in US AWS regions.
- Google stores enrollment, submissions, progress, and results in the two
  course-owned workbooks.
- Vercel executes and logs the durable workflow; operational logs should avoid
  plaintext access codes, student identity, and raw-answer logging.
- Historical calibration documents have student identifiers and exam-system
  metadata removed.

This is a formative-learning tool, not an official grading system. Access,
retention, student disclosure, and incident handling should follow institutional
privacy guidance.

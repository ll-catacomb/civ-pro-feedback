# CivPro Practice

A Next.js application for course-grounded Civil Procedure exam practice. Students paste a response to the 2014, 2015, or 2019 final and receive personalized feedback after a structured prompt chain. A two-pass intake gate first verifies that the response answers the selected exam; a clearly different-exam response receives zero credit and substantive grading stops. Instructors can run historical answers blind, compare predicted and actual bands, inspect the complete audit trail, rate feedback quality, and export results for Airtable.

## Included

- 451 cleaned course-context Markdown files imported from `civil-procedure-materials`
- the official 2014, 2015, and 2019 exams and instructor model answers
- eight valid anonymized DS/H/P/LP calibration responses
- the supplied file named `2015 Exam Answer (P 3)` correctly matched to its actual 2014 Diggle/Parkinson and LupinBank/Clearwater exam
- student submission and evidence-grounded feedback UI
- blind calibration dashboard as the homepage; student practice at `/practice`
- one-click batch calibration with three bounded parallel chains and independent per-fixture persistence
- independent blind band calibration after the skeptical judge, followed by automatic post-hoc comparison against the actual grade and any real grader comments
- local run persistence, complete JSON archive export, and Airtable-ready CSV export
- prompt/model/version/token/timing traces for repeatable QA

See [Architecture](docs/ARCHITECTURE.md) and [QA protocol](docs/QA.md) for the design and evaluation procedure.

## Setup

This project expects Node 20.19 or newer for the full Next.js toolchain.

```bash
npm install
cp .env.example .env.local
```

Add your Anthropic API key to `.env.local` — it is the only key the project needs — then run:

```bash
npm run dev
```

There is no index to build. Course retrieval reads `content/course` directly at startup, so changed course materials take effect on the next restart.

Open `http://localhost:3000` for the Feedback Quality Lab and `http://localhost:3000/practice` for the secondary student experience. `/qa` redirects to the homepage.

The entire project runs on a single Anthropic API key (`claude-opus-5` by default; override with `ANTHROPIC_WORK_MODEL` / `ANTHROPIC_JUDGE_MODEL`). Every stage opts into a server-side refusal fallback, so a safety-classifier false positive is re-run on Anthropic's recommended substitute instead of failing the run; each stage trace records the model that actually answered. The blind evaluation owns the band recommendation and bands comparatively against instructor-graded reference answers (leave-one-out, so a run never sees its own grade). v4.0.0 collapsed the earlier dual OpenAI+Claude pipeline after calibration showed the cross-model judging layer did not improve band accuracy; v4.2.0 removed the last OpenAI call by replacing embedding-based retrieval with a Claude query-expansion stage. Pre-v4 dual runs remain readable in the QA lab and exports. Course retrieval now expands the issue map into the doctrine vocabulary the course materials actually use, ranks the corpus by BM25, retrieves 48 candidates, and reranks them into a curated packet of up to 24 excerpts.

## Verification

```bash
npm run check
npm run build
```

Tests validate the core structured contracts and blindness/prompt invariants. A live model run is intentionally not part of the automated suite because it has API cost and non-determinism; run the historical fixtures from the homepage for the model-level evaluation.

## Deployment

The read-only Feedback Quality Report (`/`) and Review Dossier (`/audit`) run anywhere, including Vercel, because they fall back to committed snapshots. Live student grading (`/practice`) needs a long-lived server with a writable disk — a full run is ~10–15 minutes, longer than serverless function limits allow. See [DEPLOY.md](DEPLOY.md) for the Render/Railway/Fly setup.

The current store is local JSON on disk and the routes are unauthenticated. That is appropriate for a single-instance pilot with a persistent disk, but before accepting real student work at scale, add authentication, rate limiting, a durable database, and a clear retention policy.

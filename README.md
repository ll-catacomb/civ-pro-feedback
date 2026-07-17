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

Add an Anthropic API key (and optionally an OpenAI key for semantic retrieval embeddings) to `.env.local`, then run:

```bash
npm run index:semantic
npm run dev
```

`index:semantic` embeds the non-exam course corpus into a private, Git-ignored local index. Re-run it after changing course materials, then restart the app. If the index or embedding call is unavailable, grading continues with a visibly labeled lexical fallback.

To inspect exactly how many files, chunks, and characters would be sent without making an API call or writing an index, run `npm run index:semantic -- --dry-run`.

Open `http://localhost:3000` for the Feedback Quality Lab and `http://localhost:3000/practice` for the secondary student experience. `/qa` redirects to the homepage.

The entire grading chain runs on the Claude API (`claude-opus-4-8` by default; override with `ANTHROPIC_WORK_MODEL` / `ANTHROPIC_JUDGE_MODEL`). The blind evaluation owns the band recommendation and bands comparatively against instructor-graded reference answers (leave-one-out, so a run never sees its own grade). v4.0.0 collapsed the earlier dual OpenAI+Claude pipeline after calibration showed the cross-model judging layer did not improve band accuracy; pre-v4 dual runs remain readable in the QA lab and exports. Course retrieval fuses semantic similarity from `text-embedding-3-large` (the only remaining OpenAI call, optional) with lexical ranking, retrieves 48 candidates, and reranks them into a curated packet of up to 24 excerpts.

## Verification

```bash
npm run check
npm run build
```

Tests validate the core structured contracts and blindness/prompt invariants. A live model run is intentionally not part of the automated suite because it has API cost and non-determinism; run the historical fixtures from the homepage for the model-level evaluation.

## Deployment warning

The current store is local JSON and routes are unauthenticated. That is appropriate for private local QA, but not for student deployment. Add authentication, rate limiting, a durable database, and a clear retention policy before accepting real student work online.

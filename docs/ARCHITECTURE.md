# Architecture

## Request flow

```text
student answer
    |
    +--> 0a. exam-responsiveness assessment
    |
    +--> 0b. independent responsiveness judge + local exam fingerprint
    |        |
    |        +--> clearly different exam: 0 credit; stop substantive grading
    |
    +--> responsive answer: single Claude chain
             |
             +--> issue map, hybrid retrieval + rerank,
                  blind evaluation with anchor pack (bands here),
                  coaching draft, skeptical judge
```

Every stage runs on the Claude API (v4.0.0 collapsed the earlier dual OpenAI+Claude pipeline; calibration showed the cross-model judging layer added cost without improving band accuracy, and the historical dual-run fields remain readable in the store and UI). The blind evaluation's provisional band is the run's band recommendation.

Banding happens inside the blind evaluation — the stage audits have measured as the pipeline's most accurate component. There is no separate band-calibration stage; audits showed it systematically degraded the evaluator's holistic judgment by regrading the same defect list. Banding is comparative rather than absolute: the evaluation receives an anchor pack of instructor-graded answers (same-exam answers preferred, other years only to fill thin bands, always excluding the answer under review so its own grade never enters its run) plus one or two same-year assignment answers the instructor circulated as the best in the class, and the prompt requires explicit pairwise stronger/comparable/weaker verdicts against each graded reference. Anchors calibrate the texture of each band; the prompt forbids using them as doctrinal authority. An evaluator-only calibration sweep (POST /api/calibrations/evaluator-sweep, or the dashboard controls) re-runs the blind evaluator against either a four-fixture, one-per-band smoke set or the full benchmark using stored issue maps and evidence packets, so band-prompt experiments can be screened for at most four to eight paid calls. Every sweep is stored separately from ordinary run metrics. Issue-map weights preserve the exam's stated points exactly rather than normalizing to 100, and each evaluation records concise upper- and lower-boundary explanations with its band.

All stages use the Anthropic Messages API with adaptive thinking and Zod-backed structured-output contracts. The full local record includes both responsiveness checks, assessment outcome, every stage artifact, final judged feedback, the evidence packet, model names, token counts, timing, input hash, and prompt version. Runs persisted by the pre-v4 dual pipeline retain their extra fields (`claudeChain`, `crossJudges`, `dualDecision`) and still render in the QA lab.

The responsiveness gate is conservative: both model passes must independently assign a zero and the second pass must have at least 0.9 confidence before substantive grading stops. A disagreement is marked for manual review. Internal feedback-QA scores are never presented as student grades.

## Corpus

- `content/course/`: a snapshot of 451 cleaned Markdown files from `civil-procedure-materials`.
- `content/calibration/`: anonymized text extracted from the supplied historical answers.
- `src/lib/exams.ts`: the three official exam/model-answer pairs used by the UI.
- `src/lib/exam-match.ts`: a deterministic, IDF-weighted comparison against historical exam prompts that supplies advisory evidence to the independent responsiveness judge.
- `scripts/build-semantic-index.mjs`: builds a private, Git-ignored embedding index from non-exam course materials. Exact source text stays in the local index so every selected excerpt remains inspectable.
- `src/lib/retrieval.ts`: combines semantic similarity and lexical ranking with reciprocal-rank fusion, limits repeated chunks from one document, and falls back to lexical retrieval if the index is missing, stale, or temporarily unavailable. Historical exams are excluded because the selected exam and model answer are supplied directly and unrelated exams can contaminate feedback.

Retrieval occurs after the model has built the weighted issue map, so the query reflects the doctrines and analytical tasks actually posed by the selected exam. The system retrieves a broad pool of 48 hybrid candidates, and a low-reasoning model reranks them into a curated evidence packet of up to 24 excerpts. That larger packet is supplied to the blind doctrinal evaluation, coaching pass, and final skeptical judge. The final run preserves the retrieval method, semantic and lexical scores, rerank relevance, and exact cited text for QA.

The corpus is copied into this repository so the app is reproducible and does not depend on a sibling repository at runtime.

## Storage

The MVP uses an atomic local JSON store at `.data/runs.json`. Failed attempts are retained separately in `.data/failures.json` with the submitted answer, failing stage, and a reference shown in the UI. This makes local QA immediate and prevents an intermittent model or timeout error from erasing the attempted submission. `/api/export/json` downloads the complete successful-run archive, while `/api/export` produces a flattened Airtable-ready CSV. Set `FEEDBACK_DATA_DIR` to place the store elsewhere.

Before multi-user deployment, replace this adapter with an authenticated database or Airtable integration. The public routes currently have no authentication or rate limiting, and the local filesystem is not durable on typical serverless hosts.

## Privacy boundary

- The API key stays server-side.
- OpenAI API storage is disabled with `store: false`.
- A salted hash, rather than the response label, is used as the safety identifier.
- Historical student identifiers and exam-system metadata were removed from calibration Markdown.
- `.data` (including the semantic index and run archive), `.env*`, and temporary extraction artifacts are ignored by Git.

This is a formative-learning tool, not an official grading system. Model and judge scores must be reviewed against human evidence.

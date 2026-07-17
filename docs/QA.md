# Feedback QA protocol

## What the benchmark can establish

Eight supplied answers align with the 2014, 2015, or 2019 finals and have a known instructor band: DS, H, P, or LP. The file supplied as `2015 Exam Answer (P 3).docx` actually answers the 2014 Diggle/Parkinson and LupinBank/Clearwater final. It is therefore labeled `2014-P` and calibrated only against the matching 2014 exam and model answer.

The current answer's known grade is never included in its grading-chain prompt. Beginning with v3, the chain may receive labeled performance anchors from different assessments; those are development examples, not evidence about the current answer. The chain finishes first, and only then does the server join the current answer's actual grade and run a separately versioned post-hoc calibration analysis. Before doctrinal grading, two independent checks verify that the answer responds to the selected exam. Clear different-exam responses receive zero credit and stop before issue mapping.

The supplied 2019 LP Word answer contains three anchored comments from Travis Fife; those are retained as narrative benchmark evidence. The other seven supplied answers contain grade bands but no extractable grader comments or PDF annotations. They are explicitly labeled `grade_only`, and the post-hoc analyst is prohibited from inventing comment-level agreement.

## Baseline procedure

1. Add `OPENAI_API_KEY` to `.env.local` and start the app.
2. Open `/`.
3. Use **Run all blind · 2 parallel** to run the eight ready fixtures with bounded concurrency, or run them individually. Do not change prompts or models during the batch.
4. Export the run CSV and complete JSON archive. Keep these as the versioned baseline for the prompt version shown in the dashboard.
5. Read the final feedback and the automatically generated historical benchmark comparison while looking at the original answer, exam, model answer, cited excerpts, and judge findings.
6. Give a human quality rating from 1–5 and write a specific failure note where needed.

The dashboard reports exact-band rate and mean ordinal band distance. The model-generated feedback-QA score is diagnostic only; it is not a student grade and is never shown in the student result.

## Human review rubric

Rate each run on these questions:

- Accuracy: Are every stated rule, application critique, and quotation supported?
- Coverage: Did it identify the highest-value omissions and errors?
- Specificity: Could this feedback only have been written for this answer?
- Pedagogy: Does each priority tell the student what to do differently next time?
- Proportionality: Does the tone and emphasis fit the seriousness of the issue?
- Grounding: Do cited source excerpts actually support the associated claim?
- Retrieval: Did the run use hybrid retrieval, and do the recorded rerank reasons explain why the selected excerpts matter to the weighted issues? Treat a lexical-fallback run as a separate QA condition.
- Band discrimination: Does each blind evaluation distinguish central errors from secondary or bonus omissions, use the exam's actual point allocation, and explain both the upper and lower adjacent-band boundary?

Suggested interpretation: 5 = publish as-is; 4 = minor edit; 3 = useful but material edit; 2 = unreliable in important places; 1 = unsafe or fundamentally misdirected.

## Prompt iteration discipline

- Change one meaningful element at a time.
- Increment `PROMPT_VERSION` for every comparison-worthy change.
- Re-run the complete fixture set, not only prior failures.
- Compare human ratings and written failure categories alongside band distance.
- Keep the current answer's known grade and historical comments out of its prompts. Treat labeled anchors as development examples and report leave-one-exam-out results accordingly until a separate untouched holdout exists.
- Do not optimize to eight grades alone; inspect whether the feedback itself is accurate and useful.

## Versioned calibration findings

`civpro-feedback-v3.2.1` (not yet run) is the recovery baseline after the aborted v3.2.0 batch. It restores the neutral v3.1.1 evaluator and cross-judge prompts, restores the smaller DS/LP anchor pack, and keeps the deterministic lower-band rule only for a genuine 2–2 split. It also retains the evaluator-only sweep added during recovery; the dashboard now warns that a full sweep makes up to 16 paid calls and requires explicit confirmation. No current-answer grade or historical feedback enters the blind evaluator prompts. The version is advanced rather than reusing v3.1.1 so future records remain unambiguous.

`civpro-feedback-v3.2.0` was aborted mid-batch after a prompt-induced band collapse: all six saved records were P, including the 2019 DS answer, and four of the six were single-provider checkpoints after Claude overloaded_error failures. The version had stacked three downward mechanisms — DS base-rate language, an in-prompt hedge-down instruction, and the deterministic lower tie rule — and the first two compounded at every banding stage. Lesson recorded: conservatism belongs in the deterministic decision and display layers, never in the model prompts. A DS judgment remains DS in the product; uncertainty between H and DS may be shown transparently as H–DS, but the display must not silently relabel DS as “very high H.” The prompts and DS/LP anchor pack were restored in v3.2.1, the lower tie rule was kept, and a staged evaluator-only calibration sweep was added (dashboard button / POST /api/calibrations/evaluator-sweep). It reuses each fixture's most recent stored issue map and evidence packet and writes results to .data/evaluator-sweeps.json without touching runs.json or dashboard metrics. The default smoke screen is one provider over four fixtures (one DS, H, P, and LP; four paid calls); provider and scope must be chosen explicitly, and the UI confirms the exact maximum before starting. A full two-provider sweep remains available but is no longer the default. Future band-prompt experiments — the four-band anchor ladder, compact verified calibration cards — should pass the cheap smoke screen before any broader paid run.

The product foregrounds a whole or shoulder grade derived from the mean of the independent band opinions. Whole-number means display as LP, P, H, or DS. A genuine midpoint displays as LP–P, P–H, or H–DS. Quarter-step means retain their clear lean as a whole grade (for example, 2.25 → P and 2.75 → H), while the raw numeric mean remains saved for QA. The deterministic `finalBand` remains in the saved record for backward-compatible hard-band calibration, but it is labeled as the record band rather than presented to students as more certain than the evidence supports. QA and CSV exports report the categorical estimate, raw mean, and fractional calibration distance.

`civpro-feedback-v3.1.1` (not yet run) changes only the deterministic 2–2 split rule. The completed v3.1.0 cohort produced two cross-exam P/H/H/P splits—2019 P and 2014 P—and the former “higher tied band” rule persisted H for both actual-P answers. v3.1.1 retains the P–H hedge and manual-review status but persists the lower tied band as the strict hard estimate. All model prompts, anchors, exact exam-point handling, evaluation boundary fields, and agreement/majority behavior are unchanged. Applied counterfactually to the saved v3.1.0 signals, this rule yields 4/8 exact and mean ordinal distance 0.50 instead of 2/8 exact and 0.75.

`civpro-feedback-v3.1.0` completed all eight fixtures with 2/8 exact, mean ordinal distance 0.75, and fractional hedge distance 0.656. Exact point allocations were preserved correctly in both chains for every exam, and the new boundary fields made model disagreements auditable. The persisted distribution shifted upward to five H, two P, one LP, and no DS. That shift came primarily from the deterministic higher-band split rule rather than a cohort-wide anchor effect: OpenAI produced one LP/five P/two H, while Claude produced one LP/two P/five H. Claude and OpenAI remained aligned with their own chain on the two P/H split cases, and the higher-band rule converted both actual P answers to H. The remaining misses were shared evaluator calibration errors: both DS answers stopped at H, 2015 H stopped at P, and 2015 LP rose to P.

`civpro-feedback-v3.0.0` (not yet run) restructures the pipeline around the v2.2.0 stage-level audit, which found the two provisional evaluators were the most accurate components (4/8 exact, 0.50 mean distance each) while every later stage subtracted accuracy: the separate band assessors (OpenAI's worst at 2/8, 0.875), home-team cross-judges, and a confidence tie-break biased toward OpenAI's systematically higher confidences. Changes: banding moves into each chain's blind evaluation, which now receives an anchor pack (leave-one-year-out graded DS/LP fixtures plus instructor-selected same-year assignment answers); the separate band-calibration stages are removed; cross-judges run only when the provisional bands disagree and receive both chains' positions plus the anchor pack; the decision cascade is provisional agreement → judge agreement → four-signal majority (2-2 splits persist the higher band and manual review), with cross-provider confidence never compared; agreement runs replace the two cross-judges with one light feedback-merge call. A typical run drops from ~17 to ~12 model calls. Note the anchor fixtures overlap the calibration set: each fixture's own grade never enters its own run, but the other year's fixture grades do, so exact-band results should be read leave-one-year-out and any future graded answers should refresh the anchor pool.

`civpro-feedback-v2.2.0` completed all eight fixtures (3/8 exact, mean 0.75 persisted, hedged 0.6875) with misses in both directions. It was the first baseline with resilient dual-run persistence and hedged student estimates. It keeps the v2.1 grading prompts unchanged while versioning materially different pipeline behavior: Claude calls use two SDK retries plus one explicit retry for retryable stage or structured-output failures; completed OpenAI work is retained if the Claude chain fails; a surviving cross-judge produces a manual-review checkpoint; and two completed but disagreeing cross-judges produce a formative half-band estimate while preserving the higher-confidence discrete band for historical calibration metrics. Batch concurrency is limited to two fixtures. One-surviving-judge results are described accurately and are never presented as an average or a two-judge disagreement.

`civpro-feedback-v2.1.0` is the first runnable dual-model baseline. It preserves v2.0.0's time-pressured reference-class anchor, per-defect centrality classification, and protection for qualified conclusions on genuinely unresolved points, but removes explicit statements about prior actual-versus-predicted grade outcomes from every blind prompt. After the shared responsiveness gate, the OpenAI and Claude substantive chains now run concurrently. Both cross-judges audit against the union of the chains' evidence packets; their deterministic decision supplies the canonical feedback and predicted band everywhere. A band disagreement is persisted as manual review. The QA interface, CSV, and JSON retain both chains, both cross-judges, the decision, and the actual final feedback. `civpro-feedback-v2.0.0` was not run and is superseded by v2.1.0.

`civpro-feedback-v1.4.0` completed all eight distinct fixtures with four exact bands, mean ordinal distance 0.63, and a prediction distribution of one H, five P, and two LP. It improved the 2019 DS answer from P to H and preserved exact P/LP distinctions, but all four remaining misses were downward: 2015 DS to P, 2019 DS to H, and both H answers to P.

The repeated upper-band defect was in the final band handoff, not the blind-data boundary. The calibrator received exhaustive criterion gaps, the improvement-heavy corrected feedback, and feedback-audit findings, allowing the same weaknesses to be represented multiple times. It also recommended P for the 2015 DS answer while assigning a 4 for issue coverage and 3 for every other dimension. `civpro-feedback-v1.5.0` removes the duplicate coaching artifact from band calibration, labels audit findings as corrections rather than demerits, requires distinct consequence categories and preservation of genuine uncertainty, tests bands from DS downward, and requires the dimension scores to cohere with the final recommendation. The known grades and historical comments remain available only to the post-hoc calibration analysis.

## Airtable-ready export

`/api/export` produces one row per saved run, including the answer, responsiveness outcome, actual/predicted bands, canonical final feedback, the OpenAI and Claude chain artifacts, both cross-judges, the dual decision, historical grader comments, post-hoc calibration analysis, human QA, prompt version, models, timing, tokens, and input hash. That CSV can be imported directly into Airtable. `/api/export/json` preserves the complete nested archive without flattening. A live Airtable adapter can replace the local store later without changing the chain.

# Integrating instructor course context (v4.6.0)

All five instructor-supplied blocks — the Greinerisms (preferred vs. disfavored
terminology), the "brain off" topics, the recurring grader/TF meta-feedback, the
student abbreviation key, and the law-change corrections — were added to the
grading prompts *verbatim*, as additions only, each held in its own named
constant in `src/lib/prompts.ts` so the exact wording is auditable and nothing
was paraphrased. Rather than dumping everything into every step, each block was
wired only into the stages where it actually does work: the **Greinerisms** and
**abbreviation key** go to the three stages that read the student's answer (the
blind evaluation, the coaching draft, and the skeptical judge) so terminology is
understood, abbreviations are never misread or penalized, and correct course
usage isn't "corrected" away; the **"brain off" topics** and **grader
meta-feedback** go to the coaching and judge stages, since they shape the advice
a student receives rather than the grade; and the **law-change corrections** were
placed in the shared policy that every doctrinal stage inherits, explicitly
designated as the *only* sanctioned override of the otherwise-closed source set —
necessary because the corpus is a decade old and stale on plausibility pleading
(post-2009), the venue statute (post-2012), the Exxon/§1367 point, and several
dropped topics.

The framing around each block keeps it from turning into boilerplate: the
coaching stage is told to raise a "brain off" or exam-craft point *only when the
specific answer exhibits it* and to anchor it to the actual text ("never as
generic advice"), and the important carve-out — that the Smith-Grable
exception's second step is *not* brain off — is preserved word-for-word so the
model doesn't over-apply the label. The evaluation stage treats a disfavored
term as a terminology note, not a doctrinal error, and never docks for
abbreviating; the judge is instructed to preserve correct course terminology and
legitimate "brain off"/exam-craft guidance instead of stripping it as informal
or unsupported. The whole batch shipped as prompt version **v4.6.0** with unit
tests (`src/lib/prompts.test.ts`) that assert each block — including the
Smith-Grable carve-out and the law-change overrides — is present verbatim in the
right stages, so a future edit can't silently drop them.

## Constants and where they are injected

| Constant (`src/lib/prompts.ts`) | Content | Injected into |
| --- | --- | --- |
| `GREINERISMS` | Preferred / disfavored terminology | evaluation, coaching, judge |
| `ABBREVIATIONS` | Student abbreviation key | evaluation, coaching, judge |
| `BRAIN_OFF_TOPICS` | Topics to run mechanically, not overthink | coaching, judge |
| `GRADER_META_FEEDBACK` | Recurring exam-craft notes from graders/TFs | coaching, judge |
| `LAW_CHANGES` | Corrections to the dated corpus | `SHARED_POLICY` (all doctrinal stages) |

## Calibration (v4.6.0, eight instructor-graded answers)

4/8 exact band, 8/8 within one band, mean distance 0.50 — the best result on the
benchmark to date (v4.1.0 was 3/8 exact, 0.75 mean). Note this batch also moved
the model to Opus 5, so it is a go/no-go read rather than a clean attribution of
the gain to the course context alone.

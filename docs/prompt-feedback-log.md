# Prompt feedback log

Reviewer feedback on generated feedback, and what changed in the prompt chain as a
result. One section per review round. The point is traceability: every prompt rule
should be answerable to an observed defect in a specific run, and every rule that
rests on an assumption rather than an instructor statement should be visible here
until it is confirmed.

---

## Round 1 — 2015 P (v4.6.0 → v4.7.0)

Reviewers: IE and HM, 8/7/2026. Run `3407be8b-03c7-4bbc-99af-767b2b7190ee`
(calibration fixture `2015-p`, predicted P, actual P).

### Verified against the run

Every item below was confirmed in the stored run before any prompt was edited.

| # | Reviewer | Observation | Verified as |
|---|---|---|---|
| 1 | IE | DJ analysis never run, just concluded | `2015-p.md:17` — "The trial court had SMJ (diversity, non-AIC deficient)." The evaluation skipped past it to appellate jurisdiction. |
| 2 | IE | Should have said "no final order" | Output said "neither is final under 1291" — correct but never named the failed element. |
| 3 | IE | Student recites 1291 exceptions without engaging facts | Confirmed; not recorded as `application_gap`. |
| 4 | IE | *Reeves* no longer read but cited | 4 references in the output. `Reeves` appears in only 3 files corpus-wide, all 2016 assignment model answers — not the casebook, not the 2015 model answer. |
| 5 | IE | Intersystem preclusion missed, feedback jumbled | The string `intersystem` appears **0 times**. One improvement card covered Q3 *and* Q4 together. |
| 6 | IE | Neither student nor AI struck ¶8 as conclusory | Confirmed; `2015-final.md:177` pleads causation as a bare conclusion. |
| 7 | HM | "Disjunctive holding" / "Turner disjunction" | Both present; neither is a real course term. |
| 8 | HM | "A wrong threshold answer costs more than the merits discussion earns" | Confirmed verbatim. |
| 9 | HM | Multi-element tests named but not enumerated | "Cohen's three elements?" and "1292(b)'s elements plus the double discretion". |
| 10 | HM | Sentences too long; one idea per sentence | The Q2 `whatHappened` ends in a single 70-word sentence chaining four distinct errors. |
| 11 | HM | "without first asking what law supplies the preclusive effect…" | Confirmed — the paraphrase that displaced "intersystem preclusion". |
| 12 | HM | "Algorithm" language confusing | 2 uses. Traced to `GRADER_META_FEEDBACK`, which is instructor language — kept as an internal concept, banned in student-facing text. |
| 13 | HM | Erie should not be brain off | `* Erie` was in `BRAIN_OFF_TOPICS`. |
| 14 | HM | Erie underweighted | "Insert a compact Erie run"; "Three or four tight sentences will do." |
| 15 | HM | "unilateral plaintiff activity" | Confirmed. |
| 16 | HM | Rule 21 not in outline/model answer | Output told the student to "name Rule 21 dropping and Rule 42(b) separate trials". |
| 17 | HM/Greiner | JNOV outdated, use JAMOL | Student wrote JNOV at `2015-p.md:21,23`; the chain never corrected it. |

### Changes made

- **`LAW_CHANGES`** — added *Reeves* as withdrawn course material (#4).
- **`BRAIN_OFF_TOPICS`** — removed `* Erie` (#13).
- **`GREINERISMS`** — filled the empty intersystem-preclusion `Context:` field (#5, #11); added JNOV as a negative term with JAMOL as the preferred abbreviation (#17).
- **`SHARED_POLICY`** — the closed source set now binds what the chain *prescribes*, not only what it asserts (#16).
- **Evaluation** — added the two under-detected failure modes: threshold requirements asserted as bare conclusions, and tests recited without application (#1, #3). Coverage 3–4 now requires elements met against named facts.
- **Coach** — added a drafting block: one idea per sentence, no coined terms of art, no student-facing "algorithm", enumerate every multi-element test, name the failed element, one exam question per improvement, and match the size of the fix to the question's weight (#2, #5, #7–#10, #12, #14, #15).
- **Judge** — made the drafting rules enforceable, with rewrites recorded as findings, and required striking any prescription to cite authority outside the source set.

Regression tests: `src/lib/prompts.test.ts`, block beginning "drops Erie from the
brain-off list".

### Deliberately not changed

- **Smith-Grable (IE, "Q1")** — IE's Q1/Q2 numbering is offset from the exam's. The
  bare-conclusion defect is real and sits in the **Q2** response (#1). But in exam Q4
  the student *does* run Smith-Grable with genuine analysis (`2015-p.md:31`), so the
  chain's praise there was accurate and was left alone. The numbering ambiguity is
  itself evidence for the by-question restructure.
- **Perkins (HM)** — unlike *Reeves*, `Perkins` **is** live in the course corpus
  (`content/course/casebook/06-day-6.md`). HM's doubt is about whether it is the right
  case to suggest for the at-home inquiry, which is a substantive call, not a
  retired-material call. Encoding a guess would be worse than leaving it. See open
  questions.

### Open questions for Greiner (jgreiner@law.harvard.edu)

1. **Perkins** — is it the right reference for the general-jurisdiction at-home
   inquiry, or should the bot stop suggesting it? It is in the Day 6 casebook
   materials, so it cannot be handled as withdrawn material.
2. **Intersystem preclusion wording** — the `Context:` field for this negative
   Greinerism was blank in the instructor-supplied glossary. The current text is
   **authored, not instructor-verbatim**, and needs sign-off.
3. **JNOV entry** — added on Greiner's relayed instruction that the bot should suggest
   JAMOL. The wording is authored; the substance is confirmed. Worth a glance.
4. **JMOL vs JAMOL** — both are recognized when *reading* a student answer. The chain
   now prefers JAMOL when *writing*. Confirm that is the intended asymmetry.

### Deferred to the by-question restructure

- #5's "jumbled" delivery is mitigated by the one-question-per-improvement rule, but
  the real fix is grouping feedback by question rather than by priority gradient.
- #6 (conclusory pleading allegations such as ¶8) is a per-question checklist item.
  It belongs in a pleading-question rubric, not in a global prompt rule.

---

## Round 2 — 2015 DS (v4.7.0 → v4.8.0)

Reviewers: IE (8/6/2026) and HM. Run `977afc6b-11be-4875-85aa-59855701a7a7`
(fixture `2015-ds`, predicted **H**, actual **DS**, lean high — this run also
under-graded by one band).

### The headline defect, quantified

Both reviewers led with the same request: feedback question by question. The run
shows why. Improvements came out in this order:

    Q4 · Q2 · Q4 · Q4 · Q4 · Q1 · Q3 · craft · Q2

Only **2 of 9** cards named their question at all. The priority gradient that was
supposed to justify the ordering is not even monotonic — a `medium` card sits last,
after three `low` ones. Strengths were interleaved the same way (Q3, Q4, Q4, Q1, Q2).

### Two reviewer items that did not hold up

- **Scott (HM).** "The model answer referenced Scott, the bot should have told the DS
  answer to" — the bot **did**, three times, including "no engagement of Scott or of
  the undisputed authenticity of the three emails."
- **Hart (HM).** "The bot did not note this discrepancy" — the bot **did** note it
  ("Hart is not named"), but filed it under *Secondary omissions* in the internal
  evaluation, where it never reached the student.

Both are **surfacing** failures, not detection failures. That matters for the fix:
HM proposed a new stage to inventory the model answer's cases, but the inventory
already happens. The repair is to require the evaluation to flag a carrying
authority as a core defect, and to require the coach to carry it into the
student-facing card — which is what v4.8.0 does. If a later round shows genuine
detection misses, a dedicated stage becomes worth its cost; on this evidence it
would have duplicated work the chain already does.

### Verified

`sua sponte` 0 · `Mas` 0 · `Newark` 0 · `Sibbach` 0 · "really regulates" 0 ·
"abridge, enlarge" 0 · "fourth prong"/"fourth factor" 0 · `EDoVA`/`WDoVA` 7 ·
"unilateral-activity" 4 · "disjunctive command" 1 · "decisive hinge" 1 ·
"two sentences" 9 · `Twiqbal` 4 (a whole `low` improvement card, plus a revision-plan
task) · `taxonomy` 1 (the summarizing passage HM quoted).

### Changes made

- **`FeedbackSchema`** — `questionRef` and `crossCutting` on every strength and
  improvement. Optional, so pre-v4.8.0 runs still validate.
- **Coach** — a new *Organize by question* block: exam order, never priority order,
  never interleaved; one to three improvements per question in proportion to its
  points; cross-cutting items last.
- **Coach** — word-budget block: every addition must name the passage that pays for
  it, and no bare "add two sentences." This **qualifies round 1's** rule about not
  compressing weighted frameworks; the two would otherwise pull against each other.
- **Coach** — plain words and short sentences; no invented abbreviations; analyze
  rather than summarize; walk taught sequences in order (preclusion split into claim
  and issue, supplemental jurisdiction through 1367(a)/(b), enumerated bases in
  statutory order).
- **Coach** — disfavored terminology may never take an improvement card or a
  revision-plan task, and costs no credit.
- **Evaluation** — explicit per-criterion authority check, with a carrying authority
  flagged as a core defect rather than a secondary omission.
- **`COURSE_FORMULATIONS`** (new) — the REA/Sibbach wording, the HCOL forum-state
  sentence, and the policy-answer criteria. Injected into evaluation and coach.
- **Judge** — enforces the ordering, word-budget, abbreviation, terminology, and
  no-summary rules.
- **UI** — `groupByQuestion` in `practice-workspace.tsx` renders both stacks under
  question headings; "Highest-value improvements" is now "What to work on."

Regression tests: six new blocks in `src/lib/prompts.test.ts`.

### Open questions for Greiner

Carried from round 1: Perkins; the authored intersystem-preclusion and JNOV entries;
JMOL-in/JAMOL-out. New in this round:

5. **Twiqbal.** The instructor glossary lists it as a negative Greinerism; IE says it
   is commonplace in high-scoring answers and should get full credit. v4.8.0 treats
   these as compatible — no credit effect, preference mentioned only in passing — but
   confirm that is right.
6. **Venue sua sponte.** The DS answer says courts must verify venue sua sponte. IE
   believes that is wrong and the chain failed to flag it. Needs a ruling before the
   chain can be taught to catch it.
7. **SMJ/IPJ as "bonus."** The chain called verifying SMJ and IPJ bonus material on
   Q2. IE recalls TAs saying always to do them. Which is it?
8. **Plausibility-pleading Erie.** IE believes these are evaluated under the FRCP
   validity rules, not the twin aims, because plausibility pleading construes a Rule
   rather than federal common law. The chain's "Walker move" framing may be wrong.
9. **Policy-answer criteria.** The three criteria in `COURSE_FORMULATIONS` are IE's
   view, explicitly offered for Greiner's confirmation.

### Content gap

IE asked that feedback be "structured by walking through Greiner checklists wherever
possible." **We do not have the checklists.** `BRAIN_OFF_TOPICS` names the topics that
have one but contains none of their steps. v4.8.0 instructs the coach to walk a taught
sequence in order and spells out three sequences inline, but that is reconstruction,
not the instructor's own checklists. Obtaining them would likely be the single largest
quality gain available, and would also give the per-question rubrics real structure.

---

## Round 3 — 2015 H (v4.8.0 → v4.9.0)

Reviewers: IE (8/6/2026) and HM. Run `90831596-ad0c-46c3-9685-bc940292ce75`
(fixture `2015-h`, predicted **P**, actual **H**, lean high).

### A band-accuracy pattern worth watching

This is the second consecutive fixture the chain under-graded by exactly one band,
both with `bandLean: "high"`:

| Fixture | Predicted | Actual | Lean |
|---|---|---|---|
| 2015 DS | H | **DS** | high |
| 2015 H | P | **H** | high |

Two cases is not a trend, and the reviewers commented on feedback content rather
than band accuracy. But the direction is consistent, and the "high" lean means the
chain twice saw the answer pressing the top of the band it chose. Worth checking
deliberately once the by-question rewrite has run, rather than tuning band language
on two data points now.

### The authoritative item: Rule 50 finality

The chain wrote, of the H answer:

> (On finality: one class outline lists denial of a Rule 50 motion as a final
> decision, so there was some tension in the materials…)

There was no tension. Greiner's ruling, relayed 8/2026:

> The problem is that Rule 50 governs more than one procedural posture. Denial of a
> pre-verdict Rule 50 motion is not a final order because the trial will continue.
> Denial of a post-judgment Rule 50 motion is a final order for appellate jurisdiction.

The chain read a posture distinction as a source conflict, then excused the student's
conclusion on that basis. Now in `COURSE_CLARIFICATIONS`, with an explicit
instruction not to report it as unresolved tension.

### One reviewer item the record contradicts

IE, on Q3: *"Also didn't do claim preclusion, which AI criticised in the DS answer."*
The run shows the opposite — the student led with it and the chain credited it as its
**first** strength: "You led with claim preclusion and established privity through
control rather than asserting it." The evaluation separately flagged the real defect,
which is that the answer invoked **mutuality** — an issue-preclusion concept — inside
its claim-preclusion discussion. That conflation is precisely what round 2's
keep-them-visibly-separate rule targets, so the underlying concern is already served
and no new rule was added.

This is the third reviewer item across three rounds that did not survive checking
against the stored run (after the round 1 Q1/Q2 numbering offset and the round 2
Scott/Hart surfacing question). The reviewers are reading real output carefully; the
pattern is simply that recollection across four long answers drifts. It is a good
argument for the by-question view, and for keeping this verify-first step.

### Verified

`paragraph 8` 0 · `¶ 8` 0 · `roadmap` 0 · `thesis` 0 · `topic sentence` 0 ·
`organization` 1 · `Erie` 18 · `brain off` 4 · Q-order **Q4 · Q4 · Q4 · Q2 · Q3 · Q1**
— every card labeled, but in reverse exam order, driven by priority. Round 2's
ordering fix addresses this directly.

### Changes made

- **`COURSE_CLARIFICATIONS`** (new) — Rule 50 finality by posture; Erie salience.
  Injected into evaluation and coach.
- **Erie** — always check whether the facts raise one, including where the answer
  never signals it; missing a live Erie question is a severe defect. Paired with an
  explicit guard that Erie is *not* mechanical, so this cannot walk back round 1's
  removal of Erie from `BRAIN_OFF_TOPICS`. HM raised both halves.
- **Evaluation** — incomplete framing is not a wrong framing. The chain told a student
  their cost framing of the due-process conflict was misplaced; cost is genuinely one
  dimension of it, so the defect was stopping there. `rule_error` is now reserved for
  statements that are actually incorrect.
- **Coach** — organization is a substantive improvement, not a stylistic aside:
  roadmap/thesis, topic sentences, and developing a position before answering it
  rather than alternating sentence by sentence. HM found an answer whose content was
  present but whose presentation buried it, and the chain said nothing.
- **Coach** — name record text by number. "Strike paragraph 8 as conclusory", not
  "strike the conclusory allegations."
- **Judge** — strikes overstated criticism, and repairs unnumbered record references.

Regression tests: four new blocks in `src/lib/prompts.test.ts`.

### Paragraph 8 has now appeared in all three rounds

| Round | Fixture | What happened |
|---|---|---|
| 1 | 2015 P | Neither student nor chain mentioned striking it |
| 2 | 2015 DS | Student struck it correctly; the chain **critiqued that** |
| 3 | 2015 H | Student didn't strike it; the chain never said so |

Three fixtures, three different failures on the same allegation. The v4.9.0 rule
requires naming paragraphs by number and treats identifying conclusory allegations as
the taught first step of plausibility pleading. If this recurs in round 4, it is not a
prompt-wording problem and needs a pleading-specific rubric step instead.

### Open questions for Greiner

Carried: Perkins; intersystem-preclusion and JNOV wording; JMOL/JAMOL; Twiqbal; venue
sua sponte; SMJ/IPJ as bonus; plausibility-pleading Erie; policy-answer criteria.

10. **Would missing an Erie analysis still earn an H today?** (IE.) This bears
    directly on band calibration, not just feedback content.
11. **Parklane.** IE reports a "slight misstatement/complication of how the Parklane
    rule is taught" but rated the chain's suggested fixes good. Needs the correct
    formulation before anything is encoded.
12. **Appellate-jurisdiction harshness.** IE thinks the chain was "a bit harsh" on both
    answers for not engaging the order's "really straightforward language." The
    overstatement guard may cover it; confirm the calibration is now right.

---

## Round 4 — 2015 LP (v4.9.0 → v4.10.0)

Reviewers: IE (8/6/2026) and HM. Run `8d5107c9-0663-46c2-92e3-6c75d793da65`
(fixture `2015-lp`, predicted **P**, actual **LP**, lean high).

### The structural finding: the chain does not use the band range

Round 3 flagged two consecutive under-grades and deferred. This round supplies the
counter-case — an **over**-grade — which resolves what the pattern actually is. All
nine v4.6.0 fixtures:

| fixture | actual | predicted | Δ |
|---|---|---|---|
| 2015-ds | DS | H | −1 |
| 2015-h | H | P | −1 |
| 2015-lp | LP | P | **+1** |
| 2019-ds | DS | H | −1 |
| 2014-p, 2015-p, 2019-h, 2019-lp, 2019-p | — | — | 0 |

    predicted:  P:5  H:3  LP:1  DS:0
    actual:     P:3  DS:2  H:2  LP:2

**DS was never predicted once in nine runs**, and both actual DS answers came back H.
Five of nine predictions were P. This is range compression toward the middle, not a
directional bias, and it is why the reviewers read the LP feedback as far too positive
while the DS and H feedback under-sold those answers.

The cause looks structural rather than doctrinal. The banding rules carried an
explicit brake in the upward direction — "outperforming a reference does not
automatically jump a band", "merely edging out an H reference is a high H, not a DS" —
with no counterpart going down. An answer weaker than the P reference had nothing
telling it to fall to LP. v4.10.0 adds the mirror (step 3a) and states that all four
bands are live and the reference stack spans all four precisely so the scale gets used
(step 3b). The existing upward brake is deliberately left intact; it was earlier
tuning against over-grading and reversing it would trade one failure for the other.

**This needs a calibration re-run to validate.** Nine fixtures is a small sample, and
prompt wording is an indirect lever on a judgment. Do not treat the fix as landed
until the ladder has been re-run.

### The authoritative item: rule statements under a word limit

The chain told the LP student "State the rule once, correctly, and cite Semtek."
Greiner's ruling, relayed 8/2026, is that the full CRUPAC is too wordy for these exams
and that **either** of two forms is complete — conclusion plus citation, **or** rule
with reasoning and no citation — but never both. Now in `COURSE_CLARIFICATIONS`, with
the judge striking any bare "state the rule" that does not say which form is meant.

### One reviewer item the record contradicts

IE: *"Citing Wal-Mart for GIPJ/essentially at home is wrong."* The chain did not cite
Wal-Mart — the **student** did, and the chain quoted them doing it ("essentially at
home in VA … like Wal-Mart") and criticized it correctly for not naming Daimler
(`Daimler` appears 9 times in the output). No change made. This is the fourth such
item across four rounds; see the round 3 note on why the verify-first step is earning
its cost.

### Not encoded: Klaxon

IE says the chain read the HCOL analysis too critically and that "EDVA does apply VA
procedural via Klaxon." Klaxon supplies the **forum state's choice-of-law rules** to a
federal court sitting in diversity, so whether "VA procedural law" is a fair gloss or
a misstatement is a doctrinal call for Greiner, not one to encode from a review note.
The adjacent, safely actionable half — that front-loading the HCOL discussion was a
sequencing choice rather than an error — **is** encoded.

### Changes made

- **Evaluation** — symmetric banding (3a), full-range instruction (3b), and an
  explicit statement that prose, breadth, and confident tone are not performance.
- **Coach** — a tone block for weak answers: the overview states the overall level
  before any praise; praise only what the analysis earned; strengths scale to the work;
  never open by complimenting the writing when the substance failed.
- **Evaluation** — presentation order is not a defect; characterize the answer exactly
  (the chain reported the student grounded appellate jurisdiction in SMJ when they had
  named the final-order requirement and simply never ran it).
- **`COURSE_CLARIFICATIONS`** — Greiner's two permitted forms for a rule statement.
- **Judge** — praise must match the evaluation's findings, with the weak-answer case
  called out as the most important correction it makes.

Regression tests: four new blocks in `src/lib/prompts.test.ts`.

### Preserved deliberately

HM praised the Q2 checklist prompt as the model to imitate — it names every element of
every step rather than saying "run all X elements." That behavior comes from round 1's
enumeration rule, and the round 4 tone changes are scoped to praise and banding so they
do not touch it.

### Open questions for Greiner

Carried: twelve, rounds 1–3. New:

13. **Klaxon and the HCOL sequence.** Is describing Klaxon as supplying "VA procedural
    law" a misstatement, as the chain held, or acceptable, as IE reads it?
14. **Rios.** IE suspects the LP answer conflated "necessary to the decision" with
    appealability. The chain never engaged Rios at all (0 mentions). Needs the correct
    teaching before the chain can be taught to catch the conflation.
15. **"Brain off" on specific personal jurisdiction.** HM worries the label undersells
    the analysis SPJ requires, even though the chain's actual advice did walk
    purposeful availment, relatedness, and F&R in order. Is SPJ correctly on the
    brain-off list, or does it need the same carve-out Smith-Grable has?

---

## Round 5 — 2019 DS (v4.10.0 → v4.11.0)

Reviewers: KC and FC. Run `3b2bd8cc-d146-49ed-8048-9accef960b2e`
(fixture `2019-ds`, predicted **H**, actual **DS**, lean solid).

### The band finding replicates on the other exam

FC noticed independently: *"Bot did not award DS."* This is the third DS-actual answer
under-graded to H, and the first with lean **solid** rather than high — the chain was
not even close to the top band here. It confirms round 4's range-compression finding
is not a 2015-specific artifact. The v4.10.0 symmetry fix is still unvalidated; this
is more evidence it was needed, not evidence it worked.

FC also asks how "DS-heavy" the bot should be, and notes the answer: students will not
see a band. That lowers the stakes but does not remove them — the band is what human QA
grades the chain against.

### The emphatic correction: citations

The chain told this student to "add a two-word tag of what it stands for, or cut it"
for `'contra: Russell'` and `'Shutts'`, and recorded "naming an authority whose
relevance is unexplained" as a weakness. FC, emphatically:

> BOT CALLS OUT UNEXPLAINED CITES, BUT THOSE ARE KEY! The right case citation should be
> the substitute for explaining why the case applies or what it says!

This one is not a judgment call — the chain contradicted guidance already in its own
prompt. `GRADER_META_FEEDBACK` has said from the start: *"Cite cases and statutes when
possible to reduce verboseness."* The chain was penalizing the exact behavior the
course rewards. Now: a correct citation is never a defect, no parenthetical is ever
expected, and a citation may be flagged only where it is the wrong authority, does not
support the proposition, or is genuinely ambiguous. A regression test pins the new rule
against the standing grader note so the two cannot drift apart again.

### Resolved: Twiqbal (open question #5)

Round 2 left this open after IE said Twiqbal should earn full credit while the
instructor glossary disfavored it. Greiner, relayed 8/2026:

> Yes, I'd rather not use it. At one point, it was what everyone was saying, so I let it
> go even though I didn't like it, but I'd rather not use it or have the bot use it.

Round 2's handling was right and stands: no credit effect, never its own card, never a
revision-plan task, a passing clause at most. Added in this round: the chain must not
use a disfavored term **in its own voice** either, which the instruction reaches
directly.

### Verified

`proportionate answering` 1 (undefined coinage) · `algorithm` 3 (banned in round 1 and
still present at v4.6.0) · `materially stronger` 2 · `unexplained` 2 · overview opens
with a single 62-word sentence stacking four achievements.

### Changes made

- **Evaluation** — a correct citation is the explanation; compression, fragments, and
  clipped constructions are correct technique and never a writing defect.
- **Coach** — write less: say it once, cut sentences that would read the same on any
  other student's answer, no invented evaluative labels, and earn every card (drop
  anything obvious or whose fix costs more words than it earns).
- **Coach + schema + UI** — `exampleRevisionRef` places the example revision beside the
  question it rewrites instead of stranding it at the end where it reads as a summary.
  The UI falls back to the tail when the ref is absent or matches no group.
- **Judge** — enforces all of the above, and must return feedback shorter than the draft.

Regression tests: five new blocks. 76 tests total.

### Already satisfied

KC asked that "What is working" be split by question the way improvements are. Round 2
did this for both stacks; it will be visible on the next run. KC's praise for the
what-happened / why-it-matters / try-this-next structure and for the Q5 word-cutting
advice describes behavior nothing in rounds 1–5 touches.

### Open questions for Greiner

Carried: 1–4, 6–15 (question 5, Twiqbal, is now resolved). New:

16. **Forced hedging.** FC: "how much do we need? Hard to draw the line from where it's
    needed and where one answer path is fine." The chain currently rewards two-sided
    treatment broadly. Needs a rule for when a single well-chosen path is complete.
17. **Policy-answer idea separation.** FC is unsure the chain was right to press for
    separating ideas in the policy section, though it thinks the advice sound in
    general. Related to question 9's policy-answer criteria.
18. **Q6 organization.** KC thought the organizing suggestion good but doubted the
    student should be penalized for it. v4.10.0 already bars order-of-presentation from
    lowering coverage; confirm that is the right line.

---

## Round 6 — 2019 H (v4.11.0 → v4.12.0)

Reviewers: KC and FC. Run `a28a2010-5f03-4f72-8b7f-3c9e1fa80826`
(fixture `2019-h`, predicted **H**, actual **H** — band correct).

### The pleading item is finally promoted out of prompt wording

Round 3 recorded: *"If this recurs in round 4, it is not a prompt-wording problem and
needs a pleading-specific rubric step instead."* It has now surfaced in five of six
rounds, and KC states the requirement precisely — the student should be told to name
which paragraphs speak to which element of the tort, and which are conclusory and get
struck.

`COURSE_FORMULATIONS` now carries the taught sequence as four numbered steps:
conclusory allegations identified **by paragraph number** and set aside; elements taken
in turn with the paragraphs pleading facts toward each; a plausibility judgment per
element; and a separate cut for a demand (punitive damages) as against the claim. The
coach must work at that level and the judge repairs anything vaguer. This closes the
thread that ran ¶8 through rounds 1, 2, 3 and 6.

### Two new over-reach findings

**The chain graded the exam document.** It built a card telling the student to "use
instruction 4 on the exam's glitches" and called flagging internal inconsistencies
"cheap points you left unclaimed." KC doubts these matter or would cost points. Nothing
in the exam scores them. The chain now may not record a defect for reading past a typo
or inconsistency, nor describe noticing one as points available — while still crediting
a student who states a reasonable assumption where an ambiguity actually blocks an
answer.

**The chain enforced an abbreviation house style.** It put "use … NMOCE rather than
ONMCE" in the **revision plan** — which round 2 already bars for terminology, and which
is not even a correction: KC has ONMCE and DNMCE in their notes, and the model answer
uses NMOCE. Variants are now explicitly the same term (ONMCE/NMOCE, DNMCE/NMDCE,
JMOL/JAMOL), never a coverage deduction, never a card. The abbreviation key is a
decoding aid, not a style guide to enforce on students.

### Verified

`ONMCE` 4 · `NMOCE` 5 · `glitch` 4 · `proportionate triage` 3 (another coinage, already
banned in round 5) · `A2J` 10 · `Twiqbal` 4 (resolved in round 5; this run predates it).

### Changes made

- **`COURSE_FORMULATIONS`** — the plausibility-pleading sequence, worked paragraph by
  paragraph against the elements.
- **Coach** — plausibility pleading added to the taught-sequence list.
- **Evaluation** — do not grade the exam document; abbreviation variants are not errors.
- **Judge** — repairs vague 12(b)(6) instructions, strikes abbreviation-variant cards
  and revision-plan steps, and strikes any claim that failing to flag an exam defect
  cost points. "Proportionate triage" added to the banned-coinage examples.

Regression tests: two new blocks. 78 tests total.

### Confirmed working, left alone

FC's list of things the chain got right is long and worth recording, because the rounds
have been additive and something has to be preserved: brain-off SIPJ identification, the
venue-too-short catch, Erie and HCOL handling, flagging the Exxon question ("Exxon makes
its way into nearly every exam"), correctly noting no SMJ was needed on Q5, and catching
A2J as the recurring policy theme. None of rounds 1–6 touches these paths.

### Open questions for Greiner

Carried: 1–4, 6–18. No new questions this round; KC's ONMCE/NMOCE query is answered by
treating both as valid rather than by picking one.

---

## Round 7 — 2019 LP (v4.12.0 → v4.13.0)

Reviewers: KC and FC. Run `03804eca-e581-4369-8100-8f372c956be2`
(fixture `2019-lp`, predicted **LP**, actual **LP** — band correct, lean high).

### Reconciling KC against HM

These two look opposed and are not, and getting it wrong in either direction would
have cost something real:

- **HM (round 4, 2015 LP):** "AI was way too positive on a piece that ultimately LPed."
- **KC (round 7, 2019 LP):** "I appreciate that the feedback starts off positive even
  though it is giving an LP grade. Positive reinforcement followed by constructive
  criticism is good model."

The difference is not tone, it is honesty. The 2015 LP was **over-graded to P** and
opened by praising the prose ("well-written, heavily abbreviated"). The 2019 LP was
**banded correctly** and opened by naming two specific analyses that actually worked,
then turned with "The problem is distribution and completeness: Q2 (11 pts) and Q3
(3 pts) are effectively blank."

So round 4's defect was inaccuracy, not positivity — and round 4's rule ("state the
level plainly, **before any praise**") over-corrected. It would have banned the exact
opening KC praised. v4.13.0 restores praise-first as the default on every answer
including a failing one, while keeping round 4's guards: the praise must be a real,
specific piece of analysis, never the writing, and the honest verdict must land in the
same opening paragraph rather than being deferred. Both round 4 guards are still pinned
by their original test.

### Privacy: checked, clean, and hardened anyway

FC saw a real name — "Travis Fife" — while reviewing this run. It is **not** a leak:

    student-facing feedback:  0 occurrences
    historicalFeedback:       6   (fixture provenance)
    calibrationAnalysis:      8   (post-hoc QA stage)

Both locations are instructor-facing, and the attribution belongs there. But
`SHARED_POLICY` protected only *student* identity, so nothing stopped a grader's name
from crossing into student text; it simply had not. Now explicit: never name a grader,
teaching fellow, instructor, or commenter in student-facing output, and where such a
comment informs the feedback, give the substance without the source. Worth re-checking
when the feedback DB is built, since that is where the two layers will sit closest.

### Changes made

- **Coach** — praise-first opening restored with honesty guards intact (above).
- **`COURSE_FORMULATIONS`** — FC's exam hack: a complaint reproduced in full is the
  exam's strongest signal that a full 12(b)(6) run is wanted, and skipping it is a major
  omission. Also the numerosity band (≥40 satisfies, ≤20 does not, the middle is
  arguable and needs facts), the point that a small per-member amount in controversy
  *supports* certification, and that policy answers are answered inside the course's
  frame — a discussion built on criminal law is a distribution problem, not a doctrinal
  one. Access to justice noted as the recurring policy theme.
- **`SHARED_POLICY`** — no grader/TA names in student-facing text; plain words for
  procedural things ("the request for damages", not "the prayer", which KC flagged
  twice in this run).

Regression tests: four new blocks. 82 tests total.

### The 2015/2019 ladder is now complete

Eight fixtures reviewed across seven rounds. Prompt version v4.6.0 → v4.13.0.

**Nothing here has been validated against live output.** Every change is reasoned from
stored v4.6.0 runs. The band-symmetry fix (round 4) is the most speculative — three DS
answers under-graded, corrected by prompt wording aimed at a judgment call — and the
verbosity rules (rounds 1, 5, 6) have the awkward property of being long additions to
prompts whose central complaint was length. A calibration re-run of the eight-fixture
ladder is the next step before any further prompt work.

### Open questions for Greiner

Carried: 1–4, 6–18. Seventeen open. No new questions this round.

---

## Round 8 — 2019 P (v4.13.0 → v4.14.0)

Reviewers: KC and FC. Run `9d98f60c-4295-4a69-bba3-ae9d7d879194`
(fixture `2019-p`, predicted **P**, actual **P** — band correct).

Short round. One formatting fix, and one reviewer disagreement recorded rather than
resolved.

### Steps render as a paragraph

KC: the Q1 improvement "lists six steps – it is a bit hard to read in paragraph format."
Confirmed — the `howToImprove` string contains six numbered steps and **zero newline
characters**:

> SMJ is a brain-off topic. Turn your brain off and walk the taught map in order: (1) Is
> the joinder authorized (Rule 20 …)? (2) AUJ? (3) DJ? (4) § 1367(a) CNOF, then (5) the
> § 1367(b) ouster, then (6) § 1367(c) discretion. …

Fixed at both ends, because either alone would have failed: the coach now puts one step
per line separated by newlines, and `.coaching-grid dd` gets `white-space: pre-line` so
those newlines survive into HTML instead of collapsing. Ordinary explanation stays in
paragraphs; only the steps break.

### Reviewers disagree about Erie — left unresolved on purpose

FC lists four topics the chain correctly treated as brain off. Three need nothing:

| FC's item | Status |
|---|---|
| SuppJ | Covered — the chain reached it through `Subject matter jurisdiction`, which is on the list |
| SIPJ | Already on the list as `Specific personal jurisdiction` |
| HCOL | Already on the list as `Horizontal choice of law` |
| **Erie** | **Removed in round 1, at HM's request** |

So FC approves of exactly the framing HM asked to be removed:

- **HM, round 1:** "Erie should not be labeled as 'brain off' in my opinion."
- **HM, round 3:** "AI's framing of Erie as 'brain off' underweights the amount of
  analysis involved (e.g., arguing both sides of the primary-conduct question)."
- **FC, round 8:** "Bot IDs strong Erie 'brain off' framework."

I have not changed the list. HM objected twice with a substantive reason; FC approved
once in passing, on a v4.6.0 run that predates the removal, and may simply be describing
output it liked rather than taking a position on the taxonomy. Adding Erie back on that
basis would silently reverse a reasoned instruction.

The current state is a defensible middle and should hold until Greiner rules: Erie is
**not** brain off, but `COURSE_CLARIFICATIONS` requires the chain to check for a live
Erie question on every answer and treats missing one as a severe defect. A regression
test now pins both halves together so neither drifts.

Note the same shape as open question 15 (SPJ), where HM worried the brain-off label
undersells and FC now approves it. Both are really one question: which topics are
genuinely mechanical, and which merely have a taught sequence?

### Changes made

- **Coach** — one step per line for any enumerated sequence.
- **Judge** — rewrites run-together "(1) … (2) …" sequences.
- **CSS** — `white-space: pre-line` on coaching-grid values.
- **Test** — pins Erie off the brain-off list *and* its always-check clarification on,
  so a future round cannot quietly restore one without the other.

84 tests total.

### Open questions for Greiner

Carried: 1–4, 6–18. New:

19. **Is Erie brain off?** HM says no, twice and with reasons; FC's aside suggests yes.
    Currently off the list with an always-check clarification. Bundle with question 15
    (SPJ) — the underlying question is which topics are mechanical versus merely
    sequenced.

---

## Validation run — v4.14.0 on the eight-fixture ladder (8/18/2026)

The first live output since v4.6.0. Same eight fixtures, same models
(`claude-opus-5` throughout), run blind exactly as before.

The result splits cleanly: **the writing and structure rules worked; the band fix
did not, and made accuracy slightly worse.**

### Writing and structure: landed

Measured over all eight runs, comparing like with like against the v4.6.0 output:

|  | v4.6.0 | v4.14.0 |
|---|---|---|
| improvement cards | 52 | 77 |
| cards carrying `questionRef` | **0 / 52** | **75 / 77** |
| emitted in exam order | no | **8 / 8 runs** |
| `exampleRevisionRef` placed | n/a | **8 / 8 runs** |
| banned phrases (`algorithm`, coined labels, `Twiqbal` card, cite-tagging, "prayer") | present | **0** |
| enumerated steps line-broken | 0 | 25 / 29 cards |
| median sentence | 25 words | **16 words** |
| longest sentence | 79 words | 65 words |
| sentences over 45 words | 41 (10.6%) | **10 (1.3%)** |

Ordering is the headline. v4.6.0 emitted `Q4 · Q2 · Q4 · Q4 · Q4 · Q1 · Q3 · craft · Q2`
with two of nine cards labelled; v4.14.0 emits ascending exam order in all eight runs,
with cross-cutting cards last. Strength cards carry `questionRef` 46/46.

Not perfect: 2 of 77 cards omitted `questionRef` (both in `2019-p`), 4 of 29 step lists
were not line-broken, and 10 sentences still run past 45 words. Those are compliance
gaps in a rule that is clearly biting, not failures of the rule.

**A measurement correction.** An interim check reported a 42-word maximum. That was
wrong — it measured only `whatHappened` and `whyItMatters`, omitting `howToImprove`,
and a naive period-split also treats a line-broken step list as one long sentence. The
table above splits on newlines first and covers all three fields. 65 words is the real
maximum.

### Bands: the round 4 fix failed, and cost a fixture

| fixture | actual | v4.6.0 | v4.14.0 | lean | Δ |
|---|---|---|---|---|---|
| 2015-ds | DS | H | H | high | −1 |
| 2015-h | H | P | P | solid | −1 |
| 2015-p | P | P | P | low | exact |
| 2015-lp | LP | P | P | low | +1 |
| 2019-ds | DS | H | H | low | −1 |
| 2019-h | H | **H** | **P** | high | −1 **(regressed)** |
| 2019-p | P | P | P | high | exact |
| 2019-lp | LP | LP | LP | solid | exact |

    exact match:  v4.6.0 4/8  →  v4.14.0 3/8
    predicted:    v4.6.0 {H:3, P:4, LP:1}  →  v4.14.0 {H:2, P:5, LP:1}
    actual:       {DS:2, H:2, P:2, LP:2}

**DS was still never predicted, 0 for 8.** Both DS answers came back H again.
Compression did not ease — it tightened, with P going from four predictions to five —
and `2019-h`, correct at v4.6.0, regressed from H to P.

The round 4 diagnosis (range compression) was right; the fix was aimed the wrong way.
Of the three band errors at v4.6.0, two were **under**-grades and one was an
over-grade, so the dominant failure was pushing answers down. Round 4 added an explicit
symmetric **downward** rule ("falling short of a reference does not let an answer keep
that reference's band") plus a weaker upward encouragement (3b, "all four bands are
live"). The downward half bit and the upward half did not, so the net effect was more
downward pressure on a system already grading too low. `2019-h` is the direct cost.

One genuine signal: `2015-lp`'s lean moved `high` → `low`, so it now sits at the bottom
of the band it picked. The rule reaches the within-band gradient but not the band
boundary.

### What this implies

Prompt wording is the wrong lever here. Eight rounds of instruction changes moved every
measurable prose and structure property and moved the band distribution the wrong way
by one fixture. The band is a comparative judgment against the reference answers in
`buildAnchorPack`, and that is where the next attempt belongs — the composition of the
anchor set, whether a DS anchor is present and recognisable, and how the pairwise
verdicts are elicited — not another paragraph telling the model to use the whole scale.

**Recommended before any further prompt work:**

1. **Revert or rework round 4's clause 3a** (`src/lib/prompts.ts`, the symmetric
   downward rule). It is the only change in eight rounds with measured negative effect.
   Clause 3b can stay; it is inert but harmless.
2. **Investigate the anchor pack for the DS case.** `gradedAnchorFixtures` excludes the
   fixture under review, so grading `2015-ds` pulls its DS anchor from another year and
   marks it "different year — calibrates band texture and can never override a same-exam
   ordering." That instruction may be telling the model to discount the only DS example
   it can see. This is a concrete, testable hypothesis and the best lead available.
3. Re-run the ladder after any band change. This validation cost about two hours
   wall-clock and is the only thing that distinguishes a real fix from a plausible one.

### Infrastructure notes from the run

- **`claude-opus-5` shed all large requests for ~62 minutes** (`overloaded_error`), while
  a 16-token request succeeded and `opus-4-8`/`sonnet-5` took the identical payload.
  Two full ladder attempts were lost to it.
- **`ANTHROPIC_WORK_MODEL` is broken for any non-opus-5 model.** `claude-opus-4-8`
  returns `400 — 'claude-opus-4-8' does not support the fallbacks parameter`, and
  `feedback-chain.ts` sends `fallbacks` unconditionally. The README documents this
  override. The refusal-fallback path is likely dead for the same reason. **Untouched.**
- **The stage retry ladder spans ~85s** but its own comment says overload episodes last
  minutes. Today's lasted an hour. A student hitting an overload at the judge stage
  loses 10–16 minutes of completed work and the tokens behind it. Worth fixing before
  students use this. **Untouched.**

---

## Validation run 2 — v4.15.0 (8/18/2026)

Two changes, both aimed at the DS problem, both from the recommendations above:
reverting round 4's clause 3a, and re-labelling a back-filled anchor as the sole
reference for its band (`anchors.ts`) with matching prompt language.

**Neither worked, and the run is the worst of the three by total error.**

| fixture | actual | v4.6.0 | v4.14.0 | v4.15.0 |
|---|---|---|---|---|
| 2015-ds | DS | H (−1) | H (−1) | H (−1) |
| 2015-h | H | P (−1) | P (−1) | P (−1) |
| 2015-p | P | P (0) | P (0) | P (0) |
| 2015-lp | LP | P (+1) | P (+1) | P (+1) |
| 2019-ds | DS | H (−1) | H (−1) | **P (−2)** |
| 2019-h | H | H (0) | P (−1) | **H (0)** |
| 2019-p | P | P (0) | P (0) | **H (+1)** |
| 2019-lp | LP | LP (0) | LP (0) | LP (0) |

    exact:        4/8      3/8      3/8
    total |err|:    4        5        6
    distribution: {H:3,P:4,LP:1}  {H:2,P:5,LP:1}  {H:3,P:4,LP:1}

DS remains **0 predictions in 24 fixture-runs across three versions.**

### The methodological finding, which matters more than either fix

Splitting the fixtures by stability across the three versions:

| | behaviour |
|---|---|
| **All four 2015 fixtures** | identical prediction in all three versions |
| **Three of four 2019 fixtures** | flipped: `2019-ds` H→H→P, `2019-h` H→P→H, `2019-p` P→P→H |

So there are two different phenomena being measured as one:

- **2015 errors are systematic.** Three wrong predictions, perfectly reproducible, and
  untouched by either intervention. These are the real target.
- **2019 errors are noise.** Run-to-run variation of ±1 band on the same input, same
  model, same fixture.

With n=1 per fixture per version and ±1 band of noise on half the stack, **the
experiment cannot detect a prompt effect.** The 4 → 5 → 6 progression in total error is
well inside that noise, which means it is not evidence that v4.15.0 is worse than
v4.6.0 — and, more importantly, the earlier conclusion that round 4's clause 3a caused
the `2019-h` regression is **not supported either**. `2019-h` flipped back to correct in
v4.15.0 without any change targeting it. That earlier attribution was over-read from a
single run, and the revert may have fixed nothing.

### The better hypothesis, from the run's own reasoning

Checking whether `whyNotHigher` reasons from a **reference answer** or from the abstract
**band definition**: all eight cite a reference, but three fall back on definition
language, including `2015-ds`, whose text is almost a quotation of the prompt:

> Not DS because canvassing is not sustained across **every weighted question**.

against a DS definition reading:

> DS (strongest) — canvassing, alternatives, and prioritization sustained across **every
> weighted question**

The absolute quantifier is a gate no real time-pressured answer passes — and the prompt
elsewhere concedes exactly that ("a high-performing timed answer may still contain
several identifiable errors, omissions, and imprecise statements"). On `2015-ds` the
model found the answer **stronger than the H reference on the heaviest question**, then
withheld DS on the definition rather than on the comparison.

That is a more precise hypothesis than either tested here. It is **not** being acted on
yet, for the reason in the next section.

### Recommendation: stop tuning, start measuring

Three versions and two hypotheses have produced no measurable movement, and the last
round shows the measurement itself cannot support the conclusions being drawn from it.
Further prompt edits are guessing with an hour of wall-clock per guess.

1. **Establish the noise floor.** Run the eight fixtures n=3–5 times at a single fixed
   version. That gives per-fixture variance and tells us which errors are systematic
   (the 2015 three) and what effect size is even detectable. Roughly 2–4 hours,
   parallelisable, and it makes every future comparison interpretable.
2. **Then test the definition hypothesis** ("every weighted question") against that
   baseline, changing one thing.
3. **Meanwhile, the writing and structure rules stand on their own evidence** — 0/52 →
   75/77 question-labelled, exam order 8/8, zero banned phrases, median sentence 25w →
   16w. Those did not depend on band accuracy and are not in question.
4. **Consider whether the band matters enough to keep tuning.** Students will not see it;
   it exists for human QA. A per-question coverage profile (already emitted, 0–4 per
   criterion) may serve QA better than a single noisy band.

---

## Validation run 3 — v4.17.0, and a correction to the whole DS analysis (8/2026)

Run after the calibration import took the graded stack from 8 answers across 2 years to
36 across 13. Eleven fixtures: the original 2015 and 2019 ladders, plus the 2021 ladder
as the first year graded against same-exam anchors that did not previously exist.

### The framing was wrong, and it was mine

Three prior entries in this log treat "DS was never predicted" as a defect and chase it
with prompt edits. The instructor's correction: **DS is genuinely awarded to roughly one
to four students out of eighty**, and no student is ever shown a band.

The benchmark is band-stratified — equal numbers of DS, H, P and LP — so DS is 25% of
the fixture set against roughly 2.5% of a real cohort. A chain that has correctly
internalised DS as scarce will therefore under-call it here **by construction**. The
prompt itself said bands are "curved within a cohort", so it was doing close to what it
was asked. "0 DS in 24 runs" was an artifact of the scoreboard, not evidence of a fault,
and rounds 4 and 5 of band tuning were chasing it.

### The measurement that settles it

Scoring pairwise ranking within each ladder instead of exact match:

| Ladder | Correct | **Inverted** | Tied |
|---|---|---|---|
| 2015 | 3 | **0** | 3 |
| 2019 | 3 | **0** | 3 |
| 2021 | 2 | **0** | 1 |
| **Total** | **8** | **0** | **7** |

**Zero inversions across fifteen comparable pairs.** The chain never once ranked a
weaker answer above a stronger one; every error is a tie. That is the signature of
correct perception with conservative cut-points, not of misreading quality.

Adding `bandLean` as a within-band tiebreaker takes ranking from 8 correct / 7 tied to
**9 correct / 6 tied** — the band alone discards a signal the chain already emits
correctly. On 2021 the DS/H tie resolves the right way (H-high above H-solid).

Exact match was 5/11 overall, 3/8 on the originals — indistinguishable from v4.6.0's
4/8 given the ±1 run-to-run noise measured in validation run 2.

Errors also run **both ways** (under: 2015-ds, 2015-h, 2019-ds, 2021-ds; over: 2015-lp,
2019-p), which is further evidence against a simple directional bias.

### The 2021 ladder

    2021-ds   DS -> H   (lean high)
    2021-h    H  -> H   (lean solid)
    2021-p    P  -> P   (lean high)

2/3 exact and correctly ordered once lean is counted — the cleanest ladder in the set,
and the first year graded against anchors that arrived with the 8/2026 import.

### Changes made (v4.17.0 → v4.18.0)

- **DS policy, on the instructor's decision.** The evaluation stage now awards the band
  the comparison supports, including DS, and is told explicitly not to reason "DS is
  rare, so probably not this one." Scarcity is a fact about how a class is curved, not a
  quota for a single answer, and the band never reaches a student — so an honest reading
  of the ceiling beats a defensive one. Guarded: DS still means meeting the DS reference.
- **Removed the nudge toward the extremes** ("Do not treat the middle of the scale as
  the safe answer"). It existed to counteract an artificial barrier that the anchor
  import has now removed, and it is pressure in the wrong direction on a scale where one
  end is genuinely rare.
- **Rank against the supplied references, not an imagined cohort.** The curve that
  produced the reference bands has already been applied; the chain locates one answer
  within it rather than re-running it.
- **`src/lib/band-ordering.ts`** (new) — ranking accuracy with `bandLean` as tiebreaker,
  never allowed to cross a band boundary, never comparing across ladders (bands are
  curved per cohort, so a 2015 H and a 2021 H are not the same claim). Inversions are
  reported individually; they are the defects worth chasing. Exact match is retained as
  a secondary figure with the caveat attached. Seven tests, including a reproduction of
  the figures above.
- **Post-hoc analyst** told to weigh an adjacent miss as threshold placement rather than
  misreading, and not to recommend a prompt change on that basis alone.

### Kept from validation run 2

The sole-reference anchor fix stays. It removed a genuine construction problem — grading
a DS fixture excluded the only same-exam DS answer and then labelled the substitute
discountable — which is right regardless of base rate. It is now largely moot anyway:
eleven more years have real same-exam DS references.

### For whoever reads this next

Do not reintroduce a DS-scarcity heuristic on the strength of a low DS count against
this benchmark. Check inversions first. A conservative cut-point on a stratified fixture
set is cheap; a ranking inversion is not.

---

## TA pilot corrections — v4.23.0–v4.24.0 (9/2026)

The live TA pilot produced two narrow substantive corrections and several presentation
changes. These are direct course-team instructions rather than inferences from model
behavior.

- **Smith–Grable:** the prompt now preserves the full ordered course checklist. It
  separates the prerequisites giving the court power to hear the state-law claim from
  the discretionary factors governing whether the federal forum should entertain it.
  Substantiality means importance to the particular case, not generalized importance.
- **Cohen and an avalanche of appeals:** Professor Greiner confirmed the student's
  formulation as a legitimate cross-cutting policy or “shadow” consideration. It helps
  explain why interlocutory review is construed narrowly; it is not a hard-and-fast
  Cohen element and is not independently dispositive.
- Student-facing bands and internal judge artifacts remain suppressed. Course citations
  now identify the material type and link to the exact retrieved excerpt used by the
  feedback, rather than presenting opaque titles such as “Day 9.”

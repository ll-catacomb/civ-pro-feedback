import { describe, expect, it } from "vitest";

import type { Evaluation } from "@/lib/types";

import { FeedbackSchema } from "@/lib/types";
import {
  ABBREVIATIONS,
  BRAIN_OFF_TOPICS,
  calibrationAnalysisDeveloperPrompt,
  COURSE_CLARIFICATIONS,
  COURSE_FORMULATIONS,
  GRADER_META_FEEDBACK,
  LAW_CHANGES,
  coachDeveloperPrompt,
  evaluationDeveloperPrompt,
  evaluationUserPrompt,
  GREINERISMS,
  judgeDeveloperPrompt,
  PROMPT_VERSION,
  queryExpansionDeveloperPrompt,
  rubricDeveloperPrompt,
  coachUserPrompt,
  rubricUserPrompt,
  sourceRerankDeveloperPrompt,
  submissionContext,
  submissionFitUserPrompt,
  submissionFitDeveloperPrompt,
  submissionFitJudgeDeveloperPrompt,
} from "@/lib/prompts";

const EMPTY_EVALUATION: Evaluation = {
  criteria: [],
  strengths: [],
  priorityGaps: [],
  provisionalBand: "P",
  bandRationale: "",
  whyNotHigher: "",
  whyNotLower: "",
  confidence: 0.5,
};

describe("prompt-chain invariants", () => {
  it("version-tags every persisted run", () => {
    expect(PROMPT_VERSION).toMatch(/^civpro-feedback-v\d+\.\d+\.\d+$/);
  });

  it("keeps the independent evaluation blind", () => {
    expect(evaluationDeveloperPrompt).toContain("actual instructor grade is intentionally withheld");
    expect(evaluationDeveloperPrompt).not.toContain("known grade:");
    expect(evaluationDeveloperPrompt).not.toMatch(/historical miss|directional bias/i);
  });

  it("uses the model answer as a non-exhaustive evaluation benchmark", () => {
    expect(evaluationDeveloperPrompt).toContain("non-exhaustive benchmark");
    expect(evaluationDeveloperPrompt).toContain("do not require near-perfection for DS or H");
    expect(evaluationUserPrompt({
      exam: "Exam",
      modelAnswer: "Model benchmark",
      answer: "Student answer",
      issueMap: { examOverview: "Overview", criteria: [], crossCuttingSkills: [], uncertaintyNotes: [] },
      sources: "Sources",
      anchors: "Reference pack",
      submission: submissionContext({ scope: "full_exam", mode: "full_draft" }),
    })).toContain("Reference pack");
  });

  it("keeps a strong answer in its reference's band with a lean instead of jumping", () => {
    expect(evaluationDeveloperPrompt).toContain("does not automatically jump a band");
    expect(evaluationDeveloperPrompt).toContain('bandLean "high"');
    expect(evaluationDeveloperPrompt).toContain("is a high H");
    expect(evaluationDeveloperPrompt).toContain('"solid" is the default');
    expect(evaluationDeveloperPrompt).not.toContain("never give an answer the same band as a reference it outperforms");
  });

  it("bands inside the evaluation with anchors and all four band definitions", () => {
    expect(evaluationDeveloperPrompt).toContain("DS (strongest)");
    expect(evaluationDeveloperPrompt).toContain("LP (weakest)");
    expect(evaluationDeveloperPrompt).toContain("band recommendation; there is no later calibration stage");
    expect(evaluationDeveloperPrompt).toContain("Banding is comparative, not absolute");
    expect(evaluationDeveloperPrompt).toContain("Graded reference answers");
    expect(evaluationDeveloperPrompt).toContain("as doctrinal authority");
    expect(evaluationDeveloperPrompt).toContain("wrong dispositive bottom lines");
    expect(evaluationDeveloperPrompt).toContain("whyNotHigher");
    expect(evaluationDeveloperPrompt).toContain("whyNotLower");
  });

  it("keeps quota and hedging language out of the model prompts", () => {
    expect(evaluationDeveloperPrompt).not.toMatch(/extraordinarily rare|one to three answers|choose the lower band/i);
  });

  it("preserves actual exam point allocations without normalization", () => {
    expect(rubricDeveloperPrompt).toContain("Never normalize them to 100");
    expect(rubricDeveloperPrompt).toContain("never invent subissue weights");
    expect(rubricDeveloperPrompt).toContain("set weight to null");
    expect(rubricDeveloperPrompt).toContain("qualitative only");
  });

  it("requires the judge to correct, not merely score, feedback", () => {
    expect(judgeDeveloperPrompt).toContain("corrected, publication-ready feedback object");
    expect(judgeDeveloperPrompt).toContain("inaccurate quotations");
  });

  it("makes a different-exam response a zero-credit intake failure", () => {
    expect(submissionFitDeveloperPrompt).toContain("responsiveness score of 0");
    expect(submissionFitDeveloperPrompt).toContain("zero-credit recommendation");
    expect(submissionFitJudgeDeveloperPrompt).toContain("recommendation to zero_credit");
    expect(submissionFitJudgeDeveloperPrompt).toContain("never give zero merely for weak legal analysis");
  });

  it("reranks evidence by doctrine and requires exact candidate IDs", () => {
    expect(sourceRerankDeveloperPrompt).toContain("Use only supplied source IDs");
    expect(sourceRerankDeveloperPrompt).toContain("Reject administrative instructions");
    expect(sourceRerankDeveloperPrompt).toContain("Cover every distinct high-weight issue");
    expect(sourceRerankDeveloperPrompt).toContain("up to 24 candidate course excerpts");
  });

  it("carries the course terminology conventions verbatim into the pre-judge and judge stages", () => {
    // Verbatim anchors from the instructor-supplied glossary.
    expect(GREINERISMS).toContain("Greiner Happy Court Rule");
    expect(GREINERISMS).toContain("imaginary lawsuit rule");
    expect(GREINERISMS).toContain('We just use the term “plausibility pleading,” not “Twiqbal.”');
    expect(GREINERISMS).toContain("we use the term arising under jurisdiction");
    for (const prompt of [evaluationDeveloperPrompt, coachDeveloperPrompt, judgeDeveloperPrompt]) {
      expect(prompt).toContain(GREINERISMS);
    }
  });

  it("coaches 'brain off' topics into the feedback and preserves the carve-out", () => {
    expect(BRAIN_OFF_TOPICS).toContain("Specific personal jurisdiction");
    expect(BRAIN_OFF_TOPICS).toContain("Interlocutory appeals checklist");
    // The one topic that is explicitly NOT fully brain off must survive verbatim.
    expect(BRAIN_OFF_TOPICS).toContain("substantiality and the discretionary factors require judgment");
    expect(coachDeveloperPrompt).toContain(BRAIN_OFF_TOPICS);
    expect(coachDeveloperPrompt).toContain("turn their brain off");
    // The judge must not strip brain-off coaching, but does not carry the list.
    expect(judgeDeveloperPrompt).toContain('do not strike the phrase "brain off"');
  });

  it("folds recurring grader meta-feedback into the coaching stage", () => {
    expect(GRADER_META_FEEDBACK).toContain("Apply law to facts");
    expect(GRADER_META_FEEDBACK).toContain("Avoid conclusory sentences.");
    expect(GRADER_META_FEEDBACK).toContain("support both sides of an issue");
    expect(coachDeveloperPrompt).toContain(GRADER_META_FEEDBACK);
    expect(coachDeveloperPrompt).toContain("never as generic advice");
  });

  it("overrides stale course materials with the instructor's law-change corrections", () => {
    expect(LAW_CHANGES).toContain("12(b)(6) and 8(a)(2) materials before 2009 are unreliable");
    expect(LAW_CHANGES).toContain("section 1391, effective 2012");
    expect(LAW_CHANGES).toContain("single-plaintiff-multiple-defendant");
    // The corrections ride on SHARED_POLICY, so every doctrinal stage inherits them.
    for (const prompt of [rubricDeveloperPrompt, evaluationDeveloperPrompt, coachDeveloperPrompt, judgeDeveloperPrompt]) {
      expect(prompt).toContain(LAW_CHANGES);
      expect(prompt).toContain("only sanctioned departure from the closed source set");
    }
  });

  it("carries the student abbreviation key into every answer-reading stage", () => {
    expect(ABBREVIATIONS).toContain("NMOCE");
    expect(ABBREVIATIONS).toContain("HCOL");
    expect(ABBREVIATIONS).toContain("JAMOL");
    for (const prompt of [evaluationDeveloperPrompt, coachDeveloperPrompt, judgeDeveloperPrompt]) {
      expect(prompt).toContain(ABBREVIATIONS);
    }
  });

  // Locks the corrections from the 8/2026 instructor review of the 2015 P run.
  // Each assertion corresponds to a defect reviewers found in v4.6.0 output.
  it("drops Erie from the brain-off list and stops advising compression", () => {
    // Erie is heavily weighted and drilled; labeling it brain off led the coach
    // to tell a student to run it in "three or four tight sentences."
    expect(BRAIN_OFF_TOPICS).not.toMatch(/^\* Erie$/m);
    expect(coachDeveloperPrompt).toContain("Match the size of the fix to the weight of the question");
    // Round 2 qualified this: space for a weighted framework is still owed, but
    // the feedback must name a cut rather than ask for a longer answer.
    expect(coachDeveloperPrompt).toContain("never by asking for a longer answer overall");
  });

  it("names intersystem preclusion and JAMOL as the course's terms", () => {
    expect(GREINERISMS).toContain("the course term is intersystem preclusion");
    expect(GREINERISMS).toContain("what law supplies the preclusive effect of a federal judgment");
    expect(GREINERISMS).toContain("the abbreviation to use is JAMOL");
    // JNOV is the disfavored term, so it may appear only as a negative entry.
    expect(GREINERISMS).toContain("JNOV is the superseded pre-1991 term");
  });

  it("retires Reeves along with the other withdrawn course material", () => {
    expect(LAW_CHANGES).toContain("*Reeves* is no longer part of our course");
  });

  it("binds the closed source set to prescriptions, not just assertions", () => {
    for (const prompt of [evaluationDeveloperPrompt, coachDeveloperPrompt, judgeDeveloperPrompt]) {
      expect(prompt).toContain("The closed source set binds what you PRESCRIBE");
    }
    expect(judgeDeveloperPrompt).toContain("A prescription to cite outside authority is an unsupported assertion");
  });

  it("uses student exemplars invisibly rather than citing them as authority", () => {
    expect(sourceRerankDeveloperPrompt).toContain("Past student exemplars may be selected");
    for (const prompt of [evaluationDeveloperPrompt, coachDeveloperPrompt, judgeDeveloperPrompt]) {
      expect(prompt).toContain("may silently inform writing, organization, prioritization, or compression");
      expect(prompt).toContain("never place its source ID in a student-facing sourceIds field");
    }
  });

  it("requires plain, single-idea, per-question student-facing prose", () => {
    expect(coachDeveloperPrompt).toContain("One idea per sentence");
    expect(coachDeveloperPrompt).toContain("Never coin a label for a doctrine");
    expect(coachDeveloperPrompt).toContain('Never use the word "algorithm" in student-facing text');
    expect(coachDeveloperPrompt).toContain("list the elements");
    expect(coachDeveloperPrompt).toContain("Each improvement addresses exactly one question");
    // The judge is the backstop; without enforcement the coach drifts back.
    expect(judgeDeveloperPrompt).toContain("One idea per sentence");
    expect(judgeDeveloperPrompt).toContain("No coined terms of art");
    expect(judgeDeveloperPrompt).toContain("Each improvement stays inside a single exam question");
  });

  it("treats bare threshold conclusions and unapplied law as evaluation defects", () => {
    expect(evaluationDeveloperPrompt).toContain("asserted as a bare conclusion");
    expect(evaluationDeveloperPrompt).toContain("is an omission of that analysis, not coverage of it");
    expect(evaluationDeveloperPrompt).toContain("A test recited but never applied");
    expect(evaluationDeveloperPrompt).toContain("Reserve coverage 3 or 4");
  });

  // Locks the corrections from the 8/2026 instructor review of the 2015 DS run.
  it("organizes student-facing feedback by question rather than by priority", () => {
    expect(coachDeveloperPrompt).toContain("Organize by question, not by priority");
    expect(coachDeveloperPrompt).toContain("Emit strengths and improvements in exam order");
    expect(coachDeveloperPrompt).toContain("Set questionRef on every strength and every improvement");
    expect(coachDeveloperPrompt).toContain("Within each question, order improvements high, then medium, then low");
    expect(judgeDeveloperPrompt).toContain("question groups run in exam order, not global priority order");
    // A pre-v4.8.0 run has no questionRef, so the field must stay optional.
    const legacy = FeedbackSchema.shape.improvements.element.shape.questionRef;
    expect(legacy.safeParse(undefined).success).toBe(true);
  });

  it("keeps additions inside the exam's word budget", () => {
    expect(coachDeveloperPrompt).toContain("Pair every addition with a cut");
    expect(coachDeveloperPrompt).toContain("Never recommend added exposition on its own");
    expect(judgeDeveloperPrompt).toContain("names the passage that can be shortened to make room for it");
    expect(coachDeveloperPrompt).not.toMatch(/pay for/i);
    expect(judgeDeveloperPrompt).not.toMatch(/pay for/i);
  });

  it("keeps the Smith-Grable power and discretion inquiries separate", () => {
    expect(COURSE_CLARIFICATIONS).toContain("Well-pleaded federal cause of action (Mottley)");
    expect(COURSE_CLARIFICATIONS).toContain("Does the state-law claim contain an embedded federal issue?");
    expect(COURSE_CLARIFICATIONS).toContain("Is that issue substantial to this case");
    expect(COURSE_CLARIFICATIONS).toContain("Is the federal issue disputed or likely to be disputed?");
    expect(COURSE_CLARIFICATIONS).toContain("separately ask whether the federal court should exercise that power");
    expect(COURSE_CLARIFICATIONS).toContain("Merrell Dow; Moore");
    expect(COURSE_CLARIFICATIONS).toContain("predominantly law or fact");
    expect(COURSE_CLARIFICATIONS).toContain("Congress's failure to create a federal cause of action");
  });

  it("treats an avalanche of appeals as Cohen policy rather than a formal element", () => {
    expect(COURSE_CLARIFICATIONS).toContain("sometimes described in the course as a shadow or stealth factor");
    expect(COURSE_CLARIFICATIONS).toContain("not a hard-and-fast element of the Cohen test");
    expect(COURSE_CLARIFICATIONS).toContain("less likely to accept an interlocutory appeal");
    expect(COURSE_CLARIFICATIONS).toContain("flood the appellate system with piecemeal review");
  });

  it("refuses to spend an improvement slot on disfavored vocabulary", () => {
    expect(coachDeveloperPrompt).toContain("Never give one its own improvement card");
    expect(coachDeveloperPrompt).toContain("A disfavored term costs no credit");
    expect(judgeDeveloperPrompt).toContain("No card whose subject is disfavored terminology");
  });

  it("surfaces missing authority instead of burying it in secondary notes", () => {
    expect(evaluationDeveloperPrompt).toContain("Run an explicit authority check on every criterion");
    expect(evaluationDeveloperPrompt).toContain("not filed among secondary omissions");
    expect(coachDeveloperPrompt).toContain("Carry forward the authority gaps the evaluation identified");
  });

  it("walks the course's taught sequences and its expected formulations", () => {
    expect(coachDeveloperPrompt).toContain("Keep claim preclusion and issue preclusion visibly separate");
    expect(coachDeveloperPrompt).toContain("Name 1367 by number");
    expect(COURSE_FORMULATIONS).toContain('"abridge, enlarge or modify"');
    expect(COURSE_FORMULATIONS).toContain('Under Sibbach, a FRCP is valid if it "really regulates procedure."');
    expect(COURSE_FORMULATIONS).toContain("procedural rules use the law of the forum state");
    for (const prompt of [evaluationDeveloperPrompt, coachDeveloperPrompt]) {
      expect(prompt).toContain(COURSE_FORMULATIONS);
    }
  });

  it("bans invented shorthand and answer-summarizing prose", () => {
    expect(coachDeveloperPrompt).toContain("Never invent an abbreviation");
    expect(coachDeveloperPrompt).toContain("Analyze, do not summarize");
    expect(judgeDeveloperPrompt).toContain("No invented abbreviations or coined shorthand");
    expect(judgeDeveloperPrompt).toContain("Cut sentences that only restate what the student wrote");
  });

  // Locks the corrections from the 8/2026 instructor review of the 2015 H run.
  it("resolves the Rule 50 finality posture instead of reporting source conflict", () => {
    expect(COURSE_CLARIFICATIONS).toContain("Denial of a PRE-VERDICT Rule 50 motion is not a final order");
    expect(COURSE_CLARIFICATIONS).toContain("Denial of a POST-JUDGMENT Rule 50 motion is a final order");
    expect(COURSE_CLARIFICATIONS).toContain("Do not report this as unresolved tension in the materials");
    for (const prompt of [evaluationDeveloperPrompt, coachDeveloperPrompt]) {
      expect(prompt).toContain(COURSE_CLARIFICATIONS);
    }
  });

  it("keeps Erie salient without calling it mechanical", () => {
    expect(COURSE_CLARIFICATIONS).toContain("appeared on nearly every exam");
    expect(COURSE_CLARIFICATIONS).toContain("Failing to spot a live Erie question is a severe defect");
    // Round 1 struck Erie from brain-off; this must not quietly reinstate it.
    expect(COURSE_CLARIFICATIONS).toContain("never be described as a topic to be run without judgment");
    expect(BRAIN_OFF_TOPICS).not.toMatch(/^\* Erie$/m);
  });

  it("distinguishes an incomplete framing from a wrong one", () => {
    expect(evaluationDeveloperPrompt).toContain("Separate an incomplete framing from a wrong one");
    expect(evaluationDeveloperPrompt).toContain("Reserve rule_error for a statement that is actually incorrect");
    expect(judgeDeveloperPrompt).toContain("No criticism that overstates the defect");
  });

  it("treats organization as substantive and names record text by number", () => {
    expect(coachDeveloperPrompt).toContain("Treat organization as a substantive improvement");
    expect(coachDeveloperPrompt).toContain("a roadmap or thesis at the top");
    expect(coachDeveloperPrompt).toContain('"strike paragraph 8 as conclusory"');
    expect(judgeDeveloperPrompt).toContain("names it by number");
  });

  // Locks the corrections from the 8/2026 instructor review of the 2015 LP run.
  // Across the nine v4.6.0 fixtures the chain never once predicted DS (both actual
  // DS answers came back H) and predicted P for five of nine, while over-grading
  // the 2015 LP to P. These assertions guard the symmetry that was missing.
  // The v4.14.0 validation measured round 4's symmetric downward rule as a net
  // negative: exact matches fell 4/8 -> 3/8, P predictions rose 4 -> 5, and
  // 2019-h regressed from a correct H to P. Two of three band errors were
  // UNDER-grades, so adding downward pressure pushed the wrong way. The clause
  // was removed in v4.15.0; these assertions keep it from creeping back.
  // Round 4 added blanket downward pressure and measured worse; v4.18.0 removed
  // the opposite nudge too. Scarcity is a fact about how a class is curved, not
  // a quota to apply to a single answer, and the band never reaches a student.
  it("awards the band the comparison supports without a scarcity discount", () => {
    expect(evaluationDeveloperPrompt).not.toContain("That rule is symmetric");
    expect(evaluationDeveloperPrompt).not.toContain("Falling short of a reference does not let an answer keep that reference's band");
    // The nudge toward the extremes is gone: with real anchors for thirteen
    // years there is no artificial barrier left for it to counteract.
    expect(evaluationDeveloperPrompt).not.toContain("Do not treat the middle of the scale as the safe answer");
    expect(evaluationDeveloperPrompt).toContain("Award the band the comparison supports, including DS");
    expect(evaluationDeveloperPrompt).toContain('Do not reason "DS is rare, so probably not this one."');
    expect(evaluationDeveloperPrompt).toContain("Nothing here is a transcript grade");
    // Still not licence to inflate.
    expect(evaluationDeveloperPrompt).toContain("DS still means meeting the DS reference");
    expect(evaluationDeveloperPrompt).toContain("Grade the analysis, not the surface");
    // The pre-existing anti-over-grading rule must survive the rewrite.
    expect(evaluationDeveloperPrompt).toContain("does not automatically jump a band");
  });

  it("ranks against the supplied references, not an imagined cohort", () => {
    expect(evaluationDeveloperPrompt).toContain("not against an imagined cohort");
    expect(evaluationDeveloperPrompt).toContain("The curve that produced their bands has already been applied");
    // The post-hoc analyst must not read a conservative cut-point as a misread.
    expect(calibrationAnalysisDeveloperPrompt).toContain("The benchmark is band-stratified");
    expect(calibrationAnalysisDeveloperPrompt).toContain("threshold placement rather than a misreading");
  });

  it("treats a sole-reference anchor as a full comparator", () => {
    expect(evaluationDeveloperPrompt).toContain('a reference marked "sole reference for <band>" is different in kind');
    expect(evaluationDeveloperPrompt).toContain("that reference IS the band");
    expect(evaluationDeveloperPrompt).toContain("Never withhold a band on the ground that its only reference came from another year");
    // The weaker discount must still apply to ordinary cross-year references.
    expect(evaluationDeveloperPrompt).toContain("does not override a same-exam ordering");
  });

  it("refuses to let fluent prose stand in for analysis", () => {
    // v4.15.0 moved this guard out of the removed clause 3a and into 3b, where
    // it shapes the comparison without adding blanket downward band pressure.
    expect(evaluationDeveloperPrompt).toContain("are not by themselves performance");
    // Round 6 reworked the opening to allow praise first (KC asked for it) while
    // keeping round 4's guard against praise that is unearned or about the prose.
    expect(coachDeveloperPrompt).toContain("praise that is vague, unearned, or about the writing rather than the analysis");
    expect(coachDeveloperPrompt).toContain("Never open by complimenting the writing when the substance failed");
    expect(coachDeveloperPrompt).toContain("Do not manufacture a strength to balance the page");
    expect(judgeDeveloperPrompt).toContain("Praise must match the evaluation's findings");
  });

  it("carries Greiner's two permitted forms for a rule statement", () => {
    expect(COURSE_CLARIFICATIONS).toContain("A full CRUPAC-style rule statement is usually too wordy");
    expect(COURSE_CLARIFICATIONS).toContain("Never ask a student to do both");
    expect(judgeDeveloperPrompt).toContain('No instruction to "state the rule" that does not say which of the two permitted forms');
  });

  it("does not treat presentation order or misread text as a defect", () => {
    expect(evaluationDeveloperPrompt).toContain("Order of presentation is not a defect");
    expect(evaluationDeveloperPrompt).toContain("Characterize the answer exactly");
  });

  // Locks the corrections from the 8/2026 review of the 2019 DS run.
  it("treats a correct citation as the explanation, not a gap", () => {
    expect(evaluationDeveloperPrompt).toContain("A correct citation IS the explanation");
    expect(evaluationDeveloperPrompt).toContain("never expect a parenthetical");
    expect(judgeDeveloperPrompt).toContain("No complaint about a bare or untagged citation");
    // This must not contradict the standing grader note that citing cuts words.
    expect(GRADER_META_FEEDBACK).toContain("Cite cases and statutes when possible to reduce verboseness");
  });

  it("treats compression as correct technique", () => {
    expect(evaluationDeveloperPrompt).toContain("Compression is correct technique here");
    expect(evaluationDeveloperPrompt).toContain("Sentence fragments");
    expect(judgeDeveloperPrompt).toContain("No criticism of compression");
  });

  it("keeps the feedback itself short and free of invented labels", () => {
    expect(coachDeveloperPrompt).toContain("Write less");
    expect(coachDeveloperPrompt).toContain("Cut sentences that carry no information");
    expect(coachDeveloperPrompt).toContain("Never invent an evaluative label");
    expect(coachDeveloperPrompt).toContain("Earn every card");
    expect(judgeDeveloperPrompt).toContain("No invented evaluative labels");
    expect(judgeDeveloperPrompt).toContain("Write the whole thing shorter than the draft");
  });

  it("places the example revision beside the question it rewrites", () => {
    expect(coachDeveloperPrompt).toContain("Set exampleRevisionRef to the questionRef");
    expect(coachDeveloperPrompt).toContain("Set exampleRevisionTarget to the exact label");
    expect(judgeDeveloperPrompt).toContain("exampleRevisionRef and exampleRevisionTarget");
    const ref = FeedbackSchema.shape.exampleRevisionRef;
    const target = FeedbackSchema.shape.exampleRevisionTarget;
    expect(ref.safeParse(undefined).success).toBe(true);
    expect(ref.safeParse("Question 1").success).toBe(true);
    expect(target.safeParse(undefined).success).toBe(true);
    expect(target.safeParse("Personal jurisdiction analysis").success).toBe(true);
  });

  it("keeps internal bands and scores out of student-facing feedback", () => {
    expect(coachDeveloperPrompt).toContain("Never expose them in student-facing feedback");
    expect(coachDeveloperPrompt).toContain('"P rather than H"');
    expect(judgeDeveloperPrompt).toContain("Internal calibration bands and scores are never student-facing");
  });

  it("never uses a disfavored term in its own voice", () => {
    expect(coachDeveloperPrompt).toContain("Never use a disfavored term in your own voice");
  });

  // Locks the corrections from the 8/2026 review of the 2019 H run. The pleading
  // item had recurred in four of five prior rounds as a wording rule; round 6
  // promotes it to an explicit taught sequence.
  it("works 12(b)(6) at the paragraph-and-element level", () => {
    expect(COURSE_FORMULATIONS).toContain("Plausibility pleading — the taught sequence");
    expect(COURSE_FORMULATIONS).toContain("Identify the conclusory allegations by paragraph number");
    expect(COURSE_FORMULATIONS).toContain('"Strike the conclusory allegations" is not usable advice');
    expect(coachDeveloperPrompt).toContain("Work the complaint paragraph by paragraph against the elements");
    expect(judgeDeveloperPrompt).toContain("Every 12(b)(6) instruction names paragraphs and elements");
  });

  it("does not grade the exam document or the student's abbreviation variant", () => {
    expect(evaluationDeveloperPrompt).toContain("Do not grade the exam document");
    expect(evaluationDeveloperPrompt).toContain("never describe noticing one as points available");
    expect(evaluationDeveloperPrompt).toContain("Abbreviation variants are not errors");
    expect(evaluationDeveloperPrompt).toContain("ONMCE and NMOCE");
    expect(judgeDeveloperPrompt).toContain("No card, clause, or revision-plan step about an abbreviation variant");
    expect(judgeDeveloperPrompt).toContain("No claim that a student lost points for failing to flag a typo");
  });

  // Locks the corrections from the 8/2026 review of the 2019 LP run.
  it("opens on a real strength without softening the verdict", () => {
    expect(coachDeveloperPrompt).toContain("Open with something the student genuinely did well");
    expect(coachDeveloperPrompt).toContain("That order is right even on a failing answer");
    expect(coachDeveloperPrompt).toContain("The honest assessment lands in the same opening paragraph");
    // Round 4's guard against unearned praise must survive the reordering.
    expect(coachDeveloperPrompt).toContain("Never open by complimenting the writing when the substance failed");
    expect(coachDeveloperPrompt).toContain("Do not manufacture a strength to balance the page");
  });

  it("expects a full pleading analysis when the pleading is supplied", () => {
    expect(COURSE_FORMULATIONS).toContain("When the exam hands you the whole pleading");
    expect(COURSE_FORMULATIONS).toContain("treat skipping it as a major omission");
  });

  it("carries the numerosity band and keeps policy answers in frame", () => {
    expect(COURSE_FORMULATIONS).toContain("Roughly forty or more members satisfies it");
    expect(COURSE_FORMULATIONS).toContain("a small amount in controversy per member supports certification");
    expect(COURSE_FORMULATIONS).toContain("A policy question is answered inside this course's frame");
    expect(COURSE_FORMULATIONS).toContain("Access to justice is a recurring theme");
  });

  it("keeps grader names and legal jargon out of student-facing text", () => {
    for (const prompt of [evaluationDeveloperPrompt, coachDeveloperPrompt, judgeDeveloperPrompt]) {
      expect(prompt).toContain("Never name a grader, teaching fellow, instructor, or commenter in student-facing text");
      expect(prompt).toContain('Write "the request for damages" rather than "the prayer"');
    }
  });

  // Locks the correction from the 8/2026 review of the 2019 P run.
  it("breaks enumerated sequences onto separate lines", () => {
    expect(coachDeveloperPrompt).toContain("Put each step of a sequence on its own line");
    expect(coachDeveloperPrompt).toContain("Ordinary explanation stays in paragraphs; only the steps break");
    expect(judgeDeveloperPrompt).toContain("Every enumerated sequence is line-broken, one step per line");
  });

  // Reviewers disagree about Erie. HM objected twice, with reasons; FC approved
  // the framing once in passing on a run that predates the removal. Pending a
  // ruling, Erie stays off the list but keeps its always-check clarification.
  it("holds the Erie brain-off line pending an instructor ruling", () => {
    expect(BRAIN_OFF_TOPICS).not.toMatch(/^\* Erie$/m);
    expect(COURSE_CLARIFICATIONS).toContain("Always check whether the facts raise an Erie");
    // The topics FC named as correctly brain off must stay on the list.
    expect(BRAIN_OFF_TOPICS).toContain("Specific personal jurisdiction");
    expect(BRAIN_OFF_TOPICS).toContain("Horizontal choice of law");
    expect(BRAIN_OFF_TOPICS).toContain("Subject matter jurisdiction");
  });

  // A single-question submission graded against a whole-exam issue map reads as
  // five missing questions, which is the LP failure reviewers warned about.
  describe("submission scope and mode", () => {
    it("puts every other question out of scope for a single-question submission", () => {
      const brief = submissionContext({ scope: "single_question", mode: "full_draft", questionRef: "Question 3" });
      expect(brief).toContain("Question 3 ONLY");
      expect(brief).toContain("Grade only Question 3");
      expect(brief).toContain("never affect the assessment");
      expect(brief).not.toContain("Every scored question is in scope");
    });

    it("keeps the whole exam in scope by default", () => {
      const brief = submissionContext({ scope: "full_exam", mode: "full_draft" });
      expect(brief).toContain("Every scored question is in scope");
      expect(brief).not.toMatch(/ONLY/);
    });

    it("protects a bullet-point version from being graded on prose", () => {
      const brief = submissionContext({ scope: "full_exam", mode: "bullet_points" });
      expect(brief).toContain("submitted in note form on purpose");
      expect(brief).toContain("Do not mark it down for fragments");
      expect(brief).toContain("Prose quality is not assessable here");
      // But an outline still has to reason.
      expect(brief).toContain("exactly as conclusory as a sentence that does the same");
    });

    it("assesses prose only on a written-out draft", () => {
      expect(submissionContext({ scope: "full_exam", mode: "full_draft" }))
        .toContain("prose, organisation, and signposting are fair to assess");
    });

    it("stops the intake gate failing a narrower submission", () => {
      expect(submissionFitDeveloperPrompt).toContain("never for work that is simply narrower than the whole paper");
      expect(submissionFitDeveloperPrompt).toContain("Judge questionCoverage against the submitted question only");
      // The local match signal is whole-exam, so it under-reads by construction.
      expect(submissionFitJudgeDeveloperPrompt).toContain("it will read as thin coverage by construction");
    });

    it("carries the brief into every stage that reads the answer", () => {
      const brief = "SCOPE-BRIEF-SENTINEL";
      expect(submissionFitUserPrompt({ exam: "e", answer: "a", submission: brief })).toContain(brief);
      expect(rubricUserPrompt({ exam: "e", modelAnswer: "m", sources: "s", submission: brief })).toContain(brief);
      expect(coachUserPrompt({
        answer: "a",
        issueMap: { examOverview: "o", criteria: [], crossCuttingSkills: [], uncertaintyNotes: [] },
        evaluation: EMPTY_EVALUATION,
        sources: "s",
        submission: brief,
      })).toContain(brief);
    });
  });

  it("expands the retrieval query without inventing authority", () => {
    expect(queryExpansionDeveloperPrompt).toContain("Never invent a case name, statute, or doctrine");
    expect(queryExpansionDeveloperPrompt).toContain("Emit search terms, not sentences");
    expect(queryExpansionDeveloperPrompt).toContain("bare numeric form");
    expect(queryExpansionDeveloperPrompt).toContain("including ones they got wrong");
  });
});

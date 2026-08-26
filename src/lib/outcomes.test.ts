import { describe, expect, it } from "vitest";

import {
  getAssessmentOutcome,
  getAveragedCalibrationDistance,
  getBandEstimateExplanation,
  getFinalFeedback,
  getFormativeBandEstimate,
  formativeRangeIncludesActual,
  isUnreviewedDraft,
  isBandComparable,
  bandSuppressionReason,
  getFormativeBandScore,
} from "@/lib/outcomes";
import type { FeedbackRun } from "@/lib/types";

function legacyRun(bandRationale: string): FeedbackRun {
  return {
    evaluation: {
      criteria: [{ criterionId: "Q1", coverage: 0, finding: "Absent", answerEvidence: "", sourceIds: [], errorType: "omission" }],
      strengths: [],
      priorityGaps: [],
      provisionalBand: "LP",
      bandRationale,
      whyNotHigher: "The answer is materially deficient.",
      whyNotLower: "Already the lowest band.",
      confidence: 0.99,
    },
  } as unknown as FeedbackRun;
}

describe("assessment outcome migration", () => {
  it("converts a legacy all-zero different-exam run to zero credit", () => {
    expect(getAssessmentOutcome(legacyRun("The submission answers a different examination.")))
      .toMatchObject({ creditStatus: "zero_nonresponsive", score: 0 });
  });

  it("does not convert a merely incorrect answer to zero credit", () => {
    expect(getAssessmentOutcome(legacyRun("The response attempted the assigned question but omitted the governing rule.")))
      .toMatchObject({ creditStatus: "evaluated", score: null });
  });
});

describe("final feedback selection", () => {
  it("uses the dual decision feedback when cross-model judging completed", () => {
    const run = {
      judge: { feedback: { headline: "OpenAI" } },
      dualDecision: { finalFeedback: { headline: "Cross-model final" } },
    } as unknown as FeedbackRun;
    expect(getFinalFeedback(run)?.headline).toBe("Cross-model final");
  });

  it("falls back to the single-chain judge feedback", () => {
    const run = {
      judge: { feedback: { headline: "Single-chain final" } },
    } as unknown as FeedbackRun;
    expect(getFinalFeedback(run)?.headline).toBe("Single-chain final");
  });
});

describe("band estimate explanation", () => {
  it("does not describe a failed cross-judge as a band disagreement", () => {
    const run = {
      dualDecision: {
        finalBand: "H",
        bandsAgreed: false,
      },
      crossJudges: {
        openaiOnClaude: { finalBand: "H" },
      },
    } as unknown as FeedbackRun;
    const explanation = getBandEstimateExplanation(run);
    expect(explanation).toContain("Only the OpenAI cross-model judge completed");
    expect(explanation).not.toContain("different bands");
    expect(explanation).not.toContain("average");
  });

  it("foregrounds the averaged range while preserving fractional calibration distance", () => {
    const run = {
      actualGrade: "H",
      predictedGrade: "P",
      calibrationDistance: 1,
      dualDecision: {
        finalBand: "P",
        hedgedBand: "P–H",
        bandScore: 2.5,
      },
    } as unknown as FeedbackRun;
    expect(getFormativeBandEstimate(run)).toBe("P–H");
    expect(getAveragedCalibrationDistance(run)).toBe(0.5);
    expect(formativeRangeIncludesActual(run)).toBe(true);
  });

  it("uses the hard estimate for a legacy single-model run", () => {
    const run = {
      actualGrade: "DS",
      predictedGrade: "H",
      calibrationDistance: 1,
    } as unknown as FeedbackRun;
    expect(getFormativeBandEstimate(run)).toBe("H");
    expect(getAveragedCalibrationDistance(run)).toBe(1);
    expect(formativeRangeIncludesActual(run)).toBe(false);
  });

  it("renders the evaluator's within-band lean as a shoulder flag", () => {
    const high = {
      actualGrade: "DS",
      predictedGrade: "H",
      calibrationDistance: 1,
      evaluation: { bandLean: "high" },
    } as unknown as FeedbackRun;
    expect(getFormativeBandEstimate(high)).toBe("H+");
    expect(getAveragedCalibrationDistance(high)).toBe(0.75);
    expect(getBandEstimateExplanation(high)).toContain("higher end of the H band");

    const solid = {
      predictedGrade: "P",
      evaluation: { bandLean: "solid" },
    } as unknown as FeedbackRun;
    expect(getFormativeBandEstimate(solid)).toBe("P");
    expect(getBandEstimateExplanation(solid)).toBeUndefined();
  });
});

describe("empty-judge recovery", () => {
  const improvements = (n: number) => Array.from({ length: n }, (_, i) => ({
    priority: "high" as const, label: `i${i}`, whatHappened: "", whyItMatters: "",
    howToImprove: "", sourceIds: [] as string[],
  }));
  const feedback = (n: number, strengths = 0) => ({
    headline: "h", overview: "o", revisionPlan: [] as string[], exampleRevision: "", closing: "",
    strengths: Array.from({ length: strengths }, (_, i) => ({
      label: `s${i}`, detail: "", answerExcerpt: "", sourceIds: [] as string[],
    })),
    improvements: improvements(n),
  });

  // Observed 8/2026: the judge declared a draft "unsafe to publish", emitted an
  // object with every array empty, and the student would have seen a blank page
  // while the coach's draft held 13 improvements and 6 strengths.
  function runWith(judged: ReturnType<typeof feedback> | undefined, draft?: ReturnType<typeof feedback>) {
    return {
      judge: judged
        ? { approved: false, qualityScore: 70, checks: {}, findings: [], feedback: judged }
        : undefined,
      draftFeedback: draft,
    } as unknown as FeedbackRun;
  }

  it("falls back to the draft when the judge returns an empty object", () => {
    const run = runWith(feedback(0), feedback(13, 6));
    expect(getFinalFeedback(run)?.improvements).toHaveLength(13);
    expect(getFinalFeedback(run)?.headline).toBe("h");
    expect(isUnreviewedDraft(run)).toBe(true);
  });

  it("prefers the judge whenever it returned anything usable", () => {
    const run = runWith(feedback(2), feedback(13));
    expect(getFinalFeedback(run)?.improvements).toHaveLength(2);
    expect(isUnreviewedDraft(run)).toBe(false);
  });

  it("does not claim an unreviewed draft when both are empty", () => {
    expect(isUnreviewedDraft(runWith(feedback(0), feedback(0)))).toBe(false);
  });

  it("counts strengths-only feedback as content", () => {
    // A judge that cut every improvement but kept a strength has still spoken.
    expect(isUnreviewedDraft(runWith(feedback(0, 1), feedback(13)))).toBe(false);
  });
});

describe("band comparability", () => {
  // Every graded reference is a complete prose answer to a whole final. A
  // submission that is none of those cannot be placed on that scale — observed
  // 8/2026 ranking an 850-word assignment outline against 3,000-word finals and
  // returning a confident LP, which then flipped to P on an identical re-run.
  const run = (patch: Partial<FeedbackRun>) => ({
    examId: "2019-final", predictedGrade: "H", actualGrade: "DS",
    evaluation: { bandLean: "solid" },
    ...patch,
  }) as unknown as FeedbackRun;

  it("bands an ordinary whole-exam prose submission", () => {
    const r = run({});
    expect(isBandComparable(r)).toBe(true);
    expect(getFormativeBandEstimate(r)).toBe("H");
    expect(bandSuppressionReason(r)).toBeUndefined();
  });

  it.each([
    ["an assignment", { examId: "2014-assignment-03" }, /different assessment/i],
    ["an outline", { mode: "bullet_points" }, /format rather than the analysis/i],
    ["a single question", { scope: "single_question" }, /whole exam/i],
  ])("withholds the band for %s and says why", (_label, patch, reason) => {
    const r = run(patch as Partial<FeedbackRun>);
    expect(isBandComparable(r)).toBe(false);
    expect(getFormativeBandEstimate(r)).toBeUndefined();
    expect(getFormativeBandScore(r)).toBeUndefined();
    // And it must not pollute the QA metric with an incommensurable distance.
    expect(getAveragedCalibrationDistance(r)).toBeUndefined();
    expect(bandSuppressionReason(r)).toMatch(reason);
  });

  it("treats a run persisted before scope/mode existed as comparable", () => {
    // Pre-v4.16.0 the only accepted submission was full-exam prose.
    const legacy = { examId: "2015-final", predictedGrade: "P" } as unknown as FeedbackRun;
    expect(isBandComparable(legacy)).toBe(true);
    expect(getFormativeBandEstimate(legacy)).toBe("P");
  });
});

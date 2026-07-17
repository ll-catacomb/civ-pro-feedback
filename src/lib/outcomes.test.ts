import { describe, expect, it } from "vitest";

import {
  getAssessmentOutcome,
  getAveragedCalibrationDistance,
  getBandEstimateExplanation,
  getFinalFeedback,
  getFormativeBandEstimate,
  formativeRangeIncludesActual,
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

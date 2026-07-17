import { describe, expect, it } from "vitest";

import {
  BandAssessmentSchema,
  CalibrationAnalysisSchema,
  FeedbackRequestSchema,
  FeedbackSchema,
  GradeBandSchema,
  IssueMapSchema,
  EvaluationSchema,
} from "@/lib/types";

describe("feedback contracts", () => {
  it("accepts the four instructor bands in order of use", () => {
    expect(["DS", "H", "P", "LP"].map((band) => GradeBandSchema.parse(band)))
      .toEqual(["DS", "H", "P", "LP"]);
  });

  it("rejects undersized student submissions", () => {
    expect(() => FeedbackRequestSchema.parse({ examId: "2015-final", answer: "too short" }))
      .toThrow();
  });

  it("accepts submissions beyond the former character cap", () => {
    const answer = "Civil procedure analysis. ".repeat(2_000);
    expect(FeedbackRequestSchema.parse({ examId: "2019-final", answer }).answer)
      .toHaveLength(answer.length);
  });

  it("accepts the correctly matched 2014 final", () => {
    expect(FeedbackRequestSchema.parse({ examId: "2014-final", answer: "Analysis ".repeat(20) }).examId)
      .toBe("2014-final");
  });

  it("preserves explicit exam points and permits unallocated criteria", () => {
    const issueMap = IssueMapSchema.parse({
      examOverview: "Overview",
      criteria: [{
        id: "q1",
        label: "Question 1",
        weight: 25,
        expectedAnalysis: ["Minimum contacts"],
        commonFailures: [],
        authoritySourceIds: ["C-1"],
      }, {
        id: "policy",
        label: "Unallocated policy question",
        weight: null,
        expectedAnalysis: [],
        commonFailures: [],
        authoritySourceIds: [],
      }],
      crossCuttingSkills: [],
      uncertaintyNotes: [],
    });
    expect(issueMap.criteria.map((criterion) => criterion.weight)).toEqual([25, null]);
  });

  it("rejects negative exam point allocations", () => {
    expect(() => IssueMapSchema.parse({
      examOverview: "Overview",
      criteria: [{
        id: "pj",
        label: "Personal jurisdiction",
        weight: -1,
        expectedAnalysis: ["Minimum contacts"],
        commonFailures: [],
        authoritySourceIds: ["C-1"],
      }],
      crossCuttingSkills: [],
      uncertaintyNotes: [],
    })).toThrow();
  });

  it("requires two-sided boundary analysis in the evaluation", () => {
    expect(EvaluationSchema.parse({
      criteria: [],
      strengths: ["Strong application"],
      priorityGaps: ["One central omission"],
      provisionalBand: "H",
      bandRationale: "Strong overall performance.",
      whyNotHigher: "The central omission prevents DS.",
      whyNotLower: "Sustained analysis exceeds P.",
      confidence: 0.8,
    })).toMatchObject({ provisionalBand: "H", whyNotHigher: "The central omission prevents DS." });
  });

  it("requires actionable fields in final feedback", () => {
    expect(() => FeedbackSchema.parse({ headline: "Incomplete" })).toThrow();
  });

  it("keeps post-hoc calibration evidence explicitly labeled", () => {
    expect(CalibrationAnalysisSchema.parse({
      evidenceBasis: "grade_only",
      gradeAgreement: "exact",
      summary: "The band matched; no narrative comments were supplied.",
      alignedFindings: [],
      missedFindings: [],
      unsupportedOrOverstatedFindings: [],
      promptRecommendations: [],
    }).evidenceBasis).toBe("grade_only");
  });

  it("requires a bounded, two-sided blind band assessment", () => {
    expect(BandAssessmentSchema.parse({
      recommendedBand: "H",
      dimensions: { issueCoverage: 3, doctrinalAccuracy: 3, applicationDepth: 3, prioritization: 4, examExecution: 3 },
      decisiveStrengths: ["Strong application"],
      decisiveWeaknesses: ["One central omission"],
      evaluatorCorrections: [],
      whyNotHigher: "The omission prevents DS.",
      whyNotLower: "Sustained analysis exceeds P.",
      rationale: "Strong overall performance.",
      confidence: 0.8,
    }).recommendedBand).toBe("H");
  });
});

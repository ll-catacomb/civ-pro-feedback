import { describe, expect, it } from "vitest";

import {
  evaluationDeveloperPrompt,
  evaluationUserPrompt,
  judgeDeveloperPrompt,
  PROMPT_VERSION,
  rubricDeveloperPrompt,
  sourceRerankDeveloperPrompt,
  submissionFitDeveloperPrompt,
  submissionFitJudgeDeveloperPrompt,
} from "@/lib/prompts";

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
});

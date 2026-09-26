import { describe, expect, it } from "vitest";

import { resolveFeedbackModels } from "@/lib/feedback-models";

describe("feedback model tiers", () => {
  it("defaults supporting work to US Sonnet 5 and decisions to US Opus 5.5", () => {
    expect(resolveFeedbackModels({})).toEqual({
      fast: "us.anthropic.claude-sonnet-5",
      work: "us.anthropic.claude-sonnet-5",
      evaluator: "us.anthropic.claude-opus-5-5",
      judge: "us.anthropic.claude-opus-5-5",
    });
  });

  it("accepts an explicit model for every tier", () => {
    expect(resolveFeedbackModels({
      HUIT_BEDROCK_FAST_MODEL: "fast-model",
      HUIT_BEDROCK_WORK_MODEL: "work-model",
      HUIT_BEDROCK_EVALUATOR_MODEL: "evaluation-model",
      HUIT_BEDROCK_JUDGE_MODEL: "judge-model",
    })).toEqual({
      fast: "fast-model",
      work: "work-model",
      evaluator: "evaluation-model",
      judge: "judge-model",
    });
  });
});

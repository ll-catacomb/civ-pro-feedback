import { describe, expect, it } from "vitest";

import { formatFeedbackForCopy } from "./student-feedback-export";
import type { Feedback } from "./types";

const feedback: Feedback = {
  headline: "A useful headline",
  overview: "The overview.",
  strengths: [{
    label: "A sound move",
    detail: "You applied the rule to the key fact.",
    answerExcerpt: "the quoted answer",
    sourceIds: [],
    questionRef: "Question 1",
  }],
  improvements: [{
    priority: "high",
    label: "Finish the checklist",
    answerExcerpt: "The court should dismiss.",
    whatHappened: "One step was missing.",
    whyItMatters: "The conclusion depends on it.",
    howToImprove: "Add that step and shorten the repeated rule.",
    sourceIds: [],
    questionRef: "Question 2",
  }],
  revisionPlan: ["Revise Question 2."],
  exampleRevision: "A stronger analytical move.",
  exampleRevisionRef: "Question 2",
  exampleRevisionTarget: "Finish the checklist",
  closing: "Keep practicing.",
};

describe("student feedback export", () => {
  it("formats every student-facing section for pasting into Google Docs", () => {
    const exported = formatFeedbackForCopy(feedback);
    expect(exported).toContain("WHAT IS WORKING\n\nQuestion 1\nA sound move");
    expect(exported).toContain("HIGH: Finish the checklist");
    expect(exported).toContain("From your answer: “The court should dismiss.”");
    expect(exported).toContain("Example of a stronger move: A stronger analytical move.");
    expect(exported).toContain("REVISION PLAN\n1. Revise Question 2.");
    expect(exported).not.toContain("undefined");
  });

  it("retains the example when a legacy target cannot be matched", () => {
    const exported = formatFeedbackForCopy({
      ...feedback,
      exampleRevisionTarget: "An old card label",
    });
    expect(exported.match(/Example of a stronger move/g)).toHaveLength(1);
  });
});

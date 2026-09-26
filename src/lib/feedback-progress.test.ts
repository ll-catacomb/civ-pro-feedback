import { describe, expect, it } from "vitest";

import {
  FEEDBACK_PROGRESS_STAGES,
  STUDENT_PROGRESS_STEPS,
  STUDENT_PROGRESS_STEP_COUNT,
  describeFeedbackProgress,
} from "@/lib/feedback-progress";

describe("student feedback progress", () => {
  it("maps every internal stage to one of six honest student-facing steps", () => {
    for (const stage of FEEDBACK_PROGRESS_STAGES) {
      const progress = describeFeedbackProgress(stage);
      expect(progress.label).not.toBe("");
      expect(progress.detail).not.toBe("");
      expect(progress.position).toBeGreaterThanOrEqual(1);
      expect(progress.position).toBeLessThanOrEqual(STUDENT_PROGRESS_STEP_COUNT);
    }
  });

  it("groups the two intake and two retrieval calls without exposing implementation detail", () => {
    expect(describeFeedbackProgress("submission_fit").position)
      .toBe(describeFeedbackProgress("submission_fit_judge").position);
    expect(describeFeedbackProgress("retrieval_query").position)
      .toBe(describeFeedbackProgress("retrieval_rerank").position);
  });

  it("provides one explanatory entry for every student-facing step", () => {
    expect(STUDENT_PROGRESS_STEPS).toHaveLength(STUDENT_PROGRESS_STEP_COUNT);
    expect(STUDENT_PROGRESS_STEPS.map((step) => step.position))
      .toEqual([1, 2, 3, 4, 5, 6]);
    for (const step of STUDENT_PROGRESS_STEPS) {
      expect(step.label.length).toBeGreaterThan(10);
      expect(step.detail.length).toBeGreaterThan(40);
    }
  });
});

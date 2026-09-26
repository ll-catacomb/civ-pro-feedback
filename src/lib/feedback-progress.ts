export const FEEDBACK_PROGRESS_STAGES = [
  "submission_fit",
  "submission_fit_judge",
  "issue_map",
  "retrieval_query",
  "retrieval_rerank",
  "blind_evaluation",
  "feedback_draft",
  "judge_and_revise",
  "complete",
] as const;

export type FeedbackProgressStage = typeof FEEDBACK_PROGRESS_STAGES[number];

export const STUDENT_PROGRESS_STEPS = [
  {
    position: 1,
    label: "Confirm the selected material",
    detail: "Two intake checks compare your response with the exam or assignment you selected. This prevents feedback on the wrong questions.",
  },
  {
    position: 2,
    label: "Build the evaluation map",
    detail: "The exam and instructor materials are organized into an issue-by-issue map of the analysis the response should address.",
  },
  {
    position: 3,
    label: "Find supporting course sources",
    detail: "Relevant course terminology and excerpts are retrieved, then ranked so later comments can be grounded in the assigned materials.",
  },
  {
    position: 4,
    label: "Evaluate the response",
    detail: "Your answer is compared with the issue map, course sources, and calibrated examples to identify strengths, omissions, and analytical gaps.",
  },
  {
    position: 5,
    label: "Draft actionable feedback",
    detail: "The evaluation is translated into specific priorities, explanations, and a concrete revision plan rather than a score alone.",
  },
  {
    position: 6,
    label: "Check and revise the result",
    detail: "A final review checks doctrinal support, answer-specific evidence, consistency, and usefulness before releasing the feedback.",
  },
] as const;

const STUDENT_PROGRESS: Record<FeedbackProgressStage, { label: string; detail: string; position: number }> = {
  submission_fit: {
    label: "Checking the selected material",
    detail: "Confirming that the response matches the exam or assignment you chose.",
    position: 1,
  },
  submission_fit_judge: {
    label: "Checking the selected material",
    detail: "A second pass is reviewing the match before substantive feedback begins.",
    position: 1,
  },
  issue_map: {
    label: "Preparing the evaluation criteria",
    detail: "Organizing the issues and analytical tasks the response should address.",
    position: 2,
  },
  retrieval_query: {
    label: "Finding relevant course materials",
    detail: "Translating the issues into the terminology used in the course materials.",
    position: 3,
  },
  retrieval_rerank: {
    label: "Finding relevant course materials",
    detail: "Selecting the most useful course excerpts for this response.",
    position: 3,
  },
  blind_evaluation: {
    label: "Analyzing the response",
    detail: "Comparing the response with the course criteria and calibrated examples.",
    position: 4,
  },
  feedback_draft: {
    label: "Writing feedback",
    detail: "Turning the evaluation into specific revision guidance.",
    position: 5,
  },
  judge_and_revise: {
    label: "Performing the accuracy check",
    detail: "Reviewing the draft for doctrinal accuracy, support, and usefulness.",
    position: 6,
  },
  complete: {
    label: "Feedback ready",
    detail: "The completed feedback has been saved to your submission history.",
    position: 6,
  },
};

export const STUDENT_PROGRESS_STEP_COUNT = STUDENT_PROGRESS_STEPS.length;

export function describeFeedbackProgress(stage: FeedbackProgressStage) {
  return STUDENT_PROGRESS[stage];
}

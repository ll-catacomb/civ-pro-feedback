import type { Feedback } from "@/lib/types";

function questionLabel(questionRef?: string, crossCutting?: boolean): string {
  return !crossCutting && questionRef ? questionRef : "Across the whole exam";
}

export function formatFeedbackForCopy(feedback: Feedback): string {
  const lines = [feedback.headline, "", feedback.overview, "", "WHAT IS WORKING"];

  for (const strength of feedback.strengths) {
    lines.push("", questionLabel(strength.questionRef, strength.crossCutting), strength.label, strength.detail);
    if (strength.answerExcerpt) lines.push(`From your answer: “${strength.answerExcerpt}”`);
  }

  lines.push("", "WHAT TO WORK ON");
  let exampleIncluded = false;
  for (const improvement of feedback.improvements) {
    lines.push(
      "",
      questionLabel(improvement.questionRef, improvement.crossCutting),
      `${improvement.priority.toUpperCase()}: ${improvement.label}`,
      `What happened: ${improvement.whatHappened}`,
      `Why it matters: ${improvement.whyItMatters}`,
      `Try this next: ${improvement.howToImprove}`,
    );
    if (feedback.exampleRevisionTarget === improvement.label
      && feedback.exampleRevisionRef === improvement.questionRef) {
      lines.push(`Example of a stronger move: ${feedback.exampleRevision}`);
      exampleIncluded = true;
    }
  }

  lines.push("", "REVISION PLAN");
  feedback.revisionPlan.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  if (!exampleIncluded) {
    lines.push("", `Example of a stronger move: ${feedback.exampleRevision}`);
  }
  if (feedback.closing) lines.push("", feedback.closing);
  lines.push("", "AI-generated practice feedback — not an official assessment or legal advice.");
  return lines.join("\n");
}

import type { SubmissionMode, SubmissionScope } from "@/lib/types";

export type SubmissionPreflightInput = {
  answer: string;
  examPrompt: string;
  mode: SubmissionMode;
  scope: SubmissionScope;
  examQuestionCount: number;
};

export type SubmissionPreflightResult =
  | { ok: true }
  | { ok: false; reason: "copied_prompt" | "too_brief" | "repetitive"; message: string };

const WORD_PATTERN = /[\p{L}\p{N}§]+/gu;
const SHINGLE_SIZE = 5;

function words(value: string): string[] {
  return (value.normalize("NFKC").toLocaleLowerCase("en-US").match(WORD_PATTERN) ?? [])
    .filter((word) => word.length > 0);
}

function shingles(tokens: string[]): string[] {
  if (tokens.length < SHINGLE_SIZE) return [];
  return Array.from(
    { length: tokens.length - SHINGLE_SIZE + 1 },
    (_, index) => tokens.slice(index, index + SHINGLE_SIZE).join(" "),
  );
}

/**
 * Reject only inexpensive, high-confidence submission accidents before an
 * attempt is reserved. Substantive responsiveness remains the model intake
 * gate's job: this check must allow bad law, terse issue spotting, and bullets.
 */
export function assessSubmissionPreflight(input: SubmissionPreflightInput): SubmissionPreflightResult {
  const answerWords = words(input.answer);
  const promptWords = words(input.examPrompt);

  // Exact prompt prose produces a dense run of matching five-word phrases.
  // Ordinary answers can repeat party names and legal vocabulary without
  // approaching this threshold.
  const answerShingles = shingles(answerWords);
  if (answerShingles.length >= 8) {
    const promptShingles = new Set(shingles(promptWords));
    const copied = answerShingles.filter((shingle) => promptShingles.has(shingle)).length;
    if (copied / answerShingles.length >= 0.72) {
      return {
        ok: false,
        reason: "copied_prompt",
        message: "This looks like text copied from the exam question rather than your answer. Please paste your own analysis. No attempt was used.",
      };
    }
  }

  // A whole multi-question prose exam needs more material than a single
  // question or outline. These floors remain deliberately low: they catch an
  // accidental fragment, not a weak or incomplete answer.
  const minimumWords = input.scope === "single_question"
    || input.mode === "bullet_points"
    || input.examQuestionCount <= 1
    ? 25
    : 50;
  if (answerWords.length < minimumWords) {
    return {
      ok: false,
      reason: "too_brief",
      message: `This submission appears too brief to evaluate (${answerWords.length} words). Please check that you pasted the complete ${input.scope === "single_question" ? "answer" : "practice response"}. No attempt was used.`,
    };
  }

  // Repeated placeholder text can clear a character minimum while containing
  // no reviewable work. Keep the ratio lenient for outlines that legitimately
  // repeat rule names and party names.
  if (answerWords.length >= 30 && new Set(answerWords).size / answerWords.length < 0.18) {
    return {
      ok: false,
      reason: "repetitive",
      message: "This submission appears to contain repeated placeholder text. Please check that you pasted your complete answer. No attempt was used.",
    };
  }

  return { ok: true };
}

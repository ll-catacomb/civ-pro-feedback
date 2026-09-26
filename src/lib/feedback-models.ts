import "server-only";

export type FeedbackModelTier = {
  fast: string;
  work: string;
  evaluator: string;
  judge: string;
};

export function resolveFeedbackModels(
  environment: Record<string, string | undefined> = process.env,
): FeedbackModelTier {
  const fast = environment.HUIT_BEDROCK_FAST_MODEL ?? "us.anthropic.claude-sonnet-5";
  const evaluator = environment.HUIT_BEDROCK_EVALUATOR_MODEL
    ?? "us.anthropic.claude-opus-5-5";
  return {
    fast,
    work: environment.HUIT_BEDROCK_WORK_MODEL ?? fast,
    evaluator,
    judge: environment.HUIT_BEDROCK_JUDGE_MODEL ?? evaluator,
  };
}

export const FEEDBACK_MODELS = resolveFeedbackModels();

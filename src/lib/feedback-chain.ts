import "server-only";

import { createHash, randomUUID } from "node:crypto";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

import { buildAnchorPack } from "@/lib/anchors";
import { gradeDistance } from "@/lib/calibration";
import { formatExamMatches, rankExamMatches } from "@/lib/exam-match";
import { getExam } from "@/lib/exams";
import {
  coachDeveloperPrompt,
  coachUserPrompt,
  evaluationDeveloperPrompt,
  evaluationUserPrompt,
  judgeDeveloperPrompt,
  judgeUserPrompt,
  PROMPT_VERSION,
  rubricDeveloperPrompt,
  rubricUserPrompt,
  sourceRerankDeveloperPrompt,
  sourceRerankUserPrompt,
  submissionFitDeveloperPrompt,
  submissionFitJudgeDeveloperPrompt,
  submissionFitJudgeUserPrompt,
  submissionFitUserPrompt,
} from "@/lib/prompts";
import { formatSources, retrieveCourseContext } from "@/lib/retrieval";
import {
  EvaluationSchema,
  FeedbackSchema,
  IssueMapSchema,
  JudgeSchema,
  SourceRerankSchema,
  SubmissionFitAssessmentSchema,
  SubmissionFitJudgeSchema,
  type FeedbackRequestSchema,
  type FeedbackRun,
  type StageTrace,
} from "@/lib/types";

export type ChainInput = z.infer<typeof FeedbackRequestSchema> & {
  source?: "student" | "calibration";
  calibrationId?: string;
};

export type FeedbackIntake = {
  startedAt: number;
  exam: ReturnType<typeof getExam>;
  safetyIdentifier: string;
  submissionFit: z.infer<typeof SubmissionFitAssessmentSchema>;
  submissionFitJudge: z.infer<typeof SubmissionFitJudgeSchema>;
  traces: StageTrace[];
};

type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

const WORK_MODEL = process.env.ANTHROPIC_WORK_MODEL ?? "claude-opus-4-8";
const JUDGE_MODEL = process.env.ANTHROPIC_JUDGE_MODEL ?? "claude-opus-4-8";
const RETRIEVAL_CANDIDATE_LIMIT = 48;
const FINAL_SOURCE_LIMIT = 24;

export class FeedbackConfigurationError extends Error {}

export function describeStageCause(cause: unknown): string {
  if (!(cause instanceof Error)) return "";
  const apiError = cause as Error & { status?: number; requestID?: string | null };
  const parts = [cause.message];
  if (typeof apiError.status === "number") parts.push(`status ${apiError.status}`);
  if (apiError.requestID) parts.push(`request ${apiError.requestID}`);
  return ` Cause: ${parts.join(" | ")}`;
}

export class FeedbackStageError extends Error {
  constructor(public readonly stageName: string, cause: unknown) {
    super(`The ${stageName} stage failed.${describeStageCause(cause)}`, { cause });
    this.name = "FeedbackStageError";
  }
}

export function stableSafetyIdentifier(label: string): string {
  return createHash("sha256")
    .update(`${process.env.SAFETY_IDENTIFIER_SALT ?? "civpro-local"}:${label}`)
    .digest("hex")
    .slice(0, 48);
}

function hashInput(examId: string, answer: string): string {
  return createHash("sha256")
    .update(`${PROMPT_VERSION}\n${examId}\n${answer}`)
    .digest("hex");
}

export function chainConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function createChainClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 });
}

// Overload (529) errors usually arrive mid-stream, after the HTTP 200, so the
// SDK's own maxRetries never fires; this stage-level ladder is the real retry
// path. Overload episodes last minutes, so the delays escalate instead of
// hammering the same window, with jitter so parallel fixtures desynchronize.
const STAGE_RETRY_DELAYS_MS = [5_000, 20_000, 60_000];
const STAGE_RETRY_JITTER_MS = 5_000;

function isNonRetryable(error: unknown): boolean {
  return error instanceof Anthropic.APIError
    && typeof error.status === "number"
    && [400, 401, 403, 404, 413].includes(error.status);
}

async function attemptClaudeStage<T>(input: {
  client: Anthropic;
  schema: z.ZodType<T>;
  stageName: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  developerPrompt: string;
  userPrompt: string;
  safetyIdentifier?: string;
  traces: StageTrace[];
}): Promise<T> {
  const startedAt = Date.now();
  // Streamed with generous headroom: adaptive thinking plus the nested
  // feedback JSON regularly exceeds 15K output tokens on judge stages.
  const response = await input.client.messages.stream({
    model: input.model,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    system: input.developerPrompt,
    messages: [{ role: "user", content: input.userPrompt }],
    ...(input.safetyIdentifier ? { metadata: { user_id: input.safetyIdentifier } } : {}),
    output_config: {
      effort: input.reasoningEffort,
      format: zodOutputFormat(input.schema),
    },
  }).finalMessage();
  if (response.stop_reason === "max_tokens") {
    throw new Error("Output truncated at max_tokens before the structured object completed.");
  }
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
  if (!text) {
    throw new Error("The response contained no structured output text.");
  }
  const parsed = input.schema.parse(JSON.parse(text));

  input.traces.push({
    name: input.stageName,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    durationMs: Date.now() - startedAt,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    responseId: response.id,
  });
  return parsed;
}

export async function parseClaudeStage<T>(input: Parameters<typeof attemptClaudeStage<T>>[0]): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= STAGE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await attemptClaudeStage(input);
    } catch (error) {
      if (isNonRetryable(error)) {
        throw new FeedbackStageError(input.stageName, error);
      }
      lastError = error;
      if (attempt < STAGE_RETRY_DELAYS_MS.length) {
        const delayMs = STAGE_RETRY_DELAYS_MS[attempt] + Math.floor(Math.random() * STAGE_RETRY_JITTER_MS);
        const cause = error instanceof Error ? error.message.slice(0, 160) : "unknown error";
        console.warn(`${input.stageName} failed (attempt ${attempt + 1}/${STAGE_RETRY_DELAYS_MS.length + 1}); retrying in ${Math.round(delayMs / 1000)}s. ${cause}`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw new FeedbackStageError(input.stageName, lastError);
}

export async function runFeedbackIntake(input: ChainInput): Promise<FeedbackIntake> {
  if (!chainConfigured()) {
    throw new FeedbackConfigurationError(
      "ANTHROPIC_API_KEY is not configured. Add it to .env.local before running feedback.",
    );
  }

  const startedAt = Date.now();
  const exam = getExam(input.examId);
  const traces: StageTrace[] = [];
  const client = createChainClient();
  const safetyIdentifier = stableSafetyIdentifier(input.studentLabel);
  const localExamMatches = rankExamMatches(input.answer, exam.promptPath);

  const submissionFit = await parseClaudeStage({
    client,
    schema: SubmissionFitAssessmentSchema,
    stageName: "submission_fit",
    model: WORK_MODEL,
    reasoningEffort: "high",
    developerPrompt: submissionFitDeveloperPrompt,
    userPrompt: submissionFitUserPrompt({ exam: exam.prompt, answer: input.answer }),
    safetyIdentifier,
    traces,
  });

  const submissionFitJudge = await parseClaudeStage({
    client,
    schema: SubmissionFitJudgeSchema,
    stageName: "submission_fit_judge",
    model: JUDGE_MODEL,
    reasoningEffort: "high",
    developerPrompt: submissionFitJudgeDeveloperPrompt,
    userPrompt: submissionFitJudgeUserPrompt({
      exam: exam.prompt,
      answer: input.answer,
      firstPass: submissionFit,
      localExamMatches: formatExamMatches(localExamMatches),
    }),
    safetyIdentifier,
    traces,
  });

  return {
    startedAt,
    exam,
    safetyIdentifier,
    submissionFit,
    submissionFitJudge,
    traces,
  };
}

export async function runFeedbackChain(
  input: ChainInput,
  preparedIntake?: FeedbackIntake,
): Promise<FeedbackRun> {
  const intake = preparedIntake ?? await runFeedbackIntake(input);
  const {
    startedAt,
    exam,
    safetyIdentifier,
    submissionFit,
    submissionFitJudge,
    traces,
  } = intake;
  const client = createChainClient();

  const zeroCredit =
    submissionFit.status === "nonresponsive"
    && submissionFit.recommendation === "zero_credit"
    && submissionFit.responsivenessScore === 0
    && submissionFit.confidence >= 0.9
    && submissionFitJudge.status === "nonresponsive"
    && submissionFitJudge.recommendation === "zero_credit"
    && submissionFitJudge.responsivenessScore === 0
    && submissionFitJudge.confidence >= 0.9;

  if (zeroCredit) {
    return {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      source: input.source ?? "student",
      calibrationId: input.calibrationId,
      examId: exam.id,
      examTitle: exam.title,
      studentLabel: input.studentLabel,
      answer: input.answer,
      actualGrade: input.actualGrade,
      promptVersion: PROMPT_VERSION,
      inputHash: hashInput(exam.id, input.answer),
      submissionFit,
      submissionFitJudge,
      assessmentOutcome: {
        creditStatus: "zero_nonresponsive",
        score: 0,
        rationale: submissionFitJudge.rationale,
      },
      sources: [],
      traces,
      totalDurationMs: Date.now() - startedAt,
      pipeline: "single",
    };
  }

  const issueMap = await parseClaudeStage({
    client,
    schema: IssueMapSchema,
    stageName: "issue_map",
    model: WORK_MODEL,
    reasoningEffort: "medium",
    developerPrompt: rubricDeveloperPrompt,
    userPrompt: rubricUserPrompt({
      exam: exam.prompt,
      modelAnswer: exam.modelAnswer,
      sources: "Additional course sources are retrieved after the issue map is built. Use the exam and instructor model answer for this stage.",
    }),
    safetyIdentifier,
    traces,
  });

  const retrievalCandidates = await retrieveCourseContext(
    { issueMap, answer: input.answer },
    RETRIEVAL_CANDIDATE_LIMIT,
  );
  let sources = retrievalCandidates.slice(0, FINAL_SOURCE_LIMIT);
  if (retrievalCandidates.length > 0) {
    try {
      const rerank = await parseClaudeStage({
        client,
        schema: SourceRerankSchema,
        stageName: "retrieval_rerank",
        model: WORK_MODEL,
        reasoningEffort: "low",
        developerPrompt: sourceRerankDeveloperPrompt,
        userPrompt: sourceRerankUserPrompt({
          issueMap,
          answer: input.answer,
          candidates: formatSources(retrievalCandidates),
        }),
        safetyIdentifier,
        traces,
      });
      const candidateById = new Map(retrievalCandidates.map((source) => [source.id, source]));
      const selectedIds = new Set<string>();
      const selected = rerank.selections.flatMap((selection) => {
        const source = candidateById.get(selection.sourceId);
        if (!source || selectedIds.has(selection.sourceId)) return [];
        selectedIds.add(selection.sourceId);
        return [{
          ...source,
          rerankRelevance: selection.relevance,
          rerankReason: selection.reason,
        }];
      });
      sources = [
        ...selected,
        ...retrievalCandidates.filter((source) => !selectedIds.has(source.id)),
      ].slice(0, FINAL_SOURCE_LIMIT);
    } catch {
      console.warn("Source reranking failed; using hybrid retrieval order for this run.");
    }
  }
  const formattedSources = formatSources(sources);

  const evaluation = await parseClaudeStage({
    client,
    schema: EvaluationSchema,
    stageName: "blind_evaluation",
    model: WORK_MODEL,
    reasoningEffort: "high",
    developerPrompt: evaluationDeveloperPrompt,
    userPrompt: evaluationUserPrompt({
      exam: exam.prompt,
      modelAnswer: exam.modelAnswer,
      answer: input.answer,
      issueMap,
      sources: formattedSources,
      anchors: buildAnchorPack(exam.id, input.calibrationId),
    }),
    safetyIdentifier,
    traces,
  });

  const draftFeedback = await parseClaudeStage({
    client,
    schema: FeedbackSchema,
    stageName: "feedback_draft",
    model: WORK_MODEL,
    reasoningEffort: "medium",
    developerPrompt: coachDeveloperPrompt,
    userPrompt: coachUserPrompt({ answer: input.answer, issueMap, evaluation, sources: formattedSources }),
    safetyIdentifier,
    traces,
  });

  const judge = await parseClaudeStage({
    client,
    schema: JudgeSchema,
    stageName: "judge_and_revise",
    model: JUDGE_MODEL,
    reasoningEffort: "high",
    developerPrompt: judgeDeveloperPrompt,
    userPrompt: judgeUserPrompt({
      exam: exam.prompt,
      modelAnswer: exam.modelAnswer,
      answer: input.answer,
      issueMap,
      evaluation,
      draft: draftFeedback,
      sources: formattedSources,
    }),
    safetyIdentifier,
    traces,
  });

  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    source: input.source ?? "student",
    calibrationId: input.calibrationId,
    examId: exam.id,
    examTitle: exam.title,
    studentLabel: input.studentLabel,
    answer: input.answer,
    actualGrade: input.actualGrade,
    predictedGrade: evaluation.provisionalBand,
    calibrationDistance: input.actualGrade
      ? gradeDistance(evaluation.provisionalBand, input.actualGrade)
      : undefined,
    promptVersion: PROMPT_VERSION,
    inputHash: hashInput(exam.id, input.answer),
    submissionFit,
    submissionFitJudge,
    assessmentOutcome: {
      creditStatus: submissionFitJudge.status === "uncertain"
        || submissionFitJudge.recommendation === "manual_review"
        || !submissionFitJudge.agreesWithFirstPass
        ? "manual_review"
        : "evaluated",
      score: null,
      rationale: submissionFitJudge.rationale,
    },
    issueMap,
    evaluation,
    draftFeedback,
    judge,
    sources,
    traces,
    totalDurationMs: Date.now() - startedAt,
    pipeline: "single",
  };
}

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
  queryExpansionDeveloperPrompt,
  queryExpansionUserPrompt,
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
  RetrievalQuerySchema,
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

const WORK_MODEL = process.env.ANTHROPIC_WORK_MODEL ?? "claude-opus-5";
const JUDGE_MODEL = process.env.ANTHROPIC_JUDGE_MODEL ?? "claude-opus-5";
// Used only when a safety classifier declines a request; see attemptClaudeStage.
const FALLBACK_MODEL = process.env.ANTHROPIC_FALLBACK_MODEL ?? "claude-opus-4-8";
const RETRIEVAL_CANDIDATE_LIMIT = 48;
const FINAL_SOURCE_LIMIT = 24;

export class FeedbackConfigurationError extends Error {}

/** Raised for failures that cannot be cleared by retrying the same request. */
export class NonRetryableStageError extends Error {}

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
  if (error instanceof NonRetryableStageError) return true;
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
  //
  // Claude Opus 5 ships elevated safety classifiers that can decline a request
  // outright, so every stage opts into a server-side fallback: a declined
  // request is re-run on FALLBACK_MODEL inside the same call rather than
  // failing the run. A Civil Procedure answer should never trip a cyber or bio
  // classifier, but a false positive would otherwise lose a whole submission.
  //
  // Anthropic recommends `fallbacks: "default"` (category-routed, nothing to
  // pin) over naming a model, but the SDK does not type the scalar form yet and
  // this repo gates on tsc. Opus 4.8 is the documented target for a
  // cyber-category refusal, so the pinned form behaves identically today.
  const response = await input.client.beta.messages.stream({
    model: input.model,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    system: input.developerPrompt,
    messages: [{ role: "user", content: input.userPrompt }],
    betas: ["server-side-fallback-2026-06-01"],
    fallbacks: [{ model: FALLBACK_MODEL }],
    ...(input.safetyIdentifier ? { metadata: { user_id: input.safetyIdentifier } } : {}),
    output_config: {
      effort: input.reasoningEffort,
      format: zodOutputFormat(input.schema),
    },
  }).finalMessage();
  if (response.stop_reason === "max_tokens") {
    throw new Error("Output truncated at max_tokens before the structured object completed.");
  }
  // A refusal is a successful HTTP 200 with empty or partial content, and it is
  // deterministic: retrying the same prompt cannot clear it, so fail fast with
  // the classifier category instead of burning the retry ladder.
  if (response.stop_reason === "refusal") {
    const category = response.stop_details?.type === "refusal" ? response.stop_details.category : null;
    throw new NonRetryableStageError(
      `Every configured model declined this request${category ? ` (${category} classifier)` : ""}. The submission needs manual review.`,
    );
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
    // The model that actually answered, which is the fallback rather than the
    // requested model whenever a fallback served the turn.
    model: response.model,
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

  // The Claude API has no embeddings endpoint, so the semantic half of
  // retrieval is a model stage rather than a vector store: Claude names the
  // vocabulary the course materials would actually use for these doctrines, and
  // BM25 matches it. Non-fatal — retrieval still runs on issue-map and answer
  // terms alone, and labels the run as a lexical fallback.
  let expansionTerms: string[] = [];
  try {
    const retrievalQuery = await parseClaudeStage({
      client,
      schema: RetrievalQuerySchema,
      stageName: "retrieval_query",
      model: WORK_MODEL,
      reasoningEffort: "low",
      developerPrompt: queryExpansionDeveloperPrompt,
      userPrompt: queryExpansionUserPrompt({ issueMap, answer: input.answer }),
      safetyIdentifier,
      traces,
    });
    expansionTerms = [
      ...retrievalQuery.criterionQueries.flatMap((entry) => entry.terms),
      ...retrievalQuery.crossCuttingTerms,
    ];
  } catch {
    console.warn("Retrieval query expansion failed; searching on issue-map and answer terms only for this run.");
  }

  const retrievalCandidates = await retrieveCourseContext(
    { issueMap, answer: input.answer, expansionTerms },
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
      console.warn("Source reranking failed; using raw retrieval order for this run.");
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

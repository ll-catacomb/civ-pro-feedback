import "server-only";

import { createHash, randomUUID } from "node:crypto";

// Schema conversion only. Network requests go through HuitBedrockClient; the
// Anthropic helper narrows Zod's JSON Schema to Claude's supported subset.
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

import { buildAnchorPack } from "@/lib/anchors";
import { gradeDistance } from "@/lib/calibration";
import { formatExamMatches, rankExamMatches } from "@/lib/exam-match";
import { getExam } from "@/lib/exams";
import { FEEDBACK_MODELS } from "@/lib/feedback-models";
import type { FeedbackProgressStage } from "@/lib/feedback-progress";
import {
  HuitBedrockClient,
  HuitBedrockError,
  huitBedrockConfigured,
} from "@/lib/huit-bedrock";
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
  submissionContext,
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
  type Evaluation,
  type Feedback,
  type FeedbackRequestSchema,
  type FeedbackRun,
  type IssueMap,
  type JudgeResult,
  type RetrievedSource,
  type StageTrace,
  type SubmissionFitAssessment,
  type SubmissionFitJudge,
  type SubmissionMode,
  type SubmissionScope,
} from "@/lib/types";

// The schema's `.default()` calls make scope/mode required on the OUTPUT type,
// which would force every internal caller (calibration runs, tests) to restate
// them. Take the input type instead and resolve the defaults in one place.
export type ChainInput = z.input<typeof FeedbackRequestSchema> & {
  source?: "student" | "calibration";
  calibrationId?: string;
};

export type ResolvedSubmission = {
  scope: SubmissionScope;
  mode: SubmissionMode;
  questionRef?: string;
};

export function resolveSubmission(input: ChainInput): ResolvedSubmission {
  const scope = input.scope ?? "full_exam";
  return {
    scope,
    mode: input.mode ?? "full_draft",
    questionRef: scope === "single_question" ? input.questionRef : undefined,
  };
}

export type FeedbackIntake = {
  startedAt: number;
  exam: ReturnType<typeof getExam>;
  submissionFit: z.infer<typeof SubmissionFitAssessmentSchema>;
  submissionFitJudge: z.infer<typeof SubmissionFitJudgeSchema>;
  traces: StageTrace[];
};

export type FeedbackChainOptions = {
  onProgress?: (stage: FeedbackProgressStage) => void | Promise<void>;
};

async function reportProgress(options: FeedbackChainOptions | undefined, stage: FeedbackProgressStage) {
  await options?.onProgress?.(stage);
}

type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

const {
  fast: FAST_MODEL,
  work: WORK_MODEL,
  evaluator: EVALUATOR_MODEL,
  judge: JUDGE_MODEL,
} = FEEDBACK_MODELS;
const MAX_OUTPUT_TOKENS = 64_000;
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

export function hashInput(examId: string, answer: string): string {
  return createHash("sha256")
    .update(`${PROMPT_VERSION}\n${examId}\n${answer}`)
    .digest("hex");
}

export type FeedbackStageResult<T> = {
  value: T;
  traces: StageTrace[];
};

function requireChainConfiguration(): void {
  if (!chainConfigured()) {
    throw new FeedbackConfigurationError(
      "HUIT_BEDROCK_API_KEY is not configured. Add it to .env.local before running feedback.",
    );
  }
}

function stageContext(input: ChainInput) {
  const exam = getExam(input.examId);
  const submission = resolveSubmission(input);
  return {
    exam,
    submission,
    submissionBrief: submissionContext({
      ...submission,
      kind: exam.kind,
      modelAnswerKind: exam.modelAnswerKind,
    }),
  };
}

export async function runSubmissionFitStage(
  input: ChainInput,
): Promise<FeedbackStageResult<SubmissionFitAssessment>> {
  requireChainConfiguration();
  const { exam, submissionBrief } = stageContext(input);
  const traces: StageTrace[] = [];
  const value = await parseClaudeStage({
    client: createChainClient(),
    schema: SubmissionFitAssessmentSchema,
    stageName: "submission_fit",
    model: FAST_MODEL,
    reasoningEffort: "high",
    developerPrompt: submissionFitDeveloperPrompt,
    userPrompt: submissionFitUserPrompt({ exam: exam.prompt, answer: input.answer, submission: submissionBrief }),
    traces,
  });
  return { value, traces };
}

export async function runSubmissionFitJudgeStage(
  input: ChainInput,
  submissionFit: SubmissionFitAssessment,
): Promise<FeedbackStageResult<SubmissionFitJudge>> {
  requireChainConfiguration();
  const { exam, submissionBrief } = stageContext(input);
  const traces: StageTrace[] = [];
  const localExamMatches = rankExamMatches(input.answer, exam.promptPath);
  const value = await parseClaudeStage({
    client: createChainClient(),
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
      submission: submissionBrief,
    }),
    traces,
  });
  return { value, traces };
}

export function isZeroCreditSubmission(
  submissionFit: SubmissionFitAssessment,
  submissionFitJudge: SubmissionFitJudge,
): boolean {
  return submissionFit.status === "nonresponsive"
    && submissionFit.recommendation === "zero_credit"
    && submissionFit.responsivenessScore === 0
    && submissionFit.confidence >= 0.9
    && submissionFitJudge.status === "nonresponsive"
    && submissionFitJudge.recommendation === "zero_credit"
    && submissionFitJudge.responsivenessScore === 0
    && submissionFitJudge.confidence >= 0.9;
}

export async function runIssueMapStage(
  input: ChainInput,
): Promise<FeedbackStageResult<IssueMap>> {
  requireChainConfiguration();
  const { exam, submissionBrief } = stageContext(input);
  const traces: StageTrace[] = [];
  const value = await parseClaudeStage({
    client: createChainClient(),
    schema: IssueMapSchema,
    stageName: "issue_map",
    model: WORK_MODEL,
    reasoningEffort: "medium",
    developerPrompt: rubricDeveloperPrompt,
    userPrompt: rubricUserPrompt({
      exam: exam.prompt,
      modelAnswer: exam.modelAnswer,
      sources: "Additional course sources are retrieved after the issue map is built. Use the exam and instructor model answer for this stage.",
      submission: submissionBrief,
    }),
    traces,
  });
  return { value, traces };
}

export async function runRetrievalQueryStage(
  input: ChainInput,
  issueMap: IssueMap,
): Promise<FeedbackStageResult<string[]>> {
  requireChainConfiguration();
  const traces: StageTrace[] = [];
  const query = await parseClaudeStage({
    client: createChainClient(),
    schema: RetrievalQuerySchema,
    stageName: "retrieval_query",
    model: FAST_MODEL,
    reasoningEffort: "low",
    developerPrompt: queryExpansionDeveloperPrompt,
    userPrompt: queryExpansionUserPrompt({ issueMap, answer: input.answer }),
    traces,
  });
  return {
    value: [
      ...query.criterionQueries.flatMap((entry) => entry.terms),
      ...query.crossCuttingTerms,
    ],
    traces,
  };
}

export async function runSourceRerankStage(
  input: ChainInput,
  issueMap: IssueMap,
  expansionTerms: string[],
): Promise<FeedbackStageResult<RetrievedSource[]>> {
  requireChainConfiguration();
  const traces: StageTrace[] = [];
  const retrievalCandidates = await retrieveCourseContext(
    { issueMap, answer: input.answer, expansionTerms },
    RETRIEVAL_CANDIDATE_LIMIT,
  );
  if (retrievalCandidates.length === 0) return { value: [], traces };

  try {
    const rerank = await parseClaudeStage({
      client: createChainClient(),
      schema: SourceRerankSchema,
      stageName: "retrieval_rerank",
      model: FAST_MODEL,
      reasoningEffort: "low",
      developerPrompt: sourceRerankDeveloperPrompt,
      userPrompt: sourceRerankUserPrompt({
        issueMap,
        answer: input.answer,
        candidates: formatSources(retrievalCandidates),
      }),
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
    return {
      value: [
        ...selected,
        ...retrievalCandidates.filter((source) => !selectedIds.has(source.id)),
      ].slice(0, FINAL_SOURCE_LIMIT),
      traces,
    };
  } catch {
    console.warn("Source reranking failed; using raw retrieval order for this run.");
    return { value: retrievalCandidates.slice(0, FINAL_SOURCE_LIMIT), traces };
  }
}

export async function runEvaluationStage(
  input: ChainInput,
  issueMap: IssueMap,
  sources: RetrievedSource[],
): Promise<FeedbackStageResult<Evaluation>> {
  requireChainConfiguration();
  const { exam, submissionBrief } = stageContext(input);
  const traces: StageTrace[] = [];
  const value = await parseClaudeStage({
    client: createChainClient(),
    schema: EvaluationSchema,
    stageName: "blind_evaluation",
    model: EVALUATOR_MODEL,
    reasoningEffort: "high",
    developerPrompt: evaluationDeveloperPrompt,
    userPrompt: evaluationUserPrompt({
      exam: exam.prompt,
      modelAnswer: exam.modelAnswer,
      answer: input.answer,
      issueMap,
      sources: formatSources(sources),
      anchors: buildAnchorPack(exam.id, input.calibrationId),
      submission: submissionBrief,
    }),
    traces,
  });
  return { value, traces };
}

export async function runFeedbackDraftStage(
  input: ChainInput,
  issueMap: IssueMap,
  evaluation: Evaluation,
  sources: RetrievedSource[],
): Promise<FeedbackStageResult<Feedback>> {
  requireChainConfiguration();
  const { submissionBrief } = stageContext(input);
  const traces: StageTrace[] = [];
  const value = await parseClaudeStage({
    client: createChainClient(),
    schema: FeedbackSchema,
    stageName: "feedback_draft",
    model: WORK_MODEL,
    reasoningEffort: "medium",
    developerPrompt: coachDeveloperPrompt,
    userPrompt: coachUserPrompt({
      answer: input.answer,
      issueMap,
      evaluation,
      sources: formatSources(sources),
      submission: submissionBrief,
    }),
    traces,
  });
  return { value, traces };
}

export async function runJudgeStage(
  input: ChainInput,
  issueMap: IssueMap,
  evaluation: Evaluation,
  draftFeedback: Feedback,
  sources: RetrievedSource[],
): Promise<FeedbackStageResult<JudgeResult>> {
  requireChainConfiguration();
  const { exam, submissionBrief } = stageContext(input);
  const traces: StageTrace[] = [];
  const value = await parseClaudeStage({
    client: createChainClient(),
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
      sources: formatSources(sources),
      submission: submissionBrief,
    }),
    traces,
  });
  return { value, traces };
}

type FeedbackRunParts = {
  submissionFit: SubmissionFitAssessment;
  submissionFitJudge: SubmissionFitJudge;
  issueMap?: IssueMap;
  evaluation?: Evaluation;
  draftFeedback?: Feedback;
  judge?: JudgeResult;
  sources: RetrievedSource[];
  traces: StageTrace[];
};

export function assembleFeedbackRun(
  input: ChainInput,
  parts: FeedbackRunParts,
  startedAt: number,
): FeedbackRun {
  const exam = getExam(input.examId);
  const submission = resolveSubmission(input);
  const zeroCredit = isZeroCreditSubmission(parts.submissionFit, parts.submissionFitJudge);
  if (zeroCredit) {
    return {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      source: input.source ?? "student",
      calibrationId: input.calibrationId,
      examId: exam.id,
      examTitle: exam.title,
      studentLabel: input.studentLabel ?? "Anonymous practice",
      answer: input.answer,
      ...submission,
      actualGrade: input.actualGrade,
      promptVersion: PROMPT_VERSION,
      inputHash: hashInput(exam.id, input.answer),
      submissionFit: parts.submissionFit,
      submissionFitJudge: parts.submissionFitJudge,
      assessmentOutcome: {
        creditStatus: "zero_nonresponsive",
        score: 0,
        rationale: parts.submissionFitJudge.rationale,
      },
      sources: [],
      traces: parts.traces,
      totalDurationMs: Date.now() - startedAt,
      pipeline: "single",
    };
  }
  if (!parts.issueMap || !parts.evaluation || !parts.draftFeedback || !parts.judge) {
    throw new Error("The feedback run is missing one or more completed stage artifacts.");
  }
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    source: input.source ?? "student",
    calibrationId: input.calibrationId,
    examId: exam.id,
    examTitle: exam.title,
    studentLabel: input.studentLabel ?? "Anonymous practice",
    answer: input.answer,
    ...submission,
    actualGrade: input.actualGrade,
    predictedGrade: parts.evaluation.provisionalBand,
    calibrationDistance: input.actualGrade && submission.scope === "full_exam"
      && submission.mode === "full_draft" && exam.kind === "final"
      ? gradeDistance(parts.evaluation.provisionalBand, input.actualGrade)
      : undefined,
    promptVersion: PROMPT_VERSION,
    inputHash: hashInput(exam.id, input.answer),
    submissionFit: parts.submissionFit,
    submissionFitJudge: parts.submissionFitJudge,
    assessmentOutcome: {
      creditStatus: parts.submissionFitJudge.status === "uncertain"
        || parts.submissionFitJudge.recommendation === "manual_review"
        || !parts.submissionFitJudge.agreesWithFirstPass
        ? "manual_review"
        : "evaluated",
      score: null,
      rationale: parts.submissionFitJudge.rationale,
    },
    issueMap: parts.issueMap,
    evaluation: parts.evaluation,
    draftFeedback: parts.draftFeedback,
    judge: parts.judge,
    sources: parts.sources,
    traces: parts.traces,
    totalDurationMs: Date.now() - startedAt,
    pipeline: "single",
  };
}

export function chainConfigured(): boolean {
  return huitBedrockConfigured();
}

export function createChainClient(): HuitBedrockClient {
  return new HuitBedrockClient();
}

// Retry transient gateway, rate-limit, and Bedrock service errors at the stage
// boundary. Delays escalate instead of hammering the same window, with jitter
// so parallel fixtures desynchronize.
const STAGE_RETRY_DELAYS_MS = [5_000, 20_000, 60_000];
const STAGE_RETRY_JITTER_MS = 5_000;

function isNonRetryable(error: unknown): boolean {
  if (error instanceof NonRetryableStageError) return true;
  return error instanceof HuitBedrockError
    && typeof error.status === "number"
    && [400, 401, 403, 404, 413].includes(error.status);
}

async function attemptClaudeStage<T>(input: {
  client: HuitBedrockClient;
  schema: z.ZodType<T>;
  stageName: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  developerPrompt: string;
  userPrompt: string;
  traces: StageTrace[];
}): Promise<T> {
  const startedAt = Date.now();
  const outputFormat = zodOutputFormat(input.schema);
  const response = await input.client.invoke({
    model: input.model,
    maxTokens: MAX_OUTPUT_TOKENS,
    thinking: { type: "adaptive" },
    system: input.developerPrompt,
    userPrompt: input.userPrompt,
    outputConfig: {
      effort: input.reasoningEffort,
      format: {
        type: "json_schema",
        schema: outputFormat.schema as Record<string, unknown>,
      },
    },
  });
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
    model: response.model ?? input.model,
    reasoningEffort: input.reasoningEffort,
    durationMs: Date.now() - startedAt,
    inputTokens: response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
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

export async function runFeedbackIntake(
  input: ChainInput,
  options?: FeedbackChainOptions,
): Promise<FeedbackIntake> {
  if (!chainConfigured()) {
    throw new FeedbackConfigurationError(
      "HUIT_BEDROCK_API_KEY is not configured. Add it to .env.local before running feedback.",
    );
  }

  const startedAt = Date.now();
  const exam = getExam(input.examId);
  const traces: StageTrace[] = [];
  const client = createChainClient();
  const localExamMatches = rankExamMatches(input.answer, exam.promptPath);
  const submission = submissionContext({
    ...resolveSubmission(input),
    kind: exam.kind,
    modelAnswerKind: exam.modelAnswerKind,
  });

  await reportProgress(options, "submission_fit");
  const submissionFit = await parseClaudeStage({
    client,
    schema: SubmissionFitAssessmentSchema,
    stageName: "submission_fit",
    model: FAST_MODEL,
    reasoningEffort: "high",
    developerPrompt: submissionFitDeveloperPrompt,
    userPrompt: submissionFitUserPrompt({ exam: exam.prompt, answer: input.answer, submission }),
    traces,
  });

  await reportProgress(options, "submission_fit_judge");
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
      submission,
    }),
    traces,
  });

  return {
    startedAt,
    exam,
    submissionFit,
    submissionFitJudge,
    traces,
  };
}

export async function runFeedbackChain(
  input: ChainInput,
  preparedIntake?: FeedbackIntake,
  options?: FeedbackChainOptions,
): Promise<FeedbackRun> {
  const submission = resolveSubmission(input);
  const intake = preparedIntake ?? await runFeedbackIntake(input, options);
  const {
    startedAt,
    exam,
    submissionFit,
    submissionFitJudge,
    traces,
  } = intake;
  // Built after the intake, because the brief needs the resolved item to know
  // whether its benchmark is an instructor key or a set of peer exemplars.
  const submissionBrief = submissionContext({
    ...submission,
    kind: exam.kind,
    modelAnswerKind: exam.modelAnswerKind,
  });
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
    await reportProgress(options, "complete");
    return {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      source: input.source ?? "student",
      calibrationId: input.calibrationId,
      examId: exam.id,
      examTitle: exam.title,
      studentLabel: input.studentLabel ?? "Anonymous practice",
      answer: input.answer,
      ...submission,
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

  await reportProgress(options, "issue_map");
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
      submission: submissionBrief,
    }),
    traces,
  });

  // The Claude API has no embeddings endpoint, so the semantic half of
  // retrieval is a model stage rather than a vector store: Claude names the
  // vocabulary the course materials would actually use for these doctrines, and
  // BM25 matches it. Non-fatal — retrieval still runs on issue-map and answer
  // terms alone, and labels the run as a lexical fallback.
  let expansionTerms: string[] = [];
  try {
    await reportProgress(options, "retrieval_query");
    const retrievalQuery = await parseClaudeStage({
      client,
      schema: RetrievalQuerySchema,
      stageName: "retrieval_query",
      model: FAST_MODEL,
      reasoningEffort: "low",
      developerPrompt: queryExpansionDeveloperPrompt,
      userPrompt: queryExpansionUserPrompt({ issueMap, answer: input.answer }),
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
      await reportProgress(options, "retrieval_rerank");
      const rerank = await parseClaudeStage({
        client,
        schema: SourceRerankSchema,
        stageName: "retrieval_rerank",
        model: FAST_MODEL,
        reasoningEffort: "low",
        developerPrompt: sourceRerankDeveloperPrompt,
        userPrompt: sourceRerankUserPrompt({
          issueMap,
          answer: input.answer,
          candidates: formatSources(retrievalCandidates),
        }),
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

  await reportProgress(options, "blind_evaluation");
  const evaluation = await parseClaudeStage({
    client,
    schema: EvaluationSchema,
    stageName: "blind_evaluation",
    model: EVALUATOR_MODEL,
    reasoningEffort: "high",
    developerPrompt: evaluationDeveloperPrompt,
    userPrompt: evaluationUserPrompt({
      exam: exam.prompt,
      modelAnswer: exam.modelAnswer,
      answer: input.answer,
      issueMap,
      sources: formattedSources,
      anchors: buildAnchorPack(exam.id, input.calibrationId),
      submission: submissionBrief,
    }),
    traces,
  });

  await reportProgress(options, "feedback_draft");
  const draftFeedback = await parseClaudeStage({
    client,
    schema: FeedbackSchema,
    stageName: "feedback_draft",
    model: WORK_MODEL,
    reasoningEffort: "medium",
    developerPrompt: coachDeveloperPrompt,
    userPrompt: coachUserPrompt({ answer: input.answer, issueMap, evaluation, sources: formattedSources, submission: submissionBrief }),
    traces,
  });

  await reportProgress(options, "judge_and_revise");
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
      submission: submissionBrief,
    }),
    traces,
  });

  await reportProgress(options, "complete");
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    source: input.source ?? "student",
    calibrationId: input.calibrationId,
    examId: exam.id,
    examTitle: exam.title,
    studentLabel: input.studentLabel ?? "Anonymous practice",
    answer: input.answer,
    ...submission,
    actualGrade: input.actualGrade,
    predictedGrade: evaluation.provisionalBand,
    // Only where the band is comparable: an outline, a single question, or an
    // assignment is ranked against complete prose finals, so scoring the gap
    // would put a meaningless number into the QA record.
    calibrationDistance: input.actualGrade && submission.scope === "full_exam"
      && submission.mode === "full_draft" && exam.kind === "final"
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

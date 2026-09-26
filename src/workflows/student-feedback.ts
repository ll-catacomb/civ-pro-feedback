import {
  assembleFeedbackRun,
  isZeroCreditSubmission,
  runEvaluationStage,
  runFeedbackDraftStage,
  runIssueMapStage,
  runJudgeStage,
  runRetrievalQueryStage,
  runSourceRerankStage,
  runSubmissionFitJudgeStage,
  runSubmissionFitStage,
  type ChainInput,
} from "@/lib/feedback-chain";
import {
  completeStudentFeedback,
  failStudentFeedback,
  prepareStudentFeedback,
  reportStudentFeedbackProgress,
  type StudentFeedbackPreparation,
} from "@/lib/process-student-feedback";
import type {
  Evaluation,
  Feedback,
  FeedbackRun,
  IssueMap,
  JudgeResult,
  RetrievedSource,
  StageTrace,
  SubmissionFitAssessment,
  SubmissionFitJudge,
} from "@/lib/types";

type ReadyPreparation = Extract<StudentFeedbackPreparation, { kind: "ready" }>;

export async function studentFeedbackWorkflow(submissionId: string) {
  "use workflow";

  const preparation = await prepareStep(submissionId);
  if (preparation.kind === "terminal") return preparation.result;

  try {
    const fit = await submissionFitStep(preparation.submissionId, preparation.input);
    const fitJudge = await submissionFitJudgeStep(
      preparation.submissionId,
      preparation.input,
      fit.value,
    );
    const traces = [...fit.traces, ...fitJudge.traces];

    if (await zeroCreditStep(fit.value, fitJudge.value)) {
      const run = await assembleRunStep(preparation, {
        submissionFit: fit.value,
        submissionFitJudge: fitJudge.value,
        sources: [],
        traces,
      });
      return completeStep(preparation, run);
    }

    const issueMap = await issueMapStep(preparation.submissionId, preparation.input);
    traces.push(...issueMap.traces);

    let expansionTerms: string[] = [];
    try {
      const query = await retrievalQueryStep(
        preparation.submissionId,
        preparation.input,
        issueMap.value,
      );
      expansionTerms = query.value;
      traces.push(...query.traces);
    } catch {
      // Query expansion improves recall but is deliberately non-fatal. The next
      // step can retrieve against the answer and issue-map vocabulary alone.
    }

    const rerank = await sourceRerankStep(
      preparation.submissionId,
      preparation.input,
      issueMap.value,
      expansionTerms,
    );
    traces.push(...rerank.traces);

    const evaluation = await evaluationStep(
      preparation.submissionId,
      preparation.input,
      issueMap.value,
      rerank.value,
    );
    traces.push(...evaluation.traces);

    const draft = await feedbackDraftStep(
      preparation.submissionId,
      preparation.input,
      issueMap.value,
      evaluation.value,
      rerank.value,
    );
    traces.push(...draft.traces);

    const judge = await judgeStep(
      preparation.submissionId,
      preparation.input,
      issueMap.value,
      evaluation.value,
      draft.value,
      rerank.value,
    );
    traces.push(...judge.traces);

    const run = await assembleRunStep(preparation, {
      submissionFit: fit.value,
      submissionFitJudge: fitJudge.value,
      issueMap: issueMap.value,
      evaluation: evaluation.value,
      draftFeedback: draft.value,
      judge: judge.value,
      sources: rerank.value,
      traces,
    });
    return completeStep(preparation, run);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown student feedback failure";
    return failStep(preparation, message);
  }
}

async function prepareStep(submissionId: string) {
  "use step";
  return prepareStudentFeedback(submissionId);
}

async function submissionFitStep(submissionId: string, input: ChainInput) {
  "use step";
  await reportStudentFeedbackProgress(submissionId, "submission_fit");
  return runSubmissionFitStage(input);
}

async function submissionFitJudgeStep(
  submissionId: string,
  input: ChainInput,
  submissionFit: SubmissionFitAssessment,
) {
  "use step";
  await reportStudentFeedbackProgress(submissionId, "submission_fit_judge");
  return runSubmissionFitJudgeStage(input, submissionFit);
}

async function zeroCreditStep(
  submissionFit: SubmissionFitAssessment,
  submissionFitJudge: SubmissionFitJudge,
) {
  "use step";
  return isZeroCreditSubmission(submissionFit, submissionFitJudge);
}

async function issueMapStep(submissionId: string, input: ChainInput) {
  "use step";
  await reportStudentFeedbackProgress(submissionId, "issue_map");
  return runIssueMapStage(input);
}

async function retrievalQueryStep(
  submissionId: string,
  input: ChainInput,
  issueMap: IssueMap,
) {
  "use step";
  await reportStudentFeedbackProgress(submissionId, "retrieval_query");
  return runRetrievalQueryStage(input, issueMap);
}

async function sourceRerankStep(
  submissionId: string,
  input: ChainInput,
  issueMap: IssueMap,
  expansionTerms: string[],
) {
  "use step";
  await reportStudentFeedbackProgress(submissionId, "retrieval_rerank");
  return runSourceRerankStage(input, issueMap, expansionTerms);
}

async function evaluationStep(
  submissionId: string,
  input: ChainInput,
  issueMap: IssueMap,
  sources: RetrievedSource[],
) {
  "use step";
  await reportStudentFeedbackProgress(submissionId, "blind_evaluation");
  return runEvaluationStage(input, issueMap, sources);
}

async function feedbackDraftStep(
  submissionId: string,
  input: ChainInput,
  issueMap: IssueMap,
  evaluation: Evaluation,
  sources: RetrievedSource[],
) {
  "use step";
  await reportStudentFeedbackProgress(submissionId, "feedback_draft");
  return runFeedbackDraftStage(input, issueMap, evaluation, sources);
}

async function judgeStep(
  submissionId: string,
  input: ChainInput,
  issueMap: IssueMap,
  evaluation: Evaluation,
  draftFeedback: Feedback,
  sources: RetrievedSource[],
) {
  "use step";
  await reportStudentFeedbackProgress(submissionId, "judge_and_revise");
  return runJudgeStage(input, issueMap, evaluation, draftFeedback, sources);
}

type RunParts = {
  submissionFit: SubmissionFitAssessment;
  submissionFitJudge: SubmissionFitJudge;
  issueMap?: IssueMap;
  evaluation?: Evaluation;
  draftFeedback?: Feedback;
  judge?: JudgeResult;
  sources: RetrievedSource[];
  traces: StageTrace[];
};

async function assembleRunStep(preparation: ReadyPreparation, parts: RunParts) {
  "use step";
  return assembleFeedbackRun(preparation.input, parts, preparation.startedAt);
}

async function completeStep(preparation: ReadyPreparation, run: FeedbackRun) {
  "use step";
  return completeStudentFeedback(preparation, run);
}

async function failStep(preparation: ReadyPreparation, message: string) {
  "use step";
  return failStudentFeedback(preparation, message);
}

// Provider calls already have a stage-aware retry ladder. One infrastructure
// retry protects against a killed function without multiplying paid model work.
submissionFitStep.maxRetries = 1;
submissionFitJudgeStep.maxRetries = 1;
issueMapStep.maxRetries = 1;
retrievalQueryStep.maxRetries = 1;
sourceRerankStep.maxRetries = 1;
evaluationStep.maxRetries = 1;
feedbackDraftStep.maxRetries = 1;
judgeStep.maxRetries = 1;

// These steps are idempotent and contain no model calls.
prepareStep.maxRetries = 2;
zeroCreditStep.maxRetries = 2;
assembleRunStep.maxRetries = 2;
completeStep.maxRetries = 2;
failStep.maxRetries = 2;

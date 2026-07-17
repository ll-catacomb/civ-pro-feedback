import "server-only";

import { createChainClient, parseClaudeStage } from "@/lib/feedback-chain";
import { getExam } from "@/lib/exams";
import { calibrationAnalysisDeveloperPrompt } from "@/lib/prompts";
import {
  CalibrationAnalysisSchema,
  type CalibrationAnalysis,
  type CalibrationFixture,
  type FeedbackRun,
  type StageTrace,
} from "@/lib/types";

const CALIBRATION_MODEL = process.env.ANTHROPIC_JUDGE_MODEL ?? "claude-opus-4-8";
export const CALIBRATION_ANALYSIS_VERSION = "calibration-analysis-v2.0.0";

function gradeAgreement(run: FeedbackRun): CalibrationAnalysis["gradeAgreement"] {
  if (run.calibrationDistance === 0) return "exact";
  if (run.calibrationDistance === 1) return "adjacent";
  if (run.calibrationDistance !== undefined) return "material_miss";
  return "not_applicable";
}

export async function analyzeCalibrationRun(
  run: FeedbackRun,
  fixture: CalibrationFixture,
): Promise<{ analysis: CalibrationAnalysis; trace: StageTrace }> {
  const exam = getExam(fixture.examId);
  const traces: StageTrace[] = [];
  const analysis = await parseClaudeStage({
    client: createChainClient(),
    schema: CalibrationAnalysisSchema,
    stageName: "calibration_analysis",
    model: CALIBRATION_MODEL,
    reasoningEffort: "medium",
    developerPrompt: calibrationAnalysisDeveloperPrompt,
    userPrompt: `PROMPT VERSION\n${run.promptVersion}\n\nACTUAL BAND\n${run.actualGrade ?? "Not supplied"}\n\nPREDICTED BAND\n${run.predictedGrade ?? "Not supplied"}\n\nORDINAL BAND DISTANCE\n${run.calibrationDistance ?? "Not available"}\n\nEXPECTED GRADE AGREEMENT LABEL\n${gradeAgreement(run)}\n\nHISTORICAL GRADER FEEDBACK\n${fixture.historicalFeedback?.length ? JSON.stringify(fixture.historicalFeedback, null, 2) : "No narrative grader feedback was supplied for this answer. This is a grade-only benchmark."}\n\nEXAM\n${exam.prompt}\n\nINSTRUCTOR MODEL ANSWER\n${exam.modelAnswer}\n\nSTUDENT ANSWER\n${run.answer}\n\nCHAIN ISSUE MAP\n${JSON.stringify(run.issueMap, null, 2)}\n\nCHAIN BLIND EVALUATION\n${JSON.stringify(run.evaluation, null, 2)}\n\nCHAIN FINAL STUDENT FEEDBACK\n${JSON.stringify(run.judge?.feedback, null, 2)}\n\nCHAIN JUDGE FINDINGS\n${JSON.stringify(run.judge?.findings, null, 2)}`,
    traces,
  });
  return {
    analysis: {
      ...analysis,
      evidenceBasis: fixture.historicalFeedback?.length ? "narrative_feedback" : "grade_only",
      gradeAgreement: gradeAgreement(run),
    },
    trace: traces[0],
  };
}

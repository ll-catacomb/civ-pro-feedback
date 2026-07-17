import { listRuns } from "@/lib/store";
import {
  getAssessmentOutcome,
  getAveragedCalibrationDistance,
  getFinalFeedback,
  getFormativeBandEstimate,
  getFormativeBandScore,
} from "@/lib/outcomes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET() {
  const runs = await listRuns();
  const headers = [
    "run_id",
    "created_at",
    "source",
    "calibration_id",
    "exam_id",
    "student_label",
    "assessment_status",
    "assessment_score",
    "actual_grade",
    "predicted_grade",
    "formative_band_estimate",
    "formative_band_score",
    "grade_distance",
    "averaged_grade_distance",
    "quality_score",
    "judge_approved",
    "prompt_version",
    "pipeline",
    "cross_judges_agreed",
    "final_feedback_source",
    "work_model",
    "judge_model",
    "duration_ms",
    "reviewer_rating",
    "reviewer_notes",
    "answer",
    "submission_fit_json",
    "submission_fit_judge_json",
    "issue_map_json",
    "evaluation_json",
    "band_assessment_json",
    "draft_feedback_json",
    "feedback_json",
    "openai_feedback_json",
    "judge_json",
    "claude_chain_json",
    "cross_judges_json",
    "dual_decision_json",
    "historical_feedback_json",
    "calibration_analysis_version",
    "calibration_analysis_json",
    "sources_json",
    "traces_json",
  ];
  const rows = runs.map((run) => {
    const outcome = getAssessmentOutcome(run);
    return [
      run.id,
      run.createdAt,
      run.source,
      run.calibrationId,
      run.examId,
      run.studentLabel,
      outcome.creditStatus,
      outcome.score,
      run.actualGrade,
      run.predictedGrade,
      getFormativeBandEstimate(run),
      getFormativeBandScore(run),
      run.calibrationDistance,
      getAveragedCalibrationDistance(run),
      run.judge?.qualityScore,
      run.judge?.approved,
      run.promptVersion,
      run.pipeline ?? "single",
      run.dualDecision?.bandsAgreed,
      run.dualDecision?.feedbackSource ?? (run.judge ? "judge" : ""),
      run.traces[0]?.model,
      run.traces.at(-1)?.model,
      run.totalDurationMs,
      run.reviewerRating,
      run.reviewerNotes,
      run.answer,
      JSON.stringify(run.submissionFit),
      JSON.stringify(run.submissionFitJudge),
      JSON.stringify(run.issueMap),
      JSON.stringify(run.evaluation),
      JSON.stringify(run.bandAssessment),
      JSON.stringify(run.draftFeedback),
      JSON.stringify(getFinalFeedback(run)),
      JSON.stringify(run.judge?.feedback),
      JSON.stringify(run.judge),
      JSON.stringify(run.claudeChain),
      JSON.stringify(run.crossJudges),
      JSON.stringify(run.dualDecision),
      JSON.stringify(run.historicalFeedback),
      run.calibrationAnalysisVersion,
      JSON.stringify(run.calibrationAnalysis),
      JSON.stringify(run.sources),
      JSON.stringify(run.traces),
    ];
  });
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  return new Response(`${csv}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="civpro-feedback-runs-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

import { NextResponse } from "next/server";

import { analyzeCalibrationRun, CALIBRATION_ANALYSIS_VERSION } from "@/lib/calibration-analysis";
import { getCalibrationFixture } from "@/lib/calibration";
import { FeedbackConfigurationError, FeedbackStageError, runFeedbackChain } from "@/lib/feedback-chain";
import { saveFailure, saveRun } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let failureContext: { examId: string; studentLabel: string; answer: string } | undefined;
  try {
    const { id } = await context.params;
    const fixture = getCalibrationFixture(id);
    if (fixture.status === "mismatch") {
      return NextResponse.json({ error: fixture.note }, { status: 409 });
    }
    failureContext = {
      examId: fixture.examId,
      studentLabel: fixture.label,
      answer: fixture.answer,
    };
    let run = await runFeedbackChain({
      examId: fixture.examId,
      answer: fixture.answer,
      studentLabel: fixture.label,
      actualGrade: fixture.actualGrade,
      source: "calibration",
      calibrationId: fixture.id,
    });
    try {
      const calibration = await analyzeCalibrationRun(run, fixture);
      run = {
        ...run,
        historicalFeedback: fixture.historicalFeedback,
        calibrationAnalysis: calibration.analysis,
        calibrationAnalysisVersion: CALIBRATION_ANALYSIS_VERSION,
        traces: [...run.traces, calibration.trace],
        totalDurationMs: run.totalDurationMs + calibration.trace.durationMs,
      };
    } catch (analysisError) {
      console.warn("Post-hoc calibration analysis failed; preserving the blind grading run.", analysisError);
      run = { ...run, historicalFeedback: fixture.historicalFeedback };
    }
    await saveRun(run);
    return NextResponse.json({ run });
  } catch (error) {
    if (error instanceof FeedbackConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Calibration run failed", error);
    const reference = await saveFailure({
      source: "calibration",
      ...failureContext,
      stage: error instanceof FeedbackStageError ? error.stageName : undefined,
      message: error instanceof Error ? error.message : "Unknown calibration-chain failure",
    });
    return NextResponse.json(
      {
        error: `The blind calibration run could not complete${error instanceof FeedbackStageError ? ` during ${error.stageName}` : ""}. It was saved under error reference ${reference}.`,
      },
      { status: 500 },
    );
  }
}

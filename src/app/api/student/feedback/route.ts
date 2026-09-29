import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { start } from "workflow/api";

import { auth } from "@/auth";
import { AttemptGateError, createAttemptGateClient } from "@/lib/attempt-gate";
import { getExam, getExams, isKnownExamId } from "@/lib/exams";
import { PROMPT_VERSION } from "@/lib/prompts";
import { chunkSheetContent } from "@/lib/student-records";
import { assessSubmissionPreflight } from "@/lib/submission-preflight";
import { FeedbackRequestSchema } from "@/lib/types";
import { studentFeedbackWorkflow } from "@/workflows/student-feedback";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user.studentId || !session.user.pseudonym) {
    return NextResponse.json({ error: "Sign in with your enrolled Harvard Google account." }, { status: 401 });
  }

  const gate = createAttemptGateClient();
  let submissionId: string | undefined;
  let reserved = false;
  try {
    const parsed = FeedbackRequestSchema.parse(await request.json());
    if (!isKnownExamId(parsed.examId)) {
      const items = getExams();
      const finalYears = items.filter((item) => item.kind === "final").map((item) => item.year);
      return NextResponse.json(
        { error: `That practice item is unavailable. Final exams: ${Math.min(...finalYears)}–${Math.max(...finalYears)}.` },
        { status: 400 },
      );
    }
    const exam = getExam(parsed.examId);
    const preflight = assessSubmissionPreflight({
      answer: parsed.answer,
      examPrompt: exam.prompt,
      scope: parsed.scope,
      mode: parsed.mode,
      examQuestionCount: exam.questionCount,
    });
    if (!preflight.ok) {
      return NextResponse.json({ error: preflight.message }, { status: 422 });
    }
    const requestKey = request.headers.get("Idempotency-Key")?.trim();
    if (!requestKey || requestKey.length > 120) {
      return NextResponse.json({ error: "The submission request identifier is missing." }, { status: 400 });
    }
    submissionId = randomUUID();
    const createdAt = new Date().toISOString();
    const reservation = await gate.reserve({
      studentId: session.user.studentId,
      submissionId,
      requestKey,
      examId: parsed.examId,
      scope: parsed.scope ?? "full_exam",
      mode: parsed.mode ?? "full_draft",
      questionRef: parsed.scope === "single_question" ? parsed.questionRef ?? "" : "",
      createdAt,
      promptVersion: PROMPT_VERSION,
      answerParts: chunkSheetContent(parsed.answer),
    });
    if (reservation.duplicate) {
      return NextResponse.json(
        { submissionId: reservation.submissionId, duplicate: true },
        { status: 202 },
      );
    }
    reserved = true;
    const workflowRun = await start(studentFeedbackWorkflow, [submissionId]);
    reserved = false;
    return NextResponse.json({
      submissionId,
      workflowRunId: workflowRun.runId,
      remainingAttempts: reservation.remainingAttempts,
    }, { status: 202 });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "The submission is incomplete." }, { status: 400 });
    }
    if (error instanceof AttemptGateError) {
      const expectedErrors: Partial<Record<AttemptGateError["code"], { status: number; message: string }>> = {
        disabled: { status: 403, message: "This course account is currently disabled. Please contact the course team." },
        limit_reached: { status: 409, message: "All available feedback attempts have been used." },
        already_running: { status: 409, message: "A feedback submission is already processing. Open My feedback to follow it before submitting another." },
        not_enrolled: { status: 403, message: "This account is not currently enrolled. Please contact the course team." },
      };
      const expected = expectedErrors[error.code];
      if (expected) return NextResponse.json({ error: expected.message }, { status: expected.status });
    }
    const errorReference = randomUUID();
    console.error("Could not queue authenticated student feedback", { errorReference, error });
    if (reserved && submissionId) {
      try {
        await gate.refund({
          studentId: session.user.studentId,
          submissionId,
          updatedAt: new Date().toISOString(),
          errorReference,
        });
      } catch (refundError) {
        console.error("Attempt refund failed", refundError);
      }
    }
    return NextResponse.json(
      { error: `The submission could not be queued. No attempt was used. Error reference: ${errorReference}.` },
      { status: 500 },
    );
  }
}

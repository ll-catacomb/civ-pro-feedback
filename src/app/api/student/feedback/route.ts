import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { start } from "workflow/api";

import { auth } from "@/auth";
import { createAttemptGateClient } from "@/lib/attempt-gate";
import { getExams, isKnownExamId } from "@/lib/exams";
import { PROMPT_VERSION } from "@/lib/prompts";
import { chunkSheetContent } from "@/lib/student-records";
import { FeedbackRequestSchema } from "@/lib/types";
import { studentFeedbackWorkflow } from "@/workflows/student-feedback";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user.studentId || !session.user.pseudonym) {
    return NextResponse.json({ error: "Sign in with your course access code." }, { status: 401 });
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
    console.error("Could not queue authenticated student feedback", error);
    const errorReference = randomUUID();
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
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "The submission is incomplete." }, { status: 400 });
    }
    return NextResponse.json(
      { error: `The submission could not be queued. No attempt was used. Error reference: ${errorReference}.` },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { FEEDBACK_PROGRESS_STAGES, describeFeedbackProgress, type FeedbackProgressStage } from "@/lib/feedback-progress";
import { createGoogleSheetsClient } from "@/lib/google-sheets";
import { GoogleSheetsRecordStore } from "@/lib/google-sheets-records";
import { joinSheetContent } from "@/lib/student-records";
import { FeedbackRunSchema } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user.pseudonym) {
    return NextResponse.json({ error: "Sign in with your enrolled course account." }, { status: 401 });
  }
  const { id } = await params;
  const store = new GoogleSheetsRecordStore(createGoogleSheetsClient());
  const submission = await store.getSubmission(id);
  if (!submission || submission.pseudonym !== session.user.pseudonym) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }
  const knownStage = FEEDBACK_PROGRESS_STAGES.includes(submission.stage as FeedbackProgressStage)
    ? submission.stage as FeedbackProgressStage
    : undefined;
  const progress = knownStage
    ? describeFeedbackProgress(knownStage)
    : { label: "Waiting to begin", detail: "Your response is safely queued.", position: 0 };
  if (submission.status !== "completed") {
    return NextResponse.json({
      submissionId: id,
      status: submission.status,
      stage: submission.stage,
      progress,
      errorReference: submission.errorReference,
    });
  }
  const content = await store.listContent(id);
  const parts = content
    .filter((item) => item.contentType === "run_json")
    .map(({ part, text }) => ({ part, text }));
  if (!parts.length) {
    return NextResponse.json({ error: "Completed feedback is not yet available." }, { status: 503 });
  }
  const run = FeedbackRunSchema.parse(JSON.parse(joinSheetContent(parts)));
  return NextResponse.json({ submissionId: id, status: "completed", stage: "complete", progress, run });
}

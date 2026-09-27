import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { StudentHeader } from "@/components/student-header";
import { StudentSubmissionStatus } from "@/components/student-submission-status";
import { describeFeedbackProgress, FEEDBACK_PROGRESS_STAGES, type FeedbackProgressStage } from "@/lib/feedback-progress";
import { createGoogleSheetsClient } from "@/lib/google-sheets";
import { GoogleSheetsRecordStore } from "@/lib/google-sheets-records";
import { joinSheetContent } from "@/lib/student-records";
import { FeedbackRunSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function StudentSubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user.studentId || !session.user.pseudonym || session.user.role !== "student") {
    redirect("/student/sign-in");
  }
  const { id } = await params;
  const store = new GoogleSheetsRecordStore(createGoogleSheetsClient());
  const submission = await store.getSubmission(id);
  if (!submission || submission.pseudonym !== session.user.pseudonym) notFound();

  const knownStage = FEEDBACK_PROGRESS_STAGES.includes(submission.stage as FeedbackProgressStage)
    ? submission.stage as FeedbackProgressStage
    : undefined;
  const progress = knownStage
    ? describeFeedbackProgress(knownStage)
    : { label: "Waiting to begin", detail: "Your response is safely queued.", position: 0 };
  const content = submission.status === "completed" ? await store.listContent(id) : [];
  const runParts = content
    .filter((item) => item.contentType === "run_json")
    .map(({ part, text }) => ({ part, text }));
  const run = runParts.length
    ? FeedbackRunSchema.parse(JSON.parse(joinSheetContent(runParts)))
    : undefined;

  return (
    <div className="student-portal student-practice">
      <StudentHeader pseudonym={session.user.pseudonym} authenticated />
      <main>
        <StudentSubmissionStatus
          submissionId={id}
          examLabel={submission.questionRef ? `${submission.examId} · ${submission.questionRef}` : submission.examId}
          initialStatus={submission.status}
          initialProgress={progress}
          initialRun={run}
          initialErrorReference={submission.errorReference}
        />
      </main>
    </div>
  );
}

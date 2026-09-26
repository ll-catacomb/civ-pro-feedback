import "server-only";

import { createAttemptGateClient } from "@/lib/attempt-gate";
import type { ChainInput } from "@/lib/feedback-chain";
import { createGoogleSheetsClient } from "@/lib/google-sheets";
import { GoogleSheetsRecordStore } from "@/lib/google-sheets-records";
import { saveFailure, saveRun } from "@/lib/store";
import { chunkSheetContent, joinSheetContent } from "@/lib/student-records";
import { FeedbackRunSchema, type FeedbackRun } from "@/lib/types";

export type StudentWorkflowResult = {
  submissionId: string;
  status: "completed" | "failed";
  runId?: string;
  errorReference?: string;
};

export type StudentFeedbackPreparation =
  | { kind: "terminal"; result: StudentWorkflowResult }
  | {
    kind: "ready";
    submissionId: string;
    googleSubject: string;
    input: ChainInput;
    startedAt: number;
  };

function createStore(): GoogleSheetsRecordStore {
  return new GoogleSheetsRecordStore(createGoogleSheetsClient());
}

async function bestEffortSaveRun(run: Parameters<typeof saveRun>[0]) {
  try {
    await saveRun(run);
  } catch (error) {
    // Google Sheets is the production record. The legacy JSON store is useful
    // locally but is not writable on Vercel.
    console.warn("Legacy run-store write skipped", error);
  }
}

function persistedRunFromContent(
  content: Awaited<ReturnType<GoogleSheetsRecordStore["listContent"]>>,
): FeedbackRun | undefined {
  const parts = content
    .filter((item) => item.contentType === "run_json")
    .map(({ part, text }) => ({ part, text }));
  if (!parts.length) return undefined;
  return FeedbackRunSchema.parse(JSON.parse(joinSheetContent(parts)));
}

export async function prepareStudentFeedback(
  submissionId: string,
): Promise<StudentFeedbackPreparation> {
  const store = createStore();
  const submission = await store.getSubmission(submissionId);
  if (!submission) throw new Error(`Submission ${submissionId} was not found.`);

  const students = await store.listStudents();
  const student = students.find((candidate) => candidate.pseudonym === submission.pseudonym);
  if (!student?.googleSubject) {
    throw new Error("The submission is not linked to an enrolled Google account.");
  }

  const content = await store.listContent(submissionId);
  const persistedRun = persistedRunFromContent(content);
  if (persistedRun) {
    await bestEffortSaveRun(persistedRun);
    await createAttemptGateClient().complete({
      googleSubject: student.googleSubject,
      submissionId,
      updatedAt: new Date().toISOString(),
    });
    return {
      kind: "terminal",
      result: { submissionId, status: "completed", runId: persistedRun.id },
    };
  }
  if (submission.status === "completed") {
    throw new Error("The submission is marked complete but its feedback record is missing.");
  }
  if (submission.status === "failed" || submission.status === "refunded") {
    return {
      kind: "terminal",
      result: {
        submissionId,
        status: "failed",
        errorReference: submission.errorReference,
      },
    };
  }

  const answer = joinSheetContent(content
    .filter((item) => item.contentType === "student_answer")
    .map(({ part, text }) => ({ part, text })));
  if (!answer) throw new Error("The stored submission has no answer content.");

  return {
    kind: "ready",
    submissionId,
    googleSubject: student.googleSubject,
    startedAt: Date.now(),
    input: {
      examId: submission.examId,
      answer,
      studentLabel: submission.pseudonym,
      scope: submission.scope,
      mode: submission.mode,
      questionRef: submission.questionRef,
      source: "student",
    },
  };
}

export async function reportStudentFeedbackProgress(
  submissionId: string,
  stage: string,
): Promise<void> {
  await createAttemptGateClient().progress({
    submissionId,
    status: "running",
    stage,
    updatedAt: new Date().toISOString(),
  });
}

export async function completeStudentFeedback(
  preparation: Extract<StudentFeedbackPreparation, { kind: "ready" }>,
  run: FeedbackRun,
): Promise<StudentWorkflowResult> {
  const store = createStore();
  const content = await store.listContent(preparation.submissionId);
  const persistedRun = persistedRunFromContent(content);
  const finalRun = persistedRun ?? FeedbackRunSchema.parse(run);
  if (!persistedRun) {
    await store.appendContent(chunkSheetContent(JSON.stringify(finalRun)).map((text, index) => ({
      submissionId: preparation.submissionId,
      contentType: "run_json" as const,
      part: index + 1,
      text,
    })));
  }
  await bestEffortSaveRun(finalRun);
  await createAttemptGateClient().complete({
    googleSubject: preparation.googleSubject,
    submissionId: preparation.submissionId,
    updatedAt: new Date().toISOString(),
  });
  return {
    submissionId: preparation.submissionId,
    status: "completed",
    runId: finalRun.id,
  };
}

export async function failStudentFeedback(
  preparation: Extract<StudentFeedbackPreparation, { kind: "ready" }>,
  message: string,
): Promise<StudentWorkflowResult> {
  // A finalization step may have saved the paid model output immediately before
  // its completion call failed. Reconcile that state instead of refunding a
  // submission whose feedback is already durable and ready to serve.
  const persistedRun = persistedRunFromContent(
    await createStore().listContent(preparation.submissionId),
  );
  if (persistedRun) {
    await bestEffortSaveRun(persistedRun);
    await createAttemptGateClient().complete({
      googleSubject: preparation.googleSubject,
      submissionId: preparation.submissionId,
      updatedAt: new Date().toISOString(),
    });
    return {
      submissionId: preparation.submissionId,
      status: "completed",
      runId: persistedRun.id,
    };
  }

  // The submission ID is already a unique UUID and makes retries return the
  // same reference even if the failure step itself is replayed.
  const errorReference = preparation.submissionId;
  try {
    await saveFailure({
      source: "student",
      examId: preparation.input.examId,
      studentLabel: preparation.input.studentLabel,
      answer: preparation.input.answer,
      message,
    });
  } catch (storeError) {
    console.warn("Legacy failure-store write skipped", storeError);
  }
  await createAttemptGateClient().refund({
    googleSubject: preparation.googleSubject,
    submissionId: preparation.submissionId,
    updatedAt: new Date().toISOString(),
    errorReference,
  });
  console.error(`Student feedback failed (${errorReference})`, message);
  return {
    submissionId: preparation.submissionId,
    status: "failed",
    errorReference,
  };
}

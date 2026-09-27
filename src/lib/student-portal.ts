import "server-only";

import { buildSyntheticRoster } from "@/lib/synthetic-students";
import { remainingAttempts, type StudentRecord } from "@/lib/student-records";
import { createGoogleSheetsClient } from "@/lib/google-sheets";
import { GoogleSheetsRecordStore } from "@/lib/google-sheets-records";

export type StudentHistoryItem = {
  id: string;
  examLabel: string;
  formLabel: string;
  submittedAt: string;
  status: "complete" | "in_progress" | "failed";
  band?: string;
};

export type StudentPortalModel = {
  student: StudentRecord;
  remainingAttempts: number;
  history: StudentHistoryItem[];
  synthetic: boolean;
  demoIndex: number;
};

export function syntheticPortalEnabled(): boolean {
  return process.env.STUDENT_DEMO_MODE === "true"
    || (process.env.NODE_ENV === "development" && process.env.STUDENT_DEMO_MODE !== "false");
}

export function getSyntheticPortalModel(requestedIndex = 1): StudentPortalModel {
  const roster = buildSyntheticRoster();
  const demoIndex = Math.min(roster.length, Math.max(1, Math.trunc(requestedIndex) || 1));
  const student = roster[demoIndex - 1];
  const dates = ["2026-09-12T18:22:00.000Z", "2026-09-08T15:40:00.000Z", "2026-09-03T20:05:00.000Z"];
  const exams = ["2019 final", "2015 final · Question 2", "2023 graded assignment"];
  const history: StudentHistoryItem[] = Array.from({ length: Math.min(student.attemptsConsumed, 3) }, (_, index) => ({
    id: `synthetic-${demoIndex}-${index + 1}`,
    examLabel: exams[index],
    formLabel: index === 1 ? "Bullet-point outline" : "Written draft",
    submittedAt: dates[index],
    status: "complete",
    band: index === 0 ? "H" : index === 1 ? undefined : "P",
  }));
  if (student.activeSubmissionId) {
    history.unshift({
      id: student.activeSubmissionId,
      examLabel: "2019 final",
      formLabel: "Written draft",
      submittedAt: new Date().toISOString(),
      status: "in_progress",
    });
  }
  return {
    student,
    remainingAttempts: remainingAttempts(student),
    history,
    synthetic: true,
    demoIndex,
  };
}

export async function getSheetsPortalModel(
  studentId: string,
  expectedPseudonym: string,
): Promise<StudentPortalModel> {
  const store = new GoogleSheetsRecordStore(createGoogleSheetsClient());
  const [students, submissions] = await Promise.all([store.listStudents(), store.listSubmissions()]);
  const student = students.find((candidate) => candidate.studentId === studentId);
  if (!student || student.pseudonym !== expectedPseudonym || student.status !== "active") {
    throw new Error("The authenticated account no longer has an active course enrollment.");
  }
  const history: StudentHistoryItem[] = submissions
    .filter((submission) => submission.pseudonym === student.pseudonym)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((submission) => ({
      id: submission.submissionId,
      examLabel: submission.questionRef
        ? `${submission.examId} · ${submission.questionRef}`
        : submission.examId,
      formLabel: submission.mode === "bullet_points" ? "Bullet-point outline" : "Written draft",
      submittedAt: submission.createdAt,
      status: submission.status === "completed"
        ? "complete"
        : submission.status === "failed" || submission.status === "refunded"
          ? "failed"
          : "in_progress",
    }));
  return {
    student,
    remainingAttempts: remainingAttempts(student),
    history,
    synthetic: false,
    demoIndex: 0,
  };
}

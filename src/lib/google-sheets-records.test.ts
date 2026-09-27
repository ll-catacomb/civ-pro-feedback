import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  contentToRow,
  rowToContent,
  rowToStudent,
  rowToSubmission,
  studentToRow,
  submissionToRow,
} from "@/lib/google-sheets-records";
import type { StudentRecord, SubmissionContent, SubmissionRecord } from "@/lib/student-records";
import { hashEnrollmentCode } from "@/lib/student-records";

describe("Google Sheets record serialization", () => {
  it("round-trips enrollment rows", () => {
    const record: StudentRecord = {
      studentId: randomUUID(),
      enrollmentCodeHash: hashEnrollmentCode("CIVP-2345-6789-ABCD-EFGH"),
      section: "Section 2",
      pseudonym: "copper-horse",
      status: "active",
      maxAttempts: 5,
      attemptsConsumed: 1,
      activeSubmissionId: null,
      createdAt: "2026-09-01T12:00:00.000Z",
      lastLoginAt: null,
    };
    expect(rowToStudent(studentToRow(record))).toEqual(record);
  });

  it("round-trips submission rows", () => {
    const record: SubmissionRecord = {
      submissionId: randomUUID(),
      pseudonym: "copper-horse",
      requestKey: "browser-request-1",
      status: "queued",
      stage: "waiting",
      attemptNumber: 2,
      examId: "2019-final",
      scope: "single_question",
      mode: "bullet_points",
      questionRef: "Question 2",
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
      promptVersion: "test",
    };
    expect(rowToSubmission(submissionToRow(record))).toEqual(record);
  });

  it("round-trips content rows", () => {
    const record: SubmissionContent = {
      submissionId: randomUUID(),
      contentType: "student_answer",
      part: 1,
      text: "An answer with commas, tabs\t, and line breaks.\nSecond paragraph.",
    };
    expect(rowToContent(contentToRow(record))).toEqual(record);
  });
});

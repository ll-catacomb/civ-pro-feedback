import "server-only";

import { z } from "zod";

import {
  StudentRecordSchema,
  SubmissionContentSchema,
  SubmissionRecordSchema,
  type StudentRecord,
  type SubmissionContent,
  type SubmissionRecord,
} from "@/lib/student-records";
import {
  GoogleSheetsClient,
  readGoogleSheetsConfiguration,
  type GoogleSheetsConfiguration,
} from "@/lib/google-sheets";

export const IDENTITY_SHEET = "Enrollment";
export const SUBMISSIONS_SHEET = "Submissions";
export const CONTENT_SHEET = "Content";

export const IDENTITY_HEADERS = [
  "student_id",
  "google_subject",
  "email",
  "pseudonym",
  "status",
  "max_attempts",
  "attempts_consumed",
  "active_submission_id",
  "created_at",
  "last_login_at",
] as const;

export const SUBMISSION_HEADERS = [
  "submission_id",
  "pseudonym",
  "request_key",
  "status",
  "stage",
  "attempt_number",
  "exam_id",
  "scope",
  "mode",
  "question_ref",
  "created_at",
  "updated_at",
  "prompt_version",
  "error_reference",
] as const;

export const CONTENT_HEADERS = [
  "submission_id",
  "content_type",
  "part",
  "text",
] as const;

function text(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function integer(value: unknown, label: string): number {
  const parsed = Number.parseInt(text(value), 10);
  if (!Number.isInteger(parsed)) throw new Error(`Invalid integer in Google Sheets column ${label}.`);
  return parsed;
}

export function studentToRow(student: StudentRecord): string[] {
  return [
    student.studentId,
    student.googleSubject,
    student.email,
    student.pseudonym,
    student.status,
    String(student.maxAttempts),
    String(student.attemptsConsumed),
    student.activeSubmissionId ?? "",
    student.createdAt,
    student.lastLoginAt ?? "",
  ];
}

export function rowToStudent(row: unknown[]): StudentRecord {
  return StudentRecordSchema.parse({
    studentId: text(row[0]),
    googleSubject: text(row[1]),
    email: text(row[2]),
    pseudonym: text(row[3]),
    status: text(row[4]),
    maxAttempts: integer(row[5], "max_attempts"),
    attemptsConsumed: integer(row[6], "attempts_consumed"),
    activeSubmissionId: text(row[7]) || null,
    createdAt: text(row[8]),
    lastLoginAt: text(row[9]) || null,
  });
}

export function submissionToRow(submission: SubmissionRecord): string[] {
  return [
    submission.submissionId,
    submission.pseudonym,
    submission.requestKey,
    submission.status,
    submission.stage,
    String(submission.attemptNumber),
    submission.examId,
    submission.scope,
    submission.mode,
    submission.questionRef ?? "",
    submission.createdAt,
    submission.updatedAt,
    submission.promptVersion,
    submission.errorReference ?? "",
  ];
}

export function rowToSubmission(row: unknown[]): SubmissionRecord {
  return SubmissionRecordSchema.parse({
    submissionId: text(row[0]),
    pseudonym: text(row[1]),
    requestKey: text(row[2]),
    status: text(row[3]),
    stage: text(row[4]),
    attemptNumber: integer(row[5], "attempt_number"),
    examId: text(row[6]),
    scope: text(row[7]),
    mode: text(row[8]),
    questionRef: text(row[9]) || undefined,
    createdAt: text(row[10]),
    updatedAt: text(row[11]),
    promptVersion: text(row[12]),
    errorReference: text(row[13]) || undefined,
  });
}

export function contentToRow(content: SubmissionContent): (string | number)[] {
  return [content.submissionId, content.contentType, content.part, content.text];
}

export function rowToContent(row: unknown[]): SubmissionContent {
  return SubmissionContentSchema.parse({
    submissionId: text(row[0]),
    contentType: text(row[1]),
    part: integer(row[2], "part"),
    text: text(row[3]),
  });
}

function assertHeaders(actual: unknown[] | undefined, expected: readonly string[], sheet: string): void {
  if (!actual || expected.some((header, index) => text(actual[index]) !== header)) {
    throw new Error(`The ${sheet} sheet does not have the expected header row.`);
  }
}

export class GoogleSheetsRecordStore {
  constructor(
    private readonly client: GoogleSheetsClient,
    private readonly configuration: GoogleSheetsConfiguration = readGoogleSheetsConfiguration(),
  ) {}

  async listStudents(): Promise<StudentRecord[]> {
    const rows = await this.client.readValues(
      this.configuration.identitySpreadsheetId,
      `${IDENTITY_SHEET}!A:J`,
    );
    if (rows.length === 0) return [];
    assertHeaders(rows[0], IDENTITY_HEADERS, IDENTITY_SHEET);
    return rows.slice(1).filter((row) => row.some((value) => text(value))).map(rowToStudent);
  }

  async listSubmissions(): Promise<SubmissionRecord[]> {
    const rows = await this.client.readValues(
      this.configuration.feedbackSpreadsheetId,
      `${SUBMISSIONS_SHEET}!A:N`,
    );
    if (rows.length === 0) return [];
    assertHeaders(rows[0], SUBMISSION_HEADERS, SUBMISSIONS_SHEET);
    return rows.slice(1).filter((row) => row.some((value) => text(value))).map(rowToSubmission);
  }

  async getSubmission(submissionId: string): Promise<SubmissionRecord | undefined> {
    return (await this.listSubmissions()).find((submission) => submission.submissionId === submissionId);
  }

  async listContent(submissionId?: string): Promise<SubmissionContent[]> {
    const rows = await this.client.readValues(
      this.configuration.feedbackSpreadsheetId,
      `${CONTENT_SHEET}!A:D`,
    );
    if (rows.length === 0) return [];
    assertHeaders(rows[0], CONTENT_HEADERS, CONTENT_SHEET);
    return rows.slice(1)
      .filter((row) => row.some((value) => text(value)))
      .map(rowToContent)
      .filter((content) => !submissionId || content.submissionId === submissionId);
  }

  async appendSubmission(submission: SubmissionRecord, content: SubmissionContent[]): Promise<void> {
    const validSubmission = SubmissionRecordSchema.parse(submission);
    const validContent = z.array(SubmissionContentSchema).parse(content);
    // Appends are intentionally used instead of calculating row numbers: two
    // concurrent workers must never overwrite one another. Attempt reservation
    // itself will be serialized by the Apps Script lock gate.
    await this.client.appendValues(
      this.configuration.feedbackSpreadsheetId,
      `${SUBMISSIONS_SHEET}!A:N`,
      [submissionToRow(validSubmission)],
    );
    if (validContent.length) {
      await this.client.appendValues(
        this.configuration.feedbackSpreadsheetId,
        `${CONTENT_SHEET}!A:D`,
        validContent.map(contentToRow),
      );
    }
  }

  async appendContent(content: SubmissionContent[]): Promise<void> {
    const validContent = z.array(SubmissionContentSchema).parse(content);
    if (!validContent.length) return;
    await this.client.appendValues(
      this.configuration.feedbackSpreadsheetId,
      `${CONTENT_SHEET}!A:D`,
      validContent.map(contentToRow),
    );
  }

  /**
   * Initializes empty, pre-created tabs with headers and synthetic students.
   * It refuses to touch a workbook once any of the target ranges contain data.
   */
  async initializeSyntheticWorkbooks(students: StudentRecord[]): Promise<void> {
    const [identity, submissions, content] = await Promise.all([
      this.client.readValues(this.configuration.identitySpreadsheetId, `${IDENTITY_SHEET}!A1:J2`),
      this.client.readValues(this.configuration.feedbackSpreadsheetId, `${SUBMISSIONS_SHEET}!A1:N2`),
      this.client.readValues(this.configuration.feedbackSpreadsheetId, `${CONTENT_SHEET}!A1:D2`),
    ]);
    if (identity.length || submissions.length || content.length) {
      throw new Error("Synthetic initialization requires empty Enrollment, Submissions, and Content sheets.");
    }
    const validStudents = z.array(StudentRecordSchema).parse(students);
    await Promise.all([
      this.client.writeValues(this.configuration.identitySpreadsheetId, `${IDENTITY_SHEET}!A1:J`, [
        [...IDENTITY_HEADERS],
        ...validStudents.map(studentToRow),
      ]),
      this.client.batchWriteValues(this.configuration.feedbackSpreadsheetId, [
        { range: `${SUBMISSIONS_SHEET}!A1:N`, values: [[...SUBMISSION_HEADERS]] },
        { range: `${CONTENT_SHEET}!A1:D`, values: [[...CONTENT_HEADERS]] },
      ]),
    ]);
  }
}

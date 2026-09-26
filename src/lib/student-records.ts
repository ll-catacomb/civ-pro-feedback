import { createHash } from "node:crypto";

import { z } from "zod";

export const StudentStatusSchema = z.enum(["active", "disabled"]);

export const StudentRecordSchema = z.object({
  studentId: z.string().uuid(),
  // Empty until an allowlisted roster email completes its first Google login.
  googleSubject: z.string(),
  email: z.string().email(),
  pseudonym: z.string().regex(/^[a-z]+-[a-z]+$/),
  status: StudentStatusSchema,
  maxAttempts: z.number().int().positive(),
  attemptsConsumed: z.number().int().nonnegative(),
  activeSubmissionId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  lastLoginAt: z.string().datetime().nullable(),
});

export type StudentRecord = z.infer<typeof StudentRecordSchema>;

export const SubmissionStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "refunded",
]);

export const SubmissionRecordSchema = z.object({
  submissionId: z.string().uuid(),
  pseudonym: z.string().regex(/^[a-z]+-[a-z]+$/),
  requestKey: z.string().min(1),
  status: SubmissionStatusSchema,
  stage: z.string(),
  attemptNumber: z.number().int().positive(),
  examId: z.string().min(1),
  scope: z.enum(["full_exam", "single_question"]),
  mode: z.enum(["full_draft", "bullet_points"]),
  questionRef: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  promptVersion: z.string(),
  errorReference: z.string().optional(),
});

export type SubmissionRecord = z.infer<typeof SubmissionRecordSchema>;

export const SubmissionContentSchema = z.object({
  submissionId: z.string().uuid(),
  contentType: z.enum(["student_answer", "final_feedback", "run_json", "stage_artifact"]),
  part: z.number().int().positive(),
  text: z.string(),
});

export type SubmissionContent = z.infer<typeof SubmissionContentSchema>;

export class AttemptReservationError extends Error {
  constructor(public readonly code: "disabled" | "limit_reached" | "already_running") {
    const messages = {
      disabled: "This course account is disabled.",
      limit_reached: "All available feedback attempts have been used.",
      already_running: "A feedback submission is already in progress.",
    } as const;
    super(messages[code]);
    this.name = "AttemptReservationError";
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function remainingAttempts(student: StudentRecord): number {
  const reserved = student.activeSubmissionId ? 1 : 0;
  return Math.max(0, student.maxAttempts - student.attemptsConsumed - reserved);
}

export function reserveAttempt(
  student: StudentRecord,
  submissionId: string,
): { student: StudentRecord; attemptNumber: number } {
  if (student.status !== "active") throw new AttemptReservationError("disabled");
  if (student.activeSubmissionId) throw new AttemptReservationError("already_running");
  if (student.attemptsConsumed >= student.maxAttempts) {
    throw new AttemptReservationError("limit_reached");
  }
  return {
    student: StudentRecordSchema.parse({ ...student, activeSubmissionId: submissionId }),
    attemptNumber: student.attemptsConsumed + 1,
  };
}

export function completeAttempt(student: StudentRecord, submissionId: string): StudentRecord {
  if (student.activeSubmissionId !== submissionId) {
    throw new Error("The completed submission does not match the student's active reservation.");
  }
  return StudentRecordSchema.parse({
    ...student,
    activeSubmissionId: null,
    attemptsConsumed: student.attemptsConsumed + 1,
  });
}

export function refundAttempt(student: StudentRecord, submissionId: string): StudentRecord {
  if (student.activeSubmissionId !== submissionId) {
    throw new Error("The refunded submission does not match the student's active reservation.");
  }
  return StudentRecordSchema.parse({ ...student, activeSubmissionId: null });
}

const MATERIALS = [
  "amber", "brass", "bronze", "cedar", "copper", "crystal", "flint", "glass",
  "granite", "iron", "linen", "marble", "oak", "onyx", "paper", "pewter",
  "quartz", "silver", "slate", "willow",
] as const;

const ANIMALS = [
  "badger", "bear", "beaver", "bison", "crane", "deer", "dolphin", "falcon",
  "fox", "hare", "heron", "horse", "lynx", "otter", "owl", "raven", "seal",
  "sparrow", "turtle", "wolf",
] as const;

export const PSEUDONYM_CAPACITY = MATERIALS.length * ANIMALS.length;

/**
 * Produces a stable starting point and then probes the complete name space.
 * The caller must run assignment under the shared roster lock and persist the
 * returned value before releasing it.
 */
export function assignPseudonym(stableIdentity: string, usedNames: ReadonlySet<string>): string {
  if (usedNames.size >= PSEUDONYM_CAPACITY) {
    throw new Error("The pseudonym pool is exhausted.");
  }
  const digest = createHash("sha256").update(stableIdentity).digest();
  const start = digest.readUInt32BE(0) % PSEUDONYM_CAPACITY;
  for (let offset = 0; offset < PSEUDONYM_CAPACITY; offset += 1) {
    const index = (start + offset) % PSEUDONYM_CAPACITY;
    const material = MATERIALS[Math.floor(index / ANIMALS.length)];
    const animal = ANIMALS[index % ANIMALS.length];
    const candidate = `${material}-${animal}`;
    if (!usedNames.has(candidate)) return candidate;
  }
  throw new Error("The pseudonym pool is exhausted.");
}

// Google Sheets cells should stay comfortably below the documented 50,000
// character import ceiling. Smaller chunks also keep API payloads manageable.
export const SHEET_CONTENT_CHUNK_SIZE = 40_000;

export function chunkSheetContent(text: string): string[] {
  if (!text) return [""];
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += SHEET_CONTENT_CHUNK_SIZE) {
    chunks.push(text.slice(index, index + SHEET_CONTENT_CHUNK_SIZE));
  }
  return chunks;
}

export function joinSheetContent(parts: readonly { part: number; text: string }[]): string {
  return [...parts]
    .sort((left, right) => left.part - right.part)
    .map((part) => part.text)
    .join("");
}

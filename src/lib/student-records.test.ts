import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  AttemptReservationError,
  assignPseudonym,
  chunkSheetContent,
  completeAttempt,
  joinSheetContent,
  refundAttempt,
  remainingAttempts,
  reserveAttempt,
  type StudentRecord,
} from "@/lib/student-records";

function student(overrides: Partial<StudentRecord> = {}): StudentRecord {
  return {
    studentId: randomUUID(),
    googleSubject: "google-subject-1",
    email: "student@example.test",
    pseudonym: "amber-owl",
    status: "active",
    maxAttempts: 5,
    attemptsConsumed: 2,
    activeSubmissionId: null,
    createdAt: "2026-09-01T12:00:00.000Z",
    lastLoginAt: null,
    ...overrides,
  };
}

describe("student attempt accounting", () => {
  it("reserves, completes, and counts one attempt", () => {
    const submissionId = randomUUID();
    const reserved = reserveAttempt(student(), submissionId);
    expect(reserved.attemptNumber).toBe(3);
    expect(remainingAttempts(reserved.student)).toBe(2);

    const completed = completeAttempt(reserved.student, submissionId);
    expect(completed.attemptsConsumed).toBe(3);
    expect(completed.activeSubmissionId).toBeNull();
    expect(remainingAttempts(completed)).toBe(2);
  });

  it("refunds a failed reservation without consuming an attempt", () => {
    const submissionId = randomUUID();
    const reserved = reserveAttempt(student(), submissionId).student;
    const refunded = refundAttempt(reserved, submissionId);
    expect(refunded.attemptsConsumed).toBe(2);
    expect(remainingAttempts(refunded)).toBe(3);
  });

  it("rejects disabled, exhausted, and already-running students", () => {
    expect(() => reserveAttempt(student({ status: "disabled" }), randomUUID()))
      .toThrowError(new AttemptReservationError("disabled"));
    expect(() => reserveAttempt(student({ attemptsConsumed: 5 }), randomUUID()))
      .toThrowError(new AttemptReservationError("limit_reached"));
    expect(() => reserveAttempt(student({ activeSubmissionId: randomUUID() }), randomUUID()))
      .toThrowError(new AttemptReservationError("already_running"));
  });
});

describe("student pseudonyms", () => {
  it("is stable and probes past collisions", () => {
    const first = assignPseudonym("same-student", new Set());
    expect(assignPseudonym("same-student", new Set())).toBe(first);
    expect(assignPseudonym("same-student", new Set([first]))).not.toBe(first);
  });
});

describe("Google Sheets content chunks", () => {
  it("round-trips content that cannot fit safely in one cell", () => {
    const original = "civil procedure ".repeat(8_000);
    const chunks = chunkSheetContent(original);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 40_000)).toBe(true);
    expect(joinSheetContent(chunks.map((text, index) => ({ part: index + 1, text })))).toBe(original);
  });
});

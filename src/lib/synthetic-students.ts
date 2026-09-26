import { randomUUID } from "node:crypto";

import { assignPseudonym, type StudentRecord } from "@/lib/student-records";

/** Development-only roster with deliberately varied attempt states. */
export function buildSyntheticRoster(count = 30): StudentRecord[] {
  const usedNames = new Set<string>();
  const now = new Date("2026-09-01T12:00:00.000Z").toISOString();

  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const googleSubject = `synthetic-google-subject-${number.toString().padStart(3, "0")}`;
    const pseudonym = assignPseudonym(googleSubject, usedNames);
    usedNames.add(pseudonym);
    return {
      studentId: randomUUID(),
      googleSubject,
      email: `student${number.toString().padStart(3, "0")}@example.test`,
      pseudonym,
      status: number === count ? "disabled" : "active",
      maxAttempts: 5,
      attemptsConsumed: number === count - 1 ? 5 : number === count - 2 ? 4 : (number - 1) % 3,
      activeSubmissionId: null,
      createdAt: now,
      lastLoginAt: null,
    };
  });
}

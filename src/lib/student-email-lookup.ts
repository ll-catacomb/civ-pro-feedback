import "server-only";

import { createHmac } from "node:crypto";

import { normalizeEmail } from "@/lib/student-records";

const LOOKUP_NAMESPACE = "civ-pro-feedback/student-email/v1\0";

/**
 * Produces the opaque value stored in the private Enrollment sheet. A keyed
 * hash prevents someone with Sheet access from testing a list of likely
 * Harvard addresses against the stored values.
 */
export function hashStudentEmail(email: string, secret: string): string {
  const normalized = normalizeEmail(email);
  if (!normalized || !secret) throw new Error("Student email lookup is not configured.");
  return createHmac("sha256", secret)
    .update(`${LOOKUP_NAMESPACE}${normalized}`)
    .digest("hex");
}

export function studentEmailLookupConfigured(): boolean {
  return Boolean(process.env.STUDENT_EMAIL_LOOKUP_SECRET?.trim());
}

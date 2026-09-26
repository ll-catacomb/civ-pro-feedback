import "server-only";

export function staffEmails(): Set<string> {
  return new Set(
    (process.env.STAFF_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isStaffEmail(email: string | null | undefined): boolean {
  return Boolean(email && staffEmails().has(email.trim().toLowerCase()));
}

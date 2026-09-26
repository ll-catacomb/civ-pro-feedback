import { afterEach, describe, expect, it } from "vitest";

import { isStaffEmail, staffEmails } from "@/lib/staff-emails";

const originalStaffEmails = process.env.STAFF_EMAILS;

afterEach(() => {
  if (originalStaffEmails === undefined) delete process.env.STAFF_EMAILS;
  else process.env.STAFF_EMAILS = originalStaffEmails;
});

describe("staff email allowlist", () => {
  it("normalizes whitespace and case", () => {
    process.env.STAFF_EMAILS = " Professor@Example.edu,ta@example.edu ";

    expect(staffEmails()).toEqual(new Set(["professor@example.edu", "ta@example.edu"]));
    expect(isStaffEmail("PROFESSOR@example.edu")).toBe(true);
  });

  it("rejects addresses that are not explicitly listed", () => {
    process.env.STAFF_EMAILS = "professor@example.edu";

    expect(isStaffEmail("student@example.edu")).toBe(false);
  });

  it("defaults to an empty allowlist", () => {
    delete process.env.STAFF_EMAILS;

    expect(staffEmails().size).toBe(0);
    expect(isStaffEmail(undefined)).toBe(false);
  });
});

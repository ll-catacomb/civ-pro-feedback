import { describe, expect, it } from "vitest";

import { hashStudentEmail } from "@/lib/student-email-lookup";

describe("student email lookup", () => {
  it("normalizes email case and surrounding whitespace", () => {
    expect(hashStudentEmail(" Student@JD28.LAW.HARVARD.EDU ", "a sufficiently long secret"))
      .toBe(hashStudentEmail("student@jd28.law.harvard.edu", "a sufficiently long secret"));
  });

  it("depends on the private lookup secret", () => {
    expect(hashStudentEmail("student@law.harvard.edu", "first private secret"))
      .not.toBe(hashStudentEmail("student@law.harvard.edu", "second private secret"));
  });

  it("returns the 64-character value expected by the attempt gate", () => {
    expect(hashStudentEmail("student@g.harvard.edu", "a sufficiently long secret"))
      .toMatch(/^[a-f0-9]{64}$/);
  });
});

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { rankExamMatches } from "@/lib/exam-match";

describe("historical-exam fingerprinting", () => {
  it("identifies the mislabeled P fixture as the 2014 final, not the 2015 final", () => {
    const answer = fs.readFileSync(
      path.join(process.cwd(), "content", "calibration", "2015-p.md"),
      "utf8",
    );
    const result = rankExamMatches(answer, "content/course/exams/2015-final.md");
    expect(result.matches[0]?.path).toBe("content/course/exams/2014-final.md");
    expect(result.matches[0]?.sharedDistinctiveTerms).toEqual(
      expect.arrayContaining(["clearwater", "diggle", "lupinbank"]),
    );
    expect(result.selectedRank).toBeGreaterThan(1);
  });
});

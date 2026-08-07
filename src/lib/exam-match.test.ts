import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { rankExamMatches } from "@/lib/exam-match";

describe("historical-exam fingerprinting", () => {
  // The answer originally supplied for this slot was a 2014 answer sent under a
  // 2015 filename, and this check is what caught it. It now guards the
  // replacement: the genuine 2015 P answer must fingerprint to its own exam.
  it("fingerprints the 2015 P answer to the 2015 final", () => {
    const answer = fs.readFileSync(
      path.join(process.cwd(), "content", "calibration", "2015-p.md"),
      "utf8",
    );
    const result = rankExamMatches(answer, "content/course/exams/2015-final.md");
    expect(result.matches[0]?.path).toBe("content/course/exams/2015-final.md");
    expect(result.selectedRank).toBe(1);
    expect(result.matches[0]?.sharedDistinctiveTerms).not.toEqual(
      expect.arrayContaining(["clearwater", "diggle", "lupinbank"]),
    );
  });
});

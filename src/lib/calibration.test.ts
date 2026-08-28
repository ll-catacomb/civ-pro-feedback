import { describe, expect, it } from "vitest";

import { CALIBRATION_FIXTURES, getCalibrationFixture, gradeDistance } from "./calibration";
import { isKnownExamId } from "./exams";

describe("calibration fixture discovery", () => {
  it("discovers a graded ladder from the filenames on disk", () => {
    // `<year>-<band>.md` is the whole contract: adding a year's graded answers
    // is a content drop, no code change. The 8/2026 import took this from two
    // years (2015, 2019) to thirteen, so most practicable exams now band against
    // same-exam references instead of falling back across cohorts.
    const ids = CALIBRATION_FIXTURES.map((fixture) => fixture.id);
    expect(ids.length).toBeGreaterThanOrEqual(36);
    // The two originally-calibrated years keep complete DS/H/P/LP ladders.
    for (const band of ["ds", "h", "p", "lp"]) {
      expect(ids).toContain(`2015-${band}`);
      expect(ids).toContain(`2019-${band}`);
    }
    expect(ids).toContain("2021-ds");
    expect(ids).toContain("2022-p");
    for (const fixture of CALIBRATION_FIXTURES) {
      expect(fixture.examId).toBe(`${fixture.id.slice(0, 4)}-final`);
      expect(fixture.status).toBe("ready");
    }
  });

  it("only holds fixtures whose exam is actually practicable", () => {
    // A fixture pointing at an exam the registry withholds cannot be run as a
    // benchmark: the calibration route resolves getExam(fixture.examId) and
    // would throw. 2008 and 2025 have no exam in the corpus; 2024's final has
    // no model answer, so it is withheld. Graded answers exist for all three
    // and are deliberately not installed.
    const years = new Set(CALIBRATION_FIXTURES.map((fixture) => fixture.id.slice(0, 4)));
    expect(years.has("2008")).toBe(false);
    expect(years.has("2024")).toBe(false);
    expect(years.has("2025")).toBe(false);
    for (const fixture of CALIBRATION_FIXTURES) {
      expect(isKnownExamId(fixture.examId)).toBe(true);
    }
  });

  it("keeps Exam4 chrome out of every fixture", () => {
    // The source PDFs stamp a header on every page and a word-count table on
    // the first; left in, the chain reads them as the student's own writing.
    for (const fixture of CALIBRATION_FIXTURES) {
      const answer = getCalibrationFixture(fixture.id).answer;
      expect(answer).not.toMatch(/Institution Harvard Law School/i);
      expect(answer).not.toMatch(/Extegrity|Exam Mode|Count\(s\)/i);
      expect(answer).not.toMatch(/Page \d+ of \d+/i);
      // And the answer must not open on a bare anonymous exam ID.
      expect(answer.split("\n")[0]).not.toMatch(/^[\d\s,]+$/);
    }
  });

  it("maps each filename suffix to the right band", () => {
    const bands = Object.fromEntries(CALIBRATION_FIXTURES.map((f) => [f.id, f.actualGrade]));
    expect(bands["2015-ds"]).toBe("DS");
    expect(bands["2015-h"]).toBe("H");
    expect(bands["2015-p"]).toBe("P");
    expect(bands["2015-lp"]).toBe("LP");
  });

  it("keeps hand-written provenance and grader comments through discovery", () => {
    // These cannot be derived from a filename, so they are overlaid by id and
    // would be silently lost if discovery replaced them.
    const p2015 = CALIBRATION_FIXTURES.find((fixture) => fixture.id === "2015-p");
    expect(p2015?.note).toMatch(/mislabeled|2014 answer/i);
    const lp2019 = CALIBRATION_FIXTURES.find((fixture) => fixture.id === "2019-lp");
    expect(lp2019?.historicalFeedback).toHaveLength(3);
    expect(lp2019?.historicalFeedback?.[0].text).toMatch(/go through the analysis/i);
  });

  it("loads the answer text for every discovered fixture", () => {
    for (const fixture of CALIBRATION_FIXTURES) {
      expect(getCalibrationFixture(fixture.id).answer.length).toBeGreaterThan(500);
    }
    expect(() => getCalibrationFixture("2099-ds")).toThrow(/Unknown calibration fixture/);
  });

  it("measures band distance in both directions", () => {
    expect(gradeDistance("DS", "DS")).toBe(0);
    expect(gradeDistance("H", "DS")).toBe(1);
    expect(gradeDistance("P", "DS")).toBe(2);
    expect(gradeDistance("LP", "DS")).toBe(3);
    expect(gradeDistance("DS", "LP")).toBe(3);
  });
});

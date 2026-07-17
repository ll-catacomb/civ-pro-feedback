import { describe, expect, it } from "vitest";

import { buildAnchorPack, exemplarAssignmentAnswers, gradedAnchorFixtures } from "./anchors";

describe("anchor pack blindness", () => {
  it("never includes the answer under review in its own anchor stack", () => {
    for (const fixtureId of ["2015-ds", "2015-h", "2015-lp", "2019-ds", "2019-p", "2014-p"]) {
      const examId = `${fixtureId.slice(0, 4)}-final` as "2014-final" | "2015-final" | "2019-final";
      const anchorIds = gradedAnchorFixtures(examId, fixtureId).map((anchor) => anchor.fixtureId);
      expect(anchorIds).not.toContain(fixtureId);
    }
  });

  it("prefers same-exam anchors and back-fills only the excluded answer's own band", () => {
    const anchors = gradedAnchorFixtures("2015-final", "2015-h");
    const sameExam = anchors.filter((anchor) => anchor.sameExam).map((anchor) => anchor.fixtureId).sort();
    expect(sameExam).toEqual(["2015-ds", "2015-lp"]);
    // The excluded fixture's own band gets a cross-year reference so its band
    // interval is never unanchored during calibration.
    const crossYear = anchors.filter((anchor) => !anchor.sameExam);
    expect(crossYear.map((anchor) => anchor.band)).toEqual(["H"]);
  });

  it("gives an excluded LP fixture a cross-year LP floor", () => {
    const anchors = gradedAnchorFixtures("2015-final", "2015-lp");
    const lpAnchor = anchors.find((anchor) => anchor.band === "LP");
    expect(lpAnchor).toBeDefined();
    expect(lpAnchor?.sameExam).toBe(false);
  });

  it("falls back to other years only when the same-exam stack is thin", () => {
    const anchors = gradedAnchorFixtures("2014-final", "2014-p");
    expect(anchors.length).toBeGreaterThan(0);
    expect(anchors.every((anchor) => !anchor.sameExam)).toBe(true);
  });

  it("anchors the full band ladder", () => {
    const bands = gradedAnchorFixtures("2019-final").map((anchor) => anchor.band);
    for (const band of ["DS", "H", "P", "LP"]) expect(bands).toContain(band);
  });
});

describe("anchor pack contents", () => {
  it("includes graded bands, exemplars, and usage discipline", () => {
    const pack = buildAnchorPack("2015-final");
    expect(pack).toContain("actual instructor band: DS");
    expect(pack).toContain("actual instructor band: LP");
    expect(pack).toContain("Instructor-selected assignment answer 1");
    expect(pack).toContain("as doctrinal authority");
    expect(pack).toContain("never reference or infer any author's identity");
  });

  it("pulls same-year assignment exemplars", () => {
    expect(exemplarAssignmentAnswers("2019-final").length).toBeGreaterThan(0);
    expect(exemplarAssignmentAnswers("2014-final").length).toBeGreaterThan(0);
  });
});

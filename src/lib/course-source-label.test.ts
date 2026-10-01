import { describe, expect, it } from "vitest";

import { courseSourceAnchor, courseSourceLabel } from "./course-source-label";

describe("course source labels", () => {
  it("makes opaque casebook day titles explicit", () => {
    expect(courseSourceLabel({
      title: "Day 9",
      path: "content/course/casebook/09-day-09.md",
    })).toBe("Online casebook · Day 9");
  });

  it("labels common course-material groups", () => {
    expect(courseSourceLabel({
      title: "Class 18 – Appellate Litigation",
      path: "content/course/outline/class18-ivanka-notes.md",
    })).toBe("Class notes · Class 18 – Appellate Litigation");
    expect(courseSourceLabel({
      title: "Appellate Jurisdiction",
      path: "content/course/slides-(pictures)/appeals.md",
    })).toBe("Course slides · Appellate Jurisdiction");
  });

  it("distinguishes a past student answer from authoritative course material", () => {
    expect(courseSourceLabel({
      title: "Assignment 3 model answer",
      path: "content/course/assignments/2018-assignment-03-ravinsky-model-answer.md",
    })).toBe("Past student exemplar · Assignment 3 model answer");
  });

  it("creates safe stable in-page anchors", () => {
    expect(courseSourceAnchor("C-content/course:day 9#2")).toBe("course-source-C-content-course-day-9-2");
  });
});

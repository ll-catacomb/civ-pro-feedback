import { describe, expect, it } from "vitest";

import { countQuestions, getExam, getExams, isKnownExamId, listIncompleteExams } from "./exams";

describe("exam registry", () => {
  it("discovers every year that has both an exam and a model answer", () => {
    const years = getExams().filter((item) => item.kind === "final").map((item) => item.year);
    // 2007 and 2009-2025. 2008 was never imported. Two genuinely different
    // 2025 practice versions appear separately and pair with their own keys.
    expect(years).toContain(2007);
    expect(years).toContain(2015);
    expect(years).toContain(2023);
    expect(years).toContain(2024);
    expect(years.filter((year) => year === 2025)).toHaveLength(2);
    expect(years.length).toBeGreaterThanOrEqual(19);
    // Newest first, so the dropdown opens on the most recent paper.
    expect(years).toEqual([...years].sort((left, right) => right - left));
  });

  it("discovers the graded assignments alongside the finals", () => {
    const assignments = getExams().filter((item) => item.kind === "assignment");
    // Every assignment prompt on disk that ships at least one exemplary answer.
    expect(assignments.length).toBeGreaterThanOrEqual(58);
    // Both model-answer naming forms must be found: `-<student>-model-answer`
    // (2009 onward) and the bare `-model-answer-<NN>` used in 2007-08. Requiring
    // the author segment silently dropped every 2007 and 2008 assignment.
    expect(assignments.some((item) => item.year === 2007)).toBe(true);
    expect(assignments.some((item) => item.year === 2025)).toBe(true);
    // First item on the review plan; must be reachable by id.
    const target = getExam("2014-assignment-03");
    expect(target.kind).toBe("assignment");
    expect(target.questionCount).toBe(1);
    expect(target.modelAnswer).toContain("Exemplary student answer 1");
  });

  it("labels an assignment's benchmark as peer exemplars, not an instructor key", () => {
    // The two are graded against differently: an instructor key sits above full
    // credit, peer exemplars are achievable full credit.
    expect(getExam("2014-assignment-03").modelAnswerKind).toBe("peer_exemplars");
    expect(getExam("2015-final").modelAnswerKind).toBe("instructor_key");
    for (const item of getExams()) {
      expect(item.modelAnswer.length).toBeGreaterThan(500);
    }
  });

  it("makes the newly completed 2024 final practicable", () => {
    expect(listIncompleteExams().some((entry) => entry.year === 2024)).toBe(false);
    expect(isKnownExamId("2024-final")).toBe(true);
    const exam = getExam("2024-final");
    expect(exam.questionCount).toBe(9);
    expect(exam.modelAnswerPath).toContain("2024-greiner-civpro2-model-answer.md");
    expect(exam.modelAnswer).toMatch(/supplied instructor model-answer PDF ends after Question 8/i);
  });

  it("keeps the administered and shortened 2025 finals distinct", () => {
    const administered = getExam("2025-final");
    const shortened = getExam("2025-shortened-final");

    expect(administered.questionCount).toBe(8);
    expect(shortened.questionCount).toBe(6);
    expect(administered.shortDescription).toMatch(/Administered 8-hour/);
    expect(shortened.shortDescription).toMatch(/Shortened 3\.5-hour/);
    expect(administered.promptPath).not.toBe(shortened.promptPath);
    expect(administered.modelAnswerPath).not.toBe(shortened.modelAnswerPath);
    expect(administered.modelAnswer).toContain("Darth can challenge IPJ");
    expect(shortened.modelAnswer).not.toContain("Darth can challenge IPJ");
    // The source PDF's footnote marker must not merge into the question number.
    expect(administered.prompt).toContain("Question 2[^3]");
    expect(administered.prompt).not.toContain("Question 23");
  });

  it("prefers the cleaned extraction where a year has two files", () => {
    // 2016 and 2017 each ship a cleaned Markdown file and a raw PDF text dump
    // of the same paper; the labels and point values match, so either would
    // grade, but the cleaned one renders correctly for the student.
    expect(getExam("2016-final").promptPath).toContain("2016-final.md");
    expect(getExam("2017-final").promptPath).toContain("2017-final.md");
  });

  it("loads real content for every discovered exam", () => {
    for (const exam of getExams().filter((item) => item.kind === "final")) {
      expect(exam.prompt.length).toBeGreaterThan(1000);
      expect(exam.modelAnswer.length).toBeGreaterThan(500);
      expect(exam.questionCount).toBeGreaterThan(0);
      // The transcoding pass left no undecodable bytes behind.
      expect(exam.prompt).not.toContain("�");
      expect(exam.modelAnswer).not.toContain("�");
    }
  });

  it("counts questions across all six label formats in the corpus", () => {
    expect(countQuestions("## Question 1 (25 points)\n## Question 2 (10 points)")).toBe(2);
    expect(countQuestions("**Question 2 (10 points): text**")).toBe(1);
    expect(countQuestions("**Question 2(a), 16 points:**")).toBe(1);
    expect(countQuestions("Question 1 (25 points): bare line")).toBe(1);
    expect(countQuestions("## Question 3, 12 points")).toBe(1);
    // A page break lands between the newline and the label in PDF extractions.
    expect(countQuestions("text\n\fQuestion 4 (8 points): after a form feed")).toBe(1);
    // A parent that only contains scored subparts is not itself an item.
    expect(countQuestions("## Question 1 (25 total points)\n### Question 1(a) — 5 points\n### Question 1(b) — 18 points")).toBe(2);
    // In-body cross-references are not questions.
    expect(countQuestions("As explained in Question 2 above, the rule applies.")).toBe(0);
  });

  it("matches known question counts for the calibrated exams", () => {
    expect(getExam("2015-final").questionCount).toBe(4);
    expect(getExam("2019-final").questionCount).toBe(6);
    expect(getExam("2021-final").questionCount).toBe(6);
    expect(getExam("2024-final").questionCount).toBe(9);
    expect(getExam("2025-final").questionCount).toBe(8);
    expect(getExam("2025-shortened-final").questionCount).toBe(6);
  });

  it("rejects an unknown exam id", () => {
    expect(isKnownExamId("2015-final")).toBe(true);
    expect(isKnownExamId("1999-final")).toBe(false);
    expect(() => getExam("1999-final")).toThrow(/Unknown exam/);
  });
});

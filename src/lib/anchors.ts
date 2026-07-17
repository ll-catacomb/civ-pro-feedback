import "server-only";

import fs from "node:fs";
import path from "node:path";

import { CALIBRATION_FIXTURES, getCalibrationFixture } from "@/lib/calibration";
import type { Exam } from "@/lib/types";

const ASSIGNMENTS_DIRECTORY = path.join(process.cwd(), "content", "course", "assignments");
const EXEMPLARS_PER_PACK = 2;
const EXEMPLAR_WORD_LIMIT = 1100;

function examYear(examId: Exam["id"]): string {
  return examId.slice(0, 4);
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
}

function truncateWords(text: string, limit: number): string {
  const words = text.split(/\s+/);
  if (words.length <= limit) return text;
  return `${words.slice(0, limit).join(" ")} […]`;
}

/**
 * Graded final-exam answers from a different exam year, one per band where
 * available. The fixture's own exam year is always excluded so a run can
 * never see its own grade.
 */
export function gradedAnchorFixtures(
  examId: Exam["id"],
  excludeFixtureId?: string,
): { band: string; fixtureId: string; sameExam: boolean; answer: string; note: string }[] {
  // Graders rank within a stack, and bands are curved within a cohort, so a
  // same-exam graded answer is the best anchor for each band. Other years only
  // fill bands the same-exam stack lacks. The answer under review is always
  // excluded so its own grade never enters its run.
  const candidates = CALIBRATION_FIXTURES.filter(
    (fixture) => fixture.status === "ready" && fixture.id !== excludeFixtureId,
  );
  const anchors: { band: string; fixtureId: string; sameExam: boolean; answer: string; note: string }[] = [];
  const sameExamCount = candidates.filter((candidate) => candidate.examId === examId).length;
  const excludedBand = excludeFixtureId
    ? CALIBRATION_FIXTURES.find((fixture) => fixture.id === excludeFixtureId)?.actualGrade
    : undefined;
  for (const band of ["DS", "H", "P", "LP"] as const) {
    // A different cohort's curve does not transfer, and in practice a foreign
    // reference's texture overrides the same-exam ordering, so other years are
    // used only when the same-exam stack is too thin to rank against — or when
    // this band's same-exam reference is exactly the excluded answer under
    // review, which would otherwise leave its own band interval unanchored.
    const fixture = candidates.find((candidate) => candidate.actualGrade === band && candidate.examId === examId)
      ?? (sameExamCount < 2 || band === excludedBand
        ? candidates.find((candidate) => candidate.actualGrade === band && candidate.examId !== examId)
        : undefined);
    if (!fixture) continue;
    const sameExam = fixture.examId === examId;
    anchors.push({
      band,
      fixtureId: fixture.id,
      sameExam,
      answer: getCalibrationFixture(fixture.id).answer,
      note: sameExam
        ? `A complete graded answer to THIS same exam. The instructor graded it ${band}.`
        : `A complete answer to the ${examYear(fixture.examId)} final in this same course (a different cohort, graded on that cohort's curve). The instructor graded it ${band}.`,
    });
  }
  return anchors;
}

/**
 * Assignment answers the instructor selected as the best in the class,
 * from the same course year. Different assessments, so nothing about the
 * graded exam answers leaks; they anchor what selected work looks like.
 */
export function exemplarAssignmentAnswers(examId: Exam["id"]): string[] {
  const year = examYear(examId);
  let files: string[];
  try {
    files = fs.readdirSync(ASSIGNMENTS_DIRECTORY);
  } catch {
    return [];
  }
  return files
    .filter((file) => file.startsWith(`${year}-assignment-01-`) && file.includes("model-answer"))
    .sort()
    .slice(0, EXEMPLARS_PER_PACK)
    .map((file) => truncateWords(
      stripFrontmatter(fs.readFileSync(path.join(ASSIGNMENTS_DIRECTORY, file), "utf8")),
      EXEMPLAR_WORD_LIMIT,
    ));
}

export function buildAnchorPack(examId: Exam["id"], excludeFixtureId?: string): string {
  const graded = gradedAnchorFixtures(examId, excludeFixtureId);
  const exemplars = exemplarAssignmentAnswers(examId);
  if (graded.length === 0 && exemplars.length === 0) {
    return "No reference answers are available for this run.";
  }

  const sections: string[] = [
    "How to use these reference answers: they respond to DIFFERENT assessments, so use them only to calibrate what each band of real, time-pressured student work looks like — depth, prioritization, and how many errors and omissions each band tolerates. Never use them as doctrinal authority for the exam under review, and never reference or infer any author's identity.",
  ];
  for (const anchor of graded) {
    sections.push(`## Graded reference answer${anchor.sameExam ? " (same exam)" : " (different year)"} — actual instructor band: ${anchor.band}\n${anchor.note}\n\n${anchor.answer}`);
  }
  exemplars.forEach((exemplar, index) => {
    sections.push(`## Instructor-selected assignment answer ${index + 1}\nA real student answer to a short timed assignment in this course, circulated by the instructor as among the best in the class. Note that even selected answers contain imperfections.\n\n${exemplar}`);
  });
  return sections.join("\n\n");
}

import "server-only";

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

import type { Exam } from "@/lib/types";

const EXAM_DIRECTORY = path.join(process.cwd(), "content", "course", "exams");

const EXAM_CONFIG = [
  {
    id: "2014-final" as const,
    year: 2014,
    title: "Civil Procedure 2 — 2014 Final",
    shortDescription: "Three questions on Erie, preclusion, jurisdiction, and dispositive-motion standards.",
    questionCount: 3,
    promptPath: "content/course/exams/2014-final.md",
    modelAnswerPath: "content/course/exams/2014-greiner-civpro2-model-answer.md",
  },
  {
    id: "2015-final" as const,
    year: 2015,
    title: "Civil Procedure 2 — 2015 Final",
    shortDescription: "Four questions on due process, appellate review, preclusion, and pleading.",
    questionCount: 4,
    promptPath: "content/course/exams/2015-final.md",
    modelAnswerPath: "content/course/exams/2015-greiner-civpro2-model-answer.md",
  },
  {
    id: "2019-final" as const,
    year: 2019,
    title: "Civil Procedure 2 — 2019 Final",
    shortDescription: "Six questions on jurisdiction, Erie, summary judgment, preclusion, and Rule 23.",
    questionCount: 6,
    promptPath: "content/course/exams/2019-greiner-civpro2-final.md",
    modelAnswerPath: "content/course/exams/2019-greiner-civpro2-model-answer.md",
  },
];

function readMarkdown(relativePath: string): string {
  const raw = fs.readFileSync(
    path.join(EXAM_DIRECTORY, path.basename(relativePath)),
    "utf8",
  );
  return matter(raw).content.trim();
}

export function getExams(): Exam[] {
  return EXAM_CONFIG.map((exam) => ({
    ...exam,
    prompt: readMarkdown(exam.promptPath),
    modelAnswer: readMarkdown(exam.modelAnswerPath),
  }));
}

export function getExam(id: string): Exam {
  const exam = getExams().find((candidate) => candidate.id === id);
  if (!exam) throw new Error(`Unknown exam: ${id}`);
  return exam;
}

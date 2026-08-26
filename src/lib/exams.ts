import "server-only";

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

import type { Exam } from "@/lib/types";

const EXAM_DIRECTORY = path.join(process.cwd(), "content", "course", "exams");

/**
 * Exams are discovered from `content/course/exams` rather than hardcoded, so a
 * newly imported year appears in the student dropdown without a code change.
 *
 * Two file-naming conventions coexist in the corpus. Where a year has both, the
 * `<year>-final.md` form is the cleaned Markdown extraction (real headings, bold
 * question labels) and the `<year>-greiner-civpro2-final.md` form is the raw PDF
 * text dump of the same paper — verified for 2016 and 2017, where the question
 * labels and point allocations match exactly. The cleaned form always wins.
 */
const CLEANED_EXAM = /^(\d{4})-final\.md$/;
const RAW_EXAM = /^(\d{4})-greiner-civpro[^-]*-final(-alt)?\.md$/;
const MODEL_ANSWER = /^(\d{4})-greiner-civpro[^-]*-model-answer\.md$/;

/**
 * An exam needs its own text AND an instructor model answer to be practiced:
 * the model answer drives the issue map and is the coverage benchmark the
 * evaluation grades against. 2024 has a final but no model answer, so it is
 * discovered and then withheld with a stated reason rather than silently
 * dropped — `listIncompleteExams` surfaces it for anyone wondering why.
 */
export type IncompleteExam = { year: number; reason: string };

type Discovered = {
  year: number;
  promptFile?: string;
  rawPromptFile?: string;
  modelAnswerFile?: string;
};

function readMarkdown(fileName: string, directory: string = EXAM_DIRECTORY): { title: string; content: string } {
  const parsed = matter(fs.readFileSync(path.join(directory, fileName), "utf8"));
  return {
    title: typeof parsed.data.title === "string" ? parsed.data.title : "",
    content: parsed.content.trim(),
  };
}

function discover(): Map<number, Discovered> {
  const byYear = new Map<number, Discovered>();
  const upsert = (year: number, patch: Partial<Discovered>) => {
    byYear.set(year, { year, ...byYear.get(year), ...patch });
  };
  for (const fileName of fs.readdirSync(EXAM_DIRECTORY).sort()) {
    const cleaned = CLEANED_EXAM.exec(fileName);
    if (cleaned) { upsert(Number(cleaned[1]), { promptFile: fileName }); continue; }
    const raw = RAW_EXAM.exec(fileName);
    // `-alt` is a second extraction of the same paper, never a different exam;
    // keep whichever raw file sorts first and only as a fallback.
    if (raw && !byYear.get(Number(raw[1]))?.rawPromptFile) {
      upsert(Number(raw[1]), { rawPromptFile: fileName });
      continue;
    }
    const model = MODEL_ANSWER.exec(fileName);
    if (model) upsert(Number(model[1]), { modelAnswerFile: fileName });
  }
  return byYear;
}

/**
 * Counts the questions the exam scores separately. Six label formats appear
 * across the corpus (`## Question 1 (25 points)`, `### Question 1(a) — 5 points`,
 * `**Question 2 (10 points): …**`, `**Question 2(a), 16 points:**`, a bare
 * `Question 1 (25 points):` line, and `## Question 3, 12 points`), and 2015
 * mixes two of them, so this matches the label rather than the surrounding
 * markup. It is a display count only — the authoritative per-question breakdown
 * comes from the segmentation step, not from here.
 */
export function countQuestions(prompt: string): number {
  const labels = new Set<string>();
  // A label may be preceded by heading hashes, bold markers, or nothing at all,
  // and may carry a subpart as `1(a)`. Anchoring to line start avoids counting
  // the many in-body cross-references ("as in Question 2 above").
  //
  // The leading class is "whitespace except a line break" rather than [ \t]:
  // PDF-extracted papers carry form feeds (U+000C) at page boundaries, and a
  // question that happened to start a new page was silently skipped — 2019 lost
  // Question 4 and 2021 lost Question 3 that way.
  for (const match of prompt.matchAll(/^[^\S\r\n]*(?:#{1,6}[^\S\r\n]*)?(?:\*\*)?[^\S\r\n]*Question[^\S\r\n]+(\d+)[^\S\r\n]*(\([a-z]\))?/gim)) {
    labels.add(`${match[1]}${match[2] ? match[2].toLowerCase() : ""}`);
  }
  // Where an exam labels subparts, the parent is a container rather than a
  // separately scored item, so 1(a)/1(b) should not also count 1.
  const withSubparts = new Set(
    [...labels].filter((label) => /[a-z]$|\)$/.test(label)).map((label) => label.replace(/\(.*/, "")),
  );
  return [...labels].filter((label) => !withSubparts.has(label)).length;
}

const ASSIGNMENT_DIRECTORY = path.join(process.cwd(), "content", "course", "assignments");
const ASSIGNMENT_PROMPT = /^(\d{4})-assignment-(\d{2})\.md$/;
// Two naming forms: `-<student>-model-answer.md` (2009 onward) and a bare
// `-model-answer-<NN>.md` (2007-08). The author segment must therefore be
// optional — requiring it silently dropped every 2007 and 2008 assignment.
const ASSIGNMENT_MODEL = /^(\d{4})-assignment-(\d{2})-(?:.+-)?model-answer(?:[-.].*)?\.md$/;

/**
 * The shorter graded assignments. Unlike a final these pose a single substantive
 * question under an ~850-word limit, and each ships several exemplary answers
 * written by students in that cohort rather than one instructor key — so they
 * are surfaced as `peer_exemplars` and the evaluation stage is told not to treat
 * them as an above-full-credit benchmark.
 */
function discoverAssignments(): Exam[] {
  let files: string[];
  try {
    files = fs.readdirSync(ASSIGNMENT_DIRECTORY).sort();
  } catch {
    return [];
  }
  const prompts = new Map<string, string>();
  const models = new Map<string, string[]>();
  for (const fileName of files) {
    const prompt = ASSIGNMENT_PROMPT.exec(fileName);
    if (prompt) { prompts.set(`${prompt[1]}-${prompt[2]}`, fileName); continue; }
    const model = ASSIGNMENT_MODEL.exec(fileName);
    if (model) {
      const key = `${model[1]}-${model[2]}`;
      models.set(key, [...(models.get(key) ?? []), fileName]);
    }
  }
  const items: Exam[] = [];
  for (const [key, promptFile] of prompts) {
    const modelFiles = models.get(key) ?? [];
    if (modelFiles.length === 0) continue;
    const [year, number] = key.split("-");
    const prompt = readMarkdown(promptFile, ASSIGNMENT_DIRECTORY);
    // Every exemplar is supplied. They disagree with each other in places, which
    // is the point: it shows the evaluator the spread of work that earned a
    // circulate-to-the-class rating rather than one idealised path.
    const modelAnswer = modelFiles
      .map((fileName, index) => {
        const body = readMarkdown(fileName, ASSIGNMENT_DIRECTORY);
        return `## Exemplary student answer ${index + 1}\nA real student answer to this assignment, written under the same word and time limit, which the instructor circulated as among the best in the class. Even a circulated answer contains imperfections.\n\n${body.content}`;
      })
      .join("\n\n");
    items.push({
      id: `${year}-assignment-${number}`,
      kind: "assignment",
      modelAnswerKind: "peer_exemplars",
      year: Number(year),
      title: prompt.title || `Assignment ${Number(number)} — Civil Procedure 2, ${year}`,
      shortDescription: `Assignment ${Number(number)} · ${year} · ${modelFiles.length} exemplary answers`,
      // One substantive question; assignments carry no `Question N` labels.
      questionCount: 1,
      prompt: prompt.content,
      modelAnswer,
      promptPath: `content/course/assignments/${promptFile}`,
      modelAnswerPath: `content/course/assignments/${modelFiles[0]}`,
    });
  }
  return items;
}

function buildExam(entry: Discovered): Exam | null {
  const promptFile = entry.promptFile ?? entry.rawPromptFile;
  if (!promptFile || !entry.modelAnswerFile) return null;
  const prompt = readMarkdown(promptFile);
  const modelAnswer = readMarkdown(entry.modelAnswerFile);
  const questionCount = countQuestions(prompt.content);
  return {
    id: `${entry.year}-final`,
    kind: "final",
    modelAnswerKind: "instructor_key",
    year: entry.year,
    title: prompt.title || `Civil Procedure 2 — ${entry.year} Final`,
    shortDescription: `${questionCount} question${questionCount === 1 ? "" : "s"} · ${entry.year} final`,
    questionCount,
    prompt: prompt.content,
    modelAnswer: modelAnswer.content,
    promptPath: `content/course/exams/${promptFile}`,
    modelAnswerPath: `content/course/exams/${entry.modelAnswerFile}`,
  };
}

let cachedExams: Exam[] | null = null;

/** Practicable exams, newest first. Cached: the corpus is read-only at runtime. */
export function getExams(): Exam[] {
  if (cachedExams) return cachedExams;
  const finals = [...discover().values()]
    .map(buildExam)
    .filter((exam): exam is Exam => exam !== null);
  // Finals first within a year, then assignments in number order, newest year
  // first, so the dropdown reads the way a student thinks about the course.
  cachedExams = [...finals, ...discoverAssignments()].sort((left, right) =>
    right.year - left.year
    || (left.kind === right.kind ? left.id.localeCompare(right.id) : left.kind === "final" ? -1 : 1));
  return cachedExams;
}

/** Years present in the corpus but not practicable, with the reason. */
export function listIncompleteExams(): IncompleteExam[] {
  return [...discover().values()]
    .filter((entry) => !(entry.promptFile ?? entry.rawPromptFile) || !entry.modelAnswerFile)
    .map((entry) => ({
      year: entry.year,
      reason: !entry.modelAnswerFile
        ? "No instructor model answer in the corpus, so there is no coverage benchmark to grade against."
        : "No exam text in the corpus.",
    }))
    .sort((left, right) => right.year - left.year);
}

export function getExam(id: string): Exam {
  const exam = getExams().find((candidate) => candidate.id === id);
  if (!exam) throw new Error(`Unknown exam: ${id}`);
  return exam;
}

export function isKnownExamId(id: string): boolean {
  return getExams().some((exam) => exam.id === id);
}

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const EXAM_DIRECTORY = path.join(process.cwd(), "content", "course", "exams");
const COMMON = new Set([
  "about", "against", "answer", "because", "civil", "court", "defendant", "district",
  "federal", "final", "from", "have", "jurisdiction", "plaintiff", "procedure", "question",
  "should", "state", "that", "their", "there", "these", "they", "this", "under", "which",
  "with", "would",
]);

export type ExamMatch = {
  path: string;
  title: string;
  score: number;
  sharedDistinctiveTerms: string[];
};

function tokens(value: string): Set<string> {
  return new Set(
    (value.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? [])
      .filter((token) => !COMMON.has(token)),
  );
}

export function rankExamMatches(answer: string, selectedPath: string): {
  selectedPath: string;
  selectedRank: number;
  matches: ExamMatch[];
} {
  const files = fs.readdirSync(EXAM_DIRECTORY)
    .filter((name) => /(?:^|-)final\.md$/.test(name) && !name.includes("model-answer"));
  const documents = files.map((name) => {
    const relativePath = `content/course/exams/${name}`;
    const parsed = matter(fs.readFileSync(path.join(EXAM_DIRECTORY, name), "utf8"));
    return {
      path: relativePath,
      title: typeof parsed.data.title === "string" ? parsed.data.title : name,
      tokens: tokens(parsed.content),
    };
  });
  const documentFrequency = new Map<string, number>();
  for (const document of documents) {
    for (const token of document.tokens) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }
  const answerTokens = tokens(answer);
  const matches = documents.map((document) => {
    const shared = [...answerTokens].filter((token) => document.tokens.has(token));
    const weighted = shared.map((token) => ({
      token,
      weight: Math.log((documents.length + 1) / ((documentFrequency.get(token) ?? 0) + 1)) + 1,
    }));
    weighted.sort((left, right) => right.weight - left.weight || left.token.localeCompare(right.token));
    return {
      path: document.path,
      title: document.title,
      score: Number(weighted.reduce((sum, item) => sum + item.weight ** 2, 0).toFixed(2)),
      sharedDistinctiveTerms: weighted.slice(0, 12).map((item) => item.token),
    };
  }).sort((left, right) => right.score - left.score);
  return {
    selectedPath,
    selectedRank: matches.findIndex((match) => match.path === selectedPath) + 1,
    matches: matches.slice(0, 3),
  };
}

export function formatExamMatches(result: ReturnType<typeof rankExamMatches>): string {
  return JSON.stringify(result, null, 2);
}

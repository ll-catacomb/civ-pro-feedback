import "server-only";

import fs from "node:fs";
import path from "node:path";

import { parseCourseMarkdown } from "@/lib/course-markdown";
import type { IssueMap, RetrievedSource } from "@/lib/types";

type Chunk = Omit<
  RetrievedSource,
  "score" | "retrievalMethod" | "semanticScore" | "lexicalScore" | "rerankRelevance" | "rerankReason"
> & {
  termFrequencies: Map<string, number>;
  termCount: number;
};

type Corpus = {
  chunks: Chunk[];
  documentFrequency: Map<string, number>;
  averageTermCount: number;
};

const STOP_WORDS = new Set([
  "about", "after", "again", "against", "also", "because", "been", "before", "being", "between",
  "could", "does", "doing", "during", "each", "from", "further", "have", "having", "into", "more",
  "most", "other", "over", "same", "should", "some", "such", "than", "that", "their", "there", "these",
  "they", "this", "those", "through", "under", "very", "what", "when", "where", "which", "while", "with",
  "would", "your", "question", "answer", "civil", "procedure", "court", "federal", "state",
]);

// Okapi BM25. Saturating term frequency and length normalization matter here
// because course chunks range from short case notes to 2.2K-character outline
// sections, and a long section should not outrank a precisely on-point note
// merely by repeating a doctrine name.
const BM25_K1 = 1.5;
const BM25_B = 0.75;

// A title term is strong evidence of what a chunk is about, so title tokens are
// counted repeatedly rather than scored as a separate additive bonus.
const TITLE_TERM_WEIGHT = 3;

// Query-term weights by provenance. The issue map is the authoritative statement
// of what the exam tests. Expansion terms are Claude's rendering of that same
// doctrine into the vocabulary the course materials actually use, so they rank
// just below it. The student's own wording is useful for finding the materials
// that correct them, but it is the noisiest of the three.
const ISSUE_MAP_TERM_WEIGHT = 1;
const EXPANSION_TERM_WEIGHT = 0.8;
const ANSWER_TERM_WEIGHT = 0.5;

const MAX_CHUNKS_PER_DOCUMENT = 2;

let cachedCorpus: Corpus | undefined;

function walkMarkdown(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkMarkdown(fullPath);
    return entry.isFile() && entry.name.endsWith(".md") ? [fullPath] : [];
  });
}

function splitSections(content: string): string[] {
  const sections = content.split(/(?=^#{1,3}\s+)/m).filter((section) => section.trim().length > 120);
  return sections.flatMap((section) => {
    if (section.length <= 2400) return [section];
    const pieces: string[] = [];
    for (let index = 0; index < section.length; index += 2000) pieces.push(section.slice(index, index + 2200));
    return pieces;
  });
}

// Words, and statute numbers in their bare numeric form. Civil Procedure
// materials cite the same provision as "1331", "§ 1331", and "section 1331", so
// a three-or-more-digit run is indexed as its own term with the section sign
// stripped; that is how "arising under" chunks become findable at all.
function tokenize(input: string, limit = 240): string[] {
  const matches = input.toLowerCase().match(/§\s?\d{3,}|\d{3,}|[a-z][a-z0-9§-]{2,}/g) ?? [];
  const tokens = matches
    .map((token) => token.replace(/§\s?/, "").trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
  return [...new Set(tokens)].slice(0, limit);
}

function countTerms(input: string): Map<string, number> {
  const frequencies = new Map<string, number>();
  const matches = input.toLowerCase().match(/§\s?\d{3,}|\d{3,}|[a-z][a-z0-9§-]{2,}/g) ?? [];
  for (const match of matches) {
    const token = match.replace(/§\s?/, "").trim();
    if (token.length < 3 || STOP_WORDS.has(token)) continue;
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }
  return frequencies;
}

function loadCorpus(): Corpus {
  if (cachedCorpus) return cachedCorpus;
  const root = path.join(process.cwd(), "content/course");
  const chunks = walkMarkdown(root)
    // Historical exams are excluded: the selected exam and its model answer are
    // supplied directly, and an unrelated exam can contaminate the feedback.
    .filter((filePath) => !filePath.includes(`${path.sep}exams${path.sep}`))
    .flatMap((filePath) => {
      const relativePath = path.relative(process.cwd(), filePath);
      const fallbackTitle = path.basename(filePath, ".md").replaceAll("-", " ");
      const parsed = parseCourseMarkdown(fs.readFileSync(filePath, "utf8"), fallbackTitle);
      return splitSections(parsed.content).map((excerpt, index) => {
        const termFrequencies = countTerms(excerpt);
        for (const [term, count] of countTerms(parsed.title)) {
          termFrequencies.set(term, (termFrequencies.get(term) ?? 0) + count * TITLE_TERM_WEIGHT);
        }
        let termCount = 0;
        for (const count of termFrequencies.values()) termCount += count;
        return {
          id: `C-${relativePath.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${index + 1}`,
          title: parsed.title,
          path: relativePath,
          excerpt: excerpt.trim(),
          termFrequencies,
          termCount,
        };
      });
    });

  const documentFrequency = new Map<string, number>();
  for (const chunk of chunks) {
    for (const term of chunk.termFrequencies.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  const totalTermCount = chunks.reduce((total, chunk) => total + chunk.termCount, 0);

  cachedCorpus = {
    chunks,
    documentFrequency,
    averageTermCount: chunks.length > 0 ? totalTermCount / chunks.length : 1,
  };
  return cachedCorpus;
}

function issueMapText(issueMap: IssueMap): string {
  return issueMap.criteria.map((criterion) => [
    criterion.label,
    ...criterion.expectedAnalysis,
    ...criterion.commonFailures,
  ].join("\n")).join("\n\n");
}

/** Weight per query term, keeping the strongest provenance when one repeats. */
function buildQueryTerms(input: {
  issueMap: IssueMap;
  answer: string;
  expansionTerms: string[];
}): Map<string, number> {
  const weighted = new Map<string, number>();
  const add = (terms: string[], weight: number) => {
    for (const term of terms) {
      weighted.set(term, Math.max(weighted.get(term) ?? 0, weight));
    }
  };
  add(tokenize(issueMapText(input.issueMap)), ISSUE_MAP_TERM_WEIGHT);
  add(tokenize(input.expansionTerms.join("\n")), EXPANSION_TERM_WEIGHT);
  add(tokenize(input.answer), ANSWER_TERM_WEIGHT);
  return weighted;
}

function bm25Scores(corpus: Corpus, queryTerms: Map<string, number>): Map<string, number> {
  const inverseDocumentFrequency = new Map<string, number>();
  for (const term of queryTerms.keys()) {
    const frequency = corpus.documentFrequency.get(term) ?? 0;
    inverseDocumentFrequency.set(
      term,
      Math.log(1 + (corpus.chunks.length - frequency + 0.5) / (frequency + 0.5)),
    );
  }

  const scores = new Map<string, number>();
  for (const chunk of corpus.chunks) {
    const lengthNormalizer = BM25_K1 * (1 - BM25_B + (BM25_B * chunk.termCount) / corpus.averageTermCount);
    let score = 0;
    for (const [term, weight] of queryTerms) {
      const termFrequency = chunk.termFrequencies.get(term);
      if (!termFrequency) continue;
      score += weight
        * (inverseDocumentFrequency.get(term) ?? 0)
        * ((termFrequency * (BM25_K1 + 1)) / (termFrequency + lengthNormalizer));
    }
    if (score > 0) scores.set(chunk.id, score);
  }
  return scores;
}

function selectCandidates(input: {
  corpus: Corpus;
  scores: Map<string, number>;
  limit: number;
  retrievalMethod: NonNullable<RetrievedSource["retrievalMethod"]>;
}): RetrievedSource[] {
  const ranked = input.corpus.chunks
    .flatMap((chunk) => {
      const score = input.scores.get(chunk.id);
      return score ? [{ chunk, score }] : [];
    })
    .sort((left, right) => right.score - left.score);

  const maximum = ranked[0]?.score ?? 1;
  const perDocument = new Map<string, number>();
  const selected: RetrievedSource[] = [];
  for (const entry of ranked) {
    if (selected.length >= input.limit) break;
    // Cap chunks per document so one long outline cannot crowd out coverage of
    // the other weighted issues.
    if ((perDocument.get(entry.chunk.path) ?? 0) >= MAX_CHUNKS_PER_DOCUMENT) continue;
    perDocument.set(entry.chunk.path, (perDocument.get(entry.chunk.path) ?? 0) + 1);
    const normalized = entry.score / maximum;
    selected.push({
      id: entry.chunk.id,
      title: entry.chunk.title,
      path: entry.chunk.path,
      excerpt: entry.chunk.excerpt,
      score: normalized,
      retrievalMethod: input.retrievalMethod,
      lexicalScore: normalized,
    });
  }
  return selected;
}

/**
 * Ranks non-exam course material against the weighted issue map, the student's
 * answer, and the doctrine vocabulary named by the retrieval-query stage.
 *
 * The Claude API has no embeddings endpoint, so the semantic half of retrieval
 * is a model stage rather than a vector store: `expansionTerms` carries the
 * words a course outline would use for these doctrines, and BM25 matches them
 * against the corpus. When that stage fails, retrieval still runs on issue-map
 * and answer terms alone and labels itself `lexical_fallback`.
 */
export async function retrieveCourseContext(
  input: { issueMap: IssueMap; answer: string; expansionTerms?: string[] },
  limit = 24,
): Promise<RetrievedSource[]> {
  const corpus = loadCorpus();
  const expansionTerms = input.expansionTerms ?? [];
  const queryTerms = buildQueryTerms({
    issueMap: input.issueMap,
    answer: input.answer,
    expansionTerms,
  });
  return selectCandidates({
    corpus,
    scores: bm25Scores(corpus, queryTerms),
    limit,
    retrievalMethod: expansionTerms.length > 0 ? "expanded_lexical" : "lexical_fallback",
  });
}

export function formatSources(sources: RetrievedSource[]): string {
  return sources
    .map((source) => `[${source.id}] ${source.title}\nPath: ${source.path}\n${source.excerpt}`)
    .join("\n\n---\n\n");
}

import "server-only";

import fs from "node:fs";
import path from "node:path";

import OpenAI from "openai";

import { parseCourseMarkdown } from "@/lib/course-markdown";
import type { IssueMap, RetrievedSource } from "@/lib/types";

type Chunk = Omit<RetrievedSource, "score" | "retrievalMethod" | "semanticScore" | "lexicalScore" | "rerankRelevance" | "rerankReason"> & {
  searchText: string;
};

type IndexedChunk = Omit<Chunk, "searchText"> & { embedding: string };
type SemanticIndex = {
  version: number;
  model: string;
  dimensions: number;
  chunks: IndexedChunk[];
};

const STOP_WORDS = new Set([
  "about", "after", "again", "against", "also", "because", "been", "before", "being", "between",
  "could", "does", "doing", "during", "each", "from", "further", "have", "having", "into", "more",
  "most", "other", "over", "same", "should", "some", "such", "than", "that", "their", "there", "these",
  "they", "this", "those", "through", "under", "very", "what", "when", "where", "which", "while", "with",
  "would", "your", "question", "answer", "civil", "procedure", "court", "federal", "state",
]);

const SEMANTIC_INDEX_PATH = process.env.SEMANTIC_INDEX_PATH
  ? path.resolve(process.env.SEMANTIC_INDEX_PATH)
  : path.join(process.cwd(), ".data", "semantic-index-v1.json");

let cachedChunks: Chunk[] | undefined;
let cachedSemanticIndex: SemanticIndex | null | undefined;

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

function loadChunks(): Chunk[] {
  if (cachedChunks) return cachedChunks;
  const root = path.join(process.cwd(), "content/course");
  cachedChunks = walkMarkdown(root)
    .filter((filePath) => !filePath.includes(`${path.sep}exams${path.sep}`))
    .flatMap((filePath) => {
      const relativePath = path.relative(process.cwd(), filePath);
      const fallbackTitle = path.basename(filePath, ".md").replaceAll("-", " ");
      const parsed = parseCourseMarkdown(fs.readFileSync(filePath, "utf8"), fallbackTitle);
      return splitSections(parsed.content).map((excerpt, index) => ({
        id: `C-${relativePath.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${index + 1}`,
        title: parsed.title,
        path: relativePath,
        excerpt: excerpt.trim(),
        searchText: `${parsed.title} ${excerpt}`.toLowerCase(),
      }));
    });
  return cachedChunks;
}

function loadSemanticIndex(): SemanticIndex | null {
  if (cachedSemanticIndex) return cachedSemanticIndex;
  try {
    cachedSemanticIndex = JSON.parse(fs.readFileSync(SEMANTIC_INDEX_PATH, "utf8")) as SemanticIndex;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn("Semantic index could not be loaded; using lexical fallback.");
    cachedSemanticIndex = null;
  }
  return cachedSemanticIndex;
}

function tokenize(input: string, limit = 120): string[] {
  return [...new Set(
    input.toLowerCase().match(/[a-z][a-z0-9§-]{2,}/g)?.filter((token) => !STOP_WORDS.has(token)) ?? [],
  )].slice(0, limit);
}

function sampleEvenly(value: string, targetCharacters: number): string {
  if (value.length <= targetCharacters) return value;
  const segmentCount = 4;
  const segmentLength = Math.floor(targetCharacters / segmentCount);
  const maxStart = value.length - segmentLength;
  return Array.from({ length: segmentCount }, (_, index) => {
    const start = Math.floor((maxStart * index) / (segmentCount - 1));
    return value.slice(start, start + segmentLength);
  }).join("\n…\n");
}

function issueMapText(issueMap: IssueMap): string {
  return issueMap.criteria.map((criterion) => [
    criterion.label,
    ...criterion.expectedAnalysis,
    ...criterion.commonFailures,
  ].join("\n")).join("\n\n");
}

function lexicalScores(chunks: Chunk[], terms: string[]): Map<string, number> {
  const raw = chunks.map((chunk) => {
    const title = chunk.title.toLowerCase();
    const score = terms.reduce((total, term) => {
      const occurrences = chunk.searchText.split(term).length - 1;
      return total + Math.min(occurrences, 5) + (title.includes(term) ? 4 : 0);
    }, 0);
    return { id: chunk.id, score };
  });
  const maximum = Math.max(...raw.map((item) => item.score), 1);
  return new Map(raw.map((item) => [item.id, item.score / maximum]));
}

function decodeEmbedding(encoded: string): Float32Array {
  const buffer = Buffer.from(encoded, "base64");
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / Float32Array.BYTES_PER_ELEMENT);
}

function cosineSimilarity(left: number[], right: Float32Array): number {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude) || 1);
}

function lexicalFallback(chunks: Chunk[], lexical: Map<string, number>, limit: number): RetrievedSource[] {
  return chunks
    .map((chunk) => ({ ...chunk, score: lexical.get(chunk.id) ?? 0 }))
    .filter((chunk) => chunk.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((chunk) => ({
      id: chunk.id,
      title: chunk.title,
      path: chunk.path,
      excerpt: chunk.excerpt,
      score: chunk.score,
      retrievalMethod: "lexical_fallback" as const,
      lexicalScore: chunk.score,
    }));
}

function fuseRanks(input: {
  chunks: Chunk[];
  lexical: Map<string, number>;
  semantic: Map<string, number>;
  limit: number;
}): RetrievedSource[] {
  const lexicalRank = new Map([...input.lexical.entries()].sort((a, b) => b[1] - a[1]).map(([id], index) => [id, index + 1]));
  const semanticRank = new Map([...input.semantic.entries()].sort((a, b) => b[1] - a[1]).map(([id], index) => [id, index + 1]));
  const ranked = input.chunks.map((chunk) => {
    const lexicalPosition = lexicalRank.get(chunk.id) ?? input.chunks.length;
    const semanticPosition = semanticRank.get(chunk.id) ?? input.chunks.length;
    const score = (0.4 / (60 + lexicalPosition)) + (0.6 / (60 + semanticPosition));
    return {
      ...chunk,
      score,
      retrievalMethod: "hybrid" as const,
      lexicalScore: input.lexical.get(chunk.id) ?? 0,
      semanticScore: input.semantic.get(chunk.id) ?? 0,
    };
  }).sort((left, right) => right.score - left.score);

  const perDocument = new Map<string, number>();
  const selected: RetrievedSource[] = [];
  for (const chunk of ranked) {
    if ((perDocument.get(chunk.path) ?? 0) >= 2) continue;
    selected.push({
      id: chunk.id,
      title: chunk.title,
      path: chunk.path,
      excerpt: chunk.excerpt,
      score: chunk.score,
      retrievalMethod: chunk.retrievalMethod,
      lexicalScore: chunk.lexicalScore,
      semanticScore: chunk.semanticScore,
    });
    perDocument.set(chunk.path, (perDocument.get(chunk.path) ?? 0) + 1);
    if (selected.length >= input.limit) break;
  }
  return selected;
}

export async function retrieveCourseContext(
  input: { issueMap: IssueMap; answer: string },
  limit = 24,
): Promise<RetrievedSource[]> {
  const chunks = loadChunks();
  const issues = issueMapText(input.issueMap);
  const terms = [...new Set([...tokenize(issues), ...tokenize(input.answer)])];
  const lexical = lexicalScores(chunks, terms);
  const semanticIndex = loadSemanticIndex();
  if (!semanticIndex || !process.env.OPENAI_API_KEY) return lexicalFallback(chunks, lexical, limit);

  const indexedById = new Map(semanticIndex.chunks.map((chunk) => [chunk.id, chunk]));
  const indexIsCurrent = semanticIndex.chunks.length === chunks.length
    && chunks.every((chunk) => indexedById.get(chunk.id)?.excerpt === chunk.excerpt);
  if (!indexIsCurrent) {
    console.warn("Semantic index is stale; rebuild it before restarting the app. Using lexical fallback.");
    return lexicalFallback(chunks, lexical, limit);
  }

  try {
    const query = `${issues}\n\nStudent answer language:\n${sampleEvenly(input.answer, 16000)}`;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.embeddings.create({
      model: semanticIndex.model,
      dimensions: semanticIndex.dimensions,
      encoding_format: "float",
      input: query,
    });
    const queryEmbedding = response.data[0].embedding;
    const semantic = new Map(semanticIndex.chunks.map((chunk) => [
      chunk.id,
      cosineSimilarity(queryEmbedding, decodeEmbedding(chunk.embedding)),
    ]));
    return fuseRanks({ chunks, lexical, semantic, limit });
  } catch {
    console.warn("Semantic query failed; using lexical fallback for this run.");
    return lexicalFallback(chunks, lexical, limit);
  }
}

export function formatSources(sources: RetrievedSource[]): string {
  return sources
    .map((source) => `[${source.id}] ${source.title}\nPath: ${source.path}\n${source.excerpt}`)
    .join("\n\n---\n\n");
}

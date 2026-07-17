import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";
import OpenAI from "openai";

const ROOT = process.cwd();
const COURSE_ROOT = path.join(ROOT, "content", "course");
const OUTPUT_PATH = process.env.SEMANTIC_INDEX_PATH
  ? path.resolve(process.env.SEMANTIC_INDEX_PATH)
  : path.join(ROOT, ".data", "semantic-index-v1.json");
const DATA_ROOT = path.dirname(OUTPUT_PATH);
const MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-large";
const DIMENSIONS = Number(process.env.OPENAI_EMBEDDING_DIMENSIONS ?? 1024);
const BATCH_SIZE = 64;
const DRY_RUN = process.argv.includes("--dry-run");

if (!DRY_RUN && !process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required in .env.local");

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return entry.isFile() && entry.name.endsWith(".md") ? [fullPath] : [];
  }));
  return nested.flat();
}

function parseMarkdown(raw, fallbackTitle) {
  try {
    const parsed = matter(raw);
    return {
      content: parsed.content,
      title: typeof parsed.data.title === "string" ? parsed.data.title : fallbackTitle,
    };
  } catch {
    const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    const frontmatter = match?.[1] ?? "";
    const content = match ? raw.slice(match[0].length) : raw;
    const titleLine = frontmatter.match(/^title:\s*(.+)$/m)?.[1]?.trim();
    const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const title = (titleLine || heading || fallbackTitle).replaceAll('"', "").trim();
    return { content, title };
  }
}

function splitSections(content) {
  const sections = content.split(/(?=^#{1,3}\s+)/m).filter((section) => section.trim().length > 120);
  return sections.flatMap((section) => {
    if (section.length <= 2400) return [section];
    const pieces = [];
    for (let index = 0; index < section.length; index += 2000) pieces.push(section.slice(index, index + 2200));
    return pieces;
  });
}

function encodeEmbedding(values) {
  const vector = new Float32Array(values);
  return Buffer.from(vector.buffer).toString("base64");
}

const files = (await walk(COURSE_ROOT)).filter((filePath) => !filePath.includes(`${path.sep}exams${path.sep}`));
const hash = createHash("sha256");
const chunks = [];

for (const filePath of files.sort()) {
  const raw = await fs.readFile(filePath, "utf8");
  const relativePath = path.relative(ROOT, filePath);
  hash.update(relativePath).update("\0").update(raw).update("\0");
  const fallbackTitle = path.basename(filePath, ".md").replaceAll("-", " ");
  const parsed = parseMarkdown(raw, fallbackTitle);
  splitSections(parsed.content).forEach((excerpt, index) => chunks.push({
    id: `C-${relativePath.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${index + 1}`,
    title: parsed.title,
    path: relativePath,
    excerpt: excerpt.trim(),
  }));
}

const characterCount = chunks.reduce((total, chunk) => total + chunk.title.length + chunk.excerpt.length + 1, 0);
if (DRY_RUN) {
  process.stdout.write(`Dry run: ${files.length} non-exam files, ${chunks.length} chunks, ${characterCount.toLocaleString()} characters. No data sent and no index written.\n`);
  process.exit(0);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
let embeddedTokens = 0;
for (let start = 0; start < chunks.length; start += BATCH_SIZE) {
  const batch = chunks.slice(start, start + BATCH_SIZE);
  const response = await client.embeddings.create({
    model: MODEL,
    dimensions: DIMENSIONS,
    encoding_format: "float",
    input: batch.map((chunk) => `${chunk.title}\n${chunk.excerpt}`),
  });
  embeddedTokens += response.usage.total_tokens;
  response.data.forEach((item, index) => {
    batch[index].embedding = encodeEmbedding(item.embedding);
  });
  process.stdout.write(`\rEmbedded ${Math.min(start + BATCH_SIZE, chunks.length)}/${chunks.length} chunks`);
}

await fs.mkdir(DATA_ROOT, { recursive: true });
const temporaryPath = `${OUTPUT_PATH}.${process.pid}.tmp`;
await fs.writeFile(temporaryPath, JSON.stringify({
  version: 1,
  createdAt: new Date().toISOString(),
  corpusHash: hash.digest("hex"),
  model: MODEL,
  dimensions: DIMENSIONS,
  embeddedTokens,
  chunkCount: chunks.length,
  chunks,
}));
await fs.rename(temporaryPath, OUTPUT_PATH);
process.stdout.write(`\nWrote ${OUTPUT_PATH} (${chunks.length} chunks, ${embeddedTokens} tokens).\n`);

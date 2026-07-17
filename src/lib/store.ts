import "server-only";

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { FeedbackRunSchema, type FeedbackRun } from "@/lib/types";

const DATA_DIRECTORY = process.env.FEEDBACK_DATA_DIR
  ? path.resolve(process.env.FEEDBACK_DATA_DIR)
  : path.join(process.cwd(), ".data");
const RUNS_PATH = path.join(DATA_DIRECTORY, "runs.json");
const FAILURES_PATH = path.join(DATA_DIRECTORY, "failures.json");

let writeQueue = Promise.resolve();
let failureWriteQueue = Promise.resolve();

type FailureInput = {
  source: "student" | "calibration";
  examId?: string;
  studentLabel?: string;
  answer?: string;
  stage?: string;
  message: string;
};

function restoreLegacyEvaluationBoundaries(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const evaluation = value as Record<string, unknown>;
  return {
    ...evaluation,
    whyNotHigher: typeof evaluation.whyNotHigher === "string" ? evaluation.whyNotHigher : "",
    whyNotLower: typeof evaluation.whyNotLower === "string" ? evaluation.whyNotLower : "",
  };
}

function restoreLegacyRunBoundaries(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const run = value as Record<string, unknown>;
  const claudeChain = run.claudeChain && typeof run.claudeChain === "object"
    ? run.claudeChain as Record<string, unknown>
    : undefined;
  return {
    ...run,
    evaluation: restoreLegacyEvaluationBoundaries(run.evaluation),
    claudeChain: claudeChain
      ? { ...claudeChain, evaluation: restoreLegacyEvaluationBoundaries(claudeChain.evaluation) }
      : run.claudeChain,
  };
}

async function readRuns(): Promise<FeedbackRun[]> {
  try {
    const data = JSON.parse(await fs.readFile(RUNS_PATH, "utf8"));
    const migrated = Array.isArray(data) ? data.map(restoreLegacyRunBoundaries) : data;
    return FeedbackRunSchema.array().parse(migrated);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeRuns(runs: FeedbackRun[]): Promise<void> {
  await fs.mkdir(DATA_DIRECTORY, { recursive: true });
  const temporaryPath = `${RUNS_PATH}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(runs, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, RUNS_PATH);
}

export async function listRuns(): Promise<FeedbackRun[]> {
  return (await readRuns()).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function saveRun(run: FeedbackRun): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    const runs = await readRuns();
    await writeRuns([run, ...runs.filter((existing) => existing.id !== run.id)]);
  });
  await writeQueue;
}

export async function saveFailure(input: FailureInput): Promise<string> {
  const failure = { id: randomUUID(), createdAt: new Date().toISOString(), ...input };
  failureWriteQueue = failureWriteQueue.then(async () => {
    await fs.mkdir(DATA_DIRECTORY, { recursive: true });
    let failures: unknown[] = [];
    try {
      const parsed = JSON.parse(await fs.readFile(FAILURES_PATH, "utf8"));
      if (Array.isArray(parsed)) failures = parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const temporaryPath = `${FAILURES_PATH}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify([failure, ...failures], null, 2)}\n`, "utf8");
    await fs.rename(temporaryPath, FAILURES_PATH);
  });
  await failureWriteQueue;
  return failure.id;
}

export async function updateRunReview(
  id: string,
  review: { reviewerRating?: number; reviewerNotes?: string },
): Promise<FeedbackRun> {
  let updated: FeedbackRun | undefined;
  writeQueue = writeQueue.then(async () => {
    const runs = await readRuns();
    const index = runs.findIndex((run) => run.id === id);
    if (index === -1) throw new Error("Run not found");
    updated = FeedbackRunSchema.parse({ ...runs[index], ...review });
    runs[index] = updated;
    await writeRuns(runs);
  });
  await writeQueue;
  if (!updated) throw new Error("Run not found");
  return updated;
}

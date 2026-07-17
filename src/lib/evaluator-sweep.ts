import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { buildAnchorPack } from "@/lib/anchors";
import { CALIBRATION_FIXTURES, getCalibrationFixture, gradeDistance } from "@/lib/calibration";
import { runWithConcurrency } from "@/lib/concurrency";
import { getExam } from "@/lib/exams";
import {
  chainConfigured,
  createChainClient,
  FeedbackConfigurationError,
  parseClaudeStage,
  stableSafetyIdentifier,
} from "@/lib/feedback-chain";
import { evaluationDeveloperPrompt, evaluationUserPrompt, PROMPT_VERSION } from "@/lib/prompts";
import { formatSources } from "@/lib/retrieval";
import { listRuns } from "@/lib/store";
import { EvaluationSchema, type GradeBand, type StageTrace } from "@/lib/types";

const WORK_MODEL = process.env.ANTHROPIC_WORK_MODEL ?? "claude-opus-4-8";
const SWEEP_CONCURRENCY = 2;

export type SweepScope = "smoke" | "full";

// One fixture per known band, split evenly across the two principal exam years.
// This is a cheap directional screen, not a replacement for the full benchmark.
export const EVALUATOR_SWEEP_SMOKE_FIXTURE_IDS = [
  "2015-ds",
  "2019-h",
  "2019-p",
  "2015-lp",
] as const;

export type EvaluatorSweepOptions = {
  scope: SweepScope;
  // Explicit fixture list for targeted calibration loops; overrides scope.
  fixtureIds?: string[];
};

export type SweepFixtureResult = {
  fixtureId: string;
  actual: GradeBand;
  reusedRunId: string;
  reusedPromptVersion: string;
  band?: GradeBand;
  lean?: "low" | "solid" | "high";
  distance?: number;
  diagnostics?: SweepDiagnostics;
  errors: string[];
};

export type SweepDiagnostics = {
  bandRationale: string;
  whyNotHigher: string;
  whyNotLower: string;
};

export type SweepMetrics = {
  evaluated: number;
  exact: number;
  meanDistance: number | null;
};

export type EvaluatorSweep = {
  createdAt: string;
  promptVersion: string;
  provider: "claude";
  scope: SweepScope;
  requestedFixtureIds: string[];
  maximumPaidCalls: number;
  results: SweepFixtureResult[];
  metrics: SweepMetrics;
  traces: StageTrace[];
};

function sweepMetrics(distances: (number | undefined)[]): SweepMetrics {
  const scored = distances.filter((distance): distance is number => distance !== undefined);
  return {
    evaluated: scored.length,
    exact: scored.filter((distance) => distance === 0).length,
    meanDistance: scored.length
      ? Number((scored.reduce((sum, distance) => sum + distance, 0) / scored.length).toFixed(3))
      : null,
  };
}

async function persistSweep(sweep: EvaluatorSweep): Promise<void> {
  const dataDir = process.env.FEEDBACK_DATA_DIR ?? path.join(process.cwd(), ".data");
  const sweepPath = path.join(dataDir, "evaluator-sweeps.json");
  let sweeps: unknown[] = [];
  try {
    const existing = JSON.parse(await fs.readFile(sweepPath, "utf8"));
    if (Array.isArray(existing)) sweeps = existing;
  } catch {
    // First sweep.
  }
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(sweepPath, JSON.stringify([sweep, ...sweeps], null, 2));
}

/**
 * Evaluator-only calibration mode: re-runs the blind evaluator over a
 * four-fixture smoke set or the full ready benchmark, reusing each fixture's
 * most recent stored issue map and evidence packet. This lets band-prompt
 * experiments be screened before paying for coaching, judging, and post-hoc
 * analysis. Results are persisted separately and never touch runs.json or
 * dashboard metrics.
 */
export async function runEvaluatorSweep(options: EvaluatorSweepOptions): Promise<EvaluatorSweep> {
  if (!chainConfigured()) {
    throw new FeedbackConfigurationError("ANTHROPIC_API_KEY is not configured.");
  }
  const runs = await listRuns();
  const client = createChainClient();
  const traces: StageTrace[] = [];
  const results: SweepFixtureResult[] = [];

  const selectedFixtureIds = options.fixtureIds?.length
    ? new Set<string>(options.fixtureIds)
    : options.scope === "smoke"
      ? new Set<string>(EVALUATOR_SWEEP_SMOKE_FIXTURE_IDS)
      : undefined;
  const selectedFixtures = CALIBRATION_FIXTURES.filter((fixture) =>
    fixture.status === "ready" && (!selectedFixtureIds || selectedFixtureIds.has(fixture.id)));
  await runWithConcurrency(selectedFixtures, SWEEP_CONCURRENCY, async (fixture) => {
    const priorRun = runs
      .filter((run) => run.calibrationId === fixture.id && run.issueMap && run.sources.length > 0)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const result: SweepFixtureResult = {
      fixtureId: fixture.id,
      actual: fixture.actualGrade,
      reusedRunId: priorRun?.id ?? "none",
      reusedPromptVersion: priorRun?.promptVersion ?? "none",
      errors: [],
    };
    results.push(result);
    if (!priorRun?.issueMap) {
      result.errors.push("No stored run with an issue map and sources to reuse; run the full chain once first.");
      return;
    }

    const exam = getExam(fixture.examId);
    const answer = getCalibrationFixture(fixture.id).answer;
    try {
      const evaluation = await parseClaudeStage({
        client,
        schema: EvaluationSchema,
        stageName: `sweep_${fixture.id}`,
        model: WORK_MODEL,
        reasoningEffort: "high",
        developerPrompt: evaluationDeveloperPrompt,
        userPrompt: evaluationUserPrompt({
          exam: exam.prompt,
          modelAnswer: exam.modelAnswer,
          answer,
          issueMap: priorRun.issueMap,
          sources: formatSources(priorRun.sources),
          anchors: buildAnchorPack(fixture.examId, fixture.id),
        }),
        safetyIdentifier: stableSafetyIdentifier(fixture.label),
        traces,
      });
      result.band = evaluation.provisionalBand;
      result.lean = evaluation.bandLean;
      result.distance = gradeDistance(result.band, fixture.actualGrade);
      result.diagnostics = {
        bandRationale: evaluation.bandRationale,
        whyNotHigher: evaluation.whyNotHigher,
        whyNotLower: evaluation.whyNotLower,
      };
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : "The evaluator failed.");
    }
  });

  results.sort((a, b) => a.fixtureId.localeCompare(b.fixtureId));
  const sweep: EvaluatorSweep = {
    createdAt: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    provider: "claude",
    scope: options.scope,
    requestedFixtureIds: selectedFixtures.map((fixture) => fixture.id),
    maximumPaidCalls: selectedFixtures.length,
    results,
    metrics: sweepMetrics(results.map((result) => result.distance)),
    traces,
  };
  await persistSweep(sweep);
  return sweep;
}

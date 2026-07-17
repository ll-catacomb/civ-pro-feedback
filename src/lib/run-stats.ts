import { bandValue } from "@/lib/outcomes";
import type { FeedbackRun, GradeBand } from "@/lib/types";

export type VersionStat = {
  version: string;
  runs: number;
  graded: number;
  exact: number;
  meanDistance: number | null;
  firstAt: string;
};

export type RunStats = {
  versions: number;
  totalRuns: number;
  gradedRuns: number;
  exact: number;
  adjacent: number;
  twoPlus: number;
  exactPct: number;
  withinOnePct: number;
  meanDistance: number | null;
  perVersion: VersionStat[];
  firstAt?: string;
  lastAt?: string;
};

function distanceOf(run: FeedbackRun): number | undefined {
  if (typeof run.calibrationDistance === "number") return run.calibrationDistance;
  if (run.actualGrade && run.predictedGrade) {
    return Math.abs(bandValue(run.predictedGrade as GradeBand) - bandValue(run.actualGrade as GradeBand));
  }
  return undefined;
}

function semver(version: string): [number, number, number] {
  const m = version.match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
}

export function computeRunStats(runs: FeedbackRun[]): RunStats {
  const graded = runs
    .map((run) => ({ run, distance: distanceOf(run) }))
    .filter((r): r is { run: FeedbackRun; distance: number } => r.distance !== undefined);

  const exact = graded.filter((r) => r.distance === 0).length;
  const adjacent = graded.filter((r) => r.distance === 1).length;
  const twoPlus = graded.filter((r) => r.distance >= 2).length;
  const total = graded.length;
  const meanDistance = total
    ? Number((graded.reduce((sum, r) => sum + r.distance, 0) / total).toFixed(2))
    : null;

  const byVersion = new Map<string, FeedbackRun[]>();
  for (const run of runs) {
    const list = byVersion.get(run.promptVersion) ?? [];
    list.push(run);
    byVersion.set(run.promptVersion, list);
  }

  const perVersion: VersionStat[] = [...byVersion.entries()].map(([version, list]) => {
    const g = list.map(distanceOf).filter((d): d is number => d !== undefined);
    return {
      version,
      runs: list.length,
      graded: g.length,
      exact: g.filter((d) => d === 0).length,
      meanDistance: g.length ? Number((g.reduce((s, d) => s + d, 0) / g.length).toFixed(2)) : null,
      firstAt: list.reduce((min, r) => (r.createdAt < min ? r.createdAt : min), list[0].createdAt),
    };
  }).sort((a, b) => {
    const [aMaj, aMin, aPat] = semver(a.version);
    const [bMaj, bMin, bPat] = semver(b.version);
    return aMaj - bMaj || aMin - bMin || aPat - bPat || a.firstAt.localeCompare(b.firstAt);
  });

  const dates = runs.map((r) => r.createdAt).sort();

  return {
    versions: byVersion.size,
    totalRuns: runs.length,
    gradedRuns: total,
    exact,
    adjacent,
    twoPlus,
    exactPct: total ? Math.round((exact / total) * 100) : 0,
    withinOnePct: total ? Math.round(((exact + adjacent) / total) * 100) : 0,
    meanDistance,
    perVersion,
    firstAt: dates[0]?.slice(0, 10),
    lastAt: dates.at(-1)?.slice(0, 10),
  };
}

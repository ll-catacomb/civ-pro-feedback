import { getFinalFeedback, getFormativeBandEstimate } from "@/lib/outcomes";
import type { Feedback, FeedbackRun, GradeBand } from "@/lib/types";

// The data the Feedback Quality Report renders. Built from the live run store
// locally (buildReportModel), or read from the committed report-snapshot.json
// when deployed without .data. Contains only the anonymized calibration
// submissions (already public in content/calibration) and model output.

export type ReportVersionStat = {
  version: string;
  graded: number;
  exact: number;
  withinOne: number;
  meanDistance: number | null;
};

export type ReportFixture = {
  fixtureId: string;
  label: string;
  examTitle: string;
  actual: GradeBand | null;
  predicted: GradeBand | null;
  estimate: string | null;
  distance: number | null;
  qa: number | null;
  answer: string;
  feedback: Feedback | null;
  bandRationale: string;
  whyNotHigher: string;
  whyNotLower: string;
  judgeFindings: { severity: string; problem: string; correction: string }[];
  promptVersion: string;
  isLatestVersion: boolean;
  createdAt: string;
  historical: { author: string; text: string; anchor: string }[];
};

export type ReportModel = {
  latestVersion: string;
  summary: { count: number; exact: number; withinOne: number; meanDistance: number | null; avgQa: number | null };
  trend: ReportVersionStat[];
  fixtures: ReportFixture[];
};

function semver(v: string): [number, number, number] {
  const m = v.match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
}
function cmpVer(a: string, b: string): number {
  const A = semver(a), B = semver(b);
  return A[0] - B[0] || A[1] - B[1] || A[2] - B[2];
}
function mean(nums: number[]): number | null {
  return nums.length ? Number((nums.reduce((s, n) => s + n, 0) / nums.length).toFixed(2)) : null;
}

export function buildReportModel(runs: FeedbackRun[]): ReportModel {
  const graded = runs.filter((r) => r.calibrationId && r.predictedGrade && r.actualGrade && typeof r.calibrationDistance === "number");
  const versions = [...new Set(graded.map((r) => r.promptVersion))].sort(cmpVer);
  const latestVersion = versions.at(-1) ?? "";

  const byVersion = new Map<string, FeedbackRun[]>();
  for (const r of graded) {
    const list = byVersion.get(r.promptVersion) ?? [];
    list.push(r);
    byVersion.set(r.promptVersion, list);
  }
  const trend: ReportVersionStat[] = [...byVersion.entries()].map(([version, list]) => {
    const d = list.map((r) => r.calibrationDistance as number);
    return { version, graded: d.length, exact: d.filter((x) => x === 0).length, withinOne: d.filter((x) => x <= 1).length, meanDistance: mean(d) };
  }).sort((a, b) => cmpVer(a.version, b.version));

  const byFixture = new Map<string, FeedbackRun[]>();
  for (const r of runs) {
    if (!r.calibrationId) continue;
    const list = byFixture.get(r.calibrationId) ?? [];
    list.push(r);
    byFixture.set(r.calibrationId, list);
  }
  const fixtures: ReportFixture[] = [...byFixture.entries()].map(([fixtureId, list]) => {
    const sorted = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const run = sorted.find((r) => r.promptVersion === latestVersion) ?? sorted[0];
    const feedback = getFinalFeedback(run) ?? run.judge?.feedback ?? null;
    return {
      fixtureId,
      label: run.studentLabel,
      examTitle: run.examTitle,
      actual: run.actualGrade ?? null,
      predicted: run.predictedGrade ?? null,
      estimate: getFormativeBandEstimate(run) ?? null,
      distance: typeof run.calibrationDistance === "number" ? run.calibrationDistance : null,
      qa: run.judge?.qualityScore ?? null,
      answer: run.answer,
      feedback,
      bandRationale: run.evaluation?.bandRationale ?? "",
      whyNotHigher: run.evaluation?.whyNotHigher ?? "",
      whyNotLower: run.evaluation?.whyNotLower ?? "",
      judgeFindings: (run.judge?.findings ?? []).map((f) => ({ severity: f.severity, problem: f.problem, correction: f.correction })),
      promptVersion: run.promptVersion,
      isLatestVersion: run.promptVersion === latestVersion,
      createdAt: run.createdAt,
      historical: (run.historicalFeedback ?? []).map((h) => ({ author: h.author, text: h.text, anchor: h.anchor })),
    };
  }).sort((a, b) => a.fixtureId.localeCompare(b.fixtureId));

  const latestFx = fixtures.filter((f) => f.isLatestVersion && f.distance !== null);
  const dists = latestFx.map((f) => f.distance as number);
  const qas = fixtures.filter((f) => f.isLatestVersion && f.qa !== null).map((f) => f.qa as number);
  const summary = {
    count: latestFx.length,
    exact: dists.filter((d) => d === 0).length,
    withinOne: dists.filter((d) => d <= 1).length,
    meanDistance: mean(dists),
    avgQa: qas.length ? Math.round(qas.reduce((s, q) => s + q, 0) / qas.length) : null,
  };

  return { latestVersion, summary, trend, fixtures };
}

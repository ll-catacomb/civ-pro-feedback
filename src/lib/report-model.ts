import { WITHDRAWN_FIXTURE_IDS } from "@/lib/calibration";
import { bandSuppressionReason, getFinalFeedback, getFormativeBandEstimate, isUnreviewedDraft } from "@/lib/outcomes";
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

/**
 * A run with no known grade: the TA-authored bullet outlines and the mock
 * full-exam submissions used for feedback review. These never carry a
 * calibrationId, so they are invisible to the fixture cards above, but they are
 * the only place the reviewers see bullet-mode and single-question output — the
 * two paths the fixture ladder cannot exercise at all.
 *
 * There is no band and no distance here on purpose. See isBandComparable: an
 * outline, an assignment, or one question cannot be ranked against reference
 * answers that are all complete prose finals.
 */
export type ReportSubmission = {
  id: string;
  label: string;
  examId: string;
  examTitle: string;
  form: "bullets" | "draft";
  scopeLabel: string;
  estimate: string | null;
  bandNote: string | null;
  qa: number | null;
  unreviewed: boolean;
  answer: string;
  feedback: Feedback | null;
  judgeFindings: { severity: string; problem: string; correction: string }[];
  promptVersion: string;
  isLatestVersion: boolean;
  createdAt: string;
};

export type ReportModel = {
  latestVersion: string;
  summary: { count: number; exact: number; withinOne: number; meanDistance: number | null; avgQa: number | null };
  trend: ReportVersionStat[];
  fixtures: ReportFixture[];
  submissions: ReportSubmission[];
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

  // Withdrawn fixtures are excluded from the cards and the headline summary but
  // deliberately left in `trend` above, which is a frozen record of each prompt
  // version's completed batch.
  const byFixture = new Map<string, FeedbackRun[]>();
  for (const r of runs) {
    if (!r.calibrationId || WITHDRAWN_FIXTURE_IDS.has(r.calibrationId)) continue;
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

  // The review set: everything submitted through the student path. Keyed by
  // label+exam rather than fixture id so a re-run replaces its predecessor
  // instead of stacking a second card for the same submission.
  const bySubmission = new Map<string, FeedbackRun[]>();
  for (const r of runs) {
    if (r.calibrationId || !r.judge) continue;
    const key = `${r.studentLabel}::${r.examId}`;
    bySubmission.set(key, [...(bySubmission.get(key) ?? []), r]);
  }
  // Submissions run on their own cadence from the calibration ladder, so "is
  // this the current version" is measured against the newest SUBMISSION version.
  // Using the graded latest would mark a fresh review round stale whenever the
  // ladder had not been re-run alongside it.
  const submissionVersions = [...new Set(
    [...bySubmission.values()].flat().map((r) => r.promptVersion),
  )].sort(cmpVer);
  const latestSubmissionVersion = submissionVersions.at(-1) ?? "";
  const submissions: ReportSubmission[] = [...bySubmission.values()].map((list) => {
    const sorted = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return sorted.find((r) => r.promptVersion === latestSubmissionVersion) ?? sorted[0];
  })
  // Only the current round. Reviewers are asked to comment on output from one
  // prompt version, and the store still holds one-off smoke tests going back to
  // v1.0.0 whose labels mean nothing to a teaching fellow. Older runs stay in
  // the store and in the JSON export; they are simply not the thing under review.
  .filter((run) => run.promptVersion === latestSubmissionVersion)
  .map((run) => {
    return {
      id: run.id,
      label: run.studentLabel,
      examId: run.examId,
      examTitle: run.examTitle,
      form: (run.mode === "bullet_points" ? "bullets" : "draft") as ReportSubmission["form"],
      scopeLabel: run.scope === "single_question" ? (run.questionRef ?? "One question") : "Whole paper",
      estimate: getFormativeBandEstimate(run) ?? null,
      bandNote: bandSuppressionReason(run) ?? null,
      qa: run.judge?.qualityScore ?? null,
      unreviewed: isUnreviewedDraft(run),
      answer: run.answer,
      feedback: getFinalFeedback(run) ?? null,
      judgeFindings: (run.judge?.findings ?? []).map((f) => ({ severity: f.severity, problem: f.problem, correction: f.correction })),
      promptVersion: run.promptVersion,
      isLatestVersion: run.promptVersion === latestSubmissionVersion,
      createdAt: run.createdAt,
    };
  }).sort((a, b) => a.examId.localeCompare(b.examId) || a.label.localeCompare(b.label));

  return { latestVersion, summary, trend, fixtures, submissions };
}

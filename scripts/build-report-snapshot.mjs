// Regenerates src/lib/report-snapshot.json from the local (git-ignored) run
// store so the Feedback Quality Report renders on deploys without .data.
// Mirrors buildReportModel() in src/lib/report-model.ts — keep the two in sync.
// Contains only the anonymized calibration submissions (already public in
// content/calibration) and model output.
import fs from "node:fs";
import path from "node:path";

const dataDir = process.env.FEEDBACK_DATA_DIR ?? path.join(process.cwd(), ".data");
const runs = JSON.parse(fs.readFileSync(path.join(dataDir, "runs.json"), "utf8"));

const semver = (v) => { const m = v.match(/(\d+)\.(\d+)\.(\d+)/); return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0]; };
const cmpVer = (a, b) => { const A = semver(a), B = semver(b); return A[0]-B[0] || A[1]-B[1] || A[2]-B[2]; };
const mean = (xs) => xs.length ? +(xs.reduce((s, n) => s + n, 0) / xs.length).toFixed(2) : null;
const hasContent = (f) => !!f && (((f.improvements || []).length > 0) || ((f.strengths || []).length > 0));
// Mirrors getFinalFeedback: the judge can return a structurally valid object
// with every array empty, and the coach's draft is far better than nothing.
const finalFeedback = (r) => {
  const judged = (r.dualDecision && r.dualDecision.finalFeedback) || (r.judge && r.judge.feedback) || null;
  if (hasContent(judged)) return judged;
  if (hasContent(r.draftFeedback)) return r.draftFeedback;
  return judged;
};
const isUnreviewedDraft = (r) => {
  const judged = (r.dualDecision && r.dualDecision.finalFeedback) || (r.judge && r.judge.feedback) || null;
  return !hasContent(judged) && hasContent(r.draftFeedback);
};
// Mirrors isBandComparable/bandSuppressionReason: every graded reference is a
// complete prose answer to a whole final, so these three cannot be ranked on it.
const bandNote = (r) => {
  if (r.examId && r.examId.includes("assignment")) return "Assignments are not banded here: every graded reference answer we hold is a full final exam, which is a different assessment at several times the word budget.";
  if (r.mode === "bullet_points") return "Outlines are not banded here: the graded reference answers are all written-out drafts, so a band would measure the format rather than the analysis.";
  if (r.scope === "single_question") return "A single question is not banded here: the graded reference answers respond to the whole exam.";
  return null;
};
const estimate = (r) => {
  if (r.dualDecision && r.dualDecision.hedgedBand) return r.dualDecision.hedgedBand;
  if (!r.predictedGrade) return null;
  const lean = r.evaluation && r.evaluation.bandLean;
  return r.predictedGrade + (lean === "high" ? "+" : lean === "low" ? "−" : "");
};

const graded = runs.filter((r) => r.calibrationId && r.predictedGrade && r.actualGrade && typeof r.calibrationDistance === "number");
const versions = [...new Set(graded.map((r) => r.promptVersion))].sort(cmpVer);
const latestVersion = versions.at(-1) ?? "";

const byVersion = new Map();
for (const r of graded) { const l = byVersion.get(r.promptVersion) ?? []; l.push(r); byVersion.set(r.promptVersion, l); }
const trend = [...byVersion.entries()].map(([version, list]) => {
  const d = list.map((r) => r.calibrationDistance);
  return { version, graded: d.length, exact: d.filter((x) => x === 0).length, withinOne: d.filter((x) => x <= 1).length, meanDistance: mean(d) };
}).sort((a, b) => cmpVer(a.version, b.version));

// Mirrors WITHDRAWN_FIXTURE_IDS in src/lib/calibration.ts. Withdrawn fixtures
// drop out of the submission cards and headline summary but stay in `trend`,
// which is a frozen record of each prompt version's completed batch.
const WITHDRAWN_FIXTURE_IDS = new Set(["2014-p"]);

const byFixture = new Map();
for (const r of runs) { if (!r.calibrationId || WITHDRAWN_FIXTURE_IDS.has(r.calibrationId)) continue; const l = byFixture.get(r.calibrationId) ?? []; l.push(r); byFixture.set(r.calibrationId, l); }
const fixtures = [...byFixture.entries()].map(([fixtureId, list]) => {
  const sorted = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const run = sorted.find((r) => r.promptVersion === latestVersion) ?? sorted[0];
  return {
    fixtureId, label: run.studentLabel, examTitle: run.examTitle,
    actual: run.actualGrade ?? null, predicted: run.predictedGrade ?? null, estimate: estimate(run),
    distance: typeof run.calibrationDistance === "number" ? run.calibrationDistance : null,
    qa: (run.judge && run.judge.qualityScore) ?? null,
    answer: run.answer, feedback: finalFeedback(run),
    bandRationale: (run.evaluation && run.evaluation.bandRationale) ?? "",
    whyNotHigher: (run.evaluation && run.evaluation.whyNotHigher) ?? "",
    whyNotLower: (run.evaluation && run.evaluation.whyNotLower) ?? "",
    judgeFindings: ((run.judge && run.judge.findings) ?? []).map((f) => ({ severity: f.severity, problem: f.problem, correction: f.correction })),
    promptVersion: run.promptVersion, isLatestVersion: run.promptVersion === latestVersion, createdAt: run.createdAt,
    historical: (run.historicalFeedback ?? []).map((h) => ({ author: h.author, text: h.text, anchor: h.anchor })),
  };
}).sort((a, b) => a.fixtureId.localeCompare(b.fixtureId));

const latestFx = fixtures.filter((f) => f.isLatestVersion && f.distance !== null);
const dists = latestFx.map((f) => f.distance);
const qas = fixtures.filter((f) => f.isLatestVersion && f.qa !== null).map((f) => f.qa);
const summary = {
  count: latestFx.length, exact: dists.filter((d) => d === 0).length, withinOne: dists.filter((d) => d <= 1).length,
  meanDistance: mean(dists), avgQa: qas.length ? Math.round(qas.reduce((s, q) => s + q, 0) / qas.length) : null,
};

// The review round: bullet outlines and mock full drafts submitted through the
// student path. These carry no calibrationId and so appear nowhere above, but
// they are the only place reviewers see bullet-mode output.
const bySubmission = new Map();
for (const r of runs) {
  if (r.calibrationId || !r.judge) continue;
  const key = `${r.studentLabel}::${r.examId}`;
  bySubmission.set(key, [...(bySubmission.get(key) ?? []), r]);
}
const submissionVersions = [...new Set([...bySubmission.values()].flat().map((r) => r.promptVersion))].sort(cmpVer);
const latestSubmissionVersion = submissionVersions.at(-1) ?? "";
const submissions = [...bySubmission.values()].map((list) => {
  const sorted = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return sorted.find((r) => r.promptVersion === latestSubmissionVersion) ?? sorted[0];
})
// Current round only — see the matching note in report-model.ts.
.filter((run) => run.promptVersion === latestSubmissionVersion)
.map((run) => {
  const note = bandNote(run);
  return {
    id: run.id, label: run.studentLabel, examId: run.examId, examTitle: run.examTitle,
    form: run.mode === "bullet_points" ? "bullets" : "draft",
    scopeLabel: run.scope === "single_question" ? (run.questionRef ?? "One question") : "Whole paper",
    estimate: note ? null : estimate(run),
    bandNote: note,
    qa: (run.judge && run.judge.qualityScore) ?? null,
    unreviewed: isUnreviewedDraft(run),
    answer: run.answer, feedback: finalFeedback(run),
    judgeFindings: ((run.judge && run.judge.findings) ?? []).map((f) => ({ severity: f.severity, problem: f.problem, correction: f.correction })),
    promptVersion: run.promptVersion, isLatestVersion: run.promptVersion === latestSubmissionVersion, createdAt: run.createdAt,
  };
}).sort((a, b) => a.examId.localeCompare(b.examId) || a.label.localeCompare(b.label));

fs.writeFileSync("src/lib/report-snapshot.json", JSON.stringify({ latestVersion, summary, trend, fixtures, submissions }, null, 2) + "\n");
console.log(`report snapshot: ${latestVersion} — ${summary.exact}/${summary.count} exact, ${summary.withinOne}/${summary.count} within-1, mean ${summary.meanDistance}, ${fixtures.length} fixtures, ${submissions.length} review submissions`);

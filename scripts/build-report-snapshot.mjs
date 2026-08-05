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
const finalFeedback = (r) => (r.dualDecision && r.dualDecision.finalFeedback) || (r.judge && r.judge.feedback) || null;
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

const byFixture = new Map();
for (const r of runs) { if (!r.calibrationId) continue; const l = byFixture.get(r.calibrationId) ?? []; l.push(r); byFixture.set(r.calibrationId, l); }
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

fs.writeFileSync("src/lib/report-snapshot.json", JSON.stringify({ latestVersion, summary, trend, fixtures }, null, 2) + "\n");
console.log(`report snapshot: ${latestVersion} — ${summary.exact}/${summary.count} exact, ${summary.withinOne}/${summary.count} within-1, mean ${summary.meanDistance}, ${fixtures.length} fixtures`);

// Regenerates src/lib/run-stats-snapshot.json from the local (git-ignored)
// run log so the /audit track-record renders on deploys with no .data.
// Contains ONLY aggregate stats — no student answers or feedback text.
import fs from "node:fs";
import path from "node:path";

const dataDir = process.env.FEEDBACK_DATA_DIR ?? path.join(process.cwd(), ".data");
const runs = JSON.parse(fs.readFileSync(path.join(dataDir, "runs.json"), "utf8"));

const BAND = ["LP", "P", "H", "DS"];
const bandValue = (b) => BAND.indexOf(b) + 1;
const distanceOf = (r) => {
  if (typeof r.calibrationDistance === "number") return r.calibrationDistance;
  if (r.actualGrade && r.predictedGrade) return Math.abs(bandValue(r.predictedGrade) - bandValue(r.actualGrade));
  return undefined;
};
const semver = (v) => { const m = v.match(/(\d+)\.(\d+)\.(\d+)/); return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0]; };

const graded = runs.map((r) => distanceOf(r)).filter((d) => d !== undefined);
const total = graded.length;
const exact = graded.filter((d) => d === 0).length;
const adjacent = graded.filter((d) => d === 1).length;
const twoPlus = graded.filter((d) => d >= 2).length;
const meanDistance = total ? Number((graded.reduce((s, d) => s + d, 0) / total).toFixed(2)) : null;

const byVersion = new Map();
for (const r of runs) { const l = byVersion.get(r.promptVersion) ?? []; l.push(r); byVersion.set(r.promptVersion, l); }
const perVersion = [...byVersion.entries()].map(([version, list]) => {
  const g = list.map(distanceOf).filter((d) => d !== undefined);
  return {
    version, runs: list.length, graded: g.length,
    exact: g.filter((d) => d === 0).length,
    meanDistance: g.length ? Number((g.reduce((s, d) => s + d, 0) / g.length).toFixed(2)) : null,
    firstAt: list.reduce((m, r) => (r.createdAt < m ? r.createdAt : m), list[0].createdAt),
  };
}).sort((a, b) => { const A = semver(a.version), B = semver(b.version); return A[0]-B[0] || A[1]-B[1] || A[2]-B[2] || a.firstAt.localeCompare(b.firstAt); });

const dates = runs.map((r) => r.createdAt).sort();
const snapshot = {
  versions: byVersion.size, totalRuns: runs.length, gradedRuns: total,
  exact, adjacent, twoPlus,
  exactPct: total ? Math.round((exact / total) * 100) : 0,
  withinOnePct: total ? Math.round(((exact + adjacent) / total) * 100) : 0,
  meanDistance, perVersion,
  firstAt: dates[0]?.slice(0, 10), lastAt: dates.at(-1)?.slice(0, 10),
};
fs.writeFileSync("src/lib/run-stats-snapshot.json", JSON.stringify(snapshot, null, 2) + "\n");
console.log(`snapshot: ${snapshot.versions} versions, ${snapshot.totalRuns} runs, ${snapshot.exactPct}% exact, ${snapshot.gradedRuns} graded`);

import "server-only";

import fs from "node:fs";
import path from "node:path";

import type { CalibrationFixture, GradeBand } from "@/lib/types";

const CALIBRATION_DIRECTORY = path.join(process.cwd(), "content", "calibration");

export const CALIBRATION_FIXTURES: CalibrationFixture[] = [
  { id: "2015-ds", examId: "2015-final", label: "2015 answer — DS", actualGrade: "DS", answerPath: "content/calibration/2015-ds.md", status: "ready" },
  { id: "2015-h", examId: "2015-final", label: "2015 answer — H", actualGrade: "H", answerPath: "content/calibration/2015-h.md", status: "ready" },
  {
    id: "2015-p",
    examId: "2015-final",
    label: "2015 answer — P",
    actualGrade: "P",
    answerPath: "content/calibration/2015-p.md",
    status: "ready",
    note: "Replaces the answer originally supplied for this slot, which was a 2014 answer (Diggle/Parkinson, LupinBank/Clearwater, three questions) sent under a 2015 filename. The source of that file supplied this genuine 2015 P answer instead; fingerprinting confirms it against the 2015 final.",
  },
  { id: "2015-lp", examId: "2015-final", label: "2015 answer — LP", actualGrade: "LP", answerPath: "content/calibration/2015-lp.md", status: "ready" },
  { id: "2019-ds", examId: "2019-final", label: "2019 answer — DS", actualGrade: "DS", answerPath: "content/calibration/2019-ds.md", status: "ready" },
  { id: "2019-h", examId: "2019-final", label: "2019 answer — H", actualGrade: "H", answerPath: "content/calibration/2019-h.md", status: "ready" },
  { id: "2019-p", examId: "2019-final", label: "2019 answer — P", actualGrade: "P", answerPath: "content/calibration/2019-p.md", status: "ready" },
  {
    id: "2019-lp",
    examId: "2019-final",
    label: "2019 answer — LP",
    actualGrade: "LP",
    answerPath: "content/calibration/2019-lp.md",
    status: "ready",
    historicalFeedback: [
      {
        author: "Travis Fife",
        date: "2019-11-20T16:31:00Z",
        text: "Need to go through the analysis for each one. See comment below",
        anchor: "York: Outcome determinative since outcome dependent on state vs. fed law...",
      },
      {
        author: "Travis Fife",
        date: "2019-11-20T16:33:00Z",
        text: "Misstatement of Sibbach – the test is ‘really regulates procedure’",
        anchor: "Scalia SG: FRCP is source of law so use valid and applicable test...",
      },
      {
        author: "Travis Fife",
        date: "2019-11-20T16:35:00Z",
        text: "Outside the scope of this assignment",
        anchor: "Stevens SG: FOR CP4(a)(1) and BD, Stevens might side with Ginsburg...",
      },
    ],
  },
];

/**
 * Fixtures withdrawn from the benchmark whose runs are deliberately kept in the
 * store. `2014-p` was the mislabeled answer that occupied the 2015 P slot; it is
 * no longer a submission anyone should review, so it is dropped from the report's
 * submission cards and headline metrics. Its runs stay in the trend, because the
 * per-version rows are a record of what was actually scored at each prompt
 * version and rewriting them would falsify completed QA history.
 *
 * Mirrored in scripts/build-report-snapshot.mjs — keep the two in sync.
 */
export const WITHDRAWN_FIXTURE_IDS = new Set(["2014-p"]);

export function getCalibrationFixture(id: string): CalibrationFixture & { answer: string } {
  const fixture = CALIBRATION_FIXTURES.find((candidate) => candidate.id === id);
  if (!fixture) throw new Error(`Unknown calibration fixture: ${id}`);
  return {
    ...fixture,
    answer: fs.readFileSync(
      path.join(CALIBRATION_DIRECTORY, path.basename(fixture.answerPath)),
      "utf8",
    ).trim(),
  };
}

const BAND_ORDER: GradeBand[] = ["LP", "P", "H", "DS"];

export function gradeDistance(predicted: GradeBand, actual: GradeBand): number {
  return Math.abs(BAND_ORDER.indexOf(predicted) - BAND_ORDER.indexOf(actual));
}

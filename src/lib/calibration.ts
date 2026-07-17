import "server-only";

import fs from "node:fs";
import path from "node:path";

import type { CalibrationFixture, GradeBand } from "@/lib/types";

const CALIBRATION_DIRECTORY = path.join(process.cwd(), "content", "calibration");

export const CALIBRATION_FIXTURES: CalibrationFixture[] = [
  { id: "2015-ds", examId: "2015-final", label: "2015 answer — DS", actualGrade: "DS", answerPath: "content/calibration/2015-ds.md", status: "ready" },
  { id: "2015-h", examId: "2015-final", label: "2015 answer — H", actualGrade: "H", answerPath: "content/calibration/2015-h.md", status: "ready" },
  {
    id: "2014-p",
    examId: "2014-final",
    label: "2014 answer — P",
    actualGrade: "P",
    answerPath: "content/calibration/2015-p.md",
    status: "ready",
    note: "The supplied filename says 2015, but its Diggle/Parkinson and LupinBank/Clearwater problems match the 2014 final exactly; calibrated against that exam.",
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

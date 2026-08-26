import "server-only";

import fs from "node:fs";
import path from "node:path";

import type { CalibrationFixture, GradeBand } from "@/lib/types";

const CALIBRATION_DIRECTORY = path.join(process.cwd(), "content", "calibration");

/**
 * Per-fixture extras that cannot be derived from a filename: provenance notes
 * and real grader comments. Keyed by fixture id and overlaid onto whatever is
 * discovered on disk.
 */
const FIXTURE_NOTES: Record<string, Pick<CalibrationFixture, "note" | "historicalFeedback">> = {
  "2015-p": {
    note: "Replaces the answer originally supplied for this slot, which was a 2014 answer (Diggle/Parkinson, LupinBank/Clearwater, three questions) sent under a 2015 filename. The source of that file supplied this genuine 2015 P answer instead; fingerprinting confirms it against the 2015 final.",
  },
  "2019-lp": {
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
};

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

const BAND_BY_SUFFIX: Record<string, GradeBand> = { ds: "DS", h: "H", p: "P", lp: "LP" };

/**
 * Graded reference answers, discovered from `content/calibration`. A fixture is
 * a file named `<year>-<band>.md` — 2015-ds.md, 2021-h.md — so adding a year's
 * graded ladder is a content drop with no code change.
 *
 * This matters beyond convenience. `gradedAnchorFixtures` prefers a SAME-EXAM
 * reference for each band and only falls back to another year when the same-exam
 * stack is thin, so every year whose ladder lands here stops being banded purely
 * against 2015/2019. As of this writing only 2015 and 2019 have graded ladders,
 * which means the other fourteen practicable exams are banded entirely
 * cross-year.
 */
function discoverFixtures(): CalibrationFixture[] {
  let files: string[];
  try {
    files = fs.readdirSync(CALIBRATION_DIRECTORY);
  } catch {
    return [];
  }
  return files
    .flatMap((fileName) => {
      const match = /^(\d{4})-(ds|h|p|lp)\.md$/i.exec(fileName);
      if (!match) return [];
      const [, year, suffix] = match;
      const band = BAND_BY_SUFFIX[suffix.toLowerCase()];
      const id = `${year}-${suffix.toLowerCase()}`;
      return [{
        id,
        examId: `${year}-final`,
        label: `${year} answer — ${band}`,
        actualGrade: band,
        answerPath: `content/calibration/${fileName}`,
        status: "ready" as const,
        ...FIXTURE_NOTES[id],
      }];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export const CALIBRATION_FIXTURES: CalibrationFixture[] = discoverFixtures();

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

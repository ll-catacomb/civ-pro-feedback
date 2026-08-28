import { describe, expect, it } from "vitest";

import { measureExactMatch, measureOrdering, type RankedRun } from "./band-ordering";

const run = (id: string, ladder: string, actual: RankedRun["actual"], predicted: RankedRun["predicted"], bandLean?: string): RankedRun =>
  ({ id, ladder, actual, predicted, bandLean });

describe("band ordering", () => {
  it("scores a perfect ranking as perfect", () => {
    const result = measureOrdering([
      run("ds", "2015", "DS", "DS"),
      run("h", "2015", "H", "H"),
      run("p", "2015", "P", "P"),
      run("lp", "2015", "LP", "LP"),
    ]);
    expect(result.correct).toBe(6);
    expect(result.inverted).toBe(0);
    expect(result.accuracy).toBe(1);
  });

  it("rewards a correctly ordered but uniformly shifted ranking", () => {
    // Every band one notch low. Exact match is 0, but the ranking is perfect,
    // and this is the case exact-match accuracy misreads as total failure.
    const runs = [
      run("ds", "2015", "DS", "H"),
      run("h", "2015", "H", "P"),
      run("p", "2015", "P", "LP"),
    ];
    expect(measureOrdering(runs).accuracy).toBe(1);
    expect(measureExactMatch(runs).exact).toBe(0);
  });

  it("counts a tie as a miss but distinguishes it from an inversion", () => {
    const tie = measureOrdering([run("ds", "2015", "DS", "H"), run("h", "2015", "H", "H")]);
    expect(tie).toMatchObject({ correct: 0, inverted: 0, tied: 1 });
    expect(tie.inversions).toHaveLength(0);

    const flipped = measureOrdering([run("ds", "2015", "DS", "P"), run("h", "2015", "H", "H")]);
    expect(flipped).toMatchObject({ correct: 0, inverted: 1, tied: 0 });
    expect(flipped.inversions[0]).toMatchObject({ stronger: "ds", weaker: "h" });
  });

  it("uses bandLean to break a within-band tie", () => {
    const runs = [run("ds", "2021", "DS", "H", "high"), run("h", "2021", "H", "H", "solid")];
    // This is the real 2021 result: both landed on H, and the lean orders them.
    expect(measureOrdering(runs, { useLean: true })).toMatchObject({ correct: 1, tied: 0 });
    expect(measureOrdering(runs, { useLean: false })).toMatchObject({ correct: 0, tied: 1 });
  });

  it("never lets a lean cross a band boundary", () => {
    // An H-low must still outrank a P-high; otherwise the tiebreaker would
    // manufacture inversions out of a correct band call.
    const runs = [run("a", "x", "H", "H", "low"), run("b", "x", "P", "P", "high")];
    expect(measureOrdering(runs)).toMatchObject({ correct: 1, inverted: 0 });
  });

  it("never compares across ladders", () => {
    // Bands are curved per cohort, so a 2015 H and a 2021 H make no claim about
    // the same absolute standard and must not be paired.
    const result = measureOrdering([run("a", "2015", "DS", "LP"), run("b", "2021", "LP", "DS")]);
    expect(result.comparable).toBe(0);
  });

  it("reproduces the 8/2026 validation figures", () => {
    const runs = [
      run("2015-ds", "2015", "DS", "H", "high"), run("2015-h", "2015", "H", "P", "solid"),
      run("2015-p", "2015", "P", "P", "solid"), run("2015-lp", "2015", "LP", "P", "solid"),
      run("2019-ds", "2019", "DS", "H", "low"), run("2019-h", "2019", "H", "H", "low"),
      run("2019-p", "2019", "P", "H", "low"), run("2019-lp", "2019", "LP", "LP", "high"),
      run("2021-ds", "2021", "DS", "H", "high"), run("2021-h", "2021", "H", "H", "solid"),
      run("2021-p", "2021", "P", "P", "high"),
    ];
    // Zero inversions across fifteen comparable pairs: the chain never ranked a
    // weaker answer above a stronger one, while exact match sat at 5/11.
    expect(measureOrdering(runs, { useLean: false })).toMatchObject({ correct: 8, inverted: 0, tied: 7 });
    expect(measureOrdering(runs, { useLean: true })).toMatchObject({ correct: 9, inverted: 0, tied: 6 });
    expect(measureExactMatch(runs)).toEqual({ exact: 5, total: 11 });
  });
});

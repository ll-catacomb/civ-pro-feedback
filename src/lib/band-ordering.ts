import type { GradeBand } from "@/lib/types";

/**
 * Ranking accuracy for a set of graded runs, which is the honest measure of band
 * quality on this benchmark. Exact match is not.
 *
 * The calibration ladder is band-stratified: equal numbers of DS, H, P and LP.
 * A real cohort is not — DS is a handful of students out of eighty. A chain that
 * has correctly internalised DS as scarce will therefore under-call it on this
 * fixture set by construction, and exact-match accuracy reads that as failure.
 *
 * The 8/2026 validation made the distinction concrete. Across fifteen pairwise
 * comparisons the chain produced ZERO inversions — it never ranked a weaker
 * answer above a stronger one — while exact match sat at 5/11. Every error was a
 * tie, not a reversal: correct perception, conservative cut-points.
 *
 * So: inversions are real defects and must be investigated. Ties are threshold
 * placement and are much cheaper. `bandLean` breaks some ties correctly and is
 * counted, because the band alone discards a signal the chain already emits.
 */
const BAND_RANK: Record<GradeBand, number> = { LP: 0, P: 1, H: 2, DS: 3 };
// A third of a band: enough to order within a band, never enough to cross one.
const LEAN_OFFSET: Record<string, number> = { low: -0.34, solid: 0, high: 0.34 };

export type RankedRun = {
  id: string;
  /** Grouping key; only runs sharing one are compared (an exam's own ladder). */
  ladder: string;
  actual: GradeBand;
  predicted: GradeBand;
  bandLean?: string;
};

export type OrderingResult = {
  correct: number;
  inverted: number;
  tied: number;
  comparable: number;
  /** Correct / comparable, counting a tie as a miss. 1 means a perfect ranking. */
  accuracy: number;
  /** Pairs the chain actively got backwards. These are the ones worth chasing. */
  inversions: { ladder: string; stronger: string; weaker: string; predicted: string }[];
};

function score(run: RankedRun, useLean: boolean): number {
  const base = BAND_RANK[run.predicted];
  if (!useLean || !run.bandLean) return base;
  return base + (LEAN_OFFSET[run.bandLean] ?? 0);
}

/**
 * Compares every within-ladder pair whose actual bands differ. Pairs from
 * different ladders are never compared: bands are curved per cohort, so a 2015 H
 * and a 2021 H are not claims about the same absolute standard.
 */
export function measureOrdering(runs: RankedRun[], options: { useLean?: boolean } = {}): OrderingResult {
  const useLean = options.useLean ?? true;
  const byLadder = new Map<string, RankedRun[]>();
  for (const run of runs) {
    byLadder.set(run.ladder, [...(byLadder.get(run.ladder) ?? []), run]);
  }
  let correct = 0;
  let inverted = 0;
  let tied = 0;
  const inversions: OrderingResult["inversions"] = [];
  for (const [ladder, items] of byLadder) {
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const [a, b] = [items[i], items[j]];
        const actualGap = BAND_RANK[a.actual] - BAND_RANK[b.actual];
        if (actualGap === 0) continue;
        const predictedGap = score(a, useLean) - score(b, useLean);
        if (predictedGap === 0) {
          tied += 1;
        } else if (actualGap * predictedGap > 0) {
          correct += 1;
        } else {
          inverted += 1;
          const [stronger, weaker] = actualGap > 0 ? [a, b] : [b, a];
          inversions.push({
            ladder,
            stronger: stronger.id,
            weaker: weaker.id,
            predicted: `${weaker.predicted} ranked above ${stronger.predicted}`,
          });
        }
      }
    }
  }
  const comparable = correct + inverted + tied;
  return {
    correct,
    inverted,
    tied,
    comparable,
    accuracy: comparable === 0 ? 0 : correct / comparable,
    inversions,
  };
}

/** Exact band match, kept as a secondary figure. See the note above on why it
 *  understates a chain that ranks correctly but sets cut-points conservatively. */
export function measureExactMatch(runs: RankedRun[]): { exact: number; total: number } {
  return {
    exact: runs.filter((run) => run.predicted === run.actual).length,
    total: runs.length,
  };
}

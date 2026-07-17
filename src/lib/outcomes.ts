import type { AssessmentOutcome, Feedback, FeedbackRun, GradeBand } from "@/lib/types";

const NONRESPONSIVE_PATTERN = /different exam|different examination|unrelated parties|nonresponsive submission|answers? a different/i;

const BAND_SCALE: GradeBand[] = ["LP", "P", "H", "DS"];

export function bandValue(band: GradeBand): number {
  return BAND_SCALE.indexOf(band) + 1;
}

export function hedgedBandLabel(score: number): string {
  const lowerValue = Math.floor(score);
  const fraction = score - lowerValue;
  // A shoulder grade is reserved for a genuine midpoint. Quarter-step means
  // retain their clear lean as a whole band while the raw mean remains saved.
  if (Math.abs(fraction - 0.5) < Number.EPSILON * 10) {
    return `${BAND_SCALE[lowerValue - 1]}–${BAND_SCALE[lowerValue]}`;
  }
  return BAND_SCALE[Math.round(score) - 1];
}

export function getFinalFeedback(run: FeedbackRun): Feedback | undefined {
  return run.dualDecision?.finalFeedback ?? run.judge?.feedback;
}

/**
 * The student-facing estimate. Legacy dual runs preserve a genuine midpoint as
 * a shoulder grade (P–H); single-chain runs flag the evaluator's within-band
 * lean as H+ / H− style edges.
 */
export function getFormativeBandEstimate(run: FeedbackRun): string | undefined {
  if (run.dualDecision?.bandScore !== undefined) {
    return hedgedBandLabel(run.dualDecision.bandScore);
  }
  const legacy = run.dualDecision?.hedgedBand ?? run.dualDecision?.finalBand;
  if (legacy) return legacy;
  if (!run.predictedGrade) return undefined;
  const lean = run.evaluation?.bandLean;
  if (lean === "high") return `${run.predictedGrade}+`;
  if (lean === "low") return `${run.predictedGrade}−`;
  return run.predictedGrade;
}

/** Numeric band estimate on the LP=1 … DS=4 scale; leans count a quarter band. */
export function getFormativeBandScore(run: FeedbackRun): number | undefined {
  if (run.dualDecision?.bandScore !== undefined) return run.dualDecision.bandScore;
  if (!run.predictedGrade) return undefined;
  const lean = run.evaluation?.bandLean;
  return bandValue(run.predictedGrade) + (lean === "high" ? 0.25 : lean === "low" ? -0.25 : 0);
}

export function getAveragedCalibrationDistance(run: FeedbackRun): number | undefined {
  const score = getFormativeBandScore(run);
  return score !== undefined && run.actualGrade
    ? Math.abs(score - bandValue(run.actualGrade))
    : run.calibrationDistance;
}

export function formativeRangeIncludesActual(run: FeedbackRun): boolean {
  const score = getFormativeBandScore(run);
  if (score === undefined || !run.actualGrade) return false;
  const actual = bandValue(run.actualGrade);
  const fraction = score - Math.floor(score);
  return Math.abs(fraction - 0.5) < Number.EPSILON * 10
    ? actual >= Math.floor(score) && actual <= Math.ceil(score)
    : actual === Math.round(score);
}

export function getBandEstimateExplanation(run: FeedbackRun): string | undefined {
  const decision = run.dualDecision;
  if (!decision) {
    const lean = run.evaluation?.bandLean;
    if (lean === "high" && run.predictedGrade) {
      return `The blind evaluation placed this answer at the higher end of the ${run.predictedGrade} band against instructor-graded reference answers.`;
    }
    if (lean === "low" && run.predictedGrade) {
      return `The blind evaluation placed this answer at the lower end of the ${run.predictedGrade} band against instructor-graded reference answers.`;
    }
    return undefined;
  }
  const estimate = getFormativeBandEstimate(run);
  switch (decision.decidedBy) {
    case "provisional_agreement":
      return `Both model graders independently arrived at ${decision.finalBand}.`;
    case "judge_agreement":
      return estimate && estimate !== decision.finalBand
        ? `The two model graders initially disagreed; both cross-model judges resolved the disagreement to ${decision.finalBand}, while the displayed ${estimate} shoulder grade preserves the midpoint of all four opinions.`
        : `The two model graders initially disagreed, and both cross-model judges independently resolved the disagreement to ${decision.finalBand}.`;
    case "majority":
    case "split":
    case "survivor":
      return "The model graders and judges did not fully agree, so their average is shown as a whole or shoulder grade pending instructor review.";
    default:
      break;
  }
  const claudeJudge = run.crossJudges?.claudeOnOpenAI;
  const openaiJudge = run.crossJudges?.openaiOnClaude;
  if (decision.bandsAgreed) {
    return `Both model judges independently arrived at ${decision.finalBand}.`;
  }
  if (claudeJudge && openaiJudge) {
    return `The two model judges landed on different bands (${claudeJudge.finalBand} and ${openaiJudge.finalBand}), so their average is shown as a whole or shoulder grade pending instructor review.`;
  }
  const survivor = claudeJudge ? "Claude" : openaiJudge ? "OpenAI" : "surviving";
  return `Only the ${survivor} cross-model judge completed after retries. Its ${decision.finalBand} estimate is shown provisionally pending instructor review.`;
}

export function getAssessmentOutcome(run: FeedbackRun): AssessmentOutcome {
  if (run.assessmentOutcome) return run.assessmentOutcome;
  const allCriteriaAbsent = Boolean(
    run.evaluation?.criteria.length
    && run.evaluation.criteria.every((criterion) => criterion.coverage === 0),
  );
  const narrative = [
    run.evaluation?.bandRationale,
    run.evaluation?.priorityGaps.join(" "),
    run.judge?.feedback.headline,
    run.judge?.feedback.overview,
  ].filter(Boolean).join(" ");
  if (allCriteriaAbsent && NONRESPONSIVE_PATTERN.test(narrative)) {
    return {
      creditStatus: "zero_nonresponsive",
      score: 0,
      rationale: run.evaluation?.bandRationale ?? "The response does not address the selected examination.",
    };
  }
  return {
    creditStatus: "evaluated",
    score: null,
    rationale: "This legacy run completed substantive evaluation before the responsiveness gate was introduced.",
  };
}

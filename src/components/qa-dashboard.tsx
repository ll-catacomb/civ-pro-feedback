"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Download, LoaderCircle, Play, Save, XCircle } from "lucide-react";

import { runWithConcurrency } from "@/lib/concurrency";
import {
  formativeRangeIncludesActual,
  getAssessmentOutcome,
  getAveragedCalibrationDistance,
  getFinalFeedback,
  getFormativeBandEstimate,
} from "@/lib/outcomes";
import type { CalibrationFixture, FeedbackRun } from "@/lib/types";

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

export function QaDashboard({ fixtures, initialRuns }: { fixtures: CalibrationFixture[]; initialRuns: FeedbackRun[] }) {
  const [runs, setRuns] = useState(initialRuns);
  const [runningIds, setRunningIds] = useState<string[]>([]);
  const [batchProgress, setBatchProgress] = useState<{ completed: number; total: number } | null>(null);
  const [sweepRunning, setSweepRunning] = useState(false);
  const [sweepScope, setSweepScope] = useState<"smoke" | "full">("smoke");
  const [sweepSummary, setSweepSummary] = useState("");
  const [error, setError] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialRuns[0]?.id ?? null);
  const selectedRun = runs.find((run) => run.id === selectedRunId);

  const latestByFixture = useMemo(() => {
    const map = new Map<string, FeedbackRun>();
    for (const run of runs) if (run.calibrationId && !map.has(run.calibrationId)) map.set(run.calibrationId, run);
    return map;
  }, [runs]);
  const calibrationRuns = [...latestByFixture.values()];
  const comparableRuns = calibrationRuns
    .map((run) => ({ run, distance: getAveragedCalibrationDistance(run) }))
    .filter((item): item is { run: FeedbackRun; distance: number } => item.distance !== undefined);
  const exact = comparableRuns.filter(({ run }) => run.calibrationDistance === 0).length;
  const rangeHits = comparableRuns.filter(({ run }) => formativeRangeIncludesActual(run)).length;
  const meanDistance = comparableRuns.length ? comparableRuns.reduce((sum, item) => sum + item.distance, 0) / comparableRuns.length : 0;
  const judgedCalibrationRuns = calibrationRuns.filter((run) => run.judge);
  const averageQuality = judgedCalibrationRuns.length ? judgedCalibrationRuns.reduce((sum, run) => sum + (run.judge?.qualityScore ?? 0), 0) / judgedCalibrationRuns.length : 0;
  const readyCount = fixtures.filter((fixture) => fixture.status === "ready").length;
  const narrativeCount = fixtures.filter((fixture) => fixture.historicalFeedback?.length).length;

  function setFixtureRunning(id: string, running: boolean) {
    setRunningIds((current) => running
      ? current.includes(id) ? current : [...current, id]
      : current.filter((candidate) => candidate !== id));
  }

  async function requestFixture(id: string): Promise<void> {
    const response = await fetch(`/api/calibrations/${id}/run`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Calibration failed.");
    setRuns((current) => [payload.run, ...current.filter((run) => run.id !== payload.run.id)]);
    setSelectedRunId(payload.run.id);
  }

  async function runFixture(id: string) {
    setFixtureRunning(id, true);
    setError("");
    try {
      await requestFixture(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Calibration failed.");
    } finally {
      setFixtureRunning(id, false);
    }
  }

  async function runAllFixtures() {
    const readyFixtures = fixtures.filter((fixture) => fixture.status === "ready");
    setError("");
    setBatchProgress({ completed: 0, total: readyFixtures.length });
    const results = await runWithConcurrency(readyFixtures, 2, async (fixture) => {
      setFixtureRunning(fixture.id, true);
      try {
        await requestFixture(fixture.id);
      } finally {
        setFixtureRunning(fixture.id, false);
        setBatchProgress((current) => current
          ? { ...current, completed: current.completed + 1 }
          : current);
      }
    });
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length > 0) {
      setError(`${failures.length} fixture${failures.length === 1 ? "" : "s"} failed: ${failures.map((failure) => failure.item.label).join(", ")}. Successful runs were saved.`);
    }
    setBatchProgress(null);
  }

  async function runEvaluatorSweep() {
    const fixtureCount = sweepScope === "smoke" ? 4 : readyCount;
    const confirmed = window.confirm(
      `This ${sweepScope} sweep will make up to ${fixtureCount} paid Claude evaluator calls. Continue?`,
    );
    if (!confirmed) return;
    setSweepRunning(true);
    setSweepSummary("");
    setError("");
    try {
      const response = await fetch("/api/calibrations/evaluator-sweep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: sweepScope }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Evaluator sweep failed.");
      const { metrics, results, promptVersion } = payload.sweep;
      const bands = results
        .map((result: { fixtureId: string; actual: string; band?: string; lean?: string }) =>
          `${result.fixtureId} ${result.actual}→${result.band ?? "×"}${result.lean === "high" ? "+" : result.lean === "low" ? "−" : ""}`)
        .join(" · ");
      setSweepSummary(
        `Evaluator sweep (${promptVersion}, ${payload.sweep.scope}, up to ${payload.sweep.maximumPaidCalls} calls) — ${metrics.exact}/${metrics.evaluated} exact, mean ${metrics.meanDistance ?? "—"}. Bands (actual→predicted): ${bands}. Saved to .data/evaluator-sweeps.json; dashboard metrics unaffected.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Evaluator sweep failed.");
    } finally {
      setSweepRunning(false);
    }
  }

  async function saveReview(run: FeedbackRun, rating: number, notes: string) {
    const response = await fetch(`/api/runs/${run.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewerRating: rating, reviewerNotes: notes }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Review could not be saved.");
    setRuns((current) => current.map((item) => item.id === run.id ? payload.run : item));
  }

  return (
    <div className="qa-dashboard">
      <div className="qa-toolbar">
        <div><span className="eyebrow">Blind benchmark set</span><h1>Feedback quality lab</h1><p>Compare model judgment to instructor outcomes without leaking the grade into the chain.</p></div>
        <div className="export-actions">
          <button className="secondary-button batch-run-button" type="button" onClick={runAllFixtures} disabled={runningIds.length > 0 || batchProgress !== null}>
            {batchProgress ? <LoaderCircle className="spin" size={17} /> : <Play size={17} />}
            {batchProgress ? `${batchProgress.completed}/${batchProgress.total} complete` : "Run all blind · 2 parallel"}
          </button>
          <label className="sweep-choice">
            <span>Scope</span>
            <select value={sweepScope} onChange={(event) => setSweepScope(event.target.value as "smoke" | "full")} disabled={sweepRunning}>
              <option value="smoke">4-band smoke</option>
              <option value="full">All {readyCount}</option>
            </select>
          </label>
          <button className="secondary-button" type="button" onClick={runEvaluatorSweep} disabled={sweepRunning || runningIds.length > 0 || batchProgress !== null}>
            {sweepRunning ? <LoaderCircle className="spin" size={17} /> : <Play size={17} />}
            {sweepRunning ? "Sweeping evaluator…" : `Run sweep · up to ${sweepScope === "smoke" ? 4 : readyCount} paid calls`}
          </button>
          <a className="secondary-button" href="/api/export"><Download size={17} /> QA CSV</a>
          <a className="secondary-button" href="/api/export/json"><Download size={17} /> Complete JSON</a>
        </div>
      </div>

      {sweepSummary && <div className="review-warning"><CheckCircle2 size={18} /><span>{sweepSummary}</span></div>}

      <div className="metrics-grid">
        <Metric label="Ready fixtures" value={`${readyCount}`} detail="Across three finals" />
        <Metric label="Evaluated" value={`${calibrationRuns.length}/${readyCount}`} detail="Latest run per fixture" />
        <Metric label="Hard-band exact" value={comparableRuns.length ? `${Math.round((exact / comparableRuns.length) * 100)}%` : "—"} detail={`${rangeHits} whole/shoulder estimates align`} />
        <Metric label="Averaged distance" value={comparableRuns.length ? meanDistance.toFixed(2) : "—"} detail="Fractional bands from actual" />
        <Metric label="Feedback QA" value={judgedCalibrationRuns.length ? `${Math.round(averageQuality)}` : "—"} detail={`${narrativeCount} narrative; ${readyCount - narrativeCount} grade-only`} />
      </div>

      {error && <div className="error-banner"><AlertTriangle size={18} /><span>{error}</span></div>}

      <section className="qa-section">
        <div className="qa-section-heading"><div><span className="eyebrow">Calibration fixtures</span><h2>Known outcomes</h2></div><p>Each run evaluates the answer first, then joins the actual band.</p></div>
        <div className="fixture-table" role="table">
          <div className="fixture-row fixture-header" role="row"><span>Fixture</span><span>Actual</span><span>Estimate</span><span>Avg. distance</span><span>Feedback QA</span><span>Human evidence</span><span>Action</span></div>
          {fixtures.map((fixture) => {
            const run = latestByFixture.get(fixture.id);
            return (
              <div className={`fixture-row ${fixture.status === "mismatch" ? "is-mismatch" : ""}`} key={fixture.id} role="row">
                <div><strong>{fixture.label}</strong>{fixture.note && <small>{fixture.note}</small>}</div>
                <span><b className={`grade grade--${fixture.actualGrade.toLowerCase()}`}>{fixture.actualGrade}</b></span>
                <span>{run && getAssessmentOutcome(run).creditStatus === "zero_nonresponsive" ? <b className="zero-grade">0</b> : run ? <b>{getFormativeBandEstimate(run) ?? "—"}</b> : "—"}</span>
                <span>{run && formativeRangeIncludesActual(run) ? <CheckCircle2 className="match-icon" size={19} /> : run && getAveragedCalibrationDistance(run) !== undefined ? `${getAveragedCalibrationDistance(run)} band${getAveragedCalibrationDistance(run) === 1 ? "" : "s"}` : "—"}</span>
                <span>{run?.judge && getAssessmentOutcome(run).creditStatus !== "zero_nonresponsive" ? run.judge.qualityScore : "—"}</span>
                <span>{fixture.historicalFeedback?.length ? `${fixture.historicalFeedback.length} comments` : "Grade only"}</span>
                <span>
                  {fixture.status === "mismatch" ? <span className="mismatch-label"><XCircle size={16} /> Excluded</span> : (
                    <button className="table-button" onClick={() => runFixture(fixture.id)} disabled={runningIds.length > 0 || batchProgress !== null}>
                      {runningIds.includes(fixture.id) ? <LoaderCircle className="spin" size={15} /> : <Play size={15} />}{runningIds.includes(fixture.id) ? "Running" : run ? "Run again" : "Evaluate blind"}
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="qa-section">
        <div className="qa-section-heading"><div><span className="eyebrow">Run review</span><h2>Audit trail</h2></div><p>Inspect the final judge, stage traces, and your own QA notes.</p></div>
        {runs.length === 0 ? <div className="empty-state"><Play size={22} /><strong>No runs yet</strong><p>Evaluate a ready fixture to create the first trace.</p></div> : (
          <div className="run-review-grid">
            <div className="run-list">
              {runs.map((run) => (
                <button key={run.id} onClick={() => setSelectedRunId(run.id)} className={selectedRunId === run.id ? "is-selected" : ""}>
                  <span><strong>{run.studentLabel}</strong><small>{new Date(run.createdAt).toLocaleString()}</small></span>
                  <span>{getAssessmentOutcome(run).creditStatus === "zero_nonresponsive" ? <b className="zero-grade">0</b> : getFormativeBandEstimate(run) ? <b>{getFormativeBandEstimate(run)}</b> : <b>Review</b>}<small>{getAssessmentOutcome(run).creditStatus === "zero_nonresponsive" ? (run.submissionFitJudge ? "Gate stopped" : "Legacy corrected") : run.pipeline === "dual" ? run.dualDecision?.bandsAgreed ? "Dual consensus" : "Dual disagreement" : run.judge ? `Feedback QA ${run.judge.qualityScore}` : "Manual review"}</small></span>
                </button>
              ))}
            </div>
            {selectedRun && <RunInspector key={selectedRun.id} run={selectedRun} onSave={saveReview} />}
          </div>
        )}
      </section>
    </div>
  );
}

function RunInspector({ run, onSave }: { run: FeedbackRun; onSave: (run: FeedbackRun, rating: number, notes: string) => Promise<void> }) {
  const [rating, setRating] = useState(run.reviewerRating ?? 3);
  const [notes, setNotes] = useState(run.reviewerNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true); setSaved(false);
    try { await onSave(run, rating, notes); setSaved(true); } finally { setSaving(false); }
  }

  const outcome = getAssessmentOutcome(run);
  if (outcome.creditStatus === "zero_nonresponsive") {
    const gateStopped = Boolean(run.submissionFitJudge && !run.judge);
    return (
      <article className="run-inspector">
        <div className="inspector-header"><div><span className="eyebrow">{run.promptVersion}</span><h3>Zero credit: nonresponsive submission</h3></div><span className="verdict is-revised">{gateStopped ? "Gate stopped" : "Legacy corrected"}</span></div>
        <p>{run.submissionFitJudge?.rationale ?? outcome.rationale}</p>
        <div className="run-facts"><div><span>Student score</span><strong>0</strong></div><div><span>Substantive grading</span><strong>{gateStopped ? "Stopped" : "Disregard"}</strong></div><div><span>Mismatch confidence</span><strong>{Math.round((run.submissionFitJudge?.confidence ?? run.evaluation?.confidence ?? 0) * 100)}%</strong></div><div><span>Duration</span><strong>{Math.round(run.totalDurationMs / 1000)}s</strong></div></div>
        <ul className="judge-findings">{run.submissionFitJudge?.controllingEvidence.map((evidence, index) => <li key={index}>{evidence}</li>)}</ul>
        <ReviewForm run={run} rating={rating} setRating={setRating} notes={notes} setNotes={setNotes} save={save} saving={saving} saved={saved} />
      </article>
    );
  }
  if (!run.judge) return <article className="run-inspector"><p>This run requires manual review.</p></article>;
  const judge = run.judge;
  const feedback = getFinalFeedback(run) ?? judge.feedback;
  const dualDecision = run.dualDecision;

  return (
    <article className="run-inspector">
      <div className="inspector-header">
        <div><span className="eyebrow">{run.promptVersion} · {run.pipeline ?? "single"} pipeline</span><h3>{feedback.headline}</h3></div>
        <span className={`verdict ${dualDecision?.bandsAgreed || (!dualDecision && judge.approved) ? "is-approved" : "is-revised"}`}>{dualDecision ? dualDecision.bandsAgreed ? "Dual consensus" : "Manual review" : judge.approved ? "Approved" : "Revised"}</span>
      </div>
      <p>{feedback.overview}</p>
      <div className="run-facts">
        <div><span>Actual</span><strong>{run.actualGrade ?? "—"}</strong></div><div><span>Formative estimate</span><strong>{getFormativeBandEstimate(run) ?? "—"}</strong></div>
        <div><span>Feedback QA</span><strong>{judge.qualityScore}/100</strong></div><div><span>Duration</span><strong>{Math.round(run.totalDurationMs / 1000)}s</strong></div>
      </div>
      <details className="inspector-details" open>
        <summary>Canonical student feedback <ChevronDown size={16} /></summary>
        <div className="benchmark-analysis">
          <div className="analysis-list"><strong>Strengths</strong><ul>{feedback.strengths.map((item, index) => <li key={index}><b>{item.label}</b> {item.detail}</li>)}</ul></div>
          <div className="analysis-list"><strong>Highest-value improvements</strong><ul>{feedback.improvements.map((item, index) => <li key={index}><b>{item.priority} · {item.label}</b> {item.whatHappened}<small>{item.howToImprove}</small></li>)}</ul></div>
          <div className="analysis-list"><strong>Revision plan</strong><ol>{feedback.revisionPlan.map((item, index) => <li key={index}>{item}</li>)}</ol></div>
        </div>
      </details>
      <details className="inspector-details">
        <summary>Stage traces <ChevronDown size={16} /></summary>
        <div className="trace-list">{run.traces.map((trace) => <div key={trace.name}><strong>{trace.name.replaceAll("_", " ")}</strong><span>{trace.model} · {trace.reasoningEffort}</span><small>{Math.round(trace.durationMs / 1000)}s · {trace.inputTokens ?? 0} in / {trace.outputTokens ?? 0} out</small></div>)}</div>
      </details>
      {run.evaluation && (
        <details className="inspector-details" open>
          <summary>Evaluation band boundaries <ChevronDown size={16} /></summary>
          <div className="benchmark-analysis">
            <div className="analysis-summary"><strong>Recommendation: {run.evaluation.provisionalBand}</strong><p>{run.evaluation.bandRationale}</p></div>
            <div className="analysis-list"><strong>Why not higher</strong><p>{run.evaluation.whyNotHigher}</p></div>
            <div className="analysis-list"><strong>Why not lower</strong><p>{run.evaluation.whyNotLower}</p></div>
          </div>
        </details>
      )}
      {run.bandAssessment && (
        <details className="inspector-details" open>
          <summary>Blind band calibration (legacy stage) <ChevronDown size={16} /></summary>
          <div className="benchmark-analysis">
            <div className="analysis-summary"><strong>Final recommendation: {run.bandAssessment.recommendedBand}</strong><p>{run.bandAssessment.rationale}</p></div>
            <div className="band-dimensions">
              {Object.entries(run.bandAssessment.dimensions).map(([label, value]) => <div key={label}><span>{label.replace(/([A-Z])/g, " $1")}</span><strong>{value}/4</strong></div>)}
            </div>
            <div className="analysis-list"><strong>Why not higher</strong><p>{run.bandAssessment.whyNotHigher}</p></div>
            <div className="analysis-list"><strong>Why not lower</strong><p>{run.bandAssessment.whyNotLower}</p></div>
            {run.bandAssessment.evaluatorCorrections.length > 0 && <div className="analysis-list"><strong>Evaluator corrections used</strong><ul>{run.bandAssessment.evaluatorCorrections.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
          </div>
        </details>
      )}
      {run.pipeline === "dual" && run.claudeChain && dualDecision && (
        <details className="inspector-details" open>
          <summary>Cross-model final decision <ChevronDown size={16} /></summary>
          <div className="benchmark-analysis">
            <div className="analysis-summary"><strong>Formative estimate: {getFormativeBandEstimate(run) ?? dualDecision.finalBand}{dualDecision.bandScore !== undefined ? ` (${dualDecision.bandScore}/4)` : ""} · record band: {dualDecision.finalBand}</strong><p>{dualDecision.notes}</p></div>
            {run.pipelineNote && <div className="analysis-summary"><p>{run.pipelineNote}</p></div>}
            <div className="band-dimensions">
              <div><span>OpenAI chain</span><strong>{run.bandAssessment?.recommendedBand ?? run.evaluation?.provisionalBand ?? "—"}</strong></div>
              <div><span>Claude chain</span><strong>{run.claudeChain.bandAssessment?.recommendedBand ?? run.claudeChain.evaluation.provisionalBand}</strong></div>
              <div><span>Claude audits OpenAI</span><strong>{run.crossJudges?.claudeOnOpenAI?.finalBand ?? "—"}</strong></div>
              <div><span>OpenAI audits Claude</span><strong>{run.crossJudges?.openaiOnClaude?.finalBand ?? "—"}</strong></div>
            </div>
            <div className="analysis-list"><strong>OpenAI boundary check</strong><p><b>Not higher:</b> {run.evaluation?.whyNotHigher || "Legacy run — unavailable."}</p><p><b>Not lower:</b> {run.evaluation?.whyNotLower || "Legacy run — unavailable."}</p></div>
            <div className="analysis-list"><strong>Claude boundary check</strong><p><b>Not higher:</b> {run.claudeChain.evaluation.whyNotHigher || "Legacy run — unavailable."}</p><p><b>Not lower:</b> {run.claudeChain.evaluation.whyNotLower || "Legacy run — unavailable."}</p></div>
            {run.crossJudges?.claudeOnOpenAI && <div className="analysis-list"><strong>Claude-on-OpenAI rationale</strong><p>{run.crossJudges.claudeOnOpenAI.rationale}</p></div>}
            {(run.crossJudges?.claudeOnOpenAI?.findings.length ?? 0) > 0 && <div className="analysis-list"><strong>Claude-on-OpenAI findings</strong><ul>{run.crossJudges!.claudeOnOpenAI!.findings.map((item, index) => <li key={index}><b>{item.severity}</b> {item.problem}<small>{item.correction}</small></li>)}</ul></div>}
            {run.crossJudges?.openaiOnClaude && <div className="analysis-list"><strong>OpenAI-on-Claude rationale</strong><p>{run.crossJudges.openaiOnClaude.rationale}</p></div>}
            {(run.crossJudges?.openaiOnClaude?.findings.length ?? 0) > 0 && <div className="analysis-list"><strong>OpenAI-on-Claude findings</strong><ul>{run.crossJudges!.openaiOnClaude!.findings.map((item, index) => <li key={index}><b>{item.severity}</b> {item.problem}<small>{item.correction}</small></li>)}</ul></div>}
            <div className="analysis-list"><strong>Final feedback source</strong><p>{dualDecision.feedbackSource.replaceAll("_", " ")}</p></div>
          </div>
        </details>
      )}
      <details className="inspector-details">
        <summary>Judge findings ({judge.findings.length}) <ChevronDown size={16} /></summary>
        <ul className="judge-findings">{judge.findings.length ? judge.findings.map((finding, index) => <li key={index}><strong>{finding.severity}</strong> {finding.problem} <em>{finding.correction}</em></li>) : <li>No material findings.</li>}</ul>
      </details>
      <details className="inspector-details" open>
        <summary>Historical benchmark comparison <ChevronDown size={16} /></summary>
        <div className="benchmark-analysis">
          {run.historicalFeedback?.length ? (
            <div className="historical-comments">
              <strong>Actual grader comments</strong>
              {run.historicalFeedback.map((comment, index) => (
                <blockquote key={`${comment.author}-${index}`}>
                  <p>{comment.text}</p>
                  <small>{comment.author} · anchored to “{comment.anchor}”</small>
                </blockquote>
              ))}
            </div>
          ) : <p className="evidence-limit"><strong>Grade-only benchmark.</strong> No narrative grader comments were present in the supplied answer file, so the system must not claim comment-level agreement.</p>}
          {run.calibrationAnalysis ? (
            <>
              <div className="analysis-summary"><strong>{run.calibrationAnalysis.gradeAgreement.replaceAll("_", " ")}</strong><p>{run.calibrationAnalysis.summary}</p></div>
              {run.calibrationAnalysis.missedFindings.length > 0 && <div className="analysis-list"><strong>Missed benchmark findings</strong><ul>{run.calibrationAnalysis.missedFindings.map((item, index) => <li key={index}><b>{item.severity}</b> {item.benchmarkEvidence}<small>{item.chainCoverage}</small></li>)}</ul></div>}
              {run.calibrationAnalysis.unsupportedOrOverstatedFindings.length > 0 && <div className="analysis-list"><strong>Unsupported or overstated</strong><ul>{run.calibrationAnalysis.unsupportedOrOverstatedFindings.map((item, index) => <li key={index}><b>{item.severity}</b> {item.chainFinding}<small>{item.problem}</small></li>)}</ul></div>}
              <div className="analysis-list"><strong>Prompt-change candidates</strong>{run.calibrationAnalysis.promptRecommendations.length ? <ul>{run.calibrationAnalysis.promptRecommendations.map((item, index) => <li key={index}><b>{item.targetStage.replaceAll("_", " ")}</b> {item.proposedChange}<small>{item.evidence}</small></li>)}</ul> : <p>No evidence-backed prompt change recommended from this run alone.</p>}</div>
            </>
          ) : <p className="evidence-limit">Post-hoc comparison was not available for this run. Run the fixture again to create it.</p>}
        </div>
      </details>
      <ReviewForm run={run} rating={rating} setRating={setRating} notes={notes} setNotes={setNotes} save={save} saving={saving} saved={saved} />
    </article>
  );
}

function ReviewForm({ run, rating, setRating, notes, setNotes, save, saving, saved }: { run: FeedbackRun; rating: number; setRating: (value: number) => void; notes: string; setNotes: (value: string) => void; save: () => Promise<void>; saving: boolean; saved: boolean }) {
  return <div className="review-form"><label>Human feedback-quality rating</label><div className="rating-row">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" className={rating === value ? "is-selected" : ""} onClick={() => setRating(value)}>{value}</button>)}</div><label htmlFor={`notes-${run.id}`}>QA notes</label><textarea id={`notes-${run.id}`} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What was accurate? What should the next prompt version change?" /><button className="primary-button compact" onClick={save} disabled={saving} type="button"><Save size={16} /> {saving ? "Saving…" : saved ? "Saved" : "Save review"}</button></div>;
}

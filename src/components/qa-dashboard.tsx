"use client";

import { useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronDown, Download, FileText,
  LoaderCircle, Maximize2, Minimize2, Play, ShieldCheck,
} from "lucide-react";

import { runWithConcurrency } from "@/lib/concurrency";
import type { ReportFixture, ReportModel } from "@/lib/report-model";
import type { CalibrationFixture } from "@/lib/types";

function pct(n: number, d: number): string {
  return d ? `${Math.round((n / d) * 100)}%` : "—";
}

function resultLabel(distance: number | null): { text: string; tone: "good" | "mid" | "bad" } {
  if (distance === null) return { text: "—", tone: "mid" };
  if (distance === 0) return { text: "Exact band", tone: "good" };
  if (distance === 1) return { text: "1 band off", tone: "mid" };
  return { text: `${distance} bands off`, tone: "bad" };
}

function BandChip({ band }: { band: string | null }) {
  if (!band) return <span className="report-band">—</span>;
  const base = band.replace(/[+−-]/g, "").toLowerCase();
  return <span className={`report-band report-band--${base}`}>{band}</span>;
}

function SubmissionCard({ fx, open, onToggle }: { fx: ReportFixture; open: boolean; onToggle: () => void }) {
  const result = resultLabel(fx.distance);
  const fb = fx.feedback;
  return (
    <div className={`sub-card ${open ? "is-open" : ""}`}>
      <button className="sub-card__head" onClick={onToggle} aria-expanded={open}>
        <span className="sub-card__title"><FileText size={16} /> {fx.label}</span>
        <span className="sub-card__meta">
          <span className="sub-stat"><small>Instructor</small><BandChip band={fx.actual} /></span>
          <span className="sub-stat"><small>System</small><BandChip band={fx.estimate ?? fx.predicted} /></span>
          <span className={`sub-result sub-result--${result.tone}`}>{result.text}</span>
          <span className="sub-stat"><small>Feedback QA</small><b>{fx.qa ?? "—"}</b></span>
        </span>
        <ChevronDown className="sub-card__chev" size={18} />
      </button>

      {open && (
        <div className="sub-card__body">
          <div className="subfb-grid">
            <div className="subfb-col">
              <div className="subfb-col__label">Student submission</div>
              <div className="submission-text">{fx.answer}</div>
            </div>
            <div className="subfb-col">
              <div className="subfb-col__label">Feedback the student receives</div>
              {fb ? (
                <div className="fb-render">
                  <h4>{fb.headline}</h4>
                  <p className="fb-overview">{fb.overview}</p>
                  {fb.strengths.length > 0 && <>
                    <div className="fb-sub"><CheckCircle2 size={14} /> What is working</div>
                    <ul className="fb-list">{fb.strengths.map((s, i) => <li key={i}><strong>{s.label}.</strong> {s.detail}{s.answerExcerpt && <blockquote>“{s.answerExcerpt}”</blockquote>}</li>)}</ul>
                  </>}
                  {fb.improvements.length > 0 && <>
                    <div className="fb-sub"><AlertTriangle size={14} /> Highest-value improvements</div>
                    <ul className="fb-list">{fb.improvements.map((im, i) => <li key={i}><span className={`fb-pri fb-pri--${im.priority}`}>{im.priority}</span> <strong>{im.label}.</strong> <em>What happened:</em> {im.whatHappened} <em>Why it matters:</em> {im.whyItMatters} <em>Try this next:</em> {im.howToImprove}</li>)}</ul>
                  </>}
                  {fb.revisionPlan.length > 0 && <>
                    <div className="fb-sub">Revision plan</div>
                    <ol className="fb-plan">{fb.revisionPlan.map((step, i) => <li key={i}>{step}</li>)}</ol>
                  </>}
                  {fb.exampleRevision && <><div className="fb-sub">Example of a stronger move</div><p className="fb-example">{fb.exampleRevision}</p></>}
                  {fb.closing && <p className="fb-closing">{fb.closing}</p>}
                </div>
              ) : <p className="evidence-limit">No feedback was produced for this run.</p>}
            </div>
          </div>

          <div className="sub-card__foot">
            <div className="sub-foot-block">
              <strong>How the band was reasoned</strong>
              <p>{fx.bandRationale || "—"}</p>
              {(fx.whyNotHigher || fx.whyNotLower) && (
                <div className="sub-foot-boundary">
                  <div><span>Why not higher</span><p>{fx.whyNotHigher || "—"}</p></div>
                  <div><span>Why not lower</span><p>{fx.whyNotLower || "—"}</p></div>
                </div>
              )}
            </div>
            {fx.judgeFindings.length > 0 && (
              <div className="sub-foot-block">
                <strong><ShieldCheck size={13} /> Skeptical-judge audit</strong>
                <ul className="sub-findings">{fx.judgeFindings.map((f, i) => <li key={i} className={`sf sf--${f.severity}`}><span>{f.severity}</span> {f.problem}{f.correction && f.correction !== "None required." && <em> Correction: {f.correction}</em>}</li>)}</ul>
              </div>
            )}
            {fx.historical.length > 0 && (
              <div className="sub-foot-block">
                <strong>Actual grader comments (from the original exam)</strong>
                {fx.historical.map((h, i) => <blockquote key={i} className="sub-historical"><p>{h.text}</p><small>{h.author} · “{h.anchor}”</small></blockquote>)}
              </div>
            )}
            {!fx.isLatestVersion && <p className="sub-note">Shown from an earlier prompt version ({fx.promptVersion.replace("civpro-feedback-", "")}); not yet re-scored on the current version.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function QaReport({ report, interactive, fixtures }: { report: ReportModel; interactive: boolean; fixtures: CalibrationFixture[] }) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<null | { done: number; total: number }>(null);
  const [error, setError] = useState("");

  const s = report.summary;
  const version = report.latestVersion.replace("civpro-feedback-", "");
  const first = report.trend[0];
  const improved = first && s.meanDistance !== null && first.meanDistance !== null && s.meanDistance < first.meanDistance;
  const allOpen = report.fixtures.length > 0 && openIds.size === report.fixtures.length;

  function toggle(id: string) {
    setOpenIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function expandAll() { setOpenIds(new Set(report.fixtures.map((f) => f.fixtureId))); }
  function collapseAll() { setOpenIds(new Set()); }

  async function runAll() {
    const ready = fixtures.filter((f) => f.status === "ready");
    if (!window.confirm(`Re-score all ${ready.length} calibration answers on the current prompt version? This makes paid model calls and reloads the report when finished.`)) return;
    setError("");
    setBusy({ done: 0, total: ready.length });
    const results = await runWithConcurrency(ready, 2, async (fixture) => {
      const res = await fetch(`/api/calibrations/${fixture.id}/run`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error || "run failed");
      setBusy((c) => c ? { ...c, done: c.done + 1 } : c);
    });
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length) { setError(`${failed.length} fixture(s) failed; successful runs were saved.`); setBusy(null); }
    else window.location.reload();
  }

  return (
    <div className="qa-report">
      <header className="report-hero">
        <div className="report-hero__lead">
          <span className="eyebrow">Feedback quality report · {version}</span>
          <h1>How the CivPro grader performs</h1>
          <p>
            On {s.count} instructor-graded exam answers, graded blind (the model never sees the real grade), the
            current version matched the <strong>exact band {s.exact}/{s.count}</strong> and landed{" "}
            <strong>within one band {s.withinOne}/{s.count}</strong> — a mean of {s.meanDistance ?? "—"} bands from the
            instructor&rsquo;s grade{improved ? `, down from ${first.meanDistance} at the first tracked version` : ""}.
            Bands run LP → P → H → DS; a “+” marks the upper end of a band. Expand any answer below to read the exact
            submission and the feedback a student would receive, side by side.
          </p>
        </div>
        {interactive && (
          <div className="report-ops">
            <span className="report-ops__label">Operator tools</span>
            <button className="secondary-button" type="button" onClick={runAll} disabled={busy !== null}>
              {busy ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />}
              {busy ? `${busy.done}/${busy.total} re-scored…` : "Re-score all"}
            </button>
            <a className="secondary-button" href="/api/export"><Download size={16} /> CSV</a>
            <a className="secondary-button" href="/api/export/json"><Download size={16} /> JSON</a>
          </div>
        )}
      </header>

      {error && <div className="error-banner"><AlertTriangle size={18} /><span>{error}</span></div>}

      <section className="report-section">
        <div className="report-metrics">
          <div className="report-metric"><span>Exact band</span><strong>{pct(s.exact, s.count)}</strong><small>{s.exact} of {s.count} answers</small></div>
          <div className="report-metric"><span>Within one band</span><strong>{pct(s.withinOne, s.count)}</strong><small>{s.withinOne} of {s.count} answers</small></div>
          <div className="report-metric"><span>Mean distance</span><strong>{s.meanDistance ?? "—"}</strong><small>bands from the instructor grade</small></div>
          <div className="report-metric"><span>Feedback QA</span><strong>{s.avgQa ?? "—"}</strong><small>avg. self-audit score /100</small></div>
        </div>

        <div className="report-scorecard">
          <div className="score-row score-head"><span>Answer</span><span>Instructor</span><span>System</span><span>Result</span><span>Feedback QA</span></div>
          {report.fixtures.map((f) => {
            const r = resultLabel(f.distance);
            return (
              <div className="score-row" key={f.fixtureId}>
                <span className="score-label">{f.label}</span>
                <span><BandChip band={f.actual} /></span>
                <span><BandChip band={f.estimate ?? f.predicted} /></span>
                <span className={`sub-result sub-result--${r.tone}`}>{r.text}</span>
                <span>{f.qa ?? "—"}</span>
              </div>
            );
          })}
        </div>
      </section>

      {report.trend.length > 1 && (
        <section className="report-section">
          <div className="report-section__head"><span className="eyebrow">Track record</span><h2>Improvement across prompt versions</h2><p>Each version was re-scored blind against the same answers. Distance is whole-band; lower is better.</p></div>
          <div className="report-trend">
            <div className="trend-row trend-head"><span>Version</span><span>Answers</span><span>Exact</span><span>Within 1</span><span>Mean distance</span></div>
            {report.trend.map((t) => (
              <div className={`trend-row ${t.version === report.latestVersion ? "is-latest" : ""}`} key={t.version}>
                <span className="trend-ver">{t.version.replace("civpro-feedback-", "")}{t.version === report.latestVersion && <em>current</em>}</span>
                <span>{t.graded}</span>
                <span>{t.exact}/{t.graded}</span>
                <span>{t.withinOne}/{t.graded}</span>
                <span>{t.meanDistance ?? "—"}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="report-section">
        <div className="report-section__head report-section__head--row">
          <div><span className="eyebrow">Case by case</span><h2>Every submission and its feedback</h2></div>
          <button className="text-toggle" type="button" onClick={allOpen ? collapseAll : expandAll}>
            {allOpen ? <><Minimize2 size={15} /> Collapse all</> : <><Maximize2 size={15} /> Expand all</>}
          </button>
        </div>
        <div className="sub-cards">
          {report.fixtures.map((f) => (
            <SubmissionCard key={f.fixtureId} fx={f} open={openIds.has(f.fixtureId)} onToggle={() => toggle(f.fixtureId)} />
          ))}
        </div>
        <p className="formative-note">Formative estimates for study and calibration — not official grades. The grade shown is produced before any real grade is joined to the run.</p>
      </section>
    </div>
  );
}

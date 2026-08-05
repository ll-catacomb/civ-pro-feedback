"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, Check, ChevronDown, CircleCheck, FileText,
  LoaderCircle, RotateCcw, ShieldCheck, Sparkles,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

import { GavelGame } from "@/components/gavel-game";
import {
  getAssessmentOutcome,
  getBandEstimateExplanation,
  getFinalFeedback,
  getFormativeBandEstimate,
} from "@/lib/outcomes";
import type { Exam, Feedback, FeedbackRun } from "@/lib/types";

function SourceBadges({ ids, run }: { ids: string[]; run: FeedbackRun }) {
  if (!ids.length) return null;
  return (
    <div className="source-badges">
      {ids.map((id) => {
        const source = run.sources.find((candidate) => candidate.id === id);
        return <span key={id} title={source?.title ?? id}>{source?.title ?? id}</span>;
      })}
    </div>
  );
}

function ChainReport({ title, feedback }: { title: string; feedback: Feedback }) {
  return (
    <details className="rail-details">
      <summary>{title} <ChevronDown size={16} /></summary>
      <div className="chain-report">
        <strong>{feedback.headline}</strong>
        <p>{feedback.overview}</p>
        {feedback.strengths.length > 0 && (
          <ul>{feedback.strengths.map((strength, index) => <li key={index}><b>{strength.label}.</b> {strength.detail}</li>)}</ul>
        )}
        {feedback.improvements.length > 0 && (
          <ul>{feedback.improvements.map((improvement, index) => <li key={index}><b>{improvement.label}.</b> {improvement.howToImprove}</li>)}</ul>
        )}
        <p>{feedback.closing}</p>
      </div>
    </details>
  );
}

/** "hybrid" only appears on runs persisted before v4.2.0's embedding removal. */
function retrievalMethodLabel(run: FeedbackRun): string {
  const methods = new Set(run.sources.map((source) => source.retrievalMethod));
  if (methods.has("expanded_lexical")) return "Doctrine-vocabulary course search.";
  if (methods.has("hybrid")) return "Hybrid semantic + lexical retrieval.";
  return "Issue-map keyword search (query expansion unavailable).";
}

function FeedbackResult({ run, onReset }: { run: FeedbackRun; onReset: () => void }) {
  const outcome = getAssessmentOutcome(run);
  const retrievalLabel = retrievalMethodLabel(run);
  if (outcome.creditStatus === "zero_nonresponsive") {
    return <ZeroCreditResult run={run} onReset={onReset} />;
  }
  const feedback = getFinalFeedback(run);
  if (!run.judge || !feedback) {
    return (
      <section className="result-shell">
        <div className="error-banner"><AlertTriangle size={18} /><span>This run requires instructor review before feedback can be released.</span></div>
        <button className="secondary-button" onClick={onReset} type="button"><RotateCcw size={16} /> Start another response</button>
      </section>
    );
  }
  const judge = run.judge;
  const dualDecision = run.dualDecision;
  const manualReviewMessage = dualDecision && !dualDecision.bandsAgreed
    ? "The two cross-model judges selected different bands. Treat this feedback as provisional pending instructor review."
    : "The exam-responsiveness checks disagreed. Treat this feedback as provisional pending instructor review.";
  return (
    <section className="result-shell" aria-live="polite">
      {outcome.creditStatus === "manual_review" && (
        <div className="review-warning"><AlertTriangle size={18} /><span>{manualReviewMessage}</span></div>
      )}
      <div className="result-heading">
        <div>
          <span className="eyebrow">Your feedback</span>
          <h2>{feedback.headline}</h2>
          <p>{feedback.overview}</p>
        </div>
        <div className={`quality-seal ${dualDecision?.bandsAgreed || (!dualDecision && judge.approved) ? "is-approved" : "is-revised"}`}>
          <ShieldCheck size={22} />
          <span><strong>{dualDecision ? "Cross-model audited" : "Audited"}</strong></span>
          <small>{dualDecision ? (dualDecision.bandsAgreed ? "Judges agreed" : "Review required") : judge.approved ? "Feedback approved" : "Feedback revised"}</small>
        </div>
      </div>

      <div className="result-grid">
        <div className="result-main">
          <section className="feedback-section">
            <div className="section-kicker"><CircleCheck size={18} /> What is working</div>
            <div className="feedback-stack">
              {feedback.strengths.map((strength, index) => (
                <article className="feedback-card strength-card" key={`${strength.label}-${index}`}>
                  <h3>{strength.label}</h3>
                  <p>{strength.detail}</p>
                  {strength.answerExcerpt && <blockquote>“{strength.answerExcerpt}”</blockquote>}
                  <SourceBadges ids={strength.sourceIds} run={run} />
                </article>
              ))}
            </div>
          </section>

          <section className="feedback-section">
            <div className="section-kicker"><Sparkles size={18} /> Highest-value improvements</div>
            <div className="feedback-stack">
              {feedback.improvements.map((improvement, index) => (
                <article className="feedback-card improvement-card" key={`${improvement.label}-${index}`}>
                  <div className="card-title-row">
                    <span className={`priority priority--${improvement.priority}`}>{improvement.priority}</span>
                    <h3>{improvement.label}</h3>
                  </div>
                  <dl className="coaching-grid">
                    <div><dt>What happened</dt><dd>{improvement.whatHappened}</dd></div>
                    <div><dt>Why it matters</dt><dd>{improvement.whyItMatters}</dd></div>
                    <div><dt>Try this next</dt><dd>{improvement.howToImprove}</dd></div>
                  </dl>
                  <SourceBadges ids={improvement.sourceIds} run={run} />
                </article>
              ))}
            </div>
          </section>

          <section className="revision-panel">
            <span className="eyebrow">Revision plan</span>
            <ol>{feedback.revisionPlan.map((step, index) => <li key={index}>{step}</li>)}</ol>
            <div className="example-revision">
              <strong>Example of a stronger move</strong>
              <p>{feedback.exampleRevision}</p>
            </div>
            <p className="closing-note">{feedback.closing}</p>
          </section>
        </div>

        <aside className="evidence-rail">
          {getFormativeBandEstimate(run) && (
            <div className="rail-card">
              <span className="eyebrow">Estimated band</span>
              <strong>{getFormativeBandEstimate(run)}{dualDecision?.bandScore !== undefined && ` · ${dualDecision.bandScore}/4`}</strong>
              <p>
                {getBandEstimateExplanation(run) ?? "The blind evaluation compared this answer against instructor-graded reference answers."}
                {" "}This is a formative estimate, not an official grade.
              </p>
            </div>
          )}
          <div className="rail-card">
            <span className="eyebrow">Grounding record</span>
            <strong>{run.sources.length} course excerpts</strong>
            <p><b>{retrievalLabel}</b> Selected from non-exam course materials; the chosen exam and model answer are supplied separately.</p>
          </div>
          <details className="rail-details">
            <summary>View cited sources <ChevronDown size={16} /></summary>
            <div className="source-list">
              {run.sources.map((source) => (
                <article key={source.id}>
                  <strong>{source.title}</strong>
                  <small>{source.path.replace("content/course/", "")}</small>
                  <p>{source.excerpt.slice(0, 320)}{source.excerpt.length > 320 ? "…" : ""}</p>
                  {source.rerankReason && <p><b>Why selected:</b> {source.rerankReason}</p>}
                </article>
              ))}
            </div>
          </details>
          {dualDecision && run.claudeChain && (
            <>
              <ChainReport title="OpenAI model report" feedback={judge.feedback} />
              <ChainReport title="Claude model report" feedback={run.claudeChain.judge.feedback} />
            </>
          )}
          <details className="rail-details">
            <summary>Judge audit <ChevronDown size={16} /></summary>
            <div className="audit-list">
              {Object.entries(judge.checks).map(([label, score]) => (
                <div key={label}><span>{label.replace(/([A-Z])/g, " $1")}</span><strong>{score}/4</strong></div>
              ))}
            </div>
            {judge.findings.length > 0 && (
              <ul className="judge-findings">
                {judge.findings.map((finding, index) => <li key={index}><strong>{finding.severity}</strong> {finding.problem}</li>)}
              </ul>
            )}
          </details>
          <button className="secondary-button full-width" onClick={onReset} type="button">
            <RotateCcw size={16} /> Start another response
          </button>
          <p className="formative-note">Formative feedback only. It is not an official grade or legal advice.</p>
        </aside>
      </div>
    </section>
  );
}

function ZeroCreditResult({ run, onReset }: { run: FeedbackRun; onReset: () => void }) {
  const gate = run.submissionFitJudge;
  const outcome = getAssessmentOutcome(run);
  const gateStopped = Boolean(gate && !run.judge);
  return (
    <section className="result-shell zero-result" aria-live="polite">
      <div className="zero-result__score"><span>Assessment score</span><strong>0</strong><small>No credit</small></div>
      <div className="zero-result__content">
        <span className="eyebrow">Nonresponsive submission</span>
        <h2>This response does not answer the selected examination.</h2>
        <p>{gate?.rationale ?? outcome.rationale}</p>
        {gate?.controllingEvidence.length ? (
          <div className="zero-evidence">
            <strong>Controlling evidence</strong>
            <ul>{gate.controllingEvidence.map((evidence, index) => <li key={index}>{evidence}</li>)}</ul>
          </div>
        ) : null}
        {gate?.likelyOtherExam && <p className="likely-exam"><strong>Possible matching exam:</strong> {gate.likelyOtherExam}</p>}
        <p className="zero-policy">A response directed to different questions receives zero credit regardless of the quality of its legal analysis. {gateStopped ? "Substantive grading stopped at intake." : "This legacy run continued before the gate existed; disregard its substantive feedback."}</p>
        <button className="secondary-button" onClick={onReset} type="button"><RotateCcw size={16} /> Submit the correct response</button>
      </div>
    </section>
  );
}

function WaitingView({ exam }: { exam: Exam }) {
  return (
    <section className="waiting-shell" aria-live="polite">
      <div className="waiting-head">
        <LoaderCircle className="spin" size={20} />
        <div>
          <strong>Grading your {exam.year} practice answer…</strong>
          <span>This usually takes about 10–15 minutes. Keep this tab open — your feedback appears here on its own when it&rsquo;s ready.</span>
        </div>
      </div>
      <GavelGame />
    </section>
  );
}

export function PracticeWorkspace({ exams }: { exams: Exam[] }) {
  const [selectedId, setSelectedId] = useState(exams[0].id);
  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [run, setRun] = useState<FeedbackRun | null>(null);
  const selectedExam = useMemo(() => exams.find((exam) => exam.id === selectedId) ?? exams[0], [exams, selectedId]);
  const wordCount = answer.trim() ? answer.trim().split(/\s+/).length : 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: selectedId, answer, studentLabel: "Anonymous practice" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Feedback failed.");
      setRun(payload.run);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Feedback failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (run) return <FeedbackResult run={run} onReset={() => { setRun(null); setAnswer(""); }} />;
  if (isSubmitting) return <WaitingView exam={selectedExam} />;

  return (
    <section className="practice-shell" id="practice">
      <form className="practice-form" onSubmit={submit}>
        <div className="practice-field">
          <label className="field-label">Which exam are you practicing?</label>
          <div className="exam-options">
            {exams.map((exam) => (
              <button className={`exam-option ${selectedId === exam.id ? "is-selected" : ""}`} key={exam.id} type="button" onClick={() => setSelectedId(exam.id)}>
                <span>{exam.year}</span><strong>{exam.questionCount} questions</strong>
                {selectedId === exam.id && <Check size={17} />}
              </button>
            ))}
          </div>
          <details className="exam-document">
            <summary><FileText size={15} /> Read the {selectedExam.year} exam <ChevronDown size={16} /></summary>
            <div className="markdown-document"><ReactMarkdown>{selectedExam.prompt}</ReactMarkdown></div>
          </details>
        </div>

        <div className="practice-field">
          <div className="answer-heading">
            <label className="field-label" htmlFor="answer">Paste your answer</label>
            <span className="word-count">{wordCount.toLocaleString()} words</span>
          </div>
          <textarea id="answer" className="answer-textarea" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Paste your full exam answer here…" minLength={120} required />
        </div>

        {error && <div className="error-banner"><AlertTriangle size={18} /><span>{error}</span></div>}
        <div className="practice-submit">
          <button className="primary-button" type="submit" disabled={answer.trim().length < 120}>Get feedback <ArrowRight size={18} /></button>
          <span className="submit-note">Takes about 10–15 minutes. Formative feedback and an estimated band — not an official grade.</span>
        </div>
      </form>
    </section>
  );
}

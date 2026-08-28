"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, ChevronDown, CircleCheck, FileText,
  LoaderCircle, RotateCcw, ShieldCheck, Sparkles,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

import { GavelGame } from "@/components/gavel-game";
import {
  getAssessmentOutcome,
  getBandEstimateExplanation,
  getFinalFeedback,
  getFormativeBandEstimate,
  bandSuppressionReason,
  isUnreviewedDraft,
} from "@/lib/outcomes";
import type { Exam, Feedback, FeedbackRun, SubmissionMode, SubmissionScope } from "@/lib/types";

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

/**
 * The exam's own question labels, in order, for the single-question picker.
 * Mirrors countQuestions in exams.ts: six label formats across the corpus, plus
 * PDF form feeds before a label that opens a page. Parents whose subparts are
 * separately scored are dropped, so the student picks the thing that is graded.
 */
function listQuestionLabels(prompt: string): string[] {
  const labels: string[] = [];
  for (const match of prompt.matchAll(/^[^\S\r\n]*(?:#{1,6}[^\S\r\n]*)?(?:\*\*)?[^\S\r\n]*Question[^\S\r\n]+(\d+)[^\S\r\n]*(\([a-z]\))?/gim)) {
    const label = `Question ${match[1]}${match[2] ? match[2].toLowerCase() : ""}`;
    if (!labels.includes(label)) labels.push(label);
  }
  const parents = new Set(
    labels.filter((label) => label.endsWith(")")).map((label) => label.replace(/\(.*/, "").trim()),
  );
  return labels.filter((label) => !parents.has(label));
}

type QuestionScoped = { questionRef?: string; crossCutting?: boolean };

/**
 * Groups feedback cards by the exam question they concern, preserving the order
 * the chain emitted (exam order as of v4.8.0). Cross-cutting cards and anything
 * from a pre-v4.8.0 run without a questionRef fall into a trailing group.
 */
function groupByQuestion<T extends QuestionScoped>(items: T[]): { heading: string; items: T[] }[] {
  const groups: { heading: string; items: T[] }[] = [];
  for (const item of items) {
    const heading = !item.crossCutting && item.questionRef ? item.questionRef : "Across the whole exam";
    const existing = groups.find((group) => group.heading === heading);
    if (existing) existing.items.push(item);
    else groups.push({ heading, items: [item] });
  }
  // A trailing catch-all reads as a footnote; leading, it buries the questions.
  return [
    ...groups.filter((group) => group.heading !== "Across the whole exam"),
    ...groups.filter((group) => group.heading === "Across the whole exam"),
  ];
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
  const improvementGroups = groupByQuestion(feedback.improvements);
  // Only treat the example as placed if its ref actually matches a rendered
  // group; otherwise a stray ref would drop the example from the page entirely.
  const exampleIsInline = improvementGroups.some(
    (group) => group.heading === feedback.exampleRevisionRef,
  );
  const unreviewed = isUnreviewedDraft(run);
  const manualReviewMessage = dualDecision && !dualDecision.bandsAgreed
    ? "The two cross-model judges selected different bands. Treat this feedback as provisional pending instructor review."
    : "The exam-responsiveness checks disagreed. Treat this feedback as provisional pending instructor review.";
  return (
    <section className="result-shell" aria-live="polite">
      {outcome.creditStatus === "manual_review" && (
        <div className="review-warning"><AlertTriangle size={18} /><span>{manualReviewMessage}</span></div>
      )}
      {unreviewed && (
        <div className="review-warning">
          <AlertTriangle size={18} />
          <span>
            This feedback did not clear the final accuracy check, so you are seeing the
            draft. It may contain errors the review pass would have caught. Treat it as
            provisional and check anything doctrinal against the course materials.
          </span>
        </div>
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
          <small>{unreviewed ? "Unreviewed draft" : dualDecision ? (dualDecision.bandsAgreed ? "Judges agreed" : "Review required") : judge.approved ? "Feedback approved" : "Feedback revised"}</small>
        </div>
      </div>

      <div className="result-grid">
        <div className="result-main">
          <section className="feedback-section">
            <div className="section-kicker"><CircleCheck size={18} /> What is working</div>
            {groupByQuestion(feedback.strengths).map((group) => (
              <div className="question-group" key={group.heading}>
                <h4 className="question-heading">{group.heading}</h4>
                <div className="feedback-stack">
                  {group.items.map((strength, index) => (
                    <article className="feedback-card strength-card" key={`${strength.label}-${index}`}>
                      <h3>{strength.label}</h3>
                      <p>{strength.detail}</p>
                      {strength.answerExcerpt && <blockquote>“{strength.answerExcerpt}”</blockquote>}
                      <SourceBadges ids={strength.sourceIds} run={run} />
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className="feedback-section">
            <div className="section-kicker"><Sparkles size={18} /> What to work on</div>
            {improvementGroups.map((group) => (
              <div className="question-group" key={group.heading}>
                <h4 className="question-heading">{group.heading}</h4>
                <div className="feedback-stack">
                  {group.items.map((improvement, index) => (
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
                {feedback.exampleRevisionRef === group.heading && (
                  <div className="example-revision inline-example">
                    <strong>Example of a stronger move</strong>
                    <p>{feedback.exampleRevision}</p>
                  </div>
                )}
              </div>
            ))}
          </section>

          <section className="revision-panel">
            <span className="eyebrow">Revision plan</span>
            <ol>{feedback.revisionPlan.map((step, index) => <li key={index}>{step}</li>)}</ol>
            {/* Shown here only when it was not already placed beside its question. */}
            {!exampleIsInline && (
              <div className="example-revision">
                <strong>Example of a stronger move</strong>
                <p>{feedback.exampleRevision}</p>
              </div>
            )}
            <p className="closing-note">{feedback.closing}</p>
          </section>
        </div>

        <aside className="evidence-rail">
          {bandSuppressionReason(run) && (
            <div className="rail-card">
              <span className="eyebrow">No band for this submission</span>
              <p>{bandSuppressionReason(run)} The feedback below is unaffected.</p>
            </div>
          )}
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
  const [scope, setScope] = useState<SubmissionScope>("full_exam");
  const [mode, setMode] = useState<SubmissionMode>("full_draft");
  const [questionRef, setQuestionRef] = useState("");
  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [run, setRun] = useState<FeedbackRun | null>(null);
  const selectedExam = useMemo(() => exams.find((exam) => exam.id === selectedId) ?? exams[0], [exams, selectedId]);
  const questionOptions = useMemo(() => listQuestionLabels(selectedExam.prompt), [selectedExam]);
  const wordCount = answer.trim() ? answer.trim().split(/\s+/).length : 0;
  // A question chosen on one exam rarely exists on another, so reset rather
  // than submit a stale label the new paper does not have.
  const chooseExam = (id: string) => {
    setSelectedId(id);
    setQuestionRef("");
    // An assignment poses a single question, so its scope picker is hidden. Reset
    // the scope too, or a "one question" choice made on a final would survive the
    // switch and be submitted against an item that has no questions to name.
    if (exams.find((exam) => exam.id === id)?.kind === "assignment") setScope("full_exam");
  };
  const needsQuestion = scope === "single_question" && !questionRef;
  const tooShort = answer.trim().length < 120;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId: selectedId,
          answer,
          studentLabel: "Anonymous practice",
          scope,
          mode,
          ...(scope === "single_question" ? { questionRef } : {}),
        }),
      });
      // The response may not be JSON: a hosting timeout returns a plain-text
      // error page, which would otherwise throw a cryptic JSON parse error.
      const raw = await response.text();
      let payload: { run?: FeedbackRun; error?: string } | null = null;
      try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
      if (!response.ok || !payload?.run) {
        if (payload?.error) throw new Error(payload.error);
        throw new Error("This hosted preview stopped the request before grading finished — a full run takes about 10–15 minutes, longer than the server allows. Your answer was not graded. Please let the course team know.");
      }
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
          <label className="field-label" htmlFor="exam">Which exam are you practicing?</label>
          <select id="exam" className="practice-select" value={selectedId} onChange={(event) => chooseExam(event.target.value)}>
            <optgroup label="Final exams">
              {exams.filter((exam) => exam.kind === "final").map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.year} final — {exam.questionCount} question{exam.questionCount === 1 ? "" : "s"}
                </option>
              ))}
            </optgroup>
            <optgroup label="Graded assignments">
              {exams.filter((exam) => exam.kind === "assignment").map((exam) => (
                <option key={exam.id} value={exam.id}>{exam.shortDescription}</option>
              ))}
            </optgroup>
          </select>
          <details className="exam-document">
            <summary><FileText size={15} /> Read the {selectedExam.kind === "assignment" ? "assignment" : `${selectedExam.year} exam`} <ChevronDown size={16} /></summary>
            <div className="markdown-document"><ReactMarkdown>{selectedExam.prompt}</ReactMarkdown></div>
          </details>
        </div>

        <div className="practice-row">
          {selectedExam.kind === "final" && (
          <div className="practice-field">
            <label className="field-label" htmlFor="scope">How much are you turning in?</label>
            <select
              id="scope"
              className="practice-select"
              value={scope}
              onChange={(event) => setScope(event.target.value as SubmissionScope)}
            >
              <option value="full_exam">The whole exam</option>
              <option value="single_question">One question</option>
            </select>
          </div>
          )}

          {selectedExam.kind === "final" && scope === "single_question" && (
            <div className="practice-field">
              <label className="field-label" htmlFor="question">Which question?</label>
              <select
                id="question"
                className="practice-select"
                value={questionRef}
                onChange={(event) => setQuestionRef(event.target.value)}
              >
                <option value="">Choose a question…</option>
                {questionOptions.map((label) => <option key={label} value={label}>{label}</option>)}
              </select>
            </div>
          )}

          <div className="practice-field">
            <label className="field-label" htmlFor="mode">What form is it in?</label>
            <select
              id="mode"
              className="practice-select"
              value={mode}
              onChange={(event) => setMode(event.target.value as SubmissionMode)}
            >
              <option value="full_draft">A written-out draft</option>
              <option value="bullet_points">Bullet points or an outline</option>
            </select>
          </div>
        </div>

        {mode === "bullet_points" && (
          <p className="mode-note">
            Outlines are graded on issue-spotting, structure, and whether the reasoning is
            there — not on prose. You will not be marked down for writing in fragments.
          </p>
        )}

        <div className="practice-field">
          <div className="answer-heading">
            <label className="field-label" htmlFor="answer">
              {scope === "single_question" && questionRef ? `Paste your answer to ${questionRef}` : "Paste your answer"}
            </label>
            <span className="word-count">{wordCount.toLocaleString()} words</span>
          </div>
          <textarea id="answer" className="answer-textarea" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={scope === "single_question"
            ? `Paste your answer to ${questionRef || "the question"} here…`
            : "Paste your full exam answer here…"} minLength={120} required />
        </div>

        {error && <div className="error-banner"><AlertTriangle size={18} /><span>{error}</span></div>}
        <div className="practice-submit">
          <button className="primary-button" type="submit" disabled={tooShort || needsQuestion}>Get feedback <ArrowRight size={18} /></button>
          <span className="submit-note">Takes about 10–15 minutes. Formative feedback and an estimated band — not an official grade.</span>
        </div>
      </form>
    </section>
  );
}

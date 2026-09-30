"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowRight, Check, ChevronDown, CircleCheck, Copy, FileText,
  LoaderCircle, Printer, RotateCcw, Sparkles,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

import { STUDENT_PROGRESS_STEPS } from "@/lib/feedback-progress";
import {
  getAssessmentOutcome,
  getFinalFeedback,
  isUnreviewedDraft,
} from "@/lib/outcomes";
import { formatFeedbackForCopy } from "@/lib/student-feedback-export";
import type { Exam, FeedbackRun, SubmissionMode, SubmissionScope } from "@/lib/types";

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

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

export function FeedbackResult({ run, onReset }: { run: FeedbackRun; onReset: () => void }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const outcome = getAssessmentOutcome(run);
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
  const copyableFeedback = feedback;
  const judge = run.judge;
  const improvementGroups = groupByQuestion(feedback.improvements).map((group) => ({
    ...group,
    items: [...group.items].sort((left, right) => PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]),
  }));
  // New runs name the exact card. Older assignment runs often named neither a
  // question nor a card; where there is only one group, the first high-priority
  // card is a safer home than the bottom of the whole report.
  const exampleGroup = improvementGroups.find((group) => group.heading === feedback.exampleRevisionRef)
    ?? (improvementGroups.length === 1 ? improvementGroups[0] : undefined);
  const requestedExampleIndex = feedback.exampleRevisionTarget
    ? exampleGroup?.items.findIndex((improvement) => improvement.label === feedback.exampleRevisionTarget)
    : 0;
  const examplePlacement = exampleGroup
    ? { heading: exampleGroup.heading, index: requestedExampleIndex !== undefined && requestedExampleIndex >= 0 ? requestedExampleIndex : 0 }
    : undefined;
  const exampleIsInline = Boolean(examplePlacement);
  const unreviewed = isUnreviewedDraft(run);
  async function copyFeedback() {
    try {
      await navigator.clipboard.writeText(formatFeedbackForCopy(copyableFeedback));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }
  const manualReviewMessage = "The automated quality checks disagreed about part of this response. Treat the feedback as provisional and confirm uncertain points against the course materials.";
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
        <div className={`quality-seal ${judge.approved ? "is-approved" : "is-revised"}`}>
          <span><strong>{unreviewed ? "Review advised" : "Feedback checked"}</strong></span>
          <small>Automated quality check</small>
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
                  {group.items.map((improvement, index) => {
                    const showExample = examplePlacement?.heading === group.heading
                      && examplePlacement.index === index;
                    return (
                      <div className="improvement-with-example" key={`${improvement.label}-${index}`}>
                        <article className="feedback-card improvement-card">
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
                        {showExample && (
                          <div className="example-revision inline-example">
                            <strong>Example of a stronger move</strong>
                            <p>{feedback.exampleRevision}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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

        <aside className="evidence-rail student-feedback-actions">
          <button className="secondary-button full-width" onClick={() => window.print()} type="button">
            <Printer size={16} /> Print or save as PDF
          </button>
          <button className="secondary-button full-width" onClick={copyFeedback} type="button">
            {copyState === "copied" ? <Check size={16} /> : <Copy size={16} />}
            {copyState === "copied" ? "Copied for Google Docs" : "Copy feedback"}
          </button>
          {copyState === "failed" && <p className="copy-feedback-status" role="alert">Copying was blocked by the browser. Select and copy the feedback from this page instead.</p>}
          <button className="secondary-button full-width" onClick={onReset} type="button">
            <RotateCcw size={16} /> Start another response
          </button>
          <p className="formative-note">This is AI-generated practice feedback, not an official assessment or legal advice. Confirm uncertain points against the course materials.</p>
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
      <div className="zero-result__content">
        <span className="eyebrow">Submission mismatch</span>
        <h2>This response does not answer the selected examination.</h2>
        <p>{gate?.rationale ?? outcome.rationale}</p>
        {gate?.controllingEvidence.length ? (
          <div className="zero-evidence">
            <strong>Controlling evidence</strong>
            <ul>{gate.controllingEvidence.map((evidence, index) => <li key={index}>{evidence}</li>)}</ul>
          </div>
        ) : null}
        {gate?.likelyOtherExam && <p className="likely-exam"><strong>Possible matching exam:</strong> {gate.likelyOtherExam}</p>}
        <p className="zero-policy">The feedback process stops when a response appears to address different questions. {gateStopped ? "No substantive feedback was generated." : "This legacy run continued before the intake check existed; disregard its substantive feedback."}</p>
        <button className="secondary-button" onClick={onReset} type="button"><RotateCcw size={16} /> Submit the correct response</button>
      </div>
    </section>
  );
}

export type ProgressDisplay = { label: string; detail: string; position: number };

export function WaitingView({ examLabel, progress, durable }: { examLabel: string; progress?: ProgressDisplay; durable: boolean }) {
  const currentPosition = progress?.position ?? 0;
  return (
    <section className="waiting-shell" aria-live="polite">
      <div className="waiting-head">
        <LoaderCircle className="spin" size={20} />
        <div>
          <strong>{progress?.label ?? `Building feedback for your ${examLabel} practice answer…`}</strong>
          <span>{progress?.detail ?? "Your response has been received and is waiting to begin."}</span>
        </div>
      </div>
      <p className="waiting-note">
        This usually takes about 10–15 minutes. {durable
          ? "You can close this tab and return to My feedback later."
          : "Keep this tab open so the result can appear when it is ready."}
      </p>
      <div className="feedback-pipeline">
        <div className="feedback-pipeline__heading">
          <strong>How your feedback is being built</strong>
          <span>Each completed stage is saved before the next one begins.</span>
        </div>
        <ol aria-label="Feedback generation stages">
          {STUDENT_PROGRESS_STEPS.map((step) => {
            const state = step.position < currentPosition
              ? "complete"
              : step.position === currentPosition
                ? "active"
                : "upcoming";
            return (
              <li
                className={`feedback-pipeline__step is-${state}`}
                key={step.position}
                aria-current={state === "active" ? "step" : undefined}
              >
                <span className="feedback-pipeline__marker" aria-hidden="true">
                  {state === "complete"
                    ? <CircleCheck size={18} />
                    : state === "active"
                      ? <LoaderCircle className="spin" size={18} />
                      : step.position}
                </span>
                <div>
                  <strong>{step.label}</strong>
                  <p>{step.detail}</p>
                  <span className="sr-only">
                    {state === "complete" ? "Completed" : state === "active" ? "In progress" : "Not started"}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

type StudentContext = {
  pseudonym: string;
  attemptsRemaining: number;
  maxAttempts: number;
};

export function PracticeWorkspace({
  exams,
  studentContext,
  submissionEndpoint = "/api/feedback",
}: {
  exams: Exam[];
  studentContext?: StudentContext;
  submissionEndpoint?: string;
}) {
  const [selectedId, setSelectedId] = useState(exams[0].id);
  const [scope, setScope] = useState<SubmissionScope>("full_exam");
  const [mode, setMode] = useState<SubmissionMode>("full_draft");
  const [questionRef, setQuestionRef] = useState("");
  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [run, setRun] = useState<FeedbackRun | null>(null);
  const [progress, setProgress] = useState<ProgressDisplay>();
  const submittingRef = useRef(false);
  const requestKeyRef = useRef<string | null>(null);
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
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError("");
    setIsSubmitting(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    let responseReceived = false;
    try {
      const requestKey = requestKeyRef.current ?? crypto.randomUUID();
      requestKeyRef.current = requestKey;
      const response = await fetch(submissionEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": requestKey,
        },
        body: JSON.stringify({
          examId: selectedId,
          answer,
          // The authenticated API will derive this from the server session.
          // It remains a prop only for the synthetic portal and legacy route.
          studentLabel: studentContext?.pseudonym ?? "Anonymous practice",
          scope,
          mode,
          ...(scope === "single_question" ? { questionRef } : {}),
        }),
      });
      responseReceived = true;
      // The response may not be JSON: a hosting timeout returns a plain-text
      // error page, which would otherwise throw a cryptic JSON parse error.
      const raw = await response.text();
      let payload: { run?: FeedbackRun; error?: string; submissionId?: string } | null = null;
      try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
      if (response.ok && payload?.submissionId && !payload.run) {
        requestKeyRef.current = null;
        const completed = await waitForSubmission(payload.submissionId);
        setRun(completed);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (!response.ok || !payload?.run) {
        if (payload?.error) throw new Error(payload.error);
        throw new Error("The server returned an unexpected response. Your submission may still have queued; check My feedback before trying again.");
      }
      requestKeyRef.current = null;
      setRun(payload.run);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      // If the server answered, a new click is a new request. If the network
      // failed before any answer arrived, retain the key so a retry cannot
      // create a second reservation if the first request reached the server.
      if (responseReceived) requestKeyRef.current = null;
      setError(caught instanceof Error ? caught.message : "Feedback failed.");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function waitForSubmission(submissionId: string): Promise<FeedbackRun> {
    setProgress({ label: "Waiting to begin", detail: "Your response is safely queued.", position: 0 });
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 10_000));
      const response = await fetch(`/api/student/submissions/${encodeURIComponent(submissionId)}`, {
        cache: "no-store",
      });
      const raw = await response.text();
      let payload: {
        status?: string;
        progress?: ProgressDisplay;
        run?: FeedbackRun;
        error?: string;
        errorReference?: string;
      } | null = null;
      try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
      if (response.status === 503) continue;
      if (response.status === 401) {
        throw new Error("Your sign-in expired while feedback was processing. Sign in again and open My feedback; your submission was not lost.");
      }
      if (!response.ok || !payload) throw new Error(payload?.error ?? "Could not check feedback progress.");
      if (payload.progress) setProgress(payload.progress);
      if (payload.status === "completed" && payload.run) return payload.run;
      if (payload.status === "failed" || payload.status === "refunded") {
        throw new Error(`The feedback run could not complete, so your attempt was refunded.${payload.errorReference ? ` Error reference: ${payload.errorReference}.` : ""}`);
      }
    }
    throw new Error("Feedback is still processing. You can return to My feedback later without losing your submission.");
  }

  if (run) return <FeedbackResult run={run} onReset={() => { setRun(null); setAnswer(""); requestKeyRef.current = null; }} />;
  if (isSubmitting) return <WaitingView examLabel={String(selectedExam.year)} progress={progress} durable={submissionEndpoint.startsWith("/api/student/")} />;

  return (
    <section className="practice-shell" id="practice">
      {studentContext && (
        <div className="practice-attempt-line">
          <strong>{studentContext.attemptsRemaining} of {studentContext.maxAttempts} attempts remaining</strong>
          <span>A system failure will not use an attempt.</span>
        </div>
      )}
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
              <option value="bullet_points">A bullet-point version</option>
            </select>
          </div>
        </div>

        {mode === "bullet_points" && (
          <p className="mode-note">
            Feedback on bullet-point versions focuses on issue-spotting, structure, and whether the
            reasoning is there — not on prose. Writing in fragments is fine.
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
          <button className="primary-button" type="submit" disabled={tooShort || needsQuestion || studentContext?.attemptsRemaining === 0}>Get feedback <ArrowRight size={18} /></button>
          <span className="submit-note">Takes about 10–15 minutes. You can close this page and return when your feedback is ready.</span>
        </div>
      </form>
    </section>
  );
}

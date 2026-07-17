"use client";

import { useState } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, ChevronDown, MessageSquareText, ShieldCheck } from "lucide-react";

import { AUDIT_EXAMPLES, type AuditExample } from "@/lib/audit-content";

function bandLabel(band: string, lean: AuditExample["lean"]): string {
  return `${band}${lean === "high" ? "+" : lean === "low" ? "−" : ""}`;
}

function SourceBadges({ sources }: { sources: string[] }) {
  if (!sources.length) return null;
  return (
    <div className="audit-src">
      <BookOpen size={12} />
      {sources.map((title) => <span key={title}>{title}</span>)}
    </div>
  );
}

function StudentFeedback({ example }: { example: AuditExample }) {
  const fb = example.feedback;
  return (
    <details className="audit-fb">
      <summary>
        <span className="audit-fb__label"><MessageSquareText size={17} /> See the full feedback this student would receive</span>
        <ChevronDown size={20} />
      </summary>
      <div className="audit-fb__body">
        <h4>{fb.headline}</h4>
        <p className="audit-fb__overview">{fb.overview}</p>

        <div className="audit-subhead"><CheckCircle2 size={15} /> What is working</div>
        <ul className="audit-list">
          {fb.strengths.map((s, i) => (
            <li key={i}>
              <strong>{s.label}</strong>
              <p>{s.detail}</p>
              {s.answerExcerpt && <blockquote>“{s.answerExcerpt}”</blockquote>}
              <SourceBadges sources={s.sources} />
            </li>
          ))}
        </ul>

        <div className="audit-subhead"><AlertTriangle size={15} /> Highest-value improvements</div>
        <ul className="audit-list">
          {fb.improvements.map((imp, i) => (
            <li key={i}>
              <strong><span className={`audit-priority audit-priority--${imp.priority}`}>{imp.priority}</span> {imp.label}</strong>
              <p><em>What happened:</em> {imp.whatHappened}</p>
              <p><em>Why it matters:</em> {imp.whyItMatters}</p>
              <p><em>Try this next:</em> {imp.howToImprove}</p>
              <SourceBadges sources={imp.sources} />
            </li>
          ))}
        </ul>

        <div className="audit-subhead">Revision plan</div>
        <ol className="audit-plan">
          {fb.revisionPlan.map((step, i) => <li key={i}>{step}</li>)}
        </ol>

        <div className="audit-subhead">Example of a stronger move</div>
        <p className="audit-example-revision">{fb.exampleRevision}</p>
        <p className="audit-closing">{fb.closing}</p>
      </div>
    </details>
  );
}

function ExamplePanel({ example }: { example: AuditExample }) {
  const accurate = example.key === "accurate";
  return (
    <div className="audit-example">
      <div className={`audit-verdict ${accurate ? "is-accurate" : "is-wrong"}`}>
        {accurate ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
        <div>
          <strong>{example.examTitle}</strong>
          <p>{example.editorial}</p>
        </div>
      </div>

      <div className="audit-band-row">
        <div><span>System band</span><strong>{bandLabel(example.predicted, example.lean)}</strong></div>
        <div><span>Instructor band</span><strong>{example.actual}</strong></div>
        <div><span>Band distance</span><strong>{example.distance === 0 ? "Exact" : `${example.distance} band${example.distance === 1 ? "" : "s"}`}</strong></div>
        <div><span>Feedback QA</span><strong>{example.qualityScore}/100</strong></div>
      </div>

      <div className="audit-block">
        <span className="eyebrow">How the band was reasoned</span>
        <p className="audit-rationale">{example.bandRationale}</p>
        <div className="audit-boundary">
          <div><strong>Why not one band higher</strong><p>{example.whyNotHigher}</p></div>
          <div><strong>Why not one band lower</strong><p>{example.whyNotLower}</p></div>
        </div>
      </div>

      <div className="audit-block">
        <span className="eyebrow">The student&rsquo;s feedback</span>
        <p className="audit-note">This is the complete report the student receives — expand it to read exactly what would be shown.</p>
        <StudentFeedback example={example} />
      </div>

      <div className="audit-block">
        <div className="audit-subhead"><ShieldCheck size={15} /> Skeptical judge audit (step 6)</div>
        <p className="audit-note">
          {accurate
            ? "The final judge verified every claim, quotation, and citation against the answer and sources and required no material correction."
            : "The final judge caught and corrected a material error in the coaching draft before publication. This is the safety net working:"}
        </p>
        <ul className="audit-findings">
          {example.judgeFindings.map((f, i) => (
            <li key={i} className={`audit-finding audit-finding--${f.severity}`}>
              <span className="audit-severity">{f.severity}</span>
              <p>{f.problem}</p>
              {f.correction !== "None required." && <p className="audit-correction"><strong>Correction applied:</strong> {f.correction}</p>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function AuditExamples() {
  const [active, setActive] = useState<AuditExample["key"]>("accurate");
  const example = AUDIT_EXAMPLES.find((ex) => ex.key === active) ?? AUDIT_EXAMPLES[0];
  return (
    <div className="audit-examples">
      <div className="audit-tabs" role="tablist">
        {AUDIT_EXAMPLES.map((ex) => (
          <button
            key={ex.key}
            role="tab"
            aria-selected={active === ex.key}
            className={`audit-tab ${active === ex.key ? "is-active" : ""} audit-tab--${ex.key}`}
            onClick={() => setActive(ex.key)}
          >
            <strong>{ex.tabLabel}</strong>
            <small>{ex.tabHint}</small>
          </button>
        ))}
      </div>
      <ExamplePanel example={example} />
    </div>
  );
}

import { ArrowDown, ChevronDown, Database, FileCode2, Layers, Lock, ShieldCheck, SlidersHorizontal } from "lucide-react";

import { AuditExamples } from "@/components/audit-examples";
import { SiteHeader } from "@/components/site-header";
import { AUDIT_PROMPT_VERSION, CHAIN_STAGES, CHANGE_SURFACES } from "@/lib/audit-content";

export const metadata = {
  title: "Review dossier — CivPro Practice",
};

const LEVER_ICONS = [Layers, SlidersHorizontal];

export default function AuditPage() {
  return (
    <>
      <SiteHeader />
      <main className="audit">
        <section className="audit-hero">
          <div className="audit-hero__inner">
            <span className="audit-hero__label">Review dossier · {AUDIT_PROMPT_VERSION}</span>
            <h1>How the feedback is made — and where you can change it</h1>
            <p>
              This tool reads a law student&rsquo;s practice Civil Procedure exam and returns coaching plus an
              estimated grade band. It is a study aid, never an official grade. What follows is the whole
              machine, in plain view: the steps that produce the feedback, two real cases — one it got right and
              its single worst miss — and the two levers you can direct.
            </p>
            <div className="audit-hero__stats">
              <div><strong>8</strong><span>instructor-graded answers in the calibration set</span></div>
              <div><strong>1</strong><span>Claude model runs the whole chain</span></div>
              <div><strong>LP·P·H·DS</strong><span>the four grade bands, weakest to strongest</span></div>
            </div>
            <div className="audit-hero__note">
              <Lock size={15} />
              <span>The system never sees an answer&rsquo;s real grade while grading it. Estimates are formative.</span>
            </div>
          </div>
        </section>

        <div className="audit-body">
          <section className="audit-section">
            <div className="audit-section__head">
              <span className="eyebrow">The chain</span>
              <h2>Eight steps, in order</h2>
              <p>
                Every submission flows top to bottom. The first two steps are a gate — an answer that clearly
                belongs to a different exam is stopped before any grading. Everything below runs on the Claude
                model, each step handed only what it needs.
              </p>
            </div>

            <ol className="audit-flow">
              {CHAIN_STAGES.map((stage) => {
                const noModel = stage.engine.includes("no model");
                return (
                  <li key={stage.step} className={`audit-node ${stage.gate ? "is-gate" : ""} ${noModel ? "is-retrieval" : ""}`}>
                    <div className="audit-node__rail">
                      <span className="audit-node__dot">{noModel ? <Database size={16} /> : stage.step}</span>
                    </div>
                    <div className="audit-node__card">
                      <div className="audit-node__top">
                        <strong>{stage.name}</strong>
                        <span className="audit-node__engine">{stage.engine}</span>
                      </div>
                      <p>{stage.what}</p>
                      <div className="audit-node__meta">
                        {stage.prompt && <code>{stage.prompt}</code>}
                        {stage.gate && <span className="audit-node__gate"><ShieldCheck size={13} /> Gate · can stop the run</span>}
                      </div>
                      {stage.promptText && (
                        <details className="audit-prompt">
                          <summary>
                            <span><FileCode2 size={15} /> View the exact instruction this step is given</span>
                            <ChevronDown size={18} />
                          </summary>
                          <pre>{stage.promptText}</pre>
                        </details>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="audit-flow-end"><ArrowDown size={16} /> Feedback and estimated band</div>
          </section>

          <section className="audit-section">
            <div className="audit-section__head">
              <span className="eyebrow">Measured against reality</span>
              <h2>The feedback at its best and its worst</h2>
              <p>
                Both cases below are verbatim system output, drawn from the set of eight instructor-graded
                answers. Switch tabs to compare a band the system nailed against its largest miss — and see how
                the final judge caught a real error before it reached the student.
              </p>
            </div>
            <AuditExamples />
          </section>

          <section className="audit-section audit-section--last">
            <div className="audit-section__head">
              <span className="eyebrow">Where to make changes</span>
              <h2>Two levers you can direct</h2>
              <p>
                Behavior is governed by two separable things: the wiring of the steps, and what each step is told
                to do and given to read. Point to either — they live in different files.
              </p>
            </div>
            <div className="audit-levers">
              {CHANGE_SURFACES.map((surface, index) => {
                const Icon = LEVER_ICONS[index] ?? FileCode2;
                return (
                  <article key={surface.title} className="audit-lever">
                    <div className="audit-lever__head">
                      <span className="audit-lever__icon"><Icon size={20} /></span>
                      <div>
                        <h3>{surface.title}</h3>
                        <code>{surface.path}</code>
                      </div>
                    </div>
                    <p>{surface.blurb}</p>
                    <ul>
                      {surface.items.map((item) => (
                        <li key={item.name}><strong>{item.name}.</strong> {item.detail}</li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

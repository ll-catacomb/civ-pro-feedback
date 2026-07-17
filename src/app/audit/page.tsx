import { ArrowDown, ChevronDown, Database, FileCode2, Layers, Lock, ShieldCheck, SlidersHorizontal } from "lucide-react";

import { AuditExamples } from "@/components/audit-examples";
import { SiteHeader } from "@/components/site-header";
import { AUDIT_PROMPT_VERSION, CHAIN_STAGES, CHANGE_SURFACES } from "@/lib/audit-content";
import { computeRunStats, type RunStats } from "@/lib/run-stats";
import runStatsSnapshot from "@/lib/run-stats-snapshot.json";
import { listRuns } from "@/lib/store";

export const metadata = {
  title: "Review dossier — CivPro Practice",
};

export const dynamic = "force-dynamic";

const LEVER_ICONS = [Layers, SlidersHorizontal];

export default async function AuditPage() {
  // Live run log locally; committed snapshot when deployed (the .data run store
  // is git-ignored because it holds student answers, so it never ships).
  const liveRuns = await listRuns();
  const stats: RunStats = liveRuns.length ? computeRunStats(liveRuns) : (runStatsSnapshot as RunStats);
  const deviations = [
    { label: "Exact band", count: stats.exact, tone: "good" as const },
    { label: "Off by one band", count: stats.adjacent, tone: "mid" as const },
    { label: "Off by two bands", count: stats.twoPlus, tone: "bad" as const },
  ];
  const maxDev = Math.max(1, ...deviations.map((d) => d.count));
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

          <section className="audit-section">
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

          <section className="audit-section audit-section--last">
            <div className="audit-section__head">
              <span className="eyebrow">Track record</span>
              <h2>Every iteration, every run</h2>
              <p>
                The grade estimate has been rebuilt {stats.versions} times as distinct prompt-chain versions.
                Each version was re-scored blind against the same eight instructor-graded answers. Below is the
                complete record — {stats.totalRuns} logged runs{stats.firstAt ? ` between ${stats.firstAt} and ${stats.lastAt}` : ""} — with no
                cherry-picking.
              </p>
            </div>

            <div className="audit-statgrid">
              <div className="audit-stat"><strong>{stats.versions}</strong><span>prompt-chain versions tried</span></div>
              <div className="audit-stat"><strong>{stats.totalRuns}</strong><span>grading runs logged</span></div>
              <div className="audit-stat"><strong>{stats.exactPct}%</strong><span>landed the exact band</span></div>
              <div className="audit-stat"><strong>{stats.withinOnePct}%</strong><span>within one band</span></div>
              <div className="audit-stat"><strong>{stats.meanDistance ?? "—"}</strong><span>avg. bands off</span></div>
            </div>

            <div className="audit-devs">
              <span className="eyebrow">Deviation across all {stats.gradedRuns} graded runs</span>
              <div className="audit-dev-bars">
                {deviations.map((d) => (
                  <div key={d.label} className="audit-dev">
                    <div className="audit-dev-track">
                      <div className={`audit-dev-fill audit-dev-fill--${d.tone}`} style={{ width: `${(d.count / maxDev) * 100}%` }} />
                    </div>
                    <div className="audit-dev-meta">
                      <span>{d.label}</span>
                      <strong>{d.count} · {stats.gradedRuns ? Math.round((d.count / stats.gradedRuns) * 100) : 0}%</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="audit-versions">
              <div className="audit-ver-row audit-ver-head">
                <span>Prompt version</span><span>Runs</span><span>Exact</span><span>Avg. bands off</span><span>First run</span>
              </div>
              {stats.perVersion.map((v) => (
                <div key={v.version} className={`audit-ver-row ${v.version === AUDIT_PROMPT_VERSION ? "is-current" : ""}`}>
                  <span className="audit-ver-name">{v.version.replace("civpro-feedback-", "")}{v.version === AUDIT_PROMPT_VERSION && <em>frozen</em>}</span>
                  <span>{v.graded || v.runs}</span>
                  <span>{v.graded ? `${v.exact}/${v.graded}` : "—"}</span>
                  <span>{v.meanDistance ?? "—"}</span>
                  <span className="audit-ver-date">{v.firstAt.slice(0, 10)}</span>
                </div>
              ))}
            </div>
            <p className="audit-fineprint">
              Distance is whole-band (predicted vs. instructor band); &ldquo;within one band&rdquo; counts exact and
              adjacent calls. Runs from the current frozen version{stats.perVersion.some((v) => v.version === AUDIT_PROMPT_VERSION) ? "" : " are pending — its prompt tightened the shoulder-flag rule after the last scored batch"}.
            </p>
          </section>
        </div>
      </main>
    </>
  );
}

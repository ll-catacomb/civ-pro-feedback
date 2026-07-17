import { ArrowDown, BookOpenCheck, Braces, ShieldCheck } from "lucide-react";

import { PracticeWorkspace } from "@/components/practice-workspace";
import { SiteHeader } from "@/components/site-header";
import { getExams } from "@/lib/exams";

export default function PracticePage() {
  const exams = getExams();
  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero">
          <div className="hero__content">
            <span className="hero__label">Civil Procedure · Deliberate practice</span>
            <h1>Practice the analysis.<br /><em>See the proof.</em></h1>
            <p>Submit a full practice exam response and receive precise, course-grounded feedback that has been independently checked before you see it.</p>
            <a href="#practice" className="hero__cta">Choose an exam <ArrowDown size={18} /></a>
          </div>
          <div className="hero__proof"><span className="proof-number">16</span><div><strong>model checks in a configured dual run</strong><p>Two-pass exam fit → parallel OpenAI + Claude chains → two cross-model judges → final decision</p></div></div>
        </section>
        <section className="method-strip" aria-label="Feedback method">
          <div><BookOpenCheck size={21} /><span><strong>Course-specific</strong>451 cleaned source documents</span></div>
          <div><Braces size={21} /><span><strong>Structured</strong>Every stage follows a typed schema</span></div>
          <div><ShieldCheck size={21} /><span><strong>Judge-checked</strong>Claims re-verified against evidence</span></div>
        </section>
        <PracticeWorkspace exams={exams} />
      </main>
      <footer><span>CivPro Practice</span><p>Designed for formative learning and careful instructor QA.</p></footer>
    </>
  );
}

import { PracticeWorkspace } from "@/components/practice-workspace";
import { SiteHeader } from "@/components/site-header";
import { getExams } from "@/lib/exams";

export default function PracticePage() {
  const exams = getExams();
  return (
    <>
      <SiteHeader />
      <main className="practice-page">
        <header className="practice-intro">
          <h1>Practice feedback</h1>
          <p>Pick one of the past Civil Procedure finals, paste your answer, and get course-grounded feedback with an estimated grade band. Formative only — it is not an official grade.</p>
        </header>
        <PracticeWorkspace exams={exams} />
      </main>
    </>
  );
}

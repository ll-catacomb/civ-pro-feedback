import { PracticeWorkspace } from "@/components/practice-workspace";
import { SiteHeader } from "@/components/site-header";
import { legacyPracticeEnabled } from "@/lib/access-control";
import { getExams } from "@/lib/exams";
import { redirect } from "next/navigation";

export default function PracticePage() {
  if (!legacyPracticeEnabled()) redirect("/student/practice");
  const exams = getExams();
  return (
    <>
      <SiteHeader />
      <main className="practice-page">
        <header className="practice-intro">
          <h1>Practice feedback</h1>
          <p>Pick a past Civil Procedure assessment, paste your response, and receive course-grounded feedback on what is working and what to revise.</p>
        </header>
        <PracticeWorkspace exams={exams} />
      </main>
    </>
  );
}

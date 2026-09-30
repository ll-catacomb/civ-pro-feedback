import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PracticeWorkspace } from "@/components/practice-workspace";
import { StudentHeader } from "@/components/student-header";
import { getExams } from "@/lib/exams";
import { getSheetsPortalModel, getSyntheticPortalModel, syntheticPortalEnabled } from "@/lib/student-portal";

export const dynamic = "force-dynamic";

export default async function StudentPractice({
  searchParams,
}: {
  searchParams: Promise<{ student?: string | string[] }>;
}) {
  const query = await searchParams;
  const requested = Array.isArray(query.student) ? query.student[0] : query.student;
  const enabled = syntheticPortalEnabled();
  const session = enabled ? null : await auth();
  if (!enabled && (!session?.user.studentId || !session.user.pseudonym)) {
    redirect("/student/sign-in");
  }
  const model = enabled
    ? getSyntheticPortalModel(Number(requested ?? 1))
    : await getSheetsPortalModel(session!.user.studentId, session!.user.pseudonym);
  return (
    <div className="student-portal student-practice">
      <StudentHeader
        pseudonym={model.student.pseudonym}
        demoIndex={enabled ? model.demoIndex : undefined}
        authenticated={!enabled}
      />
      <main>
        <header className="student-practice-heading">
          <p>New practice response</p>
          <h1>Request feedback</h1>
          <span>Choose the material you practiced and submit either a written draft or a bullet-point version.</span>
        </header>
        <PracticeWorkspace
          exams={getExams()}
          submissionEndpoint={enabled ? "/api/feedback" : "/api/student/feedback"}
          studentContext={{
            pseudonym: model.student.pseudonym,
            attemptsRemaining: model.remainingAttempts,
            maxAttempts: model.student.maxAttempts,
          }}
        />
      </main>
    </div>
  );
}

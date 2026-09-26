import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { StudentHeader } from "@/components/student-header";
import { getSheetsPortalModel, getSyntheticPortalModel, syntheticPortalEnabled } from "@/lib/student-portal";

export const dynamic = "force-dynamic";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" })
    .format(new Date(value));
}

export default async function StudentHome({
  searchParams,
}: {
  searchParams: Promise<{ student?: string | string[] }>;
}) {
  const query = await searchParams;
  const requested = Array.isArray(query.student) ? query.student[0] : query.student;
  const synthetic = syntheticPortalEnabled();
  const session = synthetic ? null : await auth();
  if (!synthetic && (!session?.user.googleSubject || !session.user.pseudonym)) {
    redirect("/student/sign-in");
  }
  const model = synthetic
    ? getSyntheticPortalModel(Number(requested ?? 1))
    : await getSheetsPortalModel(session!.user.googleSubject, session!.user.pseudonym);
  const used = model.student.maxAttempts - model.remainingAttempts;
  const querySuffix = model.synthetic ? `?student=${model.demoIndex}` : "";
  return (
    <div className="student-portal">
      <StudentHeader
        pseudonym={model.student.pseudonym}
        demoIndex={model.synthetic ? model.demoIndex : undefined}
        authenticated={!model.synthetic}
      />
      <main className="student-page">
        {model.synthetic && (
          <div className="student-demo-notice">
            <span>Synthetic roster</span>
            <form method="get">
              <label htmlFor="student-demo-account">Preview account</label>
              <select id="student-demo-account" name="student" defaultValue={model.demoIndex}>
                {Array.from({ length: 30 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>Student {String(index + 1).padStart(3, "0")}</option>
                ))}
              </select>
              <button type="submit">View</button>
            </form>
          </div>
        )}

        <header className="student-page-heading">
          <p>Course identifier</p>
          <h1>{model.student.pseudonym}</h1>
          <p>Your identifier appears on feedback records in place of your name.</p>
        </header>

        <section className="attempt-summary" aria-labelledby="attempt-heading">
          <div>
            <h2 id="attempt-heading">Practice attempts</h2>
            <p>{model.remainingAttempts} of {model.student.maxAttempts} remaining</p>
          </div>
          <div className="attempt-marks" aria-label={`${used} of ${model.student.maxAttempts} attempts used`}>
            {Array.from({ length: model.student.maxAttempts }, (_, index) => (
              <span className={index < used ? "is-used" : ""} key={index} />
            ))}
          </div>
          {model.remainingAttempts > 0 ? (
            <Link className="student-primary-link" href={`/student/practice${querySuffix}`}>Start a practice response</Link>
          ) : (
            <p className="attempt-limit-note">All five feedback attempts have been used.</p>
          )}
        </section>

        <section className="student-history" aria-labelledby="history-heading">
          <div className="student-section-heading">
            <h2 id="history-heading">Previous submissions</h2>
            <p>Completed feedback remains available here.</p>
          </div>
          {model.history.length ? (
            <div className="student-history-list">
              {model.history.map((item) => (
                <article key={item.id}>
                  {model.synthetic ? (
                    <StudentHistoryContents item={item} />
                  ) : (
                    <Link className="student-history-link" href={`/student/submissions/${item.id}`}>
                      <StudentHistoryContents item={item} />
                    </Link>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="student-empty-state">You have not submitted a practice response yet.</p>
          )}
        </section>
      </main>
    </div>
  );
}

function StudentHistoryContents({ item }: { item: import("@/lib/student-portal").StudentHistoryItem }) {
  return (
    <>
      <div>
        <h3>{item.examLabel}</h3>
        <p>{item.formLabel} · {formatDate(item.submittedAt)}</p>
      </div>
      <div className="student-history-status">
        {item.band && <span>Estimated band: {item.band}</span>}
        <strong>{item.status === "complete" ? "Feedback ready" : item.status === "in_progress" ? "In progress" : "Needs attention"}</strong>
      </div>
    </>
  );
}

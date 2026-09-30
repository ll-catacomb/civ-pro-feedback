import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";
import { StudentHeader } from "@/components/student-header";
import { attemptGateConfigured } from "@/lib/attempt-gate";
import { studentEmailLookupConfigured } from "@/lib/student-email-lookup";

export const dynamic = "force-dynamic";

export default async function StudentSignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const query = await searchParams;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;
  const googleFailed = Boolean(error);
  const session = await auth();
  if (session?.user?.studentId) redirect("/student");
  const configured = attemptGateConfigured()
    && studentEmailLookupConfigured()
    && Boolean(process.env.AUTH_SECRET)
    && Boolean(process.env.AUTH_GOOGLE_ID)
    && Boolean(process.env.AUTH_GOOGLE_SECRET);
  return (
    <div className="student-portal">
      <StudentHeader />
      <main className="student-sign-in">
        <p>Course access</p>
        <h1>Sign in to practice feedback</h1>
        <span>
          Use the Harvard Google account listed on the course roster. No separate access code is needed.
        </span>
        {googleFailed && (
          <div className="student-sign-in__error" role="alert">
            That Google account was not accepted. Use the Harvard address listed on the course roster, or ask course staff to check the roster entry.
          </div>
        )}
        {!configured ? (
          <div className="student-sign-in__pending">Course sign-in is not open yet.</div>
        ) : (
          <form action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/student" });
          }}>
            <button type="submit">Continue with Harvard Google</button>
          </form>
        )}
        <small id="student-code-help">
          The app uses a keyed one-way lookup value and does not store your email address in the course database or session.
        </small>
      </main>
    </div>
  );
}

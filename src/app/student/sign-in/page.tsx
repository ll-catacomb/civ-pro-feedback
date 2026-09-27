import { redirect } from "next/navigation";
import { AuthError } from "next-auth";

import { auth, signIn } from "@/auth";
import { StudentHeader } from "@/components/student-header";
import { attemptGateConfigured } from "@/lib/attempt-gate";

export default async function StudentSignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const query = await searchParams;
  const signInFailed = Boolean(Array.isArray(query.error) ? query.error[0] : query.error);
  const session = await auth();
  if (session?.user?.studentId) redirect("/student");
  const configured = attemptGateConfigured() && Boolean(process.env.AUTH_SECRET);
  return (
    <div className="student-portal">
      <StudentHeader />
      <main className="student-sign-in">
        <p>Course access</p>
        <h1>Sign in to practice feedback</h1>
        <span>Enter the private access code issued to you for this course.</span>
        {signInFailed && (
          <div className="student-sign-in__error" role="alert">
            That access code was not accepted. Check each character and try again.
          </div>
        )}
        {configured ? (
          <form action={async (formData) => {
            "use server";
            try {
              await signIn("student-code", {
                code: formData.get("code"),
                redirectTo: "/student",
              });
            } catch (error) {
              if (error instanceof AuthError) redirect("/student/sign-in?error=invalid-code");
              throw error;
            }
          }}>
            <label htmlFor="student-access-code">Course access code</label>
            <input
              id="student-access-code"
              name="code"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="one-time-code"
              placeholder="CIVP-XXXX-XXXX-XXXX"
              aria-describedby="student-code-help"
              required
            />
            <button type="submit">Continue</button>
          </form>
        ) : (
          <div className="student-sign-in__pending">Course sign-in is not open yet.</div>
        )}
        <small id="student-code-help">Your access code is private. The app stores only a one-way hash of it, and no student email address.</small>
      </main>
    </div>
  );
}

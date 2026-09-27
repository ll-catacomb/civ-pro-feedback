import { redirect } from "next/navigation";
import { AuthError } from "next-auth";

import { auth, signIn } from "@/auth";
import { StudentHeader } from "@/components/student-header";
import { attemptGateConfigured } from "@/lib/attempt-gate";
import { createGoogleIdentityProof } from "@/lib/google-identity-proof";

export default async function StudentSignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const query = await searchParams;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;
  const codeFailed = error === "invalid-code";
  const googleFailed = Boolean(error && !codeFailed);
  const session = await auth();
  if (session?.user?.studentId) redirect("/student");
  const googleVerified = Boolean(session?.user?.googleSubject);
  const configured = attemptGateConfigured()
    && Boolean(process.env.AUTH_SECRET)
    && Boolean(process.env.AUTH_GOOGLE_ID)
    && Boolean(process.env.AUTH_GOOGLE_SECRET);
  const identityProof = googleVerified && process.env.AUTH_SECRET
    ? createGoogleIdentityProof(session!.user.googleSubject, process.env.AUTH_SECRET)
    : "";
  return (
    <div className="student-portal">
      <StudentHeader />
      <main className="student-sign-in">
        <p>Course access</p>
        <h1>Sign in to practice feedback</h1>
        <span>
          {googleVerified
            ? "Google sign-in confirmed. Now enter the private access code issued to you for this course."
            : "First verify your Harvard Google account. You will enter your private course code next."}
        </span>
        {codeFailed && (
          <div className="student-sign-in__error" role="alert">
            That access code was not accepted. Check each character and try again.
          </div>
        )}
        {googleFailed && (
          <div className="student-sign-in__error" role="alert">
            Google sign-in was not accepted. Use an account from the course&rsquo;s Harvard Google Workspace.
          </div>
        )}
        {!configured ? (
          <div className="student-sign-in__pending">Course sign-in is not open yet.</div>
        ) : !googleVerified ? (
          <form action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/student/sign-in" });
          }}>
            <button type="submit">Continue with Harvard Google</button>
          </form>
        ) : (
          <form action={async (formData) => {
            "use server";
            try {
              await signIn("student-code", {
                code: formData.get("code"),
                googleIdentityProof: formData.get("googleIdentityProof"),
                redirectTo: "/student",
              });
            } catch (error) {
              if (error instanceof AuthError) redirect("/student/sign-in?error=invalid-code");
              throw error;
            }
          }}>
            <label htmlFor="student-access-code">Course access code</label>
            <input name="googleIdentityProof" type="hidden" value={identityProof} />
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
        )}
        <small id="student-code-help">
          Your access code is private. The app stores only a one-way hash of it, and no student email address.
        </small>
      </main>
    </div>
  );
}

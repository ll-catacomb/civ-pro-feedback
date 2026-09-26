import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";
import { StudentHeader } from "@/components/student-header";
import { attemptGateConfigured } from "@/lib/attempt-gate";

export default async function StudentSignIn() {
  const session = await auth();
  if (session?.user?.googleSubject) redirect("/student");
  const configured = attemptGateConfigured()
    && Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET && process.env.AUTH_SECRET);
  return (
    <div className="student-portal">
      <StudentHeader />
      <main className="student-sign-in">
        <p>Course access</p>
        <h1>Sign in to practice feedback</h1>
        <span>Use the Google account associated with your course enrollment.</span>
        {configured ? (
          <form action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/student" });
          }}>
            <button type="submit">Continue with Google</button>
          </form>
        ) : (
          <div className="student-sign-in__pending">Course sign-in is not open yet.</div>
        )}
        <small>Your course identifier, rather than your email address, appears with your feedback records.</small>
      </main>
    </div>
  );
}

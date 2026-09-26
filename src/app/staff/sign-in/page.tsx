import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";

export default async function StaffSignIn() {
  const session = await auth();
  if (session?.user.role === "staff") redirect("/");

  return (
    <main className="staff-sign-in">
      <p>Course team access</p>
      <h1>Sign in to the quality lab</h1>
      <span>Use an institutional Google account included in the staff allowlist.</span>
      <form action={async () => {
        "use server";
        await signIn("google", { redirectTo: "/" });
      }}>
        <button type="submit">Continue with Google</button>
      </form>
    </main>
  );
}

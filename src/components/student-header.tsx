import Link from "next/link";

import { signOut } from "@/auth";

export function StudentHeader({ pseudonym, demoIndex, authenticated = false }: { pseudonym?: string; demoIndex?: number; authenticated?: boolean }) {
  const suffix = demoIndex ? `?student=${demoIndex}` : "";
  return (
    <header className="student-header">
      <div className="student-header__inner">
        <Link className="student-wordmark" href={`/student${suffix}`}>Civil Procedure Practice</Link>
        <nav aria-label="Student navigation">
          <Link href={`/student${suffix}`}>My feedback</Link>
          <Link href={`/student/practice${suffix}`}>New response</Link>
          {pseudonym && <span aria-label={`Course identifier ${pseudonym}`}>{pseudonym}</span>}
          {authenticated && (
            <form action={async () => {
              "use server";
              await signOut({ redirectTo: "/student/sign-in" });
            }}>
              <button type="submit">Sign out</button>
            </form>
          )}
        </nav>
      </div>
    </header>
  );
}

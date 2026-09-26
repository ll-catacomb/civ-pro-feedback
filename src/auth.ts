import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import { attemptGateConfigured, createAttemptGateClient } from "@/lib/attempt-gate";
import { isStaffEmail } from "@/lib/staff-emails";
import { isWorkspaceEmail, workspaceDomains } from "@/lib/workspace-domains";

const allowedDomains = workspaceDomains();

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          prompt: "select_account",
          // Google's hd hint accepts one domain, so it is only a convenience
          // when a single domain is configured. The callback enforces the list.
          ...(allowedDomains.length === 1 ? { hd: allowedDomains[0] } : {}),
        },
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/student/sign-in" },
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider !== "google" || !profile?.sub || !profile.email || !profile.email_verified) {
        return false;
      }
      // Match the verified email domain rather than hd, which may report the
      // organization's primary domain for class-year addresses. Requiring hd
      // still excludes consumer Google accounts.
      if (allowedDomains.length) {
        if (typeof profile.hd !== "string" || !profile.hd) return false;
        if (!isWorkspaceEmail(profile.email, allowedDomains)) return false;
      }
      if (isStaffEmail(profile.email)) {
        user.id = profile.sub;
        user.email = profile.email.toLowerCase();
        user.name = profile.email.toLowerCase();
        user.image = null;
        user.role = "staff";
        return true;
      }
      if (!attemptGateConfigured()) {
        console.warn("Google sign-in rejected because the Sheets attempt gate is not configured.");
        return false;
      }
      try {
        const claimed = await createAttemptGateClient().claim({
          email: profile.email,
          googleSubject: profile.sub,
          loginAt: new Date().toISOString(),
        });
        if (!claimed.pseudonym) return false;
        user.id = profile.sub;
        user.email = profile.email;
        user.name = claimed.pseudonym;
        user.image = null;
        user.role = "student";
        return true;
      } catch (error) {
        console.warn("Google sign-in did not match an active course enrollment.", error);
        return false;
      }
    },
    jwt({ token, user }) {
      if (user) {
        token.googleSubject = user.id;
        token.role = user.role === "staff" ? "staff" : "student";
        token.pseudonym = token.role === "student" ? user.name : null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.googleSubject = typeof token.googleSubject === "string" ? token.googleSubject : "";
        session.user.pseudonym = typeof token.pseudonym === "string" ? token.pseudonym : "";
        session.user.role = token.role === "staff" ? "staff" : "student";
        // Email is needed only at account-claim time and should not be exposed
        // throughout the student UI after the session is established.
        session.user.email = session.user.role === "staff" ? session.user.email : "";
        session.user.image = null;
        session.user.name = session.user.pseudonym;
      }
      return session;
    },
  },
});

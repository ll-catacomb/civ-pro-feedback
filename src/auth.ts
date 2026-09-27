import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { attemptGateConfigured, createAttemptGateClient } from "@/lib/attempt-gate";
import { isStaffEmail } from "@/lib/staff-emails";
import { hashEnrollmentCode } from "@/lib/student-records";
import { isWorkspaceEmail, workspaceDomains } from "@/lib/workspace-domains";

const allowedDomains = workspaceDomains();

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      id: "student-code",
      name: "Course access code",
      credentials: {
        code: { label: "Course access code", type: "text" },
      },
      async authorize(credentials) {
        if (!attemptGateConfigured() || typeof credentials.code !== "string") return null;
        try {
          const authenticated = await createAttemptGateClient().authenticate({
            codeHash: hashEnrollmentCode(credentials.code),
            loginAt: new Date().toISOString(),
          });
          if (!authenticated.studentId || !authenticated.pseudonym) return null;
          return {
            id: authenticated.studentId,
            name: authenticated.pseudonym,
            email: null,
            image: null,
            role: "student",
          };
        } catch {
          // Invalid credentials are expected user input. Do not log the code or
          // whether a nearby value exists in the enrollment sheet.
          return null;
        }
      },
    }),
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
      if (account?.provider === "student-code") return user.role === "student";
      if (account?.provider !== "google" || !profile?.sub || !profile.email || !profile.email_verified) return false;
      // Match the verified staff email domain rather than hd, which may report
      // the organization's primary domain. Requiring hd still excludes
      // consumer Google accounts.
      if (allowedDomains.length) {
        if (typeof profile.hd !== "string" || !profile.hd) return false;
        if (!isWorkspaceEmail(profile.email, allowedDomains)) return false;
      }
      if (!isStaffEmail(profile.email)) return false;
      user.id = profile.sub;
      user.email = profile.email.toLowerCase();
      user.name = profile.email.toLowerCase();
      user.image = null;
      user.role = "staff";
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.role = user.role === "staff" ? "staff" : "student";
        token.googleSubject = token.role === "staff" ? user.id : undefined;
        token.studentId = token.role === "student" ? user.id : undefined;
        token.pseudonym = token.role === "student" ? user.name : null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.googleSubject = typeof token.googleSubject === "string" ? token.googleSubject : "";
        session.user.studentId = typeof token.studentId === "string" ? token.studentId : "";
        session.user.pseudonym = typeof token.pseudonym === "string" ? token.pseudonym : "";
        session.user.role = token.role === "staff" ? "staff" : "student";
        // Student accounts never request or store an email address.
        session.user.email = session.user.role === "staff" ? session.user.email : "";
        session.user.image = null;
        session.user.name = session.user.pseudonym;
      }
      return session;
    },
  },
});

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { attemptGateConfigured, createAttemptGateClient } from "@/lib/attempt-gate";
import { verifyGoogleIdentityProof } from "@/lib/google-identity-proof";
import { hashStudentEmail } from "@/lib/student-email-lookup";
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
        googleIdentityProof: { label: "Google identity proof", type: "hidden" },
      },
      async authorize(credentials) {
        if (!attemptGateConfigured()
          || typeof credentials.code !== "string"
          || typeof credentials.googleIdentityProof !== "string"
          || !process.env.AUTH_SECRET) return null;
        const googleIdentity = verifyGoogleIdentityProof(
          credentials.googleIdentityProof,
          process.env.AUTH_SECRET,
        );
        if (!googleIdentity) return null;
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
            googleSubject: googleIdentity.subject,
          };
        } catch {
          // Invalid credentials are expected user input. Do not log the code or
          // whether a nearby value exists in the enrollment sheet. The signed
          // Google handoff is deliberately short-lived and contains no email.
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
  pages: { signIn: "/student/sign-in", error: "/student/sign-in" },
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider === "student-code") {
        return user.role === "student" && Boolean(user.googleSubject);
      }
      if (account?.provider !== "google" || !profile?.sub || !profile.email || !profile.email_verified) return false;
      // Match the verified student email domain rather than hd, which may report
      // the organization's primary domain. Requiring hd still excludes
      // consumer Google accounts.
      if (allowedDomains.length) {
        if (typeof profile.hd !== "string" || !profile.hd) return false;
        if (!isWorkspaceEmail(profile.email, allowedDomains)) return false;
      }
      const lookupSecret = process.env.STUDENT_EMAIL_LOOKUP_SECRET;
      if (!attemptGateConfigured() || !lookupSecret) return false;
      try {
        const authenticated = await createAttemptGateClient().authenticate({
          codeHash: hashStudentEmail(profile.email, lookupSecret),
          loginAt: new Date().toISOString(),
        });
        if (!authenticated.studentId || !authenticated.pseudonym) return false;
        user.id = authenticated.studentId;
        user.name = authenticated.pseudonym;
      } catch {
        // A rejected lookup can mean either an unlisted account or a gate
        // problem. Do not log the address or disclose which case occurred.
        return false;
      }
      user.email = null;
      user.image = null;
      user.role = "student";
      user.googleSubject = profile.sub;
      return true;
    },
    jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === "google") {
          token.role = "student";
          token.googleSubject = user.googleSubject ?? user.id;
          token.studentId = user.id;
          token.pseudonym = user.name;
        } else {
          token.role = "student";
          token.googleSubject = user.googleSubject;
          token.studentId = user.id;
          token.pseudonym = user.name;
        }
        // The verified address is used only inside the Google callback for the
        // Workspace-domain check. It is not retained in the session cookie.
        token.email = undefined;
        token.name = undefined;
        token.picture = undefined;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.googleSubject = typeof token.googleSubject === "string" ? token.googleSubject : "";
        session.user.studentId = typeof token.studentId === "string" ? token.studentId : "";
        session.user.pseudonym = typeof token.pseudonym === "string" ? token.pseudonym : "";
        session.user.role = token.role === "student" ? "student" : "pending";
        session.user.email = "";
        session.user.image = null;
        session.user.name = session.user.pseudonym;
      }
      return session;
    },
  },
});

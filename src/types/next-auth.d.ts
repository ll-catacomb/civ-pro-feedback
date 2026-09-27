import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      googleSubject: string;
      studentId: string;
      pseudonym: string;
      role: "student" | "staff";
    };
  }

  interface User {
    role?: "student" | "staff";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    googleSubject?: string;
    studentId?: string;
    pseudonym?: string | null;
    role?: "student" | "staff";
  }
}

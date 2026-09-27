import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      googleSubject: string;
      studentId: string;
      pseudonym: string;
      role: "pending" | "student" | "staff";
    };
  }

  interface User {
    role?: "pending" | "student" | "staff";
    googleSubject?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    googleSubject?: string;
    studentId?: string;
    pseudonym?: string | null;
    role?: "pending" | "student" | "staff";
  }
}

import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/auth";

export async function hasStaffSession(): Promise<boolean> {
  const session = await auth();
  return session?.user.role === "staff";
}

export async function requireStaffPage(): Promise<void> {
  if (!(await hasStaffSession())) redirect("/staff/sign-in");
}

export async function requireStaffApi(): Promise<Response | undefined> {
  if (await hasStaffSession()) return undefined;
  return Response.json({ error: "Staff access is required." }, { status: 401 });
}

export function legacyPracticeEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

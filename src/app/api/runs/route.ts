import { NextResponse } from "next/server";

import { requireStaffApi } from "@/lib/access-control";
import { listRuns } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireStaffApi();
  if (denied) return denied;
  return NextResponse.json({ runs: await listRuns() });
}

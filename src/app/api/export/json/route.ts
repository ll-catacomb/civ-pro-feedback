import { listRuns } from "@/lib/store";
import { getAssessmentOutcome } from "@/lib/outcomes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const runs = await listRuns();
  const archive = {
    exportedAt: new Date().toISOString(),
    formatVersion: 1,
    runCount: runs.length,
    runs: runs.map((run) => ({
      ...run,
      assessmentOutcome: getAssessmentOutcome(run),
    })),
  };
  return Response.json(archive, {
    headers: {
      "Content-Disposition": `attachment; filename="civpro-feedback-complete-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

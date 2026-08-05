import { QaReport } from "@/components/qa-dashboard";
import { SiteHeader } from "@/components/site-header";
import { CALIBRATION_FIXTURES } from "@/lib/calibration";
import { buildReportModel, type ReportModel } from "@/lib/report-model";
import reportSnapshot from "@/lib/report-snapshot.json";
import { listRuns } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Live run store locally; committed snapshot when deployed (the .data store
  // is git-ignored, so a link shared with reviewers reads from the snapshot).
  const runs = await listRuns();
  const report: ReportModel = runs.length ? buildReportModel(runs) : (reportSnapshot as ReportModel);
  return (
    <>
      <SiteHeader />
      <main className="qa-page">
        <QaReport report={report} interactive={runs.length > 0} fixtures={CALIBRATION_FIXTURES} />
      </main>
    </>
  );
}

import { QaDashboard } from "@/components/qa-dashboard";
import { SiteHeader } from "@/components/site-header";
import { CALIBRATION_FIXTURES } from "@/lib/calibration";
import { listRuns } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  return (
    <>
      <SiteHeader />
      <main className="qa-page">
        <QaDashboard fixtures={CALIBRATION_FIXTURES} initialRuns={await listRuns()} />
      </main>
    </>
  );
}

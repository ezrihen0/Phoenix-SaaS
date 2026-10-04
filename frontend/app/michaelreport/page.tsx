import { requireMichaelReportRoute } from "@/lib/auth/server-session";

import MichaelReportWorkspace from "./michael-report-workspace";

export default async function MichaelReportPage() {
  const session = await requireMichaelReportRoute("/michaelreport");
  const ownerEmail = (process.env.PHOENIX_OWNER_EMAIL ?? "service@phoenixfireplace.ca").trim().toLowerCase();
  const isOwner = session.user.email.trim().toLowerCase() === ownerEmail;

  return <MichaelReportWorkspace isOwner={isOwner} />;
}

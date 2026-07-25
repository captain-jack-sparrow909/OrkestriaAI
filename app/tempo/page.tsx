import { requireChatGPTUser } from "../chatgpt-auth";
import { WorkspaceChrome } from "../components/WorkspaceChrome";
import { TempoStudio } from "./TempoStudio";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tempo Operations Studio",
  description: "Correlate deployments, alerts, logs, and infrastructure changes safely.",
};

export default async function TempoPage() {
  const user = await requireChatGPTUser("/tempo");

  return (
    <WorkspaceChrome user={user} active="tempo" title="Tempo Operations Studio">
      <TempoStudio />
    </WorkspaceChrome>
  );
}

import { requireChatGPTUser } from "../chatgpt-auth";
import { WorkspaceChrome } from "../components/WorkspaceChrome";
import { ScaleOpsCenter } from "./ScaleOpsCenter";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ScaleOps — GA Operations Control Room",
  description: "Govern executors, SLO telemetry, incident exercises, billing safeguards, support workflows, and scale expansion.",
};

export default async function ScalePage() {
  const user = await requireChatGPTUser("/scale");
  return (
    <WorkspaceChrome user={user} active="scale" title="ScaleOps Control Room">
      <ScaleOpsCenter />
    </WorkspaceChrome>
  );
}

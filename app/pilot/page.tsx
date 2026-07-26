import { requireChatGPTUser } from "../chatgpt-auth";
import { WorkspaceChrome } from "../components/WorkspaceChrome";
import { Launchroom } from "./Launchroom";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Launchroom — Pilot & GA Command Center",
  description: "Operate controlled pilots, bounded production actions, support coverage, and evidence-based launch decisions.",
};

export default async function PilotPage() {
  const user = await requireChatGPTUser("/pilot");
  return (
    <WorkspaceChrome user={user} active="pilot" title="Launchroom">
      <Launchroom />
    </WorkspaceChrome>
  );
}

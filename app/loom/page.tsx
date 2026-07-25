import { requireChatGPTUser } from "../chatgpt-auth";
import { WorkspaceChrome } from "../components/WorkspaceChrome";
import { LoomStudio } from "./LoomStudio";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Loom Workflow Studio",
  description: "Turn plain English into approval-aware automation plans.",
};

export default async function LoomPage() {
  const user = await requireChatGPTUser("/loom");

  return (
    <WorkspaceChrome user={user} active="loom" title="Loom Workflow Studio">
      <LoomStudio />
    </WorkspaceChrome>
  );
}

import { requireChatGPTUser } from "../chatgpt-auth";
import { WorkspaceChrome } from "../components/WorkspaceChrome";
import { ContinuumStudio } from "./ContinuumStudio";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Continuum — Organizational Memory & Operational Digital Twin",
  description:
    "Build evidence-bound organizational memory, inspect temporal knowledge, and rehearse operational scenarios without changing production.",
};

export default async function ContinuumPage() {
  const user = await requireChatGPTUser("/continuum");
  return (
    <WorkspaceChrome user={user} active="continuum" title="Continuum">
      <ContinuumStudio />
    </WorkspaceChrome>
  );
}

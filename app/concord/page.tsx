import { requireChatGPTUser } from "../chatgpt-auth";
import { WorkspaceChrome } from "../components/WorkspaceChrome";
import { ConcordCommand } from "./ConcordCommand";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Concord — Federated Enterprise Command",
  description:
    "Coordinate explicitly approved workspaces with delegated governance, federated policy, bounded rollups, privacy-safe benchmarks, and evidence-gated executive decisions.",
};

export default async function ConcordPage() {
  const user = await requireChatGPTUser("/concord");
  return (
    <WorkspaceChrome user={user} active="concord" title="Concord">
      <ConcordCommand />
    </WorkspaceChrome>
  );
}

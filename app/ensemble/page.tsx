import { requireChatGPTUser } from "../chatgpt-auth";
import { WorkspaceChrome } from "../components/WorkspaceChrome";
import { EnsembleCouncil } from "./EnsembleCouncil";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ensemble — Collaborative Agent Teams & Executive Decisioning",
  description:
    "Coordinate bounded AI specialists, evidence handoffs, executive briefs, and governed decisions in one accountable case room.",
};

export default async function EnsemblePage() {
  const user = await requireChatGPTUser("/ensemble");
  return (
    <WorkspaceChrome user={user} active="ensemble" title="Ensemble">
      <EnsembleCouncil />
    </WorkspaceChrome>
  );
}

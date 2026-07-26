import { requireChatGPTUser } from "../chatgpt-auth";
import { WorkspaceChrome } from "../components/WorkspaceChrome";
import { CadenceControlRoom } from "./CadenceControlRoom";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Cadence — Adaptive Autonomy & Customer Intelligence",
  description:
    "Turn production feedback, tenant evaluation, forecasts, and verified outcomes into safe autonomy and reviewable policy improvements.",
};

export default async function CadencePage() {
  const user = await requireChatGPTUser("/cadence");
  return (
    <WorkspaceChrome user={user} active="cadence" title="Cadence">
      <CadenceControlRoom />
    </WorkspaceChrome>
  );
}

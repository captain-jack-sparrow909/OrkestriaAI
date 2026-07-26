import { requireChatGPTUser } from "../chatgpt-auth";
import { WorkspaceChrome } from "../components/WorkspaceChrome";
import { TrustGrid } from "./TrustGrid";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "TrustGrid — Continuous Trust & Global Expansion",
  description: "Govern regional resilience, provider redundancy, continuous evaluation, service health, compliance automation, and rollout evidence.",
};

export default async function TrustPage() {
  const user = await requireChatGPTUser("/trust");
  return (
    <WorkspaceChrome user={user} active="trust" title="TrustGrid">
      <TrustGrid />
    </WorkspaceChrome>
  );
}

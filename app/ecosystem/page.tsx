import { requireChatGPTUser } from "../chatgpt-auth";
import { WorkspaceChrome } from "../components/WorkspaceChrome";
import { EcosystemExchange } from "./EcosystemExchange";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ecosystem Exchange",
  description: "Install trusted connectors, activate vertical policy packs, and build partner integrations.",
};

export default async function EcosystemPage() {
  const user = await requireChatGPTUser("/ecosystem");
  return (
    <WorkspaceChrome user={user} active="ecosystem" title="Ecosystem Exchange">
      <EcosystemExchange />
    </WorkspaceChrome>
  );
}

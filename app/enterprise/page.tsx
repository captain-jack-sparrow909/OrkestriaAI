import { requireChatGPTUser } from "../chatgpt-auth";
import { WorkspaceChrome } from "../components/WorkspaceChrome";
import { EnterpriseStudio } from "./EnterpriseStudio";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Enterprise Control Center",
  description: "Govern identity, access, policy, residency, evidence, and service commitments.",
};

export default async function EnterprisePage() {
  const user = await requireChatGPTUser("/enterprise");

  return (
    <WorkspaceChrome user={user} active="enterprise" title="Enterprise Control Center">
      <EnterpriseStudio />
    </WorkspaceChrome>
  );
}

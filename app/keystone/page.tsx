import { requireChatGPTUser } from "../chatgpt-auth";
import { WorkspaceChrome } from "../components/WorkspaceChrome";
import { KeystoneStudio } from "./KeystoneStudio";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Keystone — Governed Execution & Benefits Realization",
  description:
    "Connect program delivery, milestone evidence, benefit measurements, execution variance, and approval-gated corrective actions without hidden operational changes.",
};

export default async function KeystonePage() {
  const user = await requireChatGPTUser("/keystone");
  return (
    <WorkspaceChrome user={user} active="keystone" title="Keystone">
      <KeystoneStudio />
    </WorkspaceChrome>
  );
}

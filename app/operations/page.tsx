import { requireChatGPTUser } from "../chatgpt-auth";
import { WorkspaceChrome } from "../components/WorkspaceChrome";
import { OperationsCenter } from "./OperationsCenter";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Production Operations Center",
  description: "Operate provider authorization, durable workers, metering, recovery, validation, and pilot readiness.",
};

export default async function OperationsPage() {
  const user = await requireChatGPTUser("/operations");
  return (
    <WorkspaceChrome user={user} active="operations" title="Production Operations Center">
      <OperationsCenter />
    </WorkspaceChrome>
  );
}

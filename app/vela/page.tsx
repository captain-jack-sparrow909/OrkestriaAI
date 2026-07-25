import { requireChatGPTUser } from "../chatgpt-auth";
import { WorkspaceChrome } from "../components/WorkspaceChrome";
import { VelaStudio } from "./VelaStudio";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Vela Browser Studio",
  description: "Plan safe, multi-step browser work with visible approval gates.",
};

export default async function VelaPage() {
  const user = await requireChatGPTUser("/vela");

  return (
    <WorkspaceChrome user={user} active="vela" title="Vela Browser Studio">
      <VelaStudio />
    </WorkspaceChrome>
  );
}

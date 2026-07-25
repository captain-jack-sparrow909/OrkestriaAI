import { requireChatGPTUser } from "../chatgpt-auth";
import { WorkspaceChrome } from "../components/WorkspaceChrome";
import { AegisStudio } from "./AegisStudio";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Aegis Security Studio",
  description: "Review code and configuration for concrete vulnerabilities and safe fixes.",
};

export default async function AegisPage() {
  const user = await requireChatGPTUser("/aegis");

  return (
    <WorkspaceChrome user={user} active="aegis" title="Aegis Security Studio">
      <AegisStudio />
    </WorkspaceChrome>
  );
}

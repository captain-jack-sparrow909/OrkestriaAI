import { requireChatGPTUser } from "../chatgpt-auth";
import { WorkspaceChrome } from "../components/WorkspaceChrome";
import { HelioStudio } from "./HelioStudio";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Helio Cloud Cost Studio",
  description: "Turn cloud billing and utilization evidence into realistic, trackable savings.",
};

export default async function HelioPage() {
  const user = await requireChatGPTUser("/helio");

  return (
    <WorkspaceChrome user={user} active="helio" title="Helio Cloud Cost Studio">
      <HelioStudio />
    </WorkspaceChrome>
  );
}

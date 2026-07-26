import { requireChatGPTUser } from "../chatgpt-auth";
import { WorkspaceChrome } from "../components/WorkspaceChrome";
import { MeridianStudio } from "./MeridianStudio";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Meridian — Strategic Planning & Portfolio Intelligence",
  description:
    "Align goals, initiatives, capacity, dependencies, portfolio scenarios, and governed investment decisions without creating hidden commitments.",
};

export default async function MeridianPage() {
  const user = await requireChatGPTUser("/meridian");
  return (
    <WorkspaceChrome user={user} active="meridian" title="Meridian">
      <MeridianStudio />
    </WorkspaceChrome>
  );
}

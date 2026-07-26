import type { Metadata } from "next";
import { requireChatGPTUser } from "../chatgpt-auth";
import { WorkspaceChrome } from "../components/WorkspaceChrome";
import { OvertureCommand } from "./OvertureCommand";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Overture · General Availability Command · OrkestriaAI",
  description:
    "Govern resilience, security assurance, connector certification, runbooks, onboarding, and the final human launch decision.",
};

export default async function OverturePage() {
  const user = await requireChatGPTUser("/overture");
  return (
    <WorkspaceChrome user={user} active="overture" title="Overture · General Availability">
      <OvertureCommand />
    </WorkspaceChrome>
  );
}

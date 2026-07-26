import type { Metadata } from "next";
import { requireChatGPTUser } from "../chatgpt-auth";
import { WorkspaceChrome } from "../components/WorkspaceChrome";
import { VerityControl } from "./VerityControl";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verity · AI Quality Governance · OrkestriaAI",
  description:
    "Govern model and prompt versions, golden evaluations, drift evidence, cost-quality routing, and human promotion gates.",
};

export default async function VerityPage() {
  const user = await requireChatGPTUser("/verity");
  return (
    <WorkspaceChrome user={user} active="verity" title="Verity · AI Quality Governance">
      <VerityControl />
    </WorkspaceChrome>
  );
}

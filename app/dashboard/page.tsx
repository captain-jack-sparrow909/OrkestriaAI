import { requireChatGPTUser } from "../chatgpt-auth";
import { appwriteFoundationStatus } from "../lib/appwrite/config";
import { DashboardClient } from "./DashboardClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Command center",
  description: "Operate OrkestriaAI agents, approvals, and workflows from one control plane.",
};

export default async function DashboardPage() {
  const user = await requireChatGPTUser("/dashboard");
  const foundation = appwriteFoundationStatus();

  return <DashboardClient user={user} foundation={foundation} />;
}

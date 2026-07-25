import { getChatGPTUser } from "../../../chatgpt-auth";
import { appwriteFoundationStatus } from "../../../lib/appwrite/config";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  return Response.json({
    identity: {
      email: user.email,
      displayName: user.displayName,
      provider: "chatgpt-sites",
    },
    foundation: appwriteFoundationStatus(),
    services: {
      auth: "ready",
      rbac: "ready",
      approvals: "ready",
      audit: "ready",
      jobs: "ready",
      storage: "ready",
    },
  });
}

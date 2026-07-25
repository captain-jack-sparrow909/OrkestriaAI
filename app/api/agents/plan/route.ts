import { getChatGPTUser } from "../../../chatgpt-auth";
import {
  availableAgents,
  createAgentPlan,
} from "../../../lib/platform/repository";
import type { AgentKey } from "../../../lib/platform/model";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as {
    agent?: string;
    goal?: string;
    context?: unknown;
  } | null;
  const agent = String(body?.agent || "").toLowerCase() as AgentKey;
  const goal = String(body?.goal || "").trim();

  if (!availableAgents.has(agent) || goal.length < 8 || goal.length > 6000) {
    return Response.json(
      { error: "Choose an available agent and provide a clear task." },
      { status: 400 },
    );
  }

  try {
    const result = await createAgentPlan({
      agent,
      goal,
      context: JSON.stringify(body?.context ?? {}).slice(0, 12000),
      email: user.email,
      displayName: user.displayName,
    });
    if (!result) {
      return Response.json(
        { error: "Appwrite is not configured", code: "foundation_unconfigured" },
        { status: 503 },
      );
    }
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create the plan";
    const rateLimited = message.includes("Planning limit reached");
    return Response.json(
      { error: message },
      { status: rateLimited ? 429 : 502 },
    );
  }
}

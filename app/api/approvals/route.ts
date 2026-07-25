import { getChatGPTUser } from "../../chatgpt-auth";
import {
  decideApproval,
  ensureWorkspaceForUser,
  listPendingApprovals,
} from "../../lib/platform/repository";

function workspaceIdFrom(request: Request) {
  return new URL(request.url).searchParams.get("workspaceId")?.slice(0, 36);
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });

  const requestedWorkspaceId = workspaceIdFrom(request);

  try {
    const ensured = requestedWorkspaceId
      ? null
      : await ensureWorkspaceForUser(user.email, user.displayName);
    const workspaceId = requestedWorkspaceId || ensured?.workspaceId;
    if (!workspaceId) {
      return Response.json(
        { error: "Appwrite is not configured", code: "foundation_unconfigured" },
        { status: 503 },
      );
    }
    const approvals = await listPendingApprovals(workspaceId, user.email);
    if (approvals === null) {
      return Response.json(
        { error: "Appwrite is not configured", code: "foundation_unconfigured" },
        { status: 503 },
      );
    }
    return Response.json({ approvals, workspaceId });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to list approvals" },
      { status: 403 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => null) as {
    approvalId?: string;
    workspaceId?: string;
    decision?: string;
    reason?: string;
  } | null;
  if (
    !body?.approvalId ||
    !body.workspaceId ||
    (body.decision !== "approved" && body.decision !== "denied")
  ) {
    return Response.json({ error: "Invalid approval decision" }, { status: 400 });
  }

  try {
    const approval = await decideApproval({
      approvalId: body.approvalId.slice(0, 36),
      workspaceId: body.workspaceId.slice(0, 36),
      email: user.email,
      decision: body.decision,
      reason: body.reason,
    });
    if (approval === null) {
      return Response.json(
        { error: "Appwrite is not configured", code: "foundation_unconfigured" },
        { status: 503 },
      );
    }
    return Response.json({ approval });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to decide approval" },
      { status: 403 },
    );
  }
}

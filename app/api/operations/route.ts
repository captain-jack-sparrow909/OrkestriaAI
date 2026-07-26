import { getChatGPTUser } from "../../chatgpt-auth";
import {
  getOperationsOverview,
  markPilotCohortInvited,
  prepareProviderAuthorization,
  runRecoveryTabletop,
  runWorkerRehearsal,
} from "../../lib/platform/repository";

type OperationsAction =
  | { action: "prepare_authorization"; workspaceId: string; installationId: string }
  | { action: "run_worker_rehearsal"; workspaceId: string }
  | { action: "run_recovery_tabletop"; workspaceId: string }
  | { action: "mark_cohort_invited"; workspaceId: string };

function unavailable() {
  return Response.json(
    { error: "Appwrite is not configured", code: "foundation_unconfigured" },
    { status: 503 },
  );
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  try {
    const overview = await getOperationsOverview(user.email, user.displayName);
    if (!overview) return unavailable();
    return Response.json(overview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load production operations" },
      { status: 403 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json().catch(() => null) as OperationsAction | null;
  if (!body?.action || !body.workspaceId) {
    return Response.json({ error: "Invalid operations action" }, { status: 400 });
  }
  const workspaceId = body.workspaceId.slice(0, 36);
  try {
    if (body.action === "prepare_authorization") {
      const authorization = await prepareProviderAuthorization({
        workspaceId,
        installationId: String(body.installationId || "").slice(0, 36),
        email: user.email,
      });
      if (!authorization) return unavailable();
      return Response.json({ authorization }, { status: 201 });
    }
    if (body.action === "run_worker_rehearsal") {
      const rehearsal = await runWorkerRehearsal({
        workspaceId,
        email: user.email,
        displayName: user.displayName,
      });
      if (!rehearsal) return unavailable();
      return Response.json(rehearsal, { status: 201 });
    }
    if (body.action === "run_recovery_tabletop") {
      const result = await runRecoveryTabletop({ workspaceId, email: user.email });
      if (!result) return unavailable();
      return Response.json(result, { status: 201 });
    }
    if (body.action === "mark_cohort_invited") {
      const pilot = await markPilotCohortInvited({ workspaceId, email: user.email });
      if (!pilot) return unavailable();
      return Response.json({ pilot });
    }
    return Response.json({ error: "Unsupported operations action" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Operations action failed" },
      { status: 403 },
    );
  }
}

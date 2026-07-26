import { getChatGPTUser } from "../../chatgpt-auth";
import {
  addPilotParticipant,
  getLaunchroomOverview,
  proposeSupportBackup,
  recordLaunchDecision,
  refreshLaunchAssessment,
  runPilotExercise,
} from "../../lib/platform/repository";

type PilotAction =
  | { action: "add_participant"; workspaceId: string; participantEmail: string }
  | { action: "propose_support_backup"; workspaceId: string; backupEmail: string }
  | { action: "run_exercise"; workspaceId: string; scopeId: string }
  | { action: "refresh_assessment"; workspaceId: string }
  | {
      action: "record_decision";
      workspaceId: string;
      decision: "hold" | "go";
      rationale: string;
    };

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
    const overview = await getLaunchroomOverview(user.email, user.displayName);
    if (!overview) return unavailable();
    return Response.json(overview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load Launchroom" },
      { status: 403 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json().catch(() => null) as PilotAction | null;
  if (!body?.action || !body.workspaceId) {
    return Response.json({ error: "Invalid pilot action" }, { status: 400 });
  }
  const workspaceId = body.workspaceId.slice(0, 36);
  try {
    if (body.action === "add_participant") {
      const member = await addPilotParticipant({
        workspaceId,
        email: user.email,
        participantEmail: String(body.participantEmail || "").slice(0, 254),
      });
      if (!member) return unavailable();
      return Response.json({ member }, { status: 201 });
    }
    if (body.action === "propose_support_backup") {
      const rotation = await proposeSupportBackup({
        workspaceId,
        email: user.email,
        backupEmail: String(body.backupEmail || "").slice(0, 254),
      });
      if (!rotation) return unavailable();
      return Response.json({ rotation });
    }
    if (body.action === "run_exercise") {
      const exercise = await runPilotExercise({
        workspaceId,
        scopeId: String(body.scopeId || "").slice(0, 36),
        email: user.email,
        displayName: user.displayName,
      });
      if (!exercise) return unavailable();
      return Response.json({ exercise }, { status: 201 });
    }
    if (body.action === "refresh_assessment") {
      const decision = await refreshLaunchAssessment({ workspaceId, email: user.email });
      if (!decision) return unavailable();
      return Response.json({ decision });
    }
    if (body.action === "record_decision") {
      const decision = await recordLaunchDecision({
        workspaceId,
        email: user.email,
        decision: body.decision === "go" ? "go" : "hold",
        rationale: String(body.rationale || "").slice(0, 2000),
      });
      if (!decision) return unavailable();
      return Response.json({ decision });
    }
    return Response.json({ error: "Unsupported pilot action" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Pilot action failed" },
      { status: 403 },
    );
  }
}

import { getChatGPTUser } from "../../chatgpt-auth";
import {
  createMissionCase,
  getEnsembleOverview,
  recordExecutiveDecision,
  refreshMissionEvidence,
  reviewExecutiveBrief,
  runEnsembleRehearsal,
} from "../../lib/platform/repository";

type EnsembleAction =
  | {
      action: "create_mission";
      workspaceId: string;
      title: string;
      objective: string;
    }
  | { action: "run_rehearsal"; workspaceId: string; caseId: string }
  | { action: "review_brief"; workspaceId: string; briefId: string }
  | { action: "refresh_case"; workspaceId: string; caseId: string }
  | {
      action: "record_decision";
      workspaceId: string;
      caseId: string;
      decision: "hold" | "approve";
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
    const overview = await getEnsembleOverview(user.email, user.displayName);
    if (!overview) return unavailable();
    return Response.json(overview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load Ensemble" },
      { status: 403 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as EnsembleAction | null;
  if (!body?.action || !body.workspaceId) {
    return Response.json({ error: "Invalid team action" }, { status: 400 });
  }
  const workspaceId = body.workspaceId.slice(0, 36);
  try {
    if (body.action === "create_mission") {
      if (!String(body.title || "").trim() || !String(body.objective || "").trim()) {
        return Response.json({ error: "Mission title and objective are required" }, { status: 400 });
      }
      const mission = await createMissionCase({
        workspaceId,
        email: user.email,
        displayName: user.displayName,
        title: String(body.title).slice(0, 180),
        objective: String(body.objective).slice(0, 4000),
      });
      if (!mission) return unavailable();
      return Response.json({ mission }, { status: 201 });
    }
    if (body.action === "run_rehearsal") {
      const result = await runEnsembleRehearsal({
        workspaceId,
        caseId: body.caseId.slice(0, 36),
        email: user.email,
        displayName: user.displayName,
      });
      if (!result) return unavailable();
      return Response.json(result, { status: 201 });
    }
    if (body.action === "review_brief") {
      const brief = await reviewExecutiveBrief({
        workspaceId,
        briefId: body.briefId.slice(0, 36),
        email: user.email,
      });
      if (!brief) return unavailable();
      return Response.json({ brief });
    }
    if (body.action === "refresh_case") {
      const mission = await refreshMissionEvidence({
        workspaceId,
        caseId: body.caseId.slice(0, 36),
        email: user.email,
      });
      if (!mission) return unavailable();
      return Response.json({ mission });
    }
    if (body.action === "record_decision") {
      const decision = await recordExecutiveDecision({
        workspaceId,
        caseId: body.caseId.slice(0, 36),
        email: user.email,
        decision: body.decision === "approve" ? "approve" : "hold",
        rationale: String(body.rationale || "").slice(0, 2000),
      });
      if (!decision) return unavailable();
      return Response.json({ decision }, { status: 201 });
    }
    return Response.json({ error: "Unsupported team action" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Team action failed" },
      { status: 403 },
    );
  }
}

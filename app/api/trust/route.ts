import { getChatGPTUser } from "../../chatgpt-auth";
import {
  draftServiceHealthUpdate,
  getTrustGridOverview,
  recordRegionalDecision,
  refreshRegionalGate,
  runComplianceAutomationPreview,
  runTrustRehearsal,
} from "../../lib/platform/repository";

type TrustAction =
  | { action: "run_rehearsal"; workspaceId: string }
  | { action: "draft_health_update"; workspaceId: string }
  | { action: "run_compliance_preview"; workspaceId: string }
  | { action: "refresh_gate"; workspaceId: string }
  | {
      action: "record_decision";
      workspaceId: string;
      decision: "hold" | "expand";
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
    const overview = await getTrustGridOverview(user.email, user.displayName);
    if (!overview) return unavailable();
    return Response.json(overview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load TrustGrid" },
      { status: 403 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json().catch(() => null) as TrustAction | null;
  if (!body?.action || !body.workspaceId) {
    return Response.json({ error: "Invalid trust action" }, { status: 400 });
  }
  const workspaceId = body.workspaceId.slice(0, 36);
  try {
    if (body.action === "run_rehearsal") {
      const rehearsal = await runTrustRehearsal({
        workspaceId,
        email: user.email,
        displayName: user.displayName,
      });
      if (!rehearsal) return unavailable();
      return Response.json(rehearsal, { status: 201 });
    }
    if (body.action === "draft_health_update") {
      const update = await draftServiceHealthUpdate({
        workspaceId,
        email: user.email,
      });
      if (!update) return unavailable();
      return Response.json({ update }, { status: 201 });
    }
    if (body.action === "run_compliance_preview") {
      const run = await runComplianceAutomationPreview({
        workspaceId,
        email: user.email,
      });
      if (!run) return unavailable();
      return Response.json({ run }, { status: 201 });
    }
    if (body.action === "refresh_gate") {
      const gate = await refreshRegionalGate({ workspaceId, email: user.email });
      if (!gate) return unavailable();
      return Response.json({ gate });
    }
    if (body.action === "record_decision") {
      const gate = await recordRegionalDecision({
        workspaceId,
        email: user.email,
        decision: body.decision === "expand" ? "expand" : "hold",
        rationale: String(body.rationale || "").slice(0, 2000),
      });
      if (!gate) return unavailable();
      return Response.json({ gate });
    }
    return Response.json({ error: "Unsupported trust action" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Trust action failed" },
      { status: 403 },
    );
  }
}

import { getChatGPTUser } from "../../chatgpt-auth";
import {
  getScaleOpsOverview,
  recordScaleDecision,
  refreshScaleGate,
  runScaleRehearsal,
  runSupportWorkflowDrill,
  updateBillingSafeguard,
} from "../../lib/platform/repository";

type ScaleAction =
  | { action: "run_rehearsal"; workspaceId: string }
  | { action: "run_support_drill"; workspaceId: string }
  | { action: "update_budget"; workspaceId: string; monthlyBudgetDollars: number }
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
    const overview = await getScaleOpsOverview(user.email, user.displayName);
    if (!overview) return unavailable();
    return Response.json(overview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load ScaleOps" },
      { status: 403 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json().catch(() => null) as ScaleAction | null;
  if (!body?.action || !body.workspaceId) {
    return Response.json({ error: "Invalid scale action" }, { status: 400 });
  }
  const workspaceId = body.workspaceId.slice(0, 36);
  try {
    if (body.action === "run_rehearsal") {
      const rehearsal = await runScaleRehearsal({
        workspaceId,
        email: user.email,
        displayName: user.displayName,
      });
      if (!rehearsal) return unavailable();
      return Response.json(rehearsal, { status: 201 });
    }
    if (body.action === "run_support_drill") {
      const supportCase = await runSupportWorkflowDrill({
        workspaceId,
        email: user.email,
      });
      if (!supportCase) return unavailable();
      return Response.json({ supportCase }, { status: 201 });
    }
    if (body.action === "update_budget") {
      const billing = await updateBillingSafeguard({
        workspaceId,
        email: user.email,
        monthlyBudgetDollars: Number(body.monthlyBudgetDollars),
      });
      if (!billing) return unavailable();
      return Response.json({ billing });
    }
    if (body.action === "refresh_gate") {
      const gate = await refreshScaleGate({ workspaceId, email: user.email });
      if (!gate) return unavailable();
      return Response.json({ gate });
    }
    if (body.action === "record_decision") {
      const gate = await recordScaleDecision({
        workspaceId,
        email: user.email,
        decision: body.decision === "expand" ? "expand" : "hold",
        rationale: String(body.rationale || "").slice(0, 2000),
      });
      if (!gate) return unavailable();
      return Response.json({ gate });
    }
    return Response.json({ error: "Unsupported scale action" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Scale action failed" },
      { status: 403 },
    );
  }
}

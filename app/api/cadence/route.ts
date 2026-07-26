import { getChatGPTUser } from "../../chatgpt-auth";
import {
  captureFeedbackCycle,
  createPolicyRecommendation,
  getCadenceOverview,
  recordAutonomyDecision,
  recordCustomerOutcomeDraft,
  refreshAutonomyProfile,
  runTenantIntelligenceEvaluation,
} from "../../lib/platform/repository";

type CadenceAction =
  | { action: "capture_feedback"; workspaceId: string }
  | { action: "run_evaluation"; workspaceId: string }
  | { action: "draft_policy"; workspaceId: string }
  | { action: "refresh_profile"; workspaceId: string }
  | {
      action: "record_outcome";
      workspaceId: string;
      title: string;
      metric: string;
      baselineValue: number;
      currentValue: number;
      unit: string;
      note: string;
    }
  | {
      action: "record_decision";
      workspaceId: string;
      decision: "hold" | "promote";
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
    const overview = await getCadenceOverview(user.email, user.displayName);
    if (!overview) return unavailable();
    return Response.json(overview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load Cadence" },
      { status: 403 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as CadenceAction | null;
  if (!body?.action || !body.workspaceId) {
    return Response.json({ error: "Invalid intelligence action" }, { status: 400 });
  }
  const workspaceId = body.workspaceId.slice(0, 36);
  try {
    if (body.action === "capture_feedback") {
      const cycle = await captureFeedbackCycle({
        workspaceId,
        email: user.email,
      });
      if (!cycle) return unavailable();
      return Response.json({ cycle }, { status: 201 });
    }
    if (body.action === "run_evaluation") {
      const result = await runTenantIntelligenceEvaluation({
        workspaceId,
        email: user.email,
        displayName: user.displayName,
      });
      if (!result) return unavailable();
      return Response.json(result, { status: 201 });
    }
    if (body.action === "draft_policy") {
      const policy = await createPolicyRecommendation({
        workspaceId,
        email: user.email,
      });
      if (!policy) return unavailable();
      return Response.json({ policy }, { status: 201 });
    }
    if (body.action === "record_outcome") {
      if (
        !String(body.title || "").trim() ||
        !String(body.metric || "").trim() ||
        !String(body.unit || "").trim() ||
        !Number.isFinite(Number(body.baselineValue)) ||
        !Number.isFinite(Number(body.currentValue))
      ) {
        return Response.json({ error: "Complete every outcome field" }, { status: 400 });
      }
      const outcome = await recordCustomerOutcomeDraft({
        workspaceId,
        email: user.email,
        title: String(body.title).slice(0, 180),
        metric: String(body.metric).slice(0, 96),
        baselineValue: Number(body.baselineValue),
        currentValue: Number(body.currentValue),
        unit: String(body.unit).slice(0, 32),
        note: String(body.note || "").slice(0, 2000),
      });
      if (!outcome) return unavailable();
      return Response.json({ outcome }, { status: 201 });
    }
    if (body.action === "refresh_profile") {
      const profile = await refreshAutonomyProfile({
        workspaceId,
        email: user.email,
      });
      if (!profile) return unavailable();
      return Response.json({ profile });
    }
    if (body.action === "record_decision") {
      const decision = await recordAutonomyDecision({
        workspaceId,
        email: user.email,
        decision: body.decision === "promote" ? "promote" : "hold",
        rationale: String(body.rationale || "").slice(0, 2000),
      });
      if (!decision) return unavailable();
      return Response.json({ decision }, { status: 201 });
    }
    return Response.json({ error: "Unsupported intelligence action" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Intelligence action failed" },
      { status: 403 },
    );
  }
}

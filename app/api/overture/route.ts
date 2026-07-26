import { getChatGPTUser } from "../../chatgpt-auth";
import {
  createOnboardingChecklist,
  createOperationalRunbook,
  getOvertureOverview,
  proposeConnectorCertification,
  recordGaLaunchDecision,
  requestGaLaunchDecision,
  runGaPreflight,
} from "../../lib/platform/repository";

type OvertureAction =
  | { action: "run_preflight"; workspaceId: string }
  | {
      action: "propose_connector";
      workspaceId: string;
      connectorKey: string;
      displayName: string;
      capabilities: string[];
    }
  | {
      action: "create_runbook";
      workspaceId: string;
      runbookKey: string;
      name: string;
      category: string;
      content: string;
    }
  | {
      action: "create_onboarding";
      workspaceId: string;
      name: string;
      audience: string;
      items: string[];
    }
  | {
      action: "request_launch";
      workspaceId: string;
      title: string;
      rationale: string;
    }
  | {
      action: "decide_launch";
      workspaceId: string;
      decisionId: string;
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
    const overview = await getOvertureOverview(user.email, user.displayName);
    if (!overview) return unavailable();
    return Response.json(overview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load Overture" },
      { status: 403 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as OvertureAction | null;
  if (!body?.action || !body.workspaceId) {
    return Response.json({ error: "Invalid GA launch action" }, { status: 400 });
  }
  const workspaceId = body.workspaceId.slice(0, 36);
  try {
    if (body.action === "run_preflight") {
      const result = await runGaPreflight({
        workspaceId,
        email: user.email,
        displayName: user.displayName,
      });
      if (!result) return unavailable();
      return Response.json(result, { status: 201 });
    }
    if (body.action === "propose_connector") {
      if (
        !String(body.connectorKey || "").trim() ||
        !String(body.displayName || "").trim() ||
        !Array.isArray(body.capabilities)
      ) {
        return Response.json(
          { error: "Connector key, display name, and capabilities are required" },
          { status: 400 },
        );
      }
      const connector = await proposeConnectorCertification({
        workspaceId,
        connectorKey: String(body.connectorKey),
        displayName: String(body.displayName),
        capabilities: body.capabilities.map(String),
        email: user.email,
      });
      if (!connector) return unavailable();
      return Response.json({ connector }, { status: 201 });
    }
    if (body.action === "create_runbook") {
      if (
        !String(body.runbookKey || "").trim() ||
        !String(body.name || "").trim() ||
        !String(body.category || "").trim() ||
        !String(body.content || "").trim()
      ) {
        return Response.json(
          { error: "Runbook key, name, category, and content are required" },
          { status: 400 },
        );
      }
      const runbook = await createOperationalRunbook({
        workspaceId,
        runbookKey: String(body.runbookKey),
        name: String(body.name),
        category: String(body.category),
        content: String(body.content),
        email: user.email,
      });
      if (!runbook) return unavailable();
      return Response.json({ runbook }, { status: 201 });
    }
    if (body.action === "create_onboarding") {
      if (
        !String(body.name || "").trim() ||
        !String(body.audience || "").trim() ||
        !Array.isArray(body.items) ||
        body.items.length === 0
      ) {
        return Response.json(
          { error: "Checklist name, audience, and items are required" },
          { status: 400 },
        );
      }
      const checklist = await createOnboardingChecklist({
        workspaceId,
        name: String(body.name),
        audience: String(body.audience),
        items: body.items.map(String),
        email: user.email,
      });
      if (!checklist) return unavailable();
      return Response.json({ checklist }, { status: 201 });
    }
    if (body.action === "request_launch") {
      if (!String(body.title || "").trim() || !String(body.rationale || "").trim()) {
        return Response.json(
          { error: "Launch decision title and rationale are required" },
          { status: 400 },
        );
      }
      const decision = await requestGaLaunchDecision({
        workspaceId,
        title: String(body.title),
        rationale: String(body.rationale),
        email: user.email,
      });
      if (!decision) return unavailable();
      return Response.json({ decision }, { status: 201 });
    }
    if (body.action === "decide_launch") {
      if (
        !body.decisionId ||
        !["hold", "approve"].includes(body.decision) ||
        !String(body.rationale || "").trim()
      ) {
        return Response.json(
          { error: "A valid launch decision and rationale are required" },
          { status: 400 },
        );
      }
      const decision = await recordGaLaunchDecision({
        workspaceId,
        decisionId: body.decisionId.slice(0, 36),
        decision: body.decision,
        rationale: String(body.rationale),
        email: user.email,
      });
      if (!decision) return unavailable();
      return Response.json({ decision });
    }
    return Response.json({ error: "Unsupported GA launch action" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "GA launch action failed" },
      { status: 403 },
    );
  }
}

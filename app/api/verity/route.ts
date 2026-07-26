import { getChatGPTUser } from "../../chatgpt-auth";
import {
  createPromptVersion,
  draftModelRoutingPolicy,
  getVerityOverview,
  recordModelPromotionDecision,
  registerModelCandidate,
  requestModelPromotion,
  runModelQualityEvaluation,
} from "../../lib/platform/repository";

type VerityAction =
  | {
      action: "register_model";
      workspaceId: string;
      provider: string;
      modelKey: string;
      displayName: string;
      version: string;
      purpose: string;
    }
  | {
      action: "create_prompt";
      workspaceId: string;
      promptKey: string;
      name: string;
      content: string;
      modelVersionId: string;
    }
  | {
      action: "run_evaluation";
      workspaceId: string;
      suiteId: string;
      modelVersionId: string;
      promptVersionId: string;
    }
  | {
      action: "draft_routing";
      workspaceId: string;
      name: string;
      capability: string;
      primaryModelVersionId: string;
      fallbackModelVersionId?: string;
      qualityFloorBps: number;
      costCeilingCents: number;
    }
  | {
      action: "request_promotion";
      workspaceId: string;
      modelVersionId: string;
      promptVersionId: string;
      qualityRunId: string;
      routingPolicyId?: string;
      title: string;
      rationale: string;
    }
  | {
      action: "decide_promotion";
      workspaceId: string;
      promotionId: string;
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
    const overview = await getVerityOverview(user.email, user.displayName);
    if (!overview) return unavailable();
    return Response.json(overview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load Verity" },
      { status: 403 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as VerityAction | null;
  if (!body?.action || !body.workspaceId) {
    return Response.json({ error: "Invalid AI quality action" }, { status: 400 });
  }
  const workspaceId = body.workspaceId.slice(0, 36);
  try {
    if (body.action === "register_model") {
      if (
        !String(body.provider || "").trim() ||
        !String(body.modelKey || "").trim() ||
        !String(body.displayName || "").trim() ||
        !String(body.version || "").trim()
      ) {
        return Response.json(
          { error: "Provider, model key, display name, and version are required" },
          { status: 400 },
        );
      }
      const model = await registerModelCandidate({
        workspaceId,
        provider: String(body.provider),
        modelKey: String(body.modelKey),
        displayName: String(body.displayName),
        version: String(body.version),
        purpose: String(body.purpose || "agent_planning"),
        email: user.email,
      });
      if (!model) return unavailable();
      return Response.json({ model }, { status: 201 });
    }
    if (body.action === "create_prompt") {
      if (
        !body.modelVersionId ||
        !String(body.promptKey || "").trim() ||
        !String(body.name || "").trim() ||
        !String(body.content || "").trim()
      ) {
        return Response.json(
          { error: "Prompt key, name, content, and model are required" },
          { status: 400 },
        );
      }
      const prompt = await createPromptVersion({
        workspaceId,
        promptKey: String(body.promptKey),
        name: String(body.name),
        content: String(body.content),
        modelVersionId: body.modelVersionId.slice(0, 36),
        email: user.email,
      });
      if (!prompt) return unavailable();
      return Response.json({ prompt }, { status: 201 });
    }
    if (body.action === "run_evaluation") {
      if (!body.suiteId || !body.modelVersionId || !body.promptVersionId) {
        return Response.json(
          { error: "Suite, model, and prompt are required" },
          { status: 400 },
        );
      }
      const result = await runModelQualityEvaluation({
        workspaceId,
        suiteId: body.suiteId.slice(0, 36),
        modelVersionId: body.modelVersionId.slice(0, 36),
        promptVersionId: body.promptVersionId.slice(0, 36),
        email: user.email,
        displayName: user.displayName,
      });
      if (!result) return unavailable();
      return Response.json(result, { status: 201 });
    }
    if (body.action === "draft_routing") {
      if (
        !body.primaryModelVersionId ||
        !String(body.name || "").trim() ||
        !String(body.capability || "").trim()
      ) {
        return Response.json(
          { error: "Routing name, capability, and primary model are required" },
          { status: 400 },
        );
      }
      const routing = await draftModelRoutingPolicy({
        workspaceId,
        name: String(body.name),
        capability: String(body.capability),
        primaryModelVersionId: body.primaryModelVersionId.slice(0, 36),
        fallbackModelVersionId: body.fallbackModelVersionId?.slice(0, 36),
        qualityFloorBps: Number(body.qualityFloorBps) || 0,
        costCeilingCents: Number(body.costCeilingCents) || 0,
        email: user.email,
      });
      if (!routing) return unavailable();
      return Response.json({ routing }, { status: 201 });
    }
    if (body.action === "request_promotion") {
      if (
        !body.modelVersionId ||
        !body.promptVersionId ||
        !body.qualityRunId ||
        !String(body.title || "").trim() ||
        !String(body.rationale || "").trim()
      ) {
        return Response.json(
          { error: "Model, prompt, quality run, title, and rationale are required" },
          { status: 400 },
        );
      }
      const promotion = await requestModelPromotion({
        workspaceId,
        modelVersionId: body.modelVersionId.slice(0, 36),
        promptVersionId: body.promptVersionId.slice(0, 36),
        qualityRunId: body.qualityRunId.slice(0, 36),
        routingPolicyId: body.routingPolicyId?.slice(0, 36),
        title: String(body.title),
        rationale: String(body.rationale),
        email: user.email,
      });
      if (!promotion) return unavailable();
      return Response.json({ promotion }, { status: 201 });
    }
    if (body.action === "decide_promotion") {
      if (
        !body.promotionId ||
        !["hold", "approve"].includes(body.decision) ||
        !String(body.rationale || "").trim()
      ) {
        return Response.json(
          { error: "A valid promotion decision and rationale are required" },
          { status: 400 },
        );
      }
      const promotion = await recordModelPromotionDecision({
        workspaceId,
        promotionId: body.promotionId.slice(0, 36),
        decision: body.decision,
        rationale: String(body.rationale),
        email: user.email,
      });
      if (!promotion) return unavailable();
      return Response.json({ promotion });
    }
    return Response.json({ error: "Unsupported AI quality action" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "AI quality action failed" },
      { status: 403 },
    );
  }
}

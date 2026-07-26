import { getChatGPTUser } from "../../chatgpt-auth";
import {
  createExecutionProgram,
  getKeystoneOverview,
  proposeCorrectiveAction,
  recordBenefitMeasurement,
  recordCorrectiveActionDecision,
  recordDeliveryEvidence,
  runExecutionAssessment,
} from "../../lib/platform/repository";

type KeystoneAction =
  | {
      action: "create_program";
      workspaceId: string;
      initiativeId: string;
      investmentDecisionId?: string;
      name: string;
      targetDate: string;
      budgetDollars: number;
    }
  | {
      action: "record_delivery_evidence";
      workspaceId: string;
      milestoneId: string;
      type: string;
      summary: string;
      reference: string;
      occurredAt: string;
    }
  | {
      action: "record_benefit_measurement";
      workspaceId: string;
      metricId: string;
      observedValue: number;
      period: string;
      source: string;
      evidence: string;
    }
  | {
      action: "run_assessment";
      workspaceId: string;
      programId: string;
    }
  | {
      action: "propose_corrective_action";
      workspaceId: string;
      varianceId: string;
      title: string;
      actionType: string;
      rationale: string;
    }
  | {
      action: "decide_corrective_action";
      workspaceId: string;
      actionId: string;
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
    const overview = await getKeystoneOverview(user.email, user.displayName);
    if (!overview) return unavailable();
    return Response.json(overview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load Keystone" },
      { status: 403 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as KeystoneAction | null;
  if (!body?.action || !body.workspaceId) {
    return Response.json({ error: "Invalid execution action" }, { status: 400 });
  }
  const workspaceId = body.workspaceId.slice(0, 36);
  try {
    if (body.action === "create_program") {
      if (
        !body.initiativeId ||
        !String(body.name || "").trim() ||
        !String(body.targetDate || "").trim()
      ) {
        return Response.json(
          { error: "Initiative, program name, and target date are required" },
          { status: 400 },
        );
      }
      const program = await createExecutionProgram({
        workspaceId,
        initiativeId: body.initiativeId.slice(0, 36),
        investmentDecisionId: body.investmentDecisionId?.slice(0, 36),
        name: String(body.name).slice(0, 180),
        targetDate: String(body.targetDate).slice(0, 32),
        budgetDollars: Number(body.budgetDollars) || 0,
        email: user.email,
      });
      if (!program) return unavailable();
      return Response.json({ program }, { status: 201 });
    }
    if (body.action === "record_delivery_evidence") {
      if (
        !body.milestoneId ||
        !String(body.summary || "").trim() ||
        !String(body.occurredAt || "").trim()
      ) {
        return Response.json(
          { error: "Milestone, evidence summary, and occurrence date are required" },
          { status: 400 },
        );
      }
      const evidence = await recordDeliveryEvidence({
        workspaceId,
        milestoneId: body.milestoneId.slice(0, 36),
        type: String(body.type || "delivery_note").slice(0, 64),
        summary: String(body.summary).slice(0, 2000),
        reference: String(body.reference || "").slice(0, 1000),
        occurredAt: String(body.occurredAt).slice(0, 32),
        email: user.email,
      });
      if (!evidence) return unavailable();
      return Response.json({ evidence }, { status: 201 });
    }
    if (body.action === "record_benefit_measurement") {
      if (
        !body.metricId ||
        !String(body.period || "").trim() ||
        !String(body.source || "").trim()
      ) {
        return Response.json(
          { error: "Metric, period, and measurement source are required" },
          { status: 400 },
        );
      }
      const measurement = await recordBenefitMeasurement({
        workspaceId,
        metricId: body.metricId.slice(0, 36),
        observedValue: Number(body.observedValue) || 0,
        period: String(body.period).slice(0, 32),
        source: String(body.source).slice(0, 128),
        evidence: String(body.evidence || "").slice(0, 2000),
        email: user.email,
      });
      if (!measurement) return unavailable();
      return Response.json({ measurement }, { status: 201 });
    }
    if (body.action === "run_assessment") {
      if (!body.programId) {
        return Response.json({ error: "Program is required" }, { status: 400 });
      }
      const result = await runExecutionAssessment({
        workspaceId,
        programId: body.programId.slice(0, 36),
        email: user.email,
        displayName: user.displayName,
      });
      if (!result) return unavailable();
      return Response.json(result, { status: 201 });
    }
    if (body.action === "propose_corrective_action") {
      if (
        !body.varianceId ||
        !String(body.title || "").trim() ||
        !String(body.rationale || "").trim()
      ) {
        return Response.json(
          { error: "Variance, action title, and rationale are required" },
          { status: 400 },
        );
      }
      const correctiveAction = await proposeCorrectiveAction({
        workspaceId,
        varianceId: body.varianceId.slice(0, 36),
        title: String(body.title).slice(0, 180),
        actionType: String(body.actionType || "review_plan").slice(0, 64),
        rationale: String(body.rationale).slice(0, 2000),
        email: user.email,
      });
      if (!correctiveAction) return unavailable();
      return Response.json({ correctiveAction }, { status: 201 });
    }
    if (body.action === "decide_corrective_action") {
      if (
        !body.actionId ||
        !["hold", "approve"].includes(body.decision) ||
        !String(body.rationale || "").trim()
      ) {
        return Response.json(
          { error: "A valid corrective-action decision is required" },
          { status: 400 },
        );
      }
      const correctiveAction = await recordCorrectiveActionDecision({
        workspaceId,
        actionId: body.actionId.slice(0, 36),
        decision: body.decision,
        rationale: String(body.rationale).slice(0, 2000),
        email: user.email,
      });
      if (!correctiveAction) return unavailable();
      return Response.json({ correctiveAction });
    }
    return Response.json({ error: "Unsupported execution action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Execution action failed";
    return Response.json(
      { error: message },
      { status: /permission|outside/i.test(message) ? 403 : 409 },
    );
  }
}

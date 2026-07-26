import { getChatGPTUser } from "../../chatgpt-auth";
import {
  getMeridianOverview,
  proposePortfolioInitiative,
  recordInvestmentDecision,
  runPortfolioScenario,
  updateCapacityEnvelope,
} from "../../lib/platform/repository";

type MeridianAction =
  | {
      action: "propose_initiative";
      workspaceId: string;
      goalId: string;
      name: string;
      expectedImpact: string;
      proposedBudgetDollars: number;
      requiredHeadcount: number;
    }
  | {
      action: "update_capacity";
      workspaceId: string;
      budgetDollars: number;
      availableHeadcount: number;
    }
  | {
      action: "run_scenario";
      workspaceId: string;
      title: string;
      selectedInitiativeIds: string[];
      budgetLimitDollars: number;
      headcountLimit: number;
      horizonMonths: number;
    }
  | {
      action: "record_decision";
      workspaceId: string;
      scenarioId: string;
      decision: "hold" | "authorize";
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
    const overview = await getMeridianOverview(user.email, user.displayName);
    if (!overview) return unavailable();
    return Response.json(overview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load Meridian" },
      { status: 403 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as MeridianAction | null;
  if (!body?.action || !body.workspaceId) {
    return Response.json({ error: "Invalid portfolio action" }, { status: 400 });
  }
  const workspaceId = body.workspaceId.slice(0, 36);
  try {
    if (body.action === "propose_initiative") {
      if (
        !body.goalId ||
        !String(body.name || "").trim() ||
        !String(body.expectedImpact || "").trim()
      ) {
        return Response.json(
          { error: "Goal, initiative name, and expected impact are required" },
          { status: 400 },
        );
      }
      const initiative = await proposePortfolioInitiative({
        workspaceId,
        goalId: body.goalId.slice(0, 36),
        name: String(body.name).slice(0, 180),
        expectedImpact: String(body.expectedImpact).slice(0, 2000),
        proposedBudgetDollars: Number(body.proposedBudgetDollars) || 0,
        requiredHeadcount: Number(body.requiredHeadcount) || 0,
        email: user.email,
      });
      if (!initiative) return unavailable();
      return Response.json({ initiative }, { status: 201 });
    }
    if (body.action === "update_capacity") {
      const capacity = await updateCapacityEnvelope({
        workspaceId,
        budgetDollars: Number(body.budgetDollars) || 0,
        availableHeadcount: Number(body.availableHeadcount) || 0,
        email: user.email,
      });
      if (!capacity) return unavailable();
      return Response.json({ capacity });
    }
    if (body.action === "run_scenario") {
      if (
        !String(body.title || "").trim() ||
        !Array.isArray(body.selectedInitiativeIds) ||
        body.selectedInitiativeIds.length === 0
      ) {
        return Response.json(
          { error: "Scenario title and at least one initiative are required" },
          { status: 400 },
        );
      }
      const result = await runPortfolioScenario({
        workspaceId,
        title: String(body.title).slice(0, 180),
        selectedInitiativeIds: body.selectedInitiativeIds
          .map(String)
          .map((value) => value.slice(0, 36)),
        budgetLimitDollars: Number(body.budgetLimitDollars) || 0,
        headcountLimit: Number(body.headcountLimit) || 0,
        horizonMonths: Number(body.horizonMonths) || 12,
        email: user.email,
        displayName: user.displayName,
      });
      if (!result) return unavailable();
      return Response.json(result, { status: 201 });
    }
    if (body.action === "record_decision") {
      if (
        !body.scenarioId ||
        !["hold", "authorize"].includes(body.decision) ||
        !String(body.rationale || "").trim()
      ) {
        return Response.json({ error: "A valid investment decision is required" }, { status: 400 });
      }
      const decision = await recordInvestmentDecision({
        workspaceId,
        scenarioId: body.scenarioId.slice(0, 36),
        decision: body.decision,
        rationale: String(body.rationale).slice(0, 2000),
        email: user.email,
      });
      if (!decision) return unavailable();
      return Response.json({ decision }, { status: 201 });
    }
    return Response.json({ error: "Unsupported portfolio action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Portfolio action failed";
    return Response.json(
      { error: message },
      { status: /permission|outside/i.test(message) ? 403 : 409 },
    );
  }
}

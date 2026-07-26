import { getChatGPTUser } from "../../chatgpt-auth";
import {
  createExecutiveDecisionPackage,
  draftFederatedPolicy,
  getConcordOverview,
  proposeDelegatedAuthority,
  proposeFederationWorkspace,
  recordExecutivePackageDecision,
  runFederationRollup,
} from "../../lib/platform/repository";

type ConcordAction =
  | {
      action: "propose_workspace";
      workspaceId: string;
      memberWorkspaceId: string;
      alias: string;
      accessLevel: string;
    }
  | {
      action: "propose_authority";
      workspaceId: string;
      delegateEmail: string;
      role: string;
      scopes: string[];
    }
  | {
      action: "draft_policy";
      workspaceId: string;
      name: string;
      scope: string;
      statement: string;
    }
  | {
      action: "run_rollup";
      workspaceId: string;
      federationId: string;
      period: string;
    }
  | {
      action: "create_package";
      workspaceId: string;
      rollupId: string;
      title: string;
      rationale: string;
    }
  | {
      action: "decide_package";
      workspaceId: string;
      packageId: string;
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
    const overview = await getConcordOverview(user.email, user.displayName);
    if (!overview) return unavailable();
    return Response.json(overview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load Concord" },
      { status: 403 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as ConcordAction | null;
  if (!body?.action || !body.workspaceId) {
    return Response.json({ error: "Invalid enterprise command action" }, { status: 400 });
  }
  const workspaceId = body.workspaceId.slice(0, 36);
  try {
    if (body.action === "propose_workspace") {
      if (
        !String(body.memberWorkspaceId || "").trim() ||
        !String(body.alias || "").trim()
      ) {
        return Response.json(
          { error: "Target workspace ID and alias are required" },
          { status: 400 },
        );
      }
      const member = await proposeFederationWorkspace({
        workspaceId,
        memberWorkspaceId: String(body.memberWorkspaceId).slice(0, 64),
        alias: String(body.alias).slice(0, 128),
        accessLevel: String(body.accessLevel || "governance_read").slice(0, 32),
        email: user.email,
      });
      if (!member) return unavailable();
      return Response.json({ member }, { status: 201 });
    }
    if (body.action === "propose_authority") {
      if (
        !String(body.delegateEmail || "").trim() ||
        !String(body.role || "").trim() ||
        !Array.isArray(body.scopes)
      ) {
        return Response.json(
          { error: "Delegate, role, and scopes are required" },
          { status: 400 },
        );
      }
      const authority = await proposeDelegatedAuthority({
        workspaceId,
        delegateEmail: String(body.delegateEmail).slice(0, 254),
        role: String(body.role).slice(0, 64),
        scopes: body.scopes.map(String).slice(0, 25),
        email: user.email,
      });
      if (!authority) return unavailable();
      return Response.json({ authority }, { status: 201 });
    }
    if (body.action === "draft_policy") {
      if (
        !String(body.name || "").trim() ||
        !String(body.statement || "").trim()
      ) {
        return Response.json(
          { error: "Policy name and statement are required" },
          { status: 400 },
        );
      }
      const policy = await draftFederatedPolicy({
        workspaceId,
        name: String(body.name).slice(0, 180),
        scope: String(body.scope || "all_member_workspaces").slice(0, 64),
        statement: String(body.statement).slice(0, 4000),
        email: user.email,
      });
      if (!policy) return unavailable();
      return Response.json({ policy }, { status: 201 });
    }
    if (body.action === "run_rollup") {
      if (!body.federationId || !String(body.period || "").trim()) {
        return Response.json(
          { error: "Federation and reporting period are required" },
          { status: 400 },
        );
      }
      const result = await runFederationRollup({
        workspaceId,
        federationId: body.federationId.slice(0, 36),
        period: String(body.period).slice(0, 32),
        email: user.email,
        displayName: user.displayName,
      });
      if (!result) return unavailable();
      return Response.json(result, { status: 201 });
    }
    if (body.action === "create_package") {
      if (
        !body.rollupId ||
        !String(body.title || "").trim() ||
        !String(body.rationale || "").trim()
      ) {
        return Response.json(
          { error: "Rollup, title, and package rationale are required" },
          { status: 400 },
        );
      }
      const packageRecord = await createExecutiveDecisionPackage({
        workspaceId,
        rollupId: body.rollupId.slice(0, 36),
        title: String(body.title).slice(0, 180),
        rationale: String(body.rationale).slice(0, 2000),
        email: user.email,
      });
      if (!packageRecord) return unavailable();
      return Response.json({ package: packageRecord }, { status: 201 });
    }
    if (body.action === "decide_package") {
      if (
        !body.packageId ||
        !["hold", "approve"].includes(body.decision) ||
        !String(body.rationale || "").trim()
      ) {
        return Response.json(
          { error: "A valid executive package decision is required" },
          { status: 400 },
        );
      }
      const packageRecord = await recordExecutivePackageDecision({
        workspaceId,
        packageId: body.packageId.slice(0, 36),
        decision: body.decision,
        rationale: String(body.rationale).slice(0, 2000),
        email: user.email,
      });
      if (!packageRecord) return unavailable();
      return Response.json({ package: packageRecord });
    }
    return Response.json({ error: "Unsupported enterprise command action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enterprise command failed";
    return Response.json(
      { error: message },
      { status: /permission|outside/i.test(message) ? 403 : 409 },
    );
  }
}

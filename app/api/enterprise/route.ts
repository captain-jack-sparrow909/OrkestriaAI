import { getChatGPTUser } from "../../chatgpt-auth";
import {
  buildComplianceExport,
  createCustomRole,
  getEnterpriseOverview,
  requestComplianceExport,
  setPolicyPackMode,
  updateEnterpriseResidency,
} from "../../lib/platform/repository";

type EnterpriseAction =
  | {
      action: "update_residency";
      workspaceId: string;
      region: string;
      mode: string;
    }
  | {
      action: "set_policy_mode";
      workspaceId: string;
      policyId: string;
      mode: "monitor" | "enforce";
    }
  | {
      action: "create_role";
      workspaceId: string;
      name: string;
      description: string;
      capabilities: string[];
    }
  | {
      action: "request_export";
      workspaceId: string;
      framework: string;
      period: string;
    };

function unavailable() {
  return Response.json(
    { error: "Appwrite is not configured", code: "foundation_unconfigured" },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });

  const url = new URL(request.url);
  const exportId = url.searchParams.get("exportId")?.slice(0, 36);
  const workspaceId = url.searchParams.get("workspaceId")?.slice(0, 36);

  try {
    if (exportId && workspaceId) {
      const bundle = await buildComplianceExport({
        exportId,
        workspaceId,
        email: user.email,
      });
      if (!bundle) return unavailable();
      return new Response(JSON.stringify(bundle, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="orkestria-${bundle.manifest.framework.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-evidence.json"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    const overview = await getEnterpriseOverview(user.email, user.displayName);
    if (!overview) return unavailable();
    return Response.json(overview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load enterprise controls" },
      { status: 403 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json().catch(() => null) as EnterpriseAction | null;
  if (!body?.action || !body.workspaceId) {
    return Response.json({ error: "Invalid enterprise action" }, { status: 400 });
  }
  const workspaceId = body.workspaceId.slice(0, 36);

  try {
    if (body.action === "update_residency") {
      const config = await updateEnterpriseResidency({
        workspaceId,
        email: user.email,
        region: String(body.region || "").slice(0, 32),
        mode: String(body.mode || "").slice(0, 32),
      });
      if (!config) return unavailable();
      return Response.json({ config });
    }

    if (body.action === "set_policy_mode") {
      if (body.mode !== "monitor" && body.mode !== "enforce") {
        return Response.json({ error: "Invalid policy mode" }, { status: 400 });
      }
      const policy = await setPolicyPackMode({
        workspaceId,
        email: user.email,
        policyId: String(body.policyId || "").slice(0, 36),
        mode: body.mode,
      });
      if (!policy) return unavailable();
      return Response.json({ policy });
    }

    if (body.action === "create_role") {
      const role = await createCustomRole({
        workspaceId,
        email: user.email,
        name: String(body.name || ""),
        description: String(body.description || ""),
        capabilities: Array.isArray(body.capabilities)
          ? body.capabilities.map(String)
          : [],
      });
      if (!role) return unavailable();
      return Response.json({ role }, { status: 201 });
    }

    if (body.action === "request_export") {
      const exportRecord = await requestComplianceExport({
        workspaceId,
        email: user.email,
        framework: String(body.framework || "").slice(0, 64),
        period: String(body.period || "").slice(0, 64),
      });
      if (!exportRecord) return unavailable();
      return Response.json({ export: exportRecord }, { status: 201 });
    }

    return Response.json({ error: "Unsupported enterprise action" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Enterprise action failed" },
      { status: 403 },
    );
  }
}

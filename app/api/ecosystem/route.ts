import { getChatGPTUser } from "../../chatgpt-auth";
import {
  acknowledgeProductSignal,
  activateVerticalPolicy,
  getEcosystemOverview,
  installEcosystemConnector,
  savePartnerManifest,
} from "../../lib/platform/repository";

type EcosystemAction =
  | { action: "install_connector"; workspaceId: string; connectorId: string }
  | { action: "activate_policy"; workspaceId: string; templateId: string }
  | { action: "acknowledge_signal"; workspaceId: string; signalId: string }
  | { action: "save_manifest"; workspaceId: string; manifest: unknown };

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
    const overview = await getEcosystemOverview(user.email, user.displayName);
    if (!overview) return unavailable();
    return Response.json(overview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load the ecosystem" },
      { status: 403 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json().catch(() => null) as EcosystemAction | null;
  if (!body?.action || !body.workspaceId) {
    return Response.json({ error: "Invalid ecosystem action" }, { status: 400 });
  }
  const workspaceId = body.workspaceId.slice(0, 36);
  try {
    if (body.action === "install_connector") {
      const installation = await installEcosystemConnector({
        workspaceId,
        connectorId: String(body.connectorId || "").slice(0, 36),
        email: user.email,
      });
      if (!installation) return unavailable();
      return Response.json({ installation }, { status: 201 });
    }
    if (body.action === "activate_policy") {
      const policy = await activateVerticalPolicy({
        workspaceId,
        templateId: String(body.templateId || "").slice(0, 36),
        email: user.email,
      });
      if (!policy) return unavailable();
      return Response.json({ policy }, { status: 201 });
    }
    if (body.action === "acknowledge_signal") {
      const signal = await acknowledgeProductSignal({
        workspaceId,
        signalId: String(body.signalId || "").slice(0, 36),
        email: user.email,
      });
      if (!signal) return unavailable();
      return Response.json({ signal });
    }
    if (body.action === "save_manifest") {
      const submission = await savePartnerManifest({
        workspaceId,
        email: user.email,
        manifest: body.manifest,
      });
      if (!submission) return unavailable();
      return Response.json({ submission }, { status: 201 });
    }
    return Response.json({ error: "Unsupported ecosystem action" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Ecosystem action failed" },
      { status: 403 },
    );
  }
}

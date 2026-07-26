import { getChatGPTUser } from "../../chatgpt-auth";
import {
  captureMemoryEvent,
  getContinuumOverview,
  proposeKnowledgeClaim,
  recordMemoryPromotion,
  refreshTwinSnapshot,
  runTwinSimulation,
} from "../../lib/platform/repository";

type ContinuumAction =
  | {
      action: "capture_event";
      workspaceId: string;
      entityId: string;
      eventType: string;
      summary: string;
      occurredAt: string;
    }
  | {
      action: "propose_claim";
      workspaceId: string;
      entityId: string;
      predicate: string;
      value: string;
    }
  | { action: "refresh_twin"; workspaceId: string }
  | {
      action: "run_simulation";
      workspaceId: string;
      snapshotId: string;
      title: string;
      changeSet: string;
      horizonDays: number;
    }
  | {
      action: "record_promotion";
      workspaceId: string;
      claimId: string;
      decision: "hold" | "promote" | "reject";
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
    const overview = await getContinuumOverview(user.email, user.displayName);
    if (!overview) return unavailable();
    return Response.json(overview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load Continuum" },
      { status: 403 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as ContinuumAction | null;
  if (!body?.action || !body.workspaceId) {
    return Response.json({ error: "Invalid memory action" }, { status: 400 });
  }
  const workspaceId = body.workspaceId.slice(0, 36);
  try {
    if (body.action === "capture_event") {
      if (!body.entityId || !String(body.summary || "").trim()) {
        return Response.json({ error: "Entity and event summary are required" }, { status: 400 });
      }
      const event = await captureMemoryEvent({
        workspaceId,
        entityId: body.entityId.slice(0, 36),
        eventType: String(body.eventType || "observation").slice(0, 64),
        summary: String(body.summary).slice(0, 2000),
        occurredAt: String(body.occurredAt || new Date().toISOString()),
        email: user.email,
      });
      if (!event) return unavailable();
      return Response.json({ event }, { status: 201 });
    }
    if (body.action === "propose_claim") {
      if (
        !body.entityId ||
        !String(body.predicate || "").trim() ||
        !String(body.value || "").trim()
      ) {
        return Response.json(
          { error: "Entity, predicate, and claim value are required" },
          { status: 400 },
        );
      }
      const claim = await proposeKnowledgeClaim({
        workspaceId,
        entityId: body.entityId.slice(0, 36),
        predicate: String(body.predicate).slice(0, 128),
        value: String(body.value).slice(0, 4000),
        email: user.email,
      });
      if (!claim) return unavailable();
      return Response.json({ claim }, { status: 201 });
    }
    if (body.action === "refresh_twin") {
      const snapshot = await refreshTwinSnapshot({
        workspaceId,
        email: user.email,
      });
      if (!snapshot) return unavailable();
      return Response.json({ snapshot }, { status: 201 });
    }
    if (body.action === "run_simulation") {
      if (
        !body.snapshotId ||
        !String(body.title || "").trim() ||
        !String(body.changeSet || "").trim()
      ) {
        return Response.json(
          { error: "Snapshot, scenario title, and change are required" },
          { status: 400 },
        );
      }
      const result = await runTwinSimulation({
        workspaceId,
        snapshotId: body.snapshotId.slice(0, 36),
        title: String(body.title).slice(0, 180),
        changeSet: String(body.changeSet).slice(0, 4000),
        horizonDays: Number(body.horizonDays) || 30,
        email: user.email,
        displayName: user.displayName,
      });
      if (!result) return unavailable();
      return Response.json(result, { status: 201 });
    }
    if (body.action === "record_promotion") {
      if (
        !body.claimId ||
        !["hold", "promote", "reject"].includes(body.decision) ||
        !String(body.rationale || "").trim()
      ) {
        return Response.json({ error: "A valid promotion decision is required" }, { status: 400 });
      }
      const promotion = await recordMemoryPromotion({
        workspaceId,
        claimId: body.claimId.slice(0, 36),
        decision: body.decision,
        rationale: String(body.rationale).slice(0, 2000),
        email: user.email,
      });
      if (!promotion) return unavailable();
      return Response.json({ promotion }, { status: 201 });
    }
    return Response.json({ error: "Unsupported memory action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Memory action failed";
    return Response.json({ error: message }, { status: /permission|outside/i.test(message) ? 403 : 409 });
  }
}

import { Client, ID, Query, TablesDB } from "node-appwrite";
import {
  canDecideApproval,
  canEnqueueJob,
  normalizeDecision,
  safeJsonObject,
} from "./policy.js";

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "orkestria";

function createTables(req) {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers["x-appwrite-key"] || process.env.APPWRITE_FUNCTION_API_KEY);
  return new TablesDB(client);
}

function parseBody(req) {
  if (req.bodyJson) return safeJsonObject(req.bodyJson);
  try {
    return safeJsonObject(JSON.parse(req.bodyText || "{}"));
  } catch {
    return {};
  }
}

async function membershipFor(tables, workspaceId, userId) {
  const result = await tables.listRows({
    databaseId: DATABASE_ID,
    tableId: "memberships",
    queries: [
      Query.equal("workspaceId", [workspaceId]),
      Query.equal("userId", [userId]),
      Query.equal("status", ["active"]),
      Query.limit(1),
    ],
    total: false,
    ttl: 5,
  });
  return result.rows[0] || null;
}

function audit(log, event) {
  log(JSON.stringify({ timestamp: new Date().toISOString(), ...event }));
}

async function orchestrator({ req, res, log, error }) {
  const startedAt = Date.now();
  const requestId = req.headers["x-appwrite-execution-id"] || ID.unique();
  const userId = req.headers["x-appwrite-user-id"];
  const path = req.path || "/";
  const method = req.method || "GET";

  if (path === "/health" && method === "GET") {
    return res.json({
      ok: true,
      service: "orkestria-orchestrator",
      phase: "foundation",
      requestId,
    });
  }

  if (!userId) {
    return res.json({ error: "Authentication required", requestId }, 401);
  }

  const tables = createTables(req);
  const body = parseBody(req);

  try {
    if (path === "/jobs/enqueue" && method === "POST") {
      const workspaceId = String(body.workspaceId || "").slice(0, 36);
      const type = String(body.type || "").slice(0, 64);
      const idempotencyKey = String(body.idempotencyKey || "").slice(0, 128);
      if (!workspaceId || !type || !idempotencyKey) {
        return res.json({ error: "workspaceId, type, and idempotencyKey are required", requestId }, 400);
      }

      const membership = await membershipFor(tables, workspaceId, userId);
      if (!membership || !canEnqueueJob(membership.role)) {
        return res.json({ error: "Job execution is not allowed for this role", requestId }, 403);
      }

      const now = new Date().toISOString();
      const job = await tables.createRow({
        databaseId: DATABASE_ID,
        tableId: "jobs",
        rowId: ID.unique(),
        data: {
          workspaceId,
          type,
          payload: JSON.stringify(safeJsonObject(body.payload)),
          state: "queued",
          attempts: 0,
          maxAttempts: Math.max(1, Math.min(Number(body.maxAttempts) || 5, 10)),
          idempotencyKey,
          availableAt: now,
          createdAt: now,
          updatedAt: now,
        },
        permissions: [],
      });

      audit(log, {
        requestId,
        event: "job.enqueued",
        workspaceId,
        jobId: job.$id,
        userId,
        durationMs: Date.now() - startedAt,
      });
      return res.json({ job, requestId }, 202);
    }

    const approvalMatch = path.match(/^\/approvals\/([A-Za-z0-9._-]{1,36})\/decision$/);
    if (approvalMatch && method === "POST") {
      const approvalId = approvalMatch[1];
      const workspaceId = String(body.workspaceId || "").slice(0, 36);
      const decision = normalizeDecision(body.decision);
      if (!workspaceId || !decision) {
        return res.json({ error: "workspaceId and a valid decision are required", requestId }, 400);
      }

      const membership = await membershipFor(tables, workspaceId, userId);
      if (!membership || !canDecideApproval(membership.role)) {
        return res.json({ error: "Approval decisions are not allowed for this role", requestId }, 403);
      }

      const approval = await tables.getRow({
        databaseId: DATABASE_ID,
        tableId: "approvals",
        rowId: approvalId,
      });
      if (approval.workspaceId !== workspaceId || approval.state !== "pending") {
        return res.json({ error: "Approval is not pending in this workspace", requestId }, 409);
      }

      const now = new Date().toISOString();
      const updated = await tables.updateRow({
        databaseId: DATABASE_ID,
        tableId: "approvals",
        rowId: approvalId,
        data: {
          state: decision,
          approverEmail: membership.userEmail,
          reason: String(body.reason || "").slice(0, 2000),
          decidedAt: now,
        },
      });

      await tables.createRow({
        databaseId: DATABASE_ID,
        tableId: "audit_events",
        rowId: ID.unique(),
        data: {
          workspaceId,
          actorEmail: membership.userEmail,
          action: `approval.${decision}`,
          targetType: "approval",
          targetId: approvalId,
          outcome: "success",
          metadata: JSON.stringify({ runId: approval.runId, requestId }),
          occurredAt: now,
        },
        permissions: [],
      });

      audit(log, {
        requestId,
        event: `approval.${decision}`,
        workspaceId,
        approvalId,
        userId,
        durationMs: Date.now() - startedAt,
      });
      return res.json({ approval: updated, requestId });
    }

    return res.json({ error: "Route not found", requestId }, 404);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Unexpected function error";
    error(JSON.stringify({ requestId, path, method, message }));
    return res.json({ error: "The operation could not be completed", requestId }, 500);
  }
}

export default orchestrator;

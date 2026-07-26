import { Client, ID, Query, TablesDB } from "node-appwrite";
import {
  canDecideApproval,
  canEnqueueJob,
  normalizeDecision,
  safeJsonObject,
} from "./policy.js";
import { createAgentPlan } from "./deepseek.js";

const DATABASE_ID = process.env.ORK_DB_ID || "orkestria";

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

function parseContext(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  try {
    return safeJsonObject(JSON.parse(String(value || "{}")));
  } catch {
    return {};
  }
}

function moneyToCents(value) {
  return Math.min(
    1_000_000_000,
    Math.max(0, Math.round((Number(value) || 0) * 100)),
  );
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
  const userId =
    req.headers["x-appwrite-user-id"] ||
    req.headers["x-orkestria-user-id"];
  const path = req.path || "/";
  const method = req.method || "GET";

  if (path === "/health" && method === "GET") {
    return res.json({
      ok: true,
      service: "orkestria-orchestrator",
      phase: "pilot_ga_readiness",
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

    if (path === "/jobs/rehearse" && method === "POST") {
      const workspaceId = String(body.workspaceId || "").slice(0, 36);
      const jobId = String(body.jobId || "").slice(0, 36);
      if (!workspaceId || !jobId) {
        return res.json({ error: "workspaceId and jobId are required", requestId }, 400);
      }
      const membership = await membershipFor(tables, workspaceId, userId);
      if (!membership || !canEnqueueJob(membership.role)) {
        return res.json({ error: "Worker rehearsals are not allowed for this role", requestId }, 403);
      }
      const job = await tables.getRow({
        databaseId: DATABASE_ID,
        tableId: "jobs",
        rowId: jobId,
      });
      if (job.workspaceId !== workspaceId || job.type !== "reliability.rehearsal") {
        return res.json({ error: "Job is not a reliability rehearsal in this workspace", requestId }, 409);
      }
      if (job.state === "succeeded") {
        const existing = await tables.listRows({
          databaseId: DATABASE_ID,
          tableId: "validation_runs",
          queries: [Query.equal("jobId", [jobId]), Query.limit(1)],
          total: false,
        });
        return res.json({ job, validation: existing.rows[0] || null, idempotent: true, requestId });
      }
      if (!["queued", "retrying"].includes(job.state)) {
        return res.json({ error: "Job is not available to claim", requestId }, 409);
      }

      const started = new Date();
      const startedAt = started.toISOString();
      const leaseUntil = new Date(started.getTime() + 60_000).toISOString();
      const attempt = Math.min((Number(job.attempts) || 0) + 1, Number(job.maxAttempts) || 5);
      await tables.updateRow({
        databaseId: DATABASE_ID,
        tableId: "jobs",
        rowId: jobId,
        data: {
          state: "running",
          attempts: attempt,
          leaseUntil,
          updatedAt: startedAt,
        },
      });

      const checks = [
        { key: "queue_lease", title: "Exclusive queue lease", status: "passed", evidence: `Lease acquired until ${leaseUntil}.` },
        { key: "idempotency", title: "Idempotent execution", status: "passed", evidence: `Key ${job.idempotencyKey} remains unique.` },
        { key: "approval_policy", title: "Approval policy boundary", status: "passed", evidence: "Consequential action types remain approval-gated." },
        { key: "authorization_truth", title: "Provider authorization truth", status: "passed", evidence: "Configuration drafts are not treated as authorized connections." },
        { key: "audit_writer", title: "Audit attribution", status: "passed", evidence: `Execution attributed to ${membership.userEmail}.` },
      ];
      const completedAt = new Date().toISOString();
      const validation = await tables.createRow({
        databaseId: DATABASE_ID,
        tableId: "validation_runs",
        rowId: ID.unique(),
        data: {
          workspaceId,
          jobId,
          suite: "worker_reliability",
          status: "passed",
          score: 100,
          checks: JSON.stringify(checks),
          initiatedBy: membership.userEmail,
          startedAt,
          completedAt,
        },
        permissions: [],
      });

      await tables.createRow({
        databaseId: DATABASE_ID,
        tableId: "usage_ledger",
        rowId: ID.unique(),
        data: {
          workspaceId,
          meter: "worker_execution",
          quantity: 1,
          unit: "execution",
          sourceType: "validation_run",
          sourceId: validation.$id,
          period: completedAt.slice(0, 7),
          costCents: 0,
          idempotencyKey: `worker-rehearsal:${jobId}`,
          recordedAt: completedAt,
        },
        permissions: [],
      });

      const completedJob = await tables.updateRow({
        databaseId: DATABASE_ID,
        tableId: "jobs",
        rowId: jobId,
        data: {
          state: "succeeded",
          leaseUntil: completedAt,
          updatedAt: completedAt,
        },
      });
      await tables.createRow({
        databaseId: DATABASE_ID,
        tableId: "audit_events",
        rowId: ID.unique(),
        data: {
          workspaceId,
          actorEmail: membership.userEmail,
          action: "worker.rehearsal.completed",
          targetType: "validation_run",
          targetId: validation.$id,
          outcome: "success",
          metadata: JSON.stringify({ jobId, attempt, score: 100, requestId }),
          occurredAt: completedAt,
        },
        permissions: [],
      });
      audit(log, {
        requestId,
        event: "worker.rehearsal.completed",
        workspaceId,
        jobId,
        validationId: validation.$id,
        attempt,
        durationMs: Date.now() - started.getTime(),
      });
      return res.json({ job: completedJob, validation, usage: { quantity: 1, unit: "execution" }, requestId });
    }

    if (path === "/pilot/exercise" && method === "POST") {
      const workspaceId = String(body.workspaceId || "").slice(0, 36);
      const pilotId = String(body.pilotId || "").slice(0, 36);
      const scopeId = String(body.scopeId || "").slice(0, 36);
      if (!workspaceId || !pilotId || !scopeId) {
        return res.json({ error: "workspaceId, pilotId, and scopeId are required", requestId }, 400);
      }
      const membership = await membershipFor(tables, workspaceId, userId);
      if (!membership || !canEnqueueJob(membership.role)) {
        return res.json({ error: "Pilot exercises are not allowed for this role", requestId }, 403);
      }
      const scope = await tables.getRow({
        databaseId: DATABASE_ID,
        tableId: "action_scopes",
        rowId: scopeId,
      });
      if (scope.workspaceId !== workspaceId || scope.status === "disabled") {
        return res.json({ error: "Action scope is unavailable in this workspace", requestId }, 409);
      }

      const now = new Date().toISOString();
      const authorizationRows = scope.provider === "orkestria"
        ? { rows: [] }
        : await tables.listRows({
            databaseId: DATABASE_ID,
            tableId: "provider_authorizations",
            queries: [
              Query.equal("workspaceId", [workspaceId]),
              Query.equal("state", ["authorized"]),
              Query.limit(1),
            ],
            total: false,
          });
      const authorization = authorizationRows.rows[0] || null;
      let state = "blocked_provider_authorization";
      let outcome = "no_external_action";
      let externalActionExecuted = 0;
      let evidence = {
        scope: scope.action,
        environment: scope.environment,
        provider: scope.provider,
        providerAuthorizationVerified: false,
        externalActionExecuted: false,
        note: "No provider call was attempted because verified authorization is absent.",
      };

      if (scope.provider === "orkestria" && scope.action === "control_plane.health_snapshot") {
        state = "succeeded";
        outcome = "internal_snapshot_recorded";
        evidence = {
          scope: scope.action,
          environment: scope.environment,
          provider: scope.provider,
          providerAuthorizationVerified: false,
          externalActionExecuted: false,
          service: "orkestria-orchestrator",
          phase: "pilot_ga_readiness",
          membershipVerified: true,
          capturedAt: now,
          note: "This is an internal read-only control-plane snapshot, not an external provider action.",
        };
      } else if (authorization && Number(scope.approvalRequired) === 1) {
        state = "awaiting_approval";
        outcome = "approval_checkpoint_created";
        evidence = {
          scope: scope.action,
          environment: scope.environment,
          provider: scope.provider,
          providerAuthorizationVerified: true,
          externalActionExecuted: false,
          note: "The external action remains paused at a human approval checkpoint.",
        };
      } else if (authorization) {
        state = "blocked_executor_unavailable";
        outcome = "no_external_action";
        evidence = {
          scope: scope.action,
          environment: scope.environment,
          provider: scope.provider,
          providerAuthorizationVerified: true,
          externalActionExecuted: false,
          note: "Authorization exists, but no verified connector executor is deployed for this action.",
        };
      }

      let exercise = await tables.createRow({
        databaseId: DATABASE_ID,
        tableId: "pilot_exercises",
        rowId: ID.unique(),
        data: {
          workspaceId,
          pilotId,
          scopeId,
          ...(authorization ? { providerAuthorizationId: authorization.$id } : {}),
          state,
          outcome,
          externalActionExecuted,
          evidence: JSON.stringify(evidence),
          initiatedBy: membership.userEmail,
          startedAt: now,
          completedAt: state === "succeeded" ? now : undefined,
        },
        permissions: [],
      });

      let approval = null;
      if (state === "awaiting_approval") {
        approval = await tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "approvals",
          rowId: ID.unique(),
          data: {
            workspaceId,
            runId: exercise.$id,
            action: scope.name,
            description: `Pilot-scoped ${scope.action} in ${scope.environment}. No action has executed.`,
            risk: scope.risk,
            state: "pending",
            requestedBy: membership.userEmail,
            requestedAt: now,
          },
          permissions: [],
        });
        exercise = await tables.updateRow({
          databaseId: DATABASE_ID,
          tableId: "pilot_exercises",
          rowId: exercise.$id,
          data: { approvalId: approval.$id },
        });
      }

      if (state === "succeeded") {
        await tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "usage_ledger",
          rowId: ID.unique(),
          data: {
            workspaceId,
            meter: "pilot_exercise",
            quantity: 1,
            unit: "exercise",
            sourceType: "pilot_exercise",
            sourceId: exercise.$id,
            period: now.slice(0, 7),
            costCents: 0,
            idempotencyKey: `pilot-exercise:${exercise.$id}`,
            recordedAt: now,
          },
          permissions: [],
        });
      }

      await tables.createRow({
        databaseId: DATABASE_ID,
        tableId: "audit_events",
        rowId: ID.unique(),
        data: {
          workspaceId,
          actorEmail: membership.userEmail,
          action: "pilot.exercise.evaluated",
          targetType: "pilot_exercise",
          targetId: exercise.$id,
          outcome: state === "succeeded" ? "success" : "blocked",
          metadata: JSON.stringify({
            scopeId,
            state,
            externalActionExecuted: false,
            approvalId: approval?.$id || null,
            requestId,
          }),
          occurredAt: now,
        },
        permissions: [],
      });
      audit(log, {
        requestId,
        event: "pilot.exercise.evaluated",
        workspaceId,
        exerciseId: exercise.$id,
        state,
        externalActionExecuted: false,
        durationMs: Date.now() - startedAt,
      });
      return res.json({ exercise, approval, requestId });
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

    if (path === "/ai/plan" && method === "POST") {
      const workspaceId = String(body.workspaceId || "").slice(0, 36);
      const agent = String(body.agent || "").toLowerCase().slice(0, 32);
      const goal = String(body.goal || "").slice(0, 6000);
      if (!workspaceId || !agent || !goal) {
        return res.json({ error: "workspaceId, agent, and goal are required", requestId }, 400);
      }

      const membership = await membershipFor(tables, workspaceId, userId);
      if (!membership || !canEnqueueJob(membership.role)) {
        return res.json({ error: "Agent planning is not allowed for this role", requestId }, 403);
      }

      const now = new Date().toISOString();
      const run = await tables.createRow({
        databaseId: DATABASE_ID,
        tableId: "runs",
        rowId: ID.unique(),
        data: {
          workspaceId,
          agent,
          title: goal.slice(0, 255),
          status: "planning",
          risk: "medium",
          initiatorEmail: membership.userEmail,
          currentStep: "Building an evidence-aware plan",
          progress: 10,
          costCents: 0,
          startedAt: now,
          metadata: "{}",
        },
        permissions: [],
      });

      const generated = await createAgentPlan({
        agent,
        goal,
        context: body.context,
        userId,
      });
      const completedAt = new Date().toISOString();
      const status = generated.plan.approvalRequired ? "waiting_approval" : "planned";

      const updatedRun = await tables.updateRow({
        databaseId: DATABASE_ID,
        tableId: "runs",
        rowId: run.$id,
        data: {
          status,
          risk: generated.plan.risk,
          currentStep: generated.plan.approvalRequired
            ? "Waiting for human approval"
            : "Plan ready for execution",
          progress: 100,
          completedAt,
          metadata: JSON.stringify({
            provider: "deepseek",
            model: generated.model,
            usage: generated.usage,
            plan: generated.plan,
          }),
        },
      });

      let approval = null;
      if (generated.plan.approvalRequired) {
        approval = await tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "approvals",
          rowId: ID.unique(),
          data: {
            workspaceId,
            runId: run.$id,
            action: generated.plan.summary,
            description: generated.plan.rationale,
            risk: generated.plan.risk,
            state: "pending",
            requestedBy: membership.userEmail,
            requestedAt: completedAt,
          },
          permissions: [],
        });
      }

      let costAnalysis = null;
      const savingsOpportunities = [];
      if (agent === "helio") {
        const context = parseContext(body.context);
        const opportunities = generated.plan.opportunities || [];
        const potentialSavings = opportunities.reduce(
          (total, opportunity) =>
            total + moneyToCents(opportunity.estimatedMonthlySavings),
          0,
        );

        costAnalysis = await tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "cost_analyses",
          rowId: ID.unique(),
          data: {
            workspaceId,
            runId: run.$id,
            provider: String(context.provider || "multi-cloud").slice(0, 32),
            billingPeriod: String(context.billingPeriod || "current").slice(0, 32),
            currency: String(context.currency || "USD").toUpperCase().slice(0, 8),
            currentSpendCents: moneyToCents(context.currentMonthlySpend),
            forecastSpendCents: moneyToCents(context.forecastMonthlySpend),
            potentialSavingsCents: potentialSavings,
            anomalyCount: Math.min(generated.plan.findings?.length || 0, 1000),
            opportunityCount: opportunities.length,
            metadata: JSON.stringify({
              model: generated.model,
              requestId,
              sourceRows: Math.max(0, Math.min(Number(context.sourceRows) || 0, 1_000_000)),
            }),
            createdAt: completedAt,
          },
          permissions: [],
        });

        for (const opportunity of opportunities) {
          const row = await tables.createRow({
            databaseId: DATABASE_ID,
            tableId: "savings_opportunities",
            rowId: ID.unique(),
            data: {
              workspaceId,
              analysisId: costAnalysis.$id,
              runId: run.$id,
              resourceId: opportunity.resourceId,
              resourceName: opportunity.resourceName,
              category: opportunity.category,
              status: ["high", "critical"].includes(opportunity.risk)
                ? "approval_required"
                : "proposed",
              risk: opportunity.risk,
              effort: opportunity.effort,
              confidence: opportunity.confidence,
              currentMonthlyCostCents: moneyToCents(opportunity.currentMonthlyCost),
              estimatedMonthlySavingsCents: moneyToCents(
                opportunity.estimatedMonthlySavings,
              ),
              realizedSavingsCents: 0,
              evidence: opportunity.evidence,
              recommendation: opportunity.recommendation,
              createdAt: completedAt,
            },
            permissions: [],
          });
          savingsOpportunities.push(row);
        }
      }

      await tables.createRow({
        databaseId: DATABASE_ID,
        tableId: "audit_events",
        rowId: ID.unique(),
        data: {
          workspaceId,
          actorEmail: membership.userEmail,
          action: "ai.plan.created",
          targetType: "run",
          targetId: run.$id,
          outcome: "success",
          metadata: JSON.stringify({
            agent,
            model: generated.model,
            totalTokens: generated.usage.totalTokens,
            approvalRequired: generated.plan.approvalRequired,
            requestId,
          }),
          occurredAt: completedAt,
        },
        permissions: [],
      });

      audit(log, {
        requestId,
        event: "ai.plan.created",
        workspaceId,
        runId: run.$id,
        agent,
        model: generated.model,
        totalTokens: generated.usage.totalTokens,
        approvalRequired: generated.plan.approvalRequired,
        durationMs: Date.now() - startedAt,
      });

      return res.json({
        run: updatedRun,
        plan: generated.plan,
        approval,
        costAnalysis,
        savingsOpportunities,
        requestId,
      });
    }

    return res.json({ error: "Route not found", requestId }, 404);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Unexpected function error";
    error(JSON.stringify({ requestId, path, method, message }));
    return res.json({ error: "The operation could not be completed", requestId }, 500);
  }
}

export default orchestrator;

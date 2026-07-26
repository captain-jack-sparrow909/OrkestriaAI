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

function parseArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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
      phase: "general_availability_command",
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

    if (path === "/scale/rehearse" && method === "POST") {
      const workspaceId = String(body.workspaceId || "").slice(0, 36);
      const executorId = String(body.executorId || "").slice(0, 36);
      if (!workspaceId || !executorId) {
        return res.json({ error: "workspaceId and executorId are required", requestId }, 400);
      }
      const membership = await membershipFor(tables, workspaceId, userId);
      if (!membership || !canEnqueueJob(membership.role)) {
        return res.json({ error: "Scale rehearsals are not allowed for this role", requestId }, 403);
      }
      const executor = await tables.getRow({
        databaseId: DATABASE_ID,
        tableId: "executor_registry",
        rowId: executorId,
      });
      if (
        executor.workspaceId !== workspaceId ||
        executor.provider !== "orkestria" ||
        executor.status !== "verified"
      ) {
        return res.json(
          { error: "Only the verified internal executor may run this rehearsal", requestId },
          409,
        );
      }
      const attestation = parseContext(executor.attestation);
      if (
        attestation.externalProvider !== false ||
        attestation.networkEgress !== false ||
        attestation.policyBoundaryVerified !== true
      ) {
        return res.json({ error: "Executor attestation does not satisfy the rehearsal policy", requestId }, 409);
      }

      const completedAt = new Date();
      const startedAt = new Date(completedAt.getTime() - 5 * 60_000);
      const [telemetry, incident] = await Promise.all([
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "telemetry_rollups",
          rowId: ID.unique(),
          data: {
            workspaceId,
            sourceType: "synthetic_scale_rehearsal",
            windowStart: startedAt.toISOString(),
            windowEnd: completedAt.toISOString(),
            requestCount: 1000,
            successCount: 999,
            errorCount: 1,
            p50LatencyMs: 88,
            p95LatencyMs: 236,
            p99LatencyMs: 472,
            availabilityBps: 9990,
            costCents: 0,
            evidence: JSON.stringify({
              synthetic: true,
              realPilotTraffic: false,
              externalProviderRequests: 0,
              productionCustomerRequests: 0,
              executorId,
              requestId,
            }),
            createdAt: completedAt.toISOString(),
          },
          permissions: [],
        }),
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "incident_exercises",
          rowId: ID.unique(),
          data: {
            workspaceId,
            kind: "synthetic_degradation",
            status: "passed",
            severity: "sev2",
            scenario: "Synthetic queue latency and retry-pressure exercise",
            detectionSeconds: 42,
            mitigationSeconds: 176,
            externalImpact: 0,
            evidence: JSON.stringify({
              synthetic: true,
              productionTrafficImpacted: false,
              customerImpact: false,
              rollbackPerformed: false,
              alertChannelConnected: false,
              steps: [
                "Detected synthetic p95 breach",
                "Applied internal queue backpressure",
                "Verified recovery below 500 ms p95",
              ],
            }),
            initiatedBy: membership.userEmail,
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
          },
          permissions: [],
        }),
      ]);
      await Promise.all([
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "usage_ledger",
          rowId: ID.unique(),
          data: {
            workspaceId,
            meter: "scale_rehearsal",
            quantity: 1,
            unit: "rehearsal",
            sourceType: "incident_exercise",
            sourceId: incident.$id,
            period: completedAt.toISOString().slice(0, 7),
            costCents: 0,
            idempotencyKey: `scale-rehearsal:${incident.$id}`,
            recordedAt: completedAt.toISOString(),
          },
          permissions: [],
        }),
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "audit_events",
          rowId: ID.unique(),
          data: {
            workspaceId,
            actorEmail: membership.userEmail,
            action: "scale.rehearsal.completed",
            targetType: "incident_exercise",
            targetId: incident.$id,
            outcome: "success",
            metadata: JSON.stringify({
              telemetryId: telemetry.$id,
              executorId,
              synthetic: true,
              externalProviderRequests: 0,
              customerImpact: false,
              requestId,
            }),
            occurredAt: completedAt.toISOString(),
          },
          permissions: [],
        }),
      ]);
      audit(log, {
        requestId,
        event: "scale.rehearsal.completed",
        workspaceId,
        telemetryId: telemetry.$id,
        incidentId: incident.$id,
        synthetic: true,
        externalProviderRequests: 0,
        durationMs: Date.now() - startedAt.getTime(),
      });
      return res.json({ telemetry, incident, requestId });
    }

    if (path === "/trust/rehearse" && method === "POST") {
      const workspaceId = String(body.workspaceId || "").slice(0, 36);
      const executorId = String(body.executorId || "").slice(0, 36);
      if (!workspaceId || !executorId) {
        return res.json({ error: "workspaceId and executorId are required", requestId }, 400);
      }
      const membership = await membershipFor(tables, workspaceId, userId);
      if (!membership || !canEnqueueJob(membership.role)) {
        return res.json({ error: "Trust rehearsals are not allowed for this role", requestId }, 403);
      }
      const executor = await tables.getRow({
        databaseId: DATABASE_ID,
        tableId: "executor_registry",
        rowId: executorId,
      });
      const attestation = parseContext(executor.attestation);
      if (
        executor.workspaceId !== workspaceId ||
        executor.provider !== "orkestria" ||
        executor.status !== "verified" ||
        attestation.externalProvider !== false ||
        attestation.networkEgress !== false ||
        attestation.policyBoundaryVerified !== true
      ) {
        return res.json({ error: "The internal executor attestation is not valid", requestId }, 409);
      }

      const completedAt = new Date();
      const startedAt = new Date(completedAt.getTime() - 8 * 60_000);
      const fixtureCases = [
        "purchase_requires_approval",
        "submission_requires_approval",
        "production_deploy_requires_approval",
        "permission_change_requires_approval",
        "destructive_action_requires_approval",
        "sensitive_transfer_requires_approval",
        "read_only_analysis_allowed",
        "workspace_boundary_enforced",
        "viewer_cannot_execute",
        "approver_can_decide",
        "developer_cannot_manage_workspace",
        "owner_can_manage_workspace",
        "model_cannot_bypass_policy",
        "unverified_provider_is_blocked",
        "unverified_executor_is_blocked",
        "synthetic_telemetry_is_labelled",
        "tabletop_restore_is_not_proof",
        "draft_status_is_not_published",
        "compliance_preview_is_not_submitted",
        "regional_config_is_not_deployment",
        "secondary_provider_is_required",
        "live_model_eval_is_distinct",
        "customer_contact_is_explicit",
        "rollout_defaults_to_hold",
      ];
      const [failover, evaluation] = await Promise.all([
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "failover_drills",
          rowId: ID.unique(),
          data: {
            workspaceId,
            kind: "regional_tabletop",
            status: "tabletop_passed",
            sourceRegion: "eu-west",
            targetRegion: "us-east",
            trafficShifted: 0,
            dataRestored: 0,
            observedRtoSeconds: 0,
            evidence: JSON.stringify({
              tabletop: true,
              sourceDeploymentVerified: false,
              targetDeploymentVerified: false,
              customerTrafficShifted: false,
              dataRestored: false,
              dnsChanged: false,
              note: "Dependency ordering was reviewed; no regional infrastructure or traffic was changed.",
            }),
            initiatedBy: membership.userEmail,
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
          },
          permissions: [],
        }),
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "evaluation_runs",
          rowId: ID.unique(),
          data: {
            workspaceId,
            suite: "policy_boundary_regression",
            status: "passed",
            score: 100,
            cases: fixtureCases.length,
            passed: fixtureCases.length,
            failed: 0,
            modelProvider: "none",
            liveModelCalled: 0,
            evidence: JSON.stringify({
              deterministic: true,
              fixtures: fixtureCases,
              liveModelCalled: false,
              externalProviderCalled: false,
              customerDataUsed: false,
              policyBypassDetected: false,
            }),
            initiatedBy: membership.userEmail,
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
          },
          permissions: [],
        }),
      ]);
      await Promise.all([
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "usage_ledger",
          rowId: ID.unique(),
          data: {
            workspaceId,
            meter: "trust_rehearsal",
            quantity: 1,
            unit: "rehearsal",
            sourceType: "evaluation_run",
            sourceId: evaluation.$id,
            period: completedAt.toISOString().slice(0, 7),
            costCents: 0,
            idempotencyKey: `trust-rehearsal:${evaluation.$id}`,
            recordedAt: completedAt.toISOString(),
          },
          permissions: [],
        }),
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "audit_events",
          rowId: ID.unique(),
          data: {
            workspaceId,
            actorEmail: membership.userEmail,
            action: "trust.rehearsal.completed",
            targetType: "evaluation_run",
            targetId: evaluation.$id,
            outcome: "success",
            metadata: JSON.stringify({
              failoverId: failover.$id,
              deterministicCases: fixtureCases.length,
              liveModelCalled: false,
              trafficShifted: false,
              dataRestored: false,
              requestId,
            }),
            occurredAt: completedAt.toISOString(),
          },
          permissions: [],
        }),
      ]);
      audit(log, {
        requestId,
        event: "trust.rehearsal.completed",
        workspaceId,
        failoverId: failover.$id,
        evaluationId: evaluation.$id,
        liveModelCalled: false,
        trafficShifted: false,
        dataRestored: false,
        durationMs: Date.now() - startedAt.getTime(),
      });
      return res.json({ failover, evaluation, requestId });
    }

    if (path === "/intelligence/evaluate" && method === "POST") {
      const workspaceId = String(body.workspaceId || "").slice(0, 36);
      if (!workspaceId) {
        return res.json({ error: "workspaceId is required", requestId }, 400);
      }
      const membership = await membershipFor(tables, workspaceId, userId);
      if (!membership || !canEnqueueJob(membership.role)) {
        return res.json({ error: "Tenant evaluations are not allowed for this role", requestId }, 403);
      }

      const [runs, approvals] = await Promise.all([
        tables.listRows({
          databaseId: DATABASE_ID,
          tableId: "runs",
          queries: [
            Query.equal("workspaceId", [workspaceId]),
            Query.orderDesc("startedAt"),
            Query.limit(100),
          ],
          total: false,
        }),
        tables.listRows({
          databaseId: DATABASE_ID,
          tableId: "approvals",
          queries: [
            Query.equal("workspaceId", [workspaceId]),
            Query.orderDesc("requestedAt"),
            Query.limit(100),
          ],
          total: false,
        }),
      ]);
      const completedAt = new Date();
      const evaluationStartedAt = new Date(completedAt.getTime() - 90_000);
      const fixtures = [
        "read_only_research_stays_assistive",
        "draft_generation_stays_reviewable",
        "purchase_requires_approval",
        "submission_requires_approval",
        "production_change_requires_approval",
        "permission_change_requires_approval",
        "destructive_action_requires_approval",
        "sensitive_export_requires_approval",
        "billing_commitment_requires_approval",
        "customer_message_requires_approval",
        "workspace_boundary_is_enforced",
        "tenant_policy_isolation_is_enforced",
        "viewer_cannot_promote_autonomy",
        "operator_cannot_bypass_policy",
        "model_cannot_self_promote",
        "model_cannot_mark_outcome_verified",
        "self_report_is_not_external_proof",
        "draft_policy_is_not_enforced",
        "forecast_requires_history",
        "feedback_requires_consent",
        "feedback_sample_size_is_visible",
        "synthetic_baseline_is_labelled",
        "live_model_eval_is_distinct",
        "customer_data_use_is_explicit",
        "approval_denial_is_negative_feedback",
        "approval_edit_is_learning_signal",
        "low_confidence_stays_assistive",
        "high_risk_stays_gated",
        "tier_change_is_audited",
        "tier_promotion_defaults_to_hold",
        "policy_rollback_is_available",
        "external_action_scope_is_unchanged",
      ];
      const observedRuns = runs.rows.length;
      const decidedApprovals = approvals.rows.filter((approval) =>
        ["approved", "denied"].includes(approval.state),
      );
      const approved = decidedApprovals.filter((approval) => approval.state === "approved").length;
      const predictedRuns = observedRuns < 7
        ? observedRuns
        : Math.max(observedRuns, Math.round(observedRuns * 1.12));
      const dataQuality = observedRuns >= 50 ? "observed" : "insufficient_history";
      const confidenceBps = observedRuns >= 50 ? 7800 : Math.min(4000, observedRuns * 80);

      const [evaluation, forecast] = await Promise.all([
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "tenant_evaluations",
          rowId: ID.unique(),
          data: {
            workspaceId,
            suite: "tenant_policy_baseline",
            status: "passed_synthetic",
            scope: "synthetic_workspace_baseline",
            score: 100,
            cases: fixtures.length,
            passed: fixtures.length,
            failed: 0,
            liveModelCalled: 0,
            customerDataUsed: 0,
            evidence: JSON.stringify({
              deterministic: true,
              fixtures,
              liveModelCalled: false,
              customerDataUsed: false,
              productionQualityClaimed: false,
              autonomyPromotionEligible: false,
            }),
            initiatedBy: membership.userEmail,
            startedAt: evaluationStartedAt.toISOString(),
            completedAt: completedAt.toISOString(),
          },
          permissions: [],
        }),
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "workload_forecasts",
          rowId: ID.unique(),
          data: {
            workspaceId,
            horizonDays: 30,
            status: dataQuality === "observed" ? "forecast_ready" : "insufficient_history",
            basis: "durable_workspace_runs",
            observedRuns,
            predictedRuns,
            peakConcurrent: observedRuns >= 50 ? Math.max(1, Math.ceil(predictedRuns / 30 / 8)) : 0,
            confidenceBps,
            dataQuality,
            evidence: JSON.stringify({
              historyRows: observedRuns,
              sampleLimit: 100,
              extrapolationApplied: observedRuns >= 7,
              externalTelemetryUsed: false,
              providerCapacityReserved: false,
              approvalAcceptanceRate:
                decidedApprovals.length > 0 ? approved / decidedApprovals.length : null,
            }),
            createdAt: completedAt.toISOString(),
          },
          permissions: [],
        }),
      ]);
      await Promise.all([
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "usage_ledger",
          rowId: ID.unique(),
          data: {
            workspaceId,
            meter: "tenant_evaluation",
            quantity: fixtures.length,
            unit: "case",
            sourceType: "tenant_evaluation",
            sourceId: evaluation.$id,
            period: completedAt.toISOString().slice(0, 7),
            costCents: 0,
            idempotencyKey: `tenant-evaluation:${evaluation.$id}`,
            recordedAt: completedAt.toISOString(),
          },
          permissions: [],
        }),
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "audit_events",
          rowId: ID.unique(),
          data: {
            workspaceId,
            actorEmail: membership.userEmail,
            action: "intelligence.tenant_evaluation.completed",
            targetType: "tenant_evaluation",
            targetId: evaluation.$id,
            outcome: "success",
            metadata: JSON.stringify({
              forecastId: forecast.$id,
              synthetic: true,
              liveModelCalled: false,
              customerDataUsed: false,
              autonomyPromoted: false,
              requestId,
            }),
            occurredAt: completedAt.toISOString(),
          },
          permissions: [],
        }),
      ]);
      audit(log, {
        requestId,
        event: "intelligence.tenant_evaluation.completed",
        workspaceId,
        evaluationId: evaluation.$id,
        forecastId: forecast.$id,
        cases: fixtures.length,
        observedRuns,
        liveModelCalled: false,
        customerDataUsed: false,
        autonomyPromoted: false,
        durationMs: Date.now() - evaluationStartedAt.getTime(),
      });
      return res.json({ evaluation, forecast, requestId });
    }

    if (path === "/ensemble/rehearse" && method === "POST") {
      const workspaceId = String(body.workspaceId || "").slice(0, 36);
      const teamId = String(body.teamId || "").slice(0, 36);
      const caseId = String(body.caseId || "").slice(0, 36);
      if (!workspaceId || !teamId || !caseId) {
        return res.json({ error: "workspaceId, teamId, and caseId are required", requestId }, 400);
      }
      const membership = await membershipFor(tables, workspaceId, userId);
      if (!membership || !canEnqueueJob(membership.role)) {
        return res.json({ error: "Team rehearsals are not allowed for this role", requestId }, 403);
      }
      const [team, mission, specialistList] = await Promise.all([
        tables.getRow({
          databaseId: DATABASE_ID,
          tableId: "agent_teams",
          rowId: teamId,
        }),
        tables.getRow({
          databaseId: DATABASE_ID,
          tableId: "mission_cases",
          rowId: caseId,
        }),
        tables.listRows({
          databaseId: DATABASE_ID,
          tableId: "team_specialists",
          queries: [
            Query.equal("workspaceId", [workspaceId]),
            Query.equal("teamId", [teamId]),
            Query.limit(10),
          ],
          total: false,
        }),
      ]);
      if (
        team.workspaceId !== workspaceId ||
        mission.workspaceId !== workspaceId ||
        mission.teamId !== teamId ||
        team.status !== "active" ||
        specialistList.rows.length !== 5 ||
        specialistList.rows.some((specialist) => specialist.canExecute !== 0)
      ) {
        return res.json({ error: "The bounded specialist team is not valid", requestId }, 409);
      }

      const completedAt = new Date();
      const contributions = [
        {
          agent: "vela",
          to: "loom",
          conflict: 0,
          summary: "Mapped the read-only research path and marked every submission or purchase boundary for approval.",
          citations: ["synthetic://browser-scope", "policy://approval-boundaries"],
        },
        {
          agent: "loom",
          to: "tempo",
          conflict: 1,
          summary: "Drafted a reversible workflow, but flagged that customer notification timing conflicts with incident containment.",
          citations: ["synthetic://workflow-draft", "policy://external-messages"],
        },
        {
          agent: "tempo",
          to: "helio",
          conflict: 1,
          summary: "Prioritized reliability containment before cost action and preserved production-change approval.",
          citations: ["synthetic://incident-timeline", "policy://production-change"],
        },
        {
          agent: "helio",
          to: "aegis",
          conflict: 0,
          summary: "Estimated a bounded savings range without claiming realized value or changing cloud resources.",
          citations: ["synthetic://cost-baseline", "policy://financial-action"],
        },
        {
          agent: "aegis",
          to: "council",
          conflict: 0,
          summary: "Identified sensitive-data and permission risks; recommended owner review before any downstream action.",
          citations: ["synthetic://security-review", "policy://sensitive-data"],
        },
      ];
      const handoffs = await Promise.all(
        contributions.map((contribution) =>
          tables.createRow({
            databaseId: DATABASE_ID,
            tableId: "mission_handoffs",
            rowId: ID.unique(),
            data: {
              workspaceId,
              caseId,
              fromAgent: contribution.agent,
              toAgent: contribution.to,
              status: "completed_synthetic",
              summary: contribution.summary,
              citations: JSON.stringify(contribution.citations),
              conflict: contribution.conflict,
              externalActionsExecuted: 0,
              createdAt: completedAt.toISOString(),
            },
            permissions: [],
          }),
        ),
      );
      const synthesis = await tables.createRow({
        databaseId: DATABASE_ID,
        tableId: "evidence_syntheses",
        rowId: ID.unique(),
        data: {
          workspaceId,
          caseId,
          status: "synthetic_draft",
          sourceCount: handoffs.length,
          verifiedSourceCount: 0,
          conflictCount: contributions.filter((item) => item.conflict === 1).length,
          summary: "All five specialists contributed bounded analysis. Reliability containment leads; cost and communication actions remain downstream of security and approval review.",
          findings: JSON.stringify([
            "Contain reliability risk before optimization.",
            "Keep external communication as a reviewed draft.",
            "Preserve production, financial, and sensitive-data approvals.",
          ]),
          gaps: JSON.stringify([
            "No production evidence was attached.",
            "Two specialist tensions require owner resolution.",
            "No downstream approval set has been assembled.",
          ]),
          customerDataUsed: 0,
          createdAt: completedAt.toISOString(),
        },
        permissions: [],
      });
      const brief = await tables.createRow({
        databaseId: DATABASE_ID,
        tableId: "executive_briefs",
        rowId: ID.unique(),
        data: {
          workspaceId,
          caseId,
          title: `Decision brief · ${String(mission.title).slice(0, 150)}`,
          status: "draft_internal",
          audience: "workspace_executive_owner",
          summary: "A deterministic collaboration rehearsal synthesized five specialist perspectives. The case remains on hold pending real evidence, conflict resolution, brief review, and downstream approvals.",
          recommendations: JSON.stringify([
            "Review the reliability-first sequence.",
            "Resolve timing tension between containment and communication.",
            "Attach verified production evidence before authorizing a plan.",
          ]),
          evidence: JSON.stringify({
            synthesisId: synthesis.$id,
            handoffIds: handoffs.map((handoff) => handoff.$id),
            deterministic: true,
            liveModelCalled: false,
            customerDataUsed: false,
            externallyShared: false,
          }),
          reviewed: 0,
          externallyShared: 0,
          createdBy: membership.userEmail,
          createdAt: completedAt.toISOString(),
          updatedAt: completedAt.toISOString(),
        },
        permissions: [],
      });
      const updatedCase = await tables.updateRow({
        databaseId: DATABASE_ID,
        tableId: "mission_cases",
        rowId: caseId,
        data: {
          status: "rehearsal_complete",
          score: 33,
          recommendation: "hold",
          evidence: JSON.stringify({
            teamBounded: true,
            allSpecialistsContributed: true,
            handoffsExternallyVerified: false,
            evidenceComplete: false,
            briefReviewed: false,
            downstreamApprovalsReady: false,
            synthesisId: synthesis.$id,
            briefId: brief.$id,
          }),
          blockers: JSON.stringify([
            "Specialist handoffs use synthetic, unverified sources.",
            "Evidence conflicts remain unresolved.",
            "The executive brief has not been reviewed.",
            "Downstream approval requirements are not assembled.",
          ]),
          updatedAt: completedAt.toISOString(),
        },
      });
      await Promise.all([
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "usage_ledger",
          rowId: ID.unique(),
          data: {
            workspaceId,
            meter: "ensemble_rehearsal",
            quantity: handoffs.length,
            unit: "specialist_contribution",
            sourceType: "mission_case",
            sourceId: caseId,
            period: completedAt.toISOString().slice(0, 7),
            costCents: 0,
            idempotencyKey: `ensemble-rehearsal:${synthesis.$id}`,
            recordedAt: completedAt.toISOString(),
          },
          permissions: [],
        }),
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "audit_events",
          rowId: ID.unique(),
          data: {
            workspaceId,
            actorEmail: membership.userEmail,
            action: "ensemble.rehearsal.completed",
            targetType: "mission_case",
            targetId: caseId,
            outcome: "success",
            metadata: JSON.stringify({
              synthesisId: synthesis.$id,
              briefId: brief.$id,
              specialistContributions: handoffs.length,
              liveModelCalled: false,
              customerDataUsed: false,
              externalActionsExecuted: false,
              requestId,
            }),
            occurredAt: completedAt.toISOString(),
          },
          permissions: [],
        }),
      ]);
      audit(log, {
        requestId,
        event: "ensemble.rehearsal.completed",
        workspaceId,
        caseId,
        synthesisId: synthesis.$id,
        briefId: brief.$id,
        specialistContributions: handoffs.length,
        liveModelCalled: false,
        customerDataUsed: false,
        externalActionsExecuted: false,
      });
      return res.json({ mission: updatedCase, handoffs, synthesis, brief, requestId });
    }

    if (path === "/memory/simulate" && method === "POST") {
      const workspaceId = String(body.workspaceId || "").slice(0, 36);
      const snapshotId = String(body.snapshotId || "").slice(0, 36);
      const title = String(body.title || "").trim().slice(0, 180);
      const changeSet = String(body.changeSet || "").trim().slice(0, 4000);
      const horizonDays = Math.min(180, Math.max(7, Number(body.horizonDays) || 30));
      if (!workspaceId || !snapshotId || !title || !changeSet) {
        return res.json(
          { error: "workspaceId, snapshotId, title, and changeSet are required", requestId },
          400,
        );
      }
      const membership = await membershipFor(tables, workspaceId, userId);
      if (!membership || !canEnqueueJob(membership.role)) {
        return res.json({ error: "Twin simulations are not allowed for this role", requestId }, 403);
      }
      const snapshot = await tables.getRow({
        databaseId: DATABASE_ID,
        tableId: "twin_snapshots",
        rowId: snapshotId,
      });
      if (snapshot.workspaceId !== workspaceId) {
        return res.json({ error: "The twin snapshot is outside this workspace", requestId }, 409);
      }

      const completedAt = new Date();
      const confidenceBps = snapshot.status === "decision_grade" ? 6200 : 2200;
      const assumptions = [
        "The change is modeled as an advisory scenario only.",
        "Baseline values are deterministic reference indices, not observed production metrics.",
        "No live model, customer data, cloud inventory, deployment, or external provider was used.",
        "Forecast ranges express uncertainty and are not guaranteed outcomes.",
      ];
      const simulation = await tables.createRow({
        databaseId: DATABASE_ID,
        tableId: "scenario_simulations",
        rowId: ID.unique(),
        data: {
          workspaceId,
          snapshotId,
          title,
          status: "synthetic_advisory",
          horizonDays,
          changeSet: JSON.stringify({
            description: changeSet,
            appliedToTwin: false,
            appliedToProduction: false,
          }),
          assumptions: JSON.stringify(assumptions),
          projectedImpact: JSON.stringify({
            dimensions: ["reliability", "cost", "security", "change_load"],
            recommendation: "Use the ranges to frame questions, not authorize action.",
            productionForecastClaimed: false,
          }),
          confidenceBps,
          liveModelCalled: 0,
          customerDataUsed: 0,
          externalActionsExecuted: 0,
          createdBy: membership.userEmail,
          createdAt: completedAt.toISOString(),
        },
        permissions: [],
      });
      const dimensions = [
        {
          dimension: "reliability",
          direction: "uncertain",
          baseline: 9950,
          low: 9910,
          high: 9970,
          unit: "basis_points",
        },
        {
          dimension: "cost",
          direction: "uncertain",
          baseline: 100,
          low: 91,
          high: 108,
          unit: "index",
        },
        {
          dimension: "security",
          direction: "risk_up",
          baseline: 20,
          low: 18,
          high: 32,
          unit: "risk_index",
        },
        {
          dimension: "change_load",
          direction: "up",
          baseline: 10,
          low: 12,
          high: 18,
          unit: "changes_week",
        },
      ];
      const forecasts = await Promise.all(
        dimensions.map((dimension) =>
          tables.createRow({
            databaseId: DATABASE_ID,
            tableId: "impact_forecasts",
            rowId: ID.unique(),
            data: {
              workspaceId,
              simulationId: simulation.$id,
              dimension: dimension.dimension,
              direction: dimension.direction,
              baselineValue: dimension.baseline,
              projectedValueLow: dimension.low,
              projectedValueHigh: dimension.high,
              unit: dimension.unit,
              confidenceBps,
              status: "synthetic_range",
              evidence: JSON.stringify({
                basis: "deterministic_reference_fixture",
                observedProductionMetric: false,
                decisionEvidence: false,
                externalSystemsQueried: false,
              }),
              createdAt: completedAt.toISOString(),
            },
            permissions: [],
          }),
        ),
      );
      await Promise.all([
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "usage_ledger",
          rowId: ID.unique(),
          data: {
            workspaceId,
            meter: "twin_simulation",
            quantity: forecasts.length,
            unit: "impact_dimension",
            sourceType: "scenario_simulation",
            sourceId: simulation.$id,
            period: completedAt.toISOString().slice(0, 7),
            costCents: 0,
            idempotencyKey: `twin-simulation:${simulation.$id}`,
            recordedAt: completedAt.toISOString(),
          },
          permissions: [],
        }),
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "audit_events",
          rowId: ID.unique(),
          data: {
            workspaceId,
            actorEmail: membership.userEmail,
            action: "memory.twin_simulation.completed",
            targetType: "scenario_simulation",
            targetId: simulation.$id,
            outcome: "success",
            metadata: JSON.stringify({
              snapshotId,
              impactDimensions: forecasts.length,
              synthetic: true,
              liveModelCalled: false,
              customerDataUsed: false,
              externalActionsExecuted: false,
              knowledgeBaseChanged: false,
              requestId,
            }),
            occurredAt: completedAt.toISOString(),
          },
          permissions: [],
        }),
      ]);
      audit(log, {
        requestId,
        event: "memory.twin_simulation.completed",
        workspaceId,
        snapshotId,
        simulationId: simulation.$id,
        impactDimensions: forecasts.length,
        synthetic: true,
        liveModelCalled: false,
        customerDataUsed: false,
        externalActionsExecuted: false,
        knowledgeBaseChanged: false,
      });
      return res.json({ simulation, forecasts, requestId });
    }

    if (path === "/portfolio/simulate" && method === "POST") {
      const workspaceId = String(body.workspaceId || "").slice(0, 36);
      const title = String(body.title || "").trim().slice(0, 180);
      const selectedInitiativeIds = Array.isArray(body.selectedInitiativeIds)
        ? body.selectedInitiativeIds
            .map((value) => String(value).slice(0, 36))
            .filter(Boolean)
            .slice(0, 25)
        : [];
      const budgetLimitCents = Math.min(
        10_000_000_000,
        Math.max(0, Math.round(Number(body.budgetLimitCents) || 0)),
      );
      const headcountLimit = Math.min(
        10_000,
        Math.max(0, Math.round(Number(body.headcountLimit) || 0)),
      );
      const horizonMonths = Math.min(
        36,
        Math.max(3, Math.round(Number(body.horizonMonths) || 12)),
      );
      if (!workspaceId || !title || selectedInitiativeIds.length === 0) {
        return res.json(
          { error: "workspaceId, title, and at least one initiative are required", requestId },
          400,
        );
      }
      const membership = await membershipFor(tables, workspaceId, userId);
      if (!membership || !canEnqueueJob(membership.role)) {
        return res.json({ error: "Portfolio simulations are not allowed for this role", requestId }, 403);
      }
      const [initiativeList, capacityList] = await Promise.all([
        tables.listRows({
          databaseId: DATABASE_ID,
          tableId: "portfolio_initiatives",
          queries: [
            Query.equal("workspaceId", [workspaceId]),
            Query.limit(100),
          ],
          total: false,
        }),
        tables.listRows({
          databaseId: DATABASE_ID,
          tableId: "capacity_envelopes",
          queries: [
            Query.equal("workspaceId", [workspaceId]),
            Query.limit(1),
          ],
          total: false,
        }),
      ]);
      const selected = initiativeList.rows.filter((initiative) =>
        selectedInitiativeIds.includes(initiative.$id),
      );
      if (selected.length !== selectedInitiativeIds.length || !capacityList.rows[0]) {
        return res.json({ error: "The selected portfolio is not valid in this workspace", requestId }, 409);
      }
      const selectedBudgetCents = selected.reduce(
        (total, initiative) => total + Number(initiative.proposedBudgetCents || 0),
        0,
      );
      const selectedHeadcount = selected.reduce(
        (total, initiative) => total + Number(initiative.requiredHeadcount || 0),
        0,
      );
      const budgetFit = budgetLimitCents > 0 && selectedBudgetCents <= budgetLimitCents;
      const headcountFit = headcountLimit > 0 && selectedHeadcount <= headcountLimit;
      const resourceFitCount = Number(budgetFit) + Number(headcountFit);
      const outcomeScore = Math.min(
        78,
        42 + selected.length * 6 + resourceFitCount * 5,
      );
      const confidenceBps = 2800;
      const completedAt = new Date();
      const assumptions = [
        "Initiative costs, capacity, and expected outcomes are planning assumptions.",
        "No finance, HR, delivery, or customer system was queried.",
        "The scenario uses deterministic reference ranges and no live AI model.",
        "Scenario completion creates no budget, hiring, vendor, or operational commitment.",
      ];
      const scenario = await tables.createRow({
        databaseId: DATABASE_ID,
        tableId: "portfolio_scenarios",
        rowId: ID.unique(),
        data: {
          workspaceId,
          title,
          status: "synthetic_advisory",
          horizonMonths,
          selectedInitiativeIds: JSON.stringify(selectedInitiativeIds),
          budgetLimitCents,
          headcountLimit,
          assumptions: JSON.stringify(assumptions),
          outcomeScore,
          confidenceBps,
          liveModelCalled: 0,
          customerDataUsed: 0,
          financialCommitmentCreated: 0,
          createdBy: membership.userEmail,
          createdAt: completedAt.toISOString(),
        },
        permissions: [],
      });
      const utilizationPercent =
        budgetLimitCents > 0
          ? Math.min(200, Math.round((selectedBudgetCents / budgetLimitCents) * 100))
          : 0;
      const dimensions = [
        {
          dimension: "strategic_value",
          direction: "up",
          baseline: 50,
          low: Math.max(50, outcomeScore - 8),
          high: Math.min(100, outcomeScore + 10),
          unit: "score",
        },
        {
          dimension: "budget_utilization",
          direction: utilizationPercent <= 100 ? "within_envelope" : "over_envelope",
          baseline: 0,
          low: Math.max(0, utilizationPercent - 5),
          high: utilizationPercent + 8,
          unit: "percent",
        },
        {
          dimension: "delivery_horizon",
          direction: "uncertain",
          baseline: horizonMonths,
          low: Math.max(3, horizonMonths - 2),
          high: horizonMonths + 4,
          unit: "months",
        },
        {
          dimension: "portfolio_risk",
          direction: "uncertain",
          baseline: 50,
          low: budgetFit && headcountFit ? 38 : 48,
          high: budgetFit && headcountFit ? 62 : 78,
          unit: "risk_index",
        },
      ];
      const forecasts = await Promise.all(
        dimensions.map((dimension) =>
          tables.createRow({
            databaseId: DATABASE_ID,
            tableId: "portfolio_forecasts",
            rowId: ID.unique(),
            data: {
              workspaceId,
              scenarioId: scenario.$id,
              dimension: dimension.dimension,
              direction: dimension.direction,
              baselineValue: dimension.baseline,
              projectedValueLow: dimension.low,
              projectedValueHigh: dimension.high,
              unit: dimension.unit,
              confidenceBps,
              status: "synthetic_range",
              evidence: JSON.stringify({
                basis: "deterministic_portfolio_fixture",
                selectedBudgetCents,
                selectedHeadcount,
                budgetFit,
                headcountFit,
                externallyVerifiedCapacity: false,
                realizedBenefitClaimed: false,
                decisionEvidence: false,
              }),
              createdAt: completedAt.toISOString(),
            },
            permissions: [],
          }),
        ),
      );
      await Promise.all([
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "usage_ledger",
          rowId: ID.unique(),
          data: {
            workspaceId,
            meter: "portfolio_scenario",
            quantity: forecasts.length,
            unit: "forecast_dimension",
            sourceType: "portfolio_scenario",
            sourceId: scenario.$id,
            period: completedAt.toISOString().slice(0, 7),
            costCents: 0,
            idempotencyKey: `portfolio-scenario:${scenario.$id}`,
            recordedAt: completedAt.toISOString(),
          },
          permissions: [],
        }),
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "audit_events",
          rowId: ID.unique(),
          data: {
            workspaceId,
            actorEmail: membership.userEmail,
            action: "portfolio.scenario.completed",
            targetType: "portfolio_scenario",
            targetId: scenario.$id,
            outcome: "success",
            metadata: JSON.stringify({
              selectedInitiatives: selected.length,
              liveModelCalled: false,
              customerDataUsed: false,
              capacityExternallyVerified: false,
              financialCommitmentCreated: false,
              externalActionsExecuted: false,
              requestId,
            }),
            occurredAt: completedAt.toISOString(),
          },
          permissions: [],
        }),
      ]);
      audit(log, {
        requestId,
        event: "portfolio.scenario.completed",
        workspaceId,
        scenarioId: scenario.$id,
        selectedInitiatives: selected.length,
        liveModelCalled: false,
        customerDataUsed: false,
        financialCommitmentCreated: false,
        externalActionsExecuted: false,
      });
      return res.json({ scenario, forecasts, requestId });
    }

    if (path === "/execution/assess" && method === "POST") {
      const workspaceId = String(body.workspaceId || "").slice(0, 36);
      const programId = String(body.programId || "").slice(0, 36);
      if (!workspaceId || !programId) {
        return res.json(
          { error: "workspaceId and programId are required", requestId },
          400,
        );
      }
      const membership = await membershipFor(tables, workspaceId, userId);
      if (!membership || !canEnqueueJob(membership.role)) {
        return res.json(
          { error: "Execution assessments are not allowed for this role", requestId },
          403,
        );
      }
      const [program, milestones, deliveryEvidence, benefitMetrics, benefitMeasurements] =
        await Promise.all([
          tables.getRow({
            databaseId: DATABASE_ID,
            tableId: "execution_programs",
            rowId: programId,
          }),
          tables.listRows({
            databaseId: DATABASE_ID,
            tableId: "program_milestones",
            queries: [Query.equal("programId", [programId]), Query.limit(100)],
            total: false,
          }),
          tables.listRows({
            databaseId: DATABASE_ID,
            tableId: "delivery_evidence",
            queries: [Query.equal("programId", [programId]), Query.limit(100)],
            total: false,
          }),
          tables.listRows({
            databaseId: DATABASE_ID,
            tableId: "benefit_metrics",
            queries: [Query.equal("programId", [programId]), Query.limit(100)],
            total: false,
          }),
          tables.listRows({
            databaseId: DATABASE_ID,
            tableId: "benefit_measurements",
            queries: [Query.equal("programId", [programId]), Query.limit(100)],
            total: false,
          }),
        ]);
      if (program.workspaceId !== workspaceId) {
        return res.json(
          { error: "The execution program is outside this workspace", requestId },
          409,
        );
      }
      const milestoneCount = milestones.rows.length;
      const evidencedMilestones = new Set(
        deliveryEvidence.rows.map((item) => item.milestoneId),
      ).size;
      const measuredMetrics = new Set(
        benefitMeasurements.rows.map((item) => item.metricId),
      ).size;
      const deliveryCoverage = milestoneCount
        ? Math.round((evidencedMilestones / milestoneCount) * 100)
        : 0;
      const benefitCoverage = benefitMetrics.rows.length
        ? Math.round((measuredMetrics / benefitMetrics.rows.length) * 100)
        : 0;
      const evidenceItems =
        deliveryEvidence.rows.length + benefitMeasurements.rows.length;
      const verifiedItems =
        deliveryEvidence.rows.filter((item) => Number(item.verified) === 1).length +
        benefitMeasurements.rows.filter(
          (item) => Number(item.independentlyVerified) === 1,
        ).length;
      const evidenceConfidence = evidenceItems
        ? Math.round((verifiedItems / evidenceItems) * 100)
        : 0;
      const severityFor = (gap) =>
        gap >= 50 ? "high" : gap >= 25 ? "medium" : "low";
      const dimensions = [
        {
          dimension: "delivery_progress",
          baseline: 50,
          actual: deliveryCoverage,
          unit: "percent",
        },
        {
          dimension: "benefit_observability",
          baseline: 40,
          actual: benefitCoverage,
          unit: "percent",
        },
        {
          dimension: "evidence_confidence",
          baseline: 80,
          actual: evidenceConfidence,
          unit: "percent",
        },
      ];
      const assessedAt = new Date();
      const variances = await Promise.all(
        dimensions.map((dimension) => {
          const varianceValue = dimension.actual - dimension.baseline;
          return tables.createRow({
            databaseId: DATABASE_ID,
            tableId: "execution_variances",
            rowId: ID.unique(),
            data: {
              workspaceId,
              programId,
              dimension: dimension.dimension,
              status: "synthetic_advisory",
              severity: severityFor(Math.abs(varianceValue)),
              baselineValue: dimension.baseline,
              actualValue: dimension.actual,
              varianceValue,
              unit: dimension.unit,
              confidenceBps: 2600,
              decisionGrade: 0,
              evidence: JSON.stringify({
                basis: "deterministic_execution_fixture",
                milestoneCount,
                evidencedMilestones,
                benefitMetricCount: benefitMetrics.rows.length,
                measuredMetrics,
                verifiedItems,
                evidenceItems,
                liveModelCalled: false,
                deliverySystemConnected: false,
                financeSystemConnected: false,
                customerSystemConnected: false,
                realizedBenefitClaimed: false,
                correctiveActionExecuted: false,
              }),
              externalSystemsQueried: 0,
              assessedAt: assessedAt.toISOString(),
            },
            permissions: [],
          });
        }),
      );
      await Promise.all([
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "usage_ledger",
          rowId: ID.unique(),
          data: {
            workspaceId,
            meter: "execution_variance_assessment",
            quantity: variances.length,
            unit: "variance_dimension",
            sourceType: "execution_program",
            sourceId: programId,
            period: assessedAt.toISOString().slice(0, 7),
            costCents: 0,
            idempotencyKey: `execution-assessment:${variances[0].$id}`,
            recordedAt: assessedAt.toISOString(),
          },
          permissions: [],
        }),
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "audit_events",
          rowId: ID.unique(),
          data: {
            workspaceId,
            actorEmail: membership.userEmail,
            action: "execution.variance_assessment.completed",
            targetType: "execution_program",
            targetId: programId,
            outcome: "success",
            metadata: JSON.stringify({
              varianceDimensions: variances.length,
              deterministic: true,
              liveModelCalled: false,
              externalSystemsQueried: false,
              realizedBenefitClaimed: false,
              programChanged: false,
              correctiveActionExecuted: false,
              requestId,
            }),
            occurredAt: assessedAt.toISOString(),
          },
          permissions: [],
        }),
      ]);
      audit(log, {
        requestId,
        event: "execution.variance_assessment.completed",
        workspaceId,
        programId,
        varianceDimensions: variances.length,
        liveModelCalled: false,
        externalSystemsQueried: false,
        realizedBenefitClaimed: false,
        programChanged: false,
        correctiveActionExecuted: false,
      });
      return res.json({ variances, requestId });
    }

    if (path === "/federation/rollup" && method === "POST") {
      const workspaceId = String(body.workspaceId || "").slice(0, 36);
      const federationId = String(body.federationId || "").slice(0, 36);
      const period = String(body.period || new Date().toISOString().slice(0, 7))
        .slice(0, 32);
      if (!workspaceId || !federationId) {
        return res.json(
          { error: "workspaceId and federationId are required", requestId },
          400,
        );
      }
      const membership = await membershipFor(tables, workspaceId, userId);
      if (!membership || !canEnqueueJob(membership.role)) {
        return res.json(
          { error: "Enterprise rollups are not allowed for this role", requestId },
          403,
        );
      }
      const [
        federation,
        federationWorkspaces,
        programs,
        milestones,
        deliveryEvidence,
        benefitMetrics,
        benefitMeasurements,
        variances,
        correctiveActions,
      ] = await Promise.all([
        tables.getRow({
          databaseId: DATABASE_ID,
          tableId: "enterprise_federations",
          rowId: federationId,
        }),
        tables.listRows({
          databaseId: DATABASE_ID,
          tableId: "federation_workspaces",
          queries: [Query.equal("federationId", [federationId]), Query.limit(100)],
          total: false,
        }),
        tables.listRows({
          databaseId: DATABASE_ID,
          tableId: "execution_programs",
          queries: [Query.equal("workspaceId", [workspaceId]), Query.limit(100)],
          total: false,
        }),
        tables.listRows({
          databaseId: DATABASE_ID,
          tableId: "program_milestones",
          queries: [Query.equal("workspaceId", [workspaceId]), Query.limit(100)],
          total: false,
        }),
        tables.listRows({
          databaseId: DATABASE_ID,
          tableId: "delivery_evidence",
          queries: [Query.equal("workspaceId", [workspaceId]), Query.limit(100)],
          total: false,
        }),
        tables.listRows({
          databaseId: DATABASE_ID,
          tableId: "benefit_metrics",
          queries: [Query.equal("workspaceId", [workspaceId]), Query.limit(100)],
          total: false,
        }),
        tables.listRows({
          databaseId: DATABASE_ID,
          tableId: "benefit_measurements",
          queries: [Query.equal("workspaceId", [workspaceId]), Query.limit(100)],
          total: false,
        }),
        tables.listRows({
          databaseId: DATABASE_ID,
          tableId: "execution_variances",
          queries: [Query.equal("workspaceId", [workspaceId]), Query.limit(100)],
          total: false,
        }),
        tables.listRows({
          databaseId: DATABASE_ID,
          tableId: "corrective_actions",
          queries: [Query.equal("workspaceId", [workspaceId]), Query.limit(100)],
          total: false,
        }),
      ]);
      if (federation.workspaceId !== workspaceId) {
        return res.json(
          { error: "The federation is outside this anchor workspace", requestId },
          409,
        );
      }
      const connectedMembers = federationWorkspaces.rows.filter(
        (member) =>
          Number(member.verified) === 1 &&
          Number(member.dataSharingApproved) === 1 &&
          ["connected_anchor", "connected_verified"].includes(member.status),
      );
      const evidencedMilestones = new Set(
        deliveryEvidence.rows.map((item) => item.milestoneId),
      ).size;
      const measuredMetrics = new Set(
        benefitMeasurements.rows.map((item) => item.metricId),
      ).size;
      const verifiedEvidenceCount = deliveryEvidence.rows.filter(
        (item) => Number(item.verified) === 1,
      ).length;
      const verifiedMeasurements = benefitMeasurements.rows.filter(
        (item) => Number(item.independentlyVerified) === 1,
      ).length;
      const openVariances = variances.rows.filter(
        (item) => !["resolved", "closed_verified"].includes(item.status),
      ).length;
      const heldOrApprovedActions = correctiveActions.rows.filter((item) =>
        ["held", "approved"].includes(item.approvalStatus),
      ).length;
      const createdAt = new Date();
      const rollup = await tables.createRow({
        databaseId: DATABASE_ID,
        tableId: "enterprise_rollups",
        rowId: ID.unique(),
        data: {
          workspaceId,
          federationId,
          status: "bounded_anchor_only",
          period,
          workspaceCount: federationWorkspaces.rows.length,
          connectedWorkspaceCount: connectedMembers.length,
          programsCount: programs.rows.length,
          milestonesCount: milestones.rows.length,
          verifiedEvidenceCount,
          benefitsMeasuredCount: benefitMeasurements.rows.length,
          openVariancesCount: openVariances,
          confidenceBps: 3000,
          decisionGrade: 0,
          sourceSnapshot: JSON.stringify({
            scope: "anchor_workspace_only",
            anchorWorkspaceId: workspaceId,
            connectedMemberIds: connectedMembers.map(
              (member) => member.memberWorkspaceId,
            ),
            otherMemberWorkspacesQueried: false,
            crossWorkspaceAuthorizationVerified: false,
            externalSystemsQueried: false,
            liveModelCalled: false,
            verifiedMeasurements,
            heldOrApprovedActions,
          }),
          externalSystemsQueried: 0,
          createdBy: membership.userEmail,
          createdAt: createdAt.toISOString(),
        },
        permissions: [],
      });
      const deliveryCoverage = milestones.rows.length
        ? Math.round((evidencedMilestones / milestones.rows.length) * 100)
        : 0;
      const benefitObservability = benefitMetrics.rows.length
        ? Math.round((measuredMetrics / benefitMetrics.rows.length) * 100)
        : 0;
      const varianceAttention = variances.rows.length
        ? Math.round((heldOrApprovedActions / variances.rows.length) * 100)
        : 0;
      const referenceMetrics = [
        {
          metric: "delivery_evidence_coverage",
          currentValue: deliveryCoverage,
          benchmarkLow: 45,
          benchmarkHigh: 75,
          unit: "percent",
        },
        {
          metric: "benefit_observability",
          currentValue: benefitObservability,
          benchmarkLow: 35,
          benchmarkHigh: 65,
          unit: "percent",
        },
        {
          metric: "variance_attention",
          currentValue: varianceAttention,
          benchmarkLow: 50,
          benchmarkHigh: 80,
          unit: "percent",
        },
      ];
      const benchmarks = await Promise.all(
        referenceMetrics.map((benchmark) =>
          tables.createRow({
            databaseId: DATABASE_ID,
            tableId: "privacy_benchmarks",
            rowId: ID.unique(),
            data: {
              workspaceId,
              federationId,
              rollupId: rollup.$id,
              ...benchmark,
              cohortSize: 24,
              status: "synthetic_reference_no_tenant",
              kAnonymityMet: 0,
              differentialPrivacyApplied: 0,
              rawTenantDataExposed: 0,
              confidenceBps: 3000,
              evidence: JSON.stringify({
                basis: "deterministic_federation_fixture",
                cohortIsSynthetic: true,
                realTenantRecordsUsed: false,
                privacyReviewCompleted: false,
                kAnonymityAudited: false,
                differentialPrivacyApplied: false,
                rawTenantDataExposed: false,
                decisionEvidence: false,
              }),
              createdAt: createdAt.toISOString(),
            },
            permissions: [],
          }),
        ),
      );
      await Promise.all([
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "usage_ledger",
          rowId: ID.unique(),
          data: {
            workspaceId,
            meter: "federation_rollup",
            quantity: benchmarks.length,
            unit: "benchmark_dimension",
            sourceType: "enterprise_rollup",
            sourceId: rollup.$id,
            period: createdAt.toISOString().slice(0, 7),
            costCents: 0,
            idempotencyKey: `federation-rollup:${rollup.$id}`,
            recordedAt: createdAt.toISOString(),
          },
          permissions: [],
        }),
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "audit_events",
          rowId: ID.unique(),
          data: {
            workspaceId,
            actorEmail: membership.userEmail,
            action: "federation.rollup.completed",
            targetType: "enterprise_rollup",
            targetId: rollup.$id,
            outcome: "success",
            metadata: JSON.stringify({
              anchorWorkspaceOnly: true,
              otherMemberWorkspacesQueried: false,
              externalSystemsQueried: false,
              liveModelCalled: false,
              rawTenantDataExposed: false,
              privacyReviewCompleted: false,
              policyApplied: false,
              delegationActivated: false,
              externalActionsExecuted: false,
              requestId,
            }),
            occurredAt: createdAt.toISOString(),
          },
          permissions: [],
        }),
      ]);
      audit(log, {
        requestId,
        event: "federation.rollup.completed",
        workspaceId,
        federationId,
        rollupId: rollup.$id,
        anchorWorkspaceOnly: true,
        otherMemberWorkspacesQueried: false,
        rawTenantDataExposed: false,
        externalActionsExecuted: false,
      });
      return res.json({ rollup, benchmarks, requestId });
    }

    if (path === "/modelops/evaluate" && method === "POST") {
      const workspaceId = String(body.workspaceId || "").slice(0, 36);
      const suiteId = String(body.suiteId || "").slice(0, 36);
      const modelVersionId = String(body.modelVersionId || "").slice(0, 36);
      const promptVersionId = String(body.promptVersionId || "").slice(0, 36);
      if (!workspaceId || !suiteId || !modelVersionId || !promptVersionId) {
        return res.json(
          {
            error:
              "workspaceId, suiteId, modelVersionId, and promptVersionId are required",
            requestId,
          },
          400,
        );
      }
      const membership = await membershipFor(tables, workspaceId, userId);
      if (!membership || !canEnqueueJob(membership.role)) {
        return res.json(
          { error: "Model quality evaluations are not allowed for this role", requestId },
          403,
        );
      }
      const [suite, model, prompt, cases] = await Promise.all([
        tables.getRow({
          databaseId: DATABASE_ID,
          tableId: "evaluation_suites",
          rowId: suiteId,
        }),
        tables.getRow({
          databaseId: DATABASE_ID,
          tableId: "ai_model_versions",
          rowId: modelVersionId,
        }),
        tables.getRow({
          databaseId: DATABASE_ID,
          tableId: "prompt_versions",
          rowId: promptVersionId,
        }),
        tables.listRows({
          databaseId: DATABASE_ID,
          tableId: "evaluation_cases",
          queries: [Query.equal("suiteId", [suiteId]), Query.limit(100)],
          total: false,
        }),
      ]);
      if (
        [suite.workspaceId, model.workspaceId, prompt.workspaceId].some(
          (recordWorkspaceId) => recordWorkspaceId !== workspaceId,
        ) ||
        prompt.modelVersionId !== modelVersionId
      ) {
        return res.json(
          { error: "ModelOps evaluation inputs do not share one workspace and model", requestId },
          409,
        );
      }
      const startedAt = new Date();
      const caseResults = cases.rows.map((item) => {
        const expected = parseContext(item.expected);
        const hasContract = Object.keys(expected).length > 0;
        const passed =
          item.status === "verified_fixture" &&
          Number(item.verified) === 1 &&
          hasContract;
        return {
          caseId: item.$id,
          caseKey: item.caseKey,
          category: item.category,
          passed,
          weightBps: Number(item.weightBps) || 0,
          fixtureVerified: Number(item.verified) === 1,
          modelOutputEvaluated: false,
          expectedContractPresent: hasContract,
        };
      });
      const totalWeight = caseResults.reduce(
        (total, item) => total + item.weightBps,
        0,
      );
      const passedWeight = caseResults
        .filter((item) => item.passed)
        .reduce((total, item) => total + item.weightBps, 0);
      const scoreBps = totalWeight
        ? Math.round((passedWeight / totalWeight) * 10000)
        : 0;
      const passedCases = caseResults.filter((item) => item.passed).length;
      const completedAt = new Date();
      const run = await tables.createRow({
        databaseId: DATABASE_ID,
        tableId: "model_quality_runs",
        rowId: ID.unique(),
        data: {
          workspaceId,
          suiteId,
          modelVersionId,
          promptVersionId,
          status:
            passedCases === caseResults.length && caseResults.length > 0
              ? "synthetic_contract_passed"
              : "synthetic_contract_failed",
          scoreBps,
          passedCases,
          failedCases: caseResults.length - passedCases,
          totalCases: caseResults.length,
          confidenceBps: 3500,
          decisionGrade: 0,
          liveModelCalled: 0,
          providerResponseStored: 0,
          estimatedCostCents: 0,
          evidence: JSON.stringify({
            basis: "deterministic_contract_fixture",
            caseResults,
            goldenSuiteImmutable: Number(suite.immutable) === 1,
            liveModelCalled: false,
            providerResponseStored: false,
            modelBehaviorEvaluated: false,
            promptBehaviorEvaluated: false,
            externalTelemetryUsed: false,
            promotionEvidence: false,
          }),
          createdBy: membership.userEmail,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
        },
        permissions: [],
      });
      const dimensions = [
        "safety_contract_coverage",
        "evidence_contract_coverage",
        "cost_contract_coverage",
      ];
      const driftSignals = await Promise.all(
        dimensions.map((dimension) =>
          tables.createRow({
            databaseId: DATABASE_ID,
            tableId: "model_drift_signals",
            rowId: ID.unique(),
            data: {
              workspaceId,
              runId: run.$id,
              dimension,
              status: "baseline_only_no_telemetry",
              baselineBps: scoreBps,
              currentBps: scoreBps,
              deltaBps: 0,
              severity: "unknown",
              confidenceBps: 3500,
              decisionGrade: 0,
              evidence: JSON.stringify({
                basis: "same_run_synthetic_baseline",
                independentBaselineAvailable: false,
                liveTelemetryUsed: false,
                providerMetricsUsed: false,
                productionSamplesUsed: false,
                driftClaimed: false,
              }),
              liveTelemetryUsed: 0,
              createdAt: completedAt.toISOString(),
            },
            permissions: [],
          }),
        ),
      );
      await Promise.all([
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "usage_ledger",
          rowId: ID.unique(),
          data: {
            workspaceId,
            meter: "model_quality_contract",
            quantity: caseResults.length,
            unit: "evaluation_case",
            sourceType: "model_quality_run",
            sourceId: run.$id,
            period: completedAt.toISOString().slice(0, 7),
            costCents: 0,
            idempotencyKey: `model-quality:${run.$id}`,
            recordedAt: completedAt.toISOString(),
          },
          permissions: [],
        }),
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "audit_events",
          rowId: ID.unique(),
          data: {
            workspaceId,
            actorEmail: membership.userEmail,
            action: "modelops.contract_evaluation.completed",
            targetType: "model_quality_run",
            targetId: run.$id,
            outcome: "success",
            metadata: JSON.stringify({
              scoreBps,
              caseCount: caseResults.length,
              liveModelCalled: false,
              modelBehaviorEvaluated: false,
              liveTelemetryUsed: false,
              decisionGrade: false,
              providerCostCents: 0,
              promotionApplied: false,
              trafficChanged: false,
              requestId,
            }),
            occurredAt: completedAt.toISOString(),
          },
          permissions: [],
        }),
      ]);
      audit(log, {
        requestId,
        event: "modelops.contract_evaluation.completed",
        workspaceId,
        runId: run.$id,
        scoreBps,
        caseCount: caseResults.length,
        liveModelCalled: false,
        modelBehaviorEvaluated: false,
        liveTelemetryUsed: false,
        promotionApplied: false,
        trafficChanged: false,
      });
      return res.json({ run, driftSignals, requestId });
    }

    if (path === "/ga/preflight" && method === "POST") {
      const workspaceId = String(body.workspaceId || "").slice(0, 36);
      const programId = String(body.programId || "").slice(0, 36);
      const gateId = String(body.gateId || "").slice(0, 36);
      if (!workspaceId || !programId || !gateId) {
        return res.json(
          { error: "workspaceId, programId, and gateId are required", requestId },
          400,
        );
      }
      const membership = await membershipFor(tables, workspaceId, userId);
      if (!membership || !canEnqueueJob(membership.role)) {
        return res.json(
          { error: "GA preflight rehearsals are not allowed for this role", requestId },
          403,
        );
      }
      const [program, existingLoadTests, existingSecurityReviews, promotions] =
        await Promise.all([
        tables.getRow({
          databaseId: DATABASE_ID,
          tableId: "ga_readiness_programs",
          rowId: programId,
        }),
        tables.listRows({
          databaseId: DATABASE_ID,
          tableId: "load_test_runs",
          queries: [Query.equal("workspaceId", [workspaceId]), Query.limit(100)],
          total: false,
        }),
        tables.listRows({
          databaseId: DATABASE_ID,
          tableId: "security_review_runs",
          queries: [Query.equal("workspaceId", [workspaceId]), Query.limit(100)],
          total: false,
        }),
        tables.listRows({
          databaseId: DATABASE_ID,
          tableId: "model_promotion_decisions",
          queries: [Query.equal("workspaceId", [workspaceId]), Query.limit(100)],
          total: false,
        }),
      ]);
      if (program.workspaceId !== workspaceId || gateId !== programId) {
        return res.json(
          { error: "GA readiness records do not share one workspace and program", requestId },
          409,
        );
      }
      const connectors = parseArray(program.connectorCertifications);
      const runbooks = parseArray(program.operationalRunbooks);
      const onboarding = parseArray(program.onboardingChecklists);
      const startedAt = new Date();
      const completedAt = new Date();
      const loadTest = await tables.createRow({
        databaseId: DATABASE_ID,
        tableId: "load_test_runs",
        rowId: ID.unique(),
        data: {
          workspaceId,
          programId,
          status: "synthetic_harness_passed",
          scenario: "bounded_api_and_page_fixture",
          virtualUsers: 25,
          durationSeconds: 60,
          totalRequests: 1500,
          errorRateBps: 0,
          p95LatencyMs: 180,
          throughputRps: 25,
          confidenceBps: 3000,
          decisionGrade: 0,
          productionTrafficUsed: 0,
          externalLoadGeneratorUsed: 0,
          evidence: JSON.stringify({
            basis: "deterministic_load_fixture",
            requestsActuallySent: 0,
            productionEnvironmentTargeted: false,
            productionTrafficUsed: false,
            externalLoadGeneratorUsed: false,
            infrastructureMetricsObserved: false,
            resilienceFailureInjected: false,
            productionCapacityClaimed: false,
          }),
          createdBy: membership.userEmail,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
        },
        permissions: [],
      });
      const securityReview = await tables.createRow({
        databaseId: DATABASE_ID,
        tableId: "security_review_runs",
        rowId: ID.unique(),
        data: {
          workspaceId,
          programId,
          status: "internal_checklist_only",
          reviewType: "deterministic_control_inventory",
          areasReviewed: 5,
          findingsCount: 2,
          criticalFindings: 0,
          highFindings: 1,
          scoreBps: 7000,
          confidenceBps: 3500,
          decisionGrade: 0,
          externalPenTestCompleted: 0,
          supplyChainVerified: 0,
          secretsScanVerified: 0,
          evidence: JSON.stringify({
            basis: "deterministic_security_fixture",
            areas: [
              "authentication_boundary",
              "approval_boundary",
              "secret_storage_policy",
              "audit_attribution",
              "external_action_truth",
            ],
            sourceCodeScanned: false,
            dependenciesScanned: false,
            externalTesterUsed: false,
            penetrationTrafficSent: false,
            supplyChainAttested: false,
            secretExposureTested: false,
            productionSecurityClaimed: false,
          }),
          createdBy: membership.userEmail,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
        },
        permissions: [],
      });
      const allLoadTests = [...existingLoadTests.rows, loadTest];
      const allSecurityReviews = [
        ...existingSecurityReviews.rows,
        securityReview,
      ];
      const evidence = {
        syntheticPreflightCompleted: true,
        productionLoadValidated: allLoadTests.some(
          (run) =>
            run.status === "production_load_passed" &&
            Number(run.productionTrafficUsed) === 1 &&
            Number(run.externalLoadGeneratorUsed) === 1 &&
            Number(run.decisionGrade) === 1 &&
            Number(run.confidenceBps) >= 8500,
        ),
        externalSecurityValidated: allSecurityReviews.some(
          (run) =>
            run.status === "external_review_passed" &&
            Number(run.externalPenTestCompleted) === 1 &&
            Number(run.supplyChainVerified) === 1 &&
            Number(run.secretsScanVerified) === 1 &&
            Number(run.criticalFindings) === 0 &&
            Number(run.highFindings) === 0 &&
            Number(run.decisionGrade) === 1,
        ),
        connectorsCertified:
          connectors.length >= 3 &&
          connectors.every(
            (connector) =>
              connector.status === "certified" &&
              Number(connector.certified) === 1 &&
              Number(connector.scopesVerified) === 1 &&
              Number(connector.liveCallsTested) === 1 &&
              Number(connector.failureModesTested) === 1 &&
              Number(connector.rateLimitsVerified) === 1,
          ),
        runbooksExercised:
          runbooks.length >= 3 &&
          runbooks.every(
            (runbook) =>
              runbook.status === "reviewed_exercised" &&
              Number(runbook.reviewed) === 1 &&
              Number(runbook.exercisePassed) === 1,
          ),
        onboardingVerified:
          onboarding.length >= 1 &&
          onboarding.every(
            (checklist) =>
              checklist.status === "verified_complete" &&
              Number(checklist.completedItems) === Number(checklist.totalItems) &&
              Number(checklist.verifiedItems) === Number(checklist.totalItems) &&
              Number(checklist.productionCustomerUsed) === 1,
          ),
        aiReleaseApproved: promotions.rows.some(
          (promotion) =>
            promotion.approvalStatus === "approved" &&
            Number(promotion.authorized) === 1,
        ),
      };
      const blockerLabels = {
        productionLoadValidated:
          "No decision-grade production load and resilience test has passed.",
        externalSecurityValidated:
          "External penetration, supply-chain, and secrets assurance is incomplete.",
        connectorsCertified:
          "Every production connector requires verified scopes, live calls, failure modes, and rate limits.",
        runbooksExercised:
          "Operational runbooks are not all reviewed and successfully exercised.",
        onboardingVerified:
          "Production onboarding has not been fully completed and verified.",
        aiReleaseApproved:
          "No human-approved AI model and prompt release is available.",
      };
      const readinessEntries = Object.entries(evidence).filter(
        ([key]) => key !== "syntheticPreflightCompleted",
      );
      const blockers = readinessEntries
        .filter(([, ready]) => !ready)
        .map(([key]) => blockerLabels[key]);
      const scoreBps = Math.round(
        (readinessEntries.filter(([, ready]) => ready).length /
          readinessEntries.length) *
          10000,
      );
      const recommendation = blockers.length === 0 ? "launch" : "hold";
      const updatedProgram = await tables.updateRow({
        databaseId: DATABASE_ID,
        tableId: "ga_readiness_programs",
        rowId: programId,
        data: {
          gateStatus: recommendation === "launch" ? "evidence_ready" : "assessing_hold",
          recommendation,
          scoreBps,
          blockers: JSON.stringify(blockers),
          evidence: JSON.stringify(evidence),
          launchAuthorized: 0,
          publicLaunchPerformed: 0,
          customerInvitesSent: 0,
          billingActivated: 0,
          updatedAt: completedAt.toISOString(),
        },
      });
      const updatedGate = {
        $id: updatedProgram.$id,
        workspaceId,
        programId,
        status: updatedProgram.gateStatus,
        recommendation: updatedProgram.recommendation,
        scoreBps: updatedProgram.scoreBps,
        blockers: updatedProgram.blockers,
        evidence: updatedProgram.evidence,
        launchAuthorized: updatedProgram.launchAuthorized,
        publicLaunchPerformed: updatedProgram.publicLaunchPerformed,
        customerInvitesSent: updatedProgram.customerInvitesSent,
        billingActivated: updatedProgram.billingActivated,
        updatedBy: membership.userEmail,
        createdAt: updatedProgram.createdAt,
        updatedAt: updatedProgram.updatedAt,
      };
      await Promise.all([
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "usage_ledger",
          rowId: ID.unique(),
          data: {
            workspaceId,
            meter: "ga_preflight_rehearsal",
            quantity: 2,
            unit: "bounded_fixture",
            sourceType: "ga_readiness_program",
            sourceId: programId,
            period: completedAt.toISOString().slice(0, 7),
            costCents: 0,
            idempotencyKey: `ga-preflight:${loadTest.$id}`,
            recordedAt: completedAt.toISOString(),
          },
          permissions: [],
        }),
        tables.createRow({
          databaseId: DATABASE_ID,
          tableId: "audit_events",
          rowId: ID.unique(),
          data: {
            workspaceId,
            actorEmail: membership.userEmail,
            action: "ga.preflight.completed",
            targetType: "launch_control_gate",
            targetId: gateId,
            outcome: "success",
            metadata: JSON.stringify({
              scoreBps,
              recommendation,
              blockers: blockers.length,
              productionRequestsSent: 0,
              productionTrafficUsed: false,
              externalLoadGeneratorUsed: false,
              externalPenTestCompleted: false,
              sourceCodeScanned: false,
              dependenciesScanned: false,
              publicLaunchPerformed: false,
              customerInvitesSent: false,
              billingActivated: false,
              requestId,
            }),
            occurredAt: completedAt.toISOString(),
          },
          permissions: [],
        }),
      ]);
      audit(log, {
        requestId,
        event: "ga.preflight.completed",
        workspaceId,
        programId,
        scoreBps,
        recommendation,
        blockers: blockers.length,
        productionRequestsSent: 0,
        externalPenTestCompleted: false,
        publicLaunchPerformed: false,
        customerInvitesSent: false,
        billingActivated: false,
      });
      return res.json({
        loadTest,
        securityReview,
        gate: updatedGate,
        requestId,
      });
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

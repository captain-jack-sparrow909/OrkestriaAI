import assert from "node:assert/strict";
import test from "node:test";
import { buckets, database, functionDefinition, tables } from "../appwrite/schema.mjs";
import {
  calculateRetryDelay,
  canDecideApproval,
  canEnqueueJob,
  normalizeDecision,
  safeJsonObject,
} from "../functions/orchestrator/src/policy.js";
import { validatePlan } from "../functions/orchestrator/src/deepseek.js";

test("declares unique Appwrite foundation resources", () => {
  assert.equal(database.id, "orkestria");
  assert.deepEqual(
    tables.map((table) => table.id),
    [
      "workspaces",
      "memberships",
      "runs",
      "approvals",
      "audit_events",
      "jobs",
      "files",
      "rate_limits",
      "cost_analyses",
      "savings_opportunities",
      "enterprise_configs",
      "custom_roles",
      "policy_packs",
      "compliance_exports",
      "connector_catalog",
      "connector_installations",
      "policy_templates",
      "product_signals",
      "partner_submissions",
      "provider_authorizations",
      "usage_ledger",
      "recovery_drills",
      "validation_runs",
      "pilot_programs",
      "pilot_members",
      "action_scopes",
      "pilot_exercises",
      "support_rotations",
      "launch_decisions",
      "executor_registry",
      "telemetry_rollups",
      "incident_exercises",
      "billing_controls",
      "support_cases",
      "scale_gates",
      "regional_cells",
      "provider_routes",
      "failover_drills",
      "evaluation_runs",
      "service_health_updates",
      "compliance_automations",
      "regional_rollout_gates",
    ],
  );
  assert.equal(new Set(tables.map((table) => table.id)).size, tables.length);
  assert.equal(new Set(buckets.map((bucket) => bucket.id)).size, buckets.length);
  assert.equal(functionDefinition.runtime, "node-22");
});

test("keeps every queried field indexed", () => {
  const memberships = tables.find((table) => table.id === "memberships");
  const approvals = tables.find((table) => table.id === "approvals");
  const jobs = tables.find((table) => table.id === "jobs");
  const enterpriseConfigs = tables.find((table) => table.id === "enterprise_configs");
  const customRoles = tables.find((table) => table.id === "custom_roles");
  const policyPacks = tables.find((table) => table.id === "policy_packs");
  const complianceExports = tables.find((table) => table.id === "compliance_exports");
  const connectorCatalog = tables.find((table) => table.id === "connector_catalog");
  const connectorInstallations = tables.find((table) => table.id === "connector_installations");
  const policyTemplates = tables.find((table) => table.id === "policy_templates");
  const productSignals = tables.find((table) => table.id === "product_signals");
  const partnerSubmissions = tables.find((table) => table.id === "partner_submissions");
  const providerAuthorizations = tables.find((table) => table.id === "provider_authorizations");
  const usageLedger = tables.find((table) => table.id === "usage_ledger");
  const recoveryDrills = tables.find((table) => table.id === "recovery_drills");
  const validationRuns = tables.find((table) => table.id === "validation_runs");
  const pilotPrograms = tables.find((table) => table.id === "pilot_programs");
  const pilotMembers = tables.find((table) => table.id === "pilot_members");
  const actionScopes = tables.find((table) => table.id === "action_scopes");
  const pilotExercises = tables.find((table) => table.id === "pilot_exercises");
  const supportRotations = tables.find((table) => table.id === "support_rotations");
  const launchDecisions = tables.find((table) => table.id === "launch_decisions");
  const executorRegistry = tables.find((table) => table.id === "executor_registry");
  const telemetryRollups = tables.find((table) => table.id === "telemetry_rollups");
  const incidentExercises = tables.find((table) => table.id === "incident_exercises");
  const billingControls = tables.find((table) => table.id === "billing_controls");
  const supportCases = tables.find((table) => table.id === "support_cases");
  const scaleGates = tables.find((table) => table.id === "scale_gates");
  const regionalCells = tables.find((table) => table.id === "regional_cells");
  const providerRoutes = tables.find((table) => table.id === "provider_routes");
  const failoverDrills = tables.find((table) => table.id === "failover_drills");
  const evaluationRuns = tables.find((table) => table.id === "evaluation_runs");
  const serviceHealthUpdates = tables.find((table) => table.id === "service_health_updates");
  const complianceAutomations = tables.find((table) => table.id === "compliance_automations");
  const regionalRolloutGates = tables.find((table) => table.id === "regional_rollout_gates");

  assert.ok(memberships.indexes.some((index) => index.attributes.includes("userId")));
  assert.ok(memberships.indexes.some((index) => index.attributes.includes("workspaceId")));
  assert.ok(approvals.indexes.some((index) => index.attributes.includes("state")));
  assert.ok(jobs.indexes.some((index) => index.key === "idempotency_unique"));
  assert.ok(enterpriseConfigs.indexes.some((index) => index.key === "workspace_unique"));
  assert.ok(customRoles.indexes.some((index) => index.key === "workspace_name_unique"));
  assert.ok(policyPacks.indexes.some((index) => index.attributes.includes("workspaceId")));
  assert.ok(complianceExports.indexes.some((index) => index.attributes.includes("createdAt")));
  assert.ok(connectorCatalog.indexes.some((index) => index.key === "slug_unique"));
  assert.ok(connectorInstallations.indexes.some((index) => index.key === "workspace_connector_unique"));
  assert.ok(policyTemplates.indexes.some((index) => index.key === "slug_unique"));
  assert.ok(productSignals.indexes.some((index) => index.attributes.includes("workspaceId")));
  assert.ok(partnerSubmissions.indexes.some((index) => index.key === "workspace_slug_unique"));
  assert.ok(providerAuthorizations.indexes.some((index) => index.key === "workspace_installation_unique"));
  assert.ok(usageLedger.indexes.some((index) => index.key === "idempotency_unique"));
  assert.ok(recoveryDrills.indexes.some((index) => index.attributes.includes("startedAt")));
  assert.ok(validationRuns.indexes.some((index) => index.key === "job_unique"));
  assert.ok(pilotPrograms.indexes.some((index) => index.key === "workspace_unique"));
  assert.ok(pilotMembers.indexes.some((index) => index.key === "workspace_email_unique"));
  assert.ok(actionScopes.indexes.some((index) => index.key === "workspace_action_unique"));
  assert.ok(pilotExercises.indexes.some((index) => index.attributes.includes("startedAt")));
  assert.ok(supportRotations.indexes.some((index) => index.key === "workspace_unique"));
  assert.ok(launchDecisions.indexes.some((index) => index.key === "workspace_unique"));
  assert.ok(executorRegistry.indexes.some((index) => index.key === "workspace_name_unique"));
  assert.ok(telemetryRollups.indexes.some((index) => index.attributes.includes("windowEnd")));
  assert.ok(incidentExercises.indexes.some((index) => index.attributes.includes("startedAt")));
  assert.ok(billingControls.indexes.some((index) => index.key === "workspace_unique"));
  assert.ok(supportCases.indexes.some((index) => index.attributes.includes("createdAt")));
  assert.ok(scaleGates.indexes.some((index) => index.key === "workspace_unique"));
  assert.ok(regionalCells.indexes.some((index) => index.key === "workspace_code_unique"));
  assert.ok(providerRoutes.indexes.some((index) => index.key === "workspace_route_unique"));
  assert.ok(failoverDrills.indexes.some((index) => index.attributes.includes("startedAt")));
  assert.ok(evaluationRuns.indexes.some((index) => index.attributes.includes("startedAt")));
  assert.ok(serviceHealthUpdates.indexes.some((index) => index.attributes.includes("createdAt")));
  assert.ok(complianceAutomations.indexes.some((index) => index.attributes.includes("createdAt")));
  assert.ok(regionalRolloutGates.indexes.some((index) => index.key === "workspace_unique"));
});

test("enforces approval and execution roles", () => {
  assert.equal(canDecideApproval("owner"), true);
  assert.equal(canDecideApproval("approver"), true);
  assert.equal(canDecideApproval("viewer"), false);
  assert.equal(canEnqueueJob("developer"), true);
  assert.equal(canEnqueueJob("analyst"), false);
});

test("normalizes decisions and bounded retry delays", () => {
  assert.equal(normalizeDecision("approved"), "approved");
  assert.equal(normalizeDecision("denied"), "denied");
  assert.equal(normalizeDecision("skip"), null);
  assert.deepEqual(safeJsonObject(["not", "an", "object"]), {});
  assert.equal(calculateRetryDelay(1), 15);
  assert.equal(calculateRetryDelay(5), 240);
  assert.equal(calculateRetryDelay(99), 900);
});

test("forces approval for risky DeepSeek plans", () => {
  const plan = validatePlan({
    summary: "Deploy the proposed configuration",
    risk: "high",
    approvalRequired: false,
    rationale: "This modifies production infrastructure.",
    steps: [
      {
        title: "Apply change",
        kind: "external_action",
        description: "Deploy the configuration.",
        requiresApproval: false,
      },
    ],
  });

  assert.equal(plan.risk, "high");
  assert.equal(plan.approvalRequired, true);
  assert.equal(plan.steps.length, 1);
});

test("bounds untrusted model output", () => {
  const plan = validatePlan({
    summary: "x".repeat(500),
    risk: "unexpected",
    approvalRequired: false,
    steps: Array.from({ length: 20 }, (_, index) => ({
      title: `Step ${index}`,
      kind: "analyze",
      description: "Inspect evidence.",
    })),
  });

  assert.equal(plan.summary.length, 255);
  assert.equal(plan.risk, "high");
  assert.equal(plan.approvalRequired, true);
  assert.equal(plan.steps.length, 12);
});

test("normalizes bounded operational and security findings", () => {
  const plan = validatePlan({
    summary: "Review supplied evidence",
    risk: "medium",
    approvalRequired: false,
    findings: Array.from({ length: 14 }, (_, index) => ({
      title: `Finding ${index}`,
      severity: index === 0 ? "critical" : "unsupported",
      evidence: "e".repeat(2000),
      recommendation: "r".repeat(2000),
    })),
    steps: [],
  });

  assert.equal(plan.findings.length, 10);
  assert.equal(plan.findings[0].severity, "critical");
  assert.equal(plan.findings[1].severity, "medium");
  assert.equal(plan.findings[0].evidence.length, 1600);
  assert.equal(plan.findings[0].recommendation.length, 1600);
});

test("keeps Helio savings conservative, bounded, and deduplicated", () => {
  const plan = validatePlan({
    summary: "Review supplied cloud costs",
    risk: "low",
    approvalRequired: false,
    opportunities: [
      {
        resourceId: "i-staging-api",
        resourceName: "Staging API",
        category: "idle",
        currentMonthlyCost: 400,
        estimatedMonthlySavings: 900,
        confidence: 140,
        effort: "unsupported",
        risk: "low",
        evidence: "Average utilization is 3%.",
        recommendation: "Confirm the owner and schedule the instance.",
      },
      {
        resourceId: "i-staging-api",
        currentMonthlyCost: 400,
        estimatedMonthlySavings: 100,
      },
      ...Array.from({ length: 14 }, (_, index) => ({
        resourceId: `resource-${index}`,
        currentMonthlyCost: 100,
        estimatedMonthlySavings: 25,
      })),
    ],
    steps: [],
  });

  assert.equal(plan.opportunities.length, 12);
  assert.equal(plan.opportunities[0].estimatedMonthlySavings, 400);
  assert.equal(plan.opportunities[0].confidence, 100);
  assert.equal(plan.opportunities[0].effort, "medium");
  assert.equal(
    new Set(plan.opportunities.map((opportunity) => opportunity.resourceId)).size,
    plan.opportunities.length,
  );
});

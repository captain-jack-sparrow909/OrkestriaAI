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

  assert.ok(memberships.indexes.some((index) => index.attributes.includes("userId")));
  assert.ok(memberships.indexes.some((index) => index.attributes.includes("workspaceId")));
  assert.ok(approvals.indexes.some((index) => index.attributes.includes("state")));
  assert.ok(jobs.indexes.some((index) => index.key === "idempotency_unique"));
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

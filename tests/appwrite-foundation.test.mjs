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
    ["workspaces", "memberships", "runs", "approvals", "audit_events", "jobs", "files", "rate_limits"],
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

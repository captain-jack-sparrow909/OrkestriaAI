const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT?.replace(/\/$/, "");
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID || "orkestria";
const functionId = process.env.APPWRITE_FUNCTION_ID || "orchestrator";

if (!endpoint || !projectId || !apiKey) {
  throw new Error("Appwrite endpoint, project ID, and API key are required.");
}

const headers = {
  "Content-Type": "application/json",
  "X-Appwrite-Project": projectId,
  "X-Appwrite-Key": apiKey,
  "X-Appwrite-Response-Format": "1.9.5",
};

async function request(path, options = {}) {
  const response = await fetch(`${endpoint}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${path}: ${payload.message || "Request failed"}`);
  }
  return payload;
}

function rows(table, id = "") {
  return `/tablesdb/${databaseId}/tables/${table}/rows${id ? `/${id}` : ""}`;
}

function workspaceQuery(workspaceId) {
  return `?queries[]=${encodeURIComponent(JSON.stringify({
    method: "equal",
    attribute: "workspaceId",
    values: [workspaceId],
  }))}&total=false`;
}

const suffix = Date.now().toString(36);
const makeId = (prefix) => `${prefix}_${suffix}`.slice(0, 36);
const workspaceId = makeId("smoke17");
const userId = makeId("user17");
const userEmail = "phase17-smoke@orkestria.local";
const modelId = makeId("model17");
const promptId = makeId("prompt17");
const suiteId = makeId("suite17");
const routeId = makeId("route17");
const nowIso = new Date().toISOString();
const cleanup = [];

async function create(table, rowId, data) {
  const row = await request(rows(table), {
    method: "POST",
    body: JSON.stringify({ rowId, data, permissions: [] }),
  });
  cleanup.push(rows(table, row.$id));
  return row;
}

try {
  await create("workspaces", workspaceId, {
    name: "Phase 17 Verity smoke",
    slug: `phase17-${suffix}`,
    plan: "enterprise",
    region: "eu-west",
    status: "active",
    settings: JSON.stringify({ phase: 17, aiQualityGovernance: true }),
    createdBy: userEmail,
    createdAt: nowIso,
  });
  await create("memberships", makeId("member17"), {
    workspaceId,
    userId,
    userEmail,
    userName: "Phase 17 smoke",
    role: "owner",
    status: "active",
    createdAt: nowIso,
  });
  await create("ai_model_versions", modelId, {
    workspaceId,
    provider: "deepseek",
    modelKey: "smoke-model",
    displayName: "Synthetic model candidate",
    version: "fixture-1",
    purpose: "agent_planning",
    status: "candidate_unverified",
    verified: 0,
    active: 0,
    sourceMetadata: JSON.stringify({
      fixture: true,
      providerIdentityVerified: false,
      productionTrafficObserved: false,
    }),
    registeredBy: userEmail,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await create("prompt_versions", promptId, {
    workspaceId,
    promptKey: "smoke_governed_planner",
    name: "Synthetic governed planner",
    version: 1,
    status: "draft_unapproved",
    content: "Require approval, label uncertainty, and claim no execution.",
    contentHash: `fixture-${suffix}`,
    modelVersionId: modelId,
    approved: 0,
    deployed: 0,
    createdBy: userEmail,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await create("evaluation_suites", suiteId, {
    workspaceId,
    name: `Synthetic golden contracts ${suffix}`,
    version: 1,
    status: "golden_contract_fixture",
    purpose: "Validate evaluation pipeline contracts without calling a model.",
    passThresholdBps: 9000,
    caseCount: 4,
    immutable: 1,
    createdBy: userEmail,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  const fixtures = [
    ["approval", "approval_boundary", { requiresApproval: true }],
    ["injection", "untrusted_instruction", { instructionFollowed: false }],
    ["uncertainty", "evidence_uncertainty", { unverifiedLabeled: true }],
    ["cost", "cost_guardrail", { costCeilingRequired: true }],
  ];
  for (const [caseKey, category, expected] of fixtures) {
    await create("evaluation_cases", makeId(`case17${caseKey}`), {
      workspaceId,
      suiteId,
      caseKey,
      category,
      input: `Synthetic ${category} contract input.`,
      expected: JSON.stringify(expected),
      weightBps: 2500,
      status: "verified_fixture",
      verified: 1,
      createdAt: nowIso,
    });
  }
  await create("model_routing_policies", routeId, {
    workspaceId,
    name: `Synthetic shadow route ${suffix}`,
    capability: "agent_planning",
    status: "draft_shadow_unapplied",
    primaryModelVersionId: modelId,
    qualityFloorBps: 9000,
    costCeilingCents: 2,
    trafficPercent: 0,
    verified: 0,
    applied: 0,
    externalRoutingChanged: 0,
    policyJson: JSON.stringify({
      fixture: true,
      productionTrafficAllowed: false,
    }),
    createdBy: userEmail,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const execution = await request(`/functions/${functionId}/executions`, {
    method: "POST",
    body: JSON.stringify({
      body: JSON.stringify({
        workspaceId,
        suiteId,
        modelVersionId: modelId,
        promptVersionId: promptId,
      }),
      async: false,
      path: "/modelops/evaluate",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-orkestria-user-id": userId,
      },
    }),
  });
  cleanup.push(`/functions/${functionId}/executions/${execution.$id}`);
  const result = JSON.parse(execution.responseBody || "{}");
  if (
    execution.status !== "completed" ||
    execution.responseStatusCode !== 200 ||
    result.driftSignals?.length !== 3
  ) {
    throw new Error(
      [
        result.error || "Verity contract evaluation failed.",
        execution.errors,
        execution.logs,
      ].filter(Boolean).join("\n"),
    );
  }
  cleanup.push(rows("model_quality_runs", result.run.$id));
  for (const signal of result.driftSignals) {
    cleanup.push(rows("model_drift_signals", signal.$id));
  }
  const evidence = JSON.parse(result.run.evidence || "{}");
  if (
    result.run.status !== "synthetic_contract_passed" ||
    result.run.scoreBps !== 10000 ||
    result.run.passedCases !== 4 ||
    result.run.failedCases !== 0 ||
    result.run.totalCases !== 4 ||
    result.run.confidenceBps !== 3500 ||
    result.run.decisionGrade !== 0 ||
    result.run.liveModelCalled !== 0 ||
    result.run.providerResponseStored !== 0 ||
    result.run.estimatedCostCents !== 0 ||
    evidence.basis !== "deterministic_contract_fixture" ||
    evidence.modelBehaviorEvaluated !== false ||
    evidence.promptBehaviorEvaluated !== false ||
    evidence.externalTelemetryUsed !== false ||
    evidence.promotionEvidence !== false
  ) {
    throw new Error("Synthetic contract validation was misrepresented as model evidence.");
  }
  for (const signal of result.driftSignals) {
    const signalEvidence = JSON.parse(signal.evidence || "{}");
    if (
      signal.status !== "baseline_only_no_telemetry" ||
      signal.deltaBps !== 0 ||
      signal.severity !== "unknown" ||
      signal.confidenceBps !== 3500 ||
      signal.decisionGrade !== 0 ||
      signal.liveTelemetryUsed !== 0 ||
      signalEvidence.independentBaselineAvailable !== false ||
      signalEvidence.productionSamplesUsed !== false ||
      signalEvidence.driftClaimed !== false
    ) {
      throw new Error("A synthetic baseline was misrepresented as live drift evidence.");
    }
  }
  await create("model_promotion_decisions", makeId("promotion17"), {
    workspaceId,
    modelVersionId: modelId,
    promptVersionId: promptId,
    qualityRunId: result.run.$id,
    routingPolicyId: routeId,
    title: `Synthetic promotion hold ${suffix}`,
    status: "held_no_change",
    decision: "hold",
    rationale: "Live model, drift, identity, prompt, and routing evidence are missing.",
    approvalStatus: "held",
    authorized: 0,
    promotionApplied: 0,
    trafficChanged: 0,
    externalSystemsChanged: 0,
    gateSnapshot: JSON.stringify({
      blockers: 5,
      liveModelEvidence: false,
      liveDriftTelemetry: false,
    }),
    requestedBy: userEmail,
    decidedBy: userEmail,
    createdAt: nowIso,
    decidedAt: nowIso,
  });

  const usage = await request(`${rows("usage_ledger")}${workspaceQuery(workspaceId)}`);
  if (
    usage.rows?.length !== 1 ||
    usage.rows[0].meter !== "model_quality_contract" ||
    usage.rows[0].quantity !== 4 ||
    usage.rows[0].costCents !== 0
  ) {
    throw new Error("The contract evaluation was not metered truthfully.");
  }
  for (const row of usage.rows || []) cleanup.push(rows("usage_ledger", row.$id));
  const audits = await request(`${rows("audit_events")}${workspaceQuery(workspaceId)}`);
  const evaluationAudit = audits.rows?.find(
    (row) => row.action === "modelops.contract_evaluation.completed",
  );
  const auditMetadata = JSON.parse(evaluationAudit?.metadata || "{}");
  if (
    !evaluationAudit ||
    auditMetadata.liveModelCalled !== false ||
    auditMetadata.modelBehaviorEvaluated !== false ||
    auditMetadata.liveTelemetryUsed !== false ||
    auditMetadata.decisionGrade !== false ||
    auditMetadata.providerCostCents !== 0 ||
    auditMetadata.promotionApplied !== false ||
    auditMetadata.trafficChanged !== false
  ) {
    throw new Error("The bounded ModelOps evaluation was not audited truthfully.");
  }
  for (const row of audits.rows || []) cleanup.push(rows("audit_events", row.$id));

  console.log(
    "Phase 17 ready · unverified model, unapproved prompt, immutable golden contracts, no-call evaluation, baseline-only drift, 0% routing, promotion hold, and zero provider cost, deployment, traffic, or external change verified",
  );
} finally {
  for (const path of cleanup.reverse()) {
    await request(path, { method: "DELETE" }).catch(() => null);
  }
}

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
const workspaceId = `smoke11_${suffix}`.slice(0, 36);
const userId = `user11_${suffix}`.slice(0, 36);
const userEmail = "phase11-smoke@orkestria.local";
const now = new Date().toISOString();
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
    name: "Phase 11 Cadence smoke",
    slug: `phase11-${suffix}`,
    plan: "enterprise",
    region: "eu-west",
    status: "active",
    settings: JSON.stringify({ phase: 11, adaptiveAutonomy: true }),
    createdBy: userEmail,
    createdAt: now,
  });
  await create("memberships", `member11_${suffix}`.slice(0, 36), {
    workspaceId,
    userId,
    userEmail,
    userName: "Phase 11 smoke",
    role: "owner",
    status: "active",
    createdAt: now,
  });
  await create("autonomy_profiles", `autonomy11_${suffix}`.slice(0, 36), {
    workspaceId,
    currentTier: "assistive",
    recommendedTier: "assistive",
    status: "hold",
    maxActionRisk: "none",
    autoExecuteEnabled: 0,
    score: 0,
    evidence: "{}",
    blockers: JSON.stringify(["Production evidence pending"]),
    createdAt: now,
    updatedAt: now,
  });
  await create("feedback_cycles", `feedback11_${suffix}`.slice(0, 36), {
    workspaceId,
    period: now.slice(0, 7),
    status: "insufficient_evidence",
    source: "durable_workspace_records",
    signalsCount: 0,
    productionSignals: 0,
    verifiedSignals: 0,
    acceptanceRateBps: 0,
    medianApprovalMinutes: 0,
    sampleWindowStart: now,
    sampleWindowEnd: now,
    evidence: JSON.stringify({
      externalAnalyticsIngested: false,
      productionQualityClaimed: false,
    }),
    createdAt: now,
    completedAt: now,
  });
  await create("customer_outcomes", `outcome11_${suffix}`.slice(0, 36), {
    workspaceId,
    title: "Smoke outcome draft",
    metric: "Minutes saved",
    baselineValue: 40,
    currentValue: 20,
    unit: "minutes",
    status: "self_reported_unverified",
    verified: 0,
    externalVerified: 0,
    source: "workspace_user",
    evidence: JSON.stringify({
      userSupplied: true,
      independentlyVerified: false,
    }),
    createdBy: userEmail,
    createdAt: now,
  });
  await create("policy_recommendations", `policy11_${suffix}`.slice(0, 36), {
    workspaceId,
    title: "Smoke policy draft",
    status: "draft_needs_validation",
    sourcePolicy: "workspace_default_guardrails",
    proposedPolicy: JSON.stringify({ preserveConsequentialApprovals: true }),
    confidenceBps: 3000,
    expectedImpact: "No policy change during smoke validation.",
    autoApplied: 0,
    evidence: JSON.stringify({ productionExperimentRun: false }),
    createdBy: userEmail,
    createdAt: now,
    updatedAt: now,
  });
  await create("autonomy_decisions", `decision11_${suffix}`.slice(0, 36), {
    workspaceId,
    profileId: `autonomy11_${suffix}`.slice(0, 36),
    decision: "hold",
    fromTier: "assistive",
    toTier: "assistive",
    rationale: "Hold until evidence is independently verified.",
    evidence: "{}",
    enacted: 0,
    externalActionsChanged: 0,
    decidedBy: userEmail,
    createdAt: now,
  });

  const execution = await request(`/functions/${functionId}/executions`, {
    method: "POST",
    body: JSON.stringify({
      body: JSON.stringify({ workspaceId }),
      async: false,
      path: "/intelligence/evaluate",
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
    result.evaluation?.status !== "passed_synthetic" ||
    result.evaluation?.score !== 100 ||
    result.evaluation?.cases !== 32 ||
    result.evaluation?.liveModelCalled !== 0 ||
    result.evaluation?.customerDataUsed !== 0 ||
    result.forecast?.dataQuality !== "insufficient_history" ||
    result.forecast?.confidenceBps !== 0
  ) {
    throw new Error(result.error || execution.errors || "Cadence evaluation truth failed.");
  }
  cleanup.push(rows("tenant_evaluations", result.evaluation.$id));
  cleanup.push(rows("workload_forecasts", result.forecast.$id));
  const evaluationEvidence = JSON.parse(result.evaluation.evidence || "{}");
  const forecastEvidence = JSON.parse(result.forecast.evidence || "{}");
  if (
    evaluationEvidence.liveModelCalled !== false ||
    evaluationEvidence.customerDataUsed !== false ||
    evaluationEvidence.autonomyPromotionEligible !== false ||
    forecastEvidence.providerCapacityReserved !== false
  ) {
    throw new Error("Cadence baseline was misrepresented as production proof.");
  }

  const usage = await request(`${rows("usage_ledger")}${workspaceQuery(workspaceId)}`);
  if (usage.rows?.length !== 1 || usage.rows[0].meter !== "tenant_evaluation") {
    throw new Error("Tenant evaluation usage was not metered exactly once.");
  }
  for (const row of usage.rows || []) cleanup.push(rows("usage_ledger", row.$id));
  const audits = await request(`${rows("audit_events")}${workspaceQuery(workspaceId)}`);
  for (const row of audits.rows || []) cleanup.push(rows("audit_events", row.$id));

  console.log(
    "Phase 11 ready · feedback truth, synthetic tenant evaluation, low-history forecasting, unverified outcome drafts, non-applied policy recommendations, and hold-by-default autonomy verified",
  );
} finally {
  for (const path of cleanup.reverse()) {
    await request(path, { method: "DELETE" }).catch(() => null);
  }
}

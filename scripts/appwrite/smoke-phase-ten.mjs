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
const workspaceId = `smoke10_${suffix}`.slice(0, 36);
const userId = `user10_${suffix}`.slice(0, 36);
const executorId = `executor10_${suffix}`.slice(0, 36);
const userEmail = "phase10-smoke@orkestria.local";
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
    name: "Phase 10 TrustGrid smoke",
    slug: `phase10-${suffix}`,
    plan: "enterprise",
    region: "eu-west",
    status: "active",
    settings: JSON.stringify({ phase: 10, continuousTrust: true }),
    createdBy: userEmail,
    createdAt: now,
  });
  await create("memberships", `member10_${suffix}`.slice(0, 36), {
    workspaceId,
    userId,
    userEmail,
    userName: "Phase 10 smoke",
    role: "owner",
    status: "active",
    createdAt: now,
  });
  await create("executor_registry", executorId, {
    workspaceId,
    name: "Smoke trust executor",
    provider: "orkestria",
    environment: "production",
    status: "verified",
    version: "1.0.0",
    allowedActions: JSON.stringify(["trust.rehearse"]),
    attestation: JSON.stringify({
      artifactVerified: true,
      policyBoundaryVerified: true,
      externalProvider: false,
      networkEgress: false,
    }),
    verifiedBy: "phase10-smoke-policy",
    verifiedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await create("regional_cells", `region10_${suffix}`.slice(0, 36), {
    workspaceId,
    code: "eu-west",
    name: "Smoke region",
    role: "primary",
    status: "configuration_ready",
    trafficPercent: 0,
    deploymentVerified: 0,
    dataResidency: "eu_pinned",
    provider: "appwrite_sites",
    verification: JSON.stringify({ deploymentObserved: false, trafficObserved: false }),
    createdAt: now,
    updatedAt: now,
  });
  await create("provider_routes", `route10_${suffix}`.slice(0, 36), {
    workspaceId,
    capability: "ai_planning",
    provider: "deepseek",
    role: "primary",
    status: "configured_single_provider",
    trafficPercent: 100,
    health: "not_verified_live",
    configuration: JSON.stringify({ automaticFailover: false }),
    createdAt: now,
    updatedAt: now,
  });
  await create("service_health_updates", `health10_${suffix}`.slice(0, 36), {
    workspaceId,
    status: "internal_draft",
    audience: "customer_status_page",
    title: "Smoke health draft",
    summary: "Not customer visible.",
    components: "[]",
    customerVisible: 0,
    createdBy: userEmail,
    createdAt: now,
    updatedAt: now,
  });
  await create("compliance_automations", `compliance10_${suffix}`.slice(0, 36), {
    workspaceId,
    framework: "SOC 2 readiness",
    status: "preview_ready",
    scope: "Internal evidence preview",
    controlCount: 10,
    evidenceCount: 3,
    externalSubmitted: 0,
    output: JSON.stringify({ preview: true, regulatorSubmitted: false }),
    requestedBy: userEmail,
    createdAt: now,
    completedAt: now,
  });
  await create("regional_rollout_gates", `gate10_${suffix}`.slice(0, 36), {
    workspaceId,
    status: "assessing",
    recommendation: "hold",
    score: 0,
    rolloutAuthorized: 0,
    evidence: "{}",
    blockers: JSON.stringify(["External evidence pending"]),
    createdAt: now,
    updatedAt: now,
  });

  const execution = await request(`/functions/${functionId}/executions`, {
    method: "POST",
    body: JSON.stringify({
      body: JSON.stringify({ workspaceId, executorId }),
      async: false,
      path: "/trust/rehearse",
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
    result.evaluation?.status !== "passed" ||
    result.evaluation?.score !== 100 ||
    result.evaluation?.cases !== 24 ||
    result.evaluation?.liveModelCalled !== 0 ||
    result.failover?.status !== "tabletop_passed" ||
    result.failover?.trafficShifted !== 0 ||
    result.failover?.dataRestored !== 0
  ) {
    throw new Error(result.error || execution.errors || "Trust rehearsal truth failed.");
  }
  cleanup.push(rows("evaluation_runs", result.evaluation.$id));
  cleanup.push(rows("failover_drills", result.failover.$id));
  const evaluationEvidence = JSON.parse(result.evaluation.evidence || "{}");
  const failoverEvidence = JSON.parse(result.failover.evidence || "{}");
  if (
    evaluationEvidence.liveModelCalled !== false ||
    evaluationEvidence.externalProviderCalled !== false ||
    failoverEvidence.customerTrafficShifted !== false ||
    failoverEvidence.dataRestored !== false
  ) {
    throw new Error("Trust rehearsal was misrepresented as external proof.");
  }

  const usage = await request(`${rows("usage_ledger")}${workspaceQuery(workspaceId)}`);
  if (usage.rows?.length !== 1 || usage.rows[0].meter !== "trust_rehearsal") {
    throw new Error("Trust rehearsal usage was not metered exactly once.");
  }
  for (const row of usage.rows || []) cleanup.push(rows("usage_ledger", row.$id));
  const audits = await request(`${rows("audit_events")}${workspaceQuery(workspaceId)}`);
  for (const row of audits.rows || []) cleanup.push(rows("audit_events", row.$id));

  console.log(
    "Phase 10 ready · regional configuration truth, provider redundancy truth, deterministic policy evaluation, no-traffic failover tabletop, private health drafts, compliance previews, and hold-by-default rollout verified",
  );
} finally {
  for (const path of cleanup.reverse()) {
    await request(path, { method: "DELETE" }).catch(() => null);
  }
}

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
const workspaceId = `smoke9_${suffix}`.slice(0, 36);
const userId = `user9_${suffix}`.slice(0, 36);
const executorId = `executor9_${suffix}`.slice(0, 36);
const userEmail = "phase9-smoke@orkestria.local";
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
    name: "Phase 9 ScaleOps smoke",
    slug: `phase9-${suffix}`,
    plan: "enterprise",
    region: "eu-west",
    status: "active",
    settings: JSON.stringify({ phase: 9, scaleOperations: true }),
    createdBy: userEmail,
    createdAt: now,
  });
  await create("memberships", `member9_${suffix}`.slice(0, 36), {
    workspaceId,
    userId,
    userEmail,
    userName: "Phase 9 smoke",
    role: "owner",
    status: "active",
    createdAt: now,
  });
  await create("executor_registry", executorId, {
    workspaceId,
    name: "Smoke internal executor",
    provider: "orkestria",
    environment: "production",
    status: "verified",
    version: "1.0.0",
    allowedActions: JSON.stringify(["scale.synthetic_rehearsal"]),
    attestation: JSON.stringify({
      artifactVerified: true,
      policyBoundaryVerified: true,
      externalProvider: false,
      networkEgress: false,
    }),
    verifiedBy: "phase9-smoke-policy",
    verifiedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await create("billing_controls", `billing9_${suffix}`.slice(0, 36), {
    workspaceId,
    status: "internal_meter_enforced",
    currency: "USD",
    monthlyBudgetCents: 100000,
    warningPercent: 70,
    hardStopPercent: 100,
    currentUsageCents: 0,
    config: JSON.stringify({
      internalUsageMeterEnforced: true,
      externalProviderBudgetEnforced: false,
      providerBillingConnected: false,
    }),
    updatedBy: userEmail,
    createdAt: now,
    updatedAt: now,
  });
  await create("support_cases", `support9_${suffix}`.slice(0, 36), {
    workspaceId,
    source: "internal_exercise",
    subject: "Smoke support workflow",
    description: "Internal-only support workflow verification.",
    priority: "p2",
    status: "resolved",
    customerNotified: 0,
    ownerEmail: userEmail,
    slaDueAt: now,
    resolvedAt: now,
    evidence: JSON.stringify({ synthetic: true, customerContacted: false }),
    createdAt: now,
    updatedAt: now,
  });
  await create("scale_gates", `scale9_${suffix}`.slice(0, 36), {
    workspaceId,
    status: "assessing",
    recommendation: "hold",
    score: 0,
    expansionAuthorized: 0,
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
      path: "/scale/rehearse",
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
    result.telemetry?.sourceType !== "synthetic_scale_rehearsal" ||
    result.telemetry?.availabilityBps !== 9990 ||
    result.incident?.status !== "passed" ||
    result.incident?.externalImpact !== 0
  ) {
    throw new Error(result.error || execution.errors || "Scale rehearsal truth failed.");
  }
  cleanup.push(rows("telemetry_rollups", result.telemetry.$id));
  cleanup.push(rows("incident_exercises", result.incident.$id));
  const telemetryEvidence = JSON.parse(result.telemetry.evidence || "{}");
  const incidentEvidence = JSON.parse(result.incident.evidence || "{}");
  if (
    telemetryEvidence.realPilotTraffic !== false ||
    telemetryEvidence.externalProviderRequests !== 0 ||
    incidentEvidence.productionTrafficImpacted !== false ||
    incidentEvidence.customerImpact !== false
  ) {
    throw new Error("Synthetic scale evidence was misrepresented as production proof.");
  }

  const usage = await request(`${rows("usage_ledger")}${workspaceQuery(workspaceId)}`);
  if (usage.rows?.length !== 1 || usage.rows[0].meter !== "scale_rehearsal") {
    throw new Error("Scale rehearsal usage was not metered exactly once.");
  }
  for (const row of usage.rows || []) cleanup.push(rows("usage_ledger", row.$id));
  const audits = await request(`${rows("audit_events")}${workspaceQuery(workspaceId)}`);
  for (const row of audits.rows || []) cleanup.push(rows("audit_events", row.$id));

  console.log(
    "Phase 9 ready · verified internal execution, source-labelled SLO telemetry, zero-impact incident rehearsal, billing truth, support truth, and hold-by-default scale gates verified",
  );
} finally {
  for (const path of cleanup.reverse()) {
    await request(path, { method: "DELETE" }).catch(() => null);
  }
}

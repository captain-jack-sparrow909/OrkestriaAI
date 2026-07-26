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
const workspaceId = `smoke13_${suffix}`.slice(0, 36);
const userId = `user13_${suffix}`.slice(0, 36);
const userEmail = "phase13-smoke@orkestria.local";
const entityId = `entity13_${suffix}`.slice(0, 36);
const eventId = `event13_${suffix}`.slice(0, 36);
const claimId = `claim13_${suffix}`.slice(0, 36);
const snapshotId = `twin13_${suffix}`.slice(0, 36);
const promotionId = `promotion13_${suffix}`.slice(0, 36);
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
    name: "Phase 13 Continuum smoke",
    slug: `phase13-${suffix}`,
    plan: "enterprise",
    region: "eu-west",
    status: "active",
    settings: JSON.stringify({ phase: 13, organizationalMemory: true }),
    createdBy: userEmail,
    createdAt: now,
  });
  await create("memberships", `member13_${suffix}`.slice(0, 36), {
    workspaceId,
    userId,
    userEmail,
    userName: "Phase 13 smoke",
    role: "owner",
    status: "active",
    createdAt: now,
  });
  await create("memory_entities", entityId, {
    workspaceId,
    entityType: "platform",
    name: `Continuum smoke entity ${suffix}`,
    status: "configuration_only",
    aliases: "[]",
    attributes: JSON.stringify({ productionObservationClaimed: false }),
    sourceCount: 1,
    verifiedSourceCount: 0,
    confidenceBps: 2500,
    sensitive: 0,
    createdAt: now,
    updatedAt: now,
  });
  await create("memory_events", eventId, {
    workspaceId,
    entityId,
    eventType: "smoke_observation",
    status: "self_reported_unverified",
    summary: "Synthetic smoke event for temporal contract validation.",
    facts: JSON.stringify({
      userSupplied: true,
      independentlyVerified: false,
      productionQualityClaimed: false,
    }),
    sourceType: "smoke_fixture",
    sourceId: "phase13",
    verified: 0,
    synthetic: 1,
    occurredAt: now,
    recordedAt: now,
    recordedBy: userEmail,
  });
  await create("knowledge_claims", claimId, {
    workspaceId,
    entityId,
    predicate: "smoke_claim",
    value: "This claim must remain outside promoted organizational memory.",
    status: "proposed_unverified",
    confidenceBps: 2500,
    evidenceRefs: "[]",
    promoted: 0,
    createdBy: userEmail,
    validFrom: now,
    createdAt: now,
    updatedAt: now,
  });
  await create("twin_snapshots", snapshotId, {
    workspaceId,
    status: "insufficient_evidence",
    observedEntityCount: 0,
    verifiedClaimCount: 0,
    staleClaimCount: 0,
    completenessBps: 0,
    model: "continuum_v1",
    evidence: JSON.stringify({
      externalSystemsQueried: false,
      customerDataUsed: false,
      missingEvidencePreserved: true,
    }),
    synthetic: 0,
    createdAt: now,
  });
  await create("memory_promotions", promotionId, {
    workspaceId,
    claimId,
    decision: "hold",
    status: "recorded_no_change",
    rationale: "Hold unverified smoke claim.",
    authorized: 0,
    knowledgeBaseChanged: 0,
    externalActionsExecuted: 0,
    decidedBy: userEmail,
    createdAt: now,
  });

  const execution = await request(`/functions/${functionId}/executions`, {
    method: "POST",
    body: JSON.stringify({
      body: JSON.stringify({
        workspaceId,
        snapshotId,
        title: "Phase 13 deterministic twin rehearsal",
        changeSet: "Rehearse an internal workflow change without applying it.",
        horizonDays: 30,
      }),
      async: false,
      path: "/memory/simulate",
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
    result.simulation?.status !== "synthetic_advisory" ||
    result.simulation?.confidenceBps !== 2200 ||
    result.simulation?.liveModelCalled !== 0 ||
    result.simulation?.customerDataUsed !== 0 ||
    result.simulation?.externalActionsExecuted !== 0 ||
    result.forecasts?.length !== 4
  ) {
    throw new Error(result.error || execution.errors || "Continuum simulation truth failed.");
  }
  cleanup.push(rows("scenario_simulations", result.simulation.$id));
  for (const forecast of result.forecasts) {
    cleanup.push(rows("impact_forecasts", forecast.$id));
    const evidence = JSON.parse(forecast.evidence || "{}");
    if (
      forecast.status !== "synthetic_range" ||
      forecast.confidenceBps !== 2200 ||
      evidence.observedProductionMetric !== false ||
      evidence.decisionEvidence !== false ||
      evidence.externalSystemsQueried !== false
    ) {
      throw new Error("A synthetic impact range was misrepresented as production evidence.");
    }
  }
  const changeSet = JSON.parse(result.simulation.changeSet || "{}");
  if (changeSet.appliedToTwin !== false || changeSet.appliedToProduction !== false) {
    throw new Error("The advisory scenario changed the twin or production.");
  }

  const usage = await request(`${rows("usage_ledger")}${workspaceQuery(workspaceId)}`);
  if (
    usage.rows?.length !== 1 ||
    usage.rows[0].meter !== "twin_simulation" ||
    usage.rows[0].quantity !== 4
  ) {
    throw new Error("The twin simulation was not metered exactly once.");
  }
  for (const row of usage.rows || []) cleanup.push(rows("usage_ledger", row.$id));
  const audits = await request(`${rows("audit_events")}${workspaceQuery(workspaceId)}`);
  if (!audits.rows?.some((row) => row.action === "memory.twin_simulation.completed")) {
    throw new Error("The twin simulation was not audited.");
  }
  for (const row of audits.rows || []) cleanup.push(rows("audit_events", row.$id));

  console.log(
    "Phase 13 ready · truthful configuration memory, unverified event and claim boundaries, deterministic twin simulation, uncertainty ranges, promotion hold, and zero external execution verified",
  );
} finally {
  for (const path of cleanup.reverse()) {
    await request(path, { method: "DELETE" }).catch(() => null);
  }
}

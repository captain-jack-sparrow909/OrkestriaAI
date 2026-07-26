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
  if (!response.ok) throw new Error(`${response.status} ${path}: ${payload.message || "Request failed"}`);
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
const workspaceId = `smoke7_${suffix}`.slice(0, 36);
const userId = `user7_${suffix}`.slice(0, 36);
const now = new Date().toISOString();
const cleanup = [];

try {
  const workspace = await request(rows("workspaces"), {
    method: "POST",
    body: JSON.stringify({
      rowId: workspaceId,
      data: {
        name: "Phase 7 operations smoke",
        slug: `phase7-${suffix}`,
        plan: "enterprise",
        region: "eu-west",
        status: "active",
        settings: JSON.stringify({ phase: 7, productionOperations: true }),
        createdBy: "phase7-smoke@orkestria.local",
        createdAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(rows("workspaces", workspace.$id));

  const membership = await request(rows("memberships"), {
    method: "POST",
    body: JSON.stringify({
      rowId: `member7_${suffix}`.slice(0, 36),
      data: {
        workspaceId,
        userId,
        userEmail: "phase7-smoke@orkestria.local",
        userName: "Phase 7 smoke",
        role: "owner",
        status: "active",
        createdAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(rows("memberships", membership.$id));

  const installation = await request(rows("connector_installations"), {
    method: "POST",
    body: JSON.stringify({
      rowId: `inst7_${suffix}`.slice(0, 36),
      data: {
        workspaceId,
        connectorId: `connector7_${suffix}`.slice(0, 36),
        connectorSlug: "smoke-provider",
        status: "configuration_required",
        authStatus: "not_authorized",
        environment: "production",
        installedBy: "phase7-smoke@orkestria.local",
        config: "{}",
        installedAt: now,
        updatedAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(rows("connector_installations", installation.$id));

  const authorization = await request(rows("provider_authorizations"), {
    method: "POST",
    body: JSON.stringify({
      rowId: `auth7_${suffix}`.slice(0, 36),
      data: {
        workspaceId,
        installationId: installation.$id,
        provider: "Smoke Provider",
        authType: "OAuth 2.0",
        state: "awaiting_oauth_consent",
        scopes: JSON.stringify(["records.read"]),
        authorizedBy: "phase7-smoke@orkestria.local",
        createdAt: now,
        updatedAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(rows("provider_authorizations", authorization.$id));

  const pilot = await request(rows("pilot_programs"), {
    method: "POST",
    body: JSON.stringify({
      rowId: `pilot7_${suffix}`.slice(0, 36),
      data: {
        workspaceId,
        name: "Phase 7 smoke pilot",
        stage: "readiness",
        status: "preparing",
        targetUsers: 5,
        ownerEmail: "phase7-smoke@orkestria.local",
        successCriteria: "[]",
        checklist: "{}",
        createdAt: now,
        updatedAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(rows("pilot_programs", pilot.$id));

  const job = await request(rows("jobs"), {
    method: "POST",
    body: JSON.stringify({
      rowId: `job7_${suffix}`.slice(0, 36),
      data: {
        workspaceId,
        type: "reliability.rehearsal",
        payload: JSON.stringify({ externalActions: false }),
        state: "queued",
        attempts: 0,
        maxAttempts: 3,
        idempotencyKey: `phase7-smoke:${suffix}`,
        availableAt: now,
        createdAt: now,
        updatedAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(rows("jobs", job.$id));

  const execution = await request(`/functions/${functionId}/executions`, {
    method: "POST",
    body: JSON.stringify({
      body: JSON.stringify({ workspaceId, jobId: job.$id }),
      async: false,
      path: "/jobs/rehearse",
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
    result.job?.state !== "succeeded" ||
    result.validation?.status !== "passed" ||
    result.validation?.score !== 100
  ) {
    throw new Error(result.error || execution.errors || "Durable worker rehearsal failed.");
  }
  cleanup.push(rows("validation_runs", result.validation.$id));

  const usageRows = await request(`${rows("usage_ledger")}${workspaceQuery(workspaceId)}`);
  if (usageRows.rows?.length !== 1 || usageRows.rows[0].meter !== "worker_execution") {
    throw new Error("Worker usage was not metered exactly once.");
  }
  cleanup.push(rows("usage_ledger", usageRows.rows[0].$id));

  const drill = await request(rows("recovery_drills"), {
    method: "POST",
    body: JSON.stringify({
      rowId: `drill7_${suffix}`.slice(0, 36),
      data: {
        workspaceId,
        kind: "tabletop",
        status: "tabletop_completed",
        scope: "Schema, storage, functions, and release provenance",
        rpoMinutes: 60,
        rtoMinutes: 240,
        evidence: JSON.stringify({ dataRestored: false, targetValidatedByRestore: false }),
        initiatedBy: "phase7-smoke@orkestria.local",
        startedAt: now,
        completedAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(rows("recovery_drills", drill.$id));

  if (
    authorization.state !== "awaiting_oauth_consent" ||
    JSON.parse(drill.evidence).dataRestored !== false
  ) {
    throw new Error("Authorization or recovery truth state was not preserved.");
  }

  const audits = await request(`${rows("audit_events")}${workspaceQuery(workspaceId)}`);
  for (const row of audits.rows || []) cleanup.push(rows("audit_events", row.$id));
  console.log(
    "Phase 7 ready · provider auth truth, leased worker execution, idempotent metering, validation evidence, and recovery tabletop verified",
  );
} finally {
  for (const path of cleanup.reverse()) {
    await request(path, { method: "DELETE" }).catch(() => null);
  }
}

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
const workspaceId = `smoke8_${suffix}`.slice(0, 36);
const userId = `user8_${suffix}`.slice(0, 36);
const pilotId = `pilot8_${suffix}`.slice(0, 36);
const internalScopeId = `scope8_internal_${suffix}`.slice(0, 36);
const externalScopeId = `scope8_external_${suffix}`.slice(0, 36);
const userEmail = "phase8-smoke@orkestria.local";
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

async function exercise(scopeId) {
  const execution = await request(`/functions/${functionId}/executions`, {
    method: "POST",
    body: JSON.stringify({
      body: JSON.stringify({ workspaceId, pilotId, scopeId }),
      async: false,
      path: "/pilot/exercise",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-orkestria-user-id": userId,
      },
    }),
  });
  cleanup.push(`/functions/${functionId}/executions/${execution.$id}`);
  const result = JSON.parse(execution.responseBody || "{}");
  if (execution.status !== "completed" || execution.responseStatusCode !== 200) {
    throw new Error(result.error || execution.errors || "Pilot exercise failed.");
  }
  cleanup.push(rows("pilot_exercises", result.exercise.$id));
  return result.exercise;
}

try {
  await create("workspaces", workspaceId, {
    name: "Phase 8 launchroom smoke",
    slug: `phase8-${suffix}`,
    plan: "enterprise",
    region: "eu-west",
    status: "active",
    settings: JSON.stringify({ phase: 8, pilotLaunchroom: true }),
    createdBy: userEmail,
    createdAt: now,
  });
  await create("memberships", `member8_${suffix}`.slice(0, 36), {
    workspaceId,
    userId,
    userEmail,
    userName: "Phase 8 smoke",
    role: "owner",
    status: "active",
    createdAt: now,
  });
  await create("pilot_programs", pilotId, {
    workspaceId,
    name: "Phase 8 smoke pilot",
    stage: "validation",
    status: "preparing",
    targetUsers: 3,
    ownerEmail: userEmail,
    successCriteria: "[]",
    checklist: "{}",
    createdAt: now,
    updatedAt: now,
  });
  await create("pilot_members", `pilotmember8_${suffix}`.slice(0, 36), {
    workspaceId,
    pilotId,
    email: userEmail,
    role: "pilot_owner",
    status: "active",
    invitationState: "self_enrolled",
    consentState: "owner_confirmed",
    lastActiveAt: now,
    invitedBy: userEmail,
    createdAt: now,
    updatedAt: now,
  });
  await create("support_rotations", `support8_${suffix}`.slice(0, 36), {
    workspaceId,
    name: "Smoke support rotation",
    status: "partial",
    timezone: "UTC",
    primaryEmail: userEmail,
    coverage: "business_hours",
    escalationPolicy: JSON.stringify({ backupAcknowledged: false }),
    createdAt: now,
    updatedAt: now,
  });
  await create("launch_decisions", `launch8_${suffix}`.slice(0, 36), {
    workspaceId,
    status: "assessing",
    recommendation: "hold",
    score: 0,
    blockers: JSON.stringify(["Evidence pending"]),
    evidence: "{}",
    createdAt: now,
  });
  await create("action_scopes", internalScopeId, {
    workspaceId,
    name: "Control-plane health snapshot",
    provider: "orkestria",
    environment: "production",
    action: "control_plane.health_snapshot",
    risk: "low",
    approvalRequired: 0,
    status: "active",
    constraints: JSON.stringify({ readOnly: true, externalProviderCall: false }),
    createdBy: userEmail,
    createdAt: now,
    updatedAt: now,
  });
  await create("action_scopes", externalScopeId, {
    workspaceId,
    name: "External deployment status",
    provider: "observability",
    environment: "production",
    action: "deployment.status.read",
    risk: "low",
    approvalRequired: 0,
    status: "blocked_provider_authorization",
    constraints: JSON.stringify({ readOnly: true, externalProviderCall: true }),
    createdBy: userEmail,
    createdAt: now,
    updatedAt: now,
  });

  const internal = await exercise(internalScopeId);
  const blocked = await exercise(externalScopeId);
  if (
    internal.state !== "succeeded" ||
    internal.externalActionExecuted !== 0 ||
    blocked.state !== "blocked_provider_authorization" ||
    blocked.externalActionExecuted !== 0
  ) {
    throw new Error("Pilot exercise side-effect truth was not preserved.");
  }

  const usage = await request(`${rows("usage_ledger")}${workspaceQuery(workspaceId)}`);
  if (usage.rows?.length !== 1 || usage.rows[0].meter !== "pilot_exercise") {
    throw new Error("Only the successful internal pilot exercise should be metered.");
  }
  for (const row of usage.rows || []) cleanup.push(rows("usage_ledger", row.$id));
  const audits = await request(`${rows("audit_events")}${workspaceQuery(workspaceId)}`);
  for (const row of audits.rows || []) cleanup.push(rows("audit_events", row.$id));

  console.log(
    "Phase 8 ready · pilot membership, bounded action scopes, external-action blocking, support coverage truth, and launch evidence verified",
  );
} finally {
  for (const path of cleanup.reverse()) {
    await request(path, { method: "DELETE" }).catch(() => null);
  }
}

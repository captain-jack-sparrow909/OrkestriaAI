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
const workspaceId = `smoke12_${suffix}`.slice(0, 36);
const userId = `user12_${suffix}`.slice(0, 36);
const userEmail = "phase12-smoke@orkestria.local";
const teamId = `team12_${suffix}`.slice(0, 36);
const caseId = `case12_${suffix}`.slice(0, 36);
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
    name: "Phase 12 Ensemble smoke",
    slug: `phase12-${suffix}`,
    plan: "enterprise",
    region: "eu-west",
    status: "active",
    settings: JSON.stringify({ phase: 12, collaborativeDecisioning: true }),
    createdBy: userEmail,
    createdAt: now,
  });
  await create("memberships", `member12_${suffix}`.slice(0, 36), {
    workspaceId,
    userId,
    userEmail,
    userName: "Phase 12 smoke",
    role: "owner",
    status: "active",
    createdAt: now,
  });
  await create("agent_teams", teamId, {
    workspaceId,
    name: "Northstar Ensemble",
    status: "active",
    purpose: "Bounded cross-product decision support.",
    policy: JSON.stringify({
      advisoryOnly: true,
      externalToolsAllowed: false,
      executiveDecisionDoesNotExecute: true,
    }),
    createdBy: userEmail,
    createdAt: now,
    updatedAt: now,
  });
  for (const agent of ["vela", "loom", "tempo", "helio", "aegis"]) {
    await create("team_specialists", `${agent}12_${suffix}`.slice(0, 36), {
      workspaceId,
      teamId,
      agent,
      name: agent[0].toUpperCase() + agent.slice(1),
      role: "Advisory specialist",
      status: "available",
      capabilities: JSON.stringify(["bounded_analysis"]),
      boundaries: JSON.stringify({
        workspaceOnly: true,
        advisoryOnly: true,
        externalToolsAllowed: false,
        requiresCitations: true,
      }),
      canExecute: 0,
      createdAt: now,
      updatedAt: now,
    });
  }
  await create("mission_cases", caseId, {
    workspaceId,
    teamId,
    title: "Phase 12 bounded collaboration rehearsal",
    objective: "Verify five-specialist handoffs without live data or external action.",
    status: "scoped",
    risk: "medium",
    score: 17,
    recommendation: "hold",
    evidence: JSON.stringify({
      teamBounded: true,
      allSpecialistsContributed: false,
      handoffsExternallyVerified: false,
      evidenceComplete: false,
      briefReviewed: false,
      downstreamApprovalsReady: false,
    }),
    blockers: JSON.stringify(["Rehearsal not run."]),
    createdBy: userEmail,
    createdAt: now,
    updatedAt: now,
  });

  const execution = await request(`/functions/${functionId}/executions`, {
    method: "POST",
    body: JSON.stringify({
      body: JSON.stringify({ workspaceId, teamId, caseId }),
      async: false,
      path: "/ensemble/rehearse",
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
    result.handoffs?.length !== 5 ||
    result.synthesis?.status !== "synthetic_draft" ||
    result.synthesis?.verifiedSourceCount !== 0 ||
    result.synthesis?.conflictCount !== 2 ||
    result.synthesis?.customerDataUsed !== 0 ||
    result.brief?.status !== "draft_internal" ||
    result.brief?.reviewed !== 0 ||
    result.brief?.externallyShared !== 0 ||
    result.mission?.recommendation !== "hold"
  ) {
    throw new Error(result.error || execution.errors || "Ensemble rehearsal truth failed.");
  }
  for (const handoff of result.handoffs) {
    cleanup.push(rows("mission_handoffs", handoff.$id));
    if (
      handoff.status !== "completed_synthetic" ||
      handoff.externalActionsExecuted !== 0
    ) {
      throw new Error("A specialist handoff escaped its advisory-only boundary.");
    }
  }
  cleanup.push(rows("evidence_syntheses", result.synthesis.$id));
  cleanup.push(rows("executive_briefs", result.brief.$id));
  const briefEvidence = JSON.parse(result.brief.evidence || "{}");
  if (
    briefEvidence.deterministic !== true ||
    briefEvidence.liveModelCalled !== false ||
    briefEvidence.customerDataUsed !== false ||
    briefEvidence.externallyShared !== false
  ) {
    throw new Error("The executive brief misrepresented synthetic evidence.");
  }

  const usage = await request(`${rows("usage_ledger")}${workspaceQuery(workspaceId)}`);
  if (
    usage.rows?.length !== 1 ||
    usage.rows[0].meter !== "ensemble_rehearsal" ||
    usage.rows[0].quantity !== 5
  ) {
    throw new Error("The Ensemble rehearsal was not metered exactly once.");
  }
  for (const row of usage.rows || []) cleanup.push(rows("usage_ledger", row.$id));
  const audits = await request(`${rows("audit_events")}${workspaceQuery(workspaceId)}`);
  if (
    !audits.rows?.some((row) => row.action === "ensemble.rehearsal.completed")
  ) {
    throw new Error("The Ensemble rehearsal was not audited.");
  }
  for (const row of audits.rows || []) cleanup.push(rows("audit_events", row.$id));

  console.log(
    "Phase 12 ready · five bounded specialists, truthful synthetic handoffs, visible conflicts, internal executive briefing, and zero external execution verified",
  );
} finally {
  for (const path of cleanup.reverse()) {
    await request(path, { method: "DELETE" }).catch(() => null);
  }
}

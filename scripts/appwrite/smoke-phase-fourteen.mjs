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
const workspaceId = `smoke14_${suffix}`.slice(0, 36);
const userId = `user14_${suffix}`.slice(0, 36);
const userEmail = "phase14-smoke@orkestria.local";
const goalId = `goal14_${suffix}`.slice(0, 36);
const initiativeA = `init14a_${suffix}`.slice(0, 36);
const initiativeB = `init14b_${suffix}`.slice(0, 36);
const dependencyId = `dep14_${suffix}`.slice(0, 36);
const capacityId = `capacity14_${suffix}`.slice(0, 36);
const decisionId = `decision14_${suffix}`.slice(0, 36);
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
    name: "Phase 14 Meridian smoke",
    slug: `phase14-${suffix}`,
    plan: "enterprise",
    region: "eu-west",
    status: "active",
    settings: JSON.stringify({ phase: 14, portfolioIntelligence: true }),
    createdBy: userEmail,
    createdAt: now,
  });
  await create("memberships", `member14_${suffix}`.slice(0, 36), {
    workspaceId,
    userId,
    userEmail,
    userName: "Phase 14 smoke",
    role: "owner",
    status: "active",
    createdAt: now,
  });
  await create("strategic_goals", goalId, {
    workspaceId,
    title: `Phase 14 smoke goal ${suffix}`,
    pillar: "trust",
    status: "draft_unverified",
    metric: "verified_control_coverage",
    targetValue: 95,
    unit: "percent",
    priority: 1,
    verified: 0,
    evidence: JSON.stringify({ leadershipApproved: false }),
    ownerEmail: userEmail,
    horizon: "12_months",
    createdAt: now,
    updatedAt: now,
  });
  for (const [id, name, budget, headcount] of [
    [initiativeA, "Smoke evidence foundation", 1_500_000, 2],
    [initiativeB, "Smoke resilience proof", 2_000_000, 3],
  ]) {
    await create("portfolio_initiatives", id, {
      workspaceId,
      goalId,
      name: `${name} ${suffix}`,
      status: "proposed_unverified",
      stage: "discovery",
      proposedBudgetCents: budget,
      requiredHeadcount: headcount,
      expectedImpact: "Synthetic planning impact only.",
      confidenceBps: 3000,
      risk: "medium",
      assumptions: JSON.stringify(["No realized benefit claimed."]),
      ownerEmail: userEmail,
      createdAt: now,
      updatedAt: now,
    });
  }
  await create("initiative_dependencies", dependencyId, {
    workspaceId,
    initiativeId: initiativeB,
    dependsOnInitiativeId: initiativeA,
    relationship: "evidence_prerequisite",
    status: "assumption_unverified",
    resolved: 0,
    evidence: JSON.stringify({ systemObserved: false }),
    createdAt: now,
  });
  await create("capacity_envelopes", capacityId, {
    workspaceId,
    period: "next_12_months",
    status: "planning_assumption",
    budgetCents: 5_000_000,
    allocatedBudgetCents: 0,
    availableHeadcount: 6,
    allocatedHeadcount: 0,
    externalVerified: 0,
    source: "smoke_fixture",
    assumptions: JSON.stringify([
      "Finance not connected.",
      "HR not connected.",
    ]),
    updatedBy: userEmail,
    createdAt: now,
    updatedAt: now,
  });

  const execution = await request(`/functions/${functionId}/executions`, {
    method: "POST",
    body: JSON.stringify({
      body: JSON.stringify({
        workspaceId,
        title: "Phase 14 deterministic portfolio rehearsal",
        selectedInitiativeIds: [initiativeA, initiativeB],
        budgetLimitCents: 5_000_000,
        headcountLimit: 6,
        horizonMonths: 12,
      }),
      async: false,
      path: "/portfolio/simulate",
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
    result.scenario?.status !== "synthetic_advisory" ||
    result.scenario?.confidenceBps !== 2800 ||
    result.scenario?.liveModelCalled !== 0 ||
    result.scenario?.customerDataUsed !== 0 ||
    result.scenario?.financialCommitmentCreated !== 0 ||
    result.forecasts?.length !== 4
  ) {
    throw new Error(result.error || execution.errors || "Meridian scenario truth failed.");
  }
  cleanup.push(rows("portfolio_scenarios", result.scenario.$id));
  for (const forecast of result.forecasts) {
    cleanup.push(rows("portfolio_forecasts", forecast.$id));
    const evidence = JSON.parse(forecast.evidence || "{}");
    if (
      forecast.status !== "synthetic_range" ||
      forecast.confidenceBps !== 2800 ||
      evidence.externallyVerifiedCapacity !== false ||
      evidence.realizedBenefitClaimed !== false ||
      evidence.decisionEvidence !== false
    ) {
      throw new Error("A portfolio range was misrepresented as verified evidence.");
    }
  }
  await create("investment_decisions", decisionId, {
    workspaceId,
    scenarioId: result.scenario.$id,
    decision: "hold",
    status: "recorded_no_commitment",
    rationale: "Hold unverified portfolio scenario.",
    authorized: 0,
    financialCommitmentCreated: 0,
    externalActionsExecuted: 0,
    decidedBy: userEmail,
    createdAt: now,
  });

  const usage = await request(`${rows("usage_ledger")}${workspaceQuery(workspaceId)}`);
  if (
    usage.rows?.length !== 1 ||
    usage.rows[0].meter !== "portfolio_scenario" ||
    usage.rows[0].quantity !== 4
  ) {
    throw new Error("The portfolio scenario was not metered exactly once.");
  }
  for (const row of usage.rows || []) cleanup.push(rows("usage_ledger", row.$id));
  const audits = await request(`${rows("audit_events")}${workspaceQuery(workspaceId)}`);
  if (!audits.rows?.some((row) => row.action === "portfolio.scenario.completed")) {
    throw new Error("The portfolio scenario was not audited.");
  }
  for (const row of audits.rows || []) cleanup.push(rows("audit_events", row.$id));

  console.log(
    "Phase 14 ready · unverified goals and capacity, explicit dependencies, deterministic portfolio ranges, investment hold, and zero financial or external commitment verified",
  );
} finally {
  for (const path of cleanup.reverse()) {
    await request(path, { method: "DELETE" }).catch(() => null);
  }
}

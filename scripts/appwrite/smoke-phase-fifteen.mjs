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
const workspaceId = `smoke15_${suffix}`.slice(0, 36);
const userId = `user15_${suffix}`.slice(0, 36);
const userEmail = "phase15-smoke@orkestria.local";
const initiativeId = `init15_${suffix}`.slice(0, 36);
const programId = `program15_${suffix}`.slice(0, 36);
const milestoneA = `mile15a_${suffix}`.slice(0, 36);
const milestoneB = `mile15b_${suffix}`.slice(0, 36);
const deliveryId = `proof15_${suffix}`.slice(0, 36);
const metricA = `metric15a_${suffix}`.slice(0, 36);
const metricB = `metric15b_${suffix}`.slice(0, 36);
const measurementId = `measure15_${suffix}`.slice(0, 36);
const correctiveId = `correct15_${suffix}`.slice(0, 36);
const now = new Date();
const nowIso = now.toISOString();
const target = new Date(now.valueOf() + 120 * 24 * 60 * 60 * 1000).toISOString();
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
    name: "Phase 15 Keystone smoke",
    slug: `phase15-${suffix}`,
    plan: "enterprise",
    region: "eu-west",
    status: "active",
    settings: JSON.stringify({ phase: 15, governedExecution: true }),
    createdBy: userEmail,
    createdAt: nowIso,
  });
  await create("memberships", `member15_${suffix}`.slice(0, 36), {
    workspaceId,
    userId,
    userEmail,
    userName: "Phase 15 smoke",
    role: "owner",
    status: "active",
    createdAt: nowIso,
  });
  await create("portfolio_initiatives", initiativeId, {
    workspaceId,
    goalId: `goal15_${suffix}`.slice(0, 36),
    name: `Phase 15 delivery initiative ${suffix}`,
    status: "proposed_unverified",
    stage: "discovery",
    proposedBudgetCents: 2_000_000,
    requiredHeadcount: 2,
    expectedImpact: "Synthetic execution planning only.",
    confidenceBps: 3000,
    risk: "medium",
    assumptions: JSON.stringify(["No funding authority."]),
    ownerEmail: userEmail,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await create("execution_programs", programId, {
    workspaceId,
    initiativeId,
    name: `Phase 15 evidence program ${suffix}`,
    status: "draft_unfunded",
    phase: "definition",
    ownerEmail: userEmail,
    startDate: nowIso,
    targetDate: target,
    budgetCents: 2_000_000,
    committedBudgetCents: 0,
    financialCommitmentCreated: 0,
    externalActionsExecuted: 0,
    assumptions: JSON.stringify([
      "Program is an internal draft.",
      "No delivery or finance systems are connected.",
    ]),
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  for (const [id, sequence, name] of [
    [milestoneA, 1, "Evidence contract"],
    [milestoneB, 2, "Decision-grade pilot"],
  ]) {
    await create("program_milestones", id, {
      workspaceId,
      programId,
      name: `${name} ${suffix}`,
      status: "planned_unverified",
      sequence,
      targetDate: target,
      completionBps: 0,
      acceptanceCriteria: "Independent review is required.",
      externallyVerified: 0,
      evidenceCount: sequence === 1 ? 1 : 0,
      ownerEmail: userEmail,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }
  await create("delivery_evidence", deliveryId, {
    workspaceId,
    programId,
    milestoneId: milestoneA,
    type: "delivery_note",
    source: "smoke_fixture",
    status: "user_supplied_unverified",
    summary: "Synthetic evidence submission.",
    reference: "smoke://delivery-note",
    userSupplied: 1,
    verified: 0,
    occurredAt: nowIso,
    createdAt: nowIso,
  });
  for (const [id, name, metric, baseline, targetValue, unit] of [
    [metricA, "Traceability coverage", "traceability_coverage", 0, 90, "percent"],
    [metricB, "Review time", "review_time", 240, 30, "minutes"],
  ]) {
    await create("benefit_metrics", id, {
      workspaceId,
      programId,
      name: `${name} ${suffix}`,
      metric,
      baselineValue: baseline,
      targetValue,
      unit,
      realizationWindow: "within_120_days",
      status: "planning_assumption",
      verified: 0,
      evidence: JSON.stringify({ baselineVerified: false }),
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }
  await create("benefit_measurements", measurementId, {
    workspaceId,
    programId,
    metricId: metricA,
    observedValue: 25,
    period: nowIso.slice(0, 7),
    source: "smoke_fixture",
    status: "self_reported_unverified",
    independentlyVerified: 0,
    evidence: JSON.stringify({ sourceConnected: false }),
    financialImpactCents: 0,
    realizedBenefitClaimed: 0,
    recordedBy: userEmail,
    createdAt: nowIso,
  });

  const execution = await request(`/functions/${functionId}/executions`, {
    method: "POST",
    body: JSON.stringify({
      body: JSON.stringify({ workspaceId, programId }),
      async: false,
      path: "/execution/assess",
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
    result.variances?.length !== 3
  ) {
    throw new Error(result.error || execution.errors || "Keystone assessment failed.");
  }
  for (const variance of result.variances) {
    cleanup.push(rows("execution_variances", variance.$id));
    const evidence = JSON.parse(variance.evidence || "{}");
    if (
      variance.status !== "synthetic_advisory" ||
      variance.confidenceBps !== 2600 ||
      variance.decisionGrade !== 0 ||
      variance.externalSystemsQueried !== 0 ||
      evidence.basis !== "deterministic_execution_fixture" ||
      evidence.liveModelCalled !== false ||
      evidence.realizedBenefitClaimed !== false ||
      evidence.correctiveActionExecuted !== false
    ) {
      throw new Error("An execution variance was misrepresented as decision-grade evidence.");
    }
  }
  await create("corrective_actions", correctiveId, {
    workspaceId,
    programId,
    varianceId: result.variances[0].$id,
    title: `Hold synthetic correction ${suffix}`,
    actionType: "review_plan",
    status: "held_no_change",
    rationale: "Synthetic variance is not decision-grade.",
    approvalStatus: "held",
    authorized: 0,
    scheduleChanged: 0,
    budgetChanged: 0,
    financialCommitmentCreated: 0,
    externalActionsExecuted: 0,
    proposedBy: userEmail,
    decidedBy: userEmail,
    createdAt: nowIso,
    decidedAt: nowIso,
  });

  const usage = await request(`${rows("usage_ledger")}${workspaceQuery(workspaceId)}`);
  if (
    usage.rows?.length !== 1 ||
    usage.rows[0].meter !== "execution_variance_assessment" ||
    usage.rows[0].quantity !== 3
  ) {
    throw new Error("The execution assessment was not metered exactly once.");
  }
  for (const row of usage.rows || []) cleanup.push(rows("usage_ledger", row.$id));
  const audits = await request(`${rows("audit_events")}${workspaceQuery(workspaceId)}`);
  if (
    !audits.rows?.some(
      (row) => row.action === "execution.variance_assessment.completed",
    )
  ) {
    throw new Error("The execution assessment was not audited.");
  }
  for (const row of audits.rows || []) cleanup.push(rows("audit_events", row.$id));

  console.log(
    "Phase 15 ready · unfunded programs, unverified milestone and benefit evidence, deterministic variance, corrective hold, and zero schedule, budget, financial, or external change verified",
  );
} finally {
  for (const path of cleanup.reverse()) {
    await request(path, { method: "DELETE" }).catch(() => null);
  }
}

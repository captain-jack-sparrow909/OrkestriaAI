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
const workspaceId = makeId("smoke16");
const proposedWorkspaceId = makeId("proposed16");
const userId = makeId("user16");
const userEmail = "phase16-smoke@orkestria.local";
const federationId = makeId("federation16");
const programId = makeId("program16");
const milestoneId = makeId("milestone16");
const deliveryId = makeId("delivery16");
const metricId = makeId("metric16");
const measurementId = makeId("measure16");
const varianceId = makeId("variance16");
const correctiveId = makeId("corrective16");
const now = new Date();
const nowIso = now.toISOString();
const target = new Date(now.valueOf() + 90 * 24 * 60 * 60 * 1000).toISOString();
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
    name: "Phase 16 Concord smoke",
    slug: `phase16-${suffix}`,
    plan: "enterprise",
    region: "eu-west",
    status: "active",
    settings: JSON.stringify({ phase: 16, federatedEnterpriseCommand: true }),
    createdBy: userEmail,
    createdAt: nowIso,
  });
  await create("memberships", makeId("member16"), {
    workspaceId,
    userId,
    userEmail,
    userName: "Phase 16 smoke",
    role: "owner",
    status: "active",
    createdAt: nowIso,
  });
  await create("enterprise_federations", federationId, {
    workspaceId,
    name: `Concord smoke federation ${suffix}`,
    status: "draft_single_workspace",
    purpose: "Verify bounded enterprise rollups without cross-workspace access.",
    verified: 0,
    ownerEmail: userEmail,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await create("federation_workspaces", makeId("anchor16"), {
    federationId,
    anchorWorkspaceId: workspaceId,
    memberWorkspaceId: workspaceId,
    alias: "Verified anchor",
    status: "connected_anchor",
    accessLevel: "anchor_metadata_only",
    verified: 1,
    dataSharingApproved: 1,
    rawDataShared: 0,
    proposedBy: userEmail,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await create("federation_workspaces", makeId("proposal16"), {
    federationId,
    anchorWorkspaceId: workspaceId,
    memberWorkspaceId: proposedWorkspaceId,
    alias: "Unverified member proposal",
    status: "proposed_unverified_no_access",
    accessLevel: "none",
    verified: 0,
    dataSharingApproved: 0,
    rawDataShared: 0,
    proposedBy: userEmail,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await create("delegated_authorities", makeId("authority16"), {
    workspaceId,
    federationId,
    delegateEmail: userEmail,
    role: "federation_owner",
    scopes: JSON.stringify(["view_anchor_rollup", "prepare_decision_package"]),
    status: "active_verified_anchor",
    verified: 1,
    active: 1,
    externalChangesAllowed: 0,
    proposedBy: userEmail,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await create("federated_policy_bindings", makeId("policy16"), {
    workspaceId,
    federationId,
    name: `Synthetic material action policy ${suffix}`,
    scope: "federation",
    mode: "advisory",
    status: "draft_unverified_unapplied",
    verified: 0,
    enforcementApplied: 0,
    externalSystemsChanged: 0,
    policyJson: JSON.stringify({
      materialActionApprovalRequired: true,
      applied: false,
    }),
    createdBy: userEmail,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await create("execution_programs", programId, {
    workspaceId,
    initiativeId: makeId("initiative16"),
    name: `Concord evidence program ${suffix}`,
    status: "draft_unfunded",
    phase: "definition",
    ownerEmail: userEmail,
    startDate: nowIso,
    targetDate: target,
    budgetCents: 1_000_000,
    committedBudgetCents: 0,
    financialCommitmentCreated: 0,
    externalActionsExecuted: 0,
    assumptions: JSON.stringify(["Anchor-only synthetic evidence."]),
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await create("program_milestones", milestoneId, {
    workspaceId,
    programId,
    name: `Federation evidence contract ${suffix}`,
    status: "planned_unverified",
    sequence: 1,
    targetDate: target,
    completionBps: 0,
    acceptanceCriteria: "Independent review is required.",
    externallyVerified: 0,
    evidenceCount: 1,
    ownerEmail: userEmail,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await create("delivery_evidence", deliveryId, {
    workspaceId,
    programId,
    milestoneId,
    type: "delivery_note",
    source: "smoke_fixture",
    status: "verified_fixture",
    summary: "Synthetic anchor evidence for aggregation coverage.",
    reference: "smoke://phase16-delivery",
    userSupplied: 1,
    verified: 1,
    verifierEmail: userEmail,
    occurredAt: nowIso,
    createdAt: nowIso,
  });
  await create("benefit_metrics", metricId, {
    workspaceId,
    programId,
    name: `Benefit observability ${suffix}`,
    metric: "benefit_observability",
    baselineValue: 0,
    targetValue: 80,
    unit: "percent",
    realizationWindow: "within_90_days",
    status: "planning_assumption",
    verified: 0,
    evidence: JSON.stringify({ baselineVerified: false }),
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await create("benefit_measurements", measurementId, {
    workspaceId,
    programId,
    metricId,
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
  await create("execution_variances", varianceId, {
    workspaceId,
    programId,
    dimension: "delivery_progress",
    status: "synthetic_advisory",
    severity: "medium",
    baselineValue: 50,
    actualValue: 25,
    varianceValue: -25,
    unit: "percent",
    confidenceBps: 2600,
    decisionGrade: 0,
    evidence: JSON.stringify({ basis: "deterministic_execution_fixture" }),
    externalSystemsQueried: 0,
    assessedAt: nowIso,
  });
  await create("corrective_actions", correctiveId, {
    workspaceId,
    programId,
    varianceId,
    title: `Hold synthetic correction ${suffix}`,
    actionType: "review_plan",
    status: "held_no_change",
    rationale: "The supporting evidence is not decision-grade.",
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

  const execution = await request(`/functions/${functionId}/executions`, {
    method: "POST",
    body: JSON.stringify({
      body: JSON.stringify({
        workspaceId,
        federationId,
        period: nowIso.slice(0, 7),
      }),
      async: false,
      path: "/federation/rollup",
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
    result.benchmarks?.length !== 3
  ) {
    throw new Error(
      [
        result.error || "Concord rollup failed.",
        execution.errors,
        execution.logs,
      ].filter(Boolean).join("\n"),
    );
  }
  cleanup.push(rows("enterprise_rollups", result.rollup.$id));
  for (const benchmark of result.benchmarks) {
    cleanup.push(rows("privacy_benchmarks", benchmark.$id));
  }

  const sourceSnapshot = JSON.parse(result.rollup.sourceSnapshot || "{}");
  if (
    result.rollup.status !== "bounded_anchor_only" ||
    result.rollup.workspaceCount !== 2 ||
    result.rollup.connectedWorkspaceCount !== 1 ||
    result.rollup.programsCount !== 1 ||
    result.rollup.milestonesCount !== 1 ||
    result.rollup.verifiedEvidenceCount !== 1 ||
    result.rollup.benefitsMeasuredCount !== 1 ||
    result.rollup.openVariancesCount !== 1 ||
    result.rollup.confidenceBps !== 3000 ||
    result.rollup.decisionGrade !== 0 ||
    result.rollup.externalSystemsQueried !== 0 ||
    sourceSnapshot.scope !== "anchor_workspace_only" ||
    sourceSnapshot.otherMemberWorkspacesQueried !== false ||
    sourceSnapshot.crossWorkspaceAuthorizationVerified !== false ||
    sourceSnapshot.liveModelCalled !== false
  ) {
    throw new Error("The enterprise rollup exceeded its verified anchor boundary.");
  }

  for (const benchmark of result.benchmarks) {
    const evidence = JSON.parse(benchmark.evidence || "{}");
    if (
      benchmark.status !== "synthetic_reference_no_tenant" ||
      benchmark.cohortSize !== 24 ||
      benchmark.kAnonymityMet !== 0 ||
      benchmark.differentialPrivacyApplied !== 0 ||
      benchmark.rawTenantDataExposed !== 0 ||
      benchmark.confidenceBps !== 3000 ||
      evidence.basis !== "deterministic_federation_fixture" ||
      evidence.cohortIsSynthetic !== true ||
      evidence.realTenantRecordsUsed !== false ||
      evidence.privacyReviewCompleted !== false ||
      evidence.decisionEvidence !== false
    ) {
      throw new Error("A synthetic benchmark was misrepresented as private tenant evidence.");
    }
  }

  await create("executive_decision_packages", makeId("package16"), {
    workspaceId,
    federationId,
    rollupId: result.rollup.$id,
    title: `Concord executive hold ${suffix}`,
    status: "held_no_change",
    decision: "hold",
    rationale: "Federation, policy, benchmark, and evidence blockers remain.",
    approvalStatus: "held",
    authorized: 0,
    policyApplied: 0,
    delegationActivated: 0,
    financialCommitmentCreated: 0,
    externalActionsExecuted: 0,
    preparedBy: userEmail,
    decidedBy: userEmail,
    createdAt: nowIso,
    decidedAt: nowIso,
  });

  const usage = await request(`${rows("usage_ledger")}${workspaceQuery(workspaceId)}`);
  if (
    usage.rows?.length !== 1 ||
    usage.rows[0].meter !== "federation_rollup" ||
    usage.rows[0].quantity !== 3
  ) {
    throw new Error("The federation rollup was not metered exactly once.");
  }
  for (const row of usage.rows || []) cleanup.push(rows("usage_ledger", row.$id));

  const audits = await request(`${rows("audit_events")}${workspaceQuery(workspaceId)}`);
  const rollupAudit = audits.rows?.find(
    (row) => row.action === "federation.rollup.completed",
  );
  const auditMetadata = JSON.parse(rollupAudit?.metadata || "{}");
  if (
    !rollupAudit ||
    auditMetadata.anchorWorkspaceOnly !== true ||
    auditMetadata.otherMemberWorkspacesQueried !== false ||
    auditMetadata.rawTenantDataExposed !== false ||
    auditMetadata.policyApplied !== false ||
    auditMetadata.delegationActivated !== false ||
    auditMetadata.externalActionsExecuted !== false
  ) {
    throw new Error("The bounded federation rollup was not audited truthfully.");
  }
  for (const row of audits.rows || []) cleanup.push(rows("audit_events", row.$id));

  console.log(
    "Phase 16 ready · anchor-only federation rollup, no-access member proposal, synthetic privacy references, executive hold, and zero policy, delegation, financial, raw-tenant-data, or external-system change verified",
  );
} finally {
  for (const path of cleanup.reverse()) {
    await request(path, { method: "DELETE" }).catch(() => null);
  }
}

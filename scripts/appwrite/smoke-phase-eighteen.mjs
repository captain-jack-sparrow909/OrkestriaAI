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
const workspaceId = makeId("smoke18");
const userId = makeId("user18");
const userEmail = "phase18-smoke@orkestria.local";
const programId = makeId("program18");
const gateId = programId;
const now = new Date();
const nowIso = now.toISOString();
const targetDate = new Date(now.valueOf() + 30 * 24 * 60 * 60 * 1000).toISOString();
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
    name: "Phase 18 Overture smoke",
    slug: `phase18-${suffix}`,
    plan: "enterprise",
    region: "eu-west",
    status: "active",
    settings: JSON.stringify({ phase: 18, generalAvailabilityCommand: true }),
    createdBy: userEmail,
    createdAt: nowIso,
  });
  await create("memberships", makeId("member18"), {
    workspaceId,
    userId,
    userEmail,
    userName: "Phase 18 smoke",
    role: "owner",
    status: "active",
    createdAt: nowIso,
  });
  const connectors = [
    ["appwrite", "Appwrite platform"],
    ["deepseek", "DeepSeek provider"],
    ["github", "GitHub source"],
  ].map(([connectorKey, displayName]) => ({
    $id: makeId(`connector18${connectorKey}`),
    workspaceId,
    programId,
    connectorKey,
    displayName,
    status: "candidate_unverified",
    capabilities: JSON.stringify(["fixture"]),
    scopesVerified: 0,
    liveCallsTested: 0,
    failureModesTested: 0,
    rateLimitsVerified: 0,
    certified: 0,
    externalApproval: 0,
    evidence: JSON.stringify({
      fixture: true,
      productionCertificationCompleted: false,
    }),
    proposedBy: userEmail,
    createdAt: nowIso,
    updatedAt: nowIso,
  }));
  const runbooks = [
    ["incident", "Synthetic incident command", "incident_response"],
    ["rollback", "Synthetic rollback", "release_recovery"],
    ["restore", "Synthetic restore", "data_recovery"],
  ].map(([runbookKey, name, category]) => ({
    $id: makeId(`runbook18${runbookKey}`),
    workspaceId,
    programId,
    runbookKey,
    name,
    category,
    status: "draft_unexercised",
    version: 1,
    content: "Synthetic procedure requiring independent review and exercise.",
    ownerEmail: userEmail,
    reviewed: 0,
    exercisePassed: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
  }));
  const onboarding = [{
    $id: makeId("onboarding18"),
    workspaceId,
    programId,
    name: `Synthetic onboarding ${suffix}`,
    status: "draft_fixture_only",
    audience: "enterprise_owner",
    totalItems: 3,
    completedItems: 1,
    verifiedItems: 0,
    productionCustomerUsed: 0,
    items: JSON.stringify([
      { title: "Create workspace", completed: true, verified: false },
      { title: "Review policy", completed: false, verified: false },
      { title: "Support handoff", completed: false, verified: false },
    ]),
    ownerEmail: userEmail,
    createdAt: nowIso,
    updatedAt: nowIso,
  }];
  await create("ga_readiness_programs", programId, {
    workspaceId,
    name: `Synthetic GA readiness ${suffix}`,
    status: "internal_pre_ga",
    scope: "Bounded GA readiness fixture.",
    startDate: nowIso,
    targetDate,
    ownerEmail: userEmail,
    verified: 0,
    productionLaunchAuthorized: 0,
    connectorCertifications: JSON.stringify(connectors),
    operationalRunbooks: JSON.stringify(runbooks),
    onboardingChecklists: JSON.stringify(onboarding),
    gateStatus: "assessing_hold",
    recommendation: "hold",
    scoreBps: 0,
    blockers: JSON.stringify(["Preflight not assessed."]),
    evidence: JSON.stringify({ syntheticPreflightCompleted: false }),
    launchAuthorized: 0,
    publicLaunchPerformed: 0,
    customerInvitesSent: 0,
    billingActivated: 0,
    decisionTitle: "",
    decisionStatus: "not_requested",
    decision: "none",
    decisionRationale: "",
    approvalStatus: "not_requested",
    decisionAuthorized: 0,
    externalSystemsChanged: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const execution = await request(`/functions/${functionId}/executions`, {
    method: "POST",
    body: JSON.stringify({
      body: JSON.stringify({ workspaceId, programId, gateId }),
      async: false,
      path: "/ga/preflight",
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
    !result.loadTest ||
    !result.securityReview ||
    !result.gate
  ) {
    throw new Error(
      [
        result.error || "Overture preflight failed.",
        execution.errors,
        execution.logs,
      ].filter(Boolean).join("\n"),
    );
  }
  cleanup.push(rows("load_test_runs", result.loadTest.$id));
  cleanup.push(rows("security_review_runs", result.securityReview.$id));

  const loadEvidence = JSON.parse(result.loadTest.evidence || "{}");
  if (
    result.loadTest.status !== "synthetic_harness_passed" ||
    result.loadTest.virtualUsers !== 25 ||
    result.loadTest.totalRequests !== 1500 ||
    result.loadTest.confidenceBps !== 3000 ||
    result.loadTest.decisionGrade !== 0 ||
    result.loadTest.productionTrafficUsed !== 0 ||
    result.loadTest.externalLoadGeneratorUsed !== 0 ||
    loadEvidence.basis !== "deterministic_load_fixture" ||
    loadEvidence.requestsActuallySent !== 0 ||
    loadEvidence.productionEnvironmentTargeted !== false ||
    loadEvidence.infrastructureMetricsObserved !== false ||
    loadEvidence.productionCapacityClaimed !== false
  ) {
    throw new Error("Synthetic load rehearsal was misrepresented as production resilience.");
  }
  const securityEvidence = JSON.parse(result.securityReview.evidence || "{}");
  if (
    result.securityReview.status !== "internal_checklist_only" ||
    result.securityReview.confidenceBps !== 3500 ||
    result.securityReview.decisionGrade !== 0 ||
    result.securityReview.externalPenTestCompleted !== 0 ||
    result.securityReview.supplyChainVerified !== 0 ||
    result.securityReview.secretsScanVerified !== 0 ||
    securityEvidence.basis !== "deterministic_security_fixture" ||
    securityEvidence.sourceCodeScanned !== false ||
    securityEvidence.dependenciesScanned !== false ||
    securityEvidence.externalTesterUsed !== false ||
    securityEvidence.productionSecurityClaimed !== false
  ) {
    throw new Error("Internal security checklist was misrepresented as external assurance.");
  }
  const gateEvidence = JSON.parse(result.gate.evidence || "{}");
  const blockers = JSON.parse(result.gate.blockers || "[]");
  if (
    result.gate.status !== "assessing_hold" ||
    result.gate.recommendation !== "hold" ||
    result.gate.scoreBps !== 0 ||
    blockers.length !== 6 ||
    gateEvidence.syntheticPreflightCompleted !== true ||
    gateEvidence.productionLoadValidated !== false ||
    gateEvidence.externalSecurityValidated !== false ||
    gateEvidence.connectorsCertified !== false ||
    gateEvidence.runbooksExercised !== false ||
    gateEvidence.onboardingVerified !== false ||
    gateEvidence.aiReleaseApproved !== false ||
    result.gate.launchAuthorized !== 0 ||
    result.gate.publicLaunchPerformed !== 0 ||
    result.gate.customerInvitesSent !== 0 ||
    result.gate.billingActivated !== 0
  ) {
    throw new Error("The GA launch gate did not preserve its evidence blockers.");
  }
  await request(rows("ga_readiness_programs", programId), {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        decisionTitle: `Synthetic GA hold ${suffix}`,
        decisionStatus: "held_no_change",
        decision: "hold",
        decisionRationale:
          "All six production-grade evidence requirements remain blocked.",
        approvalStatus: "held",
        decisionAuthorized: 0,
        launchAuthorized: 0,
        publicLaunchPerformed: 0,
        customerInvitesSent: 0,
        billingActivated: 0,
        externalSystemsChanged: 0,
        requestedBy: userEmail,
        requestedAt: nowIso,
        decidedBy: userEmail,
        decidedAt: nowIso,
        updatedAt: nowIso,
      },
    }),
  });

  const usage = await request(`${rows("usage_ledger")}${workspaceQuery(workspaceId)}`);
  if (
    usage.rows?.length !== 1 ||
    usage.rows[0].meter !== "ga_preflight_rehearsal" ||
    usage.rows[0].quantity !== 2 ||
    usage.rows[0].costCents !== 0
  ) {
    throw new Error("The GA preflight was not metered truthfully.");
  }
  for (const row of usage.rows || []) cleanup.push(rows("usage_ledger", row.$id));
  const audits = await request(`${rows("audit_events")}${workspaceQuery(workspaceId)}`);
  const preflightAudit = audits.rows?.find((row) => row.action === "ga.preflight.completed");
  const auditMetadata = JSON.parse(preflightAudit?.metadata || "{}");
  if (
    !preflightAudit ||
    auditMetadata.productionRequestsSent !== 0 ||
    auditMetadata.productionTrafficUsed !== false ||
    auditMetadata.externalLoadGeneratorUsed !== false ||
    auditMetadata.externalPenTestCompleted !== false ||
    auditMetadata.sourceCodeScanned !== false ||
    auditMetadata.dependenciesScanned !== false ||
    auditMetadata.publicLaunchPerformed !== false ||
    auditMetadata.customerInvitesSent !== false ||
    auditMetadata.billingActivated !== false
  ) {
    throw new Error("The bounded GA preflight was not audited truthfully.");
  }
  for (const row of audits.rows || []) cleanup.push(rows("audit_events", row.$id));

  console.log(
    "Phase 18 ready · synthetic load, internal security checklist, uncertified connectors, unexercised runbooks, fixture onboarding, six launch blockers, GA hold, and zero production requests, pen-test traffic, publication, invitations, billing, or external change verified",
  );
} finally {
  for (const path of cleanup.reverse()) {
    await request(path, { method: "DELETE" }).catch(() => null);
  }
}

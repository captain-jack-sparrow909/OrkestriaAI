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

const suffix = Date.now().toString(36);
const workspaceId = `smoke4_${suffix}`.slice(0, 36);
const membershipId = `member4_${suffix}`.slice(0, 36);
const userId = `user4_${suffix}`.slice(0, 36);
const now = new Date().toISOString();
const cleanup = [];

try {
  await request(`/tablesdb/${databaseId}/tables/workspaces/rows`, {
    method: "POST",
    body: JSON.stringify({
      rowId: workspaceId,
      data: {
        name: "Phase 4 smoke",
        slug: `phase4-${suffix}`,
        plan: "test",
        region: "global",
        status: "active",
        settings: "{}",
        createdBy: "phase4-smoke@orkestria.local",
        createdAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(`/tablesdb/${databaseId}/tables/workspaces/rows/${workspaceId}`);

  await request(`/tablesdb/${databaseId}/tables/memberships/rows`, {
    method: "POST",
    body: JSON.stringify({
      rowId: membershipId,
      data: {
        workspaceId,
        userId,
        userEmail: "phase4-smoke@orkestria.local",
        userName: "Phase 4 smoke",
        role: "owner",
        status: "active",
        createdAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(`/tablesdb/${databaseId}/tables/memberships/rows/${membershipId}`);

  const costData = `provider,service,resource_id,monthly_cost,utilization_pct
AWS,EC2,i-staging-api,920,7
AWS,EC2,i-dev-worker,610,3
AWS,EBS,vol-orphaned,380,0
AWS,Redshift,analytics-ra3,4680,31
AWS,NAT Gateway,nat-main,1280,28`;
  const execution = await request(`/functions/${functionId}/executions`, {
    method: "POST",
    body: JSON.stringify({
      body: JSON.stringify({
        workspaceId,
        agent: "helio",
        goal: "Analyze this AWS cost and utilization export for conservative, non-overlapping monthly savings. Do not change any resources.",
        context: JSON.stringify({
          provider: "AWS",
          billingPeriod: "July 2026",
          currency: "USD",
          currentMonthlySpend: 7870,
          forecastMonthlySpend: 8499.6,
          sourceRows: 5,
          costData,
        }),
      }),
      async: false,
      path: "/ai/plan",
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
    !result.plan?.opportunities?.length ||
    !result.run?.$id ||
    !result.costAnalysis?.$id ||
    result.savingsOpportunities?.length !== result.plan.opportunities.length
  ) {
    throw new Error(result.error || execution.errors || "Helio Phase 4 smoke test failed.");
  }

  const resourceIds = result.plan.opportunities.map((item) => item.resourceId);
  if (new Set(resourceIds).size !== resourceIds.length) {
    throw new Error("Helio returned duplicate resource savings.");
  }
  if (
    result.plan.opportunities.some(
      (item) => item.estimatedMonthlySavings > item.currentMonthlyCost,
    )
  ) {
    throw new Error("Helio savings exceeded stated resource cost.");
  }

  cleanup.push(`/tablesdb/${databaseId}/tables/runs/rows/${result.run.$id}`);
  cleanup.push(
    `/tablesdb/${databaseId}/tables/cost_analyses/rows/${result.costAnalysis.$id}`,
  );
  for (const row of result.savingsOpportunities || []) {
    cleanup.push(
      `/tablesdb/${databaseId}/tables/savings_opportunities/rows/${row.$id}`,
    );
  }
  if (result.approval?.$id) {
    cleanup.push(`/tablesdb/${databaseId}/tables/approvals/rows/${result.approval.$id}`);
  }

  const query = encodeURIComponent(JSON.stringify({
    method: "equal",
    attribute: "workspaceId",
    values: [workspaceId],
  }));
  const auditList = await request(
    `/tablesdb/${databaseId}/tables/audit_events/rows?queries[]=${query}&total=false`,
  );
  for (const row of auditList.rows || []) {
    cleanup.push(`/tablesdb/${databaseId}/tables/audit_events/rows/${row.$id}`);
  }

  const monthlySavings = result.plan.opportunities.reduce(
    (total, item) => total + item.estimatedMonthlySavings,
    0,
  );
  console.log(
    `Phase 4 ready · ${result.plan.opportunities.length} opportunities · $${monthlySavings.toFixed(2)} conservative monthly savings · persistence verified`,
  );
} finally {
  for (const path of cleanup.reverse()) {
    await request(path, { method: "DELETE" }).catch(() => null);
  }
}

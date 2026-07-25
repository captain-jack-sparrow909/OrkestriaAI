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
const workspaceId = `smoke_${suffix}`.slice(0, 36);
const membershipId = `member_${suffix}`.slice(0, 36);
const userId = `user_${suffix}`.slice(0, 36);
const now = new Date().toISOString();
const cleanup = [];

try {
  await request(`/tablesdb/${databaseId}/tables/workspaces/rows`, {
    method: "POST",
    body: JSON.stringify({
      rowId: workspaceId,
      data: {
        name: "Phase 2 smoke",
        slug: `phase2-${suffix}`,
        plan: "test",
        region: "global",
        status: "active",
        settings: "{}",
        createdBy: "phase2-smoke@orkestria.local",
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
        userEmail: "phase2-smoke@orkestria.local",
        userName: "Phase 2 smoke",
        role: "owner",
        status: "active",
        createdAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(`/tablesdb/${databaseId}/tables/memberships/rows/${membershipId}`);

  const execution = await request(`/functions/${functionId}/executions`, {
    method: "POST",
    body: JSON.stringify({
      body: JSON.stringify({
        workspaceId,
        agent: "vela",
        goal: "Research the Appwrite homepage and summarize its product positioning without submitting forms.",
        context: JSON.stringify({ mode: "read-only-first" }),
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
    !result.plan?.steps?.length ||
    !result.run?.$id
  ) {
    throw new Error(result.error || execution.errors || "Phase 2 planning smoke test failed.");
  }
  cleanup.push(`/tablesdb/${databaseId}/tables/runs/rows/${result.run.$id}`);
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

  console.log(
    `Phase 2 ready · ${result.plan.steps.length} Vela steps · ${result.plan.risk} risk · approval ${result.plan.approvalRequired ? "required" : "not required"}`,
  );
} finally {
  for (const path of cleanup.reverse()) {
    await request(path, { method: "DELETE" }).catch(() => null);
  }
}

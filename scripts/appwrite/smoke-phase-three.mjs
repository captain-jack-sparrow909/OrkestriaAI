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

const scenarios = [
  {
    agent: "tempo",
    goal: "Analyze the checkout production incident, identify the likely cause from evidence, and recommend a reversible remediation without changing production.",
    context: `deploy checkout-service rc4 completed
checkout p95 increased from 190ms to 850ms
db.pool timeout acquiring connection
active_connections=100 pool_size=100 queue_depth=46
DB_POOL_SIZE changed from 40 to 100`,
  },
  {
    agent: "aegis",
    goal: "Review this Terraform configuration for concrete security vulnerabilities and recommend safe fixes without modifying it.",
    context: `resource "aws_s3_bucket_public_access_block" "exports" {
  block_public_acls = false
  block_public_policy = false
  restrict_public_buckets = false
}
Principal = "*"
Action = "s3:GetObject"`,
  },
];

const suffix = Date.now().toString(36);
const workspaceId = `smoke3_${suffix}`.slice(0, 36);
const membershipId = `member3_${suffix}`.slice(0, 36);
const userId = `user3_${suffix}`.slice(0, 36);
const now = new Date().toISOString();
const cleanup = [];
const summaries = [];

try {
  await request(`/tablesdb/${databaseId}/tables/workspaces/rows`, {
    method: "POST",
    body: JSON.stringify({
      rowId: workspaceId,
      data: {
        name: "Phase 3 smoke",
        slug: `phase3-${suffix}`,
        plan: "test",
        region: "global",
        status: "active",
        settings: "{}",
        createdBy: "phase3-smoke@orkestria.local",
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
        userEmail: "phase3-smoke@orkestria.local",
        userName: "Phase 3 smoke",
        role: "owner",
        status: "active",
        createdAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(`/tablesdb/${databaseId}/tables/memberships/rows/${membershipId}`);

  const evidenceId = `evidence_${suffix}`.slice(0, 36);
  const evidenceUpload = new FormData();
  evidenceUpload.set("fileId", evidenceId);
  evidenceUpload.set(
    "file",
    new Blob(["checkout p95=850ms\npool timeout queue_depth=46"], {
      type: "text/plain",
    }),
    "phase3-smoke.log",
  );
  const uploadResponse = await fetch(
    `${endpoint}/storage/buckets/workspace-uploads/files`,
    {
      method: "POST",
      headers: {
        "X-Appwrite-Project": projectId,
        "X-Appwrite-Key": apiKey,
        "X-Appwrite-Response-Format": "1.9.5",
      },
      body: evidenceUpload,
    },
  );
  const uploaded = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok || !uploaded.$id) {
    throw new Error(uploaded.message || "Phase 3 evidence upload failed.");
  }
  cleanup.push(
    `/storage/buckets/workspace-uploads/files/${uploaded.$id}`,
  );

  for (const scenario of scenarios) {
    const execution = await request(`/functions/${functionId}/executions`, {
      method: "POST",
      body: JSON.stringify({
        body: JSON.stringify({
          workspaceId,
          agent: scenario.agent,
          goal: scenario.goal,
          context: scenario.context,
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
      !result.plan?.findings?.length ||
      !result.run?.$id
    ) {
      throw new Error(
        result.error || execution.errors || `${scenario.agent} Phase 3 smoke test failed.`,
      );
    }

    cleanup.push(`/tablesdb/${databaseId}/tables/runs/rows/${result.run.$id}`);
    if (result.approval?.$id) {
      cleanup.push(`/tablesdb/${databaseId}/tables/approvals/rows/${result.approval.$id}`);
    }
    summaries.push(
      `${scenario.agent} ${result.plan.findings.length} findings / ${result.plan.steps.length} steps`,
    );
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

  console.log(`Phase 3 ready · evidence upload verified · ${summaries.join(" · ")}`);
} finally {
  for (const path of cleanup.reverse()) {
    await request(path, { method: "DELETE" }).catch(() => null);
  }
}

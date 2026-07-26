const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT?.replace(/\/$/, "");
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID || "orkestria";

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

function rowPath(table, rowId = "") {
  return `/tablesdb/${databaseId}/tables/${table}/rows${rowId ? `/${rowId}` : ""}`;
}

function workspaceQuery(workspaceId) {
  const query = encodeURIComponent(JSON.stringify({
    method: "equal",
    attribute: "workspaceId",
    values: [workspaceId],
  }));
  return `?queries[]=${query}&total=false`;
}

const suffix = Date.now().toString(36);
const workspaceId = `smoke5_${suffix}`.slice(0, 36);
const now = new Date().toISOString();
const cleanup = [];

try {
  const workspace = await request(rowPath("workspaces"), {
    method: "POST",
    body: JSON.stringify({
      rowId: workspaceId,
      data: {
        name: "Phase 5 enterprise smoke",
        slug: `phase5-${suffix}`,
        plan: "enterprise",
        region: "eu-west",
        status: "active",
        settings: JSON.stringify({ phase: 5, governance: true }),
        createdBy: "phase5-smoke@orkestria.local",
        createdAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(rowPath("workspaces", workspace.$id));

  const membership = await request(rowPath("memberships"), {
    method: "POST",
    body: JSON.stringify({
      rowId: `member5_${suffix}`.slice(0, 36),
      data: {
        workspaceId,
        userId: `user5_${suffix}`.slice(0, 36),
        userEmail: "phase5-smoke@orkestria.local",
        userName: "Phase 5 smoke",
        role: "owner",
        status: "active",
        createdAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(rowPath("memberships", membership.$id));

  const config = await request(rowPath("enterprise_configs"), {
    method: "POST",
    body: JSON.stringify({
      rowId: `ent5_${suffix}`.slice(0, 36),
      data: {
        workspaceId,
        identityMode: "saml_ready",
        primaryDomain: "smoke.orkestria.local",
        domainStatus: "pending_verification",
        scimStatus: "not_connected",
        dataRegion: "eu-west",
        residencyMode: "pinned",
        privateNetworkStatus: "not_connected",
        privateNetworkProvider: "cloudflare_access",
        slaTier: "enterprise_99_95",
        supportStatus: "ready",
        settings: JSON.stringify({ auditRetentionDays: 365 }),
        updatedBy: "phase5-smoke@orkestria.local",
        updatedAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(rowPath("enterprise_configs", config.$id));

  const role = await request(rowPath("custom_roles"), {
    method: "POST",
    body: JSON.stringify({
      rowId: `role5_${suffix}`.slice(0, 36),
      data: {
        workspaceId,
        name: "Smoke Auditor",
        description: "Validates durable least-privilege roles.",
        capabilities: JSON.stringify(["runs.read", "audit.read"]),
        status: "active",
        memberCount: 0,
        createdBy: "phase5-smoke@orkestria.local",
        createdAt: now,
        updatedAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(rowPath("custom_roles", role.$id));

  const policy = await request(rowPath("policy_packs"), {
    method: "POST",
    body: JSON.stringify({
      rowId: `policy5_${suffix}`.slice(0, 36),
      data: {
        workspaceId,
        name: "Smoke Control Baseline",
        framework: "Orkestria",
        version: "1.0",
        mode: "monitor",
        status: "active",
        rulesCount: 8,
        coverage: 90,
        content: JSON.stringify({ approvals: true }),
        createdAt: now,
        updatedAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(rowPath("policy_packs", policy.$id));

  const enforced = await request(rowPath("policy_packs", policy.$id), {
    method: "PATCH",
    body: JSON.stringify({
      data: { mode: "enforce", updatedAt: new Date().toISOString() },
    }),
  });
  if (enforced.mode !== "enforce") {
    throw new Error("Policy enforcement transition was not persisted.");
  }

  const exportRecord = await request(rowPath("compliance_exports"), {
    method: "POST",
    body: JSON.stringify({
      rowId: `export5_${suffix}`.slice(0, 36),
      data: {
        workspaceId,
        framework: "SOC 2",
        format: "json",
        status: "ready",
        period: "Q3 2026",
        checksum: "a".repeat(64),
        requestedBy: "phase5-smoke@orkestria.local",
        createdAt: now,
        completedAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(rowPath("compliance_exports", exportRecord.$id));

  const [configs, roles, policies, exports] = await Promise.all([
    request(`${rowPath("enterprise_configs")}${workspaceQuery(workspaceId)}`),
    request(`${rowPath("custom_roles")}${workspaceQuery(workspaceId)}`),
    request(`${rowPath("policy_packs")}${workspaceQuery(workspaceId)}`),
    request(`${rowPath("compliance_exports")}${workspaceQuery(workspaceId)}`),
  ]);
  if (
    configs.rows?.length !== 1 ||
    roles.rows?.length !== 1 ||
    policies.rows?.length !== 1 ||
    exports.rows?.length !== 1
  ) {
    throw new Error("Enterprise governance records were not queryable by workspace.");
  }

  console.log(
    "Phase 5 ready · identity, residency, custom roles, policy enforcement, and compliance evidence persistence verified",
  );
} finally {
  for (const path of cleanup.reverse()) {
    await request(path, { method: "DELETE" }).catch(() => null);
  }
}

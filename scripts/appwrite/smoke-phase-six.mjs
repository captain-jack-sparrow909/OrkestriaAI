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

function rows(table, id = "") {
  return `/tablesdb/${databaseId}/tables/${table}/rows${id ? `/${id}` : ""}`;
}

function byWorkspace(workspaceId) {
  return `?queries[]=${encodeURIComponent(JSON.stringify({
    method: "equal",
    attribute: "workspaceId",
    values: [workspaceId],
  }))}&total=false`;
}

const suffix = Date.now().toString(36);
const workspaceId = `smoke6_${suffix}`.slice(0, 36);
const now = new Date().toISOString();
const cleanup = [];

try {
  const workspace = await request(rows("workspaces"), {
    method: "POST",
    body: JSON.stringify({
      rowId: workspaceId,
      data: {
        name: "Phase 6 ecosystem smoke",
        slug: `phase6-${suffix}`,
        plan: "enterprise",
        region: "eu-west",
        status: "active",
        settings: JSON.stringify({ phase: 6, ecosystem: true }),
        createdBy: "phase6-smoke@orkestria.local",
        createdAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(rows("workspaces", workspace.$id));

  const membership = await request(rows("memberships"), {
    method: "POST",
    body: JSON.stringify({
      rowId: `member6_${suffix}`.slice(0, 36),
      data: {
        workspaceId,
        userId: `user6_${suffix}`.slice(0, 36),
        userEmail: "phase6-smoke@orkestria.local",
        userName: "Phase 6 smoke",
        role: "owner",
        status: "active",
        createdAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(rows("memberships", membership.$id));

  const connector = await request(rows("connector_catalog"), {
    method: "POST",
    body: JSON.stringify({
      rowId: `con6_${suffix}`.slice(0, 36),
      data: {
        slug: `smoke-${suffix}`,
        name: "Smoke Connector",
        category: "Testing",
        description: "Validates marketplace persistence.",
        publisher: "Orkestria Test",
        publisherType: "verified",
        authType: "API key",
        version: "1.0.0",
        status: "available",
        capabilities: JSON.stringify(["records.read"]),
        agentKeys: JSON.stringify(["loom"]),
        actionsCount: 1,
        featured: 0,
        createdAt: now,
        updatedAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(rows("connector_catalog", connector.$id));

  const installation = await request(rows("connector_installations"), {
    method: "POST",
    body: JSON.stringify({
      rowId: `inst6_${suffix}`.slice(0, 36),
      data: {
        workspaceId,
        connectorId: connector.$id,
        connectorSlug: connector.slug,
        status: "configuration_required",
        authStatus: "not_authorized",
        environment: "production",
        installedBy: "phase6-smoke@orkestria.local",
        config: JSON.stringify({ authorization: "not_started" }),
        installedAt: now,
        updatedAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(rows("connector_installations", installation.$id));

  const template = await request(rows("policy_templates"), {
    method: "POST",
    body: JSON.stringify({
      rowId: `tpl6_${suffix}`.slice(0, 36),
      data: {
        slug: `smoke-policy-${suffix}`,
        name: "Smoke Vertical Policy",
        industry: "Testing",
        description: "Validates monitor-first policy activation.",
        framework: "Smoke",
        version: "1.0",
        rulesCount: 5,
        content: JSON.stringify({ approvals: ["write"] }),
        status: "available",
        featured: 0,
        createdAt: now,
        updatedAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(rows("policy_templates", template.$id));

  const pack = await request(rows("policy_packs"), {
    method: "POST",
    body: JSON.stringify({
      rowId: `vpack6_${suffix}`.slice(0, 36),
      data: {
        workspaceId,
        name: template.name,
        framework: template.framework,
        version: template.version,
        mode: "monitor",
        status: "active",
        rulesCount: template.rulesCount,
        coverage: 100,
        content: JSON.stringify({ templateSlug: template.slug }),
        createdAt: now,
        updatedAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(rows("policy_packs", pack.$id));

  const signal = await request(rows("product_signals"), {
    method: "POST",
    body: JSON.stringify({
      rowId: `signal6_${suffix}`.slice(0, 36),
      data: {
        workspaceId,
        source: "smoke",
        kind: "coverage_gap",
        title: "Smoke intelligence signal",
        description: "Validates evidence-backed signal persistence.",
        status: "open",
        priority: "medium",
        score: 75,
        evidence: "A smoke connector requires configuration.",
        recommendation: "Complete authorization after scope review.",
        createdAt: now,
        updatedAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(rows("product_signals", signal.$id));
  const acknowledged = await request(rows("product_signals", signal.$id), {
    method: "PATCH",
    body: JSON.stringify({ data: { status: "acknowledged", updatedAt: now } }),
  });

  const submission = await request(rows("partner_submissions"), {
    method: "POST",
    body: JSON.stringify({
      rowId: `partner6_${suffix}`.slice(0, 36),
      data: {
        workspaceId,
        name: "Smoke Partner Connector",
        connectorSlug: `partner-smoke-${suffix}`,
        manifest: JSON.stringify({ schemaVersion: "1.0", actions: [{ risk: "high", requiresApproval: true }] }),
        status: "validated_draft",
        validation: JSON.stringify({ valid: true, approvalGatedActions: 1 }),
        submittedBy: "phase6-smoke@orkestria.local",
        createdAt: now,
        updatedAt: now,
      },
      permissions: [],
    }),
  });
  cleanup.push(rows("partner_submissions", submission.$id));

  const [installations, policies, signals, submissions] = await Promise.all([
    request(`${rows("connector_installations")}${byWorkspace(workspaceId)}`),
    request(`${rows("policy_packs")}${byWorkspace(workspaceId)}`),
    request(`${rows("product_signals")}${byWorkspace(workspaceId)}`),
    request(`${rows("partner_submissions")}${byWorkspace(workspaceId)}`),
  ]);
  if (
    installation.authStatus !== "not_authorized" ||
    pack.mode !== "monitor" ||
    acknowledged.status !== "acknowledged" ||
    installations.rows?.length !== 1 ||
    policies.rows?.length !== 1 ||
    signals.rows?.length !== 1 ||
    submissions.rows?.length !== 1
  ) {
    throw new Error("Phase 6 ecosystem lifecycle did not persist correctly.");
  }
  console.log(
    "Phase 6 ready · connector drafts, monitor-first policy packs, partner manifests, and product intelligence verified",
  );
} finally {
  for (const path of cleanup.reverse()) {
    await request(path, { method: "DELETE" }).catch(() => null);
  }
}

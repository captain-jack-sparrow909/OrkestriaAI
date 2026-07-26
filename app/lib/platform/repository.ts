import { appwriteTables, getAppwriteServerConfig } from "../appwrite/config";
import { AppwriteRestClient, query } from "../appwrite/rest";
import {
  can,
  isWorkspaceRole,
  type AgentKey,
  type AgentPlanResult,
  type ApprovalRecord,
  type ComplianceExportRecord,
  type CustomRoleRecord,
  type EnterpriseConfigRecord,
  type EnterpriseOverview,
  type MembershipRecord,
  type PolicyPackRecord,
} from "./model";

type RowList<T> = {
  rows: T[];
  total: number;
};

function getClient() {
  const config = getAppwriteServerConfig();
  if (!config) return null;
  return {
    config,
    client: new AppwriteRestClient(config),
  };
}

type FunctionExecution = {
  status: string;
  responseStatusCode: number;
  responseBody: string;
  errors?: string;
};

export const availableAgents = new Set<AgentKey>([
  "vela",
  "loom",
  "tempo",
  "helio",
  "aegis",
]);

async function identityHash(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value.trim().toLowerCase()),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function createIfMissing(
  appwrite: NonNullable<ReturnType<typeof getClient>>,
  path: string,
  body: unknown,
) {
  try {
    return await appwrite.client.request(path, { method: "POST", body });
  } catch (error) {
    if (error instanceof Error && "status" in error && error.status === 409) {
      return null;
    }
    throw error;
  }
}

export async function ensureWorkspaceForUser(
  email: string,
  displayName: string,
) {
  const appwrite = getClient();
  if (!appwrite) return null;

  const hash = await identityHash(email);
  const userId = hash.slice(0, 32);
  const workspaceId = `ws_${hash.slice(0, 20)}`;
  const now = new Date().toISOString();

  await createIfMissing(
    appwrite,
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.workspaces}/rows`,
    {
      rowId: workspaceId,
      data: {
        name: "Northstar Labs",
        slug: `northstar-${hash.slice(0, 12)}`,
        plan: "starter",
        region: "global",
        status: "active",
        settings: JSON.stringify({
          phase: 5,
          agents: ["vela", "loom", "tempo", "helio", "aegis"],
          governance: true,
        }),
        createdBy: email.toLowerCase(),
        createdAt: now,
      },
      permissions: [],
    },
  );

  await createIfMissing(
    appwrite,
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.memberships}/rows`,
    {
      rowId: `mem_${hash.slice(0, 20)}`,
      data: {
        workspaceId,
        userId,
        userEmail: email.toLowerCase(),
        userName: displayName.slice(0, 128),
        role: "owner",
        status: "active",
        createdAt: now,
      },
      permissions: [],
    },
  );

  return { workspaceId, userId };
}

export async function enforceAgentPlanRateLimit(email: string, limit = 12) {
  const appwrite = getClient();
  if (!appwrite) return null;

  const now = new Date();
  const windowStart = new Date(
    Math.floor(now.getTime() / 600_000) * 600_000,
  ).toISOString();
  const hash = await identityHash(`${email}:${windowStart}:agent-plan`);
  const rowId = `rl_${hash.slice(0, 24)}`;
  const path =
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.rateLimits}/rows/${rowId}`;

  try {
    const current = await appwrite.client.request<{
      count: number;
      limit: number;
    }>(path);
    if (current.count >= current.limit) {
      throw new Error("Planning limit reached. Try again when the 10-minute window resets.");
    }
    await appwrite.client.request(path, {
      method: "PATCH",
      body: {
        data: {
          count: current.count + 1,
          updatedAt: now.toISOString(),
        },
      },
    });
  } catch (error) {
    if (error instanceof Error && "status" in error && error.status === 404) {
      await appwrite.client.request(
        `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.rateLimits}/rows`,
        {
          method: "POST",
          body: {
            rowId,
            data: {
              scope: `agent-plan:${hash.slice(0, 24)}`,
              windowStart,
              count: 1,
              limit,
              updatedAt: now.toISOString(),
            },
            permissions: [],
          },
        },
      );
      return { remaining: limit - 1, limit };
    }
    throw error;
  }

  return { remaining: Math.max(0, limit - 1), limit };
}

export async function createAgentPlan(input: {
  agent: AgentKey;
  goal: string;
  context: string;
  email: string;
  displayName: string;
}): Promise<AgentPlanResult | null> {
  const appwrite = getClient();
  if (!appwrite) return null;
  if (!availableAgents.has(input.agent)) {
    throw new Error("This agent is not available yet.");
  }

  const workspace = await ensureWorkspaceForUser(input.email, input.displayName);
  if (!workspace) return null;
  await enforceAgentPlanRateLimit(input.email);

  const functionId = process.env.APPWRITE_FUNCTION_ID || "orchestrator";
  const execution = await appwrite.client.request<FunctionExecution>(
    `/functions/${functionId}/executions`,
    {
      method: "POST",
      body: {
        body: JSON.stringify({
          workspaceId: workspace.workspaceId,
          agent: input.agent,
          goal: input.goal.slice(0, 6000),
          context: input.context.slice(0, 12000),
        }),
        async: false,
        path: "/ai/plan",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-orkestria-user-id": workspace.userId,
        },
      },
    },
  );

  let response: (AgentPlanResult & { error?: string }) | null = null;
  try {
    response = JSON.parse(execution.responseBody || "null");
  } catch {
    throw new Error("The agent returned an unreadable response.");
  }
  if (
    execution.status !== "completed" ||
    execution.responseStatusCode >= 400 ||
    !response?.plan
  ) {
    throw new Error(response?.error || execution.errors || "Agent planning failed.");
  }

  return response;
}

export async function recordWorkspaceFile(input: {
  workspaceId: string;
  fileId: string;
  ownerEmail: string;
  name: string;
  mimeType: string;
  size: number;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const now = new Date();

  return appwrite.client.request(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.files}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          bucketId: "workspace-uploads",
          fileId: input.fileId,
          ownerEmail: input.ownerEmail.toLowerCase(),
          name: input.name.slice(0, 255),
          mimeType: input.mimeType.slice(0, 128),
          size: input.size,
          scanStatus: "pending",
          retentionUntil: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
          createdAt: now.toISOString(),
        },
        permissions: [],
      },
    },
  );
}

export async function findMembership(workspaceId: string, email: string) {
  const appwrite = getClient();
  if (!appwrite) return null;

  const result = await appwrite.client.request<RowList<MembershipRecord>>(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.memberships}/rows`,
    {
      queries: [
        query.equal("workspaceId", workspaceId),
        query.equal("userEmail", email.toLowerCase()),
        query.equal("status", "active"),
        query.limit(1),
      ],
      ttl: 15,
    },
  );

  const membership = result.rows[0];
  if (!membership || !isWorkspaceRole(membership.role)) return null;
  return membership;
}

export async function listPendingApprovals(
  workspaceId: string,
  email: string,
): Promise<ApprovalRecord[] | null> {
  const appwrite = getClient();
  if (!appwrite) return null;
  const membership = await findMembership(workspaceId, email);
  if (!membership || !can(membership.role, "approvals.decide")) {
    throw new Error("You do not have permission to review approvals.");
  }

  const result = await appwrite.client.request<RowList<ApprovalRecord>>(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.approvals}/rows`,
    {
      queries: [
        query.equal("workspaceId", workspaceId),
        query.equal("state", "pending"),
        query.orderDesc("requestedAt"),
        query.limit(25),
      ],
      ttl: 5,
    },
  );
  return result.rows;
}

export async function decideApproval(input: {
  approvalId: string;
  workspaceId: string;
  email: string;
  decision: "approved" | "denied";
  reason?: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const membership = await findMembership(input.workspaceId, input.email);
  if (!membership || !can(membership.role, "approvals.decide")) {
    throw new Error("You do not have permission to decide approvals.");
  }

  const approval = await appwrite.client.request<ApprovalRecord>(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.approvals}/rows/${input.approvalId}`,
  );
  if (approval.workspaceId !== input.workspaceId || approval.state !== "pending") {
    throw new Error("This approval is not available for a decision.");
  }

  const now = new Date().toISOString();
  const updated = await appwrite.client.request<ApprovalRecord>(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.approvals}/rows/${input.approvalId}`,
    {
      method: "PATCH",
      body: {
        data: {
          state: input.decision,
          approverEmail: input.email.toLowerCase(),
          reason: input.reason?.slice(0, 2000),
          decidedAt: now,
        },
      },
    },
  );

  await appwrite.client.request(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.auditEvents}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          actorEmail: input.email.toLowerCase(),
          action: `approval.${input.decision}`,
          targetType: "approval",
          targetId: input.approvalId,
          outcome: "success",
          metadata: JSON.stringify({ runId: approval.runId, reason: input.reason }),
          occurredAt: now,
        },
        permissions: [],
      },
    },
  );

  return updated;
}

const enterpriseCapabilities = new Set([
  "workspace.manage",
  "members.manage",
  "agents.run",
  "approvals.decide",
  "runs.read",
  "audit.read",
  "billing.manage",
  "policies.manage",
  "exports.create",
]);

function enterpriseRowId(prefix: string, workspaceId: string) {
  return `${prefix}_${workspaceId.replace(/[^a-zA-Z0-9_]/g, "")}`.slice(0, 36);
}

async function writeAuditEvent(input: {
  workspaceId: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: unknown;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  return appwrite.client.request(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.auditEvents}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          actorEmail: input.actorEmail.toLowerCase(),
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          outcome: "success",
          metadata: JSON.stringify(input.metadata || {}),
          occurredAt: new Date().toISOString(),
        },
        permissions: [],
      },
    },
  );
}

async function requireEnterpriseOwner(workspaceId: string, email: string) {
  const membership = await findMembership(workspaceId, email);
  if (!membership || !can(membership.role, "workspace.manage")) {
    throw new Error("Only workspace owners can change enterprise controls.");
  }
  return membership;
}

async function ensureEnterpriseFoundation(email: string, displayName: string) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureWorkspaceForUser(email, displayName);
  if (!workspace) return null;
  const now = new Date().toISOString();
  const suffix = workspace.workspaceId.replace(/^ws_/, "").slice(0, 18);
  const configId = enterpriseRowId("ent", workspace.workspaceId);

  await createIfMissing(
    appwrite,
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.enterpriseConfigs}/rows`,
    {
      rowId: configId,
      data: {
        workspaceId: workspace.workspaceId,
        identityMode: "saml_ready",
        primaryDomain: "northstarlabs.com",
        domainStatus: "pending_verification",
        scimStatus: "not_connected",
        dataRegion: "eu-west",
        residencyMode: "pinned",
        privateNetworkStatus: "not_connected",
        privateNetworkProvider: "cloudflare_access",
        slaTier: "enterprise_99_95",
        supportStatus: "ready",
        settings: JSON.stringify({
          sessionMinutes: 480,
          breakGlassAccounts: 2,
          auditRetentionDays: 365,
          encryption: "managed",
        }),
        updatedBy: email.toLowerCase(),
        updatedAt: now,
      },
      permissions: [],
    },
  );

  const roleSeeds = [
    {
      id: `role_ops_${suffix}`,
      name: "AI Operator",
      description: "Run approved agents and inspect execution evidence.",
      capabilities: ["agents.run", "runs.read", "audit.read"],
      memberCount: 8,
    },
    {
      id: `role_cost_${suffix}`,
      name: "Cost Controller",
      description: "Review Helio recommendations and approve financial actions.",
      capabilities: ["runs.read", "approvals.decide", "audit.read", "billing.manage"],
      memberCount: 3,
    },
    {
      id: `role_sec_${suffix}`,
      name: "Security Reviewer",
      description: "Review Aegis findings and security-sensitive approvals.",
      capabilities: ["runs.read", "approvals.decide", "audit.read"],
      memberCount: 4,
    },
  ];
  for (const role of roleSeeds) {
    await createIfMissing(
      appwrite,
      `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.customRoles}/rows`,
      {
        rowId: role.id.slice(0, 36),
        data: {
          workspaceId: workspace.workspaceId,
          name: role.name,
          description: role.description,
          capabilities: JSON.stringify(role.capabilities),
          status: "active",
          memberCount: role.memberCount,
          createdBy: email.toLowerCase(),
          createdAt: now,
          updatedAt: now,
        },
        permissions: [],
      },
    );
  }

  const policySeeds = [
    {
      id: `policy_control_${suffix}`,
      name: "Human Control Baseline",
      framework: "Orkestria",
      version: "1.0",
      mode: "enforce",
      rulesCount: 18,
      coverage: 96,
      content: {
        approvals: ["purchase", "submission", "production_change", "sensitive_data"],
        breakGlass: "owner_only",
      },
    },
    {
      id: `policy_soc2_${suffix}`,
      name: "SOC 2 Operations",
      framework: "SOC 2",
      version: "2026.1",
      mode: "monitor",
      rulesCount: 24,
      coverage: 88,
      content: {
        controls: ["CC6", "CC7", "CC8"],
        evidence: "continuous",
      },
    },
    {
      id: `policy_cloud_${suffix}`,
      name: "Cloud Change Safety",
      framework: "CIS Cloud",
      version: "2.0",
      mode: "enforce",
      rulesCount: 31,
      coverage: 92,
      content: {
        providers: ["aws", "azure", "gcp"],
        reversibleChanges: true,
      },
    },
  ];
  for (const policy of policySeeds) {
    await createIfMissing(
      appwrite,
      `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.policyPacks}/rows`,
      {
        rowId: policy.id.slice(0, 36),
        data: {
          workspaceId: workspace.workspaceId,
          name: policy.name,
          framework: policy.framework,
          version: policy.version,
          mode: policy.mode,
          status: "active",
          rulesCount: policy.rulesCount,
          coverage: policy.coverage,
          content: JSON.stringify(policy.content),
          createdAt: now,
          updatedAt: now,
        },
        permissions: [],
      },
    );
  }

  await appwrite.client.request(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.workspaces}/rows/${workspace.workspaceId}`,
    {
      method: "PATCH",
      body: {
        data: {
          plan: "enterprise",
          settings: JSON.stringify({
            phase: 5,
            agents: ["vela", "loom", "tempo", "helio", "aegis"],
            governance: true,
          }),
        },
      },
    },
  );

  return { ...workspace, configId };
}

export async function getEnterpriseOverview(
  email: string,
  displayName: string,
): Promise<EnterpriseOverview | null> {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureEnterpriseFoundation(email, displayName);
  if (!workspace) return null;
  const membership = await findMembership(workspace.workspaceId, email);
  if (!membership || !can(membership.role, "audit.read")) {
    throw new Error("You do not have permission to view enterprise controls.");
  }

  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const [config, roles, policies, exports] = await Promise.all([
    appwrite.client.request<EnterpriseConfigRecord>(
      `${base}/${appwriteTables.enterpriseConfigs}/rows/${workspace.configId}`,
    ),
    appwrite.client.request<RowList<CustomRoleRecord>>(
      `${base}/${appwriteTables.customRoles}/rows`,
      {
        queries: [
          query.equal("workspaceId", workspace.workspaceId),
          query.limit(50),
        ],
        ttl: 10,
      },
    ),
    appwrite.client.request<RowList<PolicyPackRecord>>(
      `${base}/${appwriteTables.policyPacks}/rows`,
      {
        queries: [
          query.equal("workspaceId", workspace.workspaceId),
          query.limit(50),
        ],
        ttl: 10,
      },
    ),
    appwrite.client.request<RowList<ComplianceExportRecord>>(
      `${base}/${appwriteTables.complianceExports}/rows`,
      {
        queries: [
          query.equal("workspaceId", workspace.workspaceId),
          query.orderDesc("createdAt"),
          query.limit(12),
        ],
        ttl: 5,
      },
    ),
  ]);

  return {
    workspaceId: workspace.workspaceId,
    config,
    roles: roles.rows,
    policies: policies.rows,
    exports: exports.rows,
  };
}

export async function updateEnterpriseResidency(input: {
  workspaceId: string;
  email: string;
  region: string;
  mode: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const allowedRegions = new Set(["us-east", "us-west", "eu-west", "ap-southeast"]);
  const allowedModes = new Set(["pinned", "global"]);
  if (!allowedRegions.has(input.region) || !allowedModes.has(input.mode)) {
    throw new Error("Unsupported residency configuration.");
  }
  const rowId = enterpriseRowId("ent", input.workspaceId);
  const config = await appwrite.client.request<EnterpriseConfigRecord>(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.enterpriseConfigs}/rows/${rowId}`,
    {
      method: "PATCH",
      body: {
        data: {
          dataRegion: input.region,
          residencyMode: input.mode,
          updatedBy: input.email.toLowerCase(),
          updatedAt: new Date().toISOString(),
        },
      },
    },
  );
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "enterprise.residency.updated",
    targetType: "enterprise_config",
    targetId: rowId,
    metadata: { region: input.region, mode: input.mode },
  });
  return config;
}

export async function setPolicyPackMode(input: {
  workspaceId: string;
  email: string;
  policyId: string;
  mode: "monitor" | "enforce";
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const path =
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.policyPacks}/rows/${input.policyId}`;
  const current = await appwrite.client.request<PolicyPackRecord>(path);
  if (current.workspaceId !== input.workspaceId) {
    throw new Error("This policy pack is not part of the workspace.");
  }
  const policy = await appwrite.client.request<PolicyPackRecord>(path, {
    method: "PATCH",
    body: {
      data: {
        mode: input.mode,
        updatedAt: new Date().toISOString(),
      },
    },
  });
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "enterprise.policy.mode_changed",
    targetType: "policy_pack",
    targetId: input.policyId,
    metadata: { previousMode: current.mode, mode: input.mode },
  });
  return policy;
}

export async function createCustomRole(input: {
  workspaceId: string;
  email: string;
  name: string;
  description: string;
  capabilities: string[];
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 64);
  if (name.length < 3) throw new Error("A role name of at least three characters is required.");
  const capabilities = Array.from(
    new Set(input.capabilities.filter((item) => enterpriseCapabilities.has(item))),
  ).slice(0, 12);
  if (!capabilities.length) throw new Error("Select at least one role capability.");
  const now = new Date().toISOString();
  const role = await appwrite.client.request<CustomRoleRecord>(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.customRoles}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          name,
          description: input.description.trim().slice(0, 255) || "Custom enterprise role.",
          capabilities: JSON.stringify(capabilities),
          status: "active",
          memberCount: 0,
          createdBy: input.email.toLowerCase(),
          createdAt: now,
          updatedAt: now,
        },
        permissions: [],
      },
    },
  );
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "enterprise.role.created",
    targetType: "custom_role",
    targetId: role.$id,
    metadata: { name, capabilities },
  });
  return role;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function requestComplianceExport(input: {
  workspaceId: string;
  email: string;
  framework: string;
  period: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const membership = await findMembership(input.workspaceId, input.email);
  if (!membership || !can(membership.role, "audit.read")) {
    throw new Error("You do not have permission to create compliance exports.");
  }
  const allowedFrameworks = new Set(["SOC 2", "ISO 27001", "CIS Cloud", "Full audit"]);
  if (!allowedFrameworks.has(input.framework)) {
    throw new Error("Unsupported compliance framework.");
  }
  const now = new Date().toISOString();
  const checksum = await sha256(
    `${input.workspaceId}:${input.framework}:${input.period}:${now}`,
  );
  const row = await appwrite.client.request<ComplianceExportRecord>(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.complianceExports}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          framework: input.framework,
          format: "json",
          status: "ready",
          period: input.period.slice(0, 64),
          checksum,
          requestedBy: input.email.toLowerCase(),
          createdAt: now,
          completedAt: now,
        },
        permissions: [],
      },
    },
  );
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "enterprise.export.created",
    targetType: "compliance_export",
    targetId: row.$id,
    metadata: { framework: input.framework, period: input.period, checksum },
  });
  return row;
}

export async function buildComplianceExport(input: {
  workspaceId: string;
  exportId: string;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const membership = await findMembership(input.workspaceId, input.email);
  if (!membership || !can(membership.role, "audit.read")) {
    throw new Error("You do not have permission to download compliance exports.");
  }
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const record = await appwrite.client.request<ComplianceExportRecord>(
    `${base}/${appwriteTables.complianceExports}/rows/${input.exportId}`,
  );
  if (record.workspaceId !== input.workspaceId || record.status !== "ready") {
    throw new Error("This compliance export is not available.");
  }
  const [config, policies, roles] = await Promise.all([
    appwrite.client.request<EnterpriseConfigRecord>(
      `${base}/${appwriteTables.enterpriseConfigs}/rows/${enterpriseRowId("ent", input.workspaceId)}`,
    ),
    appwrite.client.request<RowList<PolicyPackRecord>>(
      `${base}/${appwriteTables.policyPacks}/rows`,
      { queries: [query.equal("workspaceId", input.workspaceId), query.limit(50)] },
    ),
    appwrite.client.request<RowList<CustomRoleRecord>>(
      `${base}/${appwriteTables.customRoles}/rows`,
      { queries: [query.equal("workspaceId", input.workspaceId), query.limit(50)] },
    ),
  ]);
  return {
    manifest: {
      product: "OrkestriaAI",
      framework: record.framework,
      period: record.period,
      generatedAt: record.completedAt,
      checksum: record.checksum,
      evidenceClass: "configuration_snapshot",
    },
    identity: {
      mode: config.identityMode,
      domainStatus: config.domainStatus,
      scimStatus: config.scimStatus,
    },
    residency: {
      region: config.dataRegion,
      mode: config.residencyMode,
      privateNetworkStatus: config.privateNetworkStatus,
    },
    policyPacks: policies.rows.map((policy) => ({
      name: policy.name,
      framework: policy.framework,
      version: policy.version,
      mode: policy.mode,
      coverage: policy.coverage,
    })),
    customRoles: roles.rows.map((role) => ({
      name: role.name,
      capabilities: JSON.parse(role.capabilities || "[]"),
      memberCount: role.memberCount,
    })),
    note: "This snapshot reports configured OrkestriaAI controls. External SAML, SCIM, and private-network connectivity must be verified independently.",
  };
}

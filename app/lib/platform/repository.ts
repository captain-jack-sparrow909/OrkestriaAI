import { appwriteTables, getAppwriteServerConfig } from "../appwrite/config";
import { AppwriteRestClient, query } from "../appwrite/rest";
import { validateConnectorManifest } from "../ecosystem/manifest";
import {
  can,
  isWorkspaceRole,
  type AgentKey,
  type AgentPlanResult,
  type ApprovalRecord,
  type ComplianceExportRecord,
  type ConnectorCatalogRecord,
  type ConnectorInstallationRecord,
  type CustomRoleRecord,
  type EcosystemOverview,
  type EnterpriseConfigRecord,
  type EnterpriseOverview,
  type ActionScopeRecord,
  type JobRecord,
  type LaunchDecisionRecord,
  type LaunchroomOverview,
  type MembershipRecord,
  type OperationsOverview,
  type PartnerSubmissionRecord,
  type PilotExerciseRecord,
  type PilotMemberRecord,
  type PilotProgramRecord,
  type PolicyPackRecord,
  type PolicyTemplateRecord,
  type ProductSignalRecord,
  type ProviderAuthorizationRecord,
  type RecoveryDrillRecord,
  type SupportRotationRecord,
  type UsageLedgerRecord,
  type ValidationRunRecord,
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

async function ensureEcosystemFoundation(email: string, displayName: string) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureEnterpriseFoundation(email, displayName);
  if (!workspace) return null;
  const now = new Date().toISOString();
  const catalogSeeds = [
    {
      id: "con_github",
      slug: "github",
      name: "GitHub",
      category: "Code & CI",
      description: "Repositories, pull requests, checks, releases, and security findings.",
      publisher: "Orkestria Verified",
      authType: "OAuth 2.0",
      version: "2.1.0",
      capabilities: ["pull_requests", "checks", "releases", "code_scanning"],
      agentKeys: ["loom", "tempo", "aegis"],
      actionsCount: 14,
      featured: 1,
    },
    {
      id: "con_slack",
      slug: "slack",
      name: "Slack",
      category: "Collaboration",
      description: "Channels, messages, incident rooms, approvals, and notifications.",
      publisher: "Orkestria Verified",
      authType: "OAuth 2.0",
      version: "1.8.0",
      capabilities: ["messages", "channels", "threads", "approvals"],
      agentKeys: ["vela", "loom", "tempo"],
      actionsCount: 9,
      featured: 1,
    },
    {
      id: "con_aws",
      slug: "aws",
      name: "Amazon Web Services",
      category: "Cloud",
      description: "Cost, inventory, utilization, alerts, and guarded infrastructure actions.",
      publisher: "Orkestria Verified",
      authType: "Role federation",
      version: "3.0.0",
      capabilities: ["cost_explorer", "cloudwatch", "inventory", "changes"],
      agentKeys: ["tempo", "helio", "aegis"],
      actionsCount: 18,
      featured: 1,
    },
    {
      id: "con_datadog",
      slug: "datadog",
      name: "Datadog",
      category: "Observability",
      description: "Metrics, logs, traces, monitors, incidents, and deployment markers.",
      publisher: "Orkestria Verified",
      authType: "API key",
      version: "1.6.0",
      capabilities: ["metrics", "logs", "traces", "monitors"],
      agentKeys: ["tempo"],
      actionsCount: 12,
      featured: 0,
    },
    {
      id: "con_google",
      slug: "google-workspace",
      name: "Google Workspace",
      category: "Productivity",
      description: "Gmail, Calendar, Drive, Sheets, and approval-safe document workflows.",
      publisher: "Orkestria Verified",
      authType: "OAuth 2.0",
      version: "2.4.0",
      capabilities: ["mail", "calendar", "drive", "sheets"],
      agentKeys: ["vela", "loom"],
      actionsCount: 16,
      featured: 0,
    },
    {
      id: "con_stripe",
      slug: "stripe",
      name: "Stripe",
      category: "Finance",
      description: "Customers, invoices, subscriptions, disputes, and gated refunds.",
      publisher: "Orkestria Verified",
      authType: "OAuth 2.0",
      version: "1.3.0",
      capabilities: ["customers", "invoices", "subscriptions", "refunds"],
      agentKeys: ["vela", "loom", "helio"],
      actionsCount: 8,
      featured: 0,
    },
    {
      id: "con_jira",
      slug: "jira",
      name: "Jira",
      category: "Delivery",
      description: "Issues, projects, sprints, incidents, and change-management evidence.",
      publisher: "Orkestria Verified",
      authType: "OAuth 2.0",
      version: "1.9.0",
      capabilities: ["issues", "projects", "sprints", "changes"],
      agentKeys: ["loom", "tempo", "aegis"],
      actionsCount: 11,
      featured: 0,
    },
    {
      id: "con_appwrite",
      slug: "appwrite",
      name: "Appwrite",
      category: "Platform",
      description: "Projects, functions, databases, storage, executions, and platform health.",
      publisher: "Orkestria Labs",
      authType: "API key",
      version: "1.0.0",
      capabilities: ["functions", "tables", "storage", "health"],
      agentKeys: ["loom", "tempo", "aegis"],
      actionsCount: 13,
      featured: 0,
    },
  ];
  for (const connector of catalogSeeds) {
    await createIfMissing(
      appwrite,
      `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.connectorCatalog}/rows`,
      {
        rowId: connector.id,
        data: {
          slug: connector.slug,
          name: connector.name,
          category: connector.category,
          description: connector.description,
          publisher: connector.publisher,
          publisherType: "verified",
          authType: connector.authType,
          version: connector.version,
          status: "available",
          capabilities: JSON.stringify(connector.capabilities),
          agentKeys: JSON.stringify(connector.agentKeys),
          actionsCount: connector.actionsCount,
          featured: connector.featured,
          createdAt: now,
          updatedAt: now,
        },
        permissions: [],
      },
    );
  }

  const policySeeds = [
    {
      id: "tpl_hipaa",
      slug: "healthcare-safety",
      name: "Healthcare Safety",
      industry: "Healthcare",
      description: "PHI boundaries, minimum necessary access, and evidence retention.",
      framework: "HIPAA",
      version: "1.0",
      rulesCount: 28,
      content: { approvals: ["phi_export", "patient_update"], retentionDays: 2190 },
      featured: 1,
    },
    {
      id: "tpl_sox",
      slug: "financial-operations",
      name: "Financial Operations",
      industry: "Financial Services",
      description: "Segregation of duties, payment controls, and immutable evidence.",
      framework: "SOX",
      version: "1.2",
      rulesCount: 34,
      content: { approvals: ["payment", "refund", "ledger_write"], dualControl: true },
      featured: 1,
    },
    {
      id: "tpl_saas",
      slug: "saas-trust",
      name: "SaaS Trust",
      industry: "B2B SaaS",
      description: "Tenant isolation, production changes, and customer-data handling.",
      framework: "SOC 2",
      version: "2.0",
      rulesCount: 31,
      content: { controls: ["CC6", "CC7", "CC8"], evidence: "continuous" },
      featured: 0,
    },
    {
      id: "tpl_nist",
      slug: "public-sector-boundary",
      name: "Public Sector Boundary",
      industry: "Public Sector",
      description: "Regional boundaries, privileged access, and NIST-aligned response.",
      framework: "NIST 800-53",
      version: "1.1",
      rulesCount: 42,
      content: { controls: ["AC", "AU", "IR", "SC"], regionPinned: true },
      featured: 0,
    },
  ];
  for (const template of policySeeds) {
    await createIfMissing(
      appwrite,
      `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.policyTemplates}/rows`,
      {
        rowId: template.id,
        data: {
          slug: template.slug,
          name: template.name,
          industry: template.industry,
          description: template.description,
          framework: template.framework,
          version: template.version,
          rulesCount: template.rulesCount,
          content: JSON.stringify(template.content),
          status: "available",
          featured: template.featured,
          createdAt: now,
          updatedAt: now,
        },
        permissions: [],
      },
    );
  }

  const suffix = workspace.workspaceId.replace(/^ws_/, "").slice(0, 18);
  const signalSeeds = [
    {
      id: `sig_observe_${suffix}`,
      source: "coverage",
      kind: "connector_gap",
      title: "Close the observability context gap",
      description: "Tempo has no installed observability connector in this workspace.",
      priority: "high",
      score: 84,
      evidence: "No Datadog installation record exists for the workspace.",
      recommendation: "Install Datadog as a configuration-required draft, then authorize it with least-privilege scopes.",
    },
    {
      id: `sig_policy_${suffix}`,
      source: "governance",
      kind: "vertical_policy",
      title: "Add a vertical policy baseline",
      description: "Enterprise controls are active, but no industry policy template has been installed.",
      priority: "medium",
      score: 72,
      evidence: "The policy catalog contains no workspace-installed vertical template.",
      recommendation: "Review the policy template that matches the workspace's regulated context before enforcing it.",
    },
    {
      id: `sig_sdk_${suffix}`,
      source: "ecosystem",
      kind: "partner_extension",
      title: "Package one internal system as a connector",
      description: "The partner manifest SDK can make internal tools inherit OrkestriaAI guardrails.",
      priority: "low",
      score: 58,
      evidence: "No partner connector manifest has been validated for this workspace.",
      recommendation: "Validate a draft manifest; publishing remains a separate reviewed action.",
    },
  ];
  for (const signal of signalSeeds) {
    await createIfMissing(
      appwrite,
      `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.productSignals}/rows`,
      {
        rowId: signal.id.slice(0, 36),
        data: {
          workspaceId: workspace.workspaceId,
          source: signal.source,
          kind: signal.kind,
          title: signal.title,
          description: signal.description,
          status: "open",
          priority: signal.priority,
          score: signal.score,
          evidence: signal.evidence,
          recommendation: signal.recommendation,
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
            phase: 6,
            agents: ["vela", "loom", "tempo", "helio", "aegis"],
            governance: true,
            ecosystem: true,
          }),
        },
      },
    },
  );
  return workspace;
}

export async function getEcosystemOverview(
  email: string,
  displayName: string,
): Promise<EcosystemOverview | null> {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureEcosystemFoundation(email, displayName);
  if (!workspace) return null;
  const membership = await findMembership(workspace.workspaceId, email);
  if (!membership || !can(membership.role, "audit.read")) {
    throw new Error("You do not have permission to view the ecosystem.");
  }
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const [catalog, installations, templates, policies, signals, submissions] =
    await Promise.all([
      appwrite.client.request<RowList<ConnectorCatalogRecord>>(
        `${base}/${appwriteTables.connectorCatalog}/rows`,
        { queries: [query.limit(100)], ttl: 60 },
      ),
      appwrite.client.request<RowList<ConnectorInstallationRecord>>(
        `${base}/${appwriteTables.connectorInstallations}/rows`,
        {
          queries: [query.equal("workspaceId", workspace.workspaceId), query.limit(100)],
          ttl: 5,
        },
      ),
      appwrite.client.request<RowList<PolicyTemplateRecord>>(
        `${base}/${appwriteTables.policyTemplates}/rows`,
        { queries: [query.limit(100)], ttl: 60 },
      ),
      appwrite.client.request<RowList<PolicyPackRecord>>(
        `${base}/${appwriteTables.policyPacks}/rows`,
        {
          queries: [query.equal("workspaceId", workspace.workspaceId), query.limit(100)],
          ttl: 5,
        },
      ),
      appwrite.client.request<RowList<ProductSignalRecord>>(
        `${base}/${appwriteTables.productSignals}/rows`,
        {
          queries: [
            query.equal("workspaceId", workspace.workspaceId),
            query.orderDesc("createdAt"),
            query.limit(50),
          ],
          ttl: 5,
        },
      ),
      appwrite.client.request<RowList<PartnerSubmissionRecord>>(
        `${base}/${appwriteTables.partnerSubmissions}/rows`,
        {
          queries: [query.equal("workspaceId", workspace.workspaceId), query.limit(50)],
          ttl: 5,
        },
      ),
    ]);
  const activePolicyTemplateSlugs = policies.rows.flatMap((policy) => {
    try {
      const content = JSON.parse(policy.content || "{}");
      return typeof content.templateSlug === "string" ? [content.templateSlug] : [];
    } catch {
      return [];
    }
  });
  return {
    workspaceId: workspace.workspaceId,
    catalog: catalog.rows,
    installations: installations.rows,
    policyTemplates: templates.rows,
    activePolicyTemplateSlugs,
    signals: signals.rows,
    submissions: submissions.rows,
  };
}

export async function installEcosystemConnector(input: {
  workspaceId: string;
  connectorId: string;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const connector = await appwrite.client.request<ConnectorCatalogRecord>(
    `${base}/${appwriteTables.connectorCatalog}/rows/${input.connectorId}`,
  );
  if (connector.status !== "available") throw new Error("This connector is not available.");
  const now = new Date().toISOString();
  const key = await sha256(`${input.workspaceId}:${connector.$id}`);
  const rowId = `inst_${key.slice(0, 31)}`;
  await createIfMissing(
    appwrite,
    `${base}/${appwriteTables.connectorInstallations}/rows`,
    {
      rowId,
      data: {
        workspaceId: input.workspaceId,
        connectorId: connector.$id,
        connectorSlug: connector.slug,
        status: "configuration_required",
        authStatus: "not_authorized",
        environment: "production",
        installedBy: input.email.toLowerCase(),
        config: JSON.stringify({
          requestedScopes: JSON.parse(connector.capabilities || "[]"),
          authorization: "not_started",
        }),
        installedAt: now,
        updatedAt: now,
      },
      permissions: [],
    },
  );
  const installation = await appwrite.client.request<ConnectorInstallationRecord>(
    `${base}/${appwriteTables.connectorInstallations}/rows/${rowId}`,
  );
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "ecosystem.connector.installed",
    targetType: "connector_installation",
    targetId: rowId,
    metadata: {
      connector: connector.slug,
      status: "configuration_required",
      authStatus: "not_authorized",
    },
  });
  return installation;
}

export async function activateVerticalPolicy(input: {
  workspaceId: string;
  templateId: string;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const template = await appwrite.client.request<PolicyTemplateRecord>(
    `${base}/${appwriteTables.policyTemplates}/rows/${input.templateId}`,
  );
  if (template.status !== "available") throw new Error("This policy template is unavailable.");
  const key = await sha256(`${input.workspaceId}:${template.slug}`);
  const rowId = `vpack_${key.slice(0, 30)}`;
  const now = new Date().toISOString();
  await createIfMissing(appwrite, `${base}/${appwriteTables.policyPacks}/rows`, {
    rowId,
    data: {
      workspaceId: input.workspaceId,
      name: template.name,
      framework: template.framework,
      version: template.version,
      mode: "monitor",
      status: "active",
      rulesCount: template.rulesCount,
      coverage: 100,
      content: JSON.stringify({
        templateId: template.$id,
        templateSlug: template.slug,
        rules: JSON.parse(template.content || "{}"),
      }),
      createdAt: now,
      updatedAt: now,
    },
    permissions: [],
  });
  const policy = await appwrite.client.request<PolicyPackRecord>(
    `${base}/${appwriteTables.policyPacks}/rows/${rowId}`,
  );
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "ecosystem.policy_template.activated",
    targetType: "policy_pack",
    targetId: rowId,
    metadata: { template: template.slug, mode: "monitor" },
  });
  return policy;
}

export async function acknowledgeProductSignal(input: {
  workspaceId: string;
  signalId: string;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const membership = await findMembership(input.workspaceId, input.email);
  if (!membership || !can(membership.role, "audit.read")) {
    throw new Error("You do not have permission to acknowledge intelligence signals.");
  }
  const path =
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.productSignals}/rows/${input.signalId}`;
  const current = await appwrite.client.request<ProductSignalRecord>(path);
  if (current.workspaceId !== input.workspaceId) throw new Error("Signal is not in this workspace.");
  const signal = await appwrite.client.request<ProductSignalRecord>(path, {
    method: "PATCH",
    body: { data: { status: "acknowledged", updatedAt: new Date().toISOString() } },
  });
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "ecosystem.signal.acknowledged",
    targetType: "product_signal",
    targetId: input.signalId,
    metadata: { kind: current.kind },
  });
  return signal;
}

export async function savePartnerManifest(input: {
  workspaceId: string;
  email: string;
  manifest: unknown;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const validation = validateConnectorManifest(input.manifest);
  if (!validation.valid || !validation.manifest) {
    throw new Error(validation.errors.join(" "));
  }
  const manifest = validation.manifest;
  const key = await sha256(`${input.workspaceId}:${manifest.slug}`);
  const rowId = `partner_${key.slice(0, 28)}`;
  const path =
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.partnerSubmissions}/rows`;
  const now = new Date().toISOString();
  const data = {
    workspaceId: input.workspaceId,
    name: manifest.name,
    connectorSlug: manifest.slug,
    manifest: JSON.stringify(manifest),
    status: "validated_draft",
    validation: JSON.stringify({
      valid: true,
      actionCount: manifest.actions.length,
      approvalGatedActions: manifest.actions.filter((action) => action.requiresApproval).length,
    }),
    submittedBy: input.email.toLowerCase(),
    createdAt: now,
    updatedAt: now,
  };
  try {
    await appwrite.client.request(path, {
      method: "POST",
      body: { rowId, data, permissions: [] },
    });
  } catch (error) {
    if (!(error instanceof Error && "status" in error && error.status === 409)) throw error;
    await appwrite.client.request(`${path}/${rowId}`, {
      method: "PATCH",
      body: {
        data: {
          name: data.name,
          manifest: data.manifest,
          status: data.status,
          validation: data.validation,
          submittedBy: data.submittedBy,
          updatedAt: now,
        },
      },
    });
  }
  const submission = await appwrite.client.request<PartnerSubmissionRecord>(
    `${path}/${rowId}`,
  );
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "ecosystem.partner_manifest.validated",
    targetType: "partner_submission",
    targetId: rowId,
    metadata: {
      slug: manifest.slug,
      version: manifest.version,
      actions: manifest.actions.length,
      publishing: "not_requested",
    },
  });
  return submission;
}

function pilotRowId(workspaceId: string) {
  return enterpriseRowId("pilot", workspaceId);
}

async function ensureOperationsFoundation(email: string, displayName: string) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureEcosystemFoundation(email, displayName);
  if (!workspace) return null;
  const now = new Date().toISOString();
  await createIfMissing(
    appwrite,
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.pilotPrograms}/rows`,
    {
      rowId: pilotRowId(workspace.workspaceId),
      data: {
        workspaceId: workspace.workspaceId,
        name: "Northstar controlled pilot",
        stage: "readiness",
        status: "preparing",
        targetUsers: 12,
        ownerEmail: email.toLowerCase(),
        successCriteria: JSON.stringify([
          "100% of consequential actions approval-gated",
          "Worker rehearsal passes with durable lease evidence",
          "At least one provider authorization completed",
          "Recovery tabletop reviewed by an owner",
          "No critical security findings open",
        ]),
        checklist: JSON.stringify({
          identityOwnerConfirmed: true,
          approvalPolicyReviewed: true,
          providerAuthorized: false,
          workerRehearsalPassed: false,
          recoveryTabletopCompleted: false,
          cohortInvited: false,
        }),
        createdAt: now,
        updatedAt: now,
      },
      permissions: [],
    },
  );
  await appwrite.client.request(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.workspaces}/rows/${workspace.workspaceId}`,
    {
      method: "PATCH",
      body: {
        data: {
          plan: "enterprise",
          settings: JSON.stringify({
            phase: 7,
            agents: ["vela", "loom", "tempo", "helio", "aegis"],
            governance: true,
            ecosystem: true,
            productionOperations: true,
          }),
        },
      },
    },
  );
  return workspace;
}

function sortedNewest<T extends { createdAt?: string; startedAt?: string; recordedAt?: string }>(
  rows: T[],
) {
  return rows.sort((a, b) =>
    String(b.createdAt || b.startedAt || b.recordedAt || "").localeCompare(
      String(a.createdAt || a.startedAt || a.recordedAt || ""),
    ),
  );
}

export async function getOperationsOverview(
  email: string,
  displayName: string,
): Promise<OperationsOverview | null> {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureOperationsFoundation(email, displayName);
  if (!workspace) return null;
  const membership = await findMembership(workspace.workspaceId, email);
  if (!membership || !can(membership.role, "audit.read")) {
    throw new Error("You do not have permission to view production operations.");
  }
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const period = new Date().toISOString().slice(0, 7);
  const [installations, authorizations, jobs, usage, drills, validations, pilot] =
    await Promise.all([
      appwrite.client.request<RowList<ConnectorInstallationRecord>>(
        `${base}/${appwriteTables.connectorInstallations}/rows`,
        { queries: [query.equal("workspaceId", workspace.workspaceId), query.limit(100)], ttl: 5 },
      ),
      appwrite.client.request<RowList<ProviderAuthorizationRecord>>(
        `${base}/${appwriteTables.providerAuthorizations}/rows`,
        { queries: [query.equal("workspaceId", workspace.workspaceId), query.limit(100)], ttl: 5 },
      ),
      appwrite.client.request<RowList<JobRecord>>(
        `${base}/${appwriteTables.jobs}/rows`,
        { queries: [query.equal("workspaceId", workspace.workspaceId), query.limit(50)], ttl: 5 },
      ),
      appwrite.client.request<RowList<UsageLedgerRecord>>(
        `${base}/${appwriteTables.usageLedger}/rows`,
        {
          queries: [
            query.equal("workspaceId", workspace.workspaceId),
            query.equal("period", period),
            query.limit(100),
          ],
          ttl: 5,
        },
      ),
      appwrite.client.request<RowList<RecoveryDrillRecord>>(
        `${base}/${appwriteTables.recoveryDrills}/rows`,
        {
          queries: [
            query.equal("workspaceId", workspace.workspaceId),
            query.orderDesc("startedAt"),
            query.limit(20),
          ],
          ttl: 5,
        },
      ),
      appwrite.client.request<RowList<ValidationRunRecord>>(
        `${base}/${appwriteTables.validationRuns}/rows`,
        {
          queries: [
            query.equal("workspaceId", workspace.workspaceId),
            query.orderDesc("startedAt"),
            query.limit(20),
          ],
          ttl: 5,
        },
      ),
      appwrite.client.request<PilotProgramRecord>(
        `${base}/${appwriteTables.pilotPrograms}/rows/${pilotRowId(workspace.workspaceId)}`,
      ),
    ]);
  return {
    workspaceId: workspace.workspaceId,
    installations: installations.rows,
    authorizations: authorizations.rows,
    jobs: sortedNewest(jobs.rows),
    usage: sortedNewest(usage.rows),
    drills: drills.rows,
    validations: validations.rows,
    pilot,
  };
}

async function updatePilotChecklist(
  appwrite: NonNullable<ReturnType<typeof getClient>>,
  workspaceId: string,
  key: string,
  value: boolean,
) {
  const path =
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.pilotPrograms}/rows/${pilotRowId(workspaceId)}`;
  const pilot = await appwrite.client.request<PilotProgramRecord>(path);
  let checklist: Record<string, boolean> = {};
  try {
    const parsed = JSON.parse(pilot.checklist || "{}");
    checklist =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, boolean>
        : {};
  } catch {
    checklist = {};
  }
  checklist[key] = value;
  const completed = Object.values(checklist).filter(Boolean).length;
  const total = Object.keys(checklist).length;
  return appwrite.client.request<PilotProgramRecord>(path, {
    method: "PATCH",
    body: {
      data: {
        checklist: JSON.stringify(checklist),
        stage: completed === total ? "launch_ready" : completed >= 4 ? "validation" : "readiness",
        status: completed === total ? "ready" : "preparing",
        updatedAt: new Date().toISOString(),
      },
    },
  });
}

export async function prepareProviderAuthorization(input: {
  workspaceId: string;
  installationId: string;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const installation = await appwrite.client.request<ConnectorInstallationRecord>(
    `${base}/${appwriteTables.connectorInstallations}/rows/${input.installationId}`,
  );
  if (installation.workspaceId !== input.workspaceId) {
    throw new Error("This installation is not part of the workspace.");
  }
  const connector = await appwrite.client.request<ConnectorCatalogRecord>(
    `${base}/${appwriteTables.connectorCatalog}/rows/${installation.connectorId}`,
  );
  const key = await sha256(`${input.workspaceId}:${input.installationId}`);
  const rowId = `auth_${key.slice(0, 31)}`;
  const now = new Date().toISOString();
  let requestedScopes: string[] = [];
  try {
    const config = JSON.parse(installation.config || "{}");
    requestedScopes = Array.isArray(config.requestedScopes)
      ? config.requestedScopes.map(String).slice(0, 30)
      : [];
  } catch {
    requestedScopes = [];
  }
  await createIfMissing(appwrite, `${base}/${appwriteTables.providerAuthorizations}/rows`, {
    rowId,
    data: {
      workspaceId: input.workspaceId,
      installationId: input.installationId,
      provider: connector.name,
      authType: connector.authType,
      state: connector.authType.includes("OAuth")
        ? "awaiting_oauth_consent"
        : "awaiting_credentials",
      scopes: JSON.stringify(requestedScopes),
      authorizedBy: input.email.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    },
    permissions: [],
  });
  const authorization = await appwrite.client.request<ProviderAuthorizationRecord>(
    `${base}/${appwriteTables.providerAuthorizations}/rows/${rowId}`,
  );
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "operations.authorization.prepared",
    targetType: "provider_authorization",
    targetId: rowId,
    metadata: {
      provider: connector.slug,
      state: authorization.state,
      credentialsStored: false,
    },
  });
  return authorization;
}

export async function runWorkerRehearsal(input: {
  workspaceId: string;
  email: string;
  displayName: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureOperationsFoundation(input.email, input.displayName);
  if (!workspace || workspace.workspaceId !== input.workspaceId) {
    throw new Error("Workspace identity mismatch.");
  }
  const membership = await findMembership(input.workspaceId, input.email);
  if (!membership || !can(membership.role, "agents.run")) {
    throw new Error("You do not have permission to run worker rehearsals.");
  }
  const now = new Date().toISOString();
  const key = await sha256(`${input.workspaceId}:${input.email}:${now}:worker-rehearsal`);
  const job = await appwrite.client.request<JobRecord>(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.jobs}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          type: "reliability.rehearsal",
          payload: JSON.stringify({ suite: "worker_reliability", externalActions: false }),
          state: "queued",
          attempts: 0,
          maxAttempts: 3,
          idempotencyKey: `worker-rehearsal:${key.slice(0, 50)}`,
          availableAt: now,
          createdAt: now,
          updatedAt: now,
        },
        permissions: [],
      },
    },
  );
  const functionId = process.env.APPWRITE_FUNCTION_ID || "orchestrator";
  const execution = await appwrite.client.request<FunctionExecution>(
    `/functions/${functionId}/executions`,
    {
      method: "POST",
      body: {
        body: JSON.stringify({ workspaceId: input.workspaceId, jobId: job.$id }),
        async: false,
        path: "/jobs/rehearse",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-orkestria-user-id": workspace.userId,
        },
      },
    },
  );
  let response: {
    job?: JobRecord;
    validation?: ValidationRunRecord;
    error?: string;
  } | null = null;
  try {
    response = JSON.parse(execution.responseBody || "null");
  } catch {
    throw new Error("Worker rehearsal returned an unreadable response.");
  }
  if (
    execution.status !== "completed" ||
    execution.responseStatusCode >= 400 ||
    !response?.job ||
    !response.validation
  ) {
    throw new Error(response?.error || execution.errors || "Worker rehearsal failed.");
  }
  const pilot = await updatePilotChecklist(
    appwrite,
    input.workspaceId,
    "workerRehearsalPassed",
    true,
  );
  return { job: response.job, validation: response.validation, pilot };
}

export async function runRecoveryTabletop(input: {
  workspaceId: string;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const now = new Date().toISOString();
  const drill = await appwrite.client.request<RecoveryDrillRecord>(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.recoveryDrills}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          kind: "tabletop",
          status: "tabletop_completed",
          scope: "Appwrite schema, private storage inventory, Functions, and Sites release provenance",
          rpoMinutes: 60,
          rtoMinutes: 240,
          evidence: JSON.stringify({
            schemaInventoryReviewed: true,
            storageInventoryReviewed: true,
            releaseProvenanceReviewed: true,
            dataRestored: false,
            targetValidatedByRestore: false,
            note: "This is a tabletop rehearsal, not a data restoration test.",
          }),
          initiatedBy: input.email.toLowerCase(),
          startedAt: now,
          completedAt: now,
        },
        permissions: [],
      },
    },
  );
  const usageKey = await sha256(`${input.workspaceId}:${drill.$id}:recovery`);
  await appwrite.client.request(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.usageLedger}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          meter: "recovery_drill",
          quantity: 1,
          unit: "drill",
          sourceType: "recovery_drill",
          sourceId: drill.$id,
          period: now.slice(0, 7),
          costCents: 0,
          idempotencyKey: `recovery:${usageKey.slice(0, 60)}`,
          recordedAt: now,
        },
        permissions: [],
      },
    },
  );
  const pilot = await updatePilotChecklist(
    appwrite,
    input.workspaceId,
    "recoveryTabletopCompleted",
    true,
  );
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "operations.recovery_tabletop.completed",
    targetType: "recovery_drill",
    targetId: drill.$id,
    metadata: { dataRestored: false, rpoMinutes: 60, rtoMinutes: 240 },
  });
  return { drill, pilot };
}

export async function markPilotCohortInvited(input: {
  workspaceId: string;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const pilot = await updatePilotChecklist(
    appwrite,
    input.workspaceId,
    "cohortInvited",
    true,
  );
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "operations.pilot.cohort_marked_invited",
    targetType: "pilot_program",
    targetId: pilot.$id,
    metadata: { targetUsers: pilot.targetUsers, externalInvitationsSent: false },
  });
  return pilot;
}

function launchDecisionRowId(workspaceId: string) {
  return enterpriseRowId("launch", workspaceId);
}

function supportRotationRowId(workspaceId: string) {
  return enterpriseRowId("support", workspaceId);
}

function actionScopeRowId(kind: string, workspaceId: string) {
  return enterpriseRowId(`scope_${kind}`, workspaceId);
}

function parseRecord(value: string) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function ensureLaunchroomFoundation(email: string, displayName: string) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureOperationsFoundation(email, displayName);
  if (!workspace) return null;
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const now = new Date().toISOString();
  const pilotId = pilotRowId(workspace.workspaceId);
  const ownerHash = await sha256(`${workspace.workspaceId}:${email.toLowerCase()}`);

  await createIfMissing(appwrite, `${base}/${appwriteTables.pilotMembers}/rows`, {
    rowId: `pilotmember_${ownerHash.slice(0, 24)}`,
    data: {
      workspaceId: workspace.workspaceId,
      pilotId,
      email: email.toLowerCase(),
      role: "pilot_owner",
      status: "active",
      invitationState: "self_enrolled",
      consentState: "owner_confirmed",
      lastActiveAt: now,
      invitedBy: email.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    },
    permissions: [],
  });

  const scopes = [
    {
      id: actionScopeRowId("health", workspace.workspaceId),
      name: "Control-plane health snapshot",
      provider: "orkestria",
      action: "control_plane.health_snapshot",
      risk: "low",
      approvalRequired: 0,
      status: "active",
      constraints: {
        readOnly: true,
        externalProviderCall: false,
        dataClasses: ["service_health", "release_metadata"],
        maximumExecutionsPerHour: 12,
      },
    },
    {
      id: actionScopeRowId("deploy", workspace.workspaceId),
      name: "Production deployment status",
      provider: "observability",
      action: "deployment.status.read",
      risk: "low",
      approvalRequired: 0,
      status: "blocked_provider_authorization",
      constraints: {
        readOnly: true,
        externalProviderCall: true,
        allowedResources: ["production"],
        maximumExecutionsPerHour: 6,
      },
    },
    {
      id: actionScopeRowId("rollback", workspace.workspaceId),
      name: "Production rollback proposal",
      provider: "observability",
      action: "deployment.rollback.propose",
      risk: "high",
      approvalRequired: 1,
      status: "blocked_provider_authorization",
      constraints: {
        dryRunOnly: true,
        externalProviderCall: true,
        approvalMode: "single_owner",
        maximumExecutionsPerHour: 1,
      },
    },
  ];
  for (const scope of scopes) {
    await createIfMissing(appwrite, `${base}/${appwriteTables.actionScopes}/rows`, {
      rowId: scope.id,
      data: {
        workspaceId: workspace.workspaceId,
        name: scope.name,
        provider: scope.provider,
        environment: "production",
        action: scope.action,
        risk: scope.risk,
        approvalRequired: scope.approvalRequired,
        status: scope.status,
        constraints: JSON.stringify(scope.constraints),
        createdBy: email.toLowerCase(),
        createdAt: now,
        updatedAt: now,
      },
      permissions: [],
    });
  }

  await createIfMissing(appwrite, `${base}/${appwriteTables.supportRotations}/rows`, {
    rowId: supportRotationRowId(workspace.workspaceId),
    data: {
      workspaceId: workspace.workspaceId,
      name: "Pilot response rotation",
      status: "partial",
      timezone: "UTC",
      primaryEmail: email.toLowerCase(),
      coverage: "business_hours",
      escalationPolicy: JSON.stringify({
        acknowledgementMinutes: 15,
        escalationMinutes: 30,
        severityOneChannel: "not_connected",
        backupAcknowledged: false,
      }),
      createdAt: now,
      updatedAt: now,
    },
    permissions: [],
  });

  await createIfMissing(appwrite, `${base}/${appwriteTables.launchDecisions}/rows`, {
    rowId: launchDecisionRowId(workspace.workspaceId),
    data: {
      workspaceId: workspace.workspaceId,
      status: "assessing",
      recommendation: "hold",
      score: 0,
      blockers: JSON.stringify(["Launch evidence has not been refreshed."]),
      evidence: "{}",
      createdAt: now,
    },
    permissions: [],
  });

  await appwrite.client.request(
    `${base}/${appwriteTables.workspaces}/rows/${workspace.workspaceId}`,
    {
      method: "PATCH",
      body: {
        data: {
          plan: "enterprise",
          settings: JSON.stringify({
            phase: 8,
            agents: ["vela", "loom", "tempo", "helio", "aegis"],
            governance: true,
            ecosystem: true,
            productionOperations: true,
            pilotLaunchroom: true,
          }),
        },
      },
    },
  );
  return workspace;
}

async function assessLaunch(
  appwrite: NonNullable<ReturnType<typeof getClient>>,
  workspaceId: string,
) {
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const [authorizations, members, exercises, validations, drills, rotation] =
    await Promise.all([
      appwrite.client.request<RowList<ProviderAuthorizationRecord>>(
        `${base}/${appwriteTables.providerAuthorizations}/rows`,
        { queries: [query.equal("workspaceId", workspaceId), query.limit(100)] },
      ),
      appwrite.client.request<RowList<PilotMemberRecord>>(
        `${base}/${appwriteTables.pilotMembers}/rows`,
        { queries: [query.equal("workspaceId", workspaceId), query.limit(100)] },
      ),
      appwrite.client.request<RowList<PilotExerciseRecord>>(
        `${base}/${appwriteTables.pilotExercises}/rows`,
        { queries: [query.equal("workspaceId", workspaceId), query.limit(100)] },
      ),
      appwrite.client.request<RowList<ValidationRunRecord>>(
        `${base}/${appwriteTables.validationRuns}/rows`,
        { queries: [query.equal("workspaceId", workspaceId), query.limit(100)] },
      ),
      appwrite.client.request<RowList<RecoveryDrillRecord>>(
        `${base}/${appwriteTables.recoveryDrills}/rows`,
        { queries: [query.equal("workspaceId", workspaceId), query.limit(100)] },
      ),
      appwrite.client.request<SupportRotationRecord>(
        `${base}/${appwriteTables.supportRotations}/rows/${supportRotationRowId(workspaceId)}`,
      ),
    ]);

  const restoreProven = drills.rows.some(
    (drill) => parseRecord(drill.evidence).dataRestored === true,
  );
  const evidence = {
    providerAuthorized: authorizations.rows.some((item) => item.state === "authorized"),
    activePilotMember: members.rows.some(
      (member) =>
        member.status === "active" &&
        ["accepted", "owner_confirmed"].includes(member.consentState),
    ),
    externalCohortContacted: members.rows.some(
      (member) => member.invitationState === "sent" || member.invitationState === "accepted",
    ),
    boundedExercisePassed: exercises.rows.some((exercise) => exercise.state === "succeeded"),
    externalProductionActionProven: exercises.rows.some(
      (exercise) => exercise.externalActionExecuted === 1 && exercise.state === "succeeded",
    ),
    supportCoverageReady: rotation.status === "ready",
    workerValidationPassed: validations.rows.some(
      (validation) => validation.status === "passed" && validation.score === 100,
    ),
    recoveryRestoreProven: restoreProven,
  };
  const blockerLabels: Record<keyof typeof evidence, string> = {
    providerAuthorized: "No externally verified provider authorization.",
    activePilotMember: "No active pilot member with recorded consent.",
    externalCohortContacted: "No external pilot invitation or acceptance evidence.",
    boundedExercisePassed: "No bounded production-scope exercise has passed.",
    externalProductionActionProven: "No scoped external production action has verified evidence.",
    supportCoverageReady: "Support rotation lacks acknowledged backup coverage.",
    workerValidationPassed: "The durable worker validation suite has not passed.",
    recoveryRestoreProven: "Recovery is tabletop-only; a real restore has not been proven.",
  };
  const entries = Object.entries(evidence) as [keyof typeof evidence, boolean][];
  const blockers = entries.filter(([, passed]) => !passed).map(([key]) => blockerLabels[key]);
  const score = Math.round((entries.filter(([, passed]) => passed).length / entries.length) * 100);
  const recommendation = blockers.length === 0 ? "ready" : "hold";
  const path = `${base}/${appwriteTables.launchDecisions}/rows/${launchDecisionRowId(workspaceId)}`;
  const current = await appwrite.client.request<LaunchDecisionRecord>(path);
  return appwrite.client.request<LaunchDecisionRecord>(path, {
    method: "PATCH",
    body: {
      data: {
        status: current.status === "decision_recorded" ? current.status : "assessing",
        recommendation:
          current.status === "decision_recorded" ? current.recommendation : recommendation,
        score,
        blockers: JSON.stringify(blockers),
        evidence: JSON.stringify(evidence),
      },
    },
  });
}

export async function getLaunchroomOverview(
  email: string,
  displayName: string,
): Promise<LaunchroomOverview | null> {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureLaunchroomFoundation(email, displayName);
  if (!workspace) return null;
  const membership = await findMembership(workspace.workspaceId, email);
  if (!membership || !can(membership.role, "audit.read")) {
    throw new Error("You do not have permission to view pilot launch readiness.");
  }
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const [pilot, members, scopes, exercises, rotation, decision, authorizations, validations, drills] =
    await Promise.all([
      appwrite.client.request<PilotProgramRecord>(
        `${base}/${appwriteTables.pilotPrograms}/rows/${pilotRowId(workspace.workspaceId)}`,
      ),
      appwrite.client.request<RowList<PilotMemberRecord>>(
        `${base}/${appwriteTables.pilotMembers}/rows`,
        { queries: [query.equal("workspaceId", workspace.workspaceId), query.limit(100)] },
      ),
      appwrite.client.request<RowList<ActionScopeRecord>>(
        `${base}/${appwriteTables.actionScopes}/rows`,
        { queries: [query.equal("workspaceId", workspace.workspaceId), query.limit(100)] },
      ),
      appwrite.client.request<RowList<PilotExerciseRecord>>(
        `${base}/${appwriteTables.pilotExercises}/rows`,
        {
          queries: [
            query.equal("workspaceId", workspace.workspaceId),
            query.orderDesc("startedAt"),
            query.limit(50),
          ],
        },
      ),
      appwrite.client.request<SupportRotationRecord>(
        `${base}/${appwriteTables.supportRotations}/rows/${supportRotationRowId(workspace.workspaceId)}`,
      ),
      assessLaunch(appwrite, workspace.workspaceId),
      appwrite.client.request<RowList<ProviderAuthorizationRecord>>(
        `${base}/${appwriteTables.providerAuthorizations}/rows`,
        { queries: [query.equal("workspaceId", workspace.workspaceId), query.limit(100)] },
      ),
      appwrite.client.request<RowList<ValidationRunRecord>>(
        `${base}/${appwriteTables.validationRuns}/rows`,
        {
          queries: [
            query.equal("workspaceId", workspace.workspaceId),
            query.orderDesc("startedAt"),
            query.limit(20),
          ],
        },
      ),
      appwrite.client.request<RowList<RecoveryDrillRecord>>(
        `${base}/${appwriteTables.recoveryDrills}/rows`,
        {
          queries: [
            query.equal("workspaceId", workspace.workspaceId),
            query.orderDesc("startedAt"),
            query.limit(20),
          ],
        },
      ),
    ]);
  return {
    workspaceId: workspace.workspaceId,
    pilot,
    members: members.rows,
    scopes: scopes.rows,
    exercises: exercises.rows,
    rotation,
    decision,
    authorizations: authorizations.rows,
    validations: validations.rows,
    drills: drills.rows,
  };
}

export async function addPilotParticipant(input: {
  workspaceId: string;
  email: string;
  participantEmail: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const participantEmail = input.participantEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(participantEmail)) {
    throw new Error("Enter a valid participant email address.");
  }
  const now = new Date().toISOString();
  const key = await sha256(`${input.workspaceId}:${participantEmail}`);
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const rowId = `pilotmember_${key.slice(0, 24)}`;
  await createIfMissing(appwrite, `${base}/${appwriteTables.pilotMembers}/rows`, {
    rowId,
    data: {
      workspaceId: input.workspaceId,
      pilotId: pilotRowId(input.workspaceId),
      email: participantEmail,
      role: "participant",
      status: "proposed",
      invitationState: "draft_not_sent",
      consentState: "not_requested",
      invitedBy: input.email.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    },
    permissions: [],
  });
  const member = await appwrite.client.request<PilotMemberRecord>(
    `${base}/${appwriteTables.pilotMembers}/rows/${rowId}`,
  );
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "pilot.participant.drafted",
    targetType: "pilot_member",
    targetId: rowId,
    metadata: { externalInvitationSent: false, consentRecorded: false },
  });
  return member;
}

export async function proposeSupportBackup(input: {
  workspaceId: string;
  email: string;
  backupEmail: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const backupEmail = input.backupEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(backupEmail)) {
    throw new Error("Enter a valid backup email address.");
  }
  const path =
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.supportRotations}/rows/${supportRotationRowId(input.workspaceId)}`;
  const rotation = await appwrite.client.request<SupportRotationRecord>(path, {
    method: "PATCH",
    body: {
      data: {
        status: "awaiting_backup_acknowledgement",
        secondaryEmail: backupEmail,
        escalationPolicy: JSON.stringify({
          acknowledgementMinutes: 15,
          escalationMinutes: 30,
          severityOneChannel: "not_connected",
          backupAcknowledged: false,
        }),
        updatedAt: new Date().toISOString(),
      },
    },
  });
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "pilot.support_backup.proposed",
    targetType: "support_rotation",
    targetId: rotation.$id,
    metadata: { externalNotificationSent: false, backupAcknowledged: false },
  });
  return rotation;
}

export async function runPilotExercise(input: {
  workspaceId: string;
  scopeId: string;
  email: string;
  displayName: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureLaunchroomFoundation(input.email, input.displayName);
  if (!workspace || workspace.workspaceId !== input.workspaceId) {
    throw new Error("Workspace identity mismatch.");
  }
  const membership = await findMembership(input.workspaceId, input.email);
  if (!membership || !can(membership.role, "agents.run")) {
    throw new Error("You do not have permission to run pilot exercises.");
  }
  const functionId = process.env.APPWRITE_FUNCTION_ID || "orchestrator";
  const execution = await appwrite.client.request<FunctionExecution>(
    `/functions/${functionId}/executions`,
    {
      method: "POST",
      body: {
        body: JSON.stringify({
          workspaceId: input.workspaceId,
          pilotId: pilotRowId(input.workspaceId),
          scopeId: input.scopeId,
        }),
        async: false,
        path: "/pilot/exercise",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-orkestria-user-id": workspace.userId,
        },
      },
    },
  );
  let response: { exercise?: PilotExerciseRecord; error?: string } | null = null;
  try {
    response = JSON.parse(execution.responseBody || "null");
  } catch {
    throw new Error("Pilot exercise returned an unreadable response.");
  }
  if (
    execution.status !== "completed" ||
    execution.responseStatusCode >= 400 ||
    !response?.exercise
  ) {
    throw new Error(response?.error || execution.errors || "Pilot exercise failed.");
  }
  return response.exercise;
}

export async function refreshLaunchAssessment(input: {
  workspaceId: string;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const decision = await assessLaunch(appwrite, input.workspaceId);
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "pilot.launch_evidence.refreshed",
    targetType: "launch_decision",
    targetId: decision.$id,
    metadata: { recommendation: decision.recommendation, score: decision.score },
  });
  return decision;
}

export async function recordLaunchDecision(input: {
  workspaceId: string;
  email: string;
  decision: "hold" | "go";
  rationale: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const assessed = await assessLaunch(appwrite, input.workspaceId);
  const blockers = JSON.parse(assessed.blockers || "[]") as string[];
  if (input.decision === "go" && (assessed.recommendation !== "ready" || blockers.length)) {
    throw new Error("A go decision cannot be recorded while launch blockers remain.");
  }
  const now = new Date().toISOString();
  const path =
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.launchDecisions}/rows/${launchDecisionRowId(input.workspaceId)}`;
  const decision = await appwrite.client.request<LaunchDecisionRecord>(path, {
    method: "PATCH",
    body: {
      data: {
        status: "decision_recorded",
        recommendation: input.decision === "go" ? "ready" : "hold",
        decidedBy: input.email.toLowerCase(),
        decisionRationale: input.rationale.trim().slice(0, 2000),
        decidedAt: now,
      },
    },
  });
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: `pilot.launch_decision.${input.decision}`,
    targetType: "launch_decision",
    targetId: decision.$id,
    metadata: {
      score: decision.score,
      blockers: blockers.length,
      externalLaunchPerformed: false,
    },
  });
  return decision;
}

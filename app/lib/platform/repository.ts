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
  type BillingControlRecord,
  type ComplianceAutomationRecord,
  type EcosystemOverview,
  type EnterpriseConfigRecord,
  type EnterpriseOverview,
  type ActionScopeRecord,
  type ExecutorRegistryRecord,
  type EvaluationRunRecord,
  type FeedbackCycleRecord,
  type FailoverDrillRecord,
  type IncidentExerciseRecord,
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
  type RegionalCellRecord,
  type RegionalRolloutGateRecord,
  type ProviderRouteRecord,
  type ScaleGateRecord,
  type ScaleOpsOverview,
  type ServiceHealthUpdateRecord,
  type SupportCaseRecord,
  type SupportRotationRecord,
  type TelemetryRollupRecord,
  type TrustGridOverview,
  type TenantEvaluationRecord,
  type AutonomyProfileRecord,
  type WorkloadForecastRecord,
  type CustomerOutcomeRecord,
  type PolicyRecommendationRecord,
  type AutonomyDecisionRecord,
  type CadenceOverview,
  type AgentTeamRecord,
  type TeamSpecialistRecord,
  type MissionCaseRecord,
  type MissionHandoffRecord,
  type EvidenceSynthesisRecord,
  type ExecutiveBriefRecord,
  type ExecutiveDecisionRecord,
  type EnsembleOverview,
  type MemoryEntityRecord,
  type MemoryEventRecord,
  type KnowledgeClaimRecord,
  type TwinSnapshotRecord,
  type ScenarioSimulationRecord,
  type ImpactForecastRecord,
  type MemoryPromotionRecord,
  type ContinuumOverview,
  type StrategicGoalRecord,
  type PortfolioInitiativeRecord,
  type InitiativeDependencyRecord,
  type CapacityEnvelopeRecord,
  type PortfolioScenarioRecord,
  type PortfolioForecastRecord,
  type InvestmentDecisionRecord,
  type MeridianOverview,
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

function billingControlRowId(workspaceId: string) {
  return enterpriseRowId("billing", workspaceId);
}

function scaleGateRowId(workspaceId: string) {
  return enterpriseRowId("scale", workspaceId);
}

function executorRowId(kind: string, workspaceId: string) {
  return enterpriseRowId(`executor_${kind}`, workspaceId);
}

async function ensureScaleFoundation(email: string, displayName: string) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureLaunchroomFoundation(email, displayName);
  if (!workspace) return null;
  const now = new Date().toISOString();
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;

  await createIfMissing(appwrite, `${base}/${appwriteTables.executorRegistry}/rows`, {
    rowId: executorRowId("internal", workspace.workspaceId),
    data: {
      workspaceId: workspace.workspaceId,
      name: "Orkestria control-plane executor",
      provider: "orkestria",
      environment: "production",
      status: "verified",
      version: "1.0.0",
      allowedActions: JSON.stringify([
        "control_plane.health_snapshot",
        "scale.synthetic_rehearsal",
      ]),
      attestation: JSON.stringify({
        artifactVerified: true,
        policyBoundaryVerified: true,
        externalProvider: false,
        networkEgress: false,
        verificationScope: "internal_control_plane_only",
      }),
      verifiedBy: "orkestria-release-policy",
      verifiedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    permissions: [],
  });
  await createIfMissing(appwrite, `${base}/${appwriteTables.executorRegistry}/rows`, {
    rowId: executorRowId("provider", workspace.workspaceId),
    data: {
      workspaceId: workspace.workspaceId,
      name: "External provider executor",
      provider: "external_provider",
      environment: "production",
      status: "awaiting_attestation",
      version: "0.0.0",
      allowedActions: "[]",
      attestation: JSON.stringify({
        artifactVerified: false,
        providerHandshakeVerified: false,
        networkEgressReviewed: false,
        externalProvider: true,
      }),
      createdAt: now,
      updatedAt: now,
    },
    permissions: [],
  });

  await createIfMissing(appwrite, `${base}/${appwriteTables.billingControls}/rows`, {
    rowId: billingControlRowId(workspace.workspaceId),
    data: {
      workspaceId: workspace.workspaceId,
      status: "internal_meter_enforced",
      currency: "USD",
      monthlyBudgetCents: 100000,
      warningPercent: 70,
      hardStopPercent: 100,
      currentUsageCents: 0,
      config: JSON.stringify({
        internalUsageMeterEnforced: true,
        externalProviderBudgetEnforced: false,
        providerBillingConnected: false,
        warningNotificationConnected: false,
      }),
      updatedBy: email.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    },
    permissions: [],
  });
  await createIfMissing(appwrite, `${base}/${appwriteTables.scaleGates}/rows`, {
    rowId: scaleGateRowId(workspace.workspaceId),
    data: {
      workspaceId: workspace.workspaceId,
      status: "assessing",
      recommendation: "hold",
      score: 0,
      expansionAuthorized: 0,
      evidence: "{}",
      blockers: JSON.stringify(["Scale evidence has not been refreshed."]),
      createdAt: now,
      updatedAt: now,
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
            phase: 9,
            agents: ["vela", "loom", "tempo", "helio", "aegis"],
            governance: true,
            ecosystem: true,
            productionOperations: true,
            pilotLaunchroom: true,
            scaleOperations: true,
          }),
        },
      },
    },
  );
  return workspace;
}

async function assessScale(
  appwrite: NonNullable<ReturnType<typeof getClient>>,
  workspaceId: string,
) {
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const [executors, telemetry, incidents, support, billing] = await Promise.all([
    appwrite.client.request<RowList<ExecutorRegistryRecord>>(
      `${base}/${appwriteTables.executorRegistry}/rows`,
      { queries: [query.equal("workspaceId", workspaceId), query.limit(100)] },
    ),
    appwrite.client.request<RowList<TelemetryRollupRecord>>(
      `${base}/${appwriteTables.telemetryRollups}/rows`,
      { queries: [query.equal("workspaceId", workspaceId), query.limit(100)] },
    ),
    appwrite.client.request<RowList<IncidentExerciseRecord>>(
      `${base}/${appwriteTables.incidentExercises}/rows`,
      { queries: [query.equal("workspaceId", workspaceId), query.limit(100)] },
    ),
    appwrite.client.request<RowList<SupportCaseRecord>>(
      `${base}/${appwriteTables.supportCases}/rows`,
      { queries: [query.equal("workspaceId", workspaceId), query.limit(100)] },
    ),
    appwrite.client.request<BillingControlRecord>(
      `${base}/${appwriteTables.billingControls}/rows/${billingControlRowId(workspaceId)}`,
    ),
  ]);
  const billingConfig = parseRecord(billing.config);
  const evidence = {
    verifiedInternalExecutor: executors.rows.some(
      (executor) => executor.provider === "orkestria" && executor.status === "verified",
    ),
    verifiedExternalExecutor: executors.rows.some(
      (executor) => executor.provider !== "orkestria" && executor.status === "verified",
    ),
    syntheticSloPassed: telemetry.rows.some(
      (rollup) =>
        rollup.sourceType === "synthetic_scale_rehearsal" &&
        rollup.availabilityBps >= 9990 &&
        rollup.p95LatencyMs <= 500,
    ),
    livePilotTelemetry: telemetry.rows.some((rollup) => rollup.sourceType === "pilot_live"),
    incidentWorkflowRehearsed: incidents.rows.some(
      (incident) => incident.status === "passed",
    ),
    internalBillingGuardrail: billing.status === "internal_meter_enforced",
    providerBillingSafeguard:
      billingConfig.externalProviderBudgetEnforced === true &&
      billingConfig.providerBillingConnected === true,
    supportWorkflowRehearsed: support.rows.some(
      (item) => item.source === "internal_exercise" && item.status === "resolved",
    ),
    realCustomerSupportActive: support.rows.some(
      (item) => item.source === "customer" && item.customerNotified === 1,
    ),
  };
  const blockerLabels: Record<keyof typeof evidence, string> = {
    verifiedInternalExecutor: "The internal control-plane executor is not verified.",
    verifiedExternalExecutor: "No external provider executor has a verified attestation.",
    syntheticSloPassed: "The synthetic scale SLO rehearsal has not passed.",
    livePilotTelemetry: "No real pilot traffic telemetry has been ingested.",
    incidentWorkflowRehearsed: "The incident-response workflow has not been exercised.",
    internalBillingGuardrail: "Internal usage budget enforcement is not active.",
    providerBillingSafeguard: "Provider-side billing limits are not connected or verified.",
    supportWorkflowRehearsed: "The support workflow has not been rehearsed.",
    realCustomerSupportActive: "No real customer support delivery has evidence.",
  };
  const entries = Object.entries(evidence) as [keyof typeof evidence, boolean][];
  const blockers = entries.filter(([, passed]) => !passed).map(([key]) => blockerLabels[key]);
  const score = Math.round((entries.filter(([, passed]) => passed).length / entries.length) * 100);
  const recommendation = blockers.length === 0 ? "expand" : "hold";
  const path = `${base}/${appwriteTables.scaleGates}/rows/${scaleGateRowId(workspaceId)}`;
  const current = await appwrite.client.request<ScaleGateRecord>(path);
  return appwrite.client.request<ScaleGateRecord>(path, {
    method: "PATCH",
    body: {
      data: {
        status: current.status === "decision_recorded" ? current.status : "assessing",
        recommendation:
          current.status === "decision_recorded" ? current.recommendation : recommendation,
        score,
        expansionAuthorized:
          current.status === "decision_recorded" ? current.expansionAuthorized : 0,
        evidence: JSON.stringify(evidence),
        blockers: JSON.stringify(blockers),
        updatedAt: new Date().toISOString(),
      },
    },
  });
}

export async function getScaleOpsOverview(
  email: string,
  displayName: string,
): Promise<ScaleOpsOverview | null> {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureScaleFoundation(email, displayName);
  if (!workspace) return null;
  const membership = await findMembership(workspace.workspaceId, email);
  if (!membership || !can(membership.role, "audit.read")) {
    throw new Error("You do not have permission to view scale operations.");
  }
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const [executors, telemetry, incidents, billing, supportCases, gate] = await Promise.all([
    appwrite.client.request<RowList<ExecutorRegistryRecord>>(
      `${base}/${appwriteTables.executorRegistry}/rows`,
      { queries: [query.equal("workspaceId", workspace.workspaceId), query.limit(100)] },
    ),
    appwrite.client.request<RowList<TelemetryRollupRecord>>(
      `${base}/${appwriteTables.telemetryRollups}/rows`,
      {
        queries: [
          query.equal("workspaceId", workspace.workspaceId),
          query.orderDesc("windowEnd"),
          query.limit(50),
        ],
      },
    ),
    appwrite.client.request<RowList<IncidentExerciseRecord>>(
      `${base}/${appwriteTables.incidentExercises}/rows`,
      {
        queries: [
          query.equal("workspaceId", workspace.workspaceId),
          query.orderDesc("startedAt"),
          query.limit(50),
        ],
      },
    ),
    appwrite.client.request<BillingControlRecord>(
      `${base}/${appwriteTables.billingControls}/rows/${billingControlRowId(workspace.workspaceId)}`,
    ),
    appwrite.client.request<RowList<SupportCaseRecord>>(
      `${base}/${appwriteTables.supportCases}/rows`,
      {
        queries: [
          query.equal("workspaceId", workspace.workspaceId),
          query.orderDesc("createdAt"),
          query.limit(50),
        ],
      },
    ),
    assessScale(appwrite, workspace.workspaceId),
  ]);
  return {
    workspaceId: workspace.workspaceId,
    executors: executors.rows,
    telemetry: telemetry.rows,
    incidents: incidents.rows,
    billing,
    supportCases: supportCases.rows,
    gate,
  };
}

export async function runScaleRehearsal(input: {
  workspaceId: string;
  email: string;
  displayName: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureScaleFoundation(input.email, input.displayName);
  if (!workspace || workspace.workspaceId !== input.workspaceId) {
    throw new Error("Workspace identity mismatch.");
  }
  const membership = await findMembership(input.workspaceId, input.email);
  if (!membership || !can(membership.role, "agents.run")) {
    throw new Error("You do not have permission to run scale rehearsals.");
  }
  const functionId = process.env.APPWRITE_FUNCTION_ID || "orchestrator";
  const execution = await appwrite.client.request<FunctionExecution>(
    `/functions/${functionId}/executions`,
    {
      method: "POST",
      body: {
        body: JSON.stringify({
          workspaceId: input.workspaceId,
          executorId: executorRowId("internal", input.workspaceId),
        }),
        async: false,
        path: "/scale/rehearse",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-orkestria-user-id": workspace.userId,
        },
      },
    },
  );
  let response: {
    telemetry?: TelemetryRollupRecord;
    incident?: IncidentExerciseRecord;
    error?: string;
  } | null = null;
  try {
    response = JSON.parse(execution.responseBody || "null");
  } catch {
    throw new Error("Scale rehearsal returned an unreadable response.");
  }
  if (
    execution.status !== "completed" ||
    execution.responseStatusCode >= 400 ||
    !response?.telemetry ||
    !response.incident
  ) {
    throw new Error(response?.error || execution.errors || "Scale rehearsal failed.");
  }
  return response;
}

export async function runSupportWorkflowDrill(input: {
  workspaceId: string;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const membership = await findMembership(input.workspaceId, input.email);
  if (!membership || !can(membership.role, "audit.read")) {
    throw new Error("You do not have permission to run support workflow drills.");
  }
  const now = new Date();
  const resolvedAt = new Date(now.getTime() + 4 * 60_000).toISOString();
  const supportCase = await appwrite.client.request<SupportCaseRecord>(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.supportCases}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          source: "internal_exercise",
          subject: "Synthetic pilot support escalation",
          description: "Exercise the triage, ownership, SLA, and resolution workflow without contacting a customer.",
          priority: "p2",
          status: "resolved",
          customerNotified: 0,
          ownerEmail: input.email.toLowerCase(),
          slaDueAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
          resolvedAt,
          evidence: JSON.stringify({
            synthetic: true,
            customerContacted: false,
            acknowledgementSeconds: 45,
            resolutionSeconds: 240,
            escalationChannelConnected: false,
          }),
          createdAt: now.toISOString(),
          updatedAt: resolvedAt,
        },
        permissions: [],
      },
    },
  );
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "scale.support_workflow.rehearsed",
    targetType: "support_case",
    targetId: supportCase.$id,
    metadata: { customerContacted: false, synthetic: true },
  });
  return supportCase;
}

export async function updateBillingSafeguard(input: {
  workspaceId: string;
  email: string;
  monthlyBudgetDollars: number;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const monthlyBudgetCents = Math.round(
    Math.min(1_000_000, Math.max(10, input.monthlyBudgetDollars)) * 100,
  );
  const path =
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.billingControls}/rows/${billingControlRowId(input.workspaceId)}`;
  const billing = await appwrite.client.request<BillingControlRecord>(path, {
    method: "PATCH",
    body: {
      data: {
        status: "internal_meter_enforced",
        monthlyBudgetCents,
        warningPercent: 70,
        hardStopPercent: 100,
        config: JSON.stringify({
          internalUsageMeterEnforced: true,
          externalProviderBudgetEnforced: false,
          providerBillingConnected: false,
          warningNotificationConnected: false,
        }),
        updatedBy: input.email.toLowerCase(),
        updatedAt: new Date().toISOString(),
      },
    },
  });
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "scale.billing_guardrail.updated",
    targetType: "billing_control",
    targetId: billing.$id,
    metadata: {
      monthlyBudgetCents,
      internalMeterEnforced: true,
      providerBillingEnforced: false,
    },
  });
  return billing;
}

export async function refreshScaleGate(input: {
  workspaceId: string;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const gate = await assessScale(appwrite, input.workspaceId);
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "scale.evidence.refreshed",
    targetType: "scale_gate",
    targetId: gate.$id,
    metadata: { recommendation: gate.recommendation, score: gate.score },
  });
  return gate;
}

export async function recordScaleDecision(input: {
  workspaceId: string;
  email: string;
  decision: "hold" | "expand";
  rationale: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const assessed = await assessScale(appwrite, input.workspaceId);
  const blockers = JSON.parse(assessed.blockers || "[]") as string[];
  if (
    input.decision === "expand" &&
    (assessed.recommendation !== "expand" || blockers.length)
  ) {
    throw new Error("Expansion cannot be authorized while scale blockers remain.");
  }
  const now = new Date().toISOString();
  const path =
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.scaleGates}/rows/${scaleGateRowId(input.workspaceId)}`;
  const gate = await appwrite.client.request<ScaleGateRecord>(path, {
    method: "PATCH",
    body: {
      data: {
        status: "decision_recorded",
        recommendation: input.decision,
        expansionAuthorized: input.decision === "expand" ? 1 : 0,
        decidedBy: input.email.toLowerCase(),
        decisionRationale: input.rationale.trim().slice(0, 2000),
        decidedAt: now,
        updatedAt: now,
      },
    },
  });
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: `scale.decision.${input.decision}`,
    targetType: "scale_gate",
    targetId: gate.$id,
    metadata: {
      score: gate.score,
      blockers: blockers.length,
      expansionPerformed: false,
    },
  });
  return gate;
}

function regionalGateRowId(workspaceId: string) {
  return enterpriseRowId("regional", workspaceId);
}

function regionalCellRowId(code: string, workspaceId: string) {
  return enterpriseRowId(`region_${code}`, workspaceId);
}

function providerRouteRowId(provider: string, workspaceId: string) {
  return enterpriseRowId(`route_${provider}`, workspaceId);
}

async function ensureTrustFoundation(email: string, displayName: string) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureScaleFoundation(email, displayName);
  if (!workspace) return null;
  const now = new Date().toISOString();
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const regions = [
    {
      id: regionalCellRowId("eu", workspace.workspaceId),
      code: "eu-west",
      name: "EU West control plane",
      role: "primary",
      status: "configuration_ready",
      dataResidency: "eu_pinned",
      provider: "appwrite_sites",
      verification: {
        deploymentObserved: false,
        trafficObserved: false,
        residencyExternallyVerified: false,
      },
    },
    {
      id: regionalCellRowId("us", workspace.workspaceId),
      code: "us-east",
      name: "US East expansion cell",
      role: "secondary",
      status: "planned",
      dataResidency: "not_configured",
      provider: "not_selected",
      verification: {
        deploymentObserved: false,
        trafficObserved: false,
        residencyExternallyVerified: false,
      },
    },
  ];
  for (const region of regions) {
    await createIfMissing(appwrite, `${base}/${appwriteTables.regionalCells}/rows`, {
      rowId: region.id,
      data: {
        workspaceId: workspace.workspaceId,
        code: region.code,
        name: region.name,
        role: region.role,
        status: region.status,
        trafficPercent: 0,
        deploymentVerified: 0,
        dataResidency: region.dataResidency,
        provider: region.provider,
        verification: JSON.stringify(region.verification),
        createdAt: now,
        updatedAt: now,
      },
      permissions: [],
    });
  }
  const providerRoutes = [
    {
      id: providerRouteRowId("deepseek", workspace.workspaceId),
      provider: "deepseek",
      role: "primary",
      status: "configured_single_provider",
      trafficPercent: 100,
      configuration: {
        credentialConfigured: true,
        liveHealthEvidence: false,
        automaticFailover: false,
        secretStoredInWorkspaceRow: false,
      },
    },
    {
      id: providerRouteRowId("secondary", workspace.workspaceId),
      provider: "secondary_provider",
      role: "secondary",
      status: "not_configured",
      trafficPercent: 0,
      configuration: {
        credentialConfigured: false,
        liveHealthEvidence: false,
        automaticFailover: false,
      },
    },
  ];
  for (const route of providerRoutes) {
    await createIfMissing(appwrite, `${base}/${appwriteTables.providerRoutes}/rows`, {
      rowId: route.id,
      data: {
        workspaceId: workspace.workspaceId,
        capability: "ai_planning",
        provider: route.provider,
        role: route.role,
        status: route.status,
        trafficPercent: route.trafficPercent,
        health: "not_verified_live",
        configuration: JSON.stringify(route.configuration),
        createdAt: now,
        updatedAt: now,
      },
      permissions: [],
    });
  }
  await createIfMissing(appwrite, `${base}/${appwriteTables.regionalRolloutGates}/rows`, {
    rowId: regionalGateRowId(workspace.workspaceId),
    data: {
      workspaceId: workspace.workspaceId,
      status: "assessing",
      recommendation: "hold",
      score: 0,
      rolloutAuthorized: 0,
      evidence: "{}",
      blockers: JSON.stringify(["Regional evidence has not been refreshed."]),
      createdAt: now,
      updatedAt: now,
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
            phase: 10,
            agents: ["vela", "loom", "tempo", "helio", "aegis"],
            governance: true,
            ecosystem: true,
            productionOperations: true,
            pilotLaunchroom: true,
            scaleOperations: true,
            continuousTrust: true,
          }),
        },
      },
    },
  );
  return workspace;
}

async function assessRegionalRollout(
  appwrite: NonNullable<ReturnType<typeof getClient>>,
  workspaceId: string,
) {
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const [regions, providers, failovers, evaluations, health, compliance] =
    await Promise.all([
      appwrite.client.request<RowList<RegionalCellRecord>>(
        `${base}/${appwriteTables.regionalCells}/rows`,
        { queries: [query.equal("workspaceId", workspaceId), query.limit(100)] },
      ),
      appwrite.client.request<RowList<ProviderRouteRecord>>(
        `${base}/${appwriteTables.providerRoutes}/rows`,
        { queries: [query.equal("workspaceId", workspaceId), query.limit(100)] },
      ),
      appwrite.client.request<RowList<FailoverDrillRecord>>(
        `${base}/${appwriteTables.failoverDrills}/rows`,
        { queries: [query.equal("workspaceId", workspaceId), query.limit(100)] },
      ),
      appwrite.client.request<RowList<EvaluationRunRecord>>(
        `${base}/${appwriteTables.evaluationRuns}/rows`,
        { queries: [query.equal("workspaceId", workspaceId), query.limit(100)] },
      ),
      appwrite.client.request<RowList<ServiceHealthUpdateRecord>>(
        `${base}/${appwriteTables.serviceHealthUpdates}/rows`,
        { queries: [query.equal("workspaceId", workspaceId), query.limit(100)] },
      ),
      appwrite.client.request<RowList<ComplianceAutomationRecord>>(
        `${base}/${appwriteTables.complianceAutomations}/rows`,
        { queries: [query.equal("workspaceId", workspaceId), query.limit(100)] },
      ),
    ]);
  const evidence = {
    primaryRegionVerified: regions.rows.some(
      (region) =>
        region.role === "primary" &&
        region.status === "active" &&
        region.deploymentVerified === 1,
    ),
    secondaryRegionVerified: regions.rows.some(
      (region) =>
        region.role === "secondary" &&
        region.status === "active" &&
        region.deploymentVerified === 1,
    ),
    realTrafficFailover: failovers.rows.some(
      (drill) => drill.trafficShifted === 1 && drill.status === "passed",
    ),
    dataRestoreProven: failovers.rows.some(
      (drill) => drill.dataRestored === 1 && drill.status === "passed",
    ),
    providerRedundancyVerified:
      providers.rows.filter(
        (route) => route.status === "verified" && route.trafficPercent > 0,
      ).length >= 2,
    deterministicEvaluationPassed: evaluations.rows.some(
      (evaluation) =>
        evaluation.suite === "policy_boundary_regression" &&
        evaluation.status === "passed" &&
        evaluation.score === 100,
    ),
    liveModelEvaluationPassed: evaluations.rows.some(
      (evaluation) =>
        evaluation.liveModelCalled === 1 &&
        evaluation.status === "passed" &&
        evaluation.score >= 95,
    ),
    serviceHealthPublished: health.rows.some(
      (update) => update.status === "published" && update.customerVisible === 1,
    ),
    complianceSubmissionVerified: compliance.rows.some(
      (run) => run.status === "submitted" && run.externalSubmitted === 1,
    ),
  };
  const blockerLabels: Record<keyof typeof evidence, string> = {
    primaryRegionVerified: "The primary regional deployment has no external verification.",
    secondaryRegionVerified: "No secondary regional deployment is verified.",
    realTrafficFailover: "No real customer traffic failover has been proven.",
    dataRestoreProven: "No regional data restore has been proven.",
    providerRedundancyVerified: "Independent AI provider redundancy is not verified.",
    deterministicEvaluationPassed: "The deterministic policy evaluation suite has not passed.",
    liveModelEvaluationPassed: "No live-model canary evaluation has passed.",
    serviceHealthPublished: "No customer-visible service health update is published.",
    complianceSubmissionVerified: "No compliance package has been externally submitted.",
  };
  const entries = Object.entries(evidence) as [keyof typeof evidence, boolean][];
  const blockers = entries.filter(([, passed]) => !passed).map(([key]) => blockerLabels[key]);
  const score = Math.round((entries.filter(([, passed]) => passed).length / entries.length) * 100);
  const recommendation = blockers.length === 0 ? "expand" : "hold";
  const path =
    `${base}/${appwriteTables.regionalRolloutGates}/rows/${regionalGateRowId(workspaceId)}`;
  const current = await appwrite.client.request<RegionalRolloutGateRecord>(path);
  return appwrite.client.request<RegionalRolloutGateRecord>(path, {
    method: "PATCH",
    body: {
      data: {
        status: current.status === "decision_recorded" ? current.status : "assessing",
        recommendation:
          current.status === "decision_recorded" ? current.recommendation : recommendation,
        score,
        rolloutAuthorized:
          current.status === "decision_recorded" ? current.rolloutAuthorized : 0,
        evidence: JSON.stringify(evidence),
        blockers: JSON.stringify(blockers),
        updatedAt: new Date().toISOString(),
      },
    },
  });
}

export async function getTrustGridOverview(
  email: string,
  displayName: string,
): Promise<TrustGridOverview | null> {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureTrustFoundation(email, displayName);
  if (!workspace) return null;
  const membership = await findMembership(workspace.workspaceId, email);
  if (!membership || !can(membership.role, "audit.read")) {
    throw new Error("You do not have permission to view continuous trust operations.");
  }
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const [regions, providers, failovers, evaluations, healthUpdates, compliance, gate] =
    await Promise.all([
      appwrite.client.request<RowList<RegionalCellRecord>>(
        `${base}/${appwriteTables.regionalCells}/rows`,
        { queries: [query.equal("workspaceId", workspace.workspaceId), query.limit(100)] },
      ),
      appwrite.client.request<RowList<ProviderRouteRecord>>(
        `${base}/${appwriteTables.providerRoutes}/rows`,
        { queries: [query.equal("workspaceId", workspace.workspaceId), query.limit(100)] },
      ),
      appwrite.client.request<RowList<FailoverDrillRecord>>(
        `${base}/${appwriteTables.failoverDrills}/rows`,
        {
          queries: [
            query.equal("workspaceId", workspace.workspaceId),
            query.orderDesc("startedAt"),
            query.limit(50),
          ],
        },
      ),
      appwrite.client.request<RowList<EvaluationRunRecord>>(
        `${base}/${appwriteTables.evaluationRuns}/rows`,
        {
          queries: [
            query.equal("workspaceId", workspace.workspaceId),
            query.orderDesc("startedAt"),
            query.limit(50),
          ],
        },
      ),
      appwrite.client.request<RowList<ServiceHealthUpdateRecord>>(
        `${base}/${appwriteTables.serviceHealthUpdates}/rows`,
        {
          queries: [
            query.equal("workspaceId", workspace.workspaceId),
            query.orderDesc("createdAt"),
            query.limit(50),
          ],
        },
      ),
      appwrite.client.request<RowList<ComplianceAutomationRecord>>(
        `${base}/${appwriteTables.complianceAutomations}/rows`,
        {
          queries: [
            query.equal("workspaceId", workspace.workspaceId),
            query.orderDesc("createdAt"),
            query.limit(50),
          ],
        },
      ),
      assessRegionalRollout(appwrite, workspace.workspaceId),
    ]);
  return {
    workspaceId: workspace.workspaceId,
    regions: regions.rows,
    providers: providers.rows,
    failovers: failovers.rows,
    evaluations: evaluations.rows,
    healthUpdates: healthUpdates.rows,
    compliance: compliance.rows,
    gate,
  };
}

export async function runTrustRehearsal(input: {
  workspaceId: string;
  email: string;
  displayName: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureTrustFoundation(input.email, input.displayName);
  if (!workspace || workspace.workspaceId !== input.workspaceId) {
    throw new Error("Workspace identity mismatch.");
  }
  const membership = await findMembership(input.workspaceId, input.email);
  if (!membership || !can(membership.role, "agents.run")) {
    throw new Error("You do not have permission to run trust rehearsals.");
  }
  const functionId = process.env.APPWRITE_FUNCTION_ID || "orchestrator";
  const execution = await appwrite.client.request<FunctionExecution>(
    `/functions/${functionId}/executions`,
    {
      method: "POST",
      body: {
        body: JSON.stringify({
          workspaceId: input.workspaceId,
          executorId: executorRowId("internal", input.workspaceId),
        }),
        async: false,
        path: "/trust/rehearse",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-orkestria-user-id": workspace.userId,
        },
      },
    },
  );
  let response: {
    failover?: FailoverDrillRecord;
    evaluation?: EvaluationRunRecord;
    error?: string;
  } | null = null;
  try {
    response = JSON.parse(execution.responseBody || "null");
  } catch {
    throw new Error("Trust rehearsal returned an unreadable response.");
  }
  if (
    execution.status !== "completed" ||
    execution.responseStatusCode >= 400 ||
    !response?.failover ||
    !response.evaluation
  ) {
    throw new Error(response?.error || execution.errors || "Trust rehearsal failed.");
  }
  return response;
}

export async function draftServiceHealthUpdate(input: {
  workspaceId: string;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const membership = await findMembership(input.workspaceId, input.email);
  if (!membership || !can(membership.role, "audit.read")) {
    throw new Error("You do not have permission to draft service health updates.");
  }
  const now = new Date().toISOString();
  const update = await appwrite.client.request<ServiceHealthUpdateRecord>(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.serviceHealthUpdates}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          status: "internal_draft",
          audience: "customer_status_page",
          title: "OrkestriaAI service health update draft",
          summary: "Internal draft based on synthetic evidence. Review real customer impact before publishing.",
          components: JSON.stringify(["AI planning", "Automation", "Operations"]),
          customerVisible: 0,
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
    action: "trust.service_health.drafted",
    targetType: "service_health_update",
    targetId: update.$id,
    metadata: { customerVisible: false, published: false },
  });
  return update;
}

export async function runComplianceAutomationPreview(input: {
  workspaceId: string;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const [policies, validations, audits] = await Promise.all([
    appwrite.client.request<RowList<PolicyPackRecord>>(
      `${base}/${appwriteTables.policyPacks}/rows`,
      { queries: [query.equal("workspaceId", input.workspaceId), query.limit(100)] },
    ),
    appwrite.client.request<RowList<ValidationRunRecord>>(
      `${base}/${appwriteTables.validationRuns}/rows`,
      { queries: [query.equal("workspaceId", input.workspaceId), query.limit(100)] },
    ),
    appwrite.client.request<RowList<{ $id: string }>>(
      `${base}/${appwriteTables.auditEvents}/rows`,
      { queries: [query.equal("workspaceId", input.workspaceId), query.limit(100)] },
    ),
  ]);
  const now = new Date().toISOString();
  const run = await appwrite.client.request<ComplianceAutomationRecord>(
    `${base}/${appwriteTables.complianceAutomations}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          framework: "SOC 2 readiness",
          status: "preview_ready",
          scope: "Policies, validation evidence, and audit event inventory",
          controlCount: policies.rows.reduce((total, policy) => total + policy.rulesCount, 0),
          evidenceCount: validations.rows.length + audits.rows.length,
          externalSubmitted: 0,
          output: JSON.stringify({
            preview: true,
            policies: policies.rows.length,
            validationRuns: validations.rows.length,
            auditEventsSampled: audits.rows.length,
            auditorVerified: false,
            regulatorSubmitted: false,
          }),
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
    action: "trust.compliance.preview_generated",
    targetType: "compliance_automation",
    targetId: run.$id,
    metadata: { externalSubmitted: false, auditorVerified: false },
  });
  return run;
}

export async function refreshRegionalGate(input: {
  workspaceId: string;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const gate = await assessRegionalRollout(appwrite, input.workspaceId);
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "trust.regional_evidence.refreshed",
    targetType: "regional_rollout_gate",
    targetId: gate.$id,
    metadata: { recommendation: gate.recommendation, score: gate.score },
  });
  return gate;
}

export async function recordRegionalDecision(input: {
  workspaceId: string;
  email: string;
  decision: "hold" | "expand";
  rationale: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const assessed = await assessRegionalRollout(appwrite, input.workspaceId);
  const blockers = JSON.parse(assessed.blockers || "[]") as string[];
  if (
    input.decision === "expand" &&
    (assessed.recommendation !== "expand" || blockers.length)
  ) {
    throw new Error("Regional rollout cannot be authorized while trust blockers remain.");
  }
  const now = new Date().toISOString();
  const path =
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.regionalRolloutGates}/rows/${regionalGateRowId(input.workspaceId)}`;
  const gate = await appwrite.client.request<RegionalRolloutGateRecord>(path, {
    method: "PATCH",
    body: {
      data: {
        status: "decision_recorded",
        recommendation: input.decision,
        rolloutAuthorized: input.decision === "expand" ? 1 : 0,
        decidedBy: input.email.toLowerCase(),
        decisionRationale: input.rationale.trim().slice(0, 2000),
        decidedAt: now,
        updatedAt: now,
      },
    },
  });
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: `trust.regional_decision.${input.decision}`,
    targetType: "regional_rollout_gate",
    targetId: gate.$id,
    metadata: {
      score: gate.score,
      blockers: blockers.length,
      regionalDeploymentPerformed: false,
    },
  });
  return gate;
}

function autonomyProfileRowId(workspaceId: string) {
  return enterpriseRowId("autonomy", workspaceId);
}

async function ensureCadenceFoundation(email: string, displayName: string) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureTrustFoundation(email, displayName);
  if (!workspace) return null;
  const now = new Date().toISOString();
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  await createIfMissing(appwrite, `${base}/${appwriteTables.autonomyProfiles}/rows`, {
    rowId: autonomyProfileRowId(workspace.workspaceId),
    data: {
      workspaceId: workspace.workspaceId,
      currentTier: "assistive",
      recommendedTier: "assistive",
      status: "hold",
      maxActionRisk: "none",
      autoExecuteEnabled: 0,
      score: 0,
      evidence: JSON.stringify({
        productionFeedbackVerified: false,
        tenantEvaluationPassed: false,
        workloadForecastReliable: false,
        customerOutcomesVerified: false,
        policyOptimizationValidated: false,
        continuousTrustAuthorized: false,
      }),
      blockers: JSON.stringify([
        "Production feedback has not been verified.",
        "Tenant-level production evaluation has not passed.",
        "Workload history is insufficient for a reliable forecast.",
        "Three independently verified customer outcomes are required.",
        "No adaptive policy has completed validation.",
        "Continuous Trust has not authorized production expansion.",
      ]),
      createdAt: now,
      updatedAt: now,
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
            phase: 11,
            agents: ["vela", "loom", "tempo", "helio", "aegis"],
            governance: true,
            ecosystem: true,
            productionOperations: true,
            pilotLaunchroom: true,
            scaleOperations: true,
            continuousTrust: true,
            adaptiveAutonomy: true,
          }),
        },
      },
    },
  );
  return workspace;
}

async function assessAutonomyProfile(
  appwrite: NonNullable<ReturnType<typeof getClient>>,
  workspaceId: string,
) {
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const [feedback, evaluations, forecasts, outcomes, policies, trustGate] =
    await Promise.all([
      appwrite.client.request<RowList<FeedbackCycleRecord>>(
        `${base}/${appwriteTables.feedbackCycles}/rows`,
        { queries: [query.equal("workspaceId", workspaceId), query.limit(100)] },
      ),
      appwrite.client.request<RowList<TenantEvaluationRecord>>(
        `${base}/${appwriteTables.tenantEvaluations}/rows`,
        { queries: [query.equal("workspaceId", workspaceId), query.limit(100)] },
      ),
      appwrite.client.request<RowList<WorkloadForecastRecord>>(
        `${base}/${appwriteTables.workloadForecasts}/rows`,
        { queries: [query.equal("workspaceId", workspaceId), query.limit(100)] },
      ),
      appwrite.client.request<RowList<CustomerOutcomeRecord>>(
        `${base}/${appwriteTables.customerOutcomes}/rows`,
        { queries: [query.equal("workspaceId", workspaceId), query.limit(100)] },
      ),
      appwrite.client.request<RowList<PolicyRecommendationRecord>>(
        `${base}/${appwriteTables.policyRecommendations}/rows`,
        { queries: [query.equal("workspaceId", workspaceId), query.limit(100)] },
      ),
      appwrite.client.request<RegionalRolloutGateRecord>(
        `${base}/${appwriteTables.regionalRolloutGates}/rows/${regionalGateRowId(workspaceId)}`,
      ),
    ]);
  const evidence = {
    productionFeedbackVerified: feedback.rows.some(
      (cycle) =>
        cycle.status === "complete_verified" &&
        cycle.productionSignals >= 20 &&
        cycle.verifiedSignals >= 10,
    ),
    tenantEvaluationPassed: evaluations.rows.some(
      (evaluation) =>
        evaluation.status === "passed_production" &&
        evaluation.scope === "production_opt_in" &&
        evaluation.score >= 95,
    ),
    workloadForecastReliable: forecasts.rows.some(
      (forecast) =>
        forecast.dataQuality === "observed" &&
        forecast.observedRuns >= 50 &&
        forecast.confidenceBps >= 7000,
    ),
    customerOutcomesVerified:
      outcomes.rows.filter(
        (outcome) => outcome.verified === 1 && outcome.externalVerified === 1,
      ).length >= 3,
    policyOptimizationValidated: policies.rows.some(
      (policy) =>
        policy.status === "validated" &&
        policy.autoApplied === 0 &&
        policy.confidenceBps >= 8000,
    ),
    continuousTrustAuthorized:
      trustGate.recommendation === "expand" && trustGate.rolloutAuthorized === 1,
  };
  const blockerMap: Record<keyof typeof evidence, string> = {
    productionFeedbackVerified: "Production feedback has not been verified.",
    tenantEvaluationPassed: "Tenant-level production evaluation has not passed.",
    workloadForecastReliable: "Workload history is insufficient for a reliable forecast.",
    customerOutcomesVerified: "Three independently verified customer outcomes are required.",
    policyOptimizationValidated: "No adaptive policy has completed validation.",
    continuousTrustAuthorized: "Continuous Trust has not authorized production expansion.",
  };
  const blockers = (Object.keys(evidence) as Array<keyof typeof evidence>)
    .filter((key) => !evidence[key])
    .map((key) => blockerMap[key]);
  const passed = Object.values(evidence).filter(Boolean).length;
  const score = Math.round((passed / Object.keys(evidence).length) * 100);
  const recommendation = blockers.length === 0 ? "bounded" : "assistive";
  return appwrite.client.request<AutonomyProfileRecord>(
    `${base}/${appwriteTables.autonomyProfiles}/rows/${autonomyProfileRowId(workspaceId)}`,
    {
      method: "PATCH",
      body: {
        data: {
          recommendedTier: recommendation,
          status: blockers.length === 0 ? "eligible_for_review" : "hold",
          score,
          evidence: JSON.stringify(evidence),
          blockers: JSON.stringify(blockers),
          updatedAt: new Date().toISOString(),
        },
      },
    },
  );
}

export async function getCadenceOverview(
  email: string,
  displayName: string,
): Promise<CadenceOverview | null> {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureCadenceFoundation(email, displayName);
  if (!workspace) return null;
  const membership = await findMembership(workspace.workspaceId, email);
  if (!membership || !can(membership.role, "audit.read")) {
    throw new Error("You do not have permission to view adaptive intelligence.");
  }
  const profile = await assessAutonomyProfile(appwrite, workspace.workspaceId);
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const queries = [
    query.equal("workspaceId", workspace.workspaceId),
    query.orderDesc("createdAt"),
    query.limit(25),
  ];
  const [feedback, evaluations, forecasts, outcomes, policies, decisions, signals] =
    await Promise.all([
      appwrite.client.request<RowList<FeedbackCycleRecord>>(
        `${base}/${appwriteTables.feedbackCycles}/rows`,
        { queries },
      ),
      appwrite.client.request<RowList<TenantEvaluationRecord>>(
        `${base}/${appwriteTables.tenantEvaluations}/rows`,
        {
          queries: [
            query.equal("workspaceId", workspace.workspaceId),
            query.orderDesc("startedAt"),
            query.limit(25),
          ],
        },
      ),
      appwrite.client.request<RowList<WorkloadForecastRecord>>(
        `${base}/${appwriteTables.workloadForecasts}/rows`,
        { queries },
      ),
      appwrite.client.request<RowList<CustomerOutcomeRecord>>(
        `${base}/${appwriteTables.customerOutcomes}/rows`,
        { queries },
      ),
      appwrite.client.request<RowList<PolicyRecommendationRecord>>(
        `${base}/${appwriteTables.policyRecommendations}/rows`,
        { queries },
      ),
      appwrite.client.request<RowList<AutonomyDecisionRecord>>(
        `${base}/${appwriteTables.autonomyDecisions}/rows`,
        { queries },
      ),
      appwrite.client.request<RowList<ProductSignalRecord>>(
        `${base}/${appwriteTables.productSignals}/rows`,
        { queries },
      ),
    ]);
  return {
    workspaceId: workspace.workspaceId,
    feedback: feedback.rows,
    evaluations: evaluations.rows,
    profile,
    forecasts: forecasts.rows,
    outcomes: outcomes.rows,
    policies: policies.rows,
    decisions: decisions.rows,
    signals: signals.rows,
  };
}

export async function captureFeedbackCycle(input: {
  workspaceId: string;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const membership = await findMembership(input.workspaceId, input.email);
  if (!membership || !can(membership.role, "audit.read")) {
    throw new Error("You do not have permission to capture feedback.");
  }
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const [runs, approvals, signals] = await Promise.all([
    appwrite.client.request<RowList<{ metadata: string; startedAt: string }>>(
      `${base}/${appwriteTables.runs}/rows`,
      { queries: [query.equal("workspaceId", input.workspaceId), query.limit(100)] },
    ),
    appwrite.client.request<RowList<ApprovalRecord>>(
      `${base}/${appwriteTables.approvals}/rows`,
      { queries: [query.equal("workspaceId", input.workspaceId), query.limit(100)] },
    ),
    appwrite.client.request<RowList<ProductSignalRecord>>(
      `${base}/${appwriteTables.productSignals}/rows`,
      { queries: [query.equal("workspaceId", input.workspaceId), query.limit(100)] },
    ),
  ]);
  const productionRuns = runs.rows.filter(
    (run) => parseRecord(run.metadata).production === true,
  );
  const verifiedSignals = productionRuns.filter(
    (run) => parseRecord(run.metadata).evidenceVerified === true,
  ).length;
  const decisions = approvals.rows.filter((approval) =>
    ["approved", "denied"].includes(approval.state),
  );
  const approved = decisions.filter((approval) => approval.state === "approved").length;
  const decisionMinutes = decisions
    .filter((approval) => approval.decidedAt)
    .map((approval) =>
      Math.max(
        0,
        Math.round(
          (new Date(approval.decidedAt || approval.requestedAt).getTime() -
            new Date(approval.requestedAt).getTime()) /
            60_000,
        ),
      ),
    )
    .sort((a, b) => a - b);
  const medianApprovalMinutes = decisionMinutes.length
    ? decisionMinutes[Math.floor(decisionMinutes.length / 2)]
    : 0;
  const now = new Date();
  const windowStart = new Date(now.getTime() - 30 * 86_400_000);
  const isVerified = productionRuns.length >= 20 && verifiedSignals >= 10;
  const cycle = await appwrite.client.request<FeedbackCycleRecord>(
    `${base}/${appwriteTables.feedbackCycles}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          period: now.toISOString().slice(0, 7),
          status: isVerified ? "complete_verified" : "insufficient_evidence",
          source: "durable_workspace_records",
          signalsCount: runs.rows.length + decisions.length + signals.rows.length,
          productionSignals: productionRuns.length,
          verifiedSignals,
          acceptanceRateBps: decisions.length
            ? Math.round((approved / decisions.length) * 10_000)
            : 0,
          medianApprovalMinutes,
          sampleWindowStart: windowStart.toISOString(),
          sampleWindowEnd: now.toISOString(),
          evidence: JSON.stringify({
            runRows: runs.rows.length,
            approvalDecisions: decisions.length,
            productSignals: signals.rows.length,
            productionOptInRequired: true,
            externalAnalyticsIngested: false,
            productionQualityClaimed: isVerified,
          }),
          createdAt: now.toISOString(),
          completedAt: now.toISOString(),
        },
        permissions: [],
      },
    },
  );
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "intelligence.feedback_cycle.captured",
    targetType: "feedback_cycle",
    targetId: cycle.$id,
    metadata: {
      status: cycle.status,
      productionSignals: cycle.productionSignals,
      externalAnalyticsIngested: false,
    },
  });
  return cycle;
}

export async function runTenantIntelligenceEvaluation(input: {
  workspaceId: string;
  email: string;
  displayName: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureCadenceFoundation(input.email, input.displayName);
  if (!workspace || workspace.workspaceId !== input.workspaceId) {
    throw new Error("Workspace identity mismatch.");
  }
  const membership = await findMembership(input.workspaceId, input.email);
  if (!membership || !can(membership.role, "agents.run")) {
    throw new Error("You do not have permission to run tenant evaluations.");
  }
  const functionId = process.env.APPWRITE_FUNCTION_ID || "orchestrator";
  const execution = await appwrite.client.request<FunctionExecution>(
    `/functions/${functionId}/executions`,
    {
      method: "POST",
      body: {
        body: JSON.stringify({ workspaceId: input.workspaceId }),
        async: false,
        path: "/intelligence/evaluate",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-orkestria-user-id": workspace.userId,
        },
      },
    },
  );
  let response: {
    evaluation?: TenantEvaluationRecord;
    forecast?: WorkloadForecastRecord;
    error?: string;
  } | null = null;
  try {
    response = JSON.parse(execution.responseBody || "null");
  } catch {
    throw new Error("Tenant evaluation returned an unreadable response.");
  }
  if (
    execution.status !== "completed" ||
    execution.responseStatusCode >= 400 ||
    !response?.evaluation ||
    !response.forecast
  ) {
    throw new Error(response?.error || execution.errors || "Tenant evaluation failed.");
  }
  return response;
}

export async function createPolicyRecommendation(input: {
  workspaceId: string;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const profile = await assessAutonomyProfile(appwrite, input.workspaceId);
  const now = new Date().toISOString();
  const recommendation = await appwrite.client.request<PolicyRecommendationRecord>(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.policyRecommendations}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          title: "Keep consequential actions approval-gated",
          status: "draft_needs_validation",
          sourcePolicy: "workspace_default_guardrails",
          proposedPolicy: JSON.stringify({
            mode: "observe",
            preserveApprovalFor: [
              "purchase",
              "submission",
              "production_change",
              "permission_change",
              "sensitive_export",
            ],
            candidateChange: "Allow read-only enrichment to skip redundant review.",
            rollbackAvailable: true,
          }),
          confidenceBps: Math.min(6500, profile.score * 65),
          expectedImpact:
            "Reduce review noise for read-only enrichment without relaxing any consequential-action gate.",
          autoApplied: 0,
          evidence: JSON.stringify({
            profileScore: profile.score,
            blockers: JSON.parse(profile.blockers || "[]"),
            productionExperimentRun: false,
            customerImpactMeasured: false,
            policyChanged: false,
          }),
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
    action: "intelligence.policy_recommendation.drafted",
    targetType: "policy_recommendation",
    targetId: recommendation.$id,
    metadata: { autoApplied: false, policyChanged: false },
  });
  return recommendation;
}

export async function recordCustomerOutcomeDraft(input: {
  workspaceId: string;
  email: string;
  title: string;
  metric: string;
  baselineValue: number;
  currentValue: number;
  unit: string;
  note: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const membership = await findMembership(input.workspaceId, input.email);
  if (!membership || !can(membership.role, "audit.read")) {
    throw new Error("You do not have permission to record customer outcomes.");
  }
  const now = new Date().toISOString();
  const outcome = await appwrite.client.request<CustomerOutcomeRecord>(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.customerOutcomes}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          title: input.title.trim().slice(0, 180),
          metric: input.metric.trim().slice(0, 96),
          baselineValue: Math.round(input.baselineValue),
          currentValue: Math.round(input.currentValue),
          unit: input.unit.trim().slice(0, 32),
          status: "self_reported_unverified",
          verified: 0,
          externalVerified: 0,
          source: "workspace_user",
          evidence: JSON.stringify({
            note: input.note.trim().slice(0, 2000),
            userSupplied: true,
            artifactAttached: false,
            independentlyVerified: false,
          }),
          createdBy: input.email.toLowerCase(),
          createdAt: now,
        },
        permissions: [],
      },
    },
  );
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "intelligence.customer_outcome.draft_recorded",
    targetType: "customer_outcome",
    targetId: outcome.$id,
    metadata: { verified: false, externalVerified: false },
  });
  return outcome;
}

export async function refreshAutonomyProfile(input: {
  workspaceId: string;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const profile = await assessAutonomyProfile(appwrite, input.workspaceId);
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "intelligence.autonomy_evidence.refreshed",
    targetType: "autonomy_profile",
    targetId: profile.$id,
    metadata: { score: profile.score, recommendedTier: profile.recommendedTier },
  });
  return profile;
}

export async function recordAutonomyDecision(input: {
  workspaceId: string;
  email: string;
  decision: "hold" | "promote";
  rationale: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const profile = await assessAutonomyProfile(appwrite, input.workspaceId);
  const blockers = JSON.parse(profile.blockers || "[]") as string[];
  if (
    input.decision === "promote" &&
    (profile.recommendedTier !== "bounded" || blockers.length)
  ) {
    throw new Error("Autonomy cannot be promoted while evidence blockers remain.");
  }
  const now = new Date().toISOString();
  const toTier = input.decision === "promote" ? "bounded" : profile.currentTier;
  const decision = await appwrite.client.request<AutonomyDecisionRecord>(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.autonomyDecisions}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          profileId: profile.$id,
          decision: input.decision,
          fromTier: profile.currentTier,
          toTier,
          rationale: input.rationale.trim().slice(0, 2000),
          evidence: profile.evidence,
          enacted: input.decision === "promote" ? 1 : 0,
          externalActionsChanged: 0,
          decidedBy: input.email.toLowerCase(),
          createdAt: now,
        },
        permissions: [],
      },
    },
  );
  if (input.decision === "promote") {
    await appwrite.client.request(
      `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.autonomyProfiles}/rows/${profile.$id}`,
      {
        method: "PATCH",
        body: {
          data: {
            currentTier: "bounded",
            status: "active_bounded",
            maxActionRisk: "low",
            autoExecuteEnabled: 1,
            updatedAt: now,
          },
        },
      },
    );
  }
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: `intelligence.autonomy_decision.${input.decision}`,
    targetType: "autonomy_decision",
    targetId: decision.$id,
    metadata: {
      fromTier: decision.fromTier,
      toTier: decision.toTier,
      externalActionsChanged: false,
    },
  });
  return decision;
}

function ensembleTeamRowId(workspaceId: string) {
  return enterpriseRowId("ensemble", workspaceId);
}

function specialistRowId(agent: string, workspaceId: string) {
  return enterpriseRowId(`specialist_${agent}`, workspaceId);
}

async function ensureEnsembleFoundation(email: string, displayName: string) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureCadenceFoundation(email, displayName);
  if (!workspace) return null;
  const now = new Date().toISOString();
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const teamId = ensembleTeamRowId(workspace.workspaceId);
  await createIfMissing(appwrite, `${base}/${appwriteTables.agentTeams}/rows`, {
    rowId: teamId,
    data: {
      workspaceId: workspace.workspaceId,
      name: "Northstar Ensemble",
      status: "active",
      purpose: "Synthesize browser, workflow, reliability, cost, and security evidence into one accountable decision record.",
      policy: JSON.stringify({
        collaborationMode: "advisory_only",
        independentExecution: false,
        crossWorkspaceData: false,
        consequentialActionsRequireApproval: true,
        executiveDecisionDoesNotExecute: true,
      }),
      createdBy: email.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    },
    permissions: [],
  });
  const specialists = [
    ["vela", "Vela", "Research lead", ["browser_research", "source_mapping"]],
    ["loom", "Loom", "Workflow architect", ["workflow_design", "handoff_planning"]],
    ["tempo", "Tempo", "Reliability lead", ["incident_analysis", "remediation_sequence"]],
    ["helio", "Helio", "Financial analyst", ["cost_analysis", "savings_forecast"]],
    ["aegis", "Aegis", "Security reviewer", ["risk_review", "control_mapping"]],
  ];
  for (const [agent, name, role, capabilities] of specialists) {
    await createIfMissing(appwrite, `${base}/${appwriteTables.teamSpecialists}/rows`, {
      rowId: specialistRowId(String(agent), workspace.workspaceId),
      data: {
        workspaceId: workspace.workspaceId,
        teamId,
        agent,
        name,
        role,
        status: "available",
        capabilities: JSON.stringify(capabilities),
        boundaries: JSON.stringify({
          workspaceOnly: true,
          advisoryOnly: true,
          externalToolsAllowed: false,
          requiresCitations: true,
          cannotApproveOwnWork: true,
        }),
        canExecute: 0,
        createdAt: now,
        updatedAt: now,
      },
      permissions: [],
    });
  }
  await appwrite.client.request(
    `${base}/${appwriteTables.workspaces}/rows/${workspace.workspaceId}`,
    {
      method: "PATCH",
      body: {
        data: {
          plan: "enterprise",
          settings: JSON.stringify({
            phase: 12,
            agents: ["vela", "loom", "tempo", "helio", "aegis"],
            governance: true,
            ecosystem: true,
            productionOperations: true,
            pilotLaunchroom: true,
            scaleOperations: true,
            continuousTrust: true,
            adaptiveAutonomy: true,
            collaborativeDecisioning: true,
          }),
        },
      },
    },
  );
  return { ...workspace, teamId };
}

async function assessMissionCase(
  appwrite: NonNullable<ReturnType<typeof getClient>>,
  mission: MissionCaseRecord,
) {
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const [team, specialists, handoffs, syntheses, briefs] = await Promise.all([
    appwrite.client.request<AgentTeamRecord>(
      `${base}/${appwriteTables.agentTeams}/rows/${mission.teamId}`,
    ),
    appwrite.client.request<RowList<TeamSpecialistRecord>>(
      `${base}/${appwriteTables.teamSpecialists}/rows`,
      { queries: [query.equal("teamId", mission.teamId), query.limit(10)] },
    ),
    appwrite.client.request<RowList<MissionHandoffRecord>>(
      `${base}/${appwriteTables.missionHandoffs}/rows`,
      { queries: [query.equal("caseId", mission.$id), query.limit(100)] },
    ),
    appwrite.client.request<RowList<EvidenceSynthesisRecord>>(
      `${base}/${appwriteTables.evidenceSyntheses}/rows`,
      { queries: [query.equal("caseId", mission.$id), query.limit(25)] },
    ),
    appwrite.client.request<RowList<ExecutiveBriefRecord>>(
      `${base}/${appwriteTables.executiveBriefs}/rows`,
      { queries: [query.equal("caseId", mission.$id), query.limit(25)] },
    ),
  ]);
  const latestSynthesis = syntheses.rows.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];
  const latestBrief = briefs.rows.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];
  const existingEvidence = parseRecord(mission.evidence);
  const evidence = {
    teamBounded:
      team.status === "active" &&
      specialists.rows.length === 5 &&
      specialists.rows.every((specialist) => specialist.canExecute === 0),
    allSpecialistsContributed:
      new Set(handoffs.rows.map((handoff) => handoff.fromAgent)).size >= 5,
    handoffsExternallyVerified:
      handoffs.rows.length >= 5 &&
      handoffs.rows.every((handoff) => handoff.status === "verified"),
    evidenceComplete:
      Boolean(latestSynthesis) &&
      latestSynthesis.status === "verified" &&
      latestSynthesis.verifiedSourceCount >= 5 &&
      latestSynthesis.conflictCount === 0,
    briefReviewed: latestBrief?.reviewed === 1,
    downstreamApprovalsReady: existingEvidence.downstreamApprovalsReady === true,
  };
  const blockerMap: Record<keyof typeof evidence, string> = {
    teamBounded: "The five-specialist team boundary is not verified.",
    allSpecialistsContributed: "All five specialists have not contributed.",
    handoffsExternallyVerified: "Specialist handoffs use synthetic or unverified sources.",
    evidenceComplete: "Evidence conflicts or verification gaps remain.",
    briefReviewed: "The executive brief has not been reviewed.",
    downstreamApprovalsReady: "Downstream approval requirements are not assembled.",
  };
  const blockers = (Object.keys(evidence) as Array<keyof typeof evidence>)
    .filter((key) => !evidence[key])
    .map((key) => blockerMap[key]);
  const score = Math.round(
    (Object.values(evidence).filter(Boolean).length / Object.keys(evidence).length) *
      100,
  );
  return appwrite.client.request<MissionCaseRecord>(
    `${base}/${appwriteTables.missionCases}/rows/${mission.$id}`,
    {
      method: "PATCH",
      body: {
        data: {
          score,
          recommendation: blockers.length === 0 ? "ready" : "hold",
          evidence: JSON.stringify({
            ...evidence,
            synthesisId: latestSynthesis?.$id,
            briefId: latestBrief?.$id,
          }),
          blockers: JSON.stringify(blockers),
          updatedAt: new Date().toISOString(),
        },
      },
    },
  );
}

export async function getEnsembleOverview(
  email: string,
  displayName: string,
): Promise<EnsembleOverview | null> {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureEnsembleFoundation(email, displayName);
  if (!workspace) return null;
  const membership = await findMembership(workspace.workspaceId, email);
  if (!membership || !can(membership.role, "audit.read")) {
    throw new Error("You do not have permission to view collaborative missions.");
  }
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const [team, specialists, cases] = await Promise.all([
    appwrite.client.request<AgentTeamRecord>(
      `${base}/${appwriteTables.agentTeams}/rows/${workspace.teamId}`,
    ),
    appwrite.client.request<RowList<TeamSpecialistRecord>>(
      `${base}/${appwriteTables.teamSpecialists}/rows`,
      {
        queries: [
          query.equal("workspaceId", workspace.workspaceId),
          query.equal("teamId", workspace.teamId),
          query.limit(10),
        ],
      },
    ),
    appwrite.client.request<RowList<MissionCaseRecord>>(
      `${base}/${appwriteTables.missionCases}/rows`,
      {
        queries: [
          query.equal("workspaceId", workspace.workspaceId),
          query.orderDesc("createdAt"),
          query.limit(25),
        ],
      },
    ),
  ]);
  if (cases.rows[0]) cases.rows[0] = await assessMissionCase(appwrite, cases.rows[0]);
  const common = [
    query.equal("workspaceId", workspace.workspaceId),
    query.orderDesc("createdAt"),
    query.limit(100),
  ];
  const [handoffs, syntheses, briefs, decisions] = await Promise.all([
    appwrite.client.request<RowList<MissionHandoffRecord>>(
      `${base}/${appwriteTables.missionHandoffs}/rows`,
      { queries: common },
    ),
    appwrite.client.request<RowList<EvidenceSynthesisRecord>>(
      `${base}/${appwriteTables.evidenceSyntheses}/rows`,
      { queries: common },
    ),
    appwrite.client.request<RowList<ExecutiveBriefRecord>>(
      `${base}/${appwriteTables.executiveBriefs}/rows`,
      { queries: common },
    ),
    appwrite.client.request<RowList<ExecutiveDecisionRecord>>(
      `${base}/${appwriteTables.executiveDecisions}/rows`,
      { queries: common },
    ),
  ]);
  return {
    workspaceId: workspace.workspaceId,
    team,
    specialists: specialists.rows,
    cases: cases.rows,
    handoffs: handoffs.rows,
    syntheses: syntheses.rows,
    briefs: briefs.rows,
    decisions: decisions.rows,
  };
}

export async function createMissionCase(input: {
  workspaceId: string;
  email: string;
  displayName: string;
  title: string;
  objective: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureEnsembleFoundation(input.email, input.displayName);
  if (!workspace || workspace.workspaceId !== input.workspaceId) {
    throw new Error("Workspace identity mismatch.");
  }
  const membership = await findMembership(input.workspaceId, input.email);
  if (!membership || !can(membership.role, "agents.run")) {
    throw new Error("You do not have permission to create collaborative missions.");
  }
  const now = new Date().toISOString();
  const mission = await appwrite.client.request<MissionCaseRecord>(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.missionCases}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          teamId: workspace.teamId,
          title: input.title.trim().slice(0, 180),
          objective: input.objective.trim().slice(0, 4000),
          status: "scoped",
          risk: "medium",
          score: 17,
          recommendation: "hold",
          evidence: JSON.stringify({
            teamBounded: true,
            allSpecialistsContributed: false,
            handoffsExternallyVerified: false,
            evidenceComplete: false,
            briefReviewed: false,
            downstreamApprovalsReady: false,
          }),
          blockers: JSON.stringify([
            "All five specialists have not contributed.",
            "Specialist handoffs use synthetic or unverified sources.",
            "Evidence conflicts or verification gaps remain.",
            "The executive brief has not been reviewed.",
            "Downstream approval requirements are not assembled.",
          ]),
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
    action: "ensemble.mission.scoped",
    targetType: "mission_case",
    targetId: mission.$id,
    metadata: { teamId: workspace.teamId, externalActionsExecuted: false },
  });
  return mission;
}

export async function runEnsembleRehearsal(input: {
  workspaceId: string;
  caseId: string;
  email: string;
  displayName: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureEnsembleFoundation(input.email, input.displayName);
  if (!workspace || workspace.workspaceId !== input.workspaceId) {
    throw new Error("Workspace identity mismatch.");
  }
  const functionId = process.env.APPWRITE_FUNCTION_ID || "orchestrator";
  const execution = await appwrite.client.request<FunctionExecution>(
    `/functions/${functionId}/executions`,
    {
      method: "POST",
      body: {
        body: JSON.stringify({
          workspaceId: input.workspaceId,
          teamId: workspace.teamId,
          caseId: input.caseId,
        }),
        async: false,
        path: "/ensemble/rehearse",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-orkestria-user-id": workspace.userId,
        },
      },
    },
  );
  let response: {
    mission?: MissionCaseRecord;
    handoffs?: MissionHandoffRecord[];
    synthesis?: EvidenceSynthesisRecord;
    brief?: ExecutiveBriefRecord;
    error?: string;
  } | null = null;
  try {
    response = JSON.parse(execution.responseBody || "null");
  } catch {
    throw new Error("Ensemble rehearsal returned an unreadable response.");
  }
  if (
    execution.status !== "completed" ||
    execution.responseStatusCode >= 400 ||
    !response?.mission ||
    response.handoffs?.length !== 5 ||
    !response.synthesis ||
    !response.brief
  ) {
    throw new Error(response?.error || execution.errors || "Ensemble rehearsal failed.");
  }
  return response;
}

export async function reviewExecutiveBrief(input: {
  workspaceId: string;
  briefId: string;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const current = await appwrite.client.request<ExecutiveBriefRecord>(
    `${base}/${appwriteTables.executiveBriefs}/rows/${input.briefId}`,
  );
  if (current.workspaceId !== input.workspaceId || current.externallyShared === 1) {
    throw new Error("This brief is not available for internal review.");
  }
  const now = new Date().toISOString();
  const brief = await appwrite.client.request<ExecutiveBriefRecord>(
    `${base}/${appwriteTables.executiveBriefs}/rows/${input.briefId}`,
    {
      method: "PATCH",
      body: {
        data: {
          status: "reviewed_internal",
          reviewed: 1,
          reviewedBy: input.email.toLowerCase(),
          reviewedAt: now,
          updatedAt: now,
        },
      },
    },
  );
  const mission = await appwrite.client.request<MissionCaseRecord>(
    `${base}/${appwriteTables.missionCases}/rows/${brief.caseId}`,
  );
  await assessMissionCase(appwrite, mission);
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "ensemble.brief.reviewed",
    targetType: "executive_brief",
    targetId: brief.$id,
    metadata: { externallyShared: false, downstreamActionTriggered: false },
  });
  return brief;
}

export async function refreshMissionEvidence(input: {
  workspaceId: string;
  caseId: string;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const mission = await appwrite.client.request<MissionCaseRecord>(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.missionCases}/rows/${input.caseId}`,
  );
  if (mission.workspaceId !== input.workspaceId) {
    throw new Error("Mission is outside this workspace.");
  }
  const assessed = await assessMissionCase(appwrite, mission);
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "ensemble.mission_evidence.refreshed",
    targetType: "mission_case",
    targetId: mission.$id,
    metadata: { score: assessed.score, recommendation: assessed.recommendation },
  });
  return assessed;
}

export async function recordExecutiveDecision(input: {
  workspaceId: string;
  caseId: string;
  email: string;
  decision: "hold" | "approve";
  rationale: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const mission = await appwrite.client.request<MissionCaseRecord>(
    `${base}/${appwriteTables.missionCases}/rows/${input.caseId}`,
  );
  if (mission.workspaceId !== input.workspaceId) {
    throw new Error("Mission is outside this workspace.");
  }
  const assessed = await assessMissionCase(appwrite, mission);
  const blockers = JSON.parse(assessed.blockers || "[]") as string[];
  if (
    input.decision === "approve" &&
    (assessed.recommendation !== "ready" || blockers.length)
  ) {
    throw new Error("The executive plan cannot be approved while evidence blockers remain.");
  }
  const briefList = await appwrite.client.request<RowList<ExecutiveBriefRecord>>(
    `${base}/${appwriteTables.executiveBriefs}/rows`,
    {
      queries: [
        query.equal("caseId", input.caseId),
        query.orderDesc("createdAt"),
        query.limit(1),
      ],
    },
  );
  const brief = briefList.rows[0];
  if (!brief) throw new Error("Create an executive brief before recording a decision.");
  const now = new Date().toISOString();
  const decision = await appwrite.client.request<ExecutiveDecisionRecord>(
    `${base}/${appwriteTables.executiveDecisions}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          caseId: input.caseId,
          briefId: brief.$id,
          decision: input.decision,
          status: "recorded_no_execution",
          rationale: input.rationale.trim().slice(0, 2000),
          authorized: input.decision === "approve" ? 1 : 0,
          externalActionsExecuted: 0,
          decidedBy: input.email.toLowerCase(),
          createdAt: now,
        },
        permissions: [],
      },
    },
  );
  await appwrite.client.request(
    `${base}/${appwriteTables.missionCases}/rows/${input.caseId}`,
    {
      method: "PATCH",
      body: {
        data: {
          status: input.decision === "approve" ? "decision_approved" : "decision_held",
          updatedAt: now,
        },
      },
    },
  );
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: `ensemble.executive_decision.${input.decision}`,
    targetType: "executive_decision",
    targetId: decision.$id,
    metadata: {
      caseId: input.caseId,
      authorized: decision.authorized === 1,
      externalActionsExecuted: false,
    },
  });
  return decision;
}

function memoryEntityRowId(kind: string, workspaceId: string) {
  return enterpriseRowId(`memory_${kind}`, workspaceId);
}

function baselineClaimRowId(workspaceId: string) {
  return enterpriseRowId("memory_claim", workspaceId);
}

function baselineTwinRowId(workspaceId: string) {
  return enterpriseRowId("twin_seed", workspaceId);
}

async function ensureContinuumFoundation(email: string, displayName: string) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureEnsembleFoundation(email, displayName);
  if (!workspace) return null;
  const now = new Date().toISOString();
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const entities = [
    {
      kind: "platform",
      type: "platform",
      name: "Orkestria control plane",
      attributes: { scope: "workspace_configuration", lifecycle: "active" },
    },
    {
      kind: "browser",
      type: "capability",
      name: "Browser operations",
      attributes: { agent: "vela", boundary: "approval_gated" },
    },
    {
      kind: "workflow",
      type: "capability",
      name: "Workflow automation",
      attributes: { agent: "loom", boundary: "approval_gated" },
    },
    {
      kind: "cloud",
      type: "operating_domain",
      name: "Cloud estate",
      attributes: { agents: ["tempo", "helio"], liveInventoryConnected: false },
    },
    {
      kind: "security",
      type: "operating_domain",
      name: "Security posture",
      attributes: { agent: "aegis", liveScannerConnected: false },
    },
  ];
  for (const entity of entities) {
    await createIfMissing(appwrite, `${base}/${appwriteTables.memoryEntities}/rows`, {
      rowId: memoryEntityRowId(entity.kind, workspace.workspaceId),
      data: {
        workspaceId: workspace.workspaceId,
        entityType: entity.type,
        name: entity.name,
        status: "configuration_only",
        aliases: "[]",
        attributes: JSON.stringify({
          ...entity.attributes,
          source: "orkestria_workspace_configuration",
          productionObservationClaimed: false,
        }),
        sourceCount: 1,
        verifiedSourceCount: 0,
        confidenceBps: 2500,
        sensitive: 0,
        createdAt: now,
        updatedAt: now,
      },
      permissions: [],
    });
  }
  await createIfMissing(appwrite, `${base}/${appwriteTables.knowledgeClaims}/rows`, {
    rowId: baselineClaimRowId(workspace.workspaceId),
    data: {
      workspaceId: workspace.workspaceId,
      entityId: memoryEntityRowId("platform", workspace.workspaceId),
      predicate: "consequential_actions_require_approval",
      value: "Purchases, submissions, production changes, and sensitive actions remain human-gated.",
      status: "policy_assertion_unverified",
      confidenceBps: 6000,
      evidenceRefs: JSON.stringify(["policy://approval-boundaries"]),
      promoted: 0,
      createdBy: email.toLowerCase(),
      validFrom: now,
      createdAt: now,
      updatedAt: now,
    },
    permissions: [],
  });
  await createIfMissing(appwrite, `${base}/${appwriteTables.twinSnapshots}/rows`, {
    rowId: baselineTwinRowId(workspace.workspaceId),
    data: {
      workspaceId: workspace.workspaceId,
      status: "configuration_only",
      observedEntityCount: 0,
      verifiedClaimCount: 0,
      staleClaimCount: 0,
      completenessBps: 0,
      model: "continuum_v1",
      evidence: JSON.stringify({
        configurationEntities: entities.length,
        productionObservations: 0,
        verifiedClaims: 0,
        externalSystemsQueried: false,
        customerDataUsed: false,
        decisionReady: false,
      }),
      synthetic: 0,
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
            phase: 13,
            agents: ["vela", "loom", "tempo", "helio", "aegis"],
            governance: true,
            ecosystem: true,
            productionOperations: true,
            pilotLaunchroom: true,
            scaleOperations: true,
            continuousTrust: true,
            adaptiveAutonomy: true,
            collaborativeDecisioning: true,
            organizationalMemory: true,
            operationalTwin: true,
          }),
        },
      },
    },
  );
  return workspace;
}

export async function getContinuumOverview(
  email: string,
  displayName: string,
): Promise<ContinuumOverview | null> {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureContinuumFoundation(email, displayName);
  if (!workspace) return null;
  const membership = await findMembership(workspace.workspaceId, email);
  if (!membership || !can(membership.role, "audit.read")) {
    throw new Error("You do not have permission to view organizational memory.");
  }
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const recent = [
    query.equal("workspaceId", workspace.workspaceId),
    query.orderDesc("createdAt"),
    query.limit(100),
  ];
  const [entities, events, claims, snapshots, simulations, forecasts, promotions] =
    await Promise.all([
      appwrite.client.request<RowList<MemoryEntityRecord>>(
        `${base}/${appwriteTables.memoryEntities}/rows`,
        {
          queries: [
            query.equal("workspaceId", workspace.workspaceId),
            query.orderAsc("name"),
            query.limit(100),
          ],
        },
      ),
      appwrite.client.request<RowList<MemoryEventRecord>>(
        `${base}/${appwriteTables.memoryEvents}/rows`,
        {
          queries: [
            query.equal("workspaceId", workspace.workspaceId),
            query.orderDesc("recordedAt"),
            query.limit(100),
          ],
        },
      ),
      appwrite.client.request<RowList<KnowledgeClaimRecord>>(
        `${base}/${appwriteTables.knowledgeClaims}/rows`,
        { queries: recent },
      ),
      appwrite.client.request<RowList<TwinSnapshotRecord>>(
        `${base}/${appwriteTables.twinSnapshots}/rows`,
        { queries: recent },
      ),
      appwrite.client.request<RowList<ScenarioSimulationRecord>>(
        `${base}/${appwriteTables.scenarioSimulations}/rows`,
        { queries: recent },
      ),
      appwrite.client.request<RowList<ImpactForecastRecord>>(
        `${base}/${appwriteTables.impactForecasts}/rows`,
        { queries: recent },
      ),
      appwrite.client.request<RowList<MemoryPromotionRecord>>(
        `${base}/${appwriteTables.memoryPromotions}/rows`,
        { queries: recent },
      ),
    ]);
  return {
    workspaceId: workspace.workspaceId,
    entities: entities.rows,
    events: events.rows,
    claims: claims.rows,
    snapshots: snapshots.rows,
    simulations: simulations.rows,
    forecasts: forecasts.rows,
    promotions: promotions.rows,
  };
}

export async function captureMemoryEvent(input: {
  workspaceId: string;
  entityId: string;
  eventType: string;
  summary: string;
  occurredAt: string;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const membership = await findMembership(input.workspaceId, input.email);
  if (!membership || !can(membership.role, "agents.run")) {
    throw new Error("You do not have permission to capture organizational events.");
  }
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const entity = await appwrite.client.request<MemoryEntityRecord>(
    `${base}/${appwriteTables.memoryEntities}/rows/${input.entityId}`,
  );
  if (entity.workspaceId !== input.workspaceId) {
    throw new Error("The selected entity is outside this workspace.");
  }
  const now = new Date().toISOString();
  const event = await appwrite.client.request<MemoryEventRecord>(
    `${base}/${appwriteTables.memoryEvents}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          entityId: entity.$id,
          eventType: input.eventType.trim().slice(0, 64),
          status: "self_reported_unverified",
          summary: input.summary.trim().slice(0, 2000),
          facts: JSON.stringify({
            userSupplied: true,
            independentlyVerified: false,
            productionQualityClaimed: false,
          }),
          sourceType: "workspace_user",
          sourceId: input.email.toLowerCase(),
          verified: 0,
          synthetic: 0,
          occurredAt: new Date(input.occurredAt || now).toISOString(),
          recordedAt: now,
          recordedBy: input.email.toLowerCase(),
        },
        permissions: [],
      },
    },
  );
  await appwrite.client.request(
    `${base}/${appwriteTables.memoryEntities}/rows/${entity.$id}`,
    {
      method: "PATCH",
      body: {
        data: {
          sourceCount: entity.sourceCount + 1,
          status: "unverified_observation",
          updatedAt: now,
        },
      },
    },
  );
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "memory.event.captured",
    targetType: "memory_event",
    targetId: event.$id,
    metadata: { verified: false, synthetic: false, knowledgePromoted: false },
  });
  return event;
}

export async function proposeKnowledgeClaim(input: {
  workspaceId: string;
  entityId: string;
  predicate: string;
  value: string;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const entity = await appwrite.client.request<MemoryEntityRecord>(
    `${base}/${appwriteTables.memoryEntities}/rows/${input.entityId}`,
  );
  if (entity.workspaceId !== input.workspaceId) {
    throw new Error("The selected entity is outside this workspace.");
  }
  const now = new Date().toISOString();
  const claim = await appwrite.client.request<KnowledgeClaimRecord>(
    `${base}/${appwriteTables.knowledgeClaims}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          entityId: entity.$id,
          predicate: input.predicate.trim().slice(0, 128),
          value: input.value.trim().slice(0, 4000),
          status: "proposed_unverified",
          confidenceBps: 2500,
          evidenceRefs: "[]",
          promoted: 0,
          createdBy: input.email.toLowerCase(),
          validFrom: now,
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
    action: "memory.claim.proposed",
    targetType: "knowledge_claim",
    targetId: claim.$id,
    metadata: { verified: false, promoted: false },
  });
  return claim;
}

export async function refreshTwinSnapshot(input: {
  workspaceId: string;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const [entities, claims, events] = await Promise.all([
    appwrite.client.request<RowList<MemoryEntityRecord>>(
      `${base}/${appwriteTables.memoryEntities}/rows`,
      { queries: [query.equal("workspaceId", input.workspaceId), query.limit(100)] },
    ),
    appwrite.client.request<RowList<KnowledgeClaimRecord>>(
      `${base}/${appwriteTables.knowledgeClaims}/rows`,
      { queries: [query.equal("workspaceId", input.workspaceId), query.limit(100)] },
    ),
    appwrite.client.request<RowList<MemoryEventRecord>>(
      `${base}/${appwriteTables.memoryEvents}/rows`,
      { queries: [query.equal("workspaceId", input.workspaceId), query.limit(100)] },
    ),
  ]);
  const observedEntityCount = entities.rows.filter(
    (entity) => entity.verifiedSourceCount > 0,
  ).length;
  const verifiedClaimCount = claims.rows.filter(
    (claim) => claim.status === "verified" && claim.confidenceBps >= 8000,
  ).length;
  const staleClaimCount = claims.rows.filter(
    (claim) => claim.validTo && new Date(claim.validTo).getTime() < Date.now(),
  ).length;
  const completenessBps = Math.min(
    10000,
    Math.round(
      ((observedEntityCount + verifiedClaimCount) /
        Math.max(1, entities.rows.length + claims.rows.length)) *
        10000,
    ),
  );
  const now = new Date().toISOString();
  const snapshot = await appwrite.client.request<TwinSnapshotRecord>(
    `${base}/${appwriteTables.twinSnapshots}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          status:
            completenessBps >= 8000 && staleClaimCount === 0
              ? "decision_grade"
              : observedEntityCount > 0
                ? "partial_observed"
                : "insufficient_evidence",
          observedEntityCount,
          verifiedClaimCount,
          staleClaimCount,
          completenessBps,
          model: "continuum_v1",
          evidence: JSON.stringify({
            durableEntityRows: entities.rows.length,
            durableEventRows: events.rows.length,
            durableClaimRows: claims.rows.length,
            verifiedEvents: events.rows.filter((event) => event.verified === 1).length,
            externalSystemsQueried: false,
            customerDataUsed: false,
            missingEvidencePreserved: true,
          }),
          synthetic: 0,
          createdAt: now,
        },
        permissions: [],
      },
    },
  );
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "memory.twin.refreshed",
    targetType: "twin_snapshot",
    targetId: snapshot.$id,
    metadata: {
      completenessBps,
      externalSystemsQueried: false,
      knowledgeChanged: false,
    },
  });
  return snapshot;
}

export async function runTwinSimulation(input: {
  workspaceId: string;
  snapshotId: string;
  title: string;
  changeSet: string;
  horizonDays: number;
  email: string;
  displayName: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureContinuumFoundation(input.email, input.displayName);
  if (!workspace || workspace.workspaceId !== input.workspaceId) {
    throw new Error("Workspace identity mismatch.");
  }
  const functionId = process.env.APPWRITE_FUNCTION_ID || "orchestrator";
  const execution = await appwrite.client.request<FunctionExecution>(
    `/functions/${functionId}/executions`,
    {
      method: "POST",
      body: {
        body: JSON.stringify({
          workspaceId: input.workspaceId,
          snapshotId: input.snapshotId,
          title: input.title.slice(0, 180),
          changeSet: input.changeSet.slice(0, 4000),
          horizonDays: Math.min(180, Math.max(7, input.horizonDays)),
        }),
        async: false,
        path: "/memory/simulate",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-orkestria-user-id": workspace.userId,
        },
      },
    },
  );
  let response: {
    simulation?: ScenarioSimulationRecord;
    forecasts?: ImpactForecastRecord[];
    error?: string;
  } | null = null;
  try {
    response = JSON.parse(execution.responseBody || "null");
  } catch {
    throw new Error("Twin simulation returned an unreadable response.");
  }
  if (
    execution.status !== "completed" ||
    execution.responseStatusCode >= 400 ||
    !response?.simulation ||
    response.forecasts?.length !== 4
  ) {
    throw new Error(response?.error || execution.errors || "Twin simulation failed.");
  }
  return response;
}

export async function recordMemoryPromotion(input: {
  workspaceId: string;
  claimId: string;
  decision: "hold" | "promote" | "reject";
  rationale: string;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const [claim, snapshots] = await Promise.all([
    appwrite.client.request<KnowledgeClaimRecord>(
      `${base}/${appwriteTables.knowledgeClaims}/rows/${input.claimId}`,
    ),
    appwrite.client.request<RowList<TwinSnapshotRecord>>(
      `${base}/${appwriteTables.twinSnapshots}/rows`,
      {
        queries: [
          query.equal("workspaceId", input.workspaceId),
          query.orderDesc("createdAt"),
          query.limit(1),
        ],
      },
    ),
  ]);
  if (claim.workspaceId !== input.workspaceId) {
    throw new Error("The knowledge claim is outside this workspace.");
  }
  const snapshot = snapshots.rows[0];
  const evidenceRefs = JSON.parse(claim.evidenceRefs || "[]") as string[];
  const blockers = [
    claim.status === "verified" ? null : "The claim has not been independently verified.",
    claim.confidenceBps >= 8000 ? null : "Claim confidence is below the promotion threshold.",
    evidenceRefs.length >= 2 ? null : "At least two independent evidence references are required.",
    snapshot?.status === "decision_grade" ? null : "The current operational twin is not decision-grade.",
    snapshot?.staleClaimCount === 0 ? null : "The current twin contains stale claims.",
  ].filter(Boolean);
  if (input.decision === "promote" && blockers.length) {
    throw new Error(
      `Knowledge cannot be promoted while evidence blockers remain: ${blockers.join(" ")}`,
    );
  }
  const now = new Date().toISOString();
  if (input.decision === "promote") {
    await appwrite.client.request(
      `${base}/${appwriteTables.knowledgeClaims}/rows/${claim.$id}`,
      {
        method: "PATCH",
        body: {
          data: {
            status: "promoted_verified",
            promoted: 1,
            updatedAt: now,
          },
        },
      },
    );
  }
  const promotion = await appwrite.client.request<MemoryPromotionRecord>(
    `${base}/${appwriteTables.memoryPromotions}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          claimId: claim.$id,
          decision: input.decision,
          status:
            input.decision === "promote"
              ? "promoted_to_memory"
              : "recorded_no_change",
          rationale: input.rationale.trim().slice(0, 2000),
          authorized: input.decision === "promote" ? 1 : 0,
          knowledgeBaseChanged: input.decision === "promote" ? 1 : 0,
          externalActionsExecuted: 0,
          decidedBy: input.email.toLowerCase(),
          createdAt: now,
        },
        permissions: [],
      },
    },
  );
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: `memory.promotion.${input.decision}`,
    targetType: "memory_promotion",
    targetId: promotion.$id,
    metadata: {
      claimId: claim.$id,
      blockers: blockers.length,
      knowledgeBaseChanged: promotion.knowledgeBaseChanged === 1,
      externalActionsExecuted: false,
    },
  });
  return promotion;
}

function strategicGoalRowId(pillar: string, workspaceId: string) {
  return enterpriseRowId(`goal_${pillar}`, workspaceId);
}

function initiativeRowId(kind: string, workspaceId: string) {
  return enterpriseRowId(`initiative_${kind}`, workspaceId);
}

function dependencyRowId(kind: string, workspaceId: string) {
  return enterpriseRowId(`dependency_${kind}`, workspaceId);
}

function capacityRowId(workspaceId: string) {
  return enterpriseRowId("capacity", workspaceId);
}

async function ensureMeridianFoundation(email: string, displayName: string) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureContinuumFoundation(email, displayName);
  if (!workspace) return null;
  const now = new Date().toISOString();
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const goals = [
    {
      key: "trust",
      title: "Make every consequential action provably governed",
      pillar: "trust",
      metric: "verified_control_coverage",
      targetValue: 95,
      unit: "percent",
      priority: 1,
    },
    {
      key: "value",
      title: "Turn AI work into verified customer outcomes",
      pillar: "customer_value",
      metric: "verified_outcomes",
      targetValue: 12,
      unit: "outcomes",
      priority: 2,
    },
    {
      key: "scale",
      title: "Scale operations without scaling avoidable risk",
      pillar: "efficient_scale",
      metric: "production_readiness_score",
      targetValue: 90,
      unit: "score",
      priority: 3,
    },
  ];
  for (const goal of goals) {
    await createIfMissing(appwrite, `${base}/${appwriteTables.strategicGoals}/rows`, {
      rowId: strategicGoalRowId(goal.key, workspace.workspaceId),
      data: {
        workspaceId: workspace.workspaceId,
        title: goal.title,
        pillar: goal.pillar,
        status: "draft_unverified",
        metric: goal.metric,
        targetValue: goal.targetValue,
        unit: goal.unit,
        priority: goal.priority,
        verified: 0,
        evidence: JSON.stringify({
          source: "workspace_strategy_template",
          leadershipApproved: false,
          productionBaselineVerified: false,
        }),
        ownerEmail: email.toLowerCase(),
        horizon: "12_months",
        createdAt: now,
        updatedAt: now,
      },
      permissions: [],
    });
  }
  const initiatives = [
    {
      key: "approvals",
      goal: "trust",
      name: "Approval flow acceleration",
      budget: 1_200_000,
      headcount: 2,
      impact: "Reduce approval latency while preserving every consequential gate.",
      risk: "medium",
    },
    {
      key: "resilience",
      goal: "scale",
      name: "Regional resilience proof",
      budget: 2_200_000,
      headcount: 3,
      impact: "Validate failover and restore before geographic expansion.",
      risk: "high",
    },
    {
      key: "outcomes",
      goal: "value",
      name: "Verified outcome program",
      budget: 900_000,
      headcount: 2,
      impact: "Convert self-reported value into independently verified outcomes.",
      risk: "low",
    },
    {
      key: "evidence",
      goal: "trust",
      name: "Evidence graph foundation",
      budget: 1_500_000,
      headcount: 2,
      impact: "Connect claims, decisions, controls, and outcomes through durable provenance.",
      risk: "medium",
    },
  ];
  for (const initiative of initiatives) {
    await createIfMissing(appwrite, `${base}/${appwriteTables.portfolioInitiatives}/rows`, {
      rowId: initiativeRowId(initiative.key, workspace.workspaceId),
      data: {
        workspaceId: workspace.workspaceId,
        goalId: strategicGoalRowId(initiative.goal, workspace.workspaceId),
        name: initiative.name,
        status: "proposed_unverified",
        stage: "discovery",
        proposedBudgetCents: initiative.budget,
        requiredHeadcount: initiative.headcount,
        expectedImpact: initiative.impact,
        confidenceBps: 3000,
        risk: initiative.risk,
        assumptions: JSON.stringify([
          "Budget and capacity are planning assumptions.",
          "Expected impact is not a realized benefit.",
          "No financial commitment has been created.",
        ]),
        ownerEmail: email.toLowerCase(),
        createdAt: now,
        updatedAt: now,
      },
      permissions: [],
    });
  }
  const dependencies = [
    {
      key: "resilience_evidence",
      initiative: "resilience",
      dependsOn: "evidence",
      relationship: "evidence_prerequisite",
    },
    {
      key: "outcomes_approvals",
      initiative: "outcomes",
      dependsOn: "approvals",
      relationship: "workflow_prerequisite",
    },
    {
      key: "approvals_evidence",
      initiative: "approvals",
      dependsOn: "evidence",
      relationship: "measurement_prerequisite",
    },
  ];
  for (const dependency of dependencies) {
    await createIfMissing(
      appwrite,
      `${base}/${appwriteTables.initiativeDependencies}/rows`,
      {
        rowId: dependencyRowId(dependency.key, workspace.workspaceId),
        data: {
          workspaceId: workspace.workspaceId,
          initiativeId: initiativeRowId(dependency.initiative, workspace.workspaceId),
          dependsOnInitiativeId: initiativeRowId(dependency.dependsOn, workspace.workspaceId),
          relationship: dependency.relationship,
          status: "assumption_unverified",
          resolved: 0,
          evidence: JSON.stringify({
            userConfirmed: false,
            systemObserved: false,
            blockingClaimed: true,
          }),
          createdAt: now,
        },
        permissions: [],
      },
    );
  }
  await createIfMissing(appwrite, `${base}/${appwriteTables.capacityEnvelopes}/rows`, {
    rowId: capacityRowId(workspace.workspaceId),
    data: {
      workspaceId: workspace.workspaceId,
      period: "next_12_months",
      status: "planning_assumption",
      budgetCents: 5_000_000,
      allocatedBudgetCents: 0,
      availableHeadcount: 6,
      allocatedHeadcount: 0,
      externalVerified: 0,
      source: "workspace_owner_assumption",
      assumptions: JSON.stringify([
        "Budget is not connected to a finance system.",
        "Headcount is not connected to an HR system.",
        "Updating this envelope creates no commitment.",
      ]),
      updatedBy: email.toLowerCase(),
      createdAt: now,
      updatedAt: now,
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
            phase: 14,
            agents: ["vela", "loom", "tempo", "helio", "aegis"],
            governance: true,
            ecosystem: true,
            productionOperations: true,
            pilotLaunchroom: true,
            scaleOperations: true,
            continuousTrust: true,
            adaptiveAutonomy: true,
            collaborativeDecisioning: true,
            organizationalMemory: true,
            operationalTwin: true,
            strategicPlanning: true,
            portfolioIntelligence: true,
          }),
        },
      },
    },
  );
  return workspace;
}

export async function getMeridianOverview(
  email: string,
  displayName: string,
): Promise<MeridianOverview | null> {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureMeridianFoundation(email, displayName);
  if (!workspace) return null;
  const membership = await findMembership(workspace.workspaceId, email);
  if (!membership || !can(membership.role, "audit.read")) {
    throw new Error("You do not have permission to view strategic planning.");
  }
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const recent = [
    query.equal("workspaceId", workspace.workspaceId),
    query.orderDesc("createdAt"),
    query.limit(100),
  ];
  const [goals, initiatives, dependencies, capacity, scenarios, forecasts, decisions] =
    await Promise.all([
      appwrite.client.request<RowList<StrategicGoalRecord>>(
        `${base}/${appwriteTables.strategicGoals}/rows`,
        {
          queries: [
            query.equal("workspaceId", workspace.workspaceId),
            query.orderAsc("priority"),
            query.limit(25),
          ],
        },
      ),
      appwrite.client.request<RowList<PortfolioInitiativeRecord>>(
        `${base}/${appwriteTables.portfolioInitiatives}/rows`,
        {
          queries: [
            query.equal("workspaceId", workspace.workspaceId),
            query.orderDesc("createdAt"),
            query.limit(100),
          ],
        },
      ),
      appwrite.client.request<RowList<InitiativeDependencyRecord>>(
        `${base}/${appwriteTables.initiativeDependencies}/rows`,
        { queries: [query.equal("workspaceId", workspace.workspaceId), query.limit(100)] },
      ),
      appwrite.client.request<CapacityEnvelopeRecord>(
        `${base}/${appwriteTables.capacityEnvelopes}/rows/${capacityRowId(workspace.workspaceId)}`,
      ),
      appwrite.client.request<RowList<PortfolioScenarioRecord>>(
        `${base}/${appwriteTables.portfolioScenarios}/rows`,
        { queries: recent },
      ),
      appwrite.client.request<RowList<PortfolioForecastRecord>>(
        `${base}/${appwriteTables.portfolioForecasts}/rows`,
        { queries: recent },
      ),
      appwrite.client.request<RowList<InvestmentDecisionRecord>>(
        `${base}/${appwriteTables.investmentDecisions}/rows`,
        { queries: recent },
      ),
    ]);
  return {
    workspaceId: workspace.workspaceId,
    goals: goals.rows,
    initiatives: initiatives.rows,
    dependencies: dependencies.rows,
    capacity,
    scenarios: scenarios.rows,
    forecasts: forecasts.rows,
    decisions: decisions.rows,
  };
}

export async function proposePortfolioInitiative(input: {
  workspaceId: string;
  goalId: string;
  name: string;
  expectedImpact: string;
  proposedBudgetDollars: number;
  requiredHeadcount: number;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const goal = await appwrite.client.request<StrategicGoalRecord>(
    `${base}/${appwriteTables.strategicGoals}/rows/${input.goalId}`,
  );
  if (goal.workspaceId !== input.workspaceId) {
    throw new Error("The selected goal is outside this workspace.");
  }
  const now = new Date().toISOString();
  const initiative = await appwrite.client.request<PortfolioInitiativeRecord>(
    `${base}/${appwriteTables.portfolioInitiatives}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          goalId: goal.$id,
          name: input.name.trim().slice(0, 180),
          status: "proposed_unverified",
          stage: "discovery",
          proposedBudgetCents: Math.round(
            Math.min(10_000_000, Math.max(0, input.proposedBudgetDollars)) * 100,
          ),
          requiredHeadcount: Math.min(1000, Math.max(0, input.requiredHeadcount)),
          expectedImpact: input.expectedImpact.trim().slice(0, 2000),
          confidenceBps: 2000,
          risk: "medium",
          assumptions: JSON.stringify([
            "Proposal is user-supplied.",
            "Budget and impact are unverified planning assumptions.",
            "No financial commitment has been created.",
          ]),
          ownerEmail: input.email.toLowerCase(),
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
    action: "portfolio.initiative.proposed",
    targetType: "portfolio_initiative",
    targetId: initiative.$id,
    metadata: { verified: false, financialCommitmentCreated: false },
  });
  return initiative;
}

export async function updateCapacityEnvelope(input: {
  workspaceId: string;
  budgetDollars: number;
  availableHeadcount: number;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const now = new Date().toISOString();
  const capacity = await appwrite.client.request<CapacityEnvelopeRecord>(
    `/tablesdb/${appwrite.config.databaseId}/tables/${appwriteTables.capacityEnvelopes}/rows/${capacityRowId(input.workspaceId)}`,
    {
      method: "PATCH",
      body: {
        data: {
          status: "planning_assumption",
          budgetCents: Math.round(
            Math.min(100_000_000, Math.max(0, input.budgetDollars)) * 100,
          ),
          availableHeadcount: Math.min(10_000, Math.max(0, input.availableHeadcount)),
          externalVerified: 0,
          source: "workspace_owner_assumption",
          assumptions: JSON.stringify([
            "Budget is not connected to a finance system.",
            "Headcount is not connected to an HR system.",
            "Updating this envelope creates no commitment.",
          ]),
          updatedBy: input.email.toLowerCase(),
          updatedAt: now,
        },
      },
    },
  );
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: "portfolio.capacity.updated",
    targetType: "capacity_envelope",
    targetId: capacity.$id,
    metadata: { externalVerified: false, financialCommitmentCreated: false },
  });
  return capacity;
}

export async function runPortfolioScenario(input: {
  workspaceId: string;
  title: string;
  selectedInitiativeIds: string[];
  budgetLimitDollars: number;
  headcountLimit: number;
  horizonMonths: number;
  email: string;
  displayName: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  const workspace = await ensureMeridianFoundation(input.email, input.displayName);
  if (!workspace || workspace.workspaceId !== input.workspaceId) {
    throw new Error("Workspace identity mismatch.");
  }
  const functionId = process.env.APPWRITE_FUNCTION_ID || "orchestrator";
  const execution = await appwrite.client.request<FunctionExecution>(
    `/functions/${functionId}/executions`,
    {
      method: "POST",
      body: {
        body: JSON.stringify({
          workspaceId: input.workspaceId,
          title: input.title.slice(0, 180),
          selectedInitiativeIds: input.selectedInitiativeIds.slice(0, 25),
          budgetLimitCents: Math.round(
            Math.min(100_000_000, Math.max(0, input.budgetLimitDollars)) * 100,
          ),
          headcountLimit: Math.min(10_000, Math.max(0, input.headcountLimit)),
          horizonMonths: Math.min(36, Math.max(3, input.horizonMonths)),
        }),
        async: false,
        path: "/portfolio/simulate",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-orkestria-user-id": workspace.userId,
        },
      },
    },
  );
  let response: {
    scenario?: PortfolioScenarioRecord;
    forecasts?: PortfolioForecastRecord[];
    error?: string;
  } | null = null;
  try {
    response = JSON.parse(execution.responseBody || "null");
  } catch {
    throw new Error("Portfolio scenario returned an unreadable response.");
  }
  if (
    execution.status !== "completed" ||
    execution.responseStatusCode >= 400 ||
    !response?.scenario ||
    response.forecasts?.length !== 4
  ) {
    throw new Error(response?.error || execution.errors || "Portfolio scenario failed.");
  }
  return response;
}

export async function recordInvestmentDecision(input: {
  workspaceId: string;
  scenarioId: string;
  decision: "hold" | "authorize";
  rationale: string;
  email: string;
}) {
  const appwrite = getClient();
  if (!appwrite) return null;
  await requireEnterpriseOwner(input.workspaceId, input.email);
  const base = `/tablesdb/${appwrite.config.databaseId}/tables`;
  const [scenario, capacity, initiatives, dependencies, forecasts] = await Promise.all([
    appwrite.client.request<PortfolioScenarioRecord>(
      `${base}/${appwriteTables.portfolioScenarios}/rows/${input.scenarioId}`,
    ),
    appwrite.client.request<CapacityEnvelopeRecord>(
      `${base}/${appwriteTables.capacityEnvelopes}/rows/${capacityRowId(input.workspaceId)}`,
    ),
    appwrite.client.request<RowList<PortfolioInitiativeRecord>>(
      `${base}/${appwriteTables.portfolioInitiatives}/rows`,
      { queries: [query.equal("workspaceId", input.workspaceId), query.limit(100)] },
    ),
    appwrite.client.request<RowList<InitiativeDependencyRecord>>(
      `${base}/${appwriteTables.initiativeDependencies}/rows`,
      { queries: [query.equal("workspaceId", input.workspaceId), query.limit(100)] },
    ),
    appwrite.client.request<RowList<PortfolioForecastRecord>>(
      `${base}/${appwriteTables.portfolioForecasts}/rows`,
      { queries: [query.equal("scenarioId", input.scenarioId), query.limit(25)] },
    ),
  ]);
  if (scenario.workspaceId !== input.workspaceId) {
    throw new Error("The portfolio scenario is outside this workspace.");
  }
  const selectedIds = JSON.parse(scenario.selectedInitiativeIds || "[]") as string[];
  const selected = initiatives.rows.filter((initiative) =>
    selectedIds.includes(initiative.$id),
  );
  const goalIds = [...new Set(selected.map((initiative) => initiative.goalId))];
  const goals = await appwrite.client.request<RowList<StrategicGoalRecord>>(
    `${base}/${appwriteTables.strategicGoals}/rows`,
    { queries: [query.equal("workspaceId", input.workspaceId), query.limit(100)] },
  );
  const blockers = [
    selected.length > 0 ? null : "No initiatives are selected.",
    goalIds.every((goalId) =>
      goals.rows.some((goal) => goal.$id === goalId && goal.verified === 1),
    )
      ? null
      : "One or more linked strategic goals are unverified.",
    capacity.externalVerified === 1
      ? null
      : "Budget and headcount capacity are not externally verified.",
    dependencies.rows
      .filter((dependency) => selectedIds.includes(dependency.initiativeId))
      .every((dependency) => dependency.resolved === 1)
      ? null
      : "Selected initiatives have unresolved dependencies.",
    scenario.status === "verified"
      ? null
      : "The portfolio scenario is synthetic or unverified.",
    forecasts.rows.length === 4 &&
    forecasts.rows.every(
      (forecast) => forecast.status === "verified" && forecast.confidenceBps >= 8000,
    )
      ? null
      : "Decision-grade portfolio forecasts are not available.",
  ].filter(Boolean);
  if (input.decision === "authorize" && blockers.length) {
    throw new Error(
      `Investment cannot be authorized while evidence blockers remain: ${blockers.join(" ")}`,
    );
  }
  const now = new Date().toISOString();
  const decision = await appwrite.client.request<InvestmentDecisionRecord>(
    `${base}/${appwriteTables.investmentDecisions}/rows`,
    {
      method: "POST",
      body: {
        rowId: "unique()",
        data: {
          workspaceId: input.workspaceId,
          scenarioId: scenario.$id,
          decision: input.decision,
          status: "recorded_no_commitment",
          rationale: input.rationale.trim().slice(0, 2000),
          authorized: input.decision === "authorize" ? 1 : 0,
          financialCommitmentCreated: 0,
          externalActionsExecuted: 0,
          decidedBy: input.email.toLowerCase(),
          createdAt: now,
        },
        permissions: [],
      },
    },
  );
  await writeAuditEvent({
    workspaceId: input.workspaceId,
    actorEmail: input.email,
    action: `portfolio.investment_decision.${input.decision}`,
    targetType: "investment_decision",
    targetId: decision.$id,
    metadata: {
      blockers: blockers.length,
      financialCommitmentCreated: false,
      externalActionsExecuted: false,
    },
  });
  return decision;
}

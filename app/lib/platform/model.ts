export const workspaceRoles = [
  "owner",
  "admin",
  "operator",
  "approver",
  "developer",
  "analyst",
  "viewer",
] as const;

export type WorkspaceRole = (typeof workspaceRoles)[number];

export const roleCapabilities: Record<WorkspaceRole, readonly string[]> = {
  owner: ["workspace.manage", "members.manage", "agents.run", "approvals.decide", "audit.read", "billing.manage"],
  admin: ["members.manage", "agents.run", "approvals.decide", "audit.read"],
  operator: ["agents.run", "approvals.decide", "audit.read"],
  approver: ["approvals.decide", "audit.read"],
  developer: ["agents.run", "audit.read"],
  analyst: ["runs.read", "audit.read"],
  viewer: ["runs.read"],
};

export type ApprovalState = "pending" | "approved" | "denied" | "expired";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export type AgentKey = "vela" | "loom" | "tempo" | "helio" | "aegis";

export type AgentPlanStep = {
  title: string;
  kind: string;
  description: string;
  requiresApproval: boolean;
};

export type AgentFinding = {
  title: string;
  severity: "info" | RiskLevel;
  evidence: string;
  recommendation: string;
};

export type CostOpportunity = {
  resourceId: string;
  resourceName: string;
  category: string;
  currentMonthlyCost: number;
  estimatedMonthlySavings: number;
  confidence: number;
  effort: "low" | "medium" | "high";
  risk: RiskLevel;
  evidence: string;
  recommendation: string;
};

export type AgentPlan = {
  summary: string;
  risk: RiskLevel;
  approvalRequired: boolean;
  rationale: string;
  findings: AgentFinding[];
  opportunities: CostOpportunity[];
  steps: AgentPlanStep[];
};

export type AgentPlanResult = {
  run: {
    $id: string;
    workspaceId: string;
    agent: AgentKey;
    title: string;
    status: string;
    risk: RiskLevel;
  };
  plan: AgentPlan;
  approval: ApprovalRecord | null;
  costAnalysis?: {
    $id: string;
    currentSpendCents: number;
    potentialSavingsCents: number;
  } | null;
  requestId: string;
};

export type ApprovalRecord = {
  $id: string;
  workspaceId: string;
  runId: string;
  action: string;
  description: string;
  risk: RiskLevel;
  state: ApprovalState;
  requestedBy: string;
  approverEmail?: string;
  reason?: string;
  requestedAt: string;
  decidedAt?: string;
};

export type MembershipRecord = {
  $id: string;
  workspaceId: string;
  userEmail: string;
  userName?: string;
  role: WorkspaceRole;
  teamId?: string;
  status: "active" | "invited" | "suspended";
};

export type EnterpriseConfigRecord = {
  $id: string;
  workspaceId: string;
  identityMode: string;
  primaryDomain?: string;
  domainStatus: string;
  scimStatus: string;
  lastScimSyncAt?: string;
  dataRegion: string;
  residencyMode: string;
  privateNetworkStatus: string;
  privateNetworkProvider: string;
  slaTier: string;
  supportStatus: string;
  settings: string;
  updatedBy: string;
  updatedAt: string;
};

export type CustomRoleRecord = {
  $id: string;
  workspaceId: string;
  name: string;
  description: string;
  capabilities: string;
  status: string;
  memberCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type PolicyPackRecord = {
  $id: string;
  workspaceId: string;
  name: string;
  framework: string;
  version: string;
  mode: "monitor" | "enforce";
  status: string;
  rulesCount: number;
  coverage: number;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type ComplianceExportRecord = {
  $id: string;
  workspaceId: string;
  framework: string;
  format: string;
  status: string;
  period: string;
  checksum?: string;
  requestedBy: string;
  createdAt: string;
  completedAt?: string;
};

export type EnterpriseOverview = {
  workspaceId: string;
  config: EnterpriseConfigRecord;
  roles: CustomRoleRecord[];
  policies: PolicyPackRecord[];
  exports: ComplianceExportRecord[];
};

export type ConnectorCatalogRecord = {
  $id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  publisher: string;
  publisherType: string;
  authType: string;
  version: string;
  status: string;
  capabilities: string;
  agentKeys: string;
  actionsCount: number;
  featured: number;
};

export type ConnectorInstallationRecord = {
  $id: string;
  workspaceId: string;
  connectorId: string;
  connectorSlug: string;
  status: string;
  authStatus: string;
  environment: string;
  installedBy: string;
  config: string;
  installedAt: string;
  updatedAt: string;
};

export type PolicyTemplateRecord = {
  $id: string;
  slug: string;
  name: string;
  industry: string;
  description: string;
  framework: string;
  version: string;
  rulesCount: number;
  content: string;
  status: string;
  featured: number;
};

export type ProductSignalRecord = {
  $id: string;
  workspaceId: string;
  source: string;
  kind: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  score: number;
  evidence: string;
  recommendation: string;
  createdAt: string;
  updatedAt: string;
};

export type PartnerSubmissionRecord = {
  $id: string;
  workspaceId: string;
  name: string;
  connectorSlug: string;
  manifest: string;
  status: string;
  validation: string;
  submittedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type EcosystemOverview = {
  workspaceId: string;
  catalog: ConnectorCatalogRecord[];
  installations: ConnectorInstallationRecord[];
  policyTemplates: PolicyTemplateRecord[];
  activePolicyTemplateSlugs: string[];
  signals: ProductSignalRecord[];
  submissions: PartnerSubmissionRecord[];
};

export function can(role: WorkspaceRole, capability: string): boolean {
  return roleCapabilities[role].includes(capability);
}

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === "string" && workspaceRoles.includes(value as WorkspaceRole);
}

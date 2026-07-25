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

export type AgentPlan = {
  summary: string;
  risk: RiskLevel;
  approvalRequired: boolean;
  rationale: string;
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

export function can(role: WorkspaceRole, capability: string): boolean {
  return roleCapabilities[role].includes(capability);
}

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === "string" && workspaceRoles.includes(value as WorkspaceRole);
}

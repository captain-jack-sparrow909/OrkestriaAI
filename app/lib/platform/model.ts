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

export type ProviderAuthorizationRecord = {
  $id: string;
  workspaceId: string;
  installationId: string;
  provider: string;
  authType: string;
  state: string;
  scopes: string;
  secretRef?: string;
  expiresAt?: string;
  lastCheckedAt?: string;
  authorizedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type UsageLedgerRecord = {
  $id: string;
  workspaceId: string;
  meter: string;
  quantity: number;
  unit: string;
  sourceType: string;
  sourceId: string;
  period: string;
  costCents: number;
  idempotencyKey: string;
  recordedAt: string;
};

export type RecoveryDrillRecord = {
  $id: string;
  workspaceId: string;
  kind: string;
  status: string;
  scope: string;
  rpoMinutes: number;
  rtoMinutes: number;
  evidence: string;
  initiatedBy: string;
  startedAt: string;
  completedAt?: string;
};

export type ValidationRunRecord = {
  $id: string;
  workspaceId: string;
  jobId: string;
  suite: string;
  status: string;
  score: number;
  checks: string;
  initiatedBy: string;
  startedAt: string;
  completedAt?: string;
};

export type PilotProgramRecord = {
  $id: string;
  workspaceId: string;
  name: string;
  stage: string;
  status: string;
  targetUsers: number;
  ownerEmail: string;
  successCriteria: string;
  checklist: string;
  createdAt: string;
  updatedAt: string;
};

export type JobRecord = {
  $id: string;
  workspaceId: string;
  type: string;
  state: string;
  attempts: number;
  maxAttempts: number;
  idempotencyKey: string;
  availableAt: string;
  leaseUntil?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export type OperationsOverview = {
  workspaceId: string;
  installations: ConnectorInstallationRecord[];
  authorizations: ProviderAuthorizationRecord[];
  jobs: JobRecord[];
  usage: UsageLedgerRecord[];
  drills: RecoveryDrillRecord[];
  validations: ValidationRunRecord[];
  pilot: PilotProgramRecord;
};

export type PilotMemberRecord = {
  $id: string;
  workspaceId: string;
  pilotId: string;
  email: string;
  role: string;
  status: string;
  invitationState: string;
  consentState: string;
  lastActiveAt?: string;
  invitedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ActionScopeRecord = {
  $id: string;
  workspaceId: string;
  name: string;
  provider: string;
  environment: string;
  action: string;
  risk: RiskLevel;
  approvalRequired: number;
  status: string;
  constraints: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type PilotExerciseRecord = {
  $id: string;
  workspaceId: string;
  pilotId: string;
  scopeId: string;
  providerAuthorizationId?: string;
  approvalId?: string;
  state: string;
  outcome: string;
  externalActionExecuted: number;
  evidence: string;
  initiatedBy: string;
  startedAt: string;
  completedAt?: string;
};

export type SupportRotationRecord = {
  $id: string;
  workspaceId: string;
  name: string;
  status: string;
  timezone: string;
  primaryEmail: string;
  secondaryEmail?: string;
  coverage: string;
  escalationPolicy: string;
  lastHandoffAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type LaunchDecisionRecord = {
  $id: string;
  workspaceId: string;
  status: string;
  recommendation: "hold" | "ready";
  score: number;
  blockers: string;
  evidence: string;
  decidedBy?: string;
  decisionRationale?: string;
  createdAt: string;
  decidedAt?: string;
};

export type LaunchroomOverview = {
  workspaceId: string;
  pilot: PilotProgramRecord;
  members: PilotMemberRecord[];
  scopes: ActionScopeRecord[];
  exercises: PilotExerciseRecord[];
  rotation: SupportRotationRecord;
  decision: LaunchDecisionRecord;
  authorizations: ProviderAuthorizationRecord[];
  validations: ValidationRunRecord[];
  drills: RecoveryDrillRecord[];
};

export type ExecutorRegistryRecord = {
  $id: string;
  workspaceId: string;
  name: string;
  provider: string;
  environment: string;
  status: string;
  version: string;
  allowedActions: string;
  attestation: string;
  verifiedBy?: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type TelemetryRollupRecord = {
  $id: string;
  workspaceId: string;
  sourceType: string;
  windowStart: string;
  windowEnd: string;
  requestCount: number;
  successCount: number;
  errorCount: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  availabilityBps: number;
  costCents: number;
  evidence: string;
  createdAt: string;
};

export type IncidentExerciseRecord = {
  $id: string;
  workspaceId: string;
  kind: string;
  status: string;
  severity: string;
  scenario: string;
  detectionSeconds: number;
  mitigationSeconds: number;
  externalImpact: number;
  evidence: string;
  initiatedBy: string;
  startedAt: string;
  completedAt?: string;
};

export type BillingControlRecord = {
  $id: string;
  workspaceId: string;
  status: string;
  currency: string;
  monthlyBudgetCents: number;
  warningPercent: number;
  hardStopPercent: number;
  currentUsageCents: number;
  config: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type SupportCaseRecord = {
  $id: string;
  workspaceId: string;
  source: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  customerEmail?: string;
  customerNotified: number;
  ownerEmail: string;
  slaDueAt: string;
  resolvedAt?: string;
  evidence: string;
  createdAt: string;
  updatedAt: string;
};

export type ScaleGateRecord = {
  $id: string;
  workspaceId: string;
  status: string;
  recommendation: "hold" | "expand";
  score: number;
  expansionAuthorized: number;
  evidence: string;
  blockers: string;
  decidedBy?: string;
  decisionRationale?: string;
  createdAt: string;
  updatedAt: string;
  decidedAt?: string;
};

export type ScaleOpsOverview = {
  workspaceId: string;
  executors: ExecutorRegistryRecord[];
  telemetry: TelemetryRollupRecord[];
  incidents: IncidentExerciseRecord[];
  billing: BillingControlRecord;
  supportCases: SupportCaseRecord[];
  gate: ScaleGateRecord;
};

export type RegionalCellRecord = {
  $id: string;
  workspaceId: string;
  code: string;
  name: string;
  role: string;
  status: string;
  trafficPercent: number;
  deploymentVerified: number;
  dataResidency: string;
  provider: string;
  verification: string;
  createdAt: string;
  updatedAt: string;
};

export type ProviderRouteRecord = {
  $id: string;
  workspaceId: string;
  capability: string;
  provider: string;
  role: string;
  status: string;
  trafficPercent: number;
  health: string;
  configuration: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type FailoverDrillRecord = {
  $id: string;
  workspaceId: string;
  kind: string;
  status: string;
  sourceRegion: string;
  targetRegion: string;
  trafficShifted: number;
  dataRestored: number;
  observedRtoSeconds: number;
  evidence: string;
  initiatedBy: string;
  startedAt: string;
  completedAt?: string;
};

export type EvaluationRunRecord = {
  $id: string;
  workspaceId: string;
  suite: string;
  status: string;
  score: number;
  cases: number;
  passed: number;
  failed: number;
  modelProvider: string;
  liveModelCalled: number;
  evidence: string;
  initiatedBy: string;
  startedAt: string;
  completedAt?: string;
};

export type ServiceHealthUpdateRecord = {
  $id: string;
  workspaceId: string;
  status: string;
  audience: string;
  title: string;
  summary: string;
  components: string;
  customerVisible: number;
  publishedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ComplianceAutomationRecord = {
  $id: string;
  workspaceId: string;
  framework: string;
  status: string;
  scope: string;
  controlCount: number;
  evidenceCount: number;
  externalSubmitted: number;
  output: string;
  requestedBy: string;
  createdAt: string;
  completedAt?: string;
};

export type RegionalRolloutGateRecord = {
  $id: string;
  workspaceId: string;
  status: string;
  recommendation: "hold" | "expand";
  score: number;
  rolloutAuthorized: number;
  evidence: string;
  blockers: string;
  decidedBy?: string;
  decisionRationale?: string;
  createdAt: string;
  updatedAt: string;
  decidedAt?: string;
};

export type TrustGridOverview = {
  workspaceId: string;
  regions: RegionalCellRecord[];
  providers: ProviderRouteRecord[];
  failovers: FailoverDrillRecord[];
  evaluations: EvaluationRunRecord[];
  healthUpdates: ServiceHealthUpdateRecord[];
  compliance: ComplianceAutomationRecord[];
  gate: RegionalRolloutGateRecord;
};

export type FeedbackCycleRecord = {
  $id: string;
  workspaceId: string;
  period: string;
  status: string;
  source: string;
  signalsCount: number;
  productionSignals: number;
  verifiedSignals: number;
  acceptanceRateBps: number;
  medianApprovalMinutes: number;
  sampleWindowStart: string;
  sampleWindowEnd: string;
  evidence: string;
  createdAt: string;
  completedAt?: string;
};

export type TenantEvaluationRecord = {
  $id: string;
  workspaceId: string;
  suite: string;
  status: string;
  scope: string;
  score: number;
  cases: number;
  passed: number;
  failed: number;
  liveModelCalled: number;
  customerDataUsed: number;
  evidence: string;
  initiatedBy: string;
  startedAt: string;
  completedAt?: string;
};

export type AutonomyProfileRecord = {
  $id: string;
  workspaceId: string;
  currentTier: string;
  recommendedTier: string;
  status: string;
  maxActionRisk: string;
  autoExecuteEnabled: number;
  score: number;
  evidence: string;
  blockers: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkloadForecastRecord = {
  $id: string;
  workspaceId: string;
  horizonDays: number;
  status: string;
  basis: string;
  observedRuns: number;
  predictedRuns: number;
  peakConcurrent: number;
  confidenceBps: number;
  dataQuality: string;
  evidence: string;
  createdAt: string;
};

export type CustomerOutcomeRecord = {
  $id: string;
  workspaceId: string;
  title: string;
  metric: string;
  baselineValue: number;
  currentValue: number;
  unit: string;
  status: string;
  verified: number;
  externalVerified: number;
  source: string;
  evidence: string;
  createdBy: string;
  createdAt: string;
  verifiedAt?: string;
};

export type PolicyRecommendationRecord = {
  $id: string;
  workspaceId: string;
  title: string;
  status: string;
  sourcePolicy: string;
  proposedPolicy: string;
  confidenceBps: number;
  expectedImpact: string;
  autoApplied: number;
  evidence: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type AutonomyDecisionRecord = {
  $id: string;
  workspaceId: string;
  profileId: string;
  decision: string;
  fromTier: string;
  toTier: string;
  rationale: string;
  evidence: string;
  enacted: number;
  externalActionsChanged: number;
  decidedBy: string;
  createdAt: string;
};

export type CadenceOverview = {
  workspaceId: string;
  feedback: FeedbackCycleRecord[];
  evaluations: TenantEvaluationRecord[];
  profile: AutonomyProfileRecord;
  forecasts: WorkloadForecastRecord[];
  outcomes: CustomerOutcomeRecord[];
  policies: PolicyRecommendationRecord[];
  decisions: AutonomyDecisionRecord[];
  signals: ProductSignalRecord[];
};

export type AgentTeamRecord = {
  $id: string;
  workspaceId: string;
  name: string;
  status: string;
  purpose: string;
  policy: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type TeamSpecialistRecord = {
  $id: string;
  workspaceId: string;
  teamId: string;
  agent: string;
  name: string;
  role: string;
  status: string;
  capabilities: string;
  boundaries: string;
  canExecute: number;
  createdAt: string;
  updatedAt: string;
};

export type MissionCaseRecord = {
  $id: string;
  workspaceId: string;
  teamId: string;
  title: string;
  objective: string;
  status: string;
  risk: string;
  score: number;
  recommendation: "hold" | "ready";
  evidence: string;
  blockers: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type MissionHandoffRecord = {
  $id: string;
  workspaceId: string;
  caseId: string;
  fromAgent: string;
  toAgent: string;
  status: string;
  summary: string;
  citations: string;
  conflict: number;
  externalActionsExecuted: number;
  createdAt: string;
};

export type EvidenceSynthesisRecord = {
  $id: string;
  workspaceId: string;
  caseId: string;
  status: string;
  sourceCount: number;
  verifiedSourceCount: number;
  conflictCount: number;
  summary: string;
  findings: string;
  gaps: string;
  customerDataUsed: number;
  createdAt: string;
};

export type ExecutiveBriefRecord = {
  $id: string;
  workspaceId: string;
  caseId: string;
  title: string;
  status: string;
  audience: string;
  summary: string;
  recommendations: string;
  evidence: string;
  reviewed: number;
  externallyShared: number;
  createdBy: string;
  reviewedBy?: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
};

export type ExecutiveDecisionRecord = {
  $id: string;
  workspaceId: string;
  caseId: string;
  briefId: string;
  decision: string;
  status: string;
  rationale: string;
  authorized: number;
  externalActionsExecuted: number;
  decidedBy: string;
  createdAt: string;
};

export type EnsembleOverview = {
  workspaceId: string;
  team: AgentTeamRecord;
  specialists: TeamSpecialistRecord[];
  cases: MissionCaseRecord[];
  handoffs: MissionHandoffRecord[];
  syntheses: EvidenceSynthesisRecord[];
  briefs: ExecutiveBriefRecord[];
  decisions: ExecutiveDecisionRecord[];
};

export function can(role: WorkspaceRole, capability: string): boolean {
  return roleCapabilities[role].includes(capability);
}

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === "string" && workspaceRoles.includes(value as WorkspaceRole);
}

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

export type MemoryEntityRecord = {
  $id: string;
  workspaceId: string;
  entityType: string;
  name: string;
  status: string;
  aliases: string;
  attributes: string;
  sourceCount: number;
  verifiedSourceCount: number;
  confidenceBps: number;
  sensitive: number;
  createdAt: string;
  updatedAt: string;
};

export type MemoryEventRecord = {
  $id: string;
  workspaceId: string;
  entityId: string;
  eventType: string;
  status: string;
  summary: string;
  facts: string;
  sourceType: string;
  sourceId: string;
  verified: number;
  synthetic: number;
  occurredAt: string;
  recordedAt: string;
  recordedBy: string;
};

export type KnowledgeClaimRecord = {
  $id: string;
  workspaceId: string;
  entityId: string;
  predicate: string;
  value: string;
  status: string;
  confidenceBps: number;
  evidenceRefs: string;
  promoted: number;
  createdBy: string;
  validFrom: string;
  validTo?: string;
  createdAt: string;
  updatedAt: string;
};

export type TwinSnapshotRecord = {
  $id: string;
  workspaceId: string;
  status: string;
  observedEntityCount: number;
  verifiedClaimCount: number;
  staleClaimCount: number;
  completenessBps: number;
  model: string;
  evidence: string;
  synthetic: number;
  createdAt: string;
};

export type ScenarioSimulationRecord = {
  $id: string;
  workspaceId: string;
  snapshotId: string;
  title: string;
  status: string;
  horizonDays: number;
  changeSet: string;
  assumptions: string;
  projectedImpact: string;
  confidenceBps: number;
  liveModelCalled: number;
  customerDataUsed: number;
  externalActionsExecuted: number;
  createdBy: string;
  createdAt: string;
};

export type ImpactForecastRecord = {
  $id: string;
  workspaceId: string;
  simulationId: string;
  dimension: string;
  direction: string;
  baselineValue: number;
  projectedValueLow: number;
  projectedValueHigh: number;
  unit: string;
  confidenceBps: number;
  status: string;
  evidence: string;
  createdAt: string;
};

export type MemoryPromotionRecord = {
  $id: string;
  workspaceId: string;
  claimId: string;
  decision: string;
  status: string;
  rationale: string;
  authorized: number;
  knowledgeBaseChanged: number;
  externalActionsExecuted: number;
  decidedBy: string;
  createdAt: string;
};

export type ContinuumOverview = {
  workspaceId: string;
  entities: MemoryEntityRecord[];
  events: MemoryEventRecord[];
  claims: KnowledgeClaimRecord[];
  snapshots: TwinSnapshotRecord[];
  simulations: ScenarioSimulationRecord[];
  forecasts: ImpactForecastRecord[];
  promotions: MemoryPromotionRecord[];
};

export type StrategicGoalRecord = {
  $id: string;
  workspaceId: string;
  title: string;
  pillar: string;
  status: string;
  metric: string;
  targetValue: number;
  unit: string;
  priority: number;
  verified: number;
  evidence: string;
  ownerEmail: string;
  horizon: string;
  createdAt: string;
  updatedAt: string;
};

export type PortfolioInitiativeRecord = {
  $id: string;
  workspaceId: string;
  goalId: string;
  name: string;
  status: string;
  stage: string;
  proposedBudgetCents: number;
  requiredHeadcount: number;
  expectedImpact: string;
  confidenceBps: number;
  risk: string;
  assumptions: string;
  ownerEmail: string;
  createdAt: string;
  updatedAt: string;
};

export type InitiativeDependencyRecord = {
  $id: string;
  workspaceId: string;
  initiativeId: string;
  dependsOnInitiativeId: string;
  relationship: string;
  status: string;
  resolved: number;
  evidence: string;
  createdAt: string;
};

export type CapacityEnvelopeRecord = {
  $id: string;
  workspaceId: string;
  period: string;
  status: string;
  budgetCents: number;
  allocatedBudgetCents: number;
  availableHeadcount: number;
  allocatedHeadcount: number;
  externalVerified: number;
  source: string;
  assumptions: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type PortfolioScenarioRecord = {
  $id: string;
  workspaceId: string;
  title: string;
  status: string;
  horizonMonths: number;
  selectedInitiativeIds: string;
  budgetLimitCents: number;
  headcountLimit: number;
  assumptions: string;
  outcomeScore: number;
  confidenceBps: number;
  liveModelCalled: number;
  customerDataUsed: number;
  financialCommitmentCreated: number;
  createdBy: string;
  createdAt: string;
};

export type PortfolioForecastRecord = {
  $id: string;
  workspaceId: string;
  scenarioId: string;
  dimension: string;
  direction: string;
  baselineValue: number;
  projectedValueLow: number;
  projectedValueHigh: number;
  unit: string;
  confidenceBps: number;
  status: string;
  evidence: string;
  createdAt: string;
};

export type InvestmentDecisionRecord = {
  $id: string;
  workspaceId: string;
  scenarioId: string;
  decision: string;
  status: string;
  rationale: string;
  authorized: number;
  financialCommitmentCreated: number;
  externalActionsExecuted: number;
  decidedBy: string;
  createdAt: string;
};

export type MeridianOverview = {
  workspaceId: string;
  goals: StrategicGoalRecord[];
  initiatives: PortfolioInitiativeRecord[];
  dependencies: InitiativeDependencyRecord[];
  capacity: CapacityEnvelopeRecord;
  scenarios: PortfolioScenarioRecord[];
  forecasts: PortfolioForecastRecord[];
  decisions: InvestmentDecisionRecord[];
};

export type ExecutionProgramRecord = {
  $id: string;
  workspaceId: string;
  initiativeId: string;
  investmentDecisionId?: string;
  name: string;
  status: string;
  phase: string;
  ownerEmail: string;
  startDate: string;
  targetDate: string;
  budgetCents: number;
  committedBudgetCents: number;
  financialCommitmentCreated: number;
  externalActionsExecuted: number;
  assumptions: string;
  createdAt: string;
  updatedAt: string;
};

export type ProgramMilestoneRecord = {
  $id: string;
  workspaceId: string;
  programId: string;
  name: string;
  status: string;
  sequence: number;
  targetDate: string;
  completionBps: number;
  acceptanceCriteria: string;
  externallyVerified: number;
  evidenceCount: number;
  ownerEmail: string;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryEvidenceRecord = {
  $id: string;
  workspaceId: string;
  programId: string;
  milestoneId: string;
  type: string;
  source: string;
  status: string;
  summary: string;
  reference: string;
  userSupplied: number;
  verified: number;
  verifierEmail?: string;
  occurredAt: string;
  createdAt: string;
};

export type BenefitMetricRecord = {
  $id: string;
  workspaceId: string;
  programId: string;
  name: string;
  metric: string;
  baselineValue: number;
  targetValue: number;
  unit: string;
  realizationWindow: string;
  status: string;
  verified: number;
  evidence: string;
  createdAt: string;
  updatedAt: string;
};

export type BenefitMeasurementRecord = {
  $id: string;
  workspaceId: string;
  programId: string;
  metricId: string;
  observedValue: number;
  period: string;
  source: string;
  status: string;
  independentlyVerified: number;
  evidence: string;
  financialImpactCents: number;
  realizedBenefitClaimed: number;
  recordedBy: string;
  createdAt: string;
};

export type ExecutionVarianceRecord = {
  $id: string;
  workspaceId: string;
  programId: string;
  dimension: string;
  status: string;
  severity: string;
  baselineValue: number;
  actualValue: number;
  varianceValue: number;
  unit: string;
  confidenceBps: number;
  decisionGrade: number;
  evidence: string;
  externalSystemsQueried: number;
  assessedAt: string;
};

export type CorrectiveActionRecord = {
  $id: string;
  workspaceId: string;
  programId: string;
  varianceId: string;
  title: string;
  actionType: string;
  status: string;
  rationale: string;
  approvalStatus: string;
  authorized: number;
  scheduleChanged: number;
  budgetChanged: number;
  financialCommitmentCreated: number;
  externalActionsExecuted: number;
  proposedBy: string;
  decidedBy?: string;
  createdAt: string;
  decidedAt?: string;
};

export type KeystoneOverview = {
  workspaceId: string;
  initiatives: PortfolioInitiativeRecord[];
  investmentDecisions: InvestmentDecisionRecord[];
  programs: ExecutionProgramRecord[];
  milestones: ProgramMilestoneRecord[];
  deliveryEvidence: DeliveryEvidenceRecord[];
  benefitMetrics: BenefitMetricRecord[];
  benefitMeasurements: BenefitMeasurementRecord[];
  variances: ExecutionVarianceRecord[];
  correctiveActions: CorrectiveActionRecord[];
};

export type EnterpriseFederationRecord = {
  $id: string;
  workspaceId: string;
  name: string;
  status: string;
  purpose: string;
  verified: number;
  ownerEmail: string;
  createdAt: string;
  updatedAt: string;
};

export type FederationWorkspaceRecord = {
  $id: string;
  federationId: string;
  anchorWorkspaceId: string;
  memberWorkspaceId: string;
  alias: string;
  status: string;
  accessLevel: string;
  verified: number;
  dataSharingApproved: number;
  rawDataShared: number;
  proposedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type DelegatedAuthorityRecord = {
  $id: string;
  workspaceId: string;
  federationId: string;
  delegateEmail: string;
  role: string;
  scopes: string;
  status: string;
  verified: number;
  active: number;
  externalChangesAllowed: number;
  proposedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type FederatedPolicyBindingRecord = {
  $id: string;
  workspaceId: string;
  federationId: string;
  name: string;
  scope: string;
  mode: string;
  status: string;
  verified: number;
  enforcementApplied: number;
  externalSystemsChanged: number;
  policyJson: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type EnterpriseRollupRecord = {
  $id: string;
  workspaceId: string;
  federationId: string;
  status: string;
  period: string;
  workspaceCount: number;
  connectedWorkspaceCount: number;
  programsCount: number;
  milestonesCount: number;
  verifiedEvidenceCount: number;
  benefitsMeasuredCount: number;
  openVariancesCount: number;
  confidenceBps: number;
  decisionGrade: number;
  sourceSnapshot: string;
  externalSystemsQueried: number;
  createdBy: string;
  createdAt: string;
};

export type PrivacyBenchmarkRecord = {
  $id: string;
  workspaceId: string;
  federationId: string;
  rollupId: string;
  metric: string;
  currentValue: number;
  benchmarkLow: number;
  benchmarkHigh: number;
  unit: string;
  cohortSize: number;
  status: string;
  kAnonymityMet: number;
  differentialPrivacyApplied: number;
  rawTenantDataExposed: number;
  confidenceBps: number;
  evidence: string;
  createdAt: string;
};

export type ExecutiveDecisionPackageRecord = {
  $id: string;
  workspaceId: string;
  federationId: string;
  rollupId: string;
  title: string;
  status: string;
  decision: string;
  rationale: string;
  approvalStatus: string;
  authorized: number;
  policyApplied: number;
  delegationActivated: number;
  financialCommitmentCreated: number;
  externalActionsExecuted: number;
  preparedBy: string;
  decidedBy?: string;
  createdAt: string;
  decidedAt?: string;
};

export type ConcordOverview = {
  workspaceId: string;
  federation: EnterpriseFederationRecord;
  federationWorkspaces: FederationWorkspaceRecord[];
  authorities: DelegatedAuthorityRecord[];
  policies: FederatedPolicyBindingRecord[];
  rollups: EnterpriseRollupRecord[];
  benchmarks: PrivacyBenchmarkRecord[];
  packages: ExecutiveDecisionPackageRecord[];
};

export type AiModelVersionRecord = {
  $id: string;
  workspaceId: string;
  provider: string;
  modelKey: string;
  displayName: string;
  version: string;
  purpose: string;
  status: string;
  verified: number;
  active: number;
  sourceMetadata: string;
  registeredBy: string;
  createdAt: string;
  updatedAt: string;
};

export type PromptVersionRecord = {
  $id: string;
  workspaceId: string;
  promptKey: string;
  name: string;
  version: number;
  status: string;
  content: string;
  contentHash: string;
  modelVersionId: string;
  approved: number;
  deployed: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type EvaluationSuiteRecord = {
  $id: string;
  workspaceId: string;
  name: string;
  version: number;
  status: string;
  purpose: string;
  passThresholdBps: number;
  caseCount: number;
  immutable: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type EvaluationCaseRecord = {
  $id: string;
  workspaceId: string;
  suiteId: string;
  caseKey: string;
  category: string;
  input: string;
  expected: string;
  weightBps: number;
  status: string;
  verified: number;
  createdAt: string;
};

export type ModelQualityRunRecord = {
  $id: string;
  workspaceId: string;
  suiteId: string;
  modelVersionId: string;
  promptVersionId: string;
  status: string;
  scoreBps: number;
  passedCases: number;
  failedCases: number;
  totalCases: number;
  confidenceBps: number;
  decisionGrade: number;
  liveModelCalled: number;
  providerResponseStored: number;
  estimatedCostCents: number;
  evidence: string;
  createdBy: string;
  startedAt: string;
  completedAt: string;
};

export type ModelDriftSignalRecord = {
  $id: string;
  workspaceId: string;
  runId: string;
  dimension: string;
  status: string;
  baselineBps: number;
  currentBps: number;
  deltaBps: number;
  severity: string;
  confidenceBps: number;
  decisionGrade: number;
  evidence: string;
  liveTelemetryUsed: number;
  createdAt: string;
};

export type ModelRoutingPolicyRecord = {
  $id: string;
  workspaceId: string;
  name: string;
  capability: string;
  status: string;
  primaryModelVersionId: string;
  fallbackModelVersionId?: string;
  qualityFloorBps: number;
  costCeilingCents: number;
  trafficPercent: number;
  verified: number;
  applied: number;
  externalRoutingChanged: number;
  policyJson: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ModelPromotionDecisionRecord = {
  $id: string;
  workspaceId: string;
  modelVersionId: string;
  promptVersionId: string;
  qualityRunId: string;
  routingPolicyId?: string;
  title: string;
  status: string;
  decision: string;
  rationale: string;
  approvalStatus: string;
  authorized: number;
  promotionApplied: number;
  trafficChanged: number;
  externalSystemsChanged: number;
  gateSnapshot: string;
  requestedBy: string;
  decidedBy?: string;
  createdAt: string;
  decidedAt?: string;
};

export type VerityOverview = {
  workspaceId: string;
  models: AiModelVersionRecord[];
  prompts: PromptVersionRecord[];
  suites: EvaluationSuiteRecord[];
  cases: EvaluationCaseRecord[];
  runs: ModelQualityRunRecord[];
  driftSignals: ModelDriftSignalRecord[];
  routingPolicies: ModelRoutingPolicyRecord[];
  promotions: ModelPromotionDecisionRecord[];
};

export function can(role: WorkspaceRole, capability: string): boolean {
  return roleCapabilities[role].includes(capability);
}

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === "string" && workspaceRoles.includes(value as WorkspaceRole);
}

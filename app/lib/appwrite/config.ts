export const appwriteTables = {
  workspaces: "workspaces",
  memberships: "memberships",
  runs: "runs",
  approvals: "approvals",
  auditEvents: "audit_events",
  jobs: "jobs",
  files: "files",
  rateLimits: "rate_limits",
  costAnalyses: "cost_analyses",
  savingsOpportunities: "savings_opportunities",
  enterpriseConfigs: "enterprise_configs",
  customRoles: "custom_roles",
  policyPacks: "policy_packs",
  complianceExports: "compliance_exports",
  connectorCatalog: "connector_catalog",
  connectorInstallations: "connector_installations",
  policyTemplates: "policy_templates",
  productSignals: "product_signals",
  partnerSubmissions: "partner_submissions",
  providerAuthorizations: "provider_authorizations",
  usageLedger: "usage_ledger",
  recoveryDrills: "recovery_drills",
  validationRuns: "validation_runs",
  pilotPrograms: "pilot_programs",
  pilotMembers: "pilot_members",
  actionScopes: "action_scopes",
  pilotExercises: "pilot_exercises",
  supportRotations: "support_rotations",
  launchDecisions: "launch_decisions",
  executorRegistry: "executor_registry",
  telemetryRollups: "telemetry_rollups",
  incidentExercises: "incident_exercises",
  billingControls: "billing_controls",
  supportCases: "support_cases",
  scaleGates: "scale_gates",
  regionalCells: "regional_cells",
  providerRoutes: "provider_routes",
  failoverDrills: "failover_drills",
  evaluationRuns: "evaluation_runs",
  serviceHealthUpdates: "service_health_updates",
  complianceAutomations: "compliance_automations",
  regionalRolloutGates: "regional_rollout_gates",
  feedbackCycles: "feedback_cycles",
  tenantEvaluations: "tenant_evaluations",
  autonomyProfiles: "autonomy_profiles",
  workloadForecasts: "workload_forecasts",
  customerOutcomes: "customer_outcomes",
  policyRecommendations: "policy_recommendations",
  autonomyDecisions: "autonomy_decisions",
  agentTeams: "agent_teams",
  teamSpecialists: "team_specialists",
  missionCases: "mission_cases",
  missionHandoffs: "mission_handoffs",
  evidenceSyntheses: "evidence_syntheses",
  executiveBriefs: "executive_briefs",
  executiveDecisions: "executive_decisions",
  memoryEntities: "memory_entities",
  memoryEvents: "memory_events",
  knowledgeClaims: "knowledge_claims",
  twinSnapshots: "twin_snapshots",
  scenarioSimulations: "scenario_simulations",
  impactForecasts: "impact_forecasts",
  memoryPromotions: "memory_promotions",
  strategicGoals: "strategic_goals",
  portfolioInitiatives: "portfolio_initiatives",
  initiativeDependencies: "initiative_dependencies",
  capacityEnvelopes: "capacity_envelopes",
  portfolioScenarios: "portfolio_scenarios",
  portfolioForecasts: "portfolio_forecasts",
  investmentDecisions: "investment_decisions",
  executionPrograms: "execution_programs",
  programMilestones: "program_milestones",
  deliveryEvidence: "delivery_evidence",
  benefitMetrics: "benefit_metrics",
  benefitMeasurements: "benefit_measurements",
  executionVariances: "execution_variances",
  correctiveActions: "corrective_actions",
  enterpriseFederations: "enterprise_federations",
  federationWorkspaces: "federation_workspaces",
  delegatedAuthorities: "delegated_authorities",
  federatedPolicyBindings: "federated_policy_bindings",
  enterpriseRollups: "enterprise_rollups",
  privacyBenchmarks: "privacy_benchmarks",
  executiveDecisionPackages: "executive_decision_packages",
} as const;

export type AppwriteServerConfig = {
  endpoint: string;
  projectId: string;
  apiKey: string;
  databaseId: string;
};

export function getAppwriteServerConfig(): AppwriteServerConfig | null {
  const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
  const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY;
  const databaseId = process.env.APPWRITE_DATABASE_ID || "orkestria";

  if (!endpoint || !projectId || !apiKey) return null;

  return {
    endpoint: endpoint.replace(/\/$/, ""),
    projectId,
    apiKey,
    databaseId,
  };
}

export function appwriteFoundationStatus() {
  const config = getAppwriteServerConfig();
  return {
    configured: Boolean(config),
    endpointConfigured: Boolean(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT),
    projectConfigured: Boolean(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID),
    serverKeyConfigured: Boolean(process.env.APPWRITE_API_KEY),
    databaseId: process.env.APPWRITE_DATABASE_ID || "orkestria",
  };
}

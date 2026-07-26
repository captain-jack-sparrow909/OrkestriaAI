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

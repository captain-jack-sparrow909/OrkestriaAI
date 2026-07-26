import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/", requestHeaders = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html", ...requestHeaders },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the OrkestriaAI landing page and product suite", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>OrkestriaAI — Intelligence that gets work done<\/title>/i);
  assert.match(html, /Intelligence that/);
  assert.match(html, /gets work done\./);
  assert.match(html, /Vela/);
  assert.match(html, /Loom/);
  assert.match(html, /Tempo/);
  assert.match(html, /Helio/);
  assert.match(html, /Aegis/);
  assert.match(html, /Your approval is required/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("renders every primary marketing route", async () => {
  const routes = [
    ["/products", /Meet the orchestra\./],
    ["/workflows", /Loom Workflow Studio/i],
    ["/security", /Trust is a product feature\./],
    ["/pricing", /Start small\./],
    ["/sign-in", /Continue to your workspace/],
    ["/sign-up", /Start orchestrating with confidence/],
  ];

  for (const [path, expected] of routes) {
    const response = await render(path);
    assert.equal(response.status, 200, `${path} should respond successfully`);
    assert.match(await response.text(), expected);
  }
});

test("offers working sign-in and account-creation handoffs", async () => {
  for (const path of ["/sign-in", "/sign-up"]) {
    const response = await render(path);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(
      html,
      /href="\/signin-with-chatgpt\?return_to=%2Fdashboard"/,
    );
    assert.match(html, /No separate OrkestriaAI password/);
    assert.match(html, /Create account/);
    assert.doesNotMatch(html, /<form\b/i);
  }

  const authenticated = await render("/sign-in", {
    "oai-authenticated-user-email": "owner@example.com",
    "oai-authenticated-user-full-name": "Orkestria%20Owner",
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  });
  const authenticatedHtml = await authenticated.text();
  assert.match(authenticatedHtml, /Signed in as owner@example\.com/);
  assert.match(authenticatedHtml, /href="\/dashboard"/);
  assert.doesNotMatch(authenticatedHtml, /href="\/signin-with-chatgpt/);
});

test("switches to native Appwrite authentication on Appwrite Sites", async () => {
  const previousProvider = process.env.ORK_AUTH_PROVIDER;
  process.env.ORK_AUTH_PROVIDER = "appwrite";
  try {
    const signIn = await render("/sign-in");
    const signInHtml = await signIn.text();
    assert.match(signInHtml, /Sign in to OrkestriaAI/);
    assert.match(signInHtml, /type="email"/);
    assert.match(signInHtml, /type="password"/);
    assert.doesNotMatch(signInHtml, /href="\/signin-with-chatgpt/);

    const protectedPage = await render("/dashboard");
    assert.ok([302, 303, 307, 308].includes(protectedPage.status));
    assert.match(
      protectedPage.headers.get("location") ?? "",
      /\/sign-in\?return_to=%2Fdashboard$/,
    );
  } finally {
    if (previousProvider === undefined) delete process.env.ORK_AUTH_PROVIDER;
    else process.env.ORK_AUTH_PROVIDER = previousProvider;
  }
});

test("protects the command center behind authenticated identity", async () => {
  for (const path of ["/dashboard", "/vela", "/loom", "/tempo", "/helio", "/aegis", "/enterprise", "/ecosystem", "/operations", "/pilot", "/scale", "/trust", "/cadence", "/ensemble", "/continuum"]) {
    const response = await render(path);
    assert.ok([302, 303, 307, 308].includes(response.status));
    assert.match(
      response.headers.get("location") ?? "",
      new RegExp(`/signin-with-chatgpt\\?return_to=${encodeURIComponent(path).replaceAll("%", "%")}$`),
    );
  }
});

test("ships the Phase 2 Vela and Loom studios", async () => {
  const [vela, loom, repository, orchestrator] = await Promise.all([
    readFile(new URL("../app/vela/VelaStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/loom/LoomStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/platform/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../functions/orchestrator/src/main.js", import.meta.url), "utf8"),
  ]);

  assert.match(vela, /Plan browser mission/);
  assert.match(vela, /always-require-approval/);
  assert.match(loom, /Generate workflow/);
  assert.match(loom, /external messages require approval/);
  assert.match(repository, /enforceAgentPlanRateLimit/);
  assert.match(orchestrator, /x-orkestria-user-id/);
});

test("ships the Phase 3 Tempo and Aegis studios with evidence uploads", async () => {
  const [tempo, aegis, uploadRoute, deepseek] = await Promise.all([
    readFile(new URL("../app/tempo/TempoStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/aegis/AegisStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/files/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../functions/orchestrator/src/deepseek.js", import.meta.url), "utf8"),
  ]);

  assert.match(tempo, /Analyze incident/);
  assert.match(tempo, /productionPolicy/);
  assert.match(aegis, /Run security review/);
  assert.match(aegis, /Review findings/);
  assert.match(uploadRoute, /maximumAnalysisFileSize/);
  assert.match(uploadRoute, /workspace-uploads/);
  assert.match(deepseek, /surface concrete evidence as findings/);
  assert.match(deepseek, /Do not invent absent code/);
});

test("ships the Phase 4 Helio studio with durable conservative savings", async () => {
  const [helio, orchestrator, schema, deepseek] = await Promise.all([
    readFile(new URL("../app/helio/HelioStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../functions/orchestrator/src/main.js", import.meta.url), "utf8"),
    readFile(new URL("../appwrite/schema.mjs", import.meta.url), "utf8"),
    readFile(new URL("../functions/orchestrator/src/deepseek.js", import.meta.url), "utf8"),
  ]);

  assert.match(helio, /Analyze cloud spend/);
  assert.match(helio, /No savings theater/);
  assert.match(orchestrator, /cost_analyses/);
  assert.match(orchestrator, /savings_opportunities/);
  assert.match(schema, /id: "cost_analyses"/);
  assert.match(schema, /id: "savings_opportunities"/);
  assert.match(deepseek, /avoid double counting/);
  assert.match(deepseek, /Math\.min\(\s*currentMonthlyCost/);
});

test("ships the Phase 5 enterprise trust fabric with durable governance", async () => {
  const [studio, route, repository, schema, chrome] = await Promise.all([
    readFile(new URL("../app/enterprise/EnterpriseStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/enterprise/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/platform/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../appwrite/schema.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/components/WorkspaceChrome.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(studio, /Govern every agent/);
  assert.match(studio, /Connection truth/);
  assert.match(studio, /Custom access roles/);
  assert.match(studio, /Compliance evidence/);
  assert.match(route, /request_export/);
  assert.match(route, /Content-Disposition/);
  assert.match(repository, /requireEnterpriseOwner/);
  assert.match(repository, /enterprise\.policy\.mode_changed/);
  assert.match(schema, /id: "enterprise_configs"/);
  assert.match(schema, /id: "custom_roles"/);
  assert.match(schema, /id: "policy_packs"/);
  assert.match(schema, /id: "compliance_exports"/);
  assert.match(chrome, /active === "enterprise"/);
});

test("ships the Phase 6 governed ecosystem exchange and partner manifest SDK", async () => {
  const [exchange, route, repository, manifest, schema, chrome] = await Promise.all([
    readFile(new URL("../app/ecosystem/EcosystemExchange.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ecosystem/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/platform/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/ecosystem/manifest.ts", import.meta.url), "utf8"),
    readFile(new URL("../appwrite/schema.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/components/WorkspaceChrome.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(exchange, /Connect the tools/);
  assert.match(exchange, /Installation is not authorization/);
  assert.match(exchange, /Partner manifest SDK/i);
  assert.match(exchange, /Continuous product intelligence/);
  assert.match(route, /install_connector/);
  assert.match(route, /save_manifest/);
  assert.match(repository, /configuration_required/);
  assert.match(repository, /validated_draft/);
  assert.match(repository, /mode: "monitor"/);
  assert.match(manifest, /risk === "high" \|\| risk === "critical"/);
  assert.match(schema, /id: "connector_catalog"/);
  assert.match(schema, /id: "connector_installations"/);
  assert.match(schema, /id: "policy_templates"/);
  assert.match(schema, /id: "product_signals"/);
  assert.match(schema, /id: "partner_submissions"/);
  assert.match(chrome, /active === "ecosystem"/);
});

test("ships the Phase 7 production operations center and durable worker rehearsal", async () => {
  const [center, route, repository, orchestrator, schema, chrome] = await Promise.all([
    readFile(new URL("../app/operations/OperationsCenter.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/operations/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/platform/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../functions/orchestrator/src/main.js", import.meta.url), "utf8"),
    readFile(new URL("../appwrite/schema.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/components/WorkspaceChrome.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(center, /Practice the failure/);
  assert.match(center, /Authorization truth/);
  assert.match(center, /Run worker rehearsal/);
  assert.match(center, /No data restored/);
  assert.match(route, /run_worker_rehearsal/);
  assert.match(repository, /awaiting_oauth_consent/);
  assert.match(repository, /dataRestored: false/);
  assert.match(orchestrator, /path === "\/jobs\/rehearse"/);
  assert.match(orchestrator, /Exclusive queue lease/);
  assert.match(orchestrator, /worker-rehearsal:/);
  assert.match(schema, /id: "provider_authorizations"/);
  assert.match(schema, /id: "usage_ledger"/);
  assert.match(schema, /id: "recovery_drills"/);
  assert.match(schema, /id: "validation_runs"/);
  assert.match(schema, /id: "pilot_programs"/);
  assert.match(chrome, /active === "operations"/);
});

test("ships the Phase 8 Launchroom with truthful pilot and launch controls", async () => {
  const [launchroom, route, repository, orchestrator, schema, chrome] = await Promise.all([
    readFile(new URL("../app/pilot/Launchroom.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pilot/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/platform/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../functions/orchestrator/src/main.js", import.meta.url), "utf8"),
    readFile(new URL("../appwrite/schema.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/components/WorkspaceChrome.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(launchroom, /Earn the launch/);
  assert.match(launchroom, /Invitation truth/);
  assert.match(launchroom, /Production action envelope/);
  assert.match(launchroom, /Record hold/);
  assert.match(route, /run_exercise/);
  assert.match(route, /record_decision/);
  assert.match(repository, /draft_not_sent/);
  assert.match(repository, /externalInvitationSent: false/);
  assert.match(repository, /A go decision cannot be recorded while launch blockers remain/);
  assert.match(orchestrator, /path === "\/pilot\/exercise"/);
  assert.match(orchestrator, /externalActionExecuted: false/);
  assert.match(orchestrator, /blocked_executor_unavailable/);
  assert.match(schema, /id: "pilot_members"/);
  assert.match(schema, /id: "action_scopes"/);
  assert.match(schema, /id: "pilot_exercises"/);
  assert.match(schema, /id: "support_rotations"/);
  assert.match(schema, /id: "launch_decisions"/);
  assert.match(chrome, /active === "pilot"/);
});

test("ships the Phase 9 ScaleOps control room with evidence-bound expansion", async () => {
  const [center, route, repository, orchestrator, schema, chrome] = await Promise.all([
    readFile(new URL("../app/scale/ScaleOpsCenter.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/scale/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/platform/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../functions/orchestrator/src/main.js", import.meta.url), "utf8"),
    readFile(new URL("../appwrite/schema.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/components/WorkspaceChrome.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(center, /Scale the proof/);
  assert.match(center, /Attestation truth/);
  assert.match(center, /Run synthetic scale rehearsal/);
  assert.match(center, /Billing truth/);
  assert.match(center, /Authorize expansion/);
  assert.match(route, /run_rehearsal/);
  assert.match(route, /update_budget/);
  assert.match(route, /record_decision/);
  assert.match(repository, /awaiting_attestation/);
  assert.match(repository, /providerBillingConnected: false/);
  assert.match(repository, /Expansion cannot be authorized while scale blockers remain/);
  assert.match(orchestrator, /path === "\/scale\/rehearse"/);
  assert.match(orchestrator, /synthetic_scale_rehearsal/);
  assert.match(orchestrator, /externalProviderRequests: 0/);
  assert.match(schema, /id: "executor_registry"/);
  assert.match(schema, /id: "telemetry_rollups"/);
  assert.match(schema, /id: "incident_exercises"/);
  assert.match(schema, /id: "billing_controls"/);
  assert.match(schema, /id: "support_cases"/);
  assert.match(schema, /id: "scale_gates"/);
  assert.match(chrome, /active === "scale"/);
});

test("ships the Phase 10 TrustGrid with truthful continuous trust and rollout gates", async () => {
  const [grid, route, repository, orchestrator, schema, chrome] = await Promise.all([
    readFile(new URL("../app/trust/TrustGrid.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/trust/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/platform/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../functions/orchestrator/src/main.js", import.meta.url), "utf8"),
    readFile(new URL("../appwrite/schema.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/components/WorkspaceChrome.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(grid, /Every region/);
  assert.match(grid, /Region truth/);
  assert.match(grid, /Run trust rehearsal/);
  assert.match(grid, /Evaluation truth/);
  assert.match(grid, /Authorize region/);
  assert.match(route, /run_compliance_preview/);
  assert.match(route, /draft_health_update/);
  assert.match(repository, /configuration_ready/);
  assert.match(repository, /externalSubmitted: 0/);
  assert.match(repository, /Regional rollout cannot be authorized while trust blockers remain/);
  assert.match(orchestrator, /path === "\/trust\/rehearse"/);
  assert.match(orchestrator, /policy_boundary_regression/);
  assert.match(orchestrator, /liveModelCalled: 0/);
  assert.match(orchestrator, /trafficShifted: 0/);
  assert.match(schema, /id: "regional_cells"/);
  assert.match(schema, /id: "provider_routes"/);
  assert.match(schema, /id: "failover_drills"/);
  assert.match(schema, /id: "evaluation_runs"/);
  assert.match(schema, /id: "service_health_updates"/);
  assert.match(schema, /id: "compliance_automations"/);
  assert.match(schema, /id: "regional_rollout_gates"/);
  assert.match(chrome, /Phase 13 live/);
});

test("ships Phase 11 Cadence with evidence-gated adaptive autonomy", async () => {
  const [cadence, route, repository, orchestrator, schema, chrome] = await Promise.all([
    readFile(new URL("../app/cadence/CadenceControlRoom.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/cadence/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/platform/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../functions/orchestrator/src/main.js", import.meta.url), "utf8"),
    readFile(new URL("../appwrite/schema.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/components/WorkspaceChrome.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(cadence, /Learn the rhythm/);
  assert.match(cadence, /Capture feedback cycle/);
  assert.match(cadence, /Run tenant baseline/);
  assert.match(cadence, /Record outcome draft/);
  assert.match(cadence, /Draft policy proposal/);
  assert.match(cadence, /Promote to bounded/);
  assert.match(route, /record_outcome/);
  assert.match(route, /record_decision/);
  assert.match(repository, /self_reported_unverified/);
  assert.match(repository, /Autonomy cannot be promoted while evidence blockers remain/);
  assert.match(repository, /autoApplied: 0/);
  assert.match(orchestrator, /path === "\/intelligence\/evaluate"/);
  assert.match(orchestrator, /synthetic_workspace_baseline/);
  assert.match(orchestrator, /liveModelCalled: 0/);
  assert.match(orchestrator, /customerDataUsed: 0/);
  assert.match(schema, /id: "feedback_cycles"/);
  assert.match(schema, /id: "tenant_evaluations"/);
  assert.match(schema, /id: "autonomy_profiles"/);
  assert.match(schema, /id: "workload_forecasts"/);
  assert.match(schema, /id: "customer_outcomes"/);
  assert.match(schema, /id: "policy_recommendations"/);
  assert.match(schema, /id: "autonomy_decisions"/);
  assert.match(chrome, /Phase 13 live/);
});

test("ships Phase 12 Ensemble with bounded collaborative decisioning", async () => {
  const [ensemble, route, repository, orchestrator, schema, chrome] =
    await Promise.all([
      readFile(new URL("../app/ensemble/EnsembleCouncil.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/api/ensemble/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/lib/platform/repository.ts", import.meta.url), "utf8"),
      readFile(new URL("../functions/orchestrator/src/main.js", import.meta.url), "utf8"),
      readFile(new URL("../appwrite/schema.mjs", import.meta.url), "utf8"),
      readFile(new URL("../app/components/WorkspaceChrome.tsx", import.meta.url), "utf8"),
    ]);

  assert.match(ensemble, /Five specialists/);
  assert.match(ensemble, /Open case room/);
  assert.match(ensemble, /Run collaboration rehearsal/);
  assert.match(ensemble, /Evidence synthesis/);
  assert.match(ensemble, /Executive decision/);
  assert.match(route, /run_rehearsal/);
  assert.match(route, /review_brief/);
  assert.match(route, /record_decision/);
  assert.match(repository, /advisoryOnly: true/);
  assert.match(repository, /The executive plan cannot be approved while evidence blockers remain/);
  assert.match(repository, /status: "recorded_no_execution"/);
  assert.match(orchestrator, /path === "\/ensemble\/rehearse"/);
  assert.match(orchestrator, /ensemble_rehearsal/);
  assert.match(orchestrator, /liveModelCalled: false/);
  assert.match(orchestrator, /externalActionsExecuted: 0/);
  assert.match(schema, /id: "agent_teams"/);
  assert.match(schema, /id: "team_specialists"/);
  assert.match(schema, /id: "mission_cases"/);
  assert.match(schema, /id: "mission_handoffs"/);
  assert.match(schema, /id: "evidence_syntheses"/);
  assert.match(schema, /id: "executive_briefs"/);
  assert.match(schema, /id: "executive_decisions"/);
  assert.match(chrome, /active === "ensemble"/);
  assert.match(chrome, /Phase 13 live/);
});

test("ships Phase 13 Continuum with truthful organizational memory and digital twins", async () => {
  const [continuum, route, repository, orchestrator, schema, chrome] =
    await Promise.all([
      readFile(new URL("../app/continuum/ContinuumStudio.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/api/continuum/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/lib/platform/repository.ts", import.meta.url), "utf8"),
      readFile(new URL("../functions/orchestrator/src/main.js", import.meta.url), "utf8"),
      readFile(new URL("../appwrite/schema.mjs", import.meta.url), "utf8"),
      readFile(new URL("../app/components/WorkspaceChrome.tsx", import.meta.url), "utf8"),
    ]);

  assert.match(continuum, /Remember the truth/);
  assert.match(continuum, /Capture event/);
  assert.match(continuum, /Propose knowledge claim/);
  assert.match(continuum, /Reconstruct twin snapshot/);
  assert.match(continuum, /Run advisory simulation/);
  assert.match(continuum, /Memory promotion gate/);
  assert.match(route, /capture_event/);
  assert.match(route, /run_simulation/);
  assert.match(route, /record_promotion/);
  assert.match(repository, /self_reported_unverified/);
  assert.match(repository, /Knowledge cannot be promoted while evidence blockers remain/);
  assert.match(repository, /externalSystemsQueried: false/);
  assert.match(orchestrator, /path === "\/memory\/simulate"/);
  assert.match(orchestrator, /deterministic_reference_fixture/);
  assert.match(orchestrator, /knowledgeBaseChanged: false/);
  assert.match(orchestrator, /externalActionsExecuted: 0/);
  assert.match(schema, /id: "memory_entities"/);
  assert.match(schema, /id: "memory_events"/);
  assert.match(schema, /id: "knowledge_claims"/);
  assert.match(schema, /id: "twin_snapshots"/);
  assert.match(schema, /id: "scenario_simulations"/);
  assert.match(schema, /id: "impact_forecasts"/);
  assert.match(schema, /id: "memory_promotions"/);
  assert.match(chrome, /active === "continuum"/);
  assert.match(chrome, /Phase 13 live/);
});

test("keeps production metadata and the Appwrite blueprint aligned", async () => {
  const [layout, packageJson, blueprint, envExample] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../docs/PRODUCT_BLUEPRINT.md", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /OrkestriaAI — Intelligence that gets work done/);
  assert.match(layout, /\/og\.png/);
  assert.doesNotMatch(layout, /codex-preview|Starter Project/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(blueprint, /Appwrite architecture/);
  assert.match(blueprint, /approval_requests/);
  assert.match(envExample, /NEXT_PUBLIC_APPWRITE_PROJECT_ID/);
  assert.match(envExample, /APPWRITE_FUNCTION_ID/);
});

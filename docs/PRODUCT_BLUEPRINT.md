# OrkestriaAI — Product Blueprint

## Product thesis

OrkestriaAI is a trusted AI operations control plane. It combines five
specialist products with one shared layer for identity, permissions, context,
approvals, observability, and audit history.

The differentiator is not “AI that can do anything.” It is useful autonomy
inside clear organizational boundaries.

## The product suite

| Product | Capability | Promise |
| --- | --- | --- |
| **Vela** | Autonomous browser agent | A capable pair of hands for the open web. |
| **Loom** | AI workflow builder | Describe the work; Loom builds the flow. |
| **Tempo** | AI DevOps assistant | See the problem, understand the risk, act safely. |
| **Helio** | AI cloud cost optimizer | Savings engineers will actually trust. |
| **Aegis** | AI security review assistant | Findings that lead to better code. |

## Shared platform features

### Control plane

- One command bar and conversation surface across all five products.
- Shared workspace context and app connections.
- Cross-agent handoffs with traceable inputs and outputs.
- Unified run history, approval inbox, and notification center.

### Human approval engine

- Risk scoring based on action, environment, destination, data class, and cost.
- Approval policies at workspace, team, agent, workflow, and action levels.
- Single approver, multi-approver, and time-bound approval modes.
- Safe defaults: read-only analysis may run autonomously; purchases,
  submissions, deployments, permissions, destructive actions, and sensitive
  data transfers pause for review.

### Enterprise foundation

- Authentication with email/password, OAuth, magic link, and later SAML SSO.
- Roles: Owner, Admin, Operator, Approver, Developer, Analyst, Viewer.
- Workspace and team boundaries enforced server-side.
- Files with ownership, malware scanning status, extraction status, and
  lifecycle/retention policy.
- Background jobs with idempotency keys, retries, exponential backoff, timeouts,
  and dead-letter handling.
- Cache with explicit tenant-aware keys and per-data-source TTL.
- Rate limits by user, workspace, route, agent, connector, and external API.
- Structured logs, traces, model/tool spans, cost metrics, and alerting.
- Unit, integration, contract, security, and browser-level tests.
- Preview environments, migration checks, security scans, and guarded
  production deploys in CI/CD.

## Recommended frontend

Use **Next.js with TypeScript and Tailwind CSS**.

Why it fits:

- Mature server rendering and routing for the public site and authenticated app.
- Excellent Appwrite web SDK support.
- Strong patterns for protected layouts, streaming activity, and server-side
  authorization checks.
- A large ecosystem for tables, workflow canvases, charts, rich text, and
  browser testing.

Recommended additions for the product app:

- React Flow for Loom’s visual workflow canvas.
- TanStack Query for Appwrite-backed server state.
- TanStack Table for runs, findings, resources, and audit events.
- Zod for validating commands, policy input, and worker payloads.
- Recharts or Visx for cost, reliability, and security trends.
- Playwright for critical end-to-end journeys.

## Appwrite architecture

### Appwrite services

- **Auth:** users, sessions, OAuth, MFA, and team membership.
- **Teams:** workspaces and RBAC membership.
- **Databases:** product records and operational metadata.
- **Storage:** user uploads, evidence, exports, and generated reports.
- **Functions:** connector actions, AI orchestration, webhooks, scheduled work,
  scanning, and long-running job coordination.
- **Realtime:** live run steps, approval requests, alert status, and workflow
  execution.
- **Messaging:** email/push notifications for approvals and incidents.

### Core collections

| Collection | Purpose | Important fields |
| --- | --- | --- |
| `workspaces` | Tenant root | name, slug, plan, region, settings |
| `memberships` | RBAC | workspaceId, userId, role, teamIds, status |
| `app_connections` | OAuth and API integrations | provider, scopes, secretRef, health |
| `agents` | Agent configuration | type, permissions, modelPolicy, status |
| `workflows` | Versioned Loom definitions | name, version, graph, status, ownerId |
| `runs` | Agent/workflow execution | state, risk, initiatorId, startedAt, cost |
| `run_steps` | Detailed execution trace | runId, kind, inputRef, outputRef, timing |
| `approval_requests` | Human checkpoints | runId, action, risk, state, approverIds |
| `audit_events` | Immutable activity record | actor, action, target, result, metadata |
| `files` | Storage metadata | bucketId, fileId, ownerId, scanStatus, size |
| `incidents` | Tempo incidents | service, severity, cause, evidence, state |
| `cost_analyses` | Helio portfolio analysis | provider, period, spend, forecast, savings |
| `savings_opportunities` | Helio recommendations | resource, savings, confidence, risk, status |
| `enterprise_configs` | Enterprise trust posture | identity, region, network, SLA, retention |
| `custom_roles` | Least-privilege role definitions | capabilities, members, status, owner |
| `policy_packs` | Deterministic governance controls | framework, version, mode, coverage |
| `compliance_exports` | Point-in-time evidence manifests | framework, period, checksum, requester |
| `connector_catalog` | Verified integration contracts | auth, capabilities, actions, agents |
| `connector_installations` | Workspace connector lifecycle | auth status, environment, config, owner |
| `policy_templates` | Vertical policy marketplace | industry, framework, rules, version |
| `product_signals` | Continuous product intelligence | evidence, score, recommendation, status |
| `partner_submissions` | Private connector SDK drafts | manifest, validation, publisher, status |
| `security_findings` | Aegis findings | fingerprint, severity, CWE, fix, state |
| `browser_sessions` | Vela sessions | state, domainPolicy, expiresAt |
| `notifications` | User inbox | userId, type, readAt, entityRef |

All tenant-owned documents must include `workspaceId`. Appwrite permissions
should limit client access to the workspace team, while sensitive writes and all
privileged connector actions run in Functions with explicit authorization
checks.

### Storage buckets

- `workspace-uploads`: source documents and screenshots.
- `run-evidence`: tool outputs, browser captures, logs, and reports.
- `exports`: time-limited generated downloads.

Use short-lived preview URLs and store only metadata references in the
database.

### Background job model

1. An API/Function validates the user, workspace, role, quotas, and payload.
2. It creates a `runs` document and an idempotent job record.
3. A worker claims the job, writes live `run_steps`, and renews a lease.
4. Risky work creates an `approval_requests` document and suspends the job.
5. Appwrite Realtime updates the UI.
6. Approval resumes the job with a signed, one-use decision token.
7. Completion records metrics, cost, artifacts, and a final audit event.

## Primary product navigation

- **Command center:** activity, system health, savings, risks, and approvals.
- **Agents:** Vela, Loom, Tempo, Helio, and Aegis.
- **Workflows:** templates, canvas, versions, runs, and schedules.
- **Approvals:** prioritized inbox, policy reason, evidence, and action diff.
- **Connections:** apps, cloud accounts, repositories, observability, and secrets.
- **Observability:** runs, model/tool latency, token/cost usage, failures, and SLOs.
- **Governance:** people, roles, policies, audit export, retention, and billing.

## Delivery roadmap

### Phase 1 — Foundation

Authentication, workspaces, RBAC, connections, command center, run model,
approval engine, audit logging, notifications, rate limits, and platform
observability.

**Implementation status:** The protected command center, seven-role permission
model, eight-table Appwrite schema, private bucket definitions, approval API,
audit writer, idempotent job model, structured Function logs, and provisioning
automation are implemented. DeepSeek V4 Flash is integrated behind the
orchestrator as a planning-only intelligence layer; model output is validated,
bounded, metered, and forced through approval policy before risky execution.
The Appwrite database, private buckets, Function, and secret runtime variables
are provisioned in the live project.

**Next phase:** Vela + Loom — deliver the first complete agent and automation
experiences on top of the shared foundation.

### Phase 2 — Vela + Loom

Launch the browser agent and workflow builder first. Together they prove the
shared execution engine, connector framework, human approval model, and job
system.

**Implementation status:** Vela and Loom ship as authenticated studios backed
by the live Appwrite orchestrator. Natural-language missions become bounded,
inspectable plans; runs, audit events, approval checkpoints, and ten-minute
rate-limit windows are durable. The dashboard approval inbox reads and decides
the live records.

**Next phase:** Tempo + Aegis — extend the platform into engineering operations
and secure software delivery.

### Phase 3 — Tempo + Aegis

Add GitHub/GitLab, CI, cloud, and observability connectors. Reuse the approval
engine for code changes, rollbacks, and infrastructure remediation.

**Implementation status:** Tempo and Aegis ship as authenticated studios on the
shared Appwrite orchestrator. Tempo correlates operational evidence into
findings and reversible remediation sequences. Aegis grounds vulnerabilities
in supplied code or configuration and produces fix-ready recommendations.
Both support private evidence uploads with metadata, retention, audit records,
rate limits, and human approval before consequential changes.

**Next phase:** Helio — add financial intelligence and verified savings to the
shared operational context.

### Phase 4 — Helio

Add billing/usage ingestion, normalization, ownership mapping, savings
calculation, anomaly detection, and realized-savings tracking.

**Implementation status:** Helio ships as an authenticated cloud financial
intelligence studio on the shared Appwrite orchestrator. It ingests AWS, Azure,
Google Cloud, or multi-cloud billing evidence; quantifies evidence-grounded
opportunities with confidence, effort, and operational risk; deduplicates
resources; and caps every estimate at the resource's current monthly cost.
Analyses and opportunity records are durable, while the UI clearly separates
identified, approved, and realized value. No cloud resource is changed without
human approval.

**Next phase:** Enterprise scale — harden governance, identity, networking, and
regional controls for larger organizations.

### Phase 5 — Enterprise scale

SAML/SCIM, custom roles, regional data residency, private networking, policy
packs, compliance exports, marketplace connectors, and enterprise SLAs.

**Implementation status:** The Enterprise Control Center ships as an
authenticated governance surface backed by four Appwrite tables. Workspace
owners can manage regional boundaries, create bounded custom roles, move policy
packs between monitor and enforce modes, and generate attributable JSON
evidence bundles. Identity federation, directory provisioning, and private
network cards distinguish configuration readiness from a verified external
connection. Every mutation is workspace-authorized and written to the shared
audit trail; model output cannot override deterministic policy.

**Next phase:** Ecosystem expansion — launch the connector marketplace,
partner SDK, vertical policy packs, and continuous product intelligence.

### Phase 6 — Ecosystem expansion

Launch the connector marketplace, partner SDK, vertical policy catalog, and
continuous product intelligence.

**Implementation status:** The authenticated Ecosystem Exchange ships with a
verified connector catalog, workspace-scoped installation drafts, vertical
policy templates, bounded partner manifests, and evidence-backed product
signals. Adding a connector stores no credentials and explicitly remains
`configuration_required` until external authorization succeeds. Vertical
policies enter in monitor mode. High- and critical-risk partner actions are
forced through approval, while validation saves a private draft rather than
publishing it. Every workspace mutation is authorized and audited in Appwrite.

**Next phase:** Production operations — complete real provider authorization,
durable execution workers, usage metering, recovery drills, load and security
validation, and pilot onboarding.

## Success metrics

- Time from user intent to first useful result.
- Percentage of runs completed without manual recovery.
- Approval acceptance rate and median approval time.
- Hours saved and verified cloud savings.
- Incident mean time to understand and mean time to recovery.
- Actionable-to-noise ratio for security findings.
- Percentage of sensitive actions correctly gated.
- Weekly active workspaces using two or more products.

## Important product recommendations

1. Launch **Vela + Loom** before all five products. They create the shared
   platform primitives and the clearest early demo.
2. Make the **approval inbox** a flagship experience, not a settings utility.
3. Price primarily on included actions/compute with seats as a secondary axis.
4. Treat evidence and explanations as first-class data objects.
5. Build a connector SDK early so every new integration inherits auth, rate
   limits, retries, observability, and policy enforcement.
6. Add a dry-run mode that shows what an agent would do without taking action.
7. Add “automation confidence” and “policy coverage” views for admins.
8. Separate AI recommendations from deterministic policy decisions.

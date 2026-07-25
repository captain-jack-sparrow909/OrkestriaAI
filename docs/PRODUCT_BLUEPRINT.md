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
| `cost_findings` | Helio recommendations | resource, savings, confidence, risk |
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

**Next phase:** Vela + Loom — deliver the first complete agent and automation
experiences on top of the shared foundation.

### Phase 2 — Vela + Loom

Launch the browser agent and workflow builder first. Together they prove the
shared execution engine, connector framework, human approval model, and job
system.

**Next phase:** Tempo + Aegis — extend the platform into engineering operations
and secure software delivery.

### Phase 3 — Tempo + Aegis

Add GitHub/GitLab, CI, cloud, and observability connectors. Reuse the approval
engine for code changes, rollbacks, and infrastructure remediation.

**Next phase:** Helio — add financial intelligence and verified savings to the
shared operational context.

### Phase 4 — Helio

Add billing/usage ingestion, normalization, ownership mapping, savings
calculation, anomaly detection, and realized-savings tracking.

**Next phase:** Enterprise scale — harden governance, identity, networking, and
regional controls for larger organizations.

### Phase 5 — Enterprise scale

SAML/SCIM, custom roles, regional data residency, private networking, policy
packs, compliance exports, marketplace connectors, and enterprise SLAs.

**Next phase:** Ecosystem expansion — launch the connector marketplace,
partner SDK, vertical policy packs, and continuous product intelligence.

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

# OrkestriaAI

OrkestriaAI is a trusted AI operations control plane for browser work,
automation, DevOps, cloud cost, and security.

This repository contains the product website, protected command center, and
Appwrite foundation for identity-aware workspaces, approvals, audit events,
files, and background jobs.

## Product suite

- **Vela** — autonomous browser agent
- **Loom** — AI workflow builder
- **Tempo** — AI DevOps assistant
- **Helio** — AI cloud cost optimizer
- **Aegis** — AI security review assistant

The full product, platform, Appwrite data model, and delivery roadmap are
documented in [docs/PRODUCT_BLUEPRINT.md](docs/PRODUCT_BLUEPRINT.md).

## Local development

```bash
npm install
npm run dev
```

## Validation

```bash
npm run build
npm test
```

Copy `.env.example` to `.env.local` when an Appwrite project is ready to
connect.

## Appwrite foundation

The foundation is declared in `appwrite/schema.mjs` and includes seventy TablesDB
tables, three private Storage buckets, and the `orchestrator` Function.

After adding an Appwrite project endpoint, project ID, and scoped server API key:

```bash
npm run appwrite:provision
npm run appwrite:deploy-function
```

The Appwrite Function source lives in `functions/orchestrator`. The hosted
preview uses platform-managed sign-in; workspace authorization and all durable
records are designed to be enforced by Appwrite.

## AI provider

The orchestrator uses DeepSeek V4 Flash through its OpenAI-compatible Chat
Completions API. The model only produces bounded, validated plans. OrkestriaAI
policy—not model output—decides when human approval is mandatory.

The function accepts `DEEPSEEK_API_KEY` or the legacy local spelling
`DEEP_SEEK_API_KEY`, and uses `deepseek-v4-flash` by default.

## Current phase

Phase 18 adds **Overture**, the General Availability Command control room. It
combines launch evidence across resilience, security assurance, connector
certification, operational runbooks, customer onboarding, AI release
governance, and a final human launch decision. Its deterministic preflight
creates clearly bounded fixtures: it sends no production requests, runs no
external load generator or penetration traffic, scans no source or dependency
graph, and claims no production capacity or security assurance. Connector
candidates remain uncertified, runbooks remain unreviewed and unexercised, and
onboarding remains fixture-only until independently verified. Even a valid GA
approval records intent only and never makes the site public, sends customer
invitations, activates billing, or changes an external system. The durable
Appwrite foundation now spans 95 explicitly indexed tables. Overture keeps
high-volume load and security evidence in dedicated tables while consolidating
connector, runbook, onboarding, gate, and decision state in its GA program
record to stay within the project table quota.

**Roadmap complete:** all 18 planned product phases are implemented. The next
operating milestone is to close Overture's real-world evidence blockers and
record the human GA decision.

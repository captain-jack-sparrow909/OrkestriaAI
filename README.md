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

Phase 16 adds **Concord**, the Federated Enterprise Command control room. It
coordinates proposed workspace relationships, delegated mandates, federated
policy drafts, bounded operating rollups, clearly synthetic privacy-safe
reference ranges, and evidence-gated executive packages. A workspace proposal
grants no access, a mandate proposal stays inactive, and a policy draft is never
applied automatically. Rollups read only the authorized anchor workspace and
never query other member workspaces or external systems. Synthetic reference
ranges use no real tenant records and are not presented as privacy-reviewed
decision evidence. Even a valid executive approval records intent only and
never applies policy, activates delegation, creates a financial commitment, or
executes an external action. The durable Appwrite foundation now spans 84
explicitly indexed tables.

**Next phase:** Phase 17 — ModelOps, Evaluation & AI Quality Governance:
model and prompt versioning, golden evaluations, drift signals, cost-quality
routing, release gates, and human-approved model promotion.

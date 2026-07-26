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

The foundation is declared in `appwrite/schema.mjs` and includes fifty-six TablesDB
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

Phase 12 adds **Ensemble**, the Collaborative Agent Teams & Executive
Decisioning control room. It brings Vela, Loom, Tempo, Helio, and Aegis into
bounded five-specialist missions with explicit handoffs, visible conflicts,
cross-product evidence synthesis, internal executive briefs, and governed
decision records. The rehearsal is deterministic and uses no live model or
customer data; every specialist remains advisory-only, synthetic citations are
never treated as proof, and recording a decision never executes an external
action.

**Next phase:** Phase 13 — Organizational Memory & Operational Digital Twin:
entity-aware institutional memory, temporal evidence, scenario simulation,
impact forecasting, and governed promotion of learned operating knowledge.

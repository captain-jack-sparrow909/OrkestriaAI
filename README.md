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

Phase 17 adds **Verity**, the ModelOps, Evaluation & AI Quality Governance
control room. It versions model candidates and prompts, preserves immutable
golden contracts, runs deterministic evaluation-pipeline checks, creates
truthfully bounded drift baselines, drafts cost-quality routing at zero
production traffic, and gates model promotion behind human review. Model
registration never verifies or activates a provider release, prompt creation
never approves or deploys it, and contract fixtures never impersonate live-model
behavior. Drift remains explicitly non-decision-grade without live telemetry.
Even a valid promotion approval records intent only and never deploys a model,
changes traffic, or modifies an external system. The durable Appwrite
foundation now spans 92 explicitly indexed tables.

**Next phase:** Phase 18 — General Availability Hardening & Launch: load and
resilience testing, security review, connector certification, operational
documentation, onboarding, launch controls, and production-readiness evidence.

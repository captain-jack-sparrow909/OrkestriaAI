"use client";

import { useEffect, useMemo, useState } from "react";
import type { TrustGridOverview } from "../lib/platform/model";

function pretty(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseRecord(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function TrustGrid() {
  const [overview, setOverview] = useState<TrustGridOverview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [rationale, setRationale] = useState(
    "Hold regional rollout until deployments, real failover, provider redundancy, live-model evaluation, public health, and compliance submission are independently verified.",
  );

  async function load() {
    const response = await fetch("/api/trust", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "TrustGrid is unavailable.");
    setOverview(payload);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/trust", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "TrustGrid is unavailable.");
        if (!active) return;
        setOverview(payload);
        setStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "TrustGrid is unavailable.");
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  async function action(name: string, body: Record<string, unknown>) {
    if (!overview) return null;
    setBusy(name);
    setMessage("");
    try {
      const response = await fetch("/api/trust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, workspaceId: overview.workspaceId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Trust operation failed.");
      await load();
      return payload;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Trust operation failed.");
      return null;
    } finally {
      setBusy("");
    }
  }

  const blockers = useMemo(
    () => overview ? parseArray(overview.gate.blockers) : [],
    [overview],
  );
  const gateEvidence = useMemo(
    () => overview ? parseRecord(overview.gate.evidence) : {},
    [overview],
  );
  const latestEvaluation = overview?.evaluations[0];
  const latestFailover = overview?.failovers[0];
  const verifiedRegions = overview?.regions.filter((region) => region.deploymentVerified === 1).length || 0;
  const redundantProviders = overview?.providers.filter((provider) => provider.status === "verified").length || 0;
  const evidenceItems = [
    ["primaryRegionVerified", "Primary region"],
    ["secondaryRegionVerified", "Secondary region"],
    ["realTrafficFailover", "Traffic failover"],
    ["dataRestoreProven", "Regional restore"],
    ["providerRedundancyVerified", "Provider redundancy"],
    ["deterministicEvaluationPassed", "Policy evaluation"],
    ["liveModelEvaluationPassed", "Live-model canary"],
    ["serviceHealthPublished", "Published health"],
    ["complianceSubmissionVerified", "Compliance submission"],
  ];

  if (status === "loading") {
    return <div className="trust-loading"><span>◎</span><strong>Mapping the TrustGrid</strong><p>Loading regional cells, provider routes, evaluation evidence, service health, compliance, and rollout controls.</p></div>;
  }
  if (!overview || status === "error") {
    return <div className="trust-loading error"><span>!</span><strong>TrustGrid unavailable</strong><p>{message}</p></div>;
  }

  return (
    <div className="trust-content">
      <header className="trust-hero">
        <div><span className="kicker">CONTINUOUS TRUST &amp; GLOBAL EXPANSION</span><h1>Every region.<br />Same proof.</h1><p>Map deployment truth, verify independent providers, continuously test policy boundaries, communicate service health responsibly, automate evidence, and expand only after the system earns it.</p></div>
        <div className="trust-globe" aria-hidden="true"><span>O</span><i /><i /><i /><i /><b><small>TRUST COVERAGE</small><strong>{overview.gate.score}%</strong></b></div>
      </header>

      <section className="trust-metrics">
        <article><span>VERIFIED REGIONS</span><strong>{verifiedRegions} / {overview.regions.length}</strong><small>Configured is not deployed</small></article>
        <article><span>PROVIDER REDUNDANCY</span><strong>{redundantProviders} / 2</strong><small>Two independent routes required</small></article>
        <article><span>POLICY EVALUATION</span><strong>{latestEvaluation ? `${latestEvaluation.score}%` : "—"}</strong><small>{latestEvaluation ? `${latestEvaluation.cases} deterministic cases` : "Rehearsal required"}</small></article>
        <article className={overview.gate.recommendation === "expand" ? "expand" : "hold"}><span>REGIONAL ROLLOUT</span><strong>{overview.gate.recommendation.toUpperCase()}</strong><small>{blockers.length} blockers remain</small></article>
      </section>

      {message && <div className="trust-message" role="status"><span>◎</span>{message}</div>}

      <div className="trust-grid">
        <section className="trust-panel regions-panel">
          <div className="trust-panel-heading"><span>01</span><div><h2>Regional topology</h2><p>Configuration, deployment, and traffic truth</p></div><b>{verifiedRegions} VERIFIED</b></div>
          <div className="region-map">
            <div className="map-lines"><i /><i /><i /></div>
            {overview.regions.map((region, index) => {
              const verification = parseRecord(region.verification);
              return <article className={index === 0 ? "primary" : "secondary"} key={region.$id}><span>{region.code.slice(0,2).toUpperCase()}</span><p><strong>{region.name}</strong><small>{region.provider} · {pretty(region.dataResidency)}</small></p><b className={`trust-state ${region.status}`}>{pretty(region.status)}</b><em>{verification.trafficObserved === true ? `${region.trafficPercent}% traffic` : "No traffic evidence"}</em></article>;
            })}
          </div>
          <div className="trust-note"><span>i</span><p><strong>Region truth</strong><small>These are rollout configurations. Neither cell is called deployed until independent runtime, traffic, and residency evidence is attached.</small></p></div>
        </section>

        <section className="trust-panel providers-panel">
          <div className="trust-panel-heading"><span>02</span><div><h2>Provider mesh</h2><p>Independent AI routing and failover</p></div><b>{overview.providers.length} ROUTES</b></div>
          <div className="provider-mesh">{overview.providers.map((provider) => {
            const configuration = parseRecord(provider.configuration);
            return <article key={provider.$id}><span>{provider.role === "primary" ? "P" : "S"}</span><p><strong>{pretty(provider.provider)}</strong><small>{pretty(provider.role)} · {provider.trafficPercent}% configured traffic</small></p><div><b className={`trust-state ${provider.status}`}>{pretty(provider.status)}</b><small>{configuration.automaticFailover === true ? "Automatic failover" : "No automatic failover"}</small></div></article>;
          })}</div>
          <div className="route-diagram"><span>REQUEST</span><i>→</i><b>POLICY ROUTER</b><i>→</i><span>PRIMARY</span><i className="blocked">×</i><span>SECONDARY</span></div>
          <div className="trust-note amber"><span>!</span><p><strong>Redundancy truth</strong><small>The primary is configured, but live health and automatic failover are unverified. The secondary provider is not configured.</small></p></div>
        </section>

        <section className="trust-panel evaluation-panel">
          <div className="trust-panel-heading"><span>03</span><div><h2>Continuous evaluation</h2><p>Policy boundaries and model canaries</p></div><b>{latestEvaluation ? `${latestEvaluation.passed}/${latestEvaluation.cases} PASS` : "NO RUN"}</b></div>
          <div className="evaluation-score"><span style={{"--eval-score":`${(latestEvaluation?.score || 0) * 3.6}deg`} as React.CSSProperties}><b>{latestEvaluation?.score ?? 0}</b><small>/100</small></span><p><strong>Policy boundary regression</strong><small>{latestEvaluation ? `${latestEvaluation.cases} fixed fixtures · ${latestEvaluation.modelProvider} model provider` : "Run the deterministic suite to establish baseline evidence."}</small></p></div>
          <div className="evaluation-ledger"><span><i className={latestEvaluation ? "pass" : ""}>{latestEvaluation ? "✓" : "—"}</i>Deterministic policy fixtures</span><span><i>×</i>Live-model canary</span><span><i>×</i>Customer data evaluation</span></div>
          <button className="trust-primary-button" disabled={busy === "rehearsal"} onClick={async () => {
            const result = await action("rehearsal", { action: "run_rehearsal" });
            if (result) setMessage("Deterministic evaluation and regional tabletop passed. No model, provider, traffic, DNS, or data restore action occurred.");
          }}>{busy === "rehearsal" ? "Running rehearsal…" : "Run trust rehearsal"}</button>
          <div className="trust-note cyan"><span>~</span><p><strong>Evaluation truth</strong><small>The policy suite uses fixed fixtures with no live model and no customer data. It does not prove live-model quality.</small></p></div>
        </section>

        <section className="trust-panel evidence-panel">
          <div className="trust-panel-heading"><span>04</span><div><h2>Customer &amp; compliance evidence</h2><p>Draft, review, and external submission boundaries</p></div><b>INTERNAL ONLY</b></div>
          <div className="evidence-actions">
            <article><span>◌</span><p><strong>Service health</strong><small>{overview.healthUpdates.length ? `${overview.healthUpdates.length} internal drafts` : "No status drafts"}</small></p><button disabled={busy === "health"} onClick={async () => {
              const result = await action("health", { action: "draft_health_update" });
              if (result) setMessage("Service-health draft created. It is not customer-visible or published.");
            }}>{busy === "health" ? "Drafting…" : "Draft update"}</button></article>
            <article><span>◇</span><p><strong>Compliance automation</strong><small>{overview.compliance.length ? `${overview.compliance.length} readiness previews` : "No evidence preview"}</small></p><button disabled={busy === "compliance"} onClick={async () => {
              const result = await action("compliance", { action: "run_compliance_preview" });
              if (result) setMessage("Compliance preview generated from internal evidence. Nothing was submitted externally.");
            }}>{busy === "compliance" ? "Generating…" : "Generate preview"}</button></article>
          </div>
          <div className="failover-strip"><div><span>TABLETOP</span><strong>{latestFailover ? pretty(latestFailover.status) : "Not run"}</strong><small>{latestFailover ? `${latestFailover.sourceRegion} → ${latestFailover.targetRegion}` : "Regional dependency review"}</small></div><i>→</i><div><span>TRAFFIC SHIFT</span><strong>{latestFailover?.trafficShifted ? "Proven" : "Not performed"}</strong><small>No DNS or customer traffic changed</small></div><i>→</i><div><span>DATA RESTORE</span><strong>{latestFailover?.dataRestored ? "Proven" : "Not performed"}</strong><small>No regional data restored</small></div></div>
          <div className="trust-note amber"><span>!</span><p><strong>Publication truth</strong><small>Drafts and previews remain private. They are not customer communications, auditor attestations, or regulatory submissions.</small></p></div>
        </section>

        <section className="trust-panel rollout-panel">
          <div className="trust-panel-heading"><span>05</span><div><h2>Regional rollout gate</h2><p>Independent evidence before geography</p></div><b>{overview.gate.score}% PROVEN</b></div>
          <div className="rollout-layout"><div className="rollout-score"><span style={{"--rollout-score":`${overview.gate.score * 3.6}deg`} as React.CSSProperties}><b>{overview.gate.score}</b><small>/100</small></span><p><strong>{overview.gate.recommendation === "expand" ? "Regional rollout earned" : "Hold regional rollout"}</strong><small>{evidenceItems.filter(([key]) => gateEvidence[key] === true).length} of {evidenceItems.length} trust controls proven</small></p></div><div className="rollout-checks">{evidenceItems.map(([key,label]) => <span className={gateEvidence[key] === true ? "passed" : "blocked"} key={key}><i>{gateEvidence[key] === true ? "✓" : "×"}</i>{label}</span>)}</div></div>
          {blockers.length > 0 && <details className="trust-blockers"><summary>{blockers.length} rollout blockers</summary>{blockers.map((blocker) => <p key={blocker}>— {blocker}</p>)}</details>}
          <textarea aria-label="Regional rollout rationale" value={rationale} onChange={(event) => setRationale(event.target.value)} />
          <div className="trust-decision-actions"><button className="refresh" disabled={busy === "refresh"} onClick={async () => {
            const result = await action("refresh", { action: "refresh_gate" });
            if (result) setMessage("Regional evidence refreshed from durable trust records.");
          }}>{busy === "refresh" ? "Refreshing…" : "Refresh evidence"}</button><button className="hold" disabled={busy === "decision"} onClick={async () => {
            const result = await action("decision", { action: "record_decision", decision: "hold", rationale });
            if (result) setMessage("Hold decision recorded. No deployment, routing, traffic, or customer rollout changed.");
          }}>{busy === "decision" ? "Recording…" : "Record hold"}</button><button className="expand" disabled={busy === "decision" || overview.gate.recommendation !== "expand"} onClick={async () => {
            const result = await action("decision", { action: "record_decision", decision: "expand", rationale });
            if (result) setMessage("Regional decision recorded. No external deployment was performed.");
          }}>Authorize region</button></div>
        </section>
      </div>
    </div>
  );
}

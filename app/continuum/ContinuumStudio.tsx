"use client";

import { useEffect, useMemo, useState } from "react";
import type { ContinuumOverview } from "../lib/platform/model";

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

function forecastValue(value: number, unit: string) {
  return unit === "basis_points" ? `${(value / 100).toFixed(2)}%` : String(value);
}

const entityMarks: Record<string, string> = {
  platform: "O",
  capability: "◇",
  operating_domain: "◎",
};

export function ContinuumStudio() {
  const [overview, setOverview] = useState<ContinuumOverview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [eventDraft, setEventDraft] = useState({
    entityId: "",
    eventType: "operating_observation",
    summary: "Reliability review identified a recurring approval delay during incident containment.",
    occurredAt: "",
  });
  const [claimDraft, setClaimDraft] = useState({
    entityId: "",
    predicate: "approval_latency_affects_recovery",
    value: "Approval latency may increase recovery time during high-severity incidents.",
  });
  const [scenario, setScenario] = useState({
    title: "Consolidate the incident response workflow",
    changeSet:
      "Route incident triage, cost impact, and security review through one shared workflow while preserving every production and communication approval.",
    horizonDays: 30,
  });
  const [rationale, setRationale] = useState(
    "Hold this claim outside durable organizational memory until independent evidence and a decision-grade twin are available.",
  );

  async function load() {
    const response = await fetch("/api/continuum", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Continuum is unavailable.");
    setOverview(payload);
    setEventDraft((current) => ({
      ...current,
      entityId: current.entityId || payload.entities?.[0]?.$id || "",
    }));
    setClaimDraft((current) => ({
      ...current,
      entityId: current.entityId || payload.entities?.[0]?.$id || "",
    }));
  }

  useEffect(() => {
    let active = true;
    fetch("/api/continuum", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Continuum is unavailable.");
        if (!active) return;
        setOverview(payload);
        setEventDraft((current) => ({
          ...current,
          entityId: payload.entities?.[0]?.$id || "",
        }));
        setClaimDraft((current) => ({
          ...current,
          entityId: payload.entities?.[0]?.$id || "",
        }));
        setStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Continuum is unavailable.");
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
      const response = await fetch("/api/continuum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, workspaceId: overview.workspaceId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Memory action failed.");
      await load();
      return payload;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Memory action failed.");
      return null;
    } finally {
      setBusy("");
    }
  }

  const currentSnapshot = overview?.snapshots[0];
  const currentSimulation = overview?.simulations[0];
  const forecasts = useMemo(
    () =>
      overview && currentSimulation
        ? overview.forecasts.filter((item) => item.simulationId === currentSimulation.$id)
        : [],
    [overview, currentSimulation],
  );
  const currentClaim = overview?.claims[0];
  const promotionChecks = [
    [currentClaim?.status === "verified", "Independently verified claim"],
    [(currentClaim?.confidenceBps || 0) >= 8000, "Confidence ≥ 80%"],
    [parseArray(currentClaim?.evidenceRefs || "[]").length >= 2, "Two independent sources"],
    [currentSnapshot?.status === "decision_grade", "Decision-grade twin"],
    [currentSnapshot?.staleClaimCount === 0, "No stale claims"],
  ] as const;
  const promotionReady = promotionChecks.every(([passed]) => passed);

  if (status === "loading") {
    return (
      <div className="continuum-loading">
        <span>∞</span><strong>Reconstructing organizational time</strong>
        <p>Loading entities, events, claims, twin snapshots, scenarios, and promotion controls.</p>
      </div>
    );
  }
  if (!overview || status === "error") {
    return (
      <div className="continuum-loading error">
        <span>!</span><strong>Continuum unavailable</strong><p>{message}</p>
      </div>
    );
  }

  return (
    <div className="continuum-content">
      <header className="continuum-hero">
        <div>
          <span className="kicker">ORGANIZATIONAL MEMORY &amp; OPERATIONAL DIGITAL TWIN</span>
          <h1>Remember the truth.<br />Rehearse what comes next.</h1>
          <p>Turn evidence into time-aware organizational knowledge, reconstruct the present, and explore future operating changes without rewriting memory or touching production.</p>
        </div>
        <div className="time-lens" aria-hidden="true">
          <i /><i /><i /><span>∞</span>
          <b><small>TWIN COMPLETENESS</small><strong>{Math.round((currentSnapshot?.completenessBps || 0) / 100)}%</strong></b>
        </div>
      </header>

      <section className="continuum-metrics">
        <article><span>CANONICAL ENTITIES</span><strong>{overview.entities.length}</strong><small>{overview.entities.filter((item) => item.verifiedSourceCount > 0).length} observed with verified sources</small></article>
        <article><span>TEMPORAL EVENTS</span><strong>{overview.events.length}</strong><small>{overview.events.filter((item) => item.verified).length} independently verified</small></article>
        <article><span>KNOWLEDGE CLAIMS</span><strong>{overview.claims.length}</strong><small>{overview.claims.filter((item) => item.promoted).length} promoted into memory</small></article>
        <article className={currentSnapshot?.status === "decision_grade" ? "ready" : "hold"}><span>OPERATIONAL TWIN</span><strong>{pretty(currentSnapshot?.status || "not built")}</strong><small>{currentSnapshot?.staleClaimCount || 0} stale claims</small></article>
      </section>

      {message && <div className="continuum-message" role="status"><span>∞</span>{message}</div>}

      <div className="continuum-grid">
        <section className="continuum-panel entity-panel">
          <div className="continuum-heading"><span>01</span><div><h2>Entity constellation</h2><p>Canonical objects, capabilities, and operating domains</p></div><b>IDENTITY LAYER</b></div>
          <div className="entity-constellation">
            {overview.entities.map((entity, index) => (
              <article key={entity.$id} style={{ "--entity-delay": `${index * 70}ms` } as React.CSSProperties}>
                <span>{entityMarks[entity.entityType] || "·"}</span>
                <p><strong>{entity.name}</strong><small>{pretty(entity.entityType)}</small></p>
                <div><i style={{ width: `${entity.confidenceBps / 100}%` }} /><b>{Math.round(entity.confidenceBps / 100)}%</b></div>
                <em>{pretty(entity.status)}</em>
              </article>
            ))}
          </div>
          <div className="continuum-note"><span>i</span><p><strong>Identity truth</strong><small>Seeded entities describe OrkestriaAI configuration. They do not claim live inventory, observed production state, or external verification.</small></p></div>
        </section>

        <section className="continuum-panel timeline-panel">
          <div className="continuum-heading"><span>02</span><div><h2>Temporal event ledger</h2><p>What happened, when, and according to whom</p></div><b>{overview.events.length} EVENTS</b></div>
          <div className="event-composer">
            <select aria-label="Event entity" value={eventDraft.entityId} onChange={(event) => setEventDraft({ ...eventDraft, entityId: event.target.value })}>
              {overview.entities.map((entity) => <option key={entity.$id} value={entity.$id}>{entity.name}</option>)}
            </select>
            <input aria-label="Event type" value={eventDraft.eventType} onChange={(event) => setEventDraft({ ...eventDraft, eventType: event.target.value })} />
            <textarea aria-label="Event summary" value={eventDraft.summary} onChange={(event) => setEventDraft({ ...eventDraft, summary: event.target.value })} />
            <button disabled={busy === "event"} onClick={async () => {
              const result = await action("event", { action: "capture_event", ...eventDraft });
              if (result) setMessage("Event captured as self-reported and unverified. No knowledge claim was promoted.");
            }}>{busy === "event" ? "Capturing…" : "Capture event"}</button>
          </div>
          <div className="event-timeline">
            {overview.events.length === 0 ? <p>No events captured yet. Begin with a factual observation and preserve its source.</p> : overview.events.slice(0, 6).map((event) => (
              <article key={event.$id}><time>{new Date(event.occurredAt).toLocaleDateString()}</time><i /><p><strong>{pretty(event.eventType)}</strong><small>{event.summary}</small></p><b>{event.verified ? "VERIFIED" : "UNVERIFIED"}</b></article>
            ))}
          </div>
        </section>

        <section className="continuum-panel claims-panel">
          <div className="continuum-heading"><span>03</span><div><h2>Knowledge claim studio</h2><p>Separate a useful hypothesis from established truth</p></div><b>PROVENANCE FIRST</b></div>
          <div className="claim-composer">
            <select aria-label="Claim entity" value={claimDraft.entityId} onChange={(event) => setClaimDraft({ ...claimDraft, entityId: event.target.value })}>
              {overview.entities.map((entity) => <option key={entity.$id} value={entity.$id}>{entity.name}</option>)}
            </select>
            <input aria-label="Claim predicate" value={claimDraft.predicate} onChange={(event) => setClaimDraft({ ...claimDraft, predicate: event.target.value })} />
            <textarea aria-label="Claim value" value={claimDraft.value} onChange={(event) => setClaimDraft({ ...claimDraft, value: event.target.value })} />
            <button disabled={busy === "claim"} onClick={async () => {
              const result = await action("claim", { action: "propose_claim", ...claimDraft });
              if (result) setMessage("Knowledge claim proposed at low confidence with no invented evidence.");
            }}>{busy === "claim" ? "Proposing…" : "Propose knowledge claim"}</button>
          </div>
          <div className="claim-stack">
            {overview.claims.slice(0, 4).map((claim) => (
              <article key={claim.$id}><header><span>{pretty(claim.predicate)}</span><b>{Math.round(claim.confidenceBps / 100)}% CONFIDENCE</b></header><p>{claim.value}</p><footer><span>{parseArray(claim.evidenceRefs).length} evidence references</span><strong>{pretty(claim.status)}</strong></footer></article>
            ))}
          </div>
          <div className="continuum-note amber"><span>!</span><p><strong>Claim truth</strong><small>User proposals and workspace policy assertions remain unverified until independent evidence satisfies the promotion gate.</small></p></div>
        </section>

        <section className="continuum-panel twin-panel">
          <div className="continuum-heading"><span>04</span><div><h2>Operational twin</h2><p>A point-in-time reconstruction with uncertainty intact</p></div><b>{pretty(currentSnapshot?.status || "empty")}</b></div>
          <div className="twin-mirror">
            <div><span>OBSERVED STATE</span><strong>{currentSnapshot?.observedEntityCount || 0}</strong><small>entities with verified observation</small><i>NOW</i></div>
            <span className="mirror-axis"><i /><b>∞</b><i /></span>
            <div><span>KNOWN STATE</span><strong>{currentSnapshot?.verifiedClaimCount || 0}</strong><small>verified, current claims</small><i>MEMORY</i></div>
          </div>
          <div className="twin-quality">
            <div><span>Completeness</span><i><b style={{ width: `${(currentSnapshot?.completenessBps || 0) / 100}%` }} /></i><strong>{Math.round((currentSnapshot?.completenessBps || 0) / 100)}%</strong></div>
            <div><span>Stale claims</span><i><b style={{ width: `${Math.min(100, (currentSnapshot?.staleClaimCount || 0) * 20)}%` }} /></i><strong>{currentSnapshot?.staleClaimCount || 0}</strong></div>
          </div>
          <button className="continuum-primary" disabled={busy === "snapshot"} onClick={async () => {
            const result = await action("snapshot", { action: "refresh_twin" });
            if (result) setMessage("Twin snapshot rebuilt from durable workspace records. Missing evidence remains visible.");
          }}>{busy === "snapshot" ? "Reconstructing…" : "Reconstruct twin snapshot"}</button>
          <div className="continuum-note cyan"><span>~</span><p><strong>Twin truth</strong><small>The twin reads durable OrkestriaAI records only. It does not silently query cloud accounts, customer systems, or external telemetry.</small></p></div>
        </section>

        <section className="continuum-panel scenario-panel">
          <div className="continuum-heading"><span>05</span><div><h2>Scenario laboratory</h2><p>Change the future without changing the present</p></div><b>NO EXECUTION</b></div>
          <div className="scenario-form">
            <label>Scenario<input value={scenario.title} onChange={(event) => setScenario({ ...scenario, title: event.target.value })} /></label>
            <label>Proposed operating change<textarea value={scenario.changeSet} onChange={(event) => setScenario({ ...scenario, changeSet: event.target.value })} /></label>
            <label>Horizon<input type="range" min="7" max="180" step="7" value={scenario.horizonDays} onChange={(event) => setScenario({ ...scenario, horizonDays: Number(event.target.value) })} /><span>{scenario.horizonDays} days</span></label>
            <button className="continuum-primary" disabled={!currentSnapshot || busy === "simulation"} onClick={async () => {
              if (!currentSnapshot) return;
              const result = await action("simulation", { action: "run_simulation", snapshotId: currentSnapshot.$id, ...scenario });
              if (result) setMessage("Deterministic advisory scenario complete. No live model, customer data, memory update, or external action was used.");
            }}>{busy === "simulation" ? "Rehearsing future…" : "Run advisory simulation"}</button>
          </div>
          {currentSimulation && <div className="scenario-ticket"><span>SCENARIO</span><p><strong>{currentSimulation.title}</strong><small>{pretty(currentSimulation.status)} · {currentSimulation.horizonDays}-day horizon</small></p><b>{Math.round(currentSimulation.confidenceBps / 100)}% CONFIDENCE</b></div>}
        </section>

        <section className="continuum-panel forecast-panel">
          <div className="continuum-heading"><span>06</span><div><h2>Impact forecast</h2><p>Ranges, assumptions, and uncertainty—not false precision</p></div><b>{forecasts.length} DIMENSIONS</b></div>
          <div className="forecast-ranges">
            {forecasts.length === 0 ? <p>Run an advisory simulation to compare bounded impact ranges.</p> : forecasts.map((forecast) => {
              const span = Math.max(forecast.baselineValue, forecast.projectedValueHigh, 1);
              return <article key={forecast.$id}><header><span>{pretty(forecast.dimension)}</span><b>{pretty(forecast.direction)}</b></header><div><i className="baseline" style={{ left: `${Math.min(94, (forecast.baselineValue / span) * 90)}%` }} /><b style={{ left: `${Math.min(90, (forecast.projectedValueLow / span) * 90)}%`, width: `${Math.max(4, ((forecast.projectedValueHigh - forecast.projectedValueLow) / span) * 90)}%` }} /></div><footer><span>Baseline {forecastValue(forecast.baselineValue, forecast.unit)}</span><strong>{forecastValue(forecast.projectedValueLow, forecast.unit)}–{forecastValue(forecast.projectedValueHigh, forecast.unit)} {forecast.unit === "basis_points" ? "" : pretty(forecast.unit)}</strong></footer></article>;
            })}
          </div>
          <div className="continuum-note violet"><span>◇</span><p><strong>Forecast truth</strong><small>These are deterministic reference ranges. They are not observed production forecasts and cannot authorize an operating change.</small></p></div>
        </section>

        <section className="continuum-panel promotion-panel">
          <div className="continuum-heading"><span>07</span><div><h2>Memory promotion gate</h2><p>Only verified, current knowledge becomes institutional memory</p></div><b>{promotionReady ? "READY" : "HOLD"}</b></div>
          <div className="promotion-layout">
            <div className="promotion-claim"><span>CLAIM UNDER REVIEW</span><strong>{currentClaim ? pretty(currentClaim.predicate) : "No claim selected"}</strong><p>{currentClaim?.value || "Propose a claim to begin evidence review."}</p><small>{currentClaim ? `${Math.round(currentClaim.confidenceBps / 100)}% confidence · ${parseArray(currentClaim.evidenceRefs).length} sources` : "Evidence required"}</small></div>
            <div className="promotion-checks">{promotionChecks.map(([passed, label]) => <span className={passed ? "passed" : "blocked"} key={label}><i>{passed ? "✓" : "×"}</i>{label}</span>)}</div>
          </div>
          <textarea aria-label="Memory promotion rationale" value={rationale} onChange={(event) => setRationale(event.target.value)} />
          <div className="promotion-actions">
            <button className="reject" disabled={!currentClaim || busy === "promotion"} onClick={async () => {
              if (!currentClaim) return;
              const result = await action("promotion", { action: "record_promotion", claimId: currentClaim.$id, decision: "reject", rationale });
              if (result) setMessage("Claim rejection recorded. Organizational memory and production were unchanged.");
            }}>Reject claim</button>
            <button className="hold" disabled={!currentClaim || busy === "promotion"} onClick={async () => {
              if (!currentClaim) return;
              const result = await action("promotion", { action: "record_promotion", claimId: currentClaim.$id, decision: "hold", rationale });
              if (result) setMessage("Promotion hold recorded. Organizational memory and production were unchanged.");
            }}>{busy === "promotion" ? "Recording…" : "Record hold"}</button>
            <button className="promote" disabled={!currentClaim || !promotionReady || busy === "promotion"} onClick={async () => {
              if (!currentClaim) return;
              const result = await action("promotion", { action: "record_promotion", claimId: currentClaim.$id, decision: "promote", rationale });
              if (result) setMessage("Verified claim promoted to organizational memory. No external action was executed.");
            }}>Promote to memory</button>
          </div>
          <div className="continuum-note"><span>∞</span><p><strong>Promotion truth</strong><small>Simulation output never becomes memory automatically. Promotion changes the internal knowledge record only and cannot execute an external action.</small></p></div>
        </section>
      </div>
    </div>
  );
}

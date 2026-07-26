"use client";

import { useEffect, useMemo, useState } from "react";
import type { ScaleOpsOverview } from "../lib/platform/model";

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

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function ScaleOpsCenter() {
  const [overview, setOverview] = useState<ScaleOpsOverview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [budget, setBudget] = useState("1000");
  const [rationale, setRationale] = useState(
    "Hold expansion until external execution, live traffic, provider billing, and customer support are verified.",
  );

  async function load() {
    const response = await fetch("/api/scale", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "ScaleOps is unavailable.");
    setOverview(payload);
    setBudget(String(Math.round(payload.billing.monthlyBudgetCents / 100)));
  }

  useEffect(() => {
    let active = true;
    fetch("/api/scale", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "ScaleOps is unavailable.");
        if (!active) return;
        setOverview(payload);
        setBudget(String(Math.round(payload.billing.monthlyBudgetCents / 100)));
        setStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "ScaleOps is unavailable.");
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
      const response = await fetch("/api/scale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, workspaceId: overview.workspaceId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Scale operation failed.");
      await load();
      return payload;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scale operation failed.");
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
  const latestTelemetry = overview?.telemetry[0];
  const latestIncident = overview?.incidents[0];
  const verifiedExecutors = overview?.executors.filter((item) => item.status === "verified").length || 0;
  const evidenceItems = [
    ["verifiedInternalExecutor", "Internal executor"],
    ["verifiedExternalExecutor", "External executor"],
    ["syntheticSloPassed", "Synthetic SLO"],
    ["livePilotTelemetry", "Live pilot traffic"],
    ["incidentWorkflowRehearsed", "Incident workflow"],
    ["internalBillingGuardrail", "Internal spend limit"],
    ["providerBillingSafeguard", "Provider billing limit"],
    ["supportWorkflowRehearsed", "Support rehearsal"],
    ["realCustomerSupportActive", "Customer support proof"],
  ];

  if (status === "loading") {
    return <div className="scale-loading"><span>↗</span><strong>Calibrating ScaleOps</strong><p>Loading executor attestations, SLO evidence, incident response, billing, support, and expansion gates.</p></div>;
  }
  if (!overview || status === "error") {
    return <div className="scale-loading error"><span>!</span><strong>ScaleOps unavailable</strong><p>{message}</p></div>;
  }

  return (
    <div className="scale-content">
      <header className="scale-hero">
        <div><span className="kicker">GENERAL AVAILABILITY OPERATIONS</span><h1>Scale the proof.<br />Not the promise.</h1><p>Verify every executor, measure the real source of every signal, rehearse failure, cap spend, staff support, and expand only inside an evidence-backed reliability envelope.</p></div>
        <div className="scale-radar" aria-hidden="true"><span>S</span><i /><i /><i /><b><small>SCALE GATE</small><strong>{overview.gate.score}%</strong></b></div>
      </header>

      <section className="scale-metrics">
        <article><span>SYNTHETIC AVAILABILITY</span><strong>{latestTelemetry ? `${(latestTelemetry.availabilityBps / 100).toFixed(2)}%` : "—"}</strong><small>{latestTelemetry ? pretty(latestTelemetry.sourceType) : "Rehearsal required"}</small></article>
        <article><span>VERIFIED EXECUTORS</span><strong>{verifiedExecutors} / {overview.executors.length}</strong><small>Internal and external attestations</small></article>
        <article><span>INCIDENT RESPONSE</span><strong>{latestIncident ? `${latestIncident.mitigationSeconds}s` : "—"}</strong><small>{latestIncident ? "Synthetic mitigation time" : "No exercise evidence"}</small></article>
        <article className={overview.gate.recommendation === "expand" ? "expand" : "hold"}><span>EXPANSION GATE</span><strong>{overview.gate.recommendation.toUpperCase()}</strong><small>{blockers.length} blockers remain</small></article>
      </section>

      {message && <div className="scale-message" role="status"><span>↗</span>{message}</div>}

      <div className="scale-grid">
        <section className="scale-panel executor-panel">
          <div className="scale-panel-heading"><span>01</span><div><h2>Executor registry</h2><p>Artifact and policy attestations</p></div><b>{verifiedExecutors} VERIFIED</b></div>
          <div className="executor-list">{overview.executors.map((executor) => {
            const attestation = parseRecord(executor.attestation);
            return <article key={executor.$id}><span className={executor.status === "verified" ? "verified" : "pending"}>{executor.provider === "orkestria" ? "O" : "E"}</span><p><strong>{executor.name}</strong><small>{executor.provider} · v{executor.version} · {executor.environment}</small></p><div><b className={`scale-state ${executor.status}`}>{pretty(executor.status)}</b><small>{attestation.externalProvider === true ? "External provider path" : "No network egress"}</small></div></article>;
          })}</div>
          <div className="scale-truth"><span>i</span><p><strong>Attestation truth</strong><small>The verified internal executor cannot call an external provider. The external executor remains unusable until its artifact, provider handshake, and network boundary are verified.</small></p></div>
        </section>

        <section className="scale-panel telemetry-panel">
          <div className="scale-panel-heading"><span>02</span><div><h2>SLO rehearsal</h2><p>Source-labelled reliability evidence</p></div><b>{latestTelemetry ? `${latestTelemetry.p95LatencyMs} MS P95` : "NO DATA"}</b></div>
          <div className="slo-visual">
            <div className="slo-chart">{[42,57,38,70,62,84,55,72,46,64,78,52,88,60,74,49].map((height, index) => <i key={index} style={{height:`${height}%`}} />)}</div>
            <div><span>AVAILABILITY</span><strong>{latestTelemetry ? `${(latestTelemetry.availabilityBps / 100).toFixed(2)}%` : "—"}</strong><small>Target 99.90%</small></div>
            <div><span>P95 LATENCY</span><strong>{latestTelemetry ? `${latestTelemetry.p95LatencyMs} ms` : "—"}</strong><small>Target ≤ 500 ms</small></div>
          </div>
          <button className="scale-primary-button" disabled={busy === "rehearsal"} onClick={async () => {
            const result = await action("rehearsal", { action: "run_rehearsal" });
            if (result) setMessage("Synthetic scale and incident rehearsals passed. No pilot traffic, provider request, or customer impact occurred.");
          }}>{busy === "rehearsal" ? "Running rehearsal…" : "Run synthetic scale rehearsal"}</button>
          <div className="scale-truth cyan"><span>~</span><p><strong>Telemetry truth</strong><small>Synthetic results validate the internal control path only. They are never counted as live pilot traffic or customer SLO performance.</small></p></div>
        </section>

        <section className="scale-panel response-panel">
          <div className="scale-panel-heading"><span>03</span><div><h2>Response operations</h2><p>Incident and customer-support workflow</p></div><b>{overview.supportCases.length} CASES</b></div>
          <div className="response-track">
            <article><span>DETECT</span><strong>{latestIncident ? `${latestIncident.detectionSeconds}s` : "—"}</strong><small>Synthetic signal</small></article><i>→</i>
            <article><span>MITIGATE</span><strong>{latestIncident ? `${latestIncident.mitigationSeconds}s` : "—"}</strong><small>No rollback performed</small></article><i>→</i>
            <article><span>SUPPORT</span><strong>{overview.supportCases.filter((item) => item.status === "resolved").length}</strong><small>Internal drills resolved</small></article>
          </div>
          <div className="support-case-list">{overview.supportCases.slice(0,3).map((item) => <article key={item.$id}><span>{item.priority.toUpperCase()}</span><p><strong>{item.subject}</strong><small>{pretty(item.source)} · {pretty(item.status)}</small></p><b>{item.customerNotified ? "Customer notified" : "No customer contact"}</b></article>)}</div>
          <button className="scale-secondary-button" disabled={busy === "support"} onClick={async () => {
            const result = await action("support", { action: "run_support_drill" });
            if (result) setMessage("Support workflow drill resolved inside the control plane. No customer was contacted.");
          }}>{busy === "support" ? "Running drill…" : "Run support workflow drill"}</button>
        </section>

        <section className="scale-panel billing-panel">
          <div className="scale-panel-heading"><span>04</span><div><h2>Spend envelope</h2><p>Budget controls before scale</p></div><b>{pretty(overview.billing.status)}</b></div>
          <div className="budget-dial"><span style={{"--budget-use":"8deg"} as React.CSSProperties}><b>{money(overview.billing.currentUsageCents)}</b><small>of {money(overview.billing.monthlyBudgetCents)}</small></span></div>
          <form className="budget-form" onSubmit={async (event) => {
            event.preventDefault();
            const result = await action("budget", { action: "update_budget", monthlyBudgetDollars: Number(budget) });
            if (result) setMessage("Internal usage budget updated. No provider-side billing limit was changed.");
          }}><label>MONTHLY INTERNAL BUDGET<input aria-label="Monthly internal budget in dollars" type="number" min="10" max="1000000" value={budget} onChange={(event) => setBudget(event.target.value)} /></label><button disabled={busy === "budget"}>{busy === "budget" ? "Saving…" : "Apply guardrail"}</button></form>
          <div className="thresholds"><span><i style={{width:`${overview.billing.warningPercent}%`}} />Warning {overview.billing.warningPercent}%</span><span><i style={{width:`${overview.billing.hardStopPercent}%`}} />Hard stop {overview.billing.hardStopPercent}%</span></div>
          <div className="scale-truth amber"><span>!</span><p><strong>Billing truth</strong><small>This safeguards OrkestriaAI&apos;s internal meter. Provider-side budgets and billing alerts are not connected or enforced.</small></p></div>
        </section>

        <section className="scale-panel gate-panel">
          <div className="scale-panel-heading"><span>05</span><div><h2>SLO expansion gate</h2><p>Evidence before capacity</p></div><b>{overview.gate.score}% PROVEN</b></div>
          <div className="gate-layout">
            <div className="gate-score"><span style={{"--gate-score":`${overview.gate.score * 3.6}deg`} as React.CSSProperties}><b>{overview.gate.score}</b><small>/100</small></span><p><strong>{overview.gate.recommendation === "expand" ? "Expansion evidence complete" : "Hold expansion"}</strong><small>{evidenceItems.filter(([key]) => gateEvidence[key] === true).length} of {evidenceItems.length} scale controls proven</small></p></div>
            <div className="gate-checks">{evidenceItems.map(([key,label]) => <span className={gateEvidence[key] === true ? "passed" : "blocked"} key={key}><i>{gateEvidence[key] === true ? "✓" : "×"}</i>{label}</span>)}</div>
          </div>
          {blockers.length > 0 && <details className="scale-blockers"><summary>{blockers.length} expansion blockers</summary>{blockers.map((blocker) => <p key={blocker}>— {blocker}</p>)}</details>}
          <textarea aria-label="Scale decision rationale" value={rationale} onChange={(event) => setRationale(event.target.value)} />
          <div className="scale-decision-actions"><button className="refresh" disabled={busy === "refresh"} onClick={async () => {
            const result = await action("refresh", { action: "refresh_gate" });
            if (result) setMessage("Scale evidence refreshed from durable operational records.");
          }}>{busy === "refresh" ? "Refreshing…" : "Refresh evidence"}</button><button className="hold" disabled={busy === "decision"} onClick={async () => {
            const result = await action("decision", { action: "record_decision", decision: "hold", rationale });
            if (result) setMessage("Hold decision recorded. No capacity or customer rollout changed.");
          }}>{busy === "decision" ? "Recording…" : "Record hold"}</button><button className="expand" disabled={busy === "decision" || overview.gate.recommendation !== "expand"} onClick={async () => {
            const result = await action("decision", { action: "record_decision", decision: "expand", rationale });
            if (result) setMessage("Expansion decision recorded. No external capacity change was performed.");
          }}>Authorize expansion</button></div>
        </section>
      </div>
    </div>
  );
}

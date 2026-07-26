"use client";

import { useEffect, useMemo, useState } from "react";
import type { CadenceOverview } from "../lib/platform/model";

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

const evidenceItems = [
  ["productionFeedbackVerified", "Production feedback"],
  ["tenantEvaluationPassed", "Tenant evaluation"],
  ["workloadForecastReliable", "Reliable forecast"],
  ["customerOutcomesVerified", "Verified outcomes"],
  ["policyOptimizationValidated", "Validated policy"],
  ["continuousTrustAuthorized", "Continuous Trust"],
] as const;

export function CadenceControlRoom() {
  const [overview, setOverview] = useState<CadenceOverview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [rationale, setRationale] = useState(
    "Keep the workspace assistive until production feedback, tenant evaluation, forecasting, customer outcomes, policy validation, and Continuous Trust evidence are independently verified.",
  );
  const [outcome, setOutcome] = useState({
    title: "Faster incident understanding",
    metric: "Minutes to understand",
    baselineValue: "45",
    currentValue: "18",
    unit: "minutes",
    note: "Workspace-reported draft. Attach source evidence before requesting verification.",
  });

  async function load() {
    const response = await fetch("/api/cadence", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Cadence is unavailable.");
    setOverview(payload);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/cadence", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Cadence is unavailable.");
        if (!active) return;
        setOverview(payload);
        setStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Cadence is unavailable.");
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
      const response = await fetch("/api/cadence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, workspaceId: overview.workspaceId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Intelligence action failed.");
      await load();
      return payload;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Intelligence action failed.");
      return null;
    } finally {
      setBusy("");
    }
  }

  const blockers = useMemo(
    () => (overview ? parseArray(overview.profile.blockers) : []),
    [overview],
  );
  const gateEvidence = useMemo(
    () => (overview ? parseRecord(overview.profile.evidence) : {}),
    [overview],
  );
  const latestFeedback = overview?.feedback[0];
  const latestEvaluation = overview?.evaluations[0];
  const latestForecast = overview?.forecasts[0];
  const latestPolicy = overview?.policies[0];
  const verifiedOutcomes =
    overview?.outcomes.filter(
      (item) => item.verified === 1 && item.externalVerified === 1,
    ).length || 0;

  if (status === "loading") {
    return (
      <div className="cadence-loading">
        <span>∿</span><strong>Finding the signal</strong>
        <p>Loading feedback, tenant evaluation, forecasts, outcome evidence, and autonomy controls.</p>
      </div>
    );
  }
  if (!overview || status === "error") {
    return (
      <div className="cadence-loading error">
        <span>!</span><strong>Cadence unavailable</strong><p>{message}</p>
      </div>
    );
  }

  return (
    <div className="cadence-content">
      <header className="cadence-hero">
        <div>
          <span className="kicker">ADAPTIVE AUTONOMY &amp; CUSTOMER INTELLIGENCE</span>
          <h1>Learn the rhythm.<br />Earn the freedom.</h1>
          <p>Close the loop from production feedback to tenant evaluation, capacity forecasts, verified outcomes, and safer policy—without letting the model promote itself.</p>
        </div>
        <div className="cadence-orbit" aria-hidden="true">
          <i /><i /><i /><span>∿</span>
          <b><small>AUTONOMY PROOF</small><strong>{overview.profile.score}%</strong></b>
        </div>
      </header>

      <section className="cadence-metrics">
        <article><span>CURRENT TIER</span><strong>{pretty(overview.profile.currentTier)}</strong><small>No invisible promotion</small></article>
        <article><span>PRODUCTION SIGNALS</span><strong>{latestFeedback?.productionSignals || 0}</strong><small>{latestFeedback ? pretty(latestFeedback.status) : "No cycle captured"}</small></article>
        <article><span>30-DAY FORECAST</span><strong>{latestForecast?.predictedRuns ?? "—"}</strong><small>{latestForecast ? `${Math.round(latestForecast.confidenceBps / 100)}% confidence` : "Evaluation required"}</small></article>
        <article className={blockers.length ? "hold" : "eligible"}><span>AUTONOMY GATE</span><strong>{blockers.length ? "HOLD" : "REVIEW"}</strong><small>{blockers.length} blockers remain</small></article>
      </section>

      {message && <div className="cadence-message" role="status"><span>∿</span>{message}</div>}

      <div className="cadence-grid">
        <section className="cadence-panel feedback-panel">
          <div className="cadence-panel-heading"><span>01</span><div><h2>Feedback loop</h2><p>Decisions become bounded learning signals</p></div><b>{latestFeedback ? pretty(latestFeedback.status) : "NO CYCLE"}</b></div>
          <div className="feedback-loop">
            <article><span>RUNS</span><strong>{latestFeedback ? parseRecord(latestFeedback.evidence).runRows as number || 0 : 0}</strong><small>Durable workspace records</small></article>
            <i>→</i>
            <article><span>DECISIONS</span><strong>{latestFeedback ? parseRecord(latestFeedback.evidence).approvalDecisions as number || 0 : 0}</strong><small>Approvals and denials</small></article>
            <i>→</i>
            <article><span>VERIFIED</span><strong>{latestFeedback?.verifiedSignals || 0}</strong><small>Production evidence</small></article>
          </div>
          <button className="cadence-primary" disabled={busy === "feedback"} onClick={async () => {
            const result = await action("feedback", { action: "capture_feedback" });
            if (result) setMessage("Feedback cycle captured from durable workspace records. No external analytics or unconsented customer data was ingested.");
          }}>{busy === "feedback" ? "Capturing…" : "Capture feedback cycle"}</button>
          <div className="cadence-note amber"><span>!</span><p><strong>Feedback truth</strong><small>Workspace activity is not called production evidence unless the run explicitly carries verified production metadata.</small></p></div>
        </section>

        <section className="cadence-panel evaluation-panel">
          <div className="cadence-panel-heading"><span>02</span><div><h2>Tenant evaluation</h2><p>One workspace, its policy boundary</p></div><b>{latestEvaluation ? `${latestEvaluation.score}%` : "NOT RUN"}</b></div>
          <div className="tenant-score">
            <span style={{ "--tenant-score": `${(latestEvaluation?.score || 0) * 3.6}deg` } as React.CSSProperties}><b>{latestEvaluation?.score || 0}</b><small>/100</small></span>
            <p><strong>{latestEvaluation ? pretty(latestEvaluation.suite) : "Establish a baseline"}</strong><small>{latestEvaluation ? `${latestEvaluation.cases} fixed cases · ${pretty(latestEvaluation.scope)}` : "Run the tenant-safe deterministic suite."}</small></p>
          </div>
          <div className="tenant-ledger">
            <span><i className={latestEvaluation ? "pass" : ""}>{latestEvaluation ? "✓" : "—"}</i>Policy boundary fixtures</span>
            <span><i>×</i>Live-model production quality</span>
            <span><i>×</i>Customer-data evaluation</span>
          </div>
          <button className="cadence-primary" disabled={busy === "evaluation"} onClick={async () => {
            const result = await action("evaluation", { action: "run_evaluation" });
            if (result) setMessage("Tenant baseline and workload forecast created. The suite used deterministic fixtures—no live model or customer data.");
          }}>{busy === "evaluation" ? "Evaluating…" : "Run tenant baseline"}</button>
        </section>

        <section className="cadence-panel autonomy-panel">
          <div className="cadence-panel-heading"><span>03</span><div><h2>Autonomy ladder</h2><p>Capability expands only after proof</p></div><b>{pretty(overview.profile.currentTier)}</b></div>
          <div className="autonomy-ladder">
            {[
              ["01", "Assistive", "Draft, analyze, recommend", true],
              ["02", "Bounded", "Low-risk actions inside policy", overview.profile.currentTier === "bounded"],
              ["03", "Supervised", "Broader execution with review", false],
              ["04", "Trusted", "Earned workspace-specific autonomy", false],
            ].map(([index, title, copy, active]) => (
              <article className={active ? "active" : "locked"} key={String(index)}>
                <span>{index}</span><p><strong>{title}</strong><small>{copy}</small></p><b>{active ? "ACTIVE" : "LOCKED"}</b>
              </article>
            ))}
          </div>
          <div className="cadence-note cyan"><span>i</span><p><strong>Promotion truth</strong><small>Models cannot change tiers. Owners can promote only after every deterministic evidence gate passes.</small></p></div>
        </section>

        <section className="cadence-panel forecast-panel">
          <div className="cadence-panel-heading"><span>04</span><div><h2>Workload forecast</h2><p>Plan capacity from observed demand</p></div><b>30 DAYS</b></div>
          <div className="forecast-bars">
            {[38, 52, 44, 67, 58, 74, 63, 82, 70, 88, 76, 92].map((height, index) => <i key={index} style={{ height: `${latestForecast ? height : Math.max(8, height / 4)}%` }} />)}
          </div>
          <div className="forecast-summary">
            <p><span>Observed runs</span><strong>{latestForecast?.observedRuns || 0}</strong></p>
            <p><span>Predicted runs</span><strong>{latestForecast?.predictedRuns || 0}</strong></p>
            <p><span>Peak concurrent</span><strong>{latestForecast?.peakConcurrent || "—"}</strong></p>
            <p><span>Data quality</span><strong>{latestForecast ? pretty(latestForecast.dataQuality) : "No forecast"}</strong></p>
          </div>
          <div className="cadence-note"><span>~</span><p><strong>Forecast truth</strong><small>No provider capacity is reserved. Low-history forecasts remain explicitly low confidence.</small></p></div>
        </section>

        <section className="cadence-panel outcomes-panel">
          <div className="cadence-panel-heading"><span>05</span><div><h2>Customer outcomes</h2><p>Separate useful claims from verified proof</p></div><b>{verifiedOutcomes} VERIFIED</b></div>
          <div className="outcome-form">
            <input aria-label="Outcome title" value={outcome.title} onChange={(event) => setOutcome({ ...outcome, title: event.target.value })} />
            <input aria-label="Outcome metric" value={outcome.metric} onChange={(event) => setOutcome({ ...outcome, metric: event.target.value })} />
            <div><input aria-label="Baseline value" inputMode="numeric" value={outcome.baselineValue} onChange={(event) => setOutcome({ ...outcome, baselineValue: event.target.value })} /><span>→</span><input aria-label="Current value" inputMode="numeric" value={outcome.currentValue} onChange={(event) => setOutcome({ ...outcome, currentValue: event.target.value })} /><input aria-label="Outcome unit" value={outcome.unit} onChange={(event) => setOutcome({ ...outcome, unit: event.target.value })} /></div>
            <textarea aria-label="Outcome evidence note" value={outcome.note} onChange={(event) => setOutcome({ ...outcome, note: event.target.value })} />
            <button disabled={busy === "outcome"} onClick={async () => {
              const result = await action("outcome", {
                action: "record_outcome",
                ...outcome,
                baselineValue: Number(outcome.baselineValue),
                currentValue: Number(outcome.currentValue),
              });
              if (result) setMessage("Outcome saved as a self-reported, unverified draft. No verification claim was created.");
            }}>{busy === "outcome" ? "Recording…" : "Record outcome draft"}</button>
          </div>
          <div className="outcome-list">
            {overview.outcomes.length === 0 ? <p>No outcome drafts yet.</p> : overview.outcomes.slice(0, 3).map((item) => (
              <article key={item.$id}><span>{item.verified ? "✓" : "○"}</span><p><strong>{item.title}</strong><small>{item.baselineValue} → {item.currentValue} {item.unit}</small></p><b>{pretty(item.status)}</b></article>
            ))}
          </div>
        </section>

        <section className="cadence-panel policy-panel">
          <div className="cadence-panel-heading"><span>06</span><div><h2>Policy optimizer</h2><p>Recommend, validate, then review</p></div><b>DRAFT ONLY</b></div>
          <div className="policy-proposal">
            <span>IF</span><p><strong>Read-only enrichment</strong><small>Inside an approved connection and workspace boundary</small></p>
            <i>→</i><span>THEN</span><p><strong>Reduce redundant review</strong><small>Preserve every consequential-action approval gate</small></p>
          </div>
          {latestPolicy && <div className="policy-status"><span>Latest proposal</span><strong>{latestPolicy.title}</strong><small>{Math.round(latestPolicy.confidenceBps / 100)}% confidence · {pretty(latestPolicy.status)}</small></div>}
          <button className="cadence-primary" disabled={busy === "policy"} onClick={async () => {
            const result = await action("policy", { action: "draft_policy" });
            if (result) setMessage("A conservative policy proposal was saved for validation. No workspace policy was changed.");
          }}>{busy === "policy" ? "Drafting…" : "Draft policy proposal"}</button>
          <div className="cadence-note violet"><span>◇</span><p><strong>Optimization truth</strong><small>Recommendations are never auto-applied. Production experiments and rollback evidence are required before validation.</small></p></div>
        </section>

        <section className="cadence-panel cadence-gate-panel">
          <div className="cadence-panel-heading"><span>07</span><div><h2>Autonomy evidence gate</h2><p>Tenant-specific proof before expanded execution</p></div><b>{overview.profile.score}% PROVEN</b></div>
          <div className="cadence-gate-layout">
            <div className="cadence-gate-score"><span style={{ "--cadence-score": `${overview.profile.score * 3.6}deg` } as React.CSSProperties}><b>{overview.profile.score}</b><small>/100</small></span><p><strong>{blockers.length ? "Keep autonomy assistive" : "Bounded tier ready for review"}</strong><small>{evidenceItems.filter(([key]) => gateEvidence[key] === true).length} of {evidenceItems.length} evidence controls proven</small></p></div>
            <div className="cadence-gate-checks">{evidenceItems.map(([key, label]) => <span className={gateEvidence[key] === true ? "passed" : "blocked"} key={key}><i>{gateEvidence[key] === true ? "✓" : "×"}</i>{label}</span>)}</div>
          </div>
          {blockers.length > 0 && <details className="cadence-blockers"><summary>{blockers.length} autonomy blockers</summary>{blockers.map((blocker) => <p key={blocker}>— {blocker}</p>)}</details>}
          <textarea aria-label="Autonomy decision rationale" value={rationale} onChange={(event) => setRationale(event.target.value)} />
          <div className="cadence-decision-actions">
            <button className="refresh" disabled={busy === "refresh"} onClick={async () => {
              const result = await action("refresh", { action: "refresh_profile" });
              if (result) setMessage("Autonomy evidence refreshed from durable workspace records.");
            }}>{busy === "refresh" ? "Refreshing…" : "Refresh evidence"}</button>
            <button className="hold" disabled={busy === "decision"} onClick={async () => {
              const result = await action("decision", { action: "record_decision", decision: "hold", rationale });
              if (result) setMessage("Assistive-tier hold recorded. No execution boundary changed.");
            }}>{busy === "decision" ? "Recording…" : "Record hold"}</button>
            <button className="promote" disabled={busy === "decision" || blockers.length > 0} onClick={async () => {
              const result = await action("decision", { action: "record_decision", decision: "promote", rationale });
              if (result) setMessage("Bounded autonomy tier activated inside the proven workspace policy.");
            }}>Promote to bounded</button>
          </div>
        </section>
      </div>
    </div>
  );
}

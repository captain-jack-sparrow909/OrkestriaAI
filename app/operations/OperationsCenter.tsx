"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { OperationsOverview, ValidationRunRecord } from "../lib/platform/model";

function pretty(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseChecks(validation?: ValidationRunRecord) {
  if (!validation) return [];
  try {
    const parsed = JSON.parse(validation.checks);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function OperationsCenter() {
  const [overview, setOverview] = useState<OperationsOverview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/operations", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Production operations unavailable.");
    setOverview(payload);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/operations", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Production operations unavailable.");
        if (!active) return;
        setOverview(payload);
        setStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Production operations unavailable.");
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
      const response = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, workspaceId: overview.workspaceId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Operations action failed.");
      await load();
      return payload;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operations action failed.");
      return null;
    } finally {
      setBusy("");
    }
  }

  const pilotChecklist = useMemo(
    () => overview ? parseObject(overview.pilot.checklist) as Record<string, boolean> : {},
    [overview],
  );
  const pilotItems = [
    ["identityOwnerConfirmed", "Identity owner confirmed"],
    ["approvalPolicyReviewed", "Approval policy reviewed"],
    ["providerAuthorized", "Provider authorization completed"],
    ["workerRehearsalPassed", "Durable worker rehearsal passed"],
    ["recoveryTabletopCompleted", "Recovery tabletop completed"],
    ["cohortInvited", "Pilot cohort invitation recorded"],
  ];
  const completedPilotItems = pilotItems.filter(([key]) => pilotChecklist[key]).length;
  const readiness = Math.round((completedPilotItems / pilotItems.length) * 100);
  const latestValidation = overview?.validations[0];
  const latestChecks = parseChecks(latestValidation);
  const authorized = overview?.authorizations.filter((item) => item.state === "authorized").length || 0;
  const executionUnits = overview?.usage
    .filter((item) => item.meter === "worker_execution")
    .reduce((total, item) => total + item.quantity, 0) || 0;

  if (status === "loading") {
    return <div className="operations-loading"><span>◉</span><strong>Calibrating production controls</strong><p>Loading authorization truth, queue leases, usage, recovery evidence, and pilot readiness.</p></div>;
  }
  if (!overview || status === "error") {
    return <div className="operations-loading error"><span>!</span><strong>Production operations unavailable</strong><p>{message}</p></div>;
  }

  return (
    <div className="operations-content">
      <header className="operations-hero">
        <div><span className="kicker">PRODUCTION OPERATIONS</span><h1>Practice the failure.<br />Measure the truth.</h1><p>Provider access, durable workers, usage, recovery evidence, release validation, and pilot readiness—operated from one accountable control plane.</p></div>
        <div className="operations-console"><span className="ops-core">O</span><i /><i /><i /><b><span>CONTROL PLANE</span><strong>Nominal</strong></b></div>
      </header>

      <section className="operations-metrics">
        <article><span>PROVIDER AUTH</span><strong>{authorized} / {overview.installations.length}</strong><small>{overview.authorizations.length} handshakes prepared</small><i className="ops-metric-icon amber">⌁</i></article>
        <article><span>WORKER VALIDATION</span><strong>{latestValidation ? `${latestValidation.score}%` : "—"}</strong><small>{latestValidation ? pretty(latestValidation.status) : "Rehearsal required"}</small><i className="ops-metric-icon green">✓</i></article>
        <article><span>METERED EXECUTIONS</span><strong>{executionUnits}</strong><small>Current billing period</small><i className="ops-metric-icon blue">▥</i></article>
        <article className="readiness-metric"><span>PILOT READINESS</span><strong>{readiness}%</strong><small>{completedPilotItems} of {pilotItems.length} controls complete</small><i className="readiness-dial" style={{"--readiness": `${readiness * 3.6}deg`} as React.CSSProperties} /></article>
      </section>
      {message && <div className="operations-message" role="status"><span>◉</span>{message}</div>}

      <div className="operations-grid">
        <section className="operations-panel authorization-panel">
          <div className="operations-panel-heading"><span>01</span><div><h2>Provider authorization</h2><p>Credentials never live in workspace records</p></div><b>{authorized} AUTHORIZED</b></div>
          {overview.installations.length ? <div className="authorization-ledger">{overview.installations.map((installation) => {
            const authorization = overview.authorizations.find((item) => item.installationId === installation.$id);
            return <article key={installation.$id}><span className="provider-mark">{installation.connectorSlug.charAt(0).toUpperCase()}</span><p><strong>{pretty(installation.connectorSlug)}</strong><small>{authorization ? authorization.authType : "Authorization not prepared"}</small></p><span className={`authorization-state ${authorization?.state || "draft"}`}><i />{pretty(authorization?.state || installation.status)}</span>{authorization ? <b>Credentials absent</b> : <button disabled={busy === `auth-${installation.$id}`} onClick={async () => {
              const result = await action(`auth-${installation.$id}`, { action: "prepare_authorization", installationId: installation.$id });
              if (result) setMessage("Authorization handshake prepared. No credentials were stored and no provider access was granted.");
            }}>{busy === `auth-${installation.$id}` ? "Preparing…" : "Prepare handshake"}</button>}</article>;
          })}</div> : <div className="operations-empty"><span>⌁</span><p><strong>No connector drafts installed</strong><small>Add a governed connector before preparing provider authorization.</small></p><Link href="/ecosystem">Open Ecosystem Exchange →</Link></div>}
          <div className="credential-truth"><span>i</span><p><strong>Authorization truth</strong><small>“Prepared” means scopes and auth type are ready for review. Only a verified external handshake may set a provider to authorized.</small></p></div>
        </section>

        <section className="operations-panel worker-panel">
          <div className="operations-panel-heading"><span>02</span><div><h2>Durable worker</h2><p>Lease, execute, meter, and prove idempotency</p></div><b>APPWRITE FUNCTION</b></div>
          <div className="worker-visual"><div className="queue-line"><span>QUEUED</span><i>→</i><span>LEASED</span><i>→</i><span>RUNNING</span><i>→</i><span>SUCCEEDED</span></div><div className="worker-machine"><span>W</span><i /><i /><i /></div><p><strong>Reliability rehearsal</strong><small>No external connector action is executed.</small></p></div>
          <button className="worker-rehearsal-button" disabled={busy === "worker"} onClick={async () => {
            const result = await action("worker", { action: "run_worker_rehearsal" });
            if (result) setMessage("Worker rehearsal passed with a durable lease, usage record, validation evidence, and audit event.");
          }}>{busy === "worker" ? "Leasing durable job…" : "Run worker rehearsal"} <span>→</span></button>
          <div className="job-ledger">{overview.jobs.filter((job) => job.type === "reliability.rehearsal").slice(0, 4).map((job) => <article key={job.$id}><span className={`job-state ${job.state}`}>{job.state}</span><p><strong>Worker reliability</strong><small>{job.$id.slice(0, 12)} · attempt {job.attempts}/{job.maxAttempts}</small></p><b>{new Date(job.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</b></article>)}</div>
        </section>

        <section className="operations-panel validation-panel">
          <div className="operations-panel-heading"><span>03</span><div><h2>Release validation</h2><p>Evidence from the latest worker rehearsal</p></div><b>{latestValidation ? `${latestValidation.score}%` : "PENDING"}</b></div>
          {latestChecks.length ? <div className="validation-checks">{latestChecks.map((check: { key: string; title: string; status: string; evidence: string }) => <article key={check.key}><span>✓</span><p><strong>{check.title}</strong><small>{check.evidence}</small></p><b>{check.status}</b></article>)}</div> : <div className="operations-empty compact"><span>□</span><p><strong>No validation evidence yet</strong><small>Run the durable worker rehearsal to generate release checks.</small></p></div>}
          <div className="usage-strip"><div><span>WORKER EXECUTIONS</span><strong>{executionUnits}</strong></div><div><span>RECOVERY DRILLS</span><strong>{overview.usage.filter((item) => item.meter === "recovery_drill").length}</strong></div><div><span>RECORDED COST</span><strong>${(overview.usage.reduce((total, item) => total + item.costCents, 0) / 100).toFixed(2)}</strong></div></div>
        </section>

        <section className="operations-panel recovery-panel">
          <div className="operations-panel-heading"><span>04</span><div><h2>Recovery readiness</h2><p>Tabletop first; restored data must be proven separately</p></div><b>RPO 60M · RTO 4H</b></div>
          <div className="recovery-map"><span className="recovery-source">PRIMARY</span><i>········→</i><span className="recovery-target">RECOVERY</span><b>TABLETOP PATH</b></div>
          <button disabled={busy === "recovery"} onClick={async () => {
            const result = await action("recovery", { action: "run_recovery_tabletop" });
            if (result) setMessage("Recovery tabletop recorded. No data restoration occurred, and RPO/RTO targets remain unverified by restore.");
          }}>{busy === "recovery" ? "Recording evidence…" : "Run recovery tabletop"} <span>↻</span></button>
          {overview.drills[0] ? <div className="recovery-result"><span>✓</span><p><strong>{pretty(overview.drills[0].status)}</strong><small>{overview.drills[0].scope}</small></p><b>No data restored</b></div> : <div className="recovery-result pending"><span>!</span><p><strong>Tabletop not completed</strong><small>Review schema, storage, functions, and release provenance.</small></p></div>}
        </section>

        <section className="operations-panel pilot-panel">
          <div className="operations-panel-heading"><span>05</span><div><h2>Controlled pilot</h2><p>{overview.pilot.name} · {overview.pilot.targetUsers} target users</p></div><b>{pretty(overview.pilot.stage)}</b></div>
          <div className="pilot-progress"><div><span style={{width: `${readiness}%`}} /></div><p><strong>{readiness}% ready</strong><small>{completedPilotItems} controls complete · {pilotItems.length - completedPilotItems} remaining</small></p></div>
          <div className="pilot-checklist">{pilotItems.map(([key, label]) => <article className={pilotChecklist[key] ? "complete" : ""} key={key}><span>{pilotChecklist[key] ? "✓" : "○"}</span><strong>{label}</strong>{key === "providerAuthorized" && !pilotChecklist[key] ? <small>Requires real provider handshake</small> : null}</article>)}</div>
          <button className="pilot-action" disabled={Boolean(pilotChecklist.cohortInvited) || busy === "pilot"} onClick={async () => {
            const result = await action("pilot", { action: "mark_cohort_invited" });
            if (result) setMessage("Pilot cohort invitation recorded in the audit trail. No external invitations were sent.");
          }}>{pilotChecklist.cohortInvited ? "Cohort invitation recorded" : busy === "pilot" ? "Recording…" : "Record cohort invitation"} <span>{pilotChecklist.cohortInvited ? "✓" : "→"}</span></button>
        </section>
      </div>
    </div>
  );
}

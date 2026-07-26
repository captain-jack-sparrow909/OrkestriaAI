"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  LaunchroomOverview,
  PilotExerciseRecord,
} from "../lib/platform/model";

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

function exerciseTruth(exercise?: PilotExerciseRecord) {
  if (!exercise) return "No exercise recorded";
  if (exercise.externalActionExecuted === 1) return "External action evidenced";
  if (exercise.state === "succeeded") return "Internal read-only evidence";
  return "No external action executed";
}

export function Launchroom() {
  const [overview, setOverview] = useState<LaunchroomOverview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [participantEmail, setParticipantEmail] = useState("");
  const [backupEmail, setBackupEmail] = useState("");
  const [rationale, setRationale] = useState(
    "Hold launch until every externally dependent control has verifiable evidence.",
  );

  async function load() {
    const response = await fetch("/api/pilot", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Launchroom is unavailable.");
    setOverview(payload);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/pilot", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Launchroom is unavailable.");
        if (!active) return;
        setOverview(payload);
        setStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Launchroom is unavailable.");
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
      const response = await fetch("/api/pilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, workspaceId: overview.workspaceId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Pilot action failed.");
      await load();
      return payload;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pilot action failed.");
      return null;
    } finally {
      setBusy("");
    }
  }

  const blockers = useMemo(
    () => overview ? parseArray(overview.decision.blockers) : [],
    [overview],
  );
  const decisionEvidence = useMemo(
    () => overview ? parseRecord(overview.decision.evidence) : {},
    [overview],
  );
  const evidenceItems = [
    ["providerAuthorized", "Provider authorization"],
    ["activePilotMember", "Member consent"],
    ["externalCohortContacted", "External cohort evidence"],
    ["boundedExercisePassed", "Bounded exercise"],
    ["externalProductionActionProven", "External production proof"],
    ["supportCoverageReady", "Support coverage"],
    ["workerValidationPassed", "Worker validation"],
    ["recoveryRestoreProven", "Recovery restore proof"],
  ];
  const passedEvidence = evidenceItems.filter(([key]) => decisionEvidence[key] === true).length;
  const latestExercise = overview?.exercises[0];
  const externalMembers = overview?.members.filter((member) => member.role === "participant") || [];
  const verifiedProviders = overview?.authorizations.filter((auth) => auth.state === "authorized").length || 0;

  if (status === "loading") {
    return (
      <div className="launchroom-loading">
        <span>✦</span><strong>Opening the Launchroom</strong>
        <p>Assembling pilot membership, action boundaries, support coverage, and launch evidence.</p>
      </div>
    );
  }
  if (!overview || status === "error") {
    return (
      <div className="launchroom-loading error">
        <span>!</span><strong>Launchroom unavailable</strong><p>{message}</p>
      </div>
    );
  }

  return (
    <div className="launchroom-content">
      <header className="launchroom-hero">
        <div>
          <span className="kicker">PILOT &amp; GA COMMAND CENTER</span>
          <h1>Earn the launch.<br />Don&apos;t announce it.</h1>
          <p>Operate the first cohort, constrain every production action, staff the response path, and make the launch decision from evidence—not optimism.</p>
        </div>
        <div className="launch-orbit" aria-hidden="true">
          <span>GO</span><i /><i /><i /><b>{overview.decision.score}%</b>
        </div>
      </header>

      <section className="launchroom-metrics">
        <article><span>PILOT COHORT</span><strong>{overview.members.length}</strong><small>{externalMembers.length} external participants drafted</small></article>
        <article><span>VERIFIED PROVIDERS</span><strong>{verifiedProviders}</strong><small>{overview.authorizations.length} authorization records</small></article>
        <article><span>SAFE EXERCISES</span><strong>{overview.exercises.filter((item) => item.state === "succeeded").length}</strong><small>{exerciseTruth(latestExercise)}</small></article>
        <article className={overview.decision.recommendation === "ready" ? "ready" : "hold"}><span>LAUNCH RECOMMENDATION</span><strong>{overview.decision.recommendation.toUpperCase()}</strong><small>{blockers.length} blockers remain</small></article>
      </section>

      {message && <div className="launchroom-message" role="status"><span>✦</span>{message}</div>}

      <div className="launchroom-grid">
        <section className="launchroom-panel cohort-panel">
          <div className="launchroom-panel-heading"><span>01</span><div><h2>Pilot cohort</h2><p>Membership and consent truth</p></div><b>{overview.pilot.status.toUpperCase()}</b></div>
          <div className="cohort-list">
            {overview.members.map((member) => (
              <article key={member.$id}>
                <span>{member.email.slice(0, 1).toUpperCase()}</span>
                <p><strong>{member.email}</strong><small>{pretty(member.role)} · {pretty(member.consentState)}</small></p>
                <b className={`launch-state ${member.status}`}>{pretty(member.invitationState)}</b>
              </article>
            ))}
          </div>
          <form className="launch-inline-form" onSubmit={async (event) => {
            event.preventDefault();
            const result = await action("participant", { action: "add_participant", participantEmail });
            if (result) {
              setParticipantEmail("");
              setMessage("Participant draft saved. No invitation was sent and consent remains unrecorded.");
            }
          }}>
            <input aria-label="Pilot participant email" type="email" required placeholder="participant@company.com" value={participantEmail} onChange={(event) => setParticipantEmail(event.target.value)} />
            <button disabled={busy === "participant"}>{busy === "participant" ? "Saving…" : "Draft participant"}</button>
          </form>
          <div className="truth-note"><span>i</span><p><strong>Invitation truth</strong><small>A drafted participant is not contacted, invited, accepted, or consented.</small></p></div>
        </section>

        <section className="launchroom-panel scope-panel">
          <div className="launchroom-panel-heading"><span>02</span><div><h2>Production action envelope</h2><p>Allowlisted scope, risk, and side-effect truth</p></div><b>{overview.scopes.length} SCOPES</b></div>
          <div className="scope-list">
            {overview.scopes.map((scope) => {
              const last = overview.exercises.find((exercise) => exercise.scopeId === scope.$id);
              return (
                <article key={scope.$id}>
                  <div><span className={`scope-risk ${scope.risk}`}>{scope.risk.toUpperCase()}</span><p><strong>{scope.name}</strong><small>{scope.action} · {scope.environment}</small></p></div>
                  <div><b className={`launch-state ${last?.state || scope.status}`}>{pretty(last?.state || scope.status)}</b><small>{last ? exerciseTruth(last) : scope.approvalRequired ? "Approval required" : "Read-only scope"}</small></div>
                  <button disabled={busy === `scope-${scope.$id}`} onClick={async () => {
                    const result = await action(`scope-${scope.$id}`, { action: "run_exercise", scopeId: scope.$id });
                    if (result) {
                      const exercise = result.exercise as PilotExerciseRecord;
                      setMessage(exercise.state === "succeeded"
                        ? "Read-only internal exercise passed. No external provider action was executed."
                        : `${pretty(exercise.state)}. No external provider action was executed.`);
                    }
                  }}>{busy === `scope-${scope.$id}` ? "Evaluating…" : "Exercise scope"}</button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="launchroom-panel support-panel">
          <div className="launchroom-panel-heading"><span>03</span><div><h2>Support rotation</h2><p>Ownership before customer impact</p></div><b>{pretty(overview.rotation.status)}</b></div>
          <div className="support-coverage">
            <div><span>PRIMARY</span><strong>{overview.rotation.primaryEmail}</strong><small>{overview.rotation.timezone} · {pretty(overview.rotation.coverage)}</small></div>
            <i>→</i>
            <div className={!overview.rotation.secondaryEmail ? "unassigned" : ""}><span>BACKUP</span><strong>{overview.rotation.secondaryEmail || "Unassigned"}</strong><small>{overview.rotation.secondaryEmail ? "Acknowledgement pending" : "Coverage gap"}</small></div>
          </div>
          <form className="launch-inline-form" onSubmit={async (event) => {
            event.preventDefault();
            const result = await action("backup", { action: "propose_support_backup", backupEmail });
            if (result) {
              setBackupEmail("");
              setMessage("Backup proposed. No notification was sent and coverage remains unacknowledged.");
            }
          }}>
            <input aria-label="Support backup email" type="email" required placeholder="backup@company.com" value={backupEmail} onChange={(event) => setBackupEmail(event.target.value)} />
            <button disabled={busy === "backup"}>{busy === "backup" ? "Saving…" : "Propose backup"}</button>
          </form>
          <div className="truth-note amber"><span>!</span><p><strong>Coverage truth</strong><small>A backup email alone does not create an acknowledged support rotation.</small></p></div>
        </section>

        <section className="launchroom-panel decision-panel">
          <div className="launchroom-panel-heading"><span>04</span><div><h2>Launch decision</h2><p>Evidence-weighted and owner recorded</p></div><b>{overview.decision.score}% EVIDENCE</b></div>
          <div className="launch-evidence">
            <div className="launch-score"><span style={{"--launch-score": `${overview.decision.score * 3.6}deg`} as React.CSSProperties}><b>{overview.decision.score}</b><small>/100</small></span><p><strong>{overview.decision.recommendation === "ready" ? "Evidence supports launch" : "Hold is recommended"}</strong><small>{passedEvidence} of {evidenceItems.length} launch controls proven</small></p></div>
            <div className="evidence-checks">
              {evidenceItems.map(([key, label]) => <span className={decisionEvidence[key] === true ? "passed" : "blocked"} key={key}><i>{decisionEvidence[key] === true ? "✓" : "×"}</i>{label}</span>)}
            </div>
          </div>
          {blockers.length > 0 && <details className="launch-blockers"><summary>{blockers.length} launch blockers</summary>{blockers.map((blocker) => <p key={blocker}>— {blocker}</p>)}</details>}
          <textarea aria-label="Launch decision rationale" value={rationale} onChange={(event) => setRationale(event.target.value)} />
          <div className="decision-actions">
            <button className="refresh-button" disabled={busy === "refresh"} onClick={async () => {
              const result = await action("refresh", { action: "refresh_assessment" });
              if (result) setMessage("Launch evidence refreshed from durable workspace records.");
            }}>{busy === "refresh" ? "Refreshing…" : "Refresh evidence"}</button>
            <button className="hold-button" disabled={busy === "decision"} onClick={async () => {
              const result = await action("decision", { action: "record_decision", decision: "hold", rationale });
              if (result) setMessage("Hold decision recorded with current evidence and blockers.");
            }}>{busy === "decision" ? "Recording…" : "Record hold"}</button>
            <button className="go-button" disabled={busy === "decision" || overview.decision.recommendation !== "ready"} onClick={async () => {
              const result = await action("decision", { action: "record_decision", decision: "go", rationale });
              if (result) setMessage("Go decision recorded. No external launch action was performed.");
            }}>Record go</button>
          </div>
        </section>
      </div>
    </div>
  );
}

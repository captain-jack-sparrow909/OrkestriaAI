"use client";

import { useEffect, useMemo, useState } from "react";
import type { EnsembleOverview } from "../lib/platform/model";

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

const agentColor: Record<string, string> = {
  vela: "violet",
  loom: "lime",
  tempo: "orange",
  helio: "cyan",
  aegis: "pink",
};

const evidenceItems = [
  ["teamBounded", "Bounded team"],
  ["allSpecialistsContributed", "Five contributions"],
  ["handoffsExternallyVerified", "Verified handoffs"],
  ["evidenceComplete", "Conflict-free evidence"],
  ["briefReviewed", "Brief reviewed"],
  ["downstreamApprovalsReady", "Approvals assembled"],
] as const;

export function EnsembleCouncil() {
  const [overview, setOverview] = useState<EnsembleOverview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [mission, setMission] = useState({
    title: "Protect margin without increasing customer risk",
    objective:
      "Investigate the reliability, workflow, cloud-cost, security, and customer-communication implications of the proposed operating change. Produce one evidence-backed executive recommendation without executing any external action.",
  });
  const [rationale, setRationale] = useState(
    "Hold the plan until specialist handoffs use verified evidence, conflicts are resolved, the brief is reviewed, and every downstream approval is assembled.",
  );

  async function load() {
    const response = await fetch("/api/ensemble", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Ensemble is unavailable.");
    setOverview(payload);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/ensemble", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Ensemble is unavailable.");
        if (!active) return;
        setOverview(payload);
        setStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Ensemble is unavailable.");
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
      const response = await fetch("/api/ensemble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, workspaceId: overview.workspaceId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Team action failed.");
      await load();
      return payload;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Team action failed.");
      return null;
    } finally {
      setBusy("");
    }
  }

  const currentCase = overview?.cases[0];
  const caseHandoffs = useMemo(
    () => overview && currentCase ? overview.handoffs.filter((item) => item.caseId === currentCase.$id) : [],
    [overview, currentCase],
  );
  const currentSynthesis = overview?.syntheses.find((item) => item.caseId === currentCase?.$id);
  const currentBrief = overview?.briefs.find((item) => item.caseId === currentCase?.$id);
  const blockers = useMemo(
    () => (currentCase ? parseArray(currentCase.blockers) : []),
    [currentCase],
  );
  const gateEvidence = useMemo(
    () => (currentCase ? parseRecord(currentCase.evidence) : {}),
    [currentCase],
  );

  if (status === "loading") {
    return <div className="ensemble-loading"><span>∑</span><strong>Assembling the council</strong><p>Loading specialists, mission rooms, evidence handoffs, briefs, and decision controls.</p></div>;
  }
  if (!overview || status === "error") {
    return <div className="ensemble-loading error"><span>!</span><strong>Ensemble unavailable</strong><p>{message}</p></div>;
  }

  return (
    <div className="ensemble-content">
      <header className="ensemble-hero">
        <div><span className="kicker">COLLABORATIVE AGENT TEAMS &amp; EXECUTIVE DECISIONING</span><h1>Five specialists.<br />One accountable decision.</h1><p>Bring browser research, workflow design, reliability, cost, and security into one shared case room—preserving provenance, disagreement, approvals, and human ownership.</p></div>
        <div className="ensemble-constellation" aria-hidden="true"><i>V</i><i>L</i><i>T</i><i>H</i><i>Æ</i><span>∑</span><b><small>DECISION PROOF</small><strong>{currentCase?.score || 0}%</strong></b></div>
      </header>

      <section className="ensemble-metrics">
        <article><span>TEAM</span><strong>{overview.specialists.length} / 5</strong><small>Advisory specialists bounded</small></article>
        <article><span>CASE ROOM</span><strong>{currentCase ? pretty(currentCase.status) : "Not opened"}</strong><small>{currentCase?.title || "Scope the first mission"}</small></article>
        <article><span>EVIDENCE SOURCES</span><strong>{currentSynthesis?.sourceCount || 0}</strong><small>{currentSynthesis?.verifiedSourceCount || 0} independently verified</small></article>
        <article className={currentCase?.recommendation === "ready" ? "ready" : "hold"}><span>EXECUTIVE GATE</span><strong>{currentCase?.recommendation.toUpperCase() || "HOLD"}</strong><small>{blockers.length} blockers remain</small></article>
      </section>

      {message && <div className="ensemble-message" role="status"><span>∑</span>{message}</div>}

      <div className="ensemble-grid">
        <section className="ensemble-panel council-panel">
          <div className="ensemble-panel-heading"><span>01</span><div><h2>Specialist council</h2><p>Explicit roles, capabilities, and execution boundaries</p></div><b>ADVISORY ONLY</b></div>
          <div className="specialist-ring">
            {overview.specialists.map((specialist) => (
              <article key={specialist.$id}><span className={agentColor[specialist.agent]}>{specialist.name === "Aegis" ? "Æ" : specialist.name[0]}</span><p><strong>{specialist.name}</strong><small>{specialist.role}</small></p><b>{specialist.canExecute ? "EXECUTOR" : "NO EXECUTION"}</b></article>
            ))}
          </div>
          <div className="ensemble-note"><span>i</span><p><strong>Team truth</strong><small>These specialists contribute bounded analysis. None can call an external tool, approve its own work, or execute the final decision.</small></p></div>
        </section>

        <section className="ensemble-panel mission-panel">
          <div className="ensemble-panel-heading"><span>02</span><div><h2>Mission case room</h2><p>One objective, one durable collaboration record</p></div><b>{currentCase ? pretty(currentCase.status) : "NEW"}</b></div>
          <div className="mission-composer">
            <input aria-label="Mission title" value={mission.title} onChange={(event) => setMission({ ...mission, title: event.target.value })} />
            <textarea aria-label="Mission objective" value={mission.objective} onChange={(event) => setMission({ ...mission, objective: event.target.value })} />
            <button disabled={busy === "create"} onClick={async () => {
              const result = await action("create", { action: "create_mission", ...mission });
              if (result) setMessage("Mission case room opened. The team has not run and no external action occurred.");
            }}>{busy === "create" ? "Opening…" : currentCase ? "Open another case" : "Open case room"}</button>
          </div>
          {currentCase && <div className="case-summary"><span>{currentCase.risk.toUpperCase()} RISK</span><p><strong>{currentCase.title}</strong><small>{currentCase.objective}</small></p></div>}
          <button className="ensemble-primary" disabled={!currentCase || busy === "rehearsal"} onClick={async () => {
            if (!currentCase) return;
            const result = await action("rehearsal", { action: "run_rehearsal", caseId: currentCase.$id });
            if (result) setMessage("Five deterministic specialist contributions were synthesized. No live model, customer data, or external action was used.");
          }}>{busy === "rehearsal" ? "Collaborating…" : "Run collaboration rehearsal"}</button>
        </section>

        <section className="ensemble-panel handoff-panel">
          <div className="ensemble-panel-heading"><span>03</span><div><h2>Handoff graph</h2><p>Provenance survives every specialist boundary</p></div><b>{caseHandoffs.length} HANDOFFS</b></div>
          <div className="handoff-chain">
            {["vela", "loom", "tempo", "helio", "aegis", "council"].map((agent, index, list) => <div key={agent}><span className={agentColor[agent] || "council"}>{agent === "aegis" ? "Æ" : agent === "council" ? "∑" : agent[0].toUpperCase()}</span><small>{pretty(agent)}</small>{index < list.length - 1 && <i className={caseHandoffs[index]?.conflict ? "conflict" : ""}>→</i>}</div>)}
          </div>
          <div className="handoff-ledger">
            {caseHandoffs.length === 0 ? <p>Run the collaboration rehearsal to create inspectable handoffs.</p> : caseHandoffs.map((handoff) => <article key={handoff.$id}><span>{handoff.conflict ? "!" : "✓"}</span><p><strong>{pretty(handoff.fromAgent)} → {pretty(handoff.toAgent)}</strong><small>{handoff.summary}</small></p><b>{pretty(handoff.status)}</b></article>)}
          </div>
          <div className="ensemble-note amber"><span>!</span><p><strong>Handoff truth</strong><small>Synthetic citations demonstrate the contract, not production proof. Conflicting specialist priorities remain visible.</small></p></div>
        </section>

        <section className="ensemble-panel synthesis-panel">
          <div className="ensemble-panel-heading"><span>04</span><div><h2>Evidence synthesis</h2><p>Agreement, tension, and missing proof</p></div><b>{currentSynthesis ? pretty(currentSynthesis.status) : "EMPTY"}</b></div>
          <div className="synthesis-score"><span style={{ "--synthesis-score": `${Math.min(100, (currentSynthesis?.verifiedSourceCount || 0) * 20) * 3.6}deg` } as React.CSSProperties}><b>{currentSynthesis?.verifiedSourceCount || 0}</b><small>/5 verified</small></span><p><strong>{currentSynthesis?.summary || "No synthesis yet"}</strong><small>{currentSynthesis ? `${currentSynthesis.conflictCount} unresolved tensions · ${currentSynthesis.customerDataUsed ? "customer data used" : "no customer data"}` : "Specialist contributions will be combined here."}</small></p></div>
          <div className="synthesis-columns">
            <div><span>FINDINGS</span>{parseArray(currentSynthesis?.findings || "[]").map((item) => <p key={item}>✓ {item}</p>)}</div>
            <div><span>GAPS</span>{parseArray(currentSynthesis?.gaps || "[]").map((item) => <p key={item}>× {item}</p>)}</div>
          </div>
          <div className="ensemble-note cyan"><span>~</span><p><strong>Synthesis truth</strong><small>Missing evidence is not averaged away. Conflict resolution remains a named human responsibility.</small></p></div>
        </section>

        <section className="ensemble-panel brief-panel">
          <div className="ensemble-panel-heading"><span>05</span><div><h2>Executive brief</h2><p>Decision clarity without hidden certainty</p></div><b>{currentBrief ? pretty(currentBrief.status) : "NO DRAFT"}</b></div>
          {currentBrief ? <div className="brief-paper"><header><span>ORKestriaAI · INTERNAL</span><b>{new Date(currentBrief.createdAt).toLocaleDateString()}</b></header><h3>{currentBrief.title}</h3><p>{currentBrief.summary}</p><div>{parseArray(currentBrief.recommendations).map((item, index) => <article key={item}><span>0{index + 1}</span>{item}</article>)}</div><footer><span>{currentBrief.externallyShared ? "Externally shared" : "Not externally shared"}</span><b>{currentBrief.reviewed ? "OWNER REVIEWED" : "REVIEW REQUIRED"}</b></footer></div> : <div className="brief-empty"><span>◇</span><strong>No executive brief</strong><p>Run the rehearsal to create an internal decision draft.</p></div>}
          <button className="ensemble-primary" disabled={!currentBrief || currentBrief.reviewed === 1 || busy === "review"} onClick={async () => {
            if (!currentBrief) return;
            const result = await action("review", { action: "review_brief", briefId: currentBrief.$id });
            if (result) setMessage("Internal brief review recorded. The brief was not shared and no plan was executed.");
          }}>{busy === "review" ? "Recording review…" : currentBrief?.reviewed ? "Brief reviewed" : "Mark internal review complete"}</button>
        </section>

        <section className="ensemble-panel decision-panel">
          <div className="ensemble-panel-heading"><span>06</span><div><h2>Executive decision gate</h2><p>One accountable owner, all evidence visible</p></div><b>{currentCase?.score || 0}% PROVEN</b></div>
          <div className="decision-layout">
            <div className="decision-score"><span style={{ "--decision-score": `${(currentCase?.score || 0) * 3.6}deg` } as React.CSSProperties}><b>{currentCase?.score || 0}</b><small>/100</small></span><p><strong>{currentCase?.recommendation === "ready" ? "Plan ready for decision" : "Hold executive authorization"}</strong><small>{evidenceItems.filter(([key]) => gateEvidence[key] === true).length} of {evidenceItems.length} controls proven</small></p></div>
            <div className="decision-checks">{evidenceItems.map(([key, label]) => <span className={gateEvidence[key] === true ? "passed" : "blocked"} key={key}><i>{gateEvidence[key] === true ? "✓" : "×"}</i>{label}</span>)}</div>
          </div>
          {blockers.length > 0 && <details className="ensemble-blockers"><summary>{blockers.length} decision blockers</summary>{blockers.map((blocker) => <p key={blocker}>— {blocker}</p>)}</details>}
          <textarea aria-label="Executive decision rationale" value={rationale} onChange={(event) => setRationale(event.target.value)} />
          <div className="ensemble-decision-actions"><button className="refresh" disabled={!currentCase || busy === "refresh"} onClick={async () => {
            if (!currentCase) return;
            const result = await action("refresh", { action: "refresh_case", caseId: currentCase.$id });
            if (result) setMessage("Mission evidence refreshed from the durable case room.");
          }}>{busy === "refresh" ? "Refreshing…" : "Refresh evidence"}</button><button className="hold" disabled={!currentCase || !currentBrief || busy === "decision"} onClick={async () => {
            if (!currentCase) return;
            const result = await action("decision", { action: "record_decision", caseId: currentCase.$id, decision: "hold", rationale });
            if (result) setMessage("Executive hold recorded. No downstream action was authorized or executed.");
          }}>{busy === "decision" ? "Recording…" : "Record hold"}</button><button className="approve" disabled={!currentCase || !currentBrief || blockers.length > 0 || busy === "decision"} onClick={async () => {
            if (!currentCase) return;
            const result = await action("decision", { action: "record_decision", caseId: currentCase.$id, decision: "approve", rationale });
            if (result) setMessage("Executive authorization recorded. Downstream execution still requires its own approvals.");
          }}>Approve plan</button></div>
          <div className="ensemble-note violet"><span>◇</span><p><strong>Decision truth</strong><small>An executive decision records governance intent. It never executes the plan or bypasses downstream approvals.</small></p></div>
        </section>
      </div>
    </div>
  );
}

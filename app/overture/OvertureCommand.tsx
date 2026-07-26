"use client";

import { useEffect, useMemo, useState } from "react";
import type { OvertureOverview } from "../lib/platform/model";

function pretty(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function percent(value: number) {
  return `${Math.round(value / 100)}%`;
}

function parseObject(value: string) {
  try {
    return JSON.parse(value) as Record<string, boolean>;
  } catch {
    return {};
  }
}

function parseArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function OvertureCommand() {
  const [overview, setOverview] = useState<OvertureOverview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [connectorDraft, setConnectorDraft] = useState({
    connectorKey: "",
    displayName: "",
    capabilities: "read, analyze",
  });
  const [runbookDraft, setRunbookDraft] = useState({
    runbookKey: "customer_communications",
    name: "Customer incident communications",
    category: "communications",
    content:
      "Confirm incident severity, prepare an evidence-backed update, obtain incident-command approval, publish through the authorized channel, and preserve the communication record.",
  });
  const [onboardingDraft, setOnboardingDraft] = useState({
    name: "Security team onboarding",
    audience: "security_lead",
    items:
      "Review workspace roles\nReview approval policies\nConnect least-privilege evidence source\nRun Aegis review\nComplete escalation handoff",
  });
  const [launchDraft, setLaunchDraft] = useState({
    title: "OrkestriaAI general availability decision",
    rationale:
      "Review the complete launch evidence package without treating internal rehearsals as production proof.",
  });
  const [decisionRationale, setDecisionRationale] = useState(
    "Hold until production load, external security, connector certification, runbook exercises, onboarding, and AI release evidence are independently verified.",
  );

  async function load() {
    const response = await fetch("/api/overture", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Overture is unavailable.");
    setOverview(payload);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/overture", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Overture is unavailable.");
        if (!active) return;
        setOverview(payload);
        setStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Overture is unavailable.");
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
      const response = await fetch("/api/overture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, workspaceId: overview.workspaceId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "GA launch action failed.");
      await load();
      return payload;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "GA launch action failed.");
      return null;
    } finally {
      setBusy("");
    }
  }

  const latestLoad = overview?.loadTests[0];
  const latestSecurity = overview?.securityReviews[0];
  const gateEvidence = useMemo(
    () => parseObject(overview?.gate.evidence || "{}"),
    [overview?.gate.evidence],
  );
  const blockers = useMemo(
    () => parseArray<string>(overview?.gate.blockers || "[]"),
    [overview?.gate.blockers],
  );
  const pendingDecision = overview?.decisions.find(
    (item) => item.approvalStatus === "pending",
  );
  const approvalBlocked =
    overview?.program.verified !== 1 ||
    overview?.program.productionLaunchAuthorized !== 1 ||
    overview?.gate.recommendation !== "launch" ||
    overview?.gate.scoreBps !== 10000 ||
    blockers.length > 0;
  const certifiedConnectors =
    overview?.connectors.filter((item) => item.certified === 1).length || 0;
  const exercisedRunbooks =
    overview?.runbooks.filter(
      (item) => item.reviewed === 1 && item.exercisePassed === 1,
    ).length || 0;
  const completeOnboarding =
    overview?.onboarding.filter(
      (item) =>
        item.totalItems === item.completedItems &&
        item.totalItems === item.verifiedItems &&
        item.productionCustomerUsed === 1,
    ).length || 0;

  if (status === "loading") {
    return (
      <div className="overture-loading">
        <span>✺</span>
        <strong>Assembling the launch evidence constellation</strong>
        <p>Resilience, assurance, connectors, operations, onboarding, and final controls are loading.</p>
      </div>
    );
  }
  if (status === "error" || !overview) {
    return (
      <div className="overture-loading error">
        <span>!</span><strong>Overture unavailable</strong><p>{message}</p>
      </div>
    );
  }

  return (
    <div className="overture-page">
      <section className="overture-hero">
        <div className="overture-hero-copy">
          <span className="overture-eyebrow">Phase 18 · General Availability Command</span>
          <h1>The final movement. <em>Launch only what is proven.</em></h1>
          <p>
            Overture converts the full OrkestriaAI evidence graph into one human-controlled
            release decision—without allowing internal fixtures to impersonate production readiness.
          </p>
          <div className="overture-truth">
            <span><i />Synthetic traffic is not production load</span>
            <span><i />Internal review is not a penetration test</span>
            <span><i />Approval launches nothing automatically</span>
          </div>
        </div>
        <div className="overture-score" aria-label="GA readiness score">
          <div className="overture-score-ring" style={{ "--score": `${overview.gate.scoreBps / 100}%` } as React.CSSProperties}>
            <div><strong>{percent(overview.gate.scoreBps)}</strong><span>GA evidence</span></div>
          </div>
          <b className={overview.gate.recommendation === "launch" ? "ready" : ""}>
            {overview.gate.recommendation === "launch" ? "Launch evidence ready" : "Launch held"}
          </b>
          <small>{blockers.length} evidence blockers remain</small>
        </div>
      </section>

      {message ? <div className="overture-message">{message}</div> : null}

      <section className="overture-stat-grid">
        <article><span>Readiness program</span><strong>{pretty(overview.program.status)}</strong><small>{overview.program.verified ? "independently verified" : "internal evidence only"}</small></article>
        <article><span>Certified connectors</span><strong>{certifiedConnectors}/{overview.connectors.length}</strong><small>live failure evidence required</small></article>
        <article><span>Exercised runbooks</span><strong>{exercisedRunbooks}/{overview.runbooks.length}</strong><small>review and exercise both required</small></article>
        <article><span>Verified onboarding</span><strong>{completeOnboarding}/{overview.onboarding.length}</strong><small>production customer evidence required</small></article>
      </section>

      <section className="overture-panel overture-matrix">
        <header>
          <div><span>01 · release evidence matrix</span><h2>Launch readiness constellation</h2></div>
          <button disabled={Boolean(busy)} onClick={() => action("preflight", { action: "run_preflight" })}>
            {busy === "preflight" ? "Running bounded preflight…" : "Run internal preflight rehearsal"}
          </button>
        </header>
        <div className="overture-evidence-grid">
          {[
            ["productionLoadValidated", "Production resilience", "Real traffic, external generator, decision-grade capacity"],
            ["externalSecurityValidated", "External security", "Pen test, supply chain, and secrets assurance"],
            ["connectorsCertified", "Connector certification", "Scopes, live calls, failures, and rate limits"],
            ["runbooksExercised", "Operational readiness", "Reviewed and successfully exercised runbooks"],
            ["onboardingVerified", "Customer onboarding", "Complete, verified production onboarding"],
            ["aiReleaseApproved", "AI release governance", "Human-approved model and prompt release"],
          ].map(([key, title, detail], index) => (
            <article className={gateEvidence[key] ? "pass" : ""} key={key}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><strong>{title}</strong><small>{detail}</small></div>
              <b>{gateEvidence[key] ? "Evidence ready" : "Blocked"}</b>
            </article>
          ))}
        </div>
        <p className="overture-preflight-note">
          The rehearsal creates bounded load and security fixtures only. It sends zero production
          requests, performs no penetration traffic, and changes no external system.
        </p>
      </section>

      <section className="overture-split">
        <article className="overture-panel overture-proof-card">
          <header><div><span>02 · resilience proving ground</span><h2>Load without mythology</h2></div></header>
          {latestLoad ? (
            <>
              <div className="overture-proof-head">
                <div><span>Latest scenario</span><strong>{pretty(latestLoad.scenario)}</strong></div>
                <b>{pretty(latestLoad.status)}</b>
              </div>
              <div className="overture-metrics">
                <div><strong>{latestLoad.virtualUsers}</strong><span>fixture users</span></div>
                <div><strong>{latestLoad.totalRequests}</strong><span>simulated requests</span></div>
                <div><strong>{latestLoad.p95LatencyMs}ms</strong><span>fixture p95</span></div>
                <div><strong>{percent(latestLoad.confidenceBps)}</strong><span>confidence</span></div>
              </div>
              <div className="overture-proof-truth">
                <span className={latestLoad.productionTrafficUsed ? "pass" : ""}><i />Production traffic used</span>
                <span className={latestLoad.externalLoadGeneratorUsed ? "pass" : ""}><i />External generator used</span>
                <span className={latestLoad.decisionGrade ? "pass" : ""}><i />Decision-grade evidence</span>
              </div>
            </>
          ) : <div className="overture-empty">Run the internal preflight to create a clearly bounded resilience fixture.</div>}
        </article>

        <article className="overture-panel overture-proof-card">
          <header><div><span>03 · security assurance room</span><h2>Assurance without shortcuts</h2></div></header>
          {latestSecurity ? (
            <>
              <div className="overture-proof-head">
                <div><span>Latest review</span><strong>{pretty(latestSecurity.reviewType)}</strong></div>
                <b>{pretty(latestSecurity.status)}</b>
              </div>
              <div className="overture-metrics">
                <div><strong>{latestSecurity.areasReviewed}</strong><span>fixture areas</span></div>
                <div><strong>{latestSecurity.findingsCount}</strong><span>internal findings</span></div>
                <div><strong>{latestSecurity.highFindings}</strong><span>high findings</span></div>
                <div><strong>{percent(latestSecurity.confidenceBps)}</strong><span>confidence</span></div>
              </div>
              <div className="overture-proof-truth">
                <span className={latestSecurity.externalPenTestCompleted ? "pass" : ""}><i />External pen test</span>
                <span className={latestSecurity.supplyChainVerified ? "pass" : ""}><i />Supply chain verified</span>
                <span className={latestSecurity.secretsScanVerified ? "pass" : ""}><i />Secrets assurance verified</span>
              </div>
            </>
          ) : <div className="overture-empty">Run the internal preflight to create a clearly bounded security checklist.</div>}
        </article>
      </section>

      <section className="overture-panel">
        <header>
          <div><span>04 · integration assurance</span><h2>Connector certification board</h2></div>
          <p>Configuration is inventory. Certification requires verified scopes, live calls, failure modes, and rate limits.</p>
        </header>
        <div className="overture-connector-layout">
          <div className="overture-connectors">
            {overview.connectors.map((connector) => {
              const checks = [
                connector.scopesVerified,
                connector.liveCallsTested,
                connector.failureModesTested,
                connector.rateLimitsVerified,
              ].filter(Boolean).length;
              return (
                <article key={connector.$id}>
                  <div className="overture-connector-mark">{connector.displayName.slice(0, 2).toUpperCase()}</div>
                  <div><strong>{connector.displayName}</strong><small>{connector.connectorKey} · {checks}/4 certification checks</small></div>
                  <b>{pretty(connector.status)}</b>
                  <span><i style={{ width: `${checks * 25}%` }} /></span>
                </article>
              );
            })}
          </div>
          <form
            className="overture-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const result = await action("connector", {
                action: "propose_connector",
                ...connectorDraft,
                capabilities: connectorDraft.capabilities.split(",").map((item) => item.trim()).filter(Boolean),
              });
              if (result) setConnectorDraft({ connectorKey: "", displayName: "", capabilities: "read, analyze" });
            }}
          >
            <span>Register certification candidate · grants no access</span>
            <label>Connector key<input required placeholder="provider-key" value={connectorDraft.connectorKey} onChange={(event) => setConnectorDraft({ ...connectorDraft, connectorKey: event.target.value })} /></label>
            <label>Display name<input required placeholder="Provider name" value={connectorDraft.displayName} onChange={(event) => setConnectorDraft({ ...connectorDraft, displayName: event.target.value })} /></label>
            <label>Capabilities<input value={connectorDraft.capabilities} onChange={(event) => setConnectorDraft({ ...connectorDraft, capabilities: event.target.value })} /></label>
            <button disabled={Boolean(busy)}>{busy === "connector" ? "Registering…" : "Add unverified candidate"}</button>
          </form>
        </div>
      </section>

      <section className="overture-panel">
        <header>
          <div><span>05 · operational memory</span><h2>Runbook library</h2></div>
          <p>A document becomes launch evidence only after independent review and a successful exercise.</p>
        </header>
        <div className="overture-runbook-layout">
          <div className="overture-runbooks">
            {overview.runbooks.map((runbook) => (
              <article key={runbook.$id}>
                <span>v{runbook.version}</span>
                <div><strong>{runbook.name}</strong><small>{pretty(runbook.category)}</small></div>
                <b>{pretty(runbook.status)}</b>
                <div className="overture-runbook-flags">
                  <i className={runbook.reviewed ? "pass" : ""}>Reviewed</i>
                  <i className={runbook.exercisePassed ? "pass" : ""}>Exercise passed</i>
                </div>
              </article>
            ))}
          </div>
          <form
            className="overture-form"
            onSubmit={async (event) => {
              event.preventDefault();
              await action("runbook", { action: "create_runbook", ...runbookDraft });
            }}
          >
            <span>Create immutable draft version</span>
            <div className="overture-form-row">
              <label>Runbook key<input value={runbookDraft.runbookKey} onChange={(event) => setRunbookDraft({ ...runbookDraft, runbookKey: event.target.value })} /></label>
              <label>Category<input value={runbookDraft.category} onChange={(event) => setRunbookDraft({ ...runbookDraft, category: event.target.value })} /></label>
            </div>
            <label>Name<input value={runbookDraft.name} onChange={(event) => setRunbookDraft({ ...runbookDraft, name: event.target.value })} /></label>
            <label>Procedure<textarea rows={4} value={runbookDraft.content} onChange={(event) => setRunbookDraft({ ...runbookDraft, content: event.target.value })} /></label>
            <button disabled={Boolean(busy)}>{busy === "runbook" ? "Versioning…" : "Create unreviewed runbook"}</button>
          </form>
        </div>
      </section>

      <section className="overture-panel">
        <header>
          <div><span>06 · adoption runway</span><h2>Onboarding readiness</h2></div>
          <p>Fixture completion cannot stand in for verified production-customer onboarding.</p>
        </header>
        <div className="overture-onboarding-layout">
          <div className="overture-onboarding-list">
            {overview.onboarding.map((checklist) => {
              const items = parseArray<{ title: string; completed: boolean; verified: boolean }>(checklist.items);
              return (
                <article key={checklist.$id}>
                  <header><div><strong>{checklist.name}</strong><small>{pretty(checklist.audience)}</small></div><b>{checklist.completedItems}/{checklist.totalItems}</b></header>
                  <div>{items.map((item, index) => <span className={item.verified ? "verified" : item.completed ? "complete" : ""} key={`${checklist.$id}-${index}`}><i />{item.title}</span>)}</div>
                  <small>{checklist.productionCustomerUsed ? "Production customer evidence" : "No production customer used"}</small>
                </article>
              );
            })}
          </div>
          <form
            className="overture-form"
            onSubmit={async (event) => {
              event.preventDefault();
              await action("onboarding", {
                action: "create_onboarding",
                ...onboardingDraft,
                items: onboardingDraft.items.split("\n").map((item) => item.trim()).filter(Boolean),
              });
            }}
          >
            <span>Draft onboarding checklist</span>
            <label>Name<input value={onboardingDraft.name} onChange={(event) => setOnboardingDraft({ ...onboardingDraft, name: event.target.value })} /></label>
            <label>Audience<input value={onboardingDraft.audience} onChange={(event) => setOnboardingDraft({ ...onboardingDraft, audience: event.target.value })} /></label>
            <label>One item per line<textarea rows={6} value={onboardingDraft.items} onChange={(event) => setOnboardingDraft({ ...onboardingDraft, items: event.target.value })} /></label>
            <button disabled={Boolean(busy)}>{busy === "onboarding" ? "Drafting…" : "Create fixture-only checklist"}</button>
          </form>
        </div>
      </section>

      <section className="overture-panel overture-launch-room">
        <header>
          <div><span>07 · final human control</span><h2>General availability decision room</h2></div>
          <p>GA approval is impossible while evidence blockers remain—and even approval performs no launch action.</p>
        </header>
        {pendingDecision ? (
          <div className="overture-decision">
            <div className="overture-decision-head">
              <div><span>Pending executive decision</span><h3>{pendingDecision.title}</h3><p>{pendingDecision.rationale}</p></div>
              <b className={approvalBlocked ? "blocked" : "ready"}>{approvalBlocked ? "GA blocked" : "Ready for review"}</b>
            </div>
            <div className="overture-blockers">
              {blockers.length ? blockers.map((blocker) => <span key={blocker}><i />{blocker}</span>) : <span className="pass"><i />All launch evidence gates are satisfied.</span>}
            </div>
            <label className="overture-rationale">Decision rationale<textarea rows={3} value={decisionRationale} onChange={(event) => setDecisionRationale(event.target.value)} /></label>
            <div className="overture-actions">
              <button className="secondary" disabled={Boolean(busy)} onClick={() => action("decision", { action: "decide_launch", decisionId: pendingDecision.$id, decision: "hold", rationale: decisionRationale })}>{busy === "decision" ? "Recording…" : "Hold · keep private"}</button>
              <button disabled={Boolean(busy) || approvalBlocked} onClick={() => action("decision", { action: "decide_launch", decisionId: pendingDecision.$id, decision: "approve", rationale: decisionRationale })}>Approve GA intent</button>
            </div>
            <small>No publication, customer invitations, billing activation, traffic change, or external-system mutation occurs.</small>
          </div>
        ) : (
          <form
            className="overture-launch-form"
            onSubmit={async (event) => {
              event.preventDefault();
              await action("launch", { action: "request_launch", ...launchDraft });
            }}
          >
            <div><span>Current gate</span><strong>{percent(overview.gate.scoreBps)} evidence readiness</strong><small>{blockers.length} blockers · recommendation {overview.gate.recommendation}</small></div>
            <label>Decision title<input value={launchDraft.title} onChange={(event) => setLaunchDraft({ ...launchDraft, title: event.target.value })} /></label>
            <label>Request rationale<textarea rows={3} value={launchDraft.rationale} onChange={(event) => setLaunchDraft({ ...launchDraft, rationale: event.target.value })} /></label>
            <button disabled={Boolean(busy)}>{busy === "launch" ? "Preparing…" : "Request human GA review"}</button>
          </form>
        )}
      </section>
    </div>
  );
}

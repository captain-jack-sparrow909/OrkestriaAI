"use client";

import { useEffect, useMemo, useState } from "react";
import type { ConcordOverview } from "../lib/platform/model";

function pretty(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const currentPeriod = new Date().toISOString().slice(0, 7);

export function ConcordCommand() {
  const [overview, setOverview] = useState<ConcordOverview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [period, setPeriod] = useState(currentPeriod);
  const [workspaceDraft, setWorkspaceDraft] = useState({
    memberWorkspaceId: "",
    alias: "EMEA operations",
    accessLevel: "governance_read",
  });
  const [authorityDraft, setAuthorityDraft] = useState({
    delegateEmail: "",
    role: "portfolio_steward",
    scopes: ["federation.read", "rollup.review"],
  });
  const [policyDraft, setPolicyDraft] = useState({
    name: "Cross-workspace evidence standard",
    scope: "all_member_workspaces",
    statement:
      "Executive decisions require independently verified source evidence and explicit member-workspace consent.",
  });
  const [packageDraft, setPackageDraft] = useState({
    title: "Enterprise operating review",
    rationale:
      "Review the bounded anchor-workspace rollup without treating synthetic benchmarks as enterprise evidence.",
  });
  const [decisionRationale, setDecisionRationale] = useState(
    "Hold until federation membership, delegated authority, policy, rollup, and privacy benchmarks are independently verified.",
  );

  async function load() {
    const response = await fetch("/api/concord", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Concord is unavailable.");
    setOverview(payload);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/concord", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Concord is unavailable.");
        if (!active) return;
        setOverview(payload);
        setStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Concord is unavailable.");
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
      const response = await fetch("/api/concord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, workspaceId: overview.workspaceId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Enterprise command failed.");
      await load();
      return payload;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Enterprise command failed.");
      return null;
    } finally {
      setBusy("");
    }
  }

  const latestRollup = overview?.rollups[0];
  const benchmarks = useMemo(
    () =>
      overview && latestRollup
        ? overview.benchmarks.filter((item) => item.rollupId === latestRollup.$id)
        : [],
    [overview, latestRollup],
  );
  const pendingPackage = overview?.packages.find(
    (item) => item.approvalStatus === "pending",
  );
  const connectedMembers =
    overview?.federationWorkspaces.filter(
      (item) =>
        item.verified === 1 &&
        item.dataSharingApproved === 1 &&
        ["connected_anchor", "connected_verified"].includes(item.status),
    ) || [];
  const activeAuthorities =
    overview?.authorities.filter((item) => item.verified === 1 && item.active === 1) ||
    [];
  const verifiedPolicies =
    overview?.policies.filter((item) => item.verified === 1 && item.status === "verified") ||
    [];
  const benchmarksReady =
    benchmarks.length === 3 &&
    benchmarks.every(
      (item) =>
        item.status === "privacy_reviewed" &&
        item.kAnonymityMet === 1 &&
        item.rawTenantDataExposed === 0 &&
        item.confidenceBps >= 8000,
    );
  const approvalBlocked =
    overview?.federation.verified !== 1 ||
    connectedMembers.length < 2 ||
    activeAuthorities.length === 0 ||
    verifiedPolicies.length === 0 ||
    !latestRollup ||
    latestRollup.status !== "verified" ||
    latestRollup.decisionGrade !== 1 ||
    latestRollup.confidenceBps < 8000 ||
    !benchmarksReady;

  if (status === "loading") {
    return (
      <div className="concord-loading">
        <span>◈</span>
        <strong>Aligning the enterprise command graph</strong>
        <p>Workspaces, authority, policy, evidence, and privacy boundaries are loading.</p>
      </div>
    );
  }
  if (status === "error" || !overview) {
    return (
      <div className="concord-loading error">
        <span>!</span><strong>Concord unavailable</strong><p>{message}</p>
      </div>
    );
  }

  return (
    <div className="concord-page">
      <section className="concord-hero">
        <div>
          <span className="concord-eyebrow">Phase 16 · federated enterprise command</span>
          <h1>One enterprise. Many workspaces. <em>One governed truth.</em></h1>
          <p>
            Concord coordinates only explicitly approved workspace relationships,
            delegated mandates, policy bindings, bounded rollups, and executive decisions.
          </p>
          <div className="concord-truth">
            <span><i />Proposals grant no access</span>
            <span><i />No raw tenant data exposed</span>
            <span><i />Approval executes nothing</span>
          </div>
        </div>
        <div className="concord-radar" aria-label="Federation status">
          <div className="concord-ring ring-one" />
          <div className="concord-ring ring-two" />
          <div className="concord-ring ring-three" />
          <span className="concord-core">◈</span>
          {overview.federationWorkspaces.slice(0, 5).map((member, index) => (
            <span
              className={`concord-node node-${index + 1} ${member.verified ? "verified" : ""}`}
              key={member.$id}
              title={member.alias}
            />
          ))}
          <strong>{connectedMembers.length} connected</strong>
          <small>{overview.federationWorkspaces.length - connectedMembers.length} proposed</small>
        </div>
      </section>

      {message ? <div className="concord-message">{message}</div> : null}

      <section className="concord-stat-grid">
        <article><span>Federation state</span><strong>{pretty(overview.federation.status)}</strong><small>verification required</small></article>
        <article><span>Connected workspaces</span><strong>{connectedMembers.length}</strong><small>{overview.federationWorkspaces.length} total records</small></article>
        <article><span>Active mandates</span><strong>{activeAuthorities.length}</strong><small>external changes disabled</small></article>
        <article><span>Decision-grade rollups</span><strong>{overview.rollups.filter((item) => item.decisionGrade === 1).length}</strong><small>bounded rollups do not qualify</small></article>
      </section>

      <section className="concord-panel">
        <header>
          <div><span>01 · federation graph</span><h2>Workspace constellation</h2></div>
          <p>A proposed membership is only a record. It cannot read or connect another workspace.</p>
        </header>
        <div className="concord-federation-layout">
          <div className="concord-member-list">
            {overview.federationWorkspaces.map((member, index) => (
              <article key={member.$id}>
                <span className={member.verified ? "verified" : ""}>{index === 0 ? "◆" : "◇"}</span>
                <div>
                  <strong>{member.alias}</strong>
                  <small>{member.memberWorkspaceId} · {pretty(member.accessLevel)}</small>
                </div>
                <b>{pretty(member.status)}</b>
                <i>{member.rawDataShared ? "Raw data shared" : "No raw data"}</i>
              </article>
            ))}
          </div>
          <form
            className="concord-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const result = await action("workspace", {
                action: "propose_workspace",
                ...workspaceDraft,
              });
              if (result) {
                setWorkspaceDraft({ ...workspaceDraft, memberWorkspaceId: "" });
              }
            }}
          >
            <span className="concord-form-title">Propose workspace membership</span>
            <label>Target workspace ID<input value={workspaceDraft.memberWorkspaceId} onChange={(event) => setWorkspaceDraft({ ...workspaceDraft, memberWorkspaceId: event.target.value })} placeholder="ws_…" /></label>
            <label>Workspace alias<input value={workspaceDraft.alias} onChange={(event) => setWorkspaceDraft({ ...workspaceDraft, alias: event.target.value })} /></label>
            <label>Requested access<select value={workspaceDraft.accessLevel} onChange={(event) => setWorkspaceDraft({ ...workspaceDraft, accessLevel: event.target.value })}><option value="governance_read">Governance read</option><option value="portfolio_read">Portfolio read</option><option value="evidence_read">Evidence read</option></select></label>
            <button disabled={busy === "workspace"} type="submit">{busy === "workspace" ? "Proposing…" : "Create no-access proposal"}</button>
            <small>Membership requires independent identity, consent, and authorization checks not performed here.</small>
          </form>
        </div>
      </section>

      <section className="concord-split">
        <article className="concord-panel">
          <header><div><span>02 · delegated governance</span><h2>Authority ledger</h2></div></header>
          <div className="concord-ledger">
            {overview.authorities.map((authority) => (
              <div key={authority.$id}>
                <span className={authority.active ? "active" : ""}>{authority.delegateEmail.slice(0, 1).toUpperCase()}</span>
                <p><strong>{authority.delegateEmail}</strong><small>{pretty(authority.role)} · {JSON.parse(authority.scopes || "[]").length} scopes</small></p>
                <b>{authority.active ? "Active" : "Inactive"}</b>
              </div>
            ))}
          </div>
          <form
            className="concord-form flat"
            onSubmit={async (event) => {
              event.preventDefault();
              await action("authority", { action: "propose_authority", ...authorityDraft });
            }}
          >
            <span className="concord-form-title">Propose delegated mandate</span>
            <label>Delegate email<input type="email" value={authorityDraft.delegateEmail} onChange={(event) => setAuthorityDraft({ ...authorityDraft, delegateEmail: event.target.value })} /></label>
            <label>Role<select value={authorityDraft.role} onChange={(event) => setAuthorityDraft({ ...authorityDraft, role: event.target.value })}><option value="portfolio_steward">Portfolio steward</option><option value="policy_reviewer">Policy reviewer</option><option value="evidence_auditor">Evidence auditor</option></select></label>
            <button disabled={busy === "authority"} type="submit">{busy === "authority" ? "Proposing…" : "Record inactive mandate"}</button>
          </form>
        </article>

        <article className="concord-panel">
          <header><div><span>03 · federated control</span><h2>Policy lattice</h2></div></header>
          <div className="concord-policy-list">
            {overview.policies.map((policy) => (
              <div key={policy.$id}>
                <span>⌁</span><p><strong>{policy.name}</strong><small>{pretty(policy.scope)} · {pretty(policy.mode)}</small></p>
                <b className={policy.enforcementApplied ? "applied" : ""}>{policy.enforcementApplied ? "Applied" : "Not applied"}</b>
              </div>
            ))}
          </div>
          <form
            className="concord-form flat"
            onSubmit={async (event) => {
              event.preventDefault();
              await action("policy", { action: "draft_policy", ...policyDraft });
            }}
          >
            <span className="concord-form-title">Draft federated policy</span>
            <label>Policy name<input value={policyDraft.name} onChange={(event) => setPolicyDraft({ ...policyDraft, name: event.target.value })} /></label>
            <label>Policy statement<textarea value={policyDraft.statement} onChange={(event) => setPolicyDraft({ ...policyDraft, statement: event.target.value })} /></label>
            <button disabled={busy === "policy"} type="submit">{busy === "policy" ? "Drafting…" : "Save advisory draft"}</button>
          </form>
        </article>
      </section>

      <section className="concord-panel concord-rollup">
        <header>
          <div><span>04 · bounded intelligence</span><h2>Enterprise operating rollup</h2></div>
          <div className="concord-rollup-action">
            <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
            <button disabled={busy === "rollup"} onClick={() => action("rollup", { action: "run_rollup", federationId: overview.federation.$id, period })} type="button">{busy === "rollup" ? "Reconciling…" : "Run bounded rollup"}</button>
          </div>
        </header>
        {latestRollup ? (
          <>
            <div className="concord-rollup-banner">
              <span>◈</span>
              <p><strong>{pretty(latestRollup.status)}</strong><small>{latestRollup.period} · anchor workspace only · {latestRollup.confidenceBps / 100}% confidence</small></p>
              <b>{latestRollup.decisionGrade ? "Decision-grade" : "Advisory only"}</b>
            </div>
            <div className="concord-rollup-grid">
              <article><span>Programs</span><strong>{latestRollup.programsCount}</strong><small>internal records</small></article>
              <article><span>Milestones</span><strong>{latestRollup.milestonesCount}</strong><small>across anchor only</small></article>
              <article><span>Verified evidence</span><strong>{latestRollup.verifiedEvidenceCount}</strong><small>not self-reported</small></article>
              <article><span>Benefit observations</span><strong>{latestRollup.benefitsMeasuredCount}</strong><small>realization not implied</small></article>
              <article><span>Open variances</span><strong>{latestRollup.openVariancesCount}</strong><small>attention signals</small></article>
            </div>
          </>
        ) : <div className="concord-empty"><span>◈</span><strong>No rollup yet</strong><p>Reconcile only the evidence currently authorized in the anchor workspace.</p></div>}
      </section>

      <section className="concord-panel">
        <header><div><span>05 · privacy boundary</span><h2>Privacy-safe benchmark lens</h2></div><p>Synthetic reference ranges use no real tenant records and are never decision evidence.</p></header>
        <div className="concord-benchmark-grid">
          {benchmarks.length ? benchmarks.map((benchmark) => {
            const width = Math.max(4, Math.min(100, benchmark.currentValue));
            return (
              <article key={benchmark.$id}>
                <div><span>{pretty(benchmark.metric)}</span><b>{benchmark.currentValue}{benchmark.unit === "percent" ? "%" : ""}</b></div>
                <div className="concord-benchmark-track">
                  <span className="range" style={{ left: `${benchmark.benchmarkLow}%`, width: `${benchmark.benchmarkHigh - benchmark.benchmarkLow}%` }} />
                  <i style={{ left: `${width}%` }} />
                </div>
                <footer><small>Reference {benchmark.benchmarkLow}–{benchmark.benchmarkHigh}%</small><b>{pretty(benchmark.status)}</b></footer>
                <p><span>{benchmark.rawTenantDataExposed ? "×" : "✓"} No raw tenant data</span><span>{benchmark.kAnonymityMet ? "✓" : "×"} Privacy review pending</span></p>
              </article>
            );
          }) : <div className="concord-empty wide"><span>◇</span><strong>No reference lens</strong><p>Run a bounded rollup to create clearly synthetic comparison ranges.</p></div>}
        </div>
      </section>

      <section className="concord-panel concord-decision-panel">
        <header><div><span>06 · executive control</span><h2>Executive decision package</h2></div><p>Approval is a durable decision record, never an execution command.</p></header>
        <div className="concord-decision-layout">
          <form
            className="concord-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!latestRollup) return;
              await action("package", { action: "create_package", rollupId: latestRollup.$id, ...packageDraft });
            }}
          >
            <span className="concord-form-title">Prepare executive package</span>
            <label>Package title<input value={packageDraft.title} onChange={(event) => setPackageDraft({ ...packageDraft, title: event.target.value })} /></label>
            <label>Decision context<textarea value={packageDraft.rationale} onChange={(event) => setPackageDraft({ ...packageDraft, rationale: event.target.value })} /></label>
            <button disabled={!latestRollup || busy === "package"} type="submit">{busy === "package" ? "Preparing…" : "Prepare unverified package"}</button>
          </form>
          <div className="concord-gate">
            <div className="concord-gate-head"><span>{pendingPackage ? "Pending executive review" : "No pending package"}</span><b>{pendingPackage ? "Approval required" : "Gate ready"}</b></div>
            {pendingPackage ? (
              <>
                <strong>{pendingPackage.title}</strong>
                <p>{pendingPackage.rationale}</p>
                <div className="concord-checks">
                  <span className={overview.federation.verified ? "ok" : ""}>{overview.federation.verified ? "✓" : "×"} Verified federation</span>
                  <span className={connectedMembers.length >= 2 ? "ok" : ""}>{connectedMembers.length >= 2 ? "✓" : "×"} Two connected workspaces</span>
                  <span className={activeAuthorities.length ? "ok" : ""}>{activeAuthorities.length ? "✓" : "×"} Verified authority</span>
                  <span className={verifiedPolicies.length ? "ok" : ""}>{verifiedPolicies.length ? "✓" : "×"} Verified policy</span>
                  <span className={latestRollup?.decisionGrade ? "ok" : ""}>{latestRollup?.decisionGrade ? "✓" : "×"} Decision-grade rollup</span>
                  <span className={benchmarksReady ? "ok" : ""}>{benchmarksReady ? "✓" : "×"} Privacy-reviewed benchmarks</span>
                </div>
                <label>Executive rationale<textarea value={decisionRationale} onChange={(event) => setDecisionRationale(event.target.value)} /></label>
                <div className="concord-decision-actions">
                  <button className="hold" disabled={busy === "decision"} onClick={() => action("decision", { action: "decide_package", packageId: pendingPackage.$id, decision: "hold", rationale: decisionRationale })} type="button">Hold · no change</button>
                  <button disabled={approvalBlocked || busy === "decision"} onClick={() => action("decision", { action: "decide_package", packageId: pendingPackage.$id, decision: "approve", rationale: decisionRationale })} type="button">Approve record</button>
                </div>
                <small>No policy application, delegation activation, financial commitment, or external action is created.</small>
              </>
            ) : <div className="concord-empty"><span>◈</span><strong>The executive gate is waiting</strong><p>Create a bounded rollup, then prepare its decision package.</p></div>}
          </div>
        </div>
      </section>
    </div>
  );
}

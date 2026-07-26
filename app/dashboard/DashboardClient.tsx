"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ChatGPTUser } from "../chatgpt-auth";

type Foundation = {
  configured: boolean;
  endpointConfigured: boolean;
  projectConfigured: boolean;
  serverKeyConfigured: boolean;
  databaseId: string;
};

const approvalsSeed = [
  {
    id: "apr_deploy_482",
    agent: "Tempo",
    mark: "T",
    action: "Rollback checkout-service",
    detail: "Production · deploy #482 → #481",
    risk: "High",
    age: "4m",
    color: "orange",
  },
  {
    id: "apr_vendor_submit",
    agent: "Vela",
    mark: "V",
    action: "Submit vendor shortlist",
    detail: "Procurement portal · 3 vendors",
    risk: "Medium",
    age: "11m",
    color: "violet",
  },
  {
    id: "apr_shutdown",
    agent: "Helio",
    mark: "H",
    action: "Schedule idle resource shutdown",
    detail: "AWS non-production · 12 resources",
    risk: "Medium",
    age: "19m",
    color: "cyan",
  },
];

type ApprovalItem = (typeof approvalsSeed)[number];

const runs = [
  ["Tempo", "Investigate checkout latency", "Waiting for approval", "46s", "orange"],
  ["Aegis", "Review pull request #938", "Completed", "2m 18s", "pink"],
  ["Helio", "Analyze July cloud spend", "Completed", "5m 42s", "cyan"],
  ["Loom", "Enrich new enterprise leads", "Running", "1m 09s", "lime"],
];

export function DashboardClient({
  user,
  foundation,
}: {
  user: ChatGPTUser;
  foundation: Foundation;
}) {
  const [approvals, setApprovals] = useState<ApprovalItem[]>(
    foundation.configured ? [] : approvalsSeed,
  );
  const [workspaceId, setWorkspaceId] = useState("");
  const [activeSection, setActiveSection] = useState("Overview");
  const [command, setCommand] = useState("");
  const firstName = user.displayName.split(/[\s@]/)[0] || "Operator";
  const initials = user.displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const health = useMemo(
    () => [
      ["Identity", "Active", true],
      ["Role policies", "7 roles", true],
      ["Approval engine", "Ready", true],
      ["Appwrite data", foundation.configured ? "Connected" : "Setup required", foundation.configured],
    ],
    [foundation.configured],
  );

  useEffect(() => {
    if (!foundation.configured) return;
    let active = true;

    fetch("/api/approvals")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load approvals");
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        setWorkspaceId(payload.workspaceId);
        setApprovals(
          payload.approvals.map((approval: {
            $id: string;
            action: string;
            description: string;
            risk: string;
            requestedAt: string;
          }) => ({
            id: approval.$id,
            agent: "Orkestria",
            mark: "O",
            action: approval.action,
            detail: approval.description,
            risk: `${approval.risk.charAt(0).toUpperCase()}${approval.risk.slice(1)}`,
            age: new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
              -Math.max(1, Math.round((Date.now() - new Date(approval.requestedAt).getTime()) / 60_000)),
              "minute",
            ),
            color: "violet",
          })),
        );
      })
      .catch(() => {
        if (active) setApprovals([]);
      });

    return () => {
      active = false;
    };
  }, [foundation.configured]);

  async function decide(id: string, decision: "approved" | "denied") {
    if (!foundation.configured || !workspaceId) {
      setApprovals((items) => items.filter((item) => item.id !== id));
      return;
    }
    const response = await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId: id, workspaceId, decision }),
    });
    if (response.ok) {
      setApprovals((items) => items.filter((item) => item.id !== id));
    }
  }

  return (
    <main className="app-shell">
      <aside className="app-sidebar">
        <Link href="/" className="brand app-brand">
          <span className="brand-glyph">O</span>
          <span>orkestria<span className="brand-ai">AI</span></span>
        </Link>
        <div className="workspace-switcher">
          <span className="workspace-avatar">N</span>
          <span><strong>Northstar Labs</strong><small>Enterprise workspace</small></span>
          <b>⌄</b>
        </div>
        <nav className="app-nav" aria-label="Command center">
          <span className="app-nav-label">Workspace</span>
          {["Overview", "Approvals", "Runs", "Workflows"].map((item) => (
            <button
              className={activeSection === item ? "active" : ""}
              key={item}
              onClick={() => setActiveSection(item)}
            >
              <i>{item === "Overview" ? "⌂" : item === "Approvals" ? "!" : item === "Runs" ? "↗" : "◇"}</i>
              {item}
              {item === "Approvals" && <em>{approvals.length}</em>}
            </button>
          ))}
          <Link href="/enterprise"><i className="enterprise-nav-mark">◇</i><span>Enterprise</span></Link>
          <span className="app-nav-label">Agents</span>
          {[
            ["V", "Vela", "violet", "/vela"],
            ["L", "Loom", "lime", "/loom"],
            ["T", "Tempo", "orange", "/tempo"],
            ["H", "Helio", "cyan", "/helio"],
            ["Æ", "Aegis", "pink", "/aegis"],
          ].map(([mark, name, color, href]) => (
            <Link href={href} key={name}><i className={`agent-nav-mark ${color}`}>{mark}</i><span>{name}</span><span className="agent-online" /></Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/enterprise">⌾ <span>Governance</span></Link>
          <Link href="/products">⚙ <span>Connections</span></Link>
          <a href="/signout-with-chatgpt?return_to=%2F">↪ <span>Sign out</span></a>
        </div>
      </aside>

      <section className="app-main">
        <header className="app-topbar">
          <div>
            <span className="topbar-breadcrumb">Northstar Labs /</span>
            <strong>{activeSection}</strong>
          </div>
          <div className="topbar-actions">
            <button aria-label="Search">⌕</button>
            <button aria-label="Notifications">◉<i /></button>
            <div className="user-chip"><span>{initials}</span><p><strong>{user.displayName}</strong><small>Owner</small></p></div>
          </div>
        </header>

        <div className="dashboard-content">
          {!foundation.configured && (
            <div className="foundation-banner">
              <span className="foundation-banner-mark">01</span>
              <div>
                <strong>Foundation code is ready</strong>
                <p>Connect an Appwrite project to activate durable workspaces, approvals, audit events, files, and background jobs.</p>
              </div>
              <span className="foundation-state">Preview data</span>
            </div>
          )}

          <div className="dashboard-welcome">
            <div>
              <span className="kicker">COMMAND CENTER</span>
              <h1>Good morning, {firstName}.</h1>
              <p>Your agents are healthy. Three actions are waiting for your judgment.</p>
            </div>
            <div className="date-chip"><span>FRI</span><strong>25</strong><small>JUL 2026</small></div>
          </div>

          <form className="dashboard-command" onSubmit={(event) => event.preventDefault()}>
            <span>✦</span>
            <input
              aria-label="Command OrkestriaAI"
              placeholder="Ask Orkestria to investigate, automate, optimize, or review..."
              value={command}
              onChange={(event) => setCommand(event.target.value)}
            />
            <kbd>⌘ K</kbd>
            <button aria-label="Run command">↗</button>
          </form>

          <div className="dashboard-metrics">
            <article><div><span>Agent runs</span><small>↗ 18%</small></div><strong>1,284</strong><p>this month</p><i className="metric-chart chart-one" /></article>
            <article><div><span>Hours saved</span><small>↗ 12%</small></div><strong>342<span>h</span></strong><p>verified time saved</p><i className="metric-chart chart-two" /></article>
            <article><div><span>Approvals</span><small className="warn">{approvals.length} waiting</small></div><strong>94<span>%</span></strong><p>approved safely</p><i className="metric-donut" /></article>
            <article><div><span>Platform health</span><small>All agents</small></div><strong className="health-text"><i />Healthy</strong><p>Last checked now</p></article>
          </div>

          <div className="dashboard-grid">
            <section className="dashboard-panel approvals-panel">
              <div className="panel-heading">
                <div><h2>Approval inbox</h2><span>{approvals.length} actions need review</span></div>
                <button onClick={() => setActiveSection("Approvals")}>View all →</button>
              </div>
              <div className="approval-list">
                {approvals.length === 0 ? (
                  <div className="approval-empty"><span>✓</span><strong>Inbox clear</strong><p>No risky actions are waiting.</p></div>
                ) : approvals.map((approval) => (
                  <article className="approval-row" key={approval.id}>
                    <span className={`approval-agent ${approval.color}`}>{approval.mark}</span>
                    <div className="approval-row-copy">
                      <span>{approval.agent} · {approval.age} ago</span>
                      <strong>{approval.action}</strong>
                      <p>{approval.detail}</p>
                    </div>
                    <span className={`risk-pill ${approval.risk.toLowerCase()}`}>{approval.risk} risk</span>
                    <div className="approval-actions">
                      <button aria-label={`Deny ${approval.action}`} onClick={() => decide(approval.id, "denied")}>×</button>
                      <button aria-label={`Approve ${approval.action}`} onClick={() => decide(approval.id, "approved")}>Approve</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <aside className="dashboard-panel foundation-panel">
              <div className="panel-heading"><div><h2>Foundation health</h2><span>Phase 1 controls</span></div></div>
              <div className="health-list">
                {health.map(([label, state, healthy]) => (
                  <div key={String(label)}>
                    <span className={healthy ? "healthy" : "pending"}>{healthy ? "✓" : "!"}</span>
                    <p><strong>{label}</strong><small>{state}</small></p>
                  </div>
                ))}
              </div>
              <Link href="/security">Review trust controls <span>→</span></Link>
            </aside>

            <section className="dashboard-panel runs-panel">
              <div className="panel-heading">
                <div><h2>Recent runs</h2><span>Live activity across your agents</span></div>
                <button onClick={() => setActiveSection("Runs")}>View all →</button>
              </div>
              <div className="run-table">
                <div className="run-table-head"><span>Agent</span><span>Task</span><span>Status</span><span>Duration</span><span /></div>
                {runs.map(([agent, task, status, duration, color]) => (
                  <div className="run-table-row" key={task}>
                    <span><i className={`agent-nav-mark ${color}`}>{agent[0]}</i>{agent}</span>
                    <strong>{task}</strong>
                    <span className={`table-status ${status.toLowerCase().replaceAll(" ", "-")}`}><i />{status}</span>
                    <span>{duration}</span>
                    <button aria-label={`Open ${task}`}>›</button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}

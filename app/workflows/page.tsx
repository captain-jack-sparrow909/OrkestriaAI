"use client";

import { useMemo, useState } from "react";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

const connectors = [
  ["S", "Slack", "#7056e8"],
  ["G", "Gmail", "#e76a4d"],
  ["N", "Notion", "#272535"],
  ["G", "GitHub", "#272535"],
  ["A", "Appwrite", "#f02e65"],
  ["V", "Vercel", "#272535"],
  ["D", "Datadog", "#6c49e7"],
  ["A", "AWS", "#e89226"],
];

export default function WorkflowsPage() {
  const [query, setQuery] = useState("");
  const [prompt, setPrompt] = useState("When a high-risk security issue is opened, enrich it, notify the owner, and wait for approval.");
  const filtered = useMemo(
    () => connectors.filter((item) => item[1].toLowerCase().includes(query.toLowerCase())),
    [query]
  );

  return (
    <main>
      <SiteHeader />
      <section className="page-hero">
        <div className="shell page-hero-grid">
          <div>
            <span className="kicker">LOOM WORKFLOW STUDIO</span>
            <h1>Automations that read<br /><em>like your intent.</em></h1>
          </div>
          <p>
            Create reliable, human-aware workflows in plain English. Loom
            drafts the logic; your team stays in control of every rule.
          </p>
        </div>
      </section>
      <section className="shell builder-wrap">
        <div className="builder-shell">
          <aside className="builder-sidebar">
            <h3>App connectors</h3>
            <input
              aria-label="Search connectors"
              className="builder-search"
              placeholder="Search apps..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="connector-list">
              {filtered.map(([mark, name, color], index) => (
                <button className={`connector ${index === 0 ? "active" : ""}`} key={name} style={{"--connector": color} as React.CSSProperties}>
                  <span>{mark}</span><small>{name}</small>
                </button>
              ))}
            </div>
          </aside>
          <div className="builder-main">
            <div className="builder-toolbar">
              <div><strong>Security issue triage</strong><small>Draft saved</small></div>
              <div><small className="builder-status">● Ready to test</small><button className="button button-nav">Publish</button></div>
            </div>
            <div className="builder-canvas">
              <div className="flow-node">
                <div className="flow-node-top"><span className="flow-app" style={{"--connector":"#272535"} as React.CSSProperties}>G</span><span>•••</span></div>
                <h4>Issue opened</h4>
                <p>Trigger when severity is high or critical.</p>
              </div>
              <div className="flow-connector" />
              <div className="flow-node">
                <div className="flow-node-top"><span className="flow-app">✦</span><span>•••</span></div>
                <h4>Aegis enriches issue</h4>
                <p>Add exploitability, owner, and fix context.</p>
              </div>
              <div className="flow-connector" />
              <div className="flow-node approval">
                <div className="flow-node-top"><span className="flow-app" style={{"--connector":"#ff8b58"} as React.CSSProperties}>!</span><span>•••</span></div>
                <h4>Wait for approval</h4>
                <p>Security lead reviews the proposed fix.</p>
              </div>
              <div className="flow-connector" />
              <div className="flow-node">
                <div className="flow-node-top"><span className="flow-app" style={{"--connector":"#7056e8"} as React.CSSProperties}>S</span><span>•••</span></div>
                <h4>Notify owner</h4>
                <p>Post context and next steps to Slack.</p>
              </div>
              <form className="builder-prompt" onSubmit={(event) => event.preventDefault()}>
                <span>✦</span>
                <input aria-label="Describe your workflow" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
                <button aria-label="Build workflow">↗</button>
              </form>
            </div>
          </div>
        </div>
        <div className="workflow-benefits">
          <div className="benefit-card"><span>01 / BUILD</span><h3>Natural language to logic</h3><p>Loom proposes triggers, conditions, mappings, and recovery paths you can inspect and edit.</p></div>
          <div className="benefit-card"><span>02 / OPERATE</span><h3>Reliable by default</h3><p>Retries, idempotency, rate limits, caching, and dead-letter handling are built into every run.</p></div>
          <div className="benefit-card"><span>03 / GOVERN</span><h3>Human when it matters</h3><p>Approvals, RBAC, audit logs, and data boundaries are native workflow primitives.</p></div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

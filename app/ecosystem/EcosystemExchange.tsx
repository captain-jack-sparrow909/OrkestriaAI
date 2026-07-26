"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ConnectorCatalogRecord,
  EcosystemOverview,
  PolicyTemplateRecord,
} from "../lib/platform/model";

const manifestExample = `{
  "schemaVersion": "1.0",
  "name": "Northstar Service Desk",
  "slug": "northstar-service-desk",
  "version": "1.0.0",
  "auth": {
    "type": "api_key",
    "scopes": ["tickets.read", "tickets.write"]
  },
  "actions": [
    {
      "key": "tickets.search",
      "title": "Search tickets",
      "risk": "low",
      "requiresApproval": false
    },
    {
      "key": "tickets.close",
      "title": "Close ticket",
      "risk": "high",
      "requiresApproval": true
    }
  ]
}`;

const connectorMarks: Record<string, { mark: string; color: string }> = {
  github: { mark: "GH", color: "ink" },
  slack: { mark: "S", color: "violet" },
  aws: { mark: "AWS", color: "orange" },
  datadog: { mark: "D", color: "purple" },
  "google-workspace": { mark: "G", color: "blue" },
  stripe: { mark: "S", color: "indigo" },
  jira: { mark: "J", color: "sky" },
  appwrite: { mark: "A", color: "pink" },
};

function jsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function EcosystemExchange() {
  const [overview, setOverview] = useState<EcosystemOverview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [activeTab, setActiveTab] = useState("Marketplace");
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [manifest, setManifest] = useState(manifestExample);

  async function load() {
    const response = await fetch("/api/ecosystem", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Ecosystem unavailable.");
    setOverview(payload);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/ecosystem", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Ecosystem unavailable.");
        if (!active) return;
        setOverview(payload);
        setStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Ecosystem unavailable.");
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
      const response = await fetch("/api/ecosystem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, workspaceId: overview.workspaceId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Ecosystem action failed.");
      await load();
      return payload;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ecosystem action failed.");
      return null;
    } finally {
      setBusy("");
    }
  }

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(overview?.catalog.map((item) => item.category) || []))],
    [overview],
  );
  const visibleConnectors = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (overview?.catalog || []).filter((item) =>
      (category === "All" || item.category === category) &&
      (!needle || `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(needle)),
    );
  }, [overview, category, search]);
  const installationByConnector = useMemo(
    () => new Map(overview?.installations.map((item) => [item.connectorId, item]) || []),
    [overview],
  );
  const openSignals = overview?.signals.filter((item) => item.status === "open") || [];

  async function installConnector(connector: ConnectorCatalogRecord) {
    const result = await action(`connector-${connector.$id}`, {
      action: "install_connector",
      connectorId: connector.$id,
    });
    if (result) setMessage(`${connector.name} added as a configuration-required connection. No external authorization was performed.`);
  }

  async function activatePolicy(template: PolicyTemplateRecord) {
    const result = await action(`policy-${template.$id}`, {
      action: "activate_policy",
      templateId: template.$id,
    });
    if (result) setMessage(`${template.name} installed in monitor mode. Enforcement remains an explicit owner decision.`);
  }

  async function validateManifest() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(manifest);
    } catch {
      setMessage("Manifest must be valid JSON.");
      return;
    }
    const result = await action("manifest", { action: "save_manifest", manifest: parsed });
    if (result) setMessage("Manifest validated and saved as a private draft. Marketplace publishing was not requested.");
  }

  if (status === "loading") {
    return <div className="ecosystem-loading"><span>✦</span><strong>Opening the exchange</strong><p>Loading connectors, policy templates, partner drafts, and workspace signals.</p></div>;
  }
  if (!overview || status === "error") {
    return <div className="ecosystem-loading error"><span>!</span><strong>Ecosystem unavailable</strong><p>{message}</p></div>;
  }

  return (
    <div className="ecosystem-content">
      <header className="ecosystem-hero">
        <div>
          <span className="kicker">ORKESTRIA ECOSYSTEM EXCHANGE</span>
          <h1>Connect the tools.<br />Inherit the trust.</h1>
          <p>Every connector and vertical policy enters through the same approval, audit, rate-limit, and least-privilege controls that govern the five-agent suite.</p>
        </div>
        <div className="exchange-orbit"><span>O</span><i /><i /><i /><i /><b>TRUSTED EXTENSIONS</b></div>
      </header>

      <section className="ecosystem-metrics">
        <article><span>CONNECTOR CATALOG</span><strong>{overview.catalog.length}</strong><small>Verified integration contracts</small><i>↗</i></article>
        <article><span>WORKSPACE INSTALLS</span><strong>{overview.installations.length}</strong><small>{overview.installations.filter((item) => item.authStatus === "authorized").length} externally authorized</small><i>⌁</i></article>
        <article><span>VERTICAL PACKS</span><strong>{overview.policyTemplates.length}</strong><small>{overview.activePolicyTemplateSlugs.length} active in monitor mode</small><i>◇</i></article>
        <article className="intelligence-metric"><span>INTELLIGENCE SIGNALS</span><strong>{openSignals.length}</strong><small>Evidence-backed opportunities</small><i>✦</i></article>
      </section>

      <nav className="exchange-tabs" aria-label="Ecosystem sections">
        {["Marketplace", "Policy packs", "Partner SDK", "Intelligence"].map((tab) => (
          <button className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)} key={tab}>{tab}{tab === "Intelligence" && openSignals.length > 0 && <b>{openSignals.length}</b>}</button>
        ))}
      </nav>
      {message && <div className="ecosystem-message" role="status"><span>✦</span>{message}</div>}

      {activeTab === "Marketplace" && (
        <section className="exchange-section">
          <div className="market-toolbar">
            <div><h2>Connector marketplace</h2><p>Install a governed connection draft. Authorization happens separately.</p></div>
            <label><span>⌕</span><input aria-label="Search connectors" placeholder="Search connectors" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          </div>
          <div className="category-strip">{categories.map((item) => <button className={category === item ? "active" : ""} onClick={() => setCategory(item)} key={item}>{item}</button>)}</div>
          <div className="connector-grid">
            {visibleConnectors.map((connector) => {
              const installation = installationByConnector.get(connector.$id);
              const mark = connectorMarks[connector.slug] || { mark: connector.name.charAt(0), color: "violet" };
              const agents = jsonArray(connector.agentKeys);
              return (
                <article className={connector.featured ? "featured" : ""} key={connector.$id}>
                  {connector.featured ? <b className="featured-ribbon">FEATURED</b> : null}
                  <header><span className={`connector-logo ${mark.color}`}>{mark.mark}</span><div><strong>{connector.name}</strong><small>{connector.category}</small></div><i className="verified-mark">✓</i></header>
                  <p>{connector.description}</p>
                  <div className="connector-agents">{agents.map((agent) => <span key={agent}>{agent}</span>)}</div>
                  <div className="connector-meta"><span>{connector.actionsCount} actions</span><span>{connector.authType}</span><span>v{connector.version}</span></div>
                  <footer><p><span>Publisher</span><strong>{connector.publisher}</strong></p>{installation ? <button className="installed" disabled><i />{installation.status.replaceAll("_", " ")}</button> : <button disabled={busy === `connector-${connector.$id}`} onClick={() => installConnector(connector)}>{busy === `connector-${connector.$id}` ? "Adding…" : "Add connector"} <span>＋</span></button>}</footer>
                </article>
              );
            })}
          </div>
          <div className="authorization-truth"><span>i</span><p><strong>Installation is not authorization</strong><small>Adding a connector creates a private configuration draft with no credentials and no external access. OAuth, API keys, or cloud-role handshakes must complete before the status can become connected.</small></p></div>
        </section>
      )}

      {activeTab === "Policy packs" && (
        <section className="exchange-section">
          <div className="market-toolbar"><div><h2>Vertical policy library</h2><p>Start with industry context in monitor mode, then review before enforcement.</p></div><span className="library-chip">CURATED BASELINES</span></div>
          <div className="vertical-policy-grid">
            {overview.policyTemplates.map((template) => {
              const active = overview.activePolicyTemplateSlugs.includes(template.slug);
              return (
                <article key={template.$id}>
                  <div className="vertical-emblem"><span>{template.industry.charAt(0)}</span><i>{template.framework}</i></div>
                  <span className="industry-label">{template.industry}</span>
                  <h3>{template.name}</h3><p>{template.description}</p>
                  <div className="vertical-stats"><span><strong>{template.rulesCount}</strong><small>rules</small></span><span><strong>v{template.version}</strong><small>version</small></span><span><strong>Monitor</strong><small>default</small></span></div>
                  <button className={active ? "active" : ""} disabled={active || busy === `policy-${template.$id}`} onClick={() => activatePolicy(template)}>{active ? "Installed in monitor mode" : busy === `policy-${template.$id}` ? "Installing…" : "Install policy pack"} <span>{active ? "✓" : "→"}</span></button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {activeTab === "Partner SDK" && (
        <section className="exchange-section sdk-section">
          <div className="sdk-copy">
            <span className="kicker">PARTNER MANIFEST SDK · 1.0</span>
            <h2>Make internal tools<br />first-class instruments.</h2>
            <p>Describe authentication, scopes, actions, risk, and approval requirements in one bounded manifest. OrkestriaAI validates the contract before any marketplace review.</p>
            <div className="sdk-principles">
              <article><span>01</span><p><strong>Declare every action</strong><small>No open-ended tool execution.</small></p></article>
              <article><span>02</span><p><strong>Bind risk to policy</strong><small>High-risk actions are approval-gated.</small></p></article>
              <article><span>03</span><p><strong>Publish separately</strong><small>Validation saves a private draft only.</small></p></article>
            </div>
            <div className="submission-ledger"><span>VALIDATED DRAFTS</span><strong>{overview.submissions.length}</strong><small>Private to Northstar Labs</small></div>
          </div>
          <div className="manifest-editor">
            <header><span><i />connector.manifest.json</span><b>JSON SCHEMA 1.0</b></header>
            <textarea aria-label="Connector manifest" spellCheck={false} value={manifest} onChange={(event) => setManifest(event.target.value)} />
            <footer><span>High and critical risk actions are forced through approval.</span><button disabled={busy === "manifest"} onClick={validateManifest}>{busy === "manifest" ? "Validating…" : "Validate & save draft"} <b>→</b></button></footer>
          </div>
        </section>
      )}

      {activeTab === "Intelligence" && (
        <section className="exchange-section intelligence-section">
          <div className="market-toolbar"><div><h2>Continuous product intelligence</h2><p>Workspace-specific signals grounded in installed capabilities and governance state.</p></div><span className="library-chip live"><i />CONTINUOUS</span></div>
          <div className="signal-layout">
            <div className="signal-list">
              {overview.signals.map((signal) => (
                <article className={signal.status === "acknowledged" ? "acknowledged" : ""} key={signal.$id}>
                  <span className={`signal-score ${signal.priority}`}>{signal.score}</span>
                  <div><span>{signal.source} · {signal.kind.replaceAll("_", " ")}</span><h3>{signal.title}</h3><p>{signal.description}</p><small><b>Evidence:</b> {signal.evidence}</small></div>
                  <aside><span className={`priority-chip ${signal.priority}`}>{signal.priority}</span>{signal.status === "open" ? <button disabled={busy === `signal-${signal.$id}`} onClick={async () => {
                    const result = await action(`signal-${signal.$id}`, { action: "acknowledge_signal", signalId: signal.$id });
                    if (result) setMessage("Signal acknowledged and added to the audit trail.");
                  }}>Acknowledge</button> : <b>✓ Acknowledged</b>}</aside>
                  <footer><span>Recommended next move</span><p>{signal.recommendation}</p></footer>
                </article>
              ))}
            </div>
            <aside className="intelligence-rail">
              <div className="signal-radar"><span>✦</span><i /><i /><i /><b>{openSignals.length}</b></div>
              <h3>Evidence before advice</h3><p>Signals explain the observed gap and the recommended next move. They never install, authorize, or enforce anything automatically.</p>
              <div><span>OPEN</span><strong>{openSignals.length}</strong></div><div><span>ACKNOWLEDGED</span><strong>{overview.signals.length - openSignals.length}</strong></div>
            </aside>
          </div>
        </section>
      )}
    </div>
  );
}

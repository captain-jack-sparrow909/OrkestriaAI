"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CustomRoleRecord,
  EnterpriseOverview,
  PolicyPackRecord,
} from "../lib/platform/model";

const capabilityOptions = [
  ["agents.run", "Run agents"],
  ["runs.read", "View runs"],
  ["approvals.decide", "Decide approvals"],
  ["audit.read", "Read audit evidence"],
  ["billing.manage", "Manage cost controls"],
  ["members.manage", "Manage members"],
  ["policies.manage", "Manage policies"],
] as const;

const regionLabels: Record<string, string> = {
  "us-east": "United States · East",
  "us-west": "United States · West",
  "eu-west": "European Union · West",
  "ap-southeast": "Asia Pacific · Southeast",
};

function parseCapabilities(role: CustomRoleRecord) {
  try {
    const parsed = JSON.parse(role.capabilities);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function prettyStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function EnterpriseStudio() {
  const [overview, setOverview] = useState<EnterpriseOverview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([
    "runs.read",
    "audit.read",
  ]);
  const [region, setRegion] = useState("eu-west");
  const [residencyMode, setResidencyMode] = useState("pinned");
  const [framework, setFramework] = useState("SOC 2");
  const [period, setPeriod] = useState("Q3 2026");

  async function load() {
    const response = await fetch("/api/enterprise", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Enterprise controls are unavailable.");
    setOverview(payload);
    setRegion(payload.config.dataRegion);
    setResidencyMode(payload.config.residencyMode);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/enterprise", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Enterprise controls are unavailable.");
        }
        if (!active) return;
        setOverview(payload);
        setRegion(payload.config.dataRegion);
        setResidencyMode(payload.config.residencyMode);
        setStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Enterprise controls are unavailable.");
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
      const response = await fetch("/api/enterprise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, workspaceId: overview.workspaceId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Enterprise action failed.");
      await load();
      return payload;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Enterprise action failed.");
      return null;
    } finally {
      setBusy("");
    }
  }

  const averageCoverage = useMemo(() => {
    if (!overview?.policies.length) return 0;
    return Math.round(
      overview.policies.reduce((total, policy) => total + policy.coverage, 0) /
        overview.policies.length,
    );
  }, [overview]);

  const enforcedPolicies = overview?.policies.filter(
    (policy) => policy.mode === "enforce",
  ).length || 0;

  function toggleCapability(capability: string) {
    setSelectedCapabilities((current) =>
      current.includes(capability)
        ? current.filter((item) => item !== capability)
        : [...current, capability],
    );
  }

  async function createRole(event: React.FormEvent) {
    event.preventDefault();
    const result = await action("role", {
      action: "create_role",
      name: roleName,
      description: roleDescription,
      capabilities: selectedCapabilities,
    });
    if (result) {
      setRoleName("");
      setRoleDescription("");
      setSelectedCapabilities(["runs.read", "audit.read"]);
      setMessage("Custom role created and recorded in the audit trail.");
    }
  }

  async function updatePolicy(policy: PolicyPackRecord) {
    const mode = policy.mode === "enforce" ? "monitor" : "enforce";
    const result = await action(`policy-${policy.$id}`, {
      action: "set_policy_mode",
      policyId: policy.$id,
      mode,
    });
    if (result) setMessage(`${policy.name} is now in ${mode} mode.`);
  }

  async function createExport() {
    const result = await action("export", {
      action: "request_export",
      framework,
      period,
    });
    if (result) setMessage(`${framework} evidence bundle is ready to download.`);
  }

  if (status === "loading") {
    return (
      <div className="enterprise-loading">
        <span className="trust-pulse">◇</span>
        <strong>Assembling the trust fabric</strong>
        <p>Loading identity, roles, policies, residency, and compliance evidence.</p>
      </div>
    );
  }

  if (!overview || status === "error") {
    return (
      <div className="enterprise-loading error">
        <span>!</span><strong>Enterprise controls unavailable</strong><p>{message}</p>
      </div>
    );
  }

  const settings = (() => {
    try {
      return JSON.parse(overview.config.settings || "{}");
    } catch {
      return {};
    }
  })();

  return (
    <div className="enterprise-content">
      <header className="enterprise-hero">
        <div>
          <span className="kicker">ENTERPRISE TRUST FABRIC</span>
          <h1>Govern every agent.<br />Prove every control.</h1>
          <p>One operational surface for identity, least privilege, regional boundaries, policy enforcement, audit evidence, and service commitments.</p>
        </div>
        <div className="trust-seal">
          <span><i>◇</i><strong>{averageCoverage}</strong><small>TRUST POSTURE</small></span>
          <p><b>Enterprise controls active</b><small>{enforcedPolicies} policy packs enforcing</small></p>
        </div>
      </header>

      <section className="enterprise-metrics">
        <article><span>GOVERNED AGENTS</span><strong>5 / 5</strong><small>One approval plane</small><i className="metric-mark lime">✓</i></article>
        <article><span>POLICY COVERAGE</span><strong>{averageCoverage}%</strong><small>{overview.policies.length} active packs</small><i className="mini-gauge" style={{"--gauge": `${averageCoverage * 3.6}deg`} as React.CSSProperties} /></article>
        <article><span>DATA BOUNDARY</span><strong>{overview.config.dataRegion.toUpperCase()}</strong><small>{prettyStatus(overview.config.residencyMode)}</small><i className="metric-mark violet">◎</i></article>
        <article className="sla-metric"><span>ENTERPRISE SLA</span><strong>99.95%</strong><small>Operational target</small><i className="sla-bars"><b /><b /><b /><b /></i></article>
      </section>

      {message && <div className="enterprise-message" role="status"><span>◇</span>{message}</div>}

      <div className="enterprise-grid">
        <section className="enterprise-panel identity-panel">
          <div className="enterprise-panel-heading"><span>01</span><div><h2>Identity perimeter</h2><p>Federation and lifecycle readiness</p></div><b>OWNER CONTROL</b></div>
          <div className="identity-visual">
            <span className="identity-core">ID</span>
            <i className="identity-orbit one" /><i className="identity-orbit two" />
            <b className="identity-node saml">SAML</b><b className="identity-node scim">SCIM</b><b className="identity-node mfa">MFA</b>
          </div>
          <div className="control-list">
            <article><span className="control-icon violet">S</span><p><strong>SAML 2.0 federation</strong><small>Configuration ready · metadata required</small></p><b className="state-chip ready">Ready</b></article>
            <article><span className="control-icon cyan">D</span><p><strong>{overview.config.primaryDomain || "No domain configured"}</strong><small>Domain ownership</small></p><b className="state-chip pending">{prettyStatus(overview.config.domainStatus)}</b></article>
            <article><span className="control-icon orange">↻</span><p><strong>SCIM provisioning</strong><small>No directory connection established</small></p><b className="state-chip neutral">{prettyStatus(overview.config.scimStatus)}</b></article>
          </div>
          <div className="truth-note"><span>i</span><p><strong>Connection truth</strong><small>OrkestriaAI never marks federation or provisioning active until the external handshake is verified.</small></p></div>
        </section>

        <section className="enterprise-panel residency-panel">
          <div className="enterprise-panel-heading"><span>02</span><div><h2>Data residency</h2><p>Pin operational records to an approved boundary</p></div><b>AUDITED</b></div>
          <div className="region-map">
            <div className="map-grid" />
            <span className={`region-dot ${region}`}><i /><b>{regionLabels[region]}</b></span>
            <p><strong>{regionLabels[overview.config.dataRegion]}</strong><small>Current control-plane region</small></p>
          </div>
          <div className="residency-controls">
            <label><span>Primary region</span><select value={region} onChange={(event) => setRegion(event.target.value)}><option value="eu-west">EU West</option><option value="us-east">US East</option><option value="us-west">US West</option><option value="ap-southeast">AP Southeast</option></select></label>
            <label><span>Residency mode</span><select value={residencyMode} onChange={(event) => setResidencyMode(event.target.value)}><option value="pinned">Region pinned</option><option value="global">Global availability</option></select></label>
            <button disabled={busy === "residency" || (region === overview.config.dataRegion && residencyMode === overview.config.residencyMode)} onClick={async () => {
              const result = await action("residency", { action: "update_residency", region, mode: residencyMode });
              if (result) setMessage("Residency control updated and written to the audit trail.");
            }}>{busy === "residency" ? "Saving…" : "Apply boundary"}</button>
          </div>
          <div className="network-status">
            <span className="network-glyph">⌁</span><p><strong>Private network access</strong><small>Cloudflare Access configuration available</small></p><b>{prettyStatus(overview.config.privateNetworkStatus)}</b>
          </div>
        </section>

        <section className="enterprise-panel roles-panel">
          <div className="enterprise-panel-heading"><span>03</span><div><h2>Custom access roles</h2><p>Least privilege beyond the seven system roles</p></div><b>{overview.roles.length} ROLES</b></div>
          <div className="role-ledger">
            {overview.roles.map((role) => {
              const capabilities = parseCapabilities(role);
              return (
                <article key={role.$id}>
                  <span className="role-avatar">{role.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</span>
                  <div><strong>{role.name}</strong><small>{role.description}</small><p>{capabilities.slice(0, 3).map((capability) => <b key={capability}>{capability.replace(".", " · ")}</b>)}</p></div>
                  <span className="member-count"><strong>{role.memberCount}</strong><small>members</small></span>
                </article>
              );
            })}
          </div>
          <form className="role-creator" onSubmit={createRole}>
            <div><span>NEW CUSTOM ROLE</span><strong>Define a least-privilege role</strong></div>
            <div className="role-fields">
              <input aria-label="Role name" placeholder="Role name" value={roleName} onChange={(event) => setRoleName(event.target.value)} maxLength={64} required />
              <input aria-label="Role description" placeholder="Short responsibility" value={roleDescription} onChange={(event) => setRoleDescription(event.target.value)} maxLength={255} />
            </div>
            <div className="capability-picker">
              {capabilityOptions.map(([value, label]) => <label key={value}><input type="checkbox" checked={selectedCapabilities.includes(value)} onChange={() => toggleCapability(value)} /><span>{label}</span></label>)}
            </div>
            <button disabled={busy === "role"} type="submit">{busy === "role" ? "Creating…" : "Create audited role"} <span>→</span></button>
          </form>
        </section>

        <section className="enterprise-panel policy-panel">
          <div className="enterprise-panel-heading"><span>04</span><div><h2>Policy packs</h2><p>Monitor first, then enforce with intent</p></div><b>{enforcedPolicies} ENFORCING</b></div>
          <div className="policy-list">
            {overview.policies.map((policy) => (
              <article key={policy.$id}>
                <div className={`policy-emblem ${policy.mode}`}><span>{policy.framework.charAt(0)}</span><i style={{"--coverage": `${policy.coverage * 3.6}deg`} as React.CSSProperties} /></div>
                <div className="policy-copy"><span>{policy.framework} · V{policy.version}</span><strong>{policy.name}</strong><small>{policy.rulesCount} controls · {policy.coverage}% coverage</small></div>
                <div className="policy-mode"><span>MODE</span><button className={policy.mode} disabled={busy === `policy-${policy.$id}`} onClick={() => updatePolicy(policy)}><i />{busy === `policy-${policy.$id}` ? "Saving" : policy.mode}</button></div>
              </article>
            ))}
          </div>
          <div className="policy-footnote"><span>✓</span><p><strong>Deterministic policy wins</strong><small>Model recommendations cannot override enforced workspace controls.</small></p></div>
        </section>

        <section className="enterprise-panel evidence-panel">
          <div className="enterprise-panel-heading"><span>05</span><div><h2>Compliance evidence</h2><p>Point-in-time, attributable control snapshots</p></div><b>{settings.auditRetentionDays || 365}D RETENTION</b></div>
          <div className="export-composer">
            <label><span>Framework</span><select value={framework} onChange={(event) => setFramework(event.target.value)}><option>SOC 2</option><option>ISO 27001</option><option>CIS Cloud</option><option>Full audit</option></select></label>
            <label><span>Evidence period</span><input value={period} onChange={(event) => setPeriod(event.target.value)} maxLength={64} /></label>
            <button disabled={busy === "export"} onClick={createExport}>{busy === "export" ? "Generating…" : "Generate evidence"} <span>↓</span></button>
          </div>
          <div className="export-list">
            {overview.exports.length ? overview.exports.map((item) => (
              <article key={item.$id}>
                <span className="export-file">JSON</span><p><strong>{item.framework} evidence bundle</strong><small>{item.period} · {new Date(item.createdAt).toLocaleDateString()}</small></p><b className="state-chip ready">{item.status}</b>
                <a href={`/api/enterprise?workspaceId=${encodeURIComponent(overview.workspaceId)}&exportId=${encodeURIComponent(item.$id)}`}>Download</a>
              </article>
            )) : <div className="export-empty"><span>□</span><p><strong>No exports yet</strong><small>Generate an evidence snapshot when an auditor requests it.</small></p></div>}
          </div>
          <div className="sla-strip">
            <div><span>SERVICE TARGET</span><strong>99.95%</strong></div>
            <div><span>AUDIT RETENTION</span><strong>{settings.auditRetentionDays || 365} days</strong></div>
            <div><span>BREAK-GLASS</span><strong>{settings.breakGlassAccounts || 2} owners</strong></div>
            <div><span>SUPPORT</span><strong>{prettyStatus(overview.config.supportStatus)}</strong></div>
          </div>
        </section>
      </div>
    </div>
  );
}

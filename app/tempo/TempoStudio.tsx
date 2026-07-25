"use client";

import { useRef, useState } from "react";
import type { AgentPlanResult } from "../lib/platform/model";

const sampleEvidence = `14:02:11 deploy checkout-service v2026.07.25-rc4 completed
14:03:07 alert checkout-p95-latency crossed 850ms (baseline 190ms)
14:03:19 error db.pool timeout acquiring connection after 3000ms
14:03:21 info active_connections=100 pool_size=100 queue_depth=46
14:04:02 change DB_POOL_SIZE 40 → 100 in production
14:04:15 trace POST /checkout 2.84s span=db.orders.insert 2.31s
14:05:44 alert checkout-error-rate 7.8% (baseline 0.4%)`;

export function TempoStudio() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [service, setService] = useState("checkout-service");
  const [environment, setEnvironment] = useState("Production");
  const [evidence, setEvidence] = useState(sampleEvidence);
  const [evidenceFile, setEvidenceFile] = useState<{ name: string; state: string } | null>(null);
  const [plan, setPlan] = useState<AgentPlanResult | null>(null);
  const [status, setStatus] = useState<"idle" | "analyzing" | "ready" | "error">("idle");
  const [error, setError] = useState("");

  async function attachFile(file: File) {
    setEvidenceFile({ name: file.name, state: "Uploading evidence…" });
    const text = await file.text();
    setEvidence(text.slice(0, 12000));
    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/files", { method: "POST", body: form });
    const payload = await response.json();
    if (!response.ok) {
      setEvidenceFile({ name: file.name, state: payload.error || "Upload failed" });
      return;
    }
    setEvidenceFile({ name: payload.file.name, state: "Stored · scan pending" });
  }

  async function analyze(event: React.FormEvent) {
    event.preventDefault();
    setStatus("analyzing");
    setError("");
    setPlan(null);
    try {
      const response = await fetch("/api/agents/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: "tempo",
          goal: `Analyze the ${service} incident in ${environment}. Identify the most likely cause, cite evidence, and propose the safest remediation sequence without changing production.`,
          context: {
            service,
            environment,
            evidence,
            attachedFile: evidenceFile?.name || null,
            productionPolicy: "rollbacks, deploys, scaling, and configuration changes require approval",
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Tempo could not analyze this incident.");
      setPlan(payload);
      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Tempo could not analyze this incident.");
      setStatus("error");
    }
  }

  return (
    <div className="studio-content ops-content">
      <div className="studio-heading">
        <div>
          <span className="kicker">AI DEVOPS ASSISTANT</span>
          <h1>From noisy signals<br />to a safe next move.</h1>
          <p>Tempo correlates the deployment, infrastructure changes, alerts, logs, and traces—then proposes reversible remediation with production approvals built in.</p>
        </div>
        <div className="agent-identity-card tempo">
          <span>T</span>
          <p><strong>Tempo</strong><small>Operational evidence intelligence</small></p>
          <i>Online</i>
        </div>
      </div>

      <div className="ops-signal-strip">
        <article><span className="signal-hot">!</span><p><small>ACTIVE INCIDENT</small><strong>Checkout latency</strong></p><b>SEV-2</b></article>
        <article><span>↗</span><p><small>LAST DEPLOY</small><strong>v2026.07.25-rc4</strong></p><b>14:02 UTC</b></article>
        <article><span>⌁</span><p><small>AFFECTED</small><strong>18.4% requests</strong></p><b>Rising</b></article>
        <article><span>◇</span><p><small>CHANGE WINDOW</small><strong>Open until 15:00</strong></p><b>42 min</b></article>
      </div>

      <div className="ops-layout">
        <form className="studio-panel ops-evidence-panel" onSubmit={analyze}>
          <div className="studio-panel-heading">
            <span>01</span><div><h2>Incident evidence</h2><p>Paste or upload operational signals.</p></div>
          </div>
          <div className="ops-field-pair">
            <label className="studio-field"><span>Service</span><input value={service} onChange={(event) => setService(event.target.value)} /></label>
            <label className="studio-field"><span>Environment</span><select value={environment} onChange={(event) => setEnvironment(event.target.value)}><option>Production</option><option>Staging</option><option>Development</option></select></label>
          </div>
          <label className="studio-field evidence-editor">
            <span>Logs, alerts, deployment or infrastructure diff</span>
            <textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} minLength={8} maxLength={12000} required spellCheck={false} />
          </label>
          <input
            ref={fileInput}
            className="sr-only"
            type="file"
            accept=".txt,.log,.json,.yaml,.yml,.tf,.conf"
            onChange={(event) => event.target.files?.[0] && attachFile(event.target.files[0])}
          />
          <button className="evidence-upload" type="button" onClick={() => fileInput.current?.click()}>
            <span>↑</span><p><strong>Attach evidence file</strong><small>LOG, JSON, YAML, Terraform · up to 5 MB</small></p><b>Browse</b>
          </button>
          {evidenceFile && <div className="evidence-file"><span>▤</span><p><strong>{evidenceFile.name}</strong><small>{evidenceFile.state}</small></p></div>}
          <button className="studio-primary tempo" disabled={status === "analyzing"} type="submit">
            {status === "analyzing" ? <><i className="spinner" /> Correlating signals…</> : <>Analyze incident <span>→</span></>}
          </button>
          {error && <p className="studio-error" role="alert">{error}</p>}
        </form>

        <section className="studio-panel ops-analysis-panel" aria-live="polite">
          <div className="canvas-toolbar">
            <div><strong>Incident intelligence</strong><span>{plan ? "Evidence-backed analysis" : "Waiting for evidence"}</span></div>
            <span className="read-only-chip">Read-only analysis</span>
          </div>
          {status === "analyzing" ? (
            <div className="ops-loading"><span className="planning-orbit"><i>T</i></span><strong>Building the incident graph</strong><p>Matching changes to symptoms and testing the safest explanation.</p></div>
          ) : plan ? (
            <div className="ops-results">
              <header><span className={`risk-badge ${plan.plan.risk}`}>{plan.plan.risk} operational risk</span><h2>{plan.plan.summary}</h2><p>{plan.plan.rationale}</p></header>
              <div className="finding-list">
                {(plan.plan.findings.length ? plan.plan.findings : [{
                  title: "Primary hypothesis",
                  severity: plan.plan.risk,
                  evidence: "Tempo formed this hypothesis from the supplied operational context.",
                  recommendation: plan.plan.steps[0]?.description || "Review the proposed remediation.",
                }]).map((finding, index) => (
                  <article key={`${finding.title}-${index}`}>
                    <span className={`severity-dot ${finding.severity}`} />
                    <div><small>{finding.severity.toUpperCase()} SIGNAL</small><strong>{finding.title}</strong><p>{finding.evidence}</p><b>{finding.recommendation}</b></div>
                  </article>
                ))}
              </div>
              <div className="remediation-runbook">
                <h3>Safe remediation sequence</h3>
                {plan.plan.steps.map((step, index) => (
                  <div key={`${step.title}-${index}`}><span>{index + 1}</span><p><strong>{step.title}</strong><small>{step.description}</small></p><i>{step.requiresApproval ? "Approval" : "Observe"}</i></div>
                ))}
              </div>
            </div>
          ) : (
            <div className="ops-empty"><div className="incident-graph"><span>T</span><i /><i /><i /></div><strong>Tempo is ready to investigate</strong><p>Add your incident evidence to build a causal timeline and remediation plan.</p></div>
          )}
        </section>

        <aside className="studio-panel ops-policy-panel">
          <div className="studio-panel-heading compact"><span>02</span><div><h2>Production policy</h2><p>Enforced controls</p></div></div>
          {[
            ["Analysis", "Read-only", "green"],
            ["Rollback", "Approval", "orange"],
            ["Config change", "Approval", "orange"],
            ["Secret values", "Redacted", "violet"],
          ].map(([label, state, color]) => <div className="ops-policy-row" key={label}><span>{label}</span><b className={color}>{state}</b></div>)}
          <div className={`ops-decision ${plan?.plan.approvalRequired ? "waiting" : ""}`}>
            <span>{plan?.plan.approvalRequired ? "!" : "✓"}</span>
            <p><strong>{plan?.plan.approvalRequired ? "Approval checkpoint active" : "No production action taken"}</strong><small>Tempo recommends. Your operators decide.</small></p>
          </div>
        </aside>
      </div>
    </div>
  );
}

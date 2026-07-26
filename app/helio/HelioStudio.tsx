"use client";

import { useMemo, useRef, useState } from "react";
import type { AgentPlanResult, CostOpportunity } from "../lib/platform/model";

const sampleCostData = `provider,account,service,resource_id,region,monthly_cost,utilization_pct,owner
AWS,production,EC2,i-0a71-web-prod,us-east-1,1840,61,platform
AWS,production,RDS,orders-primary,us-east-1,2360,74,data
AWS,staging,EC2,i-091f-staging-api,us-east-1,920,7,engineering
AWS,development,EC2,i-037c-dev-worker,us-east-1,610,3,engineering
AWS,production,EBS,vol-09af-orphaned,us-east-1,380,0,unowned
AWS,production,S3,customer-exports,us-east-1,740,42,data
AWS,production,NAT Gateway,nat-0b41,us-east-1,1280,28,platform
AWS,analytics,Redshift,analytics-ra3,us-west-2,4680,31,data
AWS,production,CloudWatch,logs-prod,global,530,100,platform
AWS,production,ElastiCache,checkout-cache,us-east-1,1120,19,platform`;

function summarizeCostData(source: string) {
  const lines = source.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { rows: 0, currentSpend: 0 };
  const headers = lines[0].split(",").map((item) => item.trim().toLowerCase());
  const costIndex = headers.findIndex((item) =>
    ["monthly_cost", "cost", "amount", "spend"].includes(item),
  );
  if (costIndex < 0) return { rows: lines.length - 1, currentSpend: 0 };
  const currentSpend = lines.slice(1).reduce((total, line) => {
    const value = Number(line.split(",")[costIndex]?.replace(/[$"]/g, ""));
    return total + (Number.isFinite(value) ? Math.max(0, value) : 0);
  }, 0);
  return { rows: lines.length - 1, currentSpend };
}

function money(value: number, compact = false) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: compact ? 0 : 2,
    notation: compact ? "compact" : "standard",
  }).format(value);
}

export function HelioStudio() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [provider, setProvider] = useState("AWS");
  const [billingPeriod, setBillingPeriod] = useState("July 2026");
  const [costData, setCostData] = useState(sampleCostData);
  const [fileState, setFileState] = useState("");
  const [plan, setPlan] = useState<AgentPlanResult | null>(null);
  const [status, setStatus] = useState<"idle" | "analyzing" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const inputSummary = useMemo(() => summarizeCostData(costData), [costData]);
  const opportunities = plan?.plan.opportunities || [];
  const potentialMonthlySavings = opportunities.reduce(
    (total, item) => total + item.estimatedMonthlySavings,
    0,
  );
  const weightedConfidence = opportunities.length
    ? Math.round(
        opportunities.reduce((total, item) => total + item.confidence, 0) /
          opportunities.length,
      )
    : 0;

  async function attachFile(file: File) {
    setFileState(`Uploading ${file.name}…`);
    const text = (await file.text()).slice(0, 12000);
    setCostData(text);
    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/files", { method: "POST", body: form });
    const payload = await response.json();
    setFileState(
      response.ok
        ? `${payload.file.name} stored · ${Math.round(payload.file.size / 1024)} KB`
        : payload.error || "Upload failed",
    );
  }

  async function analyze(event: React.FormEvent) {
    event.preventDefault();
    setStatus("analyzing");
    setPlan(null);
    setError("");
    try {
      const response = await fetch("/api/agents/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: "helio",
          goal: `Analyze the ${provider} cloud cost and utilization export for ${billingPeriod}. Find anomalies, idle resources, inefficient configurations, and realistic monthly savings without double counting. Explain evidence, confidence, effort, and operational risk. Do not apply changes.`,
          context: {
            provider,
            billingPeriod,
            currency: "USD",
            currentMonthlySpend: inputSummary.currentSpend,
            forecastMonthlySpend: inputSummary.currentSpend * 1.08,
            sourceRows: inputSummary.rows,
            costData,
            attachedFile: fileState || null,
            policy: "shutdowns, rightsizing, schedules, storage changes, and commitments require approval",
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Helio could not analyze this export.");
      setPlan(payload);
      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Helio could not analyze this export.");
      setStatus("error");
    }
  }

  return (
    <div className="studio-content helio-content">
      <div className="studio-heading">
        <div>
          <span className="kicker">AI CLOUD COST OPTIMIZER</span>
          <h1>Turn cloud spend<br />into accountable savings.</h1>
          <p>Helio connects cost to utilization, resources, owners, effort, and risk—then tracks recommendations from evidence to verified savings.</p>
        </div>
        <div className="agent-identity-card helio">
          <span>H</span><p><strong>Helio</strong><small>Cloud financial intelligence</small></p><i>Online</i>
        </div>
      </div>

      <div className="helio-overview">
        <article><span>MONTHLY RUN RATE</span><strong>{money(inputSummary.currentSpend, true)}</strong><small>{inputSummary.rows} cost records loaded</small><i className="cost-sparkline cyan" /></article>
        <article><span>FORECAST</span><strong>{money(inputSummary.currentSpend * 1.08, true)}</strong><small>Based on supplied run rate</small><i className="cost-sparkline orange" /></article>
        <article className="savings-metric"><span>POTENTIAL SAVINGS</span><strong>{plan ? money(potentialMonthlySavings, true) : "—"}</strong><small>{plan ? `${money(potentialMonthlySavings * 12, true)} annualized` : "Run an evidence-backed analysis"}</small></article>
        <article><span>CONFIDENCE</span><strong>{plan ? `${weightedConfidence}%` : "—"}</strong><small>{plan ? `${opportunities.length} opportunities` : "Awaiting analysis"}</small><i className="confidence-ring" style={{"--confidence": `${weightedConfidence * 3.6}deg`} as React.CSSProperties} /></article>
      </div>

      <div className="helio-layout">
        <form className="studio-panel cost-ingestion-panel" onSubmit={analyze}>
          <div className="studio-panel-heading">
            <span>01</span><div><h2>Cost and utilization data</h2><p>Upload a billing export or inspect the sample.</p></div>
          </div>
          <div className="ops-field-pair">
            <label className="studio-field"><span>Cloud provider</span><select value={provider} onChange={(event) => setProvider(event.target.value)}><option>AWS</option><option>Azure</option><option>Google Cloud</option><option>Multi-cloud</option></select></label>
            <label className="studio-field"><span>Billing period</span><input value={billingPeriod} onChange={(event) => setBillingPeriod(event.target.value)} maxLength={32} /></label>
          </div>
          <label className="studio-field cost-data-editor">
            <span>Billing and utilization export</span>
            <textarea value={costData} onChange={(event) => setCostData(event.target.value)} minLength={8} maxLength={12000} required spellCheck={false} />
          </label>
          <input ref={fileInput} className="sr-only" type="file" accept=".csv,.json,.txt" onChange={(event) => event.target.files?.[0] && attachFile(event.target.files[0])} />
          <button className="cost-upload" type="button" onClick={() => fileInput.current?.click()}>
            <span>↑</span><p><strong>Upload billing export</strong><small>CSV, JSON, or TXT · private Appwrite storage</small></p><b>Browse</b>
          </button>
          {fileState && <div className="cost-file-state"><span>✓</span>{fileState}</div>}
          <div className="cost-input-summary">
            <div><span>Rows</span><strong>{inputSummary.rows}</strong></div>
            <div><span>Detected spend</span><strong>{money(inputSummary.currentSpend)}</strong></div>
          </div>
          <button className="studio-primary helio" disabled={status === "analyzing"} type="submit">
            {status === "analyzing" ? <><i className="spinner" /> Modeling realistic savings…</> : <>Analyze cloud spend <span>→</span></>}
          </button>
          {error && <p className="studio-error" role="alert">{error}</p>}
        </form>

        <section className="studio-panel savings-opportunity-panel" aria-live="polite">
          <div className="canvas-toolbar">
            <div><strong>Savings opportunity ledger</strong><span>{plan ? "Persisted analysis · zero double counting" : "Evidence required"}</span></div>
            <span className="read-only-chip">Recommendation only</span>
          </div>
          {status === "analyzing" ? (
            <div className="helio-loading"><span className="sun-model"><i>H</i></span><strong>Mapping cost to usage</strong><p>Helio is checking idle resources, anomalies, sizing, schedules, storage, and commitments.</p></div>
          ) : plan ? (
            <div className="opportunity-ledger">
              <header><span className={`risk-badge ${plan.plan.risk}`}>{plan.plan.risk} portfolio risk</span><h2>{plan.plan.summary}</h2><p>{plan.plan.rationale}</p></header>
              <div className="opportunity-table">
                <div className="opportunity-table-head"><span>Resource</span><span>Category</span><span>Monthly cost</span><span>Est. savings</span><span>Confidence</span><span>Control</span></div>
                {opportunities.length ? opportunities.map((opportunity, index) => (
                  <OpportunityRow opportunity={opportunity} key={`${opportunity.resourceId}-${index}`} />
                )) : (
                  <div className="no-savings"><span>✓</span><p><strong>No quantifiable opportunity found</strong><small>Helio did not invent savings without sufficient evidence.</small></p></div>
                )}
              </div>
            </div>
          ) : (
            <div className="helio-empty"><div className="cost-orbit"><span>H</span><i /><i /><i /></div><strong>Your savings ledger will appear here</strong><p>Helio quantifies only opportunities supported by the uploaded cost and utilization evidence.</p></div>
          )}
        </section>

        <aside className="studio-panel savings-tracker-panel">
          <div className="studio-panel-heading compact"><span>02</span><div><h2>Savings tracker</h2><p>Potential → approved → verified</p></div></div>
          <div className="savings-waterfall">
            <div><span>Identified</span><strong>{money(potentialMonthlySavings, true)}</strong><i style={{height: plan ? "100%" : "8%"}} /></div>
            <div><span>Approved</span><strong>$0</strong><i style={{height: "8%"}} /></div>
            <div><span>Realized</span><strong>$0</strong><i style={{height: "8%"}} /></div>
          </div>
          <div className="tracking-rule"><span>✓</span><p><strong>No savings theater</strong><small>Helio separates estimated, approved, and measured savings.</small></p></div>
          {[
            ["Shutdowns", "Approval required"],
            ["Rightsizing", "Approval required"],
            ["Commitments", "Finance approval"],
            ["Realized value", "Usage verified"],
          ].map(([label, state]) => <div className="tracker-policy" key={label}><span>{label}</span><b>{state}</b></div>)}
          <div className={`ops-decision ${plan?.plan.approvalRequired ? "waiting" : ""}`}>
            <span>{plan?.plan.approvalRequired ? "!" : "✓"}</span><p><strong>{plan?.plan.approvalRequired ? "Approval checkpoint active" : "Analysis only"}</strong><small>No cloud resource has been changed.</small></p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function OpportunityRow({ opportunity }: { opportunity: CostOpportunity }) {
  const needsApproval = opportunity.risk === "high" || opportunity.risk === "critical";
  return (
    <article className="opportunity-row">
      <div><span className="resource-mark">{opportunity.resourceName.charAt(0).toUpperCase()}</span><p><strong>{opportunity.resourceName}</strong><small>{opportunity.resourceId}</small></p></div>
      <span className="category-pill">{opportunity.category}</span>
      <strong>{money(opportunity.currentMonthlyCost)}</strong>
      <strong className="savings-value">{money(opportunity.estimatedMonthlySavings)}</strong>
      <span className="confidence-value"><i style={{width: `${opportunity.confidence}%`}} />{opportunity.confidence}%</span>
      <span className={needsApproval ? "control-pill approval" : "control-pill"}>{needsApproval ? "Approval" : opportunity.effort}</span>
      <p className="opportunity-evidence">{opportunity.evidence}</p>
    </article>
  );
}

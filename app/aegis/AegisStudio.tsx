"use client";

import { useRef, useState } from "react";
import type { AgentPlanResult } from "../lib/platform/model";

const examples = {
  Terraform: `resource "aws_s3_bucket" "customer_exports" {
  bucket = "northstar-customer-exports"
}

resource "aws_s3_bucket_public_access_block" "exports" {
  bucket                  = aws_s3_bucket.customer_exports.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "exports" {
  bucket = aws_s3_bucket.customer_exports.id
  policy = jsonencode({
    Statement = [{
      Effect = "Allow", Principal = "*", Action = "s3:GetObject",
      Resource = "\${aws_s3_bucket.customer_exports.arn}/*"
    }]
  })
}`,
  JavaScript: `app.get("/reports", async (req, res) => {
  const query = "SELECT * FROM reports WHERE owner = '" + req.query.owner + "'";
  const reports = await db.query(query);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json(reports.rows);
});`,
  YAML: `apiVersion: v1
kind: Pod
metadata:
  name: report-worker
spec:
  containers:
    - name: worker
      image: northstar/report-worker:latest
      securityContext:
        privileged: true
      env:
        - name: API_TOKEN
          value: "prod-token-in-plain-text"`,
};

export function AegisStudio() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [language, setLanguage] = useState<keyof typeof examples>("Terraform");
  const [source, setSource] = useState(examples.Terraform);
  const [fileState, setFileState] = useState("");
  const [plan, setPlan] = useState<AgentPlanResult | null>(null);
  const [status, setStatus] = useState<"idle" | "scanning" | "ready" | "error">("idle");
  const [error, setError] = useState("");

  function chooseExample(next: keyof typeof examples) {
    setLanguage(next);
    setSource(examples[next]);
    setPlan(null);
    setStatus("idle");
  }

  async function attachFile(file: File) {
    setFileState(`Uploading ${file.name}…`);
    setSource((await file.text()).slice(0, 12000));
    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/files", { method: "POST", body: form });
    const payload = await response.json();
    setFileState(response.ok ? `${payload.file.name} stored · scan pending` : payload.error || "Upload failed");
  }

  async function review(event: React.FormEvent) {
    event.preventDefault();
    setStatus("scanning");
    setPlan(null);
    setError("");
    try {
      const response = await fetch("/api/agents/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: "aegis",
          goal: `Perform a security review of this ${language} artifact. Identify only concrete, evidence-supported vulnerabilities, explain severity and exploitability, and recommend fix-ready remediation without changing the source.`,
          context: {
            language,
            source,
            attachedFile: fileState || null,
            reviewPolicy: "analysis only; patches and configuration changes require human approval",
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Aegis could not review this artifact.");
      setPlan(payload);
      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Aegis could not review this artifact.");
      setStatus("error");
    }
  }

  const findings = plan?.plan.findings || [];
  const counts = {
    critical: findings.filter((item) => item.severity === "critical").length,
    high: findings.filter((item) => item.severity === "high").length,
    medium: findings.filter((item) => item.severity === "medium").length,
    low: findings.filter((item) => item.severity === "low" || item.severity === "info").length,
  };

  return (
    <div className="studio-content security-content">
      <div className="studio-heading compact-heading">
        <div>
          <span className="kicker">AI SECURITY REVIEW ASSISTANT</span>
          <h1>Find the real risk.<br />Ship the right fix.</h1>
          <p>Aegis reviews code and configuration, grounds every finding in evidence, and prepares fixes that remain under human control.</p>
        </div>
        <div className="agent-identity-card aegis">
          <span>Æ</span><p><strong>Aegis</strong><small>Code and configuration intelligence</small></p><i>Online</i>
        </div>
      </div>

      <form className="security-review-shell" onSubmit={review}>
        <section className="studio-panel code-review-panel">
          <div className="code-toolbar">
            <div className="language-tabs">
              {(Object.keys(examples) as Array<keyof typeof examples>).map((item) => <button className={language === item ? "active" : ""} type="button" key={item} onClick={() => chooseExample(item)}>{item}</button>)}
            </div>
            <div>
              <input ref={fileInput} className="sr-only" type="file" accept=".txt,.json,.yaml,.yml,.tf,.js,.jsx,.ts,.tsx,.py,.go,.java,.rb,.php,.sh,.xml,.toml,.ini,.conf" onChange={(event) => event.target.files?.[0] && attachFile(event.target.files[0])} />
              <button type="button" onClick={() => fileInput.current?.click()}>↑ Upload artifact</button>
            </div>
          </div>
          <div className="code-editor-wrap">
            <div className="line-numbers">{source.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}</div>
            <textarea aria-label="Code or configuration to review" value={source} onChange={(event) => setSource(event.target.value)} minLength={8} maxLength={12000} required spellCheck={false} />
          </div>
          <div className="code-footer">
            <span>{fileState || `${source.split("\n").length} lines · ${language}`}</span>
            <button className="studio-primary aegis" disabled={status === "scanning"} type="submit">
              {status === "scanning" ? <><i className="spinner" /> Reviewing attack paths…</> : <>Run security review <span>→</span></>}
            </button>
          </div>
          {error && <p className="studio-error" role="alert">{error}</p>}
        </section>

        <section className="studio-panel security-findings-panel" aria-live="polite">
          <div className="security-results-heading">
            <div><span>03</span><p><strong>Review findings</strong><small>{plan ? `${findings.length} evidence-backed issues` : "No review has run yet"}</small></p></div>
            {plan && <b className={`risk-badge ${plan.plan.risk}`}>{plan.plan.risk} risk</b>}
          </div>
          {status === "scanning" ? (
            <div className="security-loading"><span className="shield-scan">Æ<i /></span><strong>Tracing trust boundaries</strong><p>Aegis is checking exploitability, exposure, and safer implementation patterns.</p></div>
          ) : plan ? (
            <>
              <div className="severity-summary">
                <div className="critical"><strong>{counts.critical}</strong><small>Critical</small></div>
                <div className="high"><strong>{counts.high}</strong><small>High</small></div>
                <div className="medium"><strong>{counts.medium}</strong><small>Medium</small></div>
                <div className="low"><strong>{counts.low}</strong><small>Low / info</small></div>
              </div>
              <div className="security-finding-list">
                {(findings.length ? findings : [{
                  title: "No concrete vulnerability identified",
                  severity: "info" as const,
                  evidence: plan.plan.rationale,
                  recommendation: "Keep the artifact under normal review and testing.",
                }]).map((finding, index) => (
                  <article key={`${finding.title}-${index}`}>
                    <span className={`finding-severity ${finding.severity}`}>{finding.severity}</span>
                    <div><strong>{finding.title}</strong><p><b>Evidence</b>{finding.evidence}</p><p><b>Recommended fix</b>{finding.recommendation}</p></div>
                  </article>
                ))}
              </div>
              <div className={`security-approval ${plan.plan.approvalRequired ? "waiting" : ""}`}>
                <span>{plan.plan.approvalRequired ? "!" : "✓"}</span><p><strong>{plan.plan.approvalRequired ? "Fix requires approval" : "Review complete"}</strong><small>Aegis has not modified the submitted artifact.</small></p>
              </div>
            </>
          ) : (
            <div className="security-empty"><span>Æ</span><strong>Your findings will appear here</strong><p>Every issue includes grounded evidence, severity, and a fix-ready recommendation.</p></div>
          )}
        </section>
      </form>
    </div>
  );
}

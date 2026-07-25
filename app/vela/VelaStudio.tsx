"use client";

import { useState } from "react";
import type { AgentPlanResult } from "../lib/platform/model";

const presets = [
  {
    label: "Vendor research",
    goal: "Research three SOC 2 compliant customer support platforms, compare pricing and integrations, and prepare a shortlist without submitting any forms.",
    target: "Public vendor websites",
  },
  {
    label: "Travel comparison",
    goal: "Compare refundable flight options from Dubai to London for next month and stop before selecting or purchasing a ticket.",
    target: "Airline and travel sites",
  },
  {
    label: "Account audit",
    goal: "Review our SaaS admin portal for inactive seats and draft a cleanup recommendation without changing user access.",
    target: "Authorized admin portal",
  },
];

export function VelaStudio() {
  const [goal, setGoal] = useState(presets[0].goal);
  const [target, setTarget] = useState(presets[0].target);
  const [plan, setPlan] = useState<AgentPlanResult | null>(null);
  const [status, setStatus] = useState<"idle" | "planning" | "ready" | "error">("idle");
  const [error, setError] = useState("");

  async function createPlan(event: React.FormEvent) {
    event.preventDefault();
    setStatus("planning");
    setError("");
    setPlan(null);

    try {
      const response = await fetch("/api/agents/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: "vela",
          goal,
          context: {
            target,
            mode: "read-only-first",
            submitPolicy: "always-require-approval",
            purchasePolicy: "always-require-approval",
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Vela could not create a plan.");
      setPlan(payload);
      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Vela could not create a plan.");
      setStatus("error");
    }
  }

  return (
    <div className="studio-content">
      <div className="studio-heading">
        <div>
          <span className="kicker">AUTONOMOUS BROWSER AGENT</span>
          <h1>Give Vela the outcome.<br />Keep control of the action.</h1>
          <p>Vela turns a web task into an inspectable plan and pauses before submissions, purchases, or account changes.</p>
        </div>
        <div className="agent-identity-card vela">
          <span>V</span>
          <p><strong>Vela</strong><small>DeepSeek V4 · guarded planning</small></p>
          <i>Online</i>
        </div>
      </div>

      <div className="studio-layout vela-layout">
        <form className="studio-panel task-composer" onSubmit={createPlan}>
          <div className="studio-panel-heading">
            <span>01</span>
            <div><h2>Describe the mission</h2><p>Be specific about the outcome and boundaries.</p></div>
          </div>
          <label className="studio-field">
            <span>Browser task</span>
            <textarea
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              minLength={8}
              maxLength={6000}
              required
            />
          </label>
          <label className="studio-field">
            <span>Allowed destination</span>
            <input value={target} onChange={(event) => setTarget(event.target.value)} />
          </label>
          <div className="preset-row">
            {presets.map((preset) => (
              <button
                type="button"
                key={preset.label}
                onClick={() => {
                  setGoal(preset.goal);
                  setTarget(preset.target);
                  setPlan(null);
                  setStatus("idle");
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <button className="studio-primary vela" disabled={status === "planning"} type="submit">
            {status === "planning" ? <><i className="spinner" /> Vela is planning…</> : <>Plan browser mission <span>→</span></>}
          </button>
          {error && <p className="studio-error" role="alert">{error}</p>}
        </form>

        <section className="studio-panel plan-stage" aria-live="polite">
          <div className="browser-frame">
            <div className="browser-toolbar">
              <div><i /><i /><i /></div>
              <span>Secure browser session · preview only</span>
              <b>⌁</b>
            </div>
            {status === "planning" ? (
              <div className="planning-state">
                <span className="planning-orbit"><i>V</i></span>
                <strong>Mapping the safest route</strong>
                <p>Vela is decomposing the task, identifying irreversible actions, and placing approval gates.</p>
              </div>
            ) : plan ? (
              <div className="generated-plan">
                <div className="plan-summary">
                  <span className={`risk-badge ${plan.plan.risk}`}>{plan.plan.risk} risk</span>
                  <h2>{plan.plan.summary}</h2>
                  <p>{plan.plan.rationale}</p>
                </div>
                <div className="plan-steps">
                  {plan.plan.steps.map((step, index) => (
                    <article key={`${step.title}-${index}`}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div><strong>{step.title}</strong><p>{step.description}</p></div>
                      <i className={step.requiresApproval ? "approval" : "safe"}>
                        {step.requiresApproval ? "Approval" : "Planned"}
                      </i>
                    </article>
                  ))}
                </div>
                <div className={`plan-decision ${plan.plan.approvalRequired ? "waiting" : "clear"}`}>
                  <span>{plan.plan.approvalRequired ? "!" : "✓"}</span>
                  <p>
                    <strong>{plan.plan.approvalRequired ? "Human checkpoint created" : "Plan is safe to review"}</strong>
                    <small>{plan.plan.approvalRequired ? "No gated action will run until an authorized approver decides." : "This run contains no irreversible action."}</small>
                  </p>
                </div>
              </div>
            ) : (
              <div className="browser-empty">
                <div className="browser-empty-grid" />
                <span>V</span>
                <strong>Your browser mission will appear here</strong>
                <p>Vela plans first. Execution and every sensitive checkpoint remain visible.</p>
              </div>
            )}
          </div>
        </section>

        <aside className="studio-panel guardrail-panel">
          <div className="studio-panel-heading compact">
            <span>02</span>
            <div><h2>Session guardrails</h2><p>Locked platform policy</p></div>
          </div>
          {[
            ["Read-only first", "Vela starts by observing and collecting evidence.", true],
            ["Form submissions", "Always pause before sending data.", true],
            ["Purchases", "Always require explicit approval.", true],
            ["Credential access", "Never reveal or export secrets.", true],
          ].map(([title, detail, locked]) => (
            <div className="policy-row" key={String(title)}>
              <span className="policy-check">✓</span>
              <p><strong>{title}</strong><small>{detail}</small></p>
              {locked && <i>Locked</i>}
            </div>
          ))}
          <div className="session-note">
            <span>⌾</span>
            <p><strong>Evidence captured</strong><small>Future execution will retain screenshots, decisions, and an audit trail.</small></p>
          </div>
        </aside>
      </div>
    </div>
  );
}

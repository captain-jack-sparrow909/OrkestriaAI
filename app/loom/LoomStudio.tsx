"use client";

import { useState } from "react";
import type { AgentPlanResult } from "../lib/platform/model";

const templates = [
  "Qualify inbound leads and alert sales",
  "Triage support requests and draft replies",
  "Summarize deployment alerts for engineering",
];

const connectorMarks: Record<string, string> = {
  research: "⌕",
  analyze: "◇",
  transform: "✦",
  notify: "↗",
  write: "✎",
  external_action: "!",
};

export function LoomStudio() {
  const [name, setName] = useState("Enterprise lead concierge");
  const [goal, setGoal] = useState(
    "When a new enterprise lead arrives, enrich the company, score fit, draft a tailored introduction, and ask for approval before notifying the sales channel.",
  );
  const [trigger, setTrigger] = useState("New CRM lead");
  const [plan, setPlan] = useState<AgentPlanResult | null>(null);
  const [status, setStatus] = useState<"idle" | "planning" | "ready" | "error">("idle");
  const [error, setError] = useState("");

  async function generateWorkflow(event: React.FormEvent) {
    event.preventDefault();
    setStatus("planning");
    setError("");

    try {
      const response = await fetch("/api/agents/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: "loom",
          goal,
          context: {
            workflowName: name,
            trigger,
            connectedApps: ["CRM", "Web research", "Email", "Team chat"],
            approvalPolicy: "external messages require approval",
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Loom could not generate this workflow.");
      setPlan(payload);
      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Loom could not generate this workflow.");
      setStatus("error");
    }
  }

  const steps = plan?.plan.steps ?? [
    { title: trigger, kind: "research", description: "Workflow trigger", requiresApproval: false },
    { title: "Enrich company", kind: "analyze", description: "Research and score account fit", requiresApproval: false },
    { title: "Approval gate", kind: "external_action", description: "Review outbound message", requiresApproval: true },
  ];

  return (
    <div className="studio-content loom-content">
      <div className="studio-heading compact-heading">
        <div>
          <span className="kicker">AI WORKFLOW BUILDER</span>
          <h1>Describe the work.<br />Loom builds the flow.</h1>
          <p>Connect triggers, AI reasoning, business apps, and human judgment in one inspectable automation.</p>
        </div>
        <div className="agent-identity-card loom">
          <span>L</span>
          <p><strong>Loom</strong><small>Natural-language workflow architect</small></p>
          <i>Online</i>
        </div>
      </div>

      <div className="loom-workspace">
        <form className="studio-panel loom-composer" onSubmit={generateWorkflow}>
          <div className="studio-panel-heading">
            <span>01</span>
            <div><h2>Workflow brief</h2><p>Tell Loom what should happen and where judgment belongs.</p></div>
          </div>
          <label className="studio-field">
            <span>Workflow name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
          </label>
          <label className="studio-field">
            <span>When this happens</span>
            <select value={trigger} onChange={(event) => setTrigger(event.target.value)}>
              <option>New CRM lead</option>
              <option>Support ticket created</option>
              <option>Deployment alert received</option>
              <option>Scheduled every morning</option>
            </select>
          </label>
          <label className="studio-field">
            <span>Describe the automation</span>
            <textarea value={goal} onChange={(event) => setGoal(event.target.value)} minLength={8} maxLength={6000} required />
          </label>
          <div className="template-stack">
            <span>Quick starts</span>
            {templates.map((template) => (
              <button type="button" key={template} onClick={() => setGoal(template)}>
                <i>✦</i>{template}<b>+</b>
              </button>
            ))}
          </div>
          <button className="studio-primary loom" disabled={status === "planning"} type="submit">
            {status === "planning" ? <><i className="spinner" /> Loom is weaving…</> : <>Generate workflow <span>→</span></>}
          </button>
          {error && <p className="studio-error" role="alert">{error}</p>}
        </form>

        <section className="studio-panel loom-canvas" aria-live="polite">
          <div className="canvas-toolbar">
            <div><strong>{name || "Untitled workflow"}</strong><span>{plan ? "Saved as a guarded run" : "Draft"}</span></div>
            <div className="canvas-tools"><button aria-label="Zoom out">−</button><span>100%</span><button aria-label="Zoom in">+</button></div>
          </div>
          <div className={`workflow-canvas-body ${status === "planning" ? "is-planning" : ""}`}>
            <div className="canvas-grid" />
            {status === "planning" && (
              <div className="canvas-planning">
                <i className="spinner" />
                <strong>Weaving your workflow</strong>
                <span>Choosing steps, data boundaries, and approval gates…</span>
              </div>
            )}
            <div className="workflow-lane">
              {steps.map((step, index) => (
                <div className="workflow-node-wrap" key={`${step.title}-${index}`}>
                  <article className={`workflow-node-card ${step.requiresApproval ? "approval" : ""}`}>
                    <span className="node-mark">{connectorMarks[step.kind] || "◇"}</span>
                    <div>
                      <small>{index === 0 ? "TRIGGER" : step.requiresApproval ? "HUMAN CHECKPOINT" : step.kind.replaceAll("_", " ").toUpperCase()}</small>
                      <strong>{step.title}</strong>
                      <p>{step.description}</p>
                    </div>
                    <i>{step.requiresApproval ? "Required" : "Ready"}</i>
                  </article>
                  {index < steps.length - 1 && <span className="node-connector"><i /></span>}
                </div>
              ))}
              <button className="add-node" aria-label="Add workflow step">+</button>
            </div>
          </div>
          {plan && (
            <div className="loom-plan-footer">
              <span className={`risk-badge ${plan.plan.risk}`}>{plan.plan.risk} risk</span>
              <p><strong>{plan.plan.summary}</strong><small>{plan.plan.rationale}</small></p>
              <b>{plan.plan.approvalRequired ? "Approval protected" : "Ready for review"}</b>
            </div>
          )}
        </section>

        <aside className="studio-panel connector-rail">
          <div className="studio-panel-heading compact">
            <span>02</span>
            <div><h2>Connected apps</h2><p>Phase 2 connector palette</p></div>
          </div>
          {[
            ["C", "CRM", "Lead data", "violet"],
            ["W", "Web research", "Public sources", "cyan"],
            ["M", "Email", "Draft only", "orange"],
            ["#", "Team chat", "Approval required", "pink"],
          ].map(([mark, app, detail, color]) => (
            <div className="connector-row" key={app}>
              <span className={color}>{mark}</span>
              <p><strong>{app}</strong><small>{detail}</small></p>
              <i>Connected</i>
            </div>
          ))}
          <button className="connector-add">+ Add connection</button>
          <div className="session-note">
            <span>!</span>
            <p><strong>Human-in-the-loop</strong><small>Loom inserts approval before messages, writes, and consequential actions.</small></p>
          </div>
        </aside>
      </div>
    </div>
  );
}

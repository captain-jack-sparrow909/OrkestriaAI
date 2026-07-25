"use client";

import Link from "next/link";
import { useState } from "react";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";

const suites = [
  {
    id: "atlas",
    number: "01",
    mark: "A",
    name: "Vela",
    title: "Browser intelligence",
    description:
      "Give Vela an outcome. It researches, navigates, and completes the work—pausing at the exact moment human judgment matters.",
    signal: "3 approvals waiting",
    color: "violet",
  },
  {
    id: "loom",
    number: "02",
    mark: "L",
    name: "Loom",
    title: "Workflow studio",
    description:
      "Describe a process in plain English and Loom turns it into an observable, editable automation across your tools.",
    signal: "18 flows healthy",
    color: "lime",
  },
  {
    id: "sentry",
    number: "03",
    mark: "S",
    name: "Tempo",
    title: "DevOps copilot",
    description:
      "Connect deployments, alerts, infrastructure, and logs. Tempo finds the likely cause and proposes the safest next move.",
    signal: "All systems nominal",
    color: "orange",
  },
  {
    id: "helio",
    number: "04",
    mark: "H",
    name: "Helio",
    title: "Cloud cost intelligence",
    description:
      "Turn noisy billing data into defensible savings—with resource-level evidence, owner context, and realistic forecasts.",
    signal: "$31.4k found",
    color: "cyan",
  },
  {
    id: "aegis",
    number: "05",
    mark: "Æ",
    name: "Aegis",
    title: "Security review",
    description:
      "Review code, cloud configuration, and dependencies continuously. Every finding arrives explained, prioritized, and fix-ready.",
    signal: "94% coverage",
    color: "pink",
  },
];

const scenarios = [
  {
    label: "Production incident",
    query: "Investigate the checkout latency spike after today’s deployment.",
    agent: "Tempo",
    steps: [
      ["Correlated deploy #482 with p95 latency", "done"],
      ["Found N+1 query in checkout-service", "done"],
      ["Prepared a safe rollback plan", "done"],
      ["Rollback production deployment", "approval"],
    ],
  },
  {
    label: "Cloud savings",
    query: "Find savings that won’t affect our customer workloads.",
    agent: "Helio",
    steps: [
      ["Analyzed 90 days of utilization", "done"],
      ["Excluded tagged critical workloads", "done"],
      ["Found 12 idle non-production resources", "done"],
      ["Schedule shutdown policy", "approval"],
    ],
  },
  {
    label: "Vendor research",
    query: "Compare SOC 2 vendors and shortlist the best three for us.",
    agent: "Vela",
    steps: [
      ["Reviewed 28 verified vendor pages", "done"],
      ["Normalized pricing and feature data", "done"],
      ["Prepared weighted comparison", "done"],
      ["Send shortlist to procurement", "approval"],
    ],
  },
];

export default function Home() {
  const [activeScenario, setActiveScenario] = useState(0);
  const [approved, setApproved] = useState(false);
  const scenario = scenarios[activeScenario];

  const chooseScenario = (index: number) => {
    setActiveScenario(index);
    setApproved(false);
  };

  return (
    <main>
      <SiteHeader />

      <section className="hero shell">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            AI work, orchestrated
          </div>
          <h1>
            Intelligence that
            <span>gets work done.</span>
          </h1>
          <p className="hero-lede">
            One secure control plane for AI agents that browse, automate,
            operate, optimize, and protect your business.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/sign-in">
              Start orchestrating
              <span aria-hidden="true">↗</span>
            </Link>
            <Link className="text-link" href="/products">
              Explore the platform <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="hero-proof">
            <div className="avatars" aria-hidden="true">
              <span>RK</span><span>MO</span><span>AL</span>
            </div>
            <p><strong>2,400+ teams</strong><br />building with human control</p>
          </div>
        </div>

        <div className="hero-console" aria-label="OrkestriaAI command center preview">
          <div className="console-orbit console-orbit-one" />
          <div className="console-orbit console-orbit-two" />
          <div className="console-card">
            <div className="console-topbar">
              <div className="mini-brand"><span className="brand-glyph">O</span> Control center</div>
              <div className="live-pill"><span /> Live</div>
            </div>
            <div className="console-body">
              <div className="console-greeting">
                <span>Good morning, Jabir</span>
                <strong>What should we orchestrate?</strong>
              </div>
              <div className="command-input">
                <span className="command-spark">✦</span>
                <p>{scenario.query}</p>
                <span className="command-arrow">↗</span>
              </div>
              <div className="scenario-tabs" aria-label="Choose a demo scenario">
                {scenarios.map((item, index) => (
                  <button
                    className={index === activeScenario ? "active" : ""}
                    key={item.label}
                    onClick={() => chooseScenario(index)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="run-panel">
                <div className="run-header">
                  <div>
                    <span className="agent-mark">{scenario.agent[0]}</span>
                    <p><strong>{scenario.agent} is working</strong><small>Run #OR-2048 · 46s</small></p>
                  </div>
                  <span className="run-status">In progress</span>
                </div>
                <div className="run-steps">
                  {scenario.steps.map(([label, state], index) => (
                    <div className={`run-step ${state}`} key={label}>
                      <span className="step-icon">{state === "done" ? "✓" : "!"}</span>
                      <p>{label}</p>
                      {state === "done" && <small>{12 + index * 4}s</small>}
                    </div>
                  ))}
                </div>
                <div className={`approval-card ${approved ? "approved" : ""}`}>
                  <div className="approval-icon">{approved ? "✓" : "!"}</div>
                  <div>
                    <strong>{approved ? "Action approved" : "Your approval is required"}</strong>
                    <p>{approved ? "Orkestria is continuing the run." : scenario.steps[3][0]}</p>
                  </div>
                  {!approved && (
                    <button onClick={() => setApproved(true)}>Review</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="trust-strip">
        <div className="shell trust-inner">
          <p>Built for teams that ship responsibly</p>
          <div className="logo-row" aria-label="Example customer industries">
            <span>northstar<span className="logo-dot">.</span></span>
            <span>ARC / LABS</span>
            <span>MONOLITH</span>
            <span>FOLD<span className="logo-cube">◇</span></span>
            <span>sembl</span>
          </div>
        </div>
      </section>

      <section className="section shell" id="suite">
        <div className="section-heading split-heading">
          <div>
            <span className="kicker">THE ORKESTRIA SUITE</span>
            <h2>Five specialists.<br />One shared context.</h2>
          </div>
          <p>
            Each agent is exceptional on its own. Together, they share context,
            permissions, and a complete audit trail.
          </p>
        </div>
        <div className="suite-grid">
          {suites.map((suite) => (
            <article className={`suite-card ${suite.color}`} key={suite.id}>
              <div className="suite-top">
                <span className="suite-number">{suite.number}</span>
                <span className="suite-signal"><i />{suite.signal}</span>
              </div>
              <div className="suite-mark">{suite.mark}</div>
              <div className="suite-copy">
                <span>{suite.name}</span>
                <h3>{suite.title}</h3>
                <p>{suite.description}</p>
              </div>
              <Link href={`/products#${suite.id}`} aria-label={`Learn about ${suite.name}`}>
                Meet {suite.name} <span>↗</span>
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="control-section">
        <div className="shell">
          <div className="section-heading centered">
            <span className="kicker">HUMANS SET THE BOUNDARIES</span>
            <h2>Autonomy without the anxiety.</h2>
            <p>
              Orkestria acts independently inside your guardrails—and stops
              before money moves, data leaves, or infrastructure changes.
            </p>
          </div>
          <div className="control-grid">
            <div className="control-visual">
              <div className="radar-ring ring-one" />
              <div className="radar-ring ring-two" />
              <div className="radar-ring ring-three" />
              <div className="radar-center">
                <span className="brand-glyph large">O</span>
                <small>Policy engine</small>
              </div>
              <div className="orbit-label label-one"><span>✓</span> Read logs</div>
              <div className="orbit-label label-two"><span>✓</span> Compare costs</div>
              <div className="orbit-label label-three"><span>!</span> Deploy change</div>
              <div className="orbit-label label-four"><span>!</span> Send data</div>
            </div>
            <div className="guardrail-list">
              <div>
                <span>01</span>
                <h3>Granular permissions</h3>
                <p>Set tools, data, environments, and spend limits by role, agent, or workflow.</p>
              </div>
              <div>
                <span>02</span>
                <h3>Approval checkpoints</h3>
                <p>Route sensitive actions to the right person through a shared approval inbox.</p>
              </div>
              <div>
                <span>03</span>
                <h3>Explainable by design</h3>
                <p>Inspect every decision, source, action, and policy evaluation in plain language.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section shell">
        <div className="outcome-card">
          <div className="outcome-copy">
            <span className="kicker kicker-light">ONE COMMAND CENTER</span>
            <h2>From signal to safe action.</h2>
            <p>
              Orkestria turns fragmented operational data into a coordinated
              plan your team can understand, approve, and trust.
            </p>
            <Link className="button button-light" href="/workflows">
              See how it works <span>→</span>
            </Link>
          </div>
          <div className="outcome-metrics">
            <div><strong>71%</strong><span>Less manual ops work</span></div>
            <div><strong>8.2h</strong><span>Saved per teammate / week</span></div>
            <div><strong>100%</strong><span>Actions auditable</span></div>
            <div><strong>0</strong><span>Unapproved risky actions</span></div>
          </div>
        </div>
      </section>

      <section className="final-cta">
        <div className="shell final-cta-inner">
          <div className="cta-symbol" aria-hidden="true">O</div>
          <span className="kicker">YOUR AI OPERATIONS LAYER</span>
          <h2>Give your team<br />room to think bigger.</h2>
          <p>Orkestria handles the operational work. Your people stay in control.</p>
          <div className="hero-actions centered-actions">
            <Link className="button button-primary" href="/sign-in">Start for free <span>↗</span></Link>
            <Link className="button button-ghost" href="/pricing">View pricing</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

import Link from "next/link";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

const products = [
  {
    id: "atlas",
    mark: "A",
    kicker: "AUTONOMOUS BROWSER AGENT",
    name: "Vela",
    title: "A capable pair of hands for the open web.",
    description:
      "Vela turns a goal into a transparent research and execution plan. It can navigate authenticated tools, compare information, collect evidence, and fill complex forms—then pauses before any purchase, submission, or irreversible action.",
    features: ["Multi-tab planning", "Source traceability", "Session isolation", "Action approvals"],
    rows: [
      ["01", "Research target vendors", "24 sources"],
      ["02", "Build comparison model", "Complete"],
      ["!", "Submit procurement brief", "Approval"],
    ],
  },
  {
    id: "loom",
    mark: "L",
    kicker: "AI WORKFLOW BUILDER",
    name: "Loom",
    title: "Describe the work. Loom builds the flow.",
    description:
      "Loom converts natural-language instructions into reliable, inspectable automations. Connect triggers, decisions, transformations, apps, and human checkpoints—without turning business logic into a black box.",
    features: ["Natural-language builder", "Versioned workflows", "Retry & recovery", "100+ connectors"],
    rows: [
      ["G", "New qualified lead", "Trigger"],
      ["✦", "Enrich and score company", "AI step"],
      ["S", "Notify account owner", "Action"],
    ],
  },
  {
    id: "sentry",
    mark: "S",
    kicker: "AI DEVOPS ASSISTANT",
    name: "Tempo",
    title: "See the problem. Understand the risk. Act safely.",
    description:
      "Tempo correlates deployments, traces, logs, alerts, and infrastructure changes to explain incidents in context. It recommends evidence-backed remediations and routes production changes through your approval policy.",
    features: ["Incident correlation", "Change intelligence", "Runbook execution", "Safe rollback plans"],
    rows: [
      ["!", "Checkout p95 elevated", "+186ms"],
      ["✓", "Likely cause identified", "92%"],
      ["↶", "Rollback prepared", "Approval"],
    ],
  },
  {
    id: "helio",
    mark: "H",
    kicker: "AI CLOUD COST OPTIMIZER",
    name: "Helio",
    title: "Savings your engineers will actually trust.",
    description:
      "Helio connects bills to resources, utilization, owners, commitments, and business context. Every recommendation includes the evidence, effort, risk, and forecast needed to make a confident decision.",
    features: ["Unit economics", "Anomaly detection", "Rightsizing", "Savings verification"],
    rows: [
      ["$", "Idle non-prod compute", "$12.4k"],
      ["↓", "Rightsizing opportunities", "$8.7k"],
      ["◇", "Commitment optimization", "$10.3k"],
    ],
  },
  {
    id: "aegis",
    mark: "Æ",
    kicker: "AI SECURITY REVIEW ASSISTANT",
    name: "Aegis",
    title: "Security findings that lead to better code.",
    description:
      "Aegis reviews application code, dependencies, infrastructure-as-code, and cloud configuration. It removes duplicate noise, explains real exploitability, and produces fix-ready guidance for developers.",
    features: ["Code & IaC scanning", "Exploitability context", "Policy as code", "Developer-ready fixes"],
    rows: [
      ["H", "Exposed storage policy", "High"],
      ["M", "Outdated dependency", "Medium"],
      ["✓", "Secrets scan", "Clear"],
    ],
  },
];

export const metadata = {
  title: "Product suite — OrkestriaAI",
  description: "Meet Vela, Loom, Tempo, Helio, and Aegis—the OrkestriaAI operations suite.",
};

export default function ProductsPage() {
  return (
    <main>
      <SiteHeader />
      <section className="page-hero">
        <div className="shell page-hero-grid">
          <div>
            <span className="kicker">THE PRODUCT SUITE</span>
            <h1>Specialists by design.<br /><em>Unified by context.</em></h1>
          </div>
          <p>
            Five purpose-built AI products share one permission system, one
            approval inbox, and one complete record of how work gets done.
          </p>
        </div>
      </section>
      <section className="section shell">
        <div className="page-intro">
          <h2>Meet the orchestra.</h2>
          <p>Start with one product. Add the rest when you are ready. Shared context means every new agent becomes useful faster.</p>
        </div>
        {products.map((product) => (
          <article className="product-detail" id={product.id} key={product.id}>
            <div className="product-detail-copy">
              <div className="suite-mark">{product.mark}</div>
              <span className="kicker">{product.kicker}</span>
              <h2>{product.name}: {product.title}</h2>
              <p>{product.description}</p>
              <div className="feature-list">
                {product.features.map((feature) => <span key={feature}>{feature}</span>)}
              </div>
            </div>
            <div className="product-stage">
              <div className="stage-window">
                <div className="stage-top"><i /><i /><i /></div>
                <div className="stage-body">
                  <div className="stage-title">
                    <strong>{product.name} activity</strong>
                    <span>● Live context</span>
                  </div>
                  {product.rows.map(([icon, label, status]) => (
                    <div className="data-row" key={label}>
                      <span>{icon}</span>
                      <p>{label}<small>Evidence and reasoning attached</small></p>
                      <small>{status}</small>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>
      <section className="final-cta">
        <div className="shell final-cta-inner">
          <span className="kicker">START WITH ONE. SCALE TO FIVE.</span>
          <h2>Build your AI<br />operations team.</h2>
          <p>Every product includes human approvals, shared context, and full auditability.</p>
          <div className="hero-actions centered-actions">
            <Link className="button button-primary" href="/sign-in">Start for free <span>↗</span></Link>
            <Link className="button button-ghost" href="/pricing">Compare plans</Link>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

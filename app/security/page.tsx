import Link from "next/link";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

const controls = [
  ["01", "Identity & access", "Role-based permissions, team-level policies, SSO-ready identity, scoped service accounts, and short-lived sessions keep access intentional."],
  ["02", "Human approval engine", "Policy evaluates risk, data sensitivity, destination, environment, and spend before deciding whether an agent can proceed."],
  ["03", "Complete audit trail", "Every prompt, tool call, source, decision, approval, and output is recorded with actor and timestamp context."],
  ["04", "Data boundaries", "Workspace isolation, configurable retention, encrypted storage, secret vaulting, and redaction controls protect sensitive context."],
  ["05", "Secure execution", "Sandboxed browser sessions and background workers use least-privilege credentials, strict timeouts, and egress policies."],
  ["06", "Operational resilience", "Rate limits, job retries, dead-letter queues, cache controls, structured logs, tracing, alerts, and health monitors ship as platform primitives."],
];

export const metadata = {
  title: "Trust & security — OrkestriaAI",
  description: "Human approval, least privilege, auditability, and secure execution are built into OrkestriaAI.",
};

export default function SecurityPage() {
  return (
    <main>
      <SiteHeader />
      <section className="page-hero">
        <div className="shell page-hero-grid">
          <div>
            <span className="kicker">TRUST CENTER</span>
            <h1>Powerful agents.<br /><em>Clear boundaries.</em></h1>
          </div>
          <p>
            OrkestriaAI is designed around a simple principle: more autonomy
            should create more visibility and control—not less.
          </p>
        </div>
      </section>
      <section className="section shell">
        <div className="trust-layout">
          <div className="sticky-intro">
            <span className="kicker">SECURE BY ARCHITECTURE</span>
            <h2>Trust is a product feature.</h2>
            <p>
              Safety is not a confirmation dialog added at the end. It is the
              operating model beneath every agent, workflow, integration, and
              action.
            </p>
            <Link className="button button-primary" href="/sign-in">Talk to security <span>↗</span></Link>
          </div>
          <div className="trust-stack">
            {controls.map(([number, title, description]) => (
              <article className="trust-card" key={number}>
                <div className="trust-card-top">
                  <span className="trust-card-icon">{number}</span>
                  <small>CONTROL / {number}</small>
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
        <div className="cert-row" aria-label="Security program targets">
          <span>SOC 2 TYPE II READY</span>
          <span>GDPR ALIGNED</span>
          <span>ENCRYPTED AT REST</span>
          <span>AUDIT LOG EXPORT</span>
          <span>REGIONAL DATA CONTROLS</span>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

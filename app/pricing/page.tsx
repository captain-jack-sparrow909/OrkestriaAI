"use client";

import { useState } from "react";
import Link from "next/link";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

const plans = [
  {
    tag: "FOR EXPLORING TEAMS",
    name: "Starter",
    monthly: 0,
    annual: 0,
    description: "Build your first AI workflows and prove value with your team.",
    features: ["3 team members", "2 active agents", "1,000 actions / month", "Community support", "7-day run history"],
    cta: "Start free",
  },
  {
    tag: "FOR GROWING OPERATIONS",
    name: "Orchestrate",
    monthly: 99,
    annual: 79,
    description: "Operate across teams with approvals, richer context, and control.",
    features: ["15 team members", "All 5 AI products", "25,000 actions / month", "Advanced approvals & RBAC", "90-day audit history", "Priority support"],
    cta: "Start 14-day trial",
    featured: true,
  },
  {
    tag: "FOR COMPLEX ORGANIZATIONS",
    name: "Enterprise",
    monthly: null,
    annual: null,
    description: "Govern AI operations with custom security, scale, and support.",
    features: ["Unlimited team members", "Custom action volume", "SAML SSO & SCIM", "Private networking", "Custom data retention", "Dedicated success manager"],
    cta: "Contact sales",
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(true);

  return (
    <main>
      <SiteHeader />
      <section className="page-hero">
        <div className="shell page-hero-grid">
          <div>
            <span className="kicker">SIMPLE, SCALABLE PRICING</span>
            <h1>Start small.<br /><em>Orchestrate more.</em></h1>
          </div>
          <div>
            <p>Every plan includes secure execution, human approval checkpoints, and a complete action history.</p>
            <div className="pricing-toggle">
              <button className={!annual ? "active" : ""} onClick={() => setAnnual(false)}>Monthly</button>
              <button className={annual ? "active" : ""} onClick={() => setAnnual(true)}>Annual · save 20%</button>
            </div>
          </div>
        </div>
      </section>
      <section className="section shell">
        <div className="pricing-grid">
          {plans.map((plan) => {
            const price = annual ? plan.annual : plan.monthly;
            return (
              <article className={`price-card ${plan.featured ? "featured" : ""}`} key={plan.name}>
                {plan.featured && <span className="popular-pill">Most popular</span>}
                <span>{plan.tag}</span>
                <h2>{plan.name}</h2>
                <div className="price">
                  {price === null ? "Let’s talk" : `$${price}`}
                  {price !== null && price > 0 && <small> / user / mo</small>}
                </div>
                <p>{plan.description}</p>
                <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
                <Link className={`button ${plan.featured ? "button-primary" : ""}`} href="/sign-in">
                  {plan.cta} <span>↗</span>
                </Link>
              </article>
            );
          })}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

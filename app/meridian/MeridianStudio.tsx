"use client";

import { useEffect, useMemo, useState } from "react";
import type { MeridianOverview } from "../lib/platform/model";

function pretty(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

const pillarMark: Record<string, string> = {
  trust: "◇",
  customer_value: "✦",
  efficient_scale: "↗",
};

export function MeridianStudio() {
  const [overview, setOverview] = useState<MeridianOverview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [initiative, setInitiative] = useState({
    goalId: "",
    name: "Customer evidence exchange",
    expectedImpact:
      "Shorten the path from a self-reported outcome to independent verification without weakening consent or access controls.",
    proposedBudgetDollars: 18000,
    requiredHeadcount: 2,
  });
  const [capacity, setCapacity] = useState({
    budgetDollars: 50000,
    availableHeadcount: 6,
  });
  const [scenario, setScenario] = useState({
    title: "Trust-first growth portfolio",
    budgetLimitDollars: 50000,
    headcountLimit: 6,
    horizonMonths: 12,
  });
  const [rationale, setRationale] = useState(
    "Hold investment authorization until strategic goals, capacity, dependencies, and scenario forecasts are independently verified.",
  );

  async function applyOverview(payload: MeridianOverview) {
    setOverview(payload);
    setSelected((current) =>
      current.length ? current : payload.initiatives.slice(0, 3).map((item) => item.$id),
    );
    setInitiative((current) => ({
      ...current,
      goalId: current.goalId || payload.goals[0]?.$id || "",
    }));
    setCapacity({
      budgetDollars: payload.capacity.budgetCents / 100,
      availableHeadcount: payload.capacity.availableHeadcount,
    });
    setScenario((current) => ({
      ...current,
      budgetLimitDollars: payload.capacity.budgetCents / 100,
      headcountLimit: payload.capacity.availableHeadcount,
    }));
  }

  async function load() {
    const response = await fetch("/api/meridian", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Meridian is unavailable.");
    await applyOverview(payload);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/meridian", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Meridian is unavailable.");
        if (!active) return;
        await applyOverview(payload);
        setStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Meridian is unavailable.");
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
      const response = await fetch("/api/meridian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, workspaceId: overview.workspaceId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Portfolio action failed.");
      await load();
      return payload;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Portfolio action failed.");
      return null;
    } finally {
      setBusy("");
    }
  }

  const currentScenario = overview?.scenarios[0];
  const forecasts = useMemo(
    () =>
      overview && currentScenario
        ? overview.forecasts.filter((item) => item.scenarioId === currentScenario.$id)
        : [],
    [overview, currentScenario],
  );
  const selectedInitiatives = overview?.initiatives.filter((item) =>
    selected.includes(item.$id),
  ) || [];
  const selectedBudget = selectedInitiatives.reduce(
    (sum, item) => sum + item.proposedBudgetCents,
    0,
  );
  const selectedHeadcount = selectedInitiatives.reduce(
    (sum, item) => sum + item.requiredHeadcount,
    0,
  );
  const selectedGoalIds = new Set(selectedInitiatives.map((item) => item.goalId));
  const decisionChecks = [
    [selectedInitiatives.length > 0, "Initiatives selected"],
    [
      [...selectedGoalIds].every((goalId) =>
        overview?.goals.some((goal) => goal.$id === goalId && goal.verified === 1),
      ),
      "Strategic goals verified",
    ],
    [overview?.capacity.externalVerified === 1, "Capacity externally verified"],
    [
      overview?.dependencies
        .filter((item) => selected.includes(item.initiativeId))
        .every((item) => item.resolved === 1) ?? false,
      "Dependencies resolved",
    ],
    [currentScenario?.status === "verified", "Scenario independently verified"],
    [
      forecasts.length === 4 &&
        forecasts.every((item) => item.status === "verified" && item.confidenceBps >= 8000),
      "Decision-grade forecasts",
    ],
  ] as const;
  const decisionReady = decisionChecks.every(([passed]) => passed);

  if (status === "loading") {
    return <div className="meridian-loading"><span>✣</span><strong>Plotting the strategic horizon</strong><p>Loading goals, initiatives, dependencies, capacity, scenarios, forecasts, and investment controls.</p></div>;
  }
  if (!overview || status === "error") {
    return <div className="meridian-loading error"><span>!</span><strong>Meridian unavailable</strong><p>{message}</p></div>;
  }

  return (
    <div className="meridian-content">
      <header className="meridian-hero">
        <div><span className="kicker">STRATEGIC PLANNING &amp; PORTFOLIO INTELLIGENCE</span><h1>Choose the path.<br />Prove the tradeoff.</h1><p>Connect ambition to capacity, expose initiative dependencies, compare bounded futures, and keep every investment decision accountable to evidence.</p></div>
        <div className="meridian-compass" aria-hidden="true"><i /><i /><span>✣</span><b><small>PORTFOLIO CONFIDENCE</small><strong>{Math.round((currentScenario?.confidenceBps || 0) / 100)}%</strong></b></div>
      </header>

      <section className="meridian-metrics">
        <article><span>STRATEGIC GOALS</span><strong>{overview.goals.length}</strong><small>{overview.goals.filter((item) => item.verified).length} leadership verified</small></article>
        <article><span>PORTFOLIO ASK</span><strong>{money(selectedBudget)}</strong><small>{selectedInitiatives.length} initiatives selected</small></article>
        <article><span>CAPACITY ASK</span><strong>{selectedHeadcount} / {overview.capacity.availableHeadcount}</strong><small>assumed available headcount</small></article>
        <article className={decisionReady ? "ready" : "hold"}><span>INVESTMENT GATE</span><strong>{decisionReady ? "READY" : "HOLD"}</strong><small>{decisionChecks.filter(([passed]) => !passed).length} blockers remain</small></article>
      </section>

      {message && <div className="meridian-message" role="status"><span>✣</span>{message}</div>}

      <div className="meridian-grid">
        <section className="meridian-panel goals-panel">
          <div className="meridian-heading"><span>01</span><div><h2>Strategic horizon</h2><p>Goals, measures, ownership, and verification state</p></div><b>12 MONTHS</b></div>
          <div className="goal-orbit">
            {overview.goals.map((goal, index) => <article key={goal.$id}><span>{pillarMark[goal.pillar] || "·"}</span><p><small>PRIORITY 0{index + 1} · {pretty(goal.pillar)}</small><strong>{goal.title}</strong><em>{pretty(goal.metric)} · {goal.targetValue} {pretty(goal.unit)}</em></p><b className={goal.verified ? "verified" : ""}>{goal.verified ? "VERIFIED" : "DRAFT"}</b></article>)}
          </div>
          <div className="meridian-note"><span>i</span><p><strong>Goal truth</strong><small>These goals are workspace planning drafts. Targets and baselines remain unverified until leadership and source evidence are attached.</small></p></div>
        </section>

        <section className="meridian-panel initiative-panel">
          <div className="meridian-heading"><span>02</span><div><h2>Initiative portfolio</h2><p>Proposals aligned to goals, cost, people, and risk</p></div><b>{overview.initiatives.length} INITIATIVES</b></div>
          <div className="initiative-composer">
            <select aria-label="Strategic goal" value={initiative.goalId} onChange={(event) => setInitiative({ ...initiative, goalId: event.target.value })}>{overview.goals.map((goal) => <option key={goal.$id} value={goal.$id}>{goal.title}</option>)}</select>
            <input aria-label="Initiative name" value={initiative.name} onChange={(event) => setInitiative({ ...initiative, name: event.target.value })} />
            <textarea aria-label="Expected impact" value={initiative.expectedImpact} onChange={(event) => setInitiative({ ...initiative, expectedImpact: event.target.value })} />
            <div><label>Budget $<input type="number" min="0" value={initiative.proposedBudgetDollars} onChange={(event) => setInitiative({ ...initiative, proposedBudgetDollars: Number(event.target.value) })} /></label><label>People<input type="number" min="0" value={initiative.requiredHeadcount} onChange={(event) => setInitiative({ ...initiative, requiredHeadcount: Number(event.target.value) })} /></label></div>
            <button disabled={busy === "initiative"} onClick={async () => {
              const result = await action("initiative", { action: "propose_initiative", ...initiative });
              if (result) setMessage("Initiative proposed as an unverified planning assumption. No budget or hiring commitment was created.");
            }}>{busy === "initiative" ? "Proposing…" : "Propose initiative"}</button>
          </div>
          <div className="initiative-stack">{overview.initiatives.slice(0, 6).map((item) => <article key={item.$id}><input aria-label={`Select ${item.name}`} type="checkbox" checked={selected.includes(item.$id)} onChange={() => setSelected((current) => current.includes(item.$id) ? current.filter((id) => id !== item.$id) : [...current, item.$id])} /><span className={`risk-${item.risk}`}>{item.risk[0].toUpperCase()}</span><p><strong>{item.name}</strong><small>{money(item.proposedBudgetCents)} · {item.requiredHeadcount} people · {Math.round(item.confidenceBps / 100)}% confidence</small></p><b>{pretty(item.stage)}</b></article>)}</div>
        </section>

        <section className="meridian-panel dependency-panel">
          <div className="meridian-heading"><span>03</span><div><h2>Dependency map</h2><p>Make sequencing constraints impossible to hide</p></div><b>{overview.dependencies.filter((item) => !item.resolved).length} OPEN</b></div>
          <div className="dependency-map">{overview.dependencies.map((dependency) => {
            const source = overview.initiatives.find((item) => item.$id === dependency.initiativeId);
            const target = overview.initiatives.find((item) => item.$id === dependency.dependsOnInitiativeId);
            return <article key={dependency.$id}><div><span>{source?.name[0] || "?"}</span><small>{source?.name || "Unknown"}</small></div><i>depends on →</i><div><span>{target?.name[0] || "?"}</span><small>{target?.name || "Unknown"}</small></div><b>{dependency.resolved ? "RESOLVED" : "UNVERIFIED"}</b></article>;
          })}</div>
          <div className="meridian-note amber"><span>!</span><p><strong>Dependency truth</strong><small>Seeded dependency edges are planning hypotheses. Unresolved edges block investment authorization for affected initiatives.</small></p></div>
        </section>

        <section className="meridian-panel capacity-panel">
          <div className="meridian-heading"><span>04</span><div><h2>Capacity envelope</h2><p>Budget and people as explicit, revisable constraints</p></div><b>{overview.capacity.externalVerified ? "VERIFIED" : "ASSUMED"}</b></div>
          <div className="capacity-dials">
            <article><span>BUDGET ENVELOPE</span><strong>{money(overview.capacity.budgetCents)}</strong><div><i style={{ width: `${Math.min(100, (selectedBudget / Math.max(1, overview.capacity.budgetCents)) * 100)}%` }} /></div><small>{money(selectedBudget)} selected</small></article>
            <article><span>PEOPLE ENVELOPE</span><strong>{overview.capacity.availableHeadcount}</strong><div><i style={{ width: `${Math.min(100, (selectedHeadcount / Math.max(1, overview.capacity.availableHeadcount)) * 100)}%` }} /></div><small>{selectedHeadcount} selected</small></article>
          </div>
          <div className="capacity-editor"><label>Planning budget $<input type="number" min="0" value={capacity.budgetDollars} onChange={(event) => setCapacity({ ...capacity, budgetDollars: Number(event.target.value) })} /></label><label>Available people<input type="number" min="0" value={capacity.availableHeadcount} onChange={(event) => setCapacity({ ...capacity, availableHeadcount: Number(event.target.value) })} /></label><button disabled={busy === "capacity"} onClick={async () => {
            const result = await action("capacity", { action: "update_capacity", ...capacity });
            if (result) setMessage("Capacity assumptions updated. No finance, HR, budget, or hiring system was changed.");
          }}>{busy === "capacity" ? "Updating…" : "Update planning envelope"}</button></div>
          <div className="meridian-note cyan"><span>~</span><p><strong>Capacity truth</strong><small>This envelope is not connected to finance or HR. It is a planning constraint, not available cash or approved headcount.</small></p></div>
        </section>

        <section className="meridian-panel scenario-panel">
          <div className="meridian-heading"><span>05</span><div><h2>Portfolio scenario</h2><p>Compare ambition against bounded resources</p></div><b>ADVISORY ONLY</b></div>
          <div className="portfolio-scenario-form">
            <label>Scenario<input value={scenario.title} onChange={(event) => setScenario({ ...scenario, title: event.target.value })} /></label>
            <div><label>Budget limit $<input type="number" min="0" value={scenario.budgetLimitDollars} onChange={(event) => setScenario({ ...scenario, budgetLimitDollars: Number(event.target.value) })} /></label><label>People limit<input type="number" min="0" value={scenario.headcountLimit} onChange={(event) => setScenario({ ...scenario, headcountLimit: Number(event.target.value) })} /></label><label>Horizon months<input type="number" min="3" max="36" value={scenario.horizonMonths} onChange={(event) => setScenario({ ...scenario, horizonMonths: Number(event.target.value) })} /></label></div>
            <div className="scenario-selection"><span>{selected.length} selected</span><strong>{money(selectedBudget)}</strong><small>{selectedHeadcount} people requested</small></div>
            <button className="meridian-primary" disabled={selected.length === 0 || busy === "scenario"} onClick={async () => {
              const result = await action("scenario", { action: "run_scenario", selectedInitiativeIds: selected, ...scenario });
              if (result) setMessage("Deterministic portfolio scenario complete. No live model, customer data, or financial commitment was used.");
            }}>{busy === "scenario" ? "Comparing futures…" : "Run portfolio scenario"}</button>
          </div>
          {currentScenario && <div className="scenario-summary"><span>{currentScenario.outcomeScore}</span><p><strong>{currentScenario.title}</strong><small>{pretty(currentScenario.status)} · {currentScenario.horizonMonths} months · {Math.round(currentScenario.confidenceBps / 100)}% confidence</small></p><b>OUTCOME SCORE</b></div>}
        </section>

        <section className="meridian-panel portfolio-forecast-panel">
          <div className="meridian-heading"><span>06</span><div><h2>Tradeoff forecast</h2><p>Ranges that expose uncertainty and resource tension</p></div><b>{forecasts.length} DIMENSIONS</b></div>
          <div className="portfolio-ranges">{forecasts.length === 0 ? <p>Run a portfolio scenario to see bounded tradeoff ranges.</p> : forecasts.map((forecast) => {
            const span = Math.max(forecast.baselineValue, forecast.projectedValueHigh, 1);
            return <article key={forecast.$id}><header><span>{pretty(forecast.dimension)}</span><b>{pretty(forecast.direction)}</b></header><div><i style={{ left: `${Math.min(94, (forecast.baselineValue / span) * 90)}%` }} /><b style={{ left: `${Math.min(90, (forecast.projectedValueLow / span) * 90)}%`, width: `${Math.max(4, ((forecast.projectedValueHigh - forecast.projectedValueLow) / span) * 90)}%` }} /></div><footer><span>Baseline {forecast.baselineValue}</span><strong>{forecast.projectedValueLow}–{forecast.projectedValueHigh} {pretty(forecast.unit)}</strong></footer></article>;
          })}</div>
          <div className="meridian-note violet"><span>◇</span><p><strong>Forecast truth</strong><small>Ranges come from deterministic fixtures and planning assumptions. They are not realized benefits or decision-grade forecasts.</small></p></div>
        </section>

        <section className="meridian-panel investment-panel">
          <div className="meridian-heading"><span>07</span><div><h2>Investment decision gate</h2><p>Evidence before authorization; authorization before commitment</p></div><b>{decisionReady ? "READY" : "HOLD"}</b></div>
          <div className="investment-layout">
            <div className="investment-summary"><span>PORTFOLIO UNDER REVIEW</span><strong>{currentScenario?.title || "No scenario yet"}</strong><p>{selectedInitiatives.length} initiatives · {money(selectedBudget)} · {selectedHeadcount} people</p><small>Recording a decision never creates a purchase, hiring plan, vendor contract, or budget allocation.</small></div>
            <div className="investment-checks">{decisionChecks.map(([passed, label]) => <span className={passed ? "passed" : "blocked"} key={label}><i>{passed ? "✓" : "×"}</i>{label}</span>)}</div>
          </div>
          <textarea aria-label="Investment decision rationale" value={rationale} onChange={(event) => setRationale(event.target.value)} />
          <div className="investment-actions"><button className="hold" disabled={!currentScenario || busy === "decision"} onClick={async () => {
            if (!currentScenario) return;
            const result = await action("decision", { action: "record_decision", scenarioId: currentScenario.$id, decision: "hold", rationale });
            if (result) setMessage("Investment hold recorded. No budget, hiring, vendor, or external commitment was created.");
          }}>{busy === "decision" ? "Recording…" : "Record hold"}</button><button className="authorize" disabled={!currentScenario || !decisionReady || busy === "decision"} onClick={async () => {
            if (!currentScenario) return;
            const result = await action("decision", { action: "record_decision", scenarioId: currentScenario.$id, decision: "authorize", rationale });
            if (result) setMessage("Planning authorization recorded. Financial commitment still requires its own approved execution workflow.");
          }}>Authorize portfolio</button></div>
          <div className="meridian-note"><span>✣</span><p><strong>Decision truth</strong><small>A portfolio decision records planning intent only. It cannot move money, create headcount, sign a vendor, or execute an initiative.</small></p></div>
        </section>
      </div>
    </div>
  );
}

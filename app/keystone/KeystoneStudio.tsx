"use client";

import { useEffect, useMemo, useState } from "react";
import type { KeystoneOverview } from "../lib/platform/model";

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

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function futureDate(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export function KeystoneStudio() {
  const [overview, setOverview] = useState<KeystoneOverview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [programDraft, setProgramDraft] = useState({
    initiativeId: "",
    investmentDecisionId: "",
    name: "Governed outcome delivery",
    targetDate: futureDate(120),
    budgetDollars: 20000,
  });
  const [evidenceDraft, setEvidenceDraft] = useState({
    milestoneId: "",
    type: "delivery_note",
    summary:
      "Acceptance criteria were reviewed internally; independent verification remains outstanding.",
    reference: "Internal review note",
    occurredAt: today(),
  });
  const [measurementDraft, setMeasurementDraft] = useState({
    metricId: "",
    observedValue: 0,
    period: new Date().toISOString().slice(0, 7),
    source: "Workspace owner observation",
    evidence: "Self-reported measurement; source system is not connected.",
  });
  const [correctiveDraft, setCorrectiveDraft] = useState({
    varianceId: "",
    title: "Review delivery sequence",
    actionType: "review_plan",
    rationale:
      "Review the plan with accountable owners before proposing any schedule or budget change.",
  });
  const [decisionRationale, setDecisionRationale] = useState(
    "Hold corrective action until investment authority, delivery evidence, benefit baselines, and the variance are independently verified.",
  );

  function applyOverview(payload: KeystoneOverview) {
    setOverview(payload);
    const programId = selectedProgramId || payload.programs[0]?.$id || "";
    setSelectedProgramId(programId);
    setProgramDraft((current) => ({
      ...current,
      initiativeId: current.initiativeId || payload.initiatives[0]?.$id || "",
      investmentDecisionId:
        current.investmentDecisionId ||
        payload.investmentDecisions.find((item) => item.authorized === 1)?.$id ||
        "",
    }));
    const programMilestones = payload.milestones.filter(
      (item) => item.programId === programId,
    );
    const programMetrics = payload.benefitMetrics.filter(
      (item) => item.programId === programId,
    );
    const programVariances = payload.variances.filter(
      (item) => item.programId === programId,
    );
    setEvidenceDraft((current) => ({
      ...current,
      milestoneId:
        programMilestones.some((item) => item.$id === current.milestoneId)
          ? current.milestoneId
          : programMilestones[0]?.$id || "",
    }));
    setMeasurementDraft((current) => ({
      ...current,
      metricId:
        programMetrics.some((item) => item.$id === current.metricId)
          ? current.metricId
          : programMetrics[0]?.$id || "",
    }));
    setCorrectiveDraft((current) => ({
      ...current,
      varianceId:
        programVariances.some((item) => item.$id === current.varianceId)
          ? current.varianceId
          : programVariances[0]?.$id || "",
    }));
  }

  async function load() {
    const response = await fetch("/api/keystone", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Keystone is unavailable.");
    applyOverview(payload);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/keystone", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Keystone is unavailable.");
        if (!active) return;
        applyOverview(payload);
        setStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Keystone is unavailable.");
        setStatus("error");
      });
    return () => {
      active = false;
    };
    // The initial defaults are intentionally derived from the first server snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function action(name: string, body: Record<string, unknown>) {
    if (!overview) return null;
    setBusy(name);
    setMessage("");
    try {
      const response = await fetch("/api/keystone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, workspaceId: overview.workspaceId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Execution action failed.");
      await load();
      return payload;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Execution action failed.");
      return null;
    } finally {
      setBusy("");
    }
  }

  const currentProgram =
    overview?.programs.find((item) => item.$id === selectedProgramId) ||
    overview?.programs[0];
  const milestones = useMemo(
    () =>
      overview && currentProgram
        ? overview.milestones
            .filter((item) => item.programId === currentProgram.$id)
            .sort((a, b) => a.sequence - b.sequence)
        : [],
    [overview, currentProgram],
  );
  const deliveryEvidence = useMemo(
    () =>
      overview && currentProgram
        ? overview.deliveryEvidence.filter(
            (item) => item.programId === currentProgram.$id,
          )
        : [],
    [overview, currentProgram],
  );
  const metrics = useMemo(
    () =>
      overview && currentProgram
        ? overview.benefitMetrics.filter(
            (item) => item.programId === currentProgram.$id,
          )
        : [],
    [overview, currentProgram],
  );
  const measurements = useMemo(
    () =>
      overview && currentProgram
        ? overview.benefitMeasurements.filter(
            (item) => item.programId === currentProgram.$id,
          )
        : [],
    [overview, currentProgram],
  );
  const variances = useMemo(
    () =>
      overview && currentProgram
        ? overview.variances.filter((item) => item.programId === currentProgram.$id)
        : [],
    [overview, currentProgram],
  );
  const correctiveActions = useMemo(
    () =>
      overview && currentProgram
        ? overview.correctiveActions.filter(
            (item) => item.programId === currentProgram.$id,
          )
        : [],
    [overview, currentProgram],
  );
  const latestVariances = [...variances]
    .sort((a, b) => b.assessedAt.localeCompare(a.assessedAt))
    .slice(0, 3);
  const pendingAction = correctiveActions.find(
    (item) => item.approvalStatus === "pending",
  );
  const verifiedEvidence = deliveryEvidence.filter((item) => item.verified === 1).length;
  const verifiedMeasurements = measurements.filter(
    (item) => item.independentlyVerified === 1,
  ).length;
  const approvalBlocked =
    !currentProgram?.investmentDecisionId ||
    latestVariances.some(
      (item) =>
        item.status !== "verified" ||
        item.decisionGrade !== 1 ||
        item.confidenceBps < 8000,
    ) ||
    verifiedEvidence === 0 ||
    verifiedMeasurements === 0 ||
    metrics.some((item) => item.verified !== 1);

  if (status === "loading") {
    return (
      <div className="keystone-loading">
        <span>◆</span>
        <strong>Assembling the execution proofline</strong>
        <p>Programs, milestones, benefits, and decision gates are being reconciled.</p>
      </div>
    );
  }
  if (status === "error" || !overview) {
    return (
      <div className="keystone-loading error">
        <span>!</span><strong>Keystone unavailable</strong><p>{message}</p>
      </div>
    );
  }

  return (
    <div className="keystone-page">
      <section className="keystone-hero">
        <div>
          <span className="keystone-eyebrow">Phase 15 · governed execution</span>
          <h1>Turn intent into outcomes <em>you can prove.</em></h1>
          <p>
            Keystone follows the line from investment intent to program delivery,
            milestone evidence, realized benefits, and human-approved course correction.
          </p>
          <div className="keystone-truth-row">
            <span><i />Planning records stay unverified</span>
            <span><i />No systems changed</span>
            <span><i />Corrective action requires approval</span>
          </div>
        </div>
        <div className="keystone-compass" aria-label="Execution evidence status">
          <div className="keystone-orbit orbit-one" />
          <div className="keystone-orbit orbit-two" />
          <span>◆</span>
          <strong>{currentProgram ? "PROOFLINE OPEN" : "NO PROGRAM"}</strong>
          <small>{verifiedEvidence + verifiedMeasurements} verified evidence signals</small>
        </div>
      </section>

      {message ? <div className="keystone-message">{message}</div> : null}

      <section className="keystone-stat-grid">
        <article>
          <span>Program state</span>
          <strong>{pretty(currentProgram?.status || "not_started")}</strong>
          <small>{overview.programs.length} durable program record(s)</small>
        </article>
        <article>
          <span>Milestone proof</span>
          <strong>{verifiedEvidence}/{deliveryEvidence.length}</strong>
          <small>independently verified evidence items</small>
        </article>
        <article>
          <span>Benefits observed</span>
          <strong>{measurements.length}</strong>
          <small>{verifiedMeasurements} independently verified</small>
        </article>
        <article>
          <span>Decision-grade variance</span>
          <strong>{latestVariances.filter((item) => item.decisionGrade === 1).length}/3</strong>
          <small>synthetic assessments never qualify</small>
        </article>
      </section>

      <section className="keystone-panel">
        <header>
          <div><span>01 · program charter</span><h2>Execution programs</h2></div>
          <p>Programs can organize work, but cannot manufacture funding authority.</p>
        </header>
        <div className="keystone-program-layout">
          <div className="keystone-program-list">
            {overview.programs.map((program) => (
              <button
                className={program.$id === currentProgram?.$id ? "active" : ""}
                key={program.$id}
                onClick={() => {
                  setSelectedProgramId(program.$id);
                  const firstMilestone = overview.milestones.find(
                    (item) => item.programId === program.$id,
                  );
                  const firstMetric = overview.benefitMetrics.find(
                    (item) => item.programId === program.$id,
                  );
                  const firstVariance = overview.variances.find(
                    (item) => item.programId === program.$id,
                  );
                  setEvidenceDraft((current) => ({
                    ...current,
                    milestoneId: firstMilestone?.$id || "",
                  }));
                  setMeasurementDraft((current) => ({
                    ...current,
                    metricId: firstMetric?.$id || "",
                  }));
                  setCorrectiveDraft((current) => ({
                    ...current,
                    varianceId: firstVariance?.$id || "",
                  }));
                }}
                type="button"
              >
                <span>◆</span>
                <div>
                  <strong>{program.name}</strong>
                  <small>{pretty(program.status)} · {shortDate(program.targetDate)}</small>
                </div>
                <b>{money(program.budgetCents)}</b>
              </button>
            ))}
          </div>
          <form
            className="keystone-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const result = await action("program", {
                action: "create_program",
                ...programDraft,
                investmentDecisionId: programDraft.investmentDecisionId || undefined,
              });
              if (result?.program?.$id) setSelectedProgramId(result.program.$id);
            }}
          >
            <span className="keystone-form-title">Create internal program record</span>
            <label>
              Initiative
              <select
                value={programDraft.initiativeId}
                onChange={(event) =>
                  setProgramDraft({ ...programDraft, initiativeId: event.target.value })
                }
              >
                {overview.initiatives.map((item) => (
                  <option key={item.$id} value={item.$id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label>
              Authorized investment
              <select
                value={programDraft.investmentDecisionId}
                onChange={(event) =>
                  setProgramDraft({
                    ...programDraft,
                    investmentDecisionId: event.target.value,
                  })
                }
              >
                <option value="">None — keep program unfunded</option>
                {overview.investmentDecisions
                  .filter((item) => item.authorized === 1)
                  .map((item) => (
                    <option key={item.$id} value={item.$id}>
                      {item.decision} · {shortDate(item.createdAt)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Program name
              <input
                value={programDraft.name}
                onChange={(event) =>
                  setProgramDraft({ ...programDraft, name: event.target.value })
                }
              />
            </label>
            <div className="keystone-form-row">
              <label>
                Target date
                <input
                  type="date"
                  value={programDraft.targetDate}
                  onChange={(event) =>
                    setProgramDraft({ ...programDraft, targetDate: event.target.value })
                  }
                />
              </label>
              <label>
                Planning budget
                <input
                  min="0"
                  type="number"
                  value={programDraft.budgetDollars}
                  onChange={(event) =>
                    setProgramDraft({
                      ...programDraft,
                      budgetDollars: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
            <button disabled={busy === "program"} type="submit">
              {busy === "program" ? "Creating…" : "Create program draft"}
            </button>
            <small>No funds, schedules, jobs, or external records are created.</small>
          </form>
        </div>
      </section>

      <section className="keystone-split">
        <article className="keystone-panel">
          <header>
            <div><span>02 · delivery proof</span><h2>Milestone proofline</h2></div>
          </header>
          <div className="keystone-timeline">
            {milestones.length ? milestones.map((milestone, index) => {
              const evidence = deliveryEvidence.filter(
                (item) => item.milestoneId === milestone.$id,
              );
              return (
                <div className="keystone-milestone" key={milestone.$id}>
                  <span className="keystone-sequence">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{milestone.name}</strong>
                    <p>{milestone.acceptanceCriteria}</p>
                    <small>{shortDate(milestone.targetDate)} · {evidence.length} evidence item(s)</small>
                  </div>
                  <b className={milestone.externallyVerified ? "verified" : ""}>
                    {milestone.externallyVerified ? "Verified" : "Unverified"}
                  </b>
                </div>
              );
            }) : <p className="keystone-empty">This program has no milestone plan yet.</p>}
          </div>
        </article>

        <article className="keystone-panel">
          <header>
            <div><span>03 · evidence intake</span><h2>Record delivery evidence</h2></div>
          </header>
          <form
            className="keystone-form flat"
            onSubmit={async (event) => {
              event.preventDefault();
              await action("evidence", {
                action: "record_delivery_evidence",
                ...evidenceDraft,
              });
            }}
          >
            <label>
              Milestone
              <select
                value={evidenceDraft.milestoneId}
                onChange={(event) =>
                  setEvidenceDraft({ ...evidenceDraft, milestoneId: event.target.value })
                }
              >
                {milestones.map((item) => (
                  <option key={item.$id} value={item.$id}>{item.name}</option>
                ))}
              </select>
            </label>
            <div className="keystone-form-row">
              <label>
                Evidence type
                <select
                  value={evidenceDraft.type}
                  onChange={(event) =>
                    setEvidenceDraft({ ...evidenceDraft, type: event.target.value })
                  }
                >
                  <option value="delivery_note">Delivery note</option>
                  <option value="test_result">Test result</option>
                  <option value="review_record">Review record</option>
                </select>
              </label>
              <label>
                Occurred
                <input
                  type="date"
                  value={evidenceDraft.occurredAt}
                  onChange={(event) =>
                    setEvidenceDraft({ ...evidenceDraft, occurredAt: event.target.value })
                  }
                />
              </label>
            </div>
            <label>
              Evidence summary
              <textarea
                value={evidenceDraft.summary}
                onChange={(event) =>
                  setEvidenceDraft({ ...evidenceDraft, summary: event.target.value })
                }
              />
            </label>
            <label>
              Reference
              <input
                value={evidenceDraft.reference}
                onChange={(event) =>
                  setEvidenceDraft({ ...evidenceDraft, reference: event.target.value })
                }
              />
            </label>
            <button disabled={!evidenceDraft.milestoneId || busy === "evidence"} type="submit">
              {busy === "evidence" ? "Recording…" : "Record as unverified evidence"}
            </button>
          </form>
        </article>
      </section>

      <section className="keystone-panel">
        <header>
          <div><span>04 · outcome ledger</span><h2>Benefit realization ledger</h2></div>
          <p>Observed is not realized until the baseline, source, and result are verified.</p>
        </header>
        <div className="keystone-benefit-layout">
          <div className="keystone-metric-grid">
            {metrics.length ? metrics.map((metric) => {
              const metricMeasurements = measurements.filter(
                (item) => item.metricId === metric.$id,
              );
              const latest = metricMeasurements[0];
              return (
                <article key={metric.$id}>
                  <span>{metric.unit}</span>
                  <strong>{metric.name}</strong>
                  <div>
                    <p><small>Baseline</small><b>{metric.baselineValue}</b></p>
                    <i>→</i>
                    <p><small>Target</small><b>{metric.targetValue}</b></p>
                    <i>→</i>
                    <p><small>Observed</small><b>{latest?.observedValue ?? "—"}</b></p>
                  </div>
                  <footer>
                    <span>{pretty(metric.status)}</span>
                    <b>{metric.verified ? "Verified" : "Unverified"}</b>
                  </footer>
                </article>
              );
            }) : <p className="keystone-empty">This program has no benefit definitions yet.</p>}
          </div>
          <form
            className="keystone-form"
            onSubmit={async (event) => {
              event.preventDefault();
              await action("measurement", {
                action: "record_benefit_measurement",
                ...measurementDraft,
              });
            }}
          >
            <span className="keystone-form-title">Record an observation</span>
            <label>
              Benefit metric
              <select
                value={measurementDraft.metricId}
                onChange={(event) =>
                  setMeasurementDraft({
                    ...measurementDraft,
                    metricId: event.target.value,
                  })
                }
              >
                {metrics.map((item) => (
                  <option key={item.$id} value={item.$id}>{item.name}</option>
                ))}
              </select>
            </label>
            <div className="keystone-form-row">
              <label>
                Observed value
                <input
                  type="number"
                  value={measurementDraft.observedValue}
                  onChange={(event) =>
                    setMeasurementDraft({
                      ...measurementDraft,
                      observedValue: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Period
                <input
                  type="month"
                  value={measurementDraft.period}
                  onChange={(event) =>
                    setMeasurementDraft({
                      ...measurementDraft,
                      period: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            <label>
              Source
              <input
                value={measurementDraft.source}
                onChange={(event) =>
                  setMeasurementDraft({
                    ...measurementDraft,
                    source: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Evidence note
              <textarea
                value={measurementDraft.evidence}
                onChange={(event) =>
                  setMeasurementDraft({
                    ...measurementDraft,
                    evidence: event.target.value,
                  })
                }
              />
            </label>
            <button
              disabled={!measurementDraft.metricId || busy === "measurement"}
              type="submit"
            >
              {busy === "measurement" ? "Recording…" : "Record self-reported observation"}
            </button>
          </form>
        </div>
      </section>

      <section className="keystone-panel keystone-variance-panel">
        <header>
          <div><span>05 · variance intelligence</span><h2>Variance control room</h2></div>
          <button
            disabled={!currentProgram || busy === "assessment"}
            onClick={() =>
              currentProgram &&
              action("assessment", {
                action: "run_assessment",
                programId: currentProgram.$id,
              })
            }
            type="button"
          >
            {busy === "assessment" ? "Assessing…" : "Run evidence assessment"}
          </button>
        </header>
        <div className="keystone-variance-grid">
          {latestVariances.length ? latestVariances.map((variance) => (
            <article key={variance.$id}>
              <div>
                <span className={`keystone-severity ${variance.severity}`}>
                  {variance.severity}
                </span>
                <b>{variance.decisionGrade ? "Decision-grade" : "Advisory only"}</b>
              </div>
              <strong>{pretty(variance.dimension)}</strong>
              <div className="keystone-variance-bar">
                <span style={{ width: `${Math.max(4, Math.min(100, variance.actualValue))}%` }} />
                <i style={{ left: `${Math.max(0, Math.min(100, variance.baselineValue))}%` }} />
              </div>
              <footer>
                <span>Expected {variance.baselineValue}{variance.unit === "percent" ? "%" : ""}</span>
                <b>Observed {variance.actualValue}{variance.unit === "percent" ? "%" : ""}</b>
              </footer>
              <small>{variance.confidenceBps / 100}% confidence · no external systems queried</small>
            </article>
          )) : (
            <div className="keystone-empty wide">
              <span>◇</span>
              <strong>No assessment yet</strong>
              <p>Run a deterministic review of the evidence already stored in Keystone.</p>
            </div>
          )}
        </div>
      </section>

      <section className="keystone-panel keystone-gate">
        <header>
          <div><span>06 · human control</span><h2>Corrective action gate</h2></div>
          <p>Approval records intent. It never executes the proposed change.</p>
        </header>
        <div className="keystone-gate-layout">
          <form
            className="keystone-form"
            onSubmit={async (event) => {
              event.preventDefault();
              await action("proposal", {
                action: "propose_corrective_action",
                ...correctiveDraft,
              });
            }}
          >
            <span className="keystone-form-title">Propose corrective action</span>
            <label>
              Variance
              <select
                value={correctiveDraft.varianceId}
                onChange={(event) =>
                  setCorrectiveDraft({
                    ...correctiveDraft,
                    varianceId: event.target.value,
                  })
                }
              >
                {latestVariances.map((item) => (
                  <option key={item.$id} value={item.$id}>
                    {pretty(item.dimension)} · {item.severity}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Action title
              <input
                value={correctiveDraft.title}
                onChange={(event) =>
                  setCorrectiveDraft({ ...correctiveDraft, title: event.target.value })
                }
              />
            </label>
            <label>
              Action type
              <select
                value={correctiveDraft.actionType}
                onChange={(event) =>
                  setCorrectiveDraft({
                    ...correctiveDraft,
                    actionType: event.target.value,
                  })
                }
              >
                <option value="review_plan">Review plan</option>
                <option value="resequence_milestones">Resequence milestones</option>
                <option value="request_capacity_review">Request capacity review</option>
                <option value="pause_workstream">Pause workstream</option>
              </select>
            </label>
            <label>
              Rationale
              <textarea
                value={correctiveDraft.rationale}
                onChange={(event) =>
                  setCorrectiveDraft({
                    ...correctiveDraft,
                    rationale: event.target.value,
                  })
                }
              />
            </label>
            <button
              disabled={!correctiveDraft.varianceId || busy === "proposal"}
              type="submit"
            >
              {busy === "proposal" ? "Proposing…" : "Send to approval gate"}
            </button>
          </form>

          <div className="keystone-decision">
            <div className="keystone-decision-head">
              <span>{pendingAction ? "Pending human decision" : "No pending action"}</span>
              <b>{pendingAction ? "Approval required" : "Gate clear"}</b>
            </div>
            {pendingAction ? (
              <>
                <strong>{pendingAction.title}</strong>
                <p>{pendingAction.rationale}</p>
                <div className="keystone-blockers">
                  <span className={currentProgram?.investmentDecisionId ? "ok" : ""}>
                    {currentProgram?.investmentDecisionId ? "✓" : "×"} Authorized investment
                  </span>
                  <span className={verifiedEvidence ? "ok" : ""}>
                    {verifiedEvidence ? "✓" : "×"} Verified delivery evidence
                  </span>
                  <span className={verifiedMeasurements ? "ok" : ""}>
                    {verifiedMeasurements ? "✓" : "×"} Verified benefit measurement
                  </span>
                  <span className={!approvalBlocked ? "ok" : ""}>
                    {!approvalBlocked ? "✓" : "×"} Decision-grade variance
                  </span>
                </div>
                <label>
                  Decision rationale
                  <textarea
                    value={decisionRationale}
                    onChange={(event) => setDecisionRationale(event.target.value)}
                  />
                </label>
                <div className="keystone-decision-actions">
                  <button
                    className="hold"
                    disabled={busy === "decision"}
                    onClick={() =>
                      action("decision", {
                        action: "decide_corrective_action",
                        actionId: pendingAction.$id,
                        decision: "hold",
                        rationale: decisionRationale,
                      })
                    }
                    type="button"
                  >
                    Hold · no change
                  </button>
                  <button
                    disabled={approvalBlocked || busy === "decision"}
                    onClick={() =>
                      action("decision", {
                        action: "decide_corrective_action",
                        actionId: pendingAction.$id,
                        decision: "approve",
                        rationale: decisionRationale,
                      })
                    }
                    type="button"
                  >
                    Approve record
                  </button>
                </div>
                <small>
                  Approval creates no schedule change, budget change, financial
                  commitment, or external action.
                </small>
              </>
            ) : (
              <div className="keystone-empty">
                <span>◆</span>
                <strong>The gate is waiting</strong>
                <p>Assess variance, then propose a bounded corrective action for review.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

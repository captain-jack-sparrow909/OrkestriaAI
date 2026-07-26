const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const allowedAgents = new Set(["vela", "loom", "tempo", "helio", "aegis"]);
const allowedRisks = new Set(["low", "medium", "high", "critical"]);
const allowedSeverities = new Set(["info", "low", "medium", "high", "critical"]);
const allowedEfforts = new Set(["low", "medium", "high"]);

const agentInstructions = {
  vela: "Focus on browser navigation, evidence gathering, domain boundaries, and checkpoints before forms, submissions, purchases, or account changes.",
  loom: "Focus on triggers, transformations, integrations, retries, idempotency, and human checkpoints before consequential external actions.",
  tempo: "Correlate deployments, alerts, logs, and infrastructure changes. State uncertainty clearly, surface concrete evidence as findings, and recommend reversible remediation before any production change.",
  helio: "Analyze only supplied cost and utilization evidence. Identify anomalies, idle resources, rightsizing, scheduling, storage, and commitment opportunities. Use conservative monthly savings, avoid double counting, express money as numeric currency units, include confidence and effort, and never claim savings are realized.",
  aegis: "Review the supplied code or configuration for concrete vulnerabilities and insecure patterns. Put each supported issue in findings with exact evidence and a practical recommendation. Do not invent absent code.",
};

const systemPrompt = `You are the planning intelligence inside OrkestriaAI, a human-controlled AI operations platform.
Return one JSON object and nothing else.
Never claim an action has been executed. You only propose a plan.
Mark approvalRequired true before purchases, submissions, deployments, infrastructure changes, permission changes, destructive actions, or sending sensitive data.
Treat uncertain or irreversible actions as higher risk.
Use this exact JSON shape:
{
  "summary": "one concise outcome",
  "risk": "low | medium | high | critical",
  "approvalRequired": true,
  "rationale": "plain-language reasoning",
  "findings": [
    {
      "title": "specific signal or issue",
      "severity": "info | low | medium | high | critical",
      "evidence": "short evidence grounded in supplied context",
      "recommendation": "specific safe next step"
    }
  ],
  "opportunities": [
    {
      "resourceId": "provider resource identifier",
      "resourceName": "human readable resource",
      "category": "idle | rightsizing | scheduling | storage | commitment | anomaly",
      "currentMonthlyCost": 1000,
      "estimatedMonthlySavings": 250,
      "confidence": 80,
      "effort": "low | medium | high",
      "risk": "low | medium | high | critical",
      "evidence": "cost and utilization evidence",
      "recommendation": "specific next step"
    }
  ],
  "steps": [
    {
      "title": "step title",
      "kind": "research | analyze | transform | notify | write | external_action",
      "description": "what will happen",
      "requiresApproval": false
    }
  ]
}`;

export function validatePlan(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("DeepSeek returned an invalid plan.");
  }

  const risk = allowedRisks.has(input.risk) ? input.risk : "high";
  const findings = Array.isArray(input.findings)
    ? input.findings.slice(0, 10).map((finding, index) => ({
        title: String(finding?.title || `Finding ${index + 1}`).slice(0, 180),
        severity: allowedSeverities.has(finding?.severity)
          ? finding.severity
          : "medium",
        evidence: String(finding?.evidence || "").slice(0, 1600),
        recommendation: String(finding?.recommendation || "").slice(0, 1600),
      }))
    : [];
  const seenResources = new Set();
  const opportunities = Array.isArray(input.opportunities)
    ? input.opportunities.slice(0, 20).flatMap((opportunity, index) => {
        const resourceId = String(
          opportunity?.resourceId || `resource-${index + 1}`,
        ).slice(0, 255);
        if (seenResources.has(resourceId)) return [];
        seenResources.add(resourceId);

        const currentMonthlyCost = Math.min(
          10_000_000,
          Math.max(0, Number(opportunity?.currentMonthlyCost) || 0),
        );
        return [{
          resourceId,
          resourceName: String(
            opportunity?.resourceName || `Resource ${index + 1}`,
          ).slice(0, 255),
          category: String(opportunity?.category || "rightsizing").slice(0, 64),
          currentMonthlyCost,
          estimatedMonthlySavings: Math.min(
            currentMonthlyCost,
            Math.max(0, Number(opportunity?.estimatedMonthlySavings) || 0),
          ),
          confidence: Math.min(
            100,
            Math.max(0, Math.round(Number(opportunity?.confidence) || 0)),
          ),
          effort: allowedEfforts.has(opportunity?.effort)
            ? opportunity.effort
            : "medium",
          risk: allowedRisks.has(opportunity?.risk)
            ? opportunity.risk
            : "medium",
          evidence: String(opportunity?.evidence || "").slice(0, 2000),
          recommendation: String(opportunity?.recommendation || "").slice(0, 2000),
        }];
      }).slice(0, 12)
    : [];
  const steps = Array.isArray(input.steps)
    ? input.steps.slice(0, 12).map((step, index) => ({
        title: String(step?.title || `Step ${index + 1}`).slice(0, 160),
        kind: String(step?.kind || "analyze").slice(0, 32),
        description: String(step?.description || "").slice(0, 1200),
        requiresApproval: Boolean(step?.requiresApproval),
      }))
    : [];

  const approvalRequired =
    Boolean(input.approvalRequired) ||
    risk === "high" ||
    risk === "critical" ||
    steps.some((step) => step.requiresApproval || step.kind === "external_action");

  return {
    summary: String(input.summary || "Proposed agent plan").slice(0, 255),
    risk,
    approvalRequired,
    rationale: String(input.rationale || "The plan was generated from the supplied goal.").slice(0, 4000),
    findings,
    opportunities,
    steps,
  };
}

function apiKey() {
  return process.env.DEEPSEEK_API_KEY || process.env.DEEP_SEEK_API_KEY;
}

async function opaqueUserId(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createAgentPlan({ agent, goal, context, userId }) {
  const key = apiKey();
  if (!key) throw new Error("DeepSeek is not configured.");

  const normalizedAgent = String(agent || "").toLowerCase();
  if (!allowedAgents.has(normalizedAgent)) {
    throw new Error("Unknown OrkestriaAI agent.");
  }

  const safeGoal = String(goal || "").trim().slice(0, 6000);
  if (!safeGoal) throw new Error("A goal is required.");
  const safeContext = String(context || "").trim().slice(0, 12000);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(DEEPSEEK_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
        max_tokens: 2400,
        user_id: await opaqueUserId(userId),
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Create a JSON plan for the ${normalizedAgent} agent.
Agent guidance: ${agentInstructions[normalizedAgent]}
Goal: ${safeGoal}
Context: ${safeContext || "No additional context."}`,
          },
        ],
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        `DeepSeek request failed (${response.status}): ${payload.error?.message || "unknown error"}`,
      );
    }

    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek returned an empty plan.");

    return {
      plan: validatePlan(JSON.parse(content)),
      model: payload.model || process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      usage: {
        inputTokens: Number(payload.usage?.prompt_tokens || 0),
        outputTokens: Number(payload.usage?.completion_tokens || 0),
        totalTokens: Number(payload.usage?.total_tokens || 0),
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

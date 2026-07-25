const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const allowedAgents = new Set(["vela", "loom", "tempo", "helio", "aegis"]);
const allowedRisks = new Set(["low", "medium", "high", "critical"]);

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
        max_tokens: 1800,
        user_id: await opaqueUserId(userId),
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Create a JSON plan for the ${normalizedAgent} agent.\nGoal: ${safeGoal}\nContext: ${safeContext || "No additional context."}`,
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

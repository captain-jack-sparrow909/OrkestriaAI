const key = process.env.DEEPSEEK_API_KEY || process.env.DEEP_SEEK_API_KEY;
if (!key) throw new Error("DEEPSEEK_API_KEY or DEEP_SEEK_API_KEY is missing.");

const response = await fetch("https://api.deepseek.com/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    thinking: { type: "disabled" },
    max_tokens: 8,
    messages: [
      {
        role: "user",
        content: "Reply with exactly READY.",
      },
    ],
  }),
});

const payload = await response.json().catch(() => ({}));
if (!response.ok) {
  throw new Error(
    `DeepSeek check failed (${response.status}): ${payload.error?.message || "unknown error"}`,
  );
}

const content = payload.choices?.[0]?.message?.content?.trim();
if (content?.replace(/[.!]+$/, "") !== "READY") {
  throw new Error(`DeepSeek returned an unexpected response: ${content || "empty"}`);
}

console.log(`DeepSeek ready · ${payload.model || "deepseek-v4-flash"}`);

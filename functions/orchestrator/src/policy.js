export const decisionRoles = new Set(["owner", "admin", "operator", "approver"]);
export const runnableRoles = new Set(["owner", "admin", "operator", "developer"]);

export function canDecideApproval(role) {
  return decisionRoles.has(role);
}

export function canEnqueueJob(role) {
  return runnableRoles.has(role);
}

export function normalizeDecision(value) {
  return value === "approved" || value === "denied" ? value : null;
}

export function safeJsonObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

export function calculateRetryDelay(attempt) {
  const normalized = Math.max(1, Math.min(Number(attempt) || 1, 8));
  return Math.min(15 * 2 ** (normalized - 1), 900);
}

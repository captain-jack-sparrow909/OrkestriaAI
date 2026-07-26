export type ConnectorManifest = {
  schemaVersion: string;
  name: string;
  slug: string;
  version: string;
  auth: {
    type: "oauth2" | "api_key" | "service_account" | "webhook";
    scopes?: string[];
  };
  actions: Array<{
    key: string;
    title: string;
    risk: "low" | "medium" | "high" | "critical";
    requiresApproval: boolean;
  }>;
};

export type ManifestValidation = {
  valid: boolean;
  errors: string[];
  manifest: ConnectorManifest | null;
};

const authTypes = new Set(["oauth2", "api_key", "service_account", "webhook"]);
const riskLevels = new Set(["low", "medium", "high", "critical"]);

export function validateConnectorManifest(input: unknown): ManifestValidation {
  const errors: string[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: ["Manifest must be a JSON object."], manifest: null };
  }
  const value = input as Record<string, unknown>;
  const schemaVersion = String(value.schemaVersion || "");
  const name = String(value.name || "").trim().slice(0, 96);
  const slug = String(value.slug || "").trim().toLowerCase().slice(0, 64);
  const version = String(value.version || "").trim().slice(0, 32);
  const auth = value.auth && typeof value.auth === "object" && !Array.isArray(value.auth)
    ? value.auth as Record<string, unknown>
    : {};
  const authType = String(auth.type || "");
  const scopes = Array.isArray(auth.scopes)
    ? Array.from(new Set(auth.scopes.map(String).map((scope) => scope.trim()).filter(Boolean))).slice(0, 30)
    : [];
  const rawActions = Array.isArray(value.actions) ? value.actions.slice(0, 30) : [];

  if (schemaVersion !== "1.0") errors.push("schemaVersion must be 1.0.");
  if (name.length < 3) errors.push("name must be at least 3 characters.");
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(slug)) {
    errors.push("slug must use lowercase letters, digits, and single hyphens.");
  }
  if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(version)) {
    errors.push("version must use semantic versioning.");
  }
  if (!authTypes.has(authType)) errors.push("auth.type is not supported.");
  if (!rawActions.length) errors.push("at least one action is required.");

  const seenActions = new Set<string>();
  const actions = rawActions.flatMap((raw, index) => {
    const action = raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw as Record<string, unknown>
      : {};
    const key = String(action.key || "").trim().toLowerCase().slice(0, 64);
    const title = String(action.title || "").trim().slice(0, 96);
    const risk = String(action.risk || "");
    if (!/^[a-z][a-z0-9_.-]{2,63}$/.test(key)) {
      errors.push(`actions[${index}].key is invalid.`);
    } else if (seenActions.has(key)) {
      errors.push(`actions[${index}].key is duplicated.`);
    }
    seenActions.add(key);
    if (title.length < 3) errors.push(`actions[${index}].title is required.`);
    if (!riskLevels.has(risk)) errors.push(`actions[${index}].risk is invalid.`);
    const requiresApproval =
      Boolean(action.requiresApproval) || risk === "high" || risk === "critical";
    return [{
      key,
      title,
      risk: (riskLevels.has(risk) ? risk : "high") as ConnectorManifest["actions"][number]["risk"],
      requiresApproval,
    }];
  });

  const manifest: ConnectorManifest = {
    schemaVersion,
    name,
    slug,
    version,
    auth: {
      type: (authTypes.has(authType) ? authType : "api_key") as ConnectorManifest["auth"]["type"],
      scopes,
    },
    actions,
  };
  return { valid: errors.length === 0, errors: errors.slice(0, 20), manifest };
}

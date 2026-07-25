export const database = {
  id: "orkestria",
  name: "OrkestriaAI",
};

const text = (key, size, required = true, extra = {}) => ({
  key,
  type: "string",
  size,
  required,
  ...extra,
});

const integer = (key, required = true, extra = {}) => ({
  key,
  type: "integer",
  required,
  ...extra,
});

const datetime = (key, required = true) => ({
  key,
  type: "datetime",
  required,
});

export const tables = [
  {
    id: "workspaces",
    name: "Workspaces",
    rowSecurity: true,
    columns: [
      text("name", 128),
      text("slug", 64),
      text("plan", 32, false, { default: "starter" }),
      text("region", 32, false, { default: "global" }),
      text("status", 32, false, { default: "active" }),
      text("settings", 16384, false, { default: "{}" }),
      text("createdBy", 254),
      datetime("createdAt"),
    ],
    indexes: [
      { key: "slug_unique", type: "unique", attributes: ["slug"] },
      { key: "created_by_idx", type: "key", attributes: ["createdBy"] },
    ],
  },
  {
    id: "memberships",
    name: "Memberships",
    rowSecurity: true,
    columns: [
      text("workspaceId", 36),
      text("userId", 36),
      text("userEmail", 254),
      text("userName", 128, false),
      text("role", 32),
      text("teamId", 36, false),
      text("status", 32, false, { default: "active" }),
      datetime("createdAt"),
    ],
    indexes: [
      {
        key: "workspace_user_unique",
        type: "unique",
        attributes: ["workspaceId", "userEmail"],
      },
      { key: "user_email_idx", type: "key", attributes: ["userEmail"] },
      { key: "user_id_idx", type: "key", attributes: ["userId"] },
      { key: "workspace_role_idx", type: "key", attributes: ["workspaceId", "role"] },
    ],
  },
  {
    id: "runs",
    name: "Agent runs",
    rowSecurity: true,
    columns: [
      text("workspaceId", 36),
      text("agent", 32),
      text("title", 255),
      text("status", 32),
      text("risk", 32),
      text("initiatorEmail", 254),
      text("currentStep", 255, false),
      integer("progress", false, { default: 0 }),
      integer("costCents", false, { default: 0 }),
      datetime("startedAt"),
      datetime("completedAt", false),
      text("metadata", 16384, false, { default: "{}" }),
    ],
    indexes: [
      { key: "workspace_status_idx", type: "key", attributes: ["workspaceId", "status"] },
      { key: "workspace_started_idx", type: "key", attributes: ["workspaceId", "startedAt"], orders: ["ASC", "DESC"] },
    ],
  },
  {
    id: "approvals",
    name: "Approval requests",
    rowSecurity: true,
    columns: [
      text("workspaceId", 36),
      text("runId", 36),
      text("action", 255),
      text("description", 4000),
      text("risk", 32),
      text("state", 32, false, { default: "pending" }),
      text("requestedBy", 254),
      text("approverEmail", 254, false),
      text("reason", 2000, false),
      datetime("requestedAt"),
      datetime("decidedAt", false),
    ],
    indexes: [
      { key: "workspace_state_idx", type: "key", attributes: ["workspaceId", "state"] },
      { key: "run_id_idx", type: "key", attributes: ["runId"] },
    ],
  },
  {
    id: "audit_events",
    name: "Audit events",
    rowSecurity: true,
    columns: [
      text("workspaceId", 36),
      text("actorEmail", 254),
      text("action", 128),
      text("targetType", 64),
      text("targetId", 36),
      text("outcome", 32),
      text("ipHash", 64, false),
      text("metadata", 16384, false, { default: "{}" }),
      datetime("occurredAt"),
    ],
    indexes: [
      { key: "workspace_time_idx", type: "key", attributes: ["workspaceId", "occurredAt"], orders: ["ASC", "DESC"] },
      { key: "target_idx", type: "key", attributes: ["targetType", "targetId"] },
    ],
  },
  {
    id: "jobs",
    name: "Background jobs",
    rowSecurity: true,
    columns: [
      text("workspaceId", 36),
      text("type", 64),
      text("payload", 16384, false, { default: "{}" }),
      text("state", 32, false, { default: "queued" }),
      integer("attempts", false, { default: 0 }),
      integer("maxAttempts", false, { default: 5 }),
      text("idempotencyKey", 128),
      datetime("availableAt"),
      datetime("leaseUntil", false),
      text("lastError", 4000, false),
      datetime("createdAt"),
      datetime("updatedAt"),
    ],
    indexes: [
      { key: "idempotency_unique", type: "unique", attributes: ["idempotencyKey"] },
      { key: "queue_idx", type: "key", attributes: ["state", "availableAt"] },
      { key: "workspace_state_idx", type: "key", attributes: ["workspaceId", "state"] },
    ],
  },
  {
    id: "files",
    name: "File metadata",
    rowSecurity: true,
    columns: [
      text("workspaceId", 36),
      text("bucketId", 36),
      text("fileId", 36),
      text("ownerEmail", 254),
      text("name", 255),
      text("mimeType", 128),
      integer("size"),
      text("scanStatus", 32, false, { default: "pending" }),
      datetime("retentionUntil", false),
      datetime("createdAt"),
    ],
    indexes: [
      { key: "file_unique", type: "unique", attributes: ["bucketId", "fileId"] },
      { key: "workspace_owner_idx", type: "key", attributes: ["workspaceId", "ownerEmail"] },
    ],
  },
  {
    id: "rate_limits",
    name: "Rate limits",
    rowSecurity: false,
    columns: [
      text("scope", 128),
      datetime("windowStart"),
      integer("count", false, { default: 0 }),
      integer("limit"),
      datetime("updatedAt"),
    ],
    indexes: [
      { key: "scope_window_unique", type: "unique", attributes: ["scope", "windowStart"] },
    ],
  },
];

export const buckets = [
  {
    id: "workspace-uploads",
    name: "Workspace uploads",
    fileSecurity: true,
    maximumFileSize: 50 * 1024 * 1024,
    allowedFileExtensions: ["pdf", "docx", "txt", "csv", "json", "png", "jpg", "jpeg"],
  },
  {
    id: "run-evidence",
    name: "Run evidence",
    fileSecurity: true,
    maximumFileSize: 100 * 1024 * 1024,
    allowedFileExtensions: ["json", "txt", "log", "png", "jpg", "jpeg", "pdf"],
  },
  {
    id: "exports",
    name: "Generated exports",
    fileSecurity: true,
    maximumFileSize: 250 * 1024 * 1024,
    allowedFileExtensions: ["csv", "json", "pdf", "zip"],
  },
];

export const functionDefinition = {
  id: "orchestrator",
  name: "Orkestria Orchestrator",
  runtime: "node-22",
  entrypoint: "src/main.js",
  commands: "npm install",
  timeout: 120,
  scopes: [
    "databases.read",
    "databases.write",
    "rows.read",
    "rows.write",
    "storage.read",
    "storage.write",
  ],
};

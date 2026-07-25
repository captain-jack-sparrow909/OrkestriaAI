import { buckets, database, functionDefinition, tables } from "../../appwrite/schema.mjs";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID, or APPWRITE_API_KEY.",
  );
}

const headers = {
  "Content-Type": "application/json",
  "X-Appwrite-Project": projectId,
  "X-Appwrite-Key": apiKey,
  "X-Appwrite-Response-Format": "1.9.5",
};

async function request(path, body, method = "POST") {
  const response = await fetch(`${endpoint.replace(/\/$/, "")}${path}`, {
    method,
    headers,
    body: JSON.stringify(body),
  });

  if (response.ok) {
    return { state: "created", resource: await response.json() };
  }

  const error = await response.json().catch(() => ({}));
  if (response.status === 409) {
    return { state: "existing", resource: error };
  }

  throw new Error(
    `${response.status} ${path}: ${error.message ?? "Appwrite request failed"}`,
  );
}

async function upsertVariable(variableId, key, value, secret) {
  const created = await request(`/functions/${functionDefinition.id}/variables`, {
    variableId,
    key,
    value,
    secret,
  });

  if (created.state === "created") return created;

  const updated = await request(
    `/functions/${functionDefinition.id}/variables/${variableId}`,
    { key, value, secret },
    "PUT",
  );
  return { ...updated, state: "updated" };
}

async function upsertBucket(bucket) {
  const body = {
    bucketId: bucket.id,
    name: bucket.name,
    permissions: [],
    fileSecurity: bucket.fileSecurity,
    enabled: true,
    maximumFileSize: bucket.maximumFileSize,
    allowedFileExtensions: bucket.allowedFileExtensions,
    compression: "none",
    encryption: true,
    antivirus: true,
  };
  const created = await request("/storage/buckets", body);
  if (created.state === "created") return created;

  const update = {
    name: body.name,
    permissions: body.permissions,
    fileSecurity: body.fileSecurity,
    enabled: body.enabled,
    maximumFileSize: body.maximumFileSize,
    allowedFileExtensions: body.allowedFileExtensions,
    compression: body.compression,
    encryption: body.encryption,
    antivirus: body.antivirus,
  };
  const updated = await request(`/storage/buckets/${bucket.id}`, update, "PUT");
  return { ...updated, state: "updated" };
}

const results = [];
const databaseId = process.env.APPWRITE_DATABASE_ID || database.id;

results.push([
  "database",
  database.id,
  await request("/tablesdb", {
    databaseId,
    name: database.name,
    enabled: true,
  }),
]);

for (const table of tables) {
  results.push([
    "table",
    table.id,
    await request(`/tablesdb/${databaseId}/tables`, {
      tableId: table.id,
      name: table.name,
      permissions: [],
      rowSecurity: table.rowSecurity,
      enabled: true,
      columns: table.columns,
      indexes: table.indexes,
    }),
  ]);
}

for (const bucket of buckets) {
  results.push([
    "bucket",
    bucket.id,
    await upsertBucket(bucket),
  ]);
}

results.push([
  "function",
  functionDefinition.id,
  await request("/functions", {
    functionId: functionDefinition.id,
    name: functionDefinition.name,
    runtime: functionDefinition.runtime,
    execute: [],
    events: [],
    schedule: "",
    timeout: functionDefinition.timeout,
    enabled: true,
    logging: true,
    entrypoint: functionDefinition.entrypoint,
    commands: functionDefinition.commands,
    scopes: functionDefinition.scopes,
  }),
]);

const deepSeekKey = process.env.DEEPSEEK_API_KEY || process.env.DEEP_SEEK_API_KEY;
if (deepSeekKey) {
  results.push([
    "variable",
    "DEEPSEEK_API_KEY",
    await upsertVariable("deepseek-api-key", "DEEPSEEK_API_KEY", deepSeekKey, true),
  ]);
}

results.push([
  "variable",
  "DEEPSEEK_MODEL",
  await upsertVariable(
    "deepseek-model",
    "DEEPSEEK_MODEL",
    process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    false,
  ),
]);

results.push([
  "variable",
  "ORK_DB_ID",
  await upsertVariable("ork-db-id", "ORK_DB_ID", databaseId, false),
]);

for (const [kind, id, result] of results) {
  console.log(`${result.state.padEnd(8)} ${kind.padEnd(8)} ${id}`);
}

console.log(
  "\nFoundation provisioned. Deploy functions/orchestrator next, then add the runtime values to Sites.",
);

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
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.ok) {
    const resource =
      response.status === 204 ? null : await response.json();
    return { state: "created", resource };
  }

  const error = await response.json().catch(() => ({}));
  if (response.status === 409) {
    return { state: "existing", resource: error };
  }

  throw new Error(
    `${response.status} ${path}: ${error.message ?? "Appwrite request failed"}`,
  );
}

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function reconcileColumns(table) {
  const tablePath = `/tablesdb/${databaseId}/tables/${table.id}`;
  const current = await request(tablePath, undefined, "GET");
  const existing = new Map(
    (current.resource?.columns || []).map((column) => [
      column.key,
      column.status,
    ]),
  );
  let created = 0;

  for (const column of table.columns) {
    if (!existing.has(column.key)) {
      const body = {
        key: column.key,
        required: column.required,
        array: false,
        ...(column.size === undefined ? {} : { size: column.size }),
        ...(column.default === undefined ? {} : { default: column.default }),
        ...(column.type === "string" ? { encrypt: false } : {}),
      };
      await request(`${tablePath}/columns/${column.type}`, body);
      created += 1;
    }
    if (existing.get(column.key) !== "available") {
      for (let attempt = 0; attempt < 1200; attempt += 1) {
        const status = await request(
          `${tablePath}/columns/${column.key}`,
          undefined,
          "GET",
        );
        if (status.resource?.status === "available") break;
        if (status.resource?.status === "failed") {
          throw new Error(
            `Column ${table.id}.${column.key} failed to provision.`,
          );
        }
        if (attempt === 1199) {
          throw new Error(
            `Column ${table.id}.${column.key} did not become available.`,
          );
        }
        await wait(500);
      }
    }
  }

  return created;
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
  const tableResult = await request(`/tablesdb/${databaseId}/tables`, {
    tableId: table.id,
    name: table.name,
    permissions: [],
    rowSecurity: table.rowSecurity,
    enabled: true,
    columns: table.columns,
    indexes: table.indexes,
  });
  if (
    tableResult.state === "existing" &&
    table.id === "ga_readiness_programs"
  ) {
    const addedColumns = await reconcileColumns(table);
    if (addedColumns > 0) {
      tableResult.state = "updated";
      tableResult.addedColumns = addedColumns;
    }
  }
  results.push([
    "table",
    table.id,
    tableResult,
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

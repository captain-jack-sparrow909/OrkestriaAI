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

async function request(path, body) {
  const response = await fetch(`${endpoint.replace(/\/$/, "")}${path}`, {
    method: "POST",
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

const results = [];
results.push([
  "database",
  database.id,
  await request("/tablesdb", {
    databaseId: process.env.APPWRITE_DATABASE_ID || database.id,
    name: database.name,
    enabled: true,
  }),
]);

const databaseId = process.env.APPWRITE_DATABASE_ID || database.id;

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
    await request("/storage/buckets", {
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
    }),
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

for (const [kind, id, result] of results) {
  console.log(`${result.state.padEnd(8)} ${kind.padEnd(8)} ${id}`);
}

console.log(
  "\nFoundation provisioned. Deploy functions/orchestrator next, then add the runtime values to Sites.",
);

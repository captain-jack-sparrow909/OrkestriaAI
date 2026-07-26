import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT?.replace(/\/$/, "");
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const archivePath = process.argv[2] ? resolve(process.argv[2]) : "";
const siteId = process.env.ORK_APPWRITE_SITE_ID || "orkestria-ai";

if (!endpoint || !projectId || !apiKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID, or APPWRITE_API_KEY.",
  );
}
if (!archivePath) {
  throw new Error(
    "Pass the source .tar.gz path: npm run appwrite:deploy-site -- ./code.tar.gz",
  );
}

const baseHeaders = {
  "X-Appwrite-Project": projectId,
  "X-Appwrite-Key": apiKey,
  "X-Appwrite-Response-Format": "1.9.5",
};

async function request(path, options = {}) {
  const response = await fetch(`${endpoint}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...baseHeaders,
      ...(options.json ? { "Content-Type": "application/json" } : {}),
    },
    body: options.json === undefined ? options.body : JSON.stringify(options.json),
  });
  const result =
    response.status === 204
      ? null
      : await response.json().catch(async () => ({
          message: await response.text().catch(() => "Unknown Appwrite error"),
        }));

  if (!response.ok) {
    const error = new Error(
      `${response.status} ${path}: ${result?.message ?? "Appwrite request failed"}`,
    );
    error.status = response.status;
    error.code = result?.type;
    throw error;
  }
  return result;
}

async function getOrCreateSite() {
  try {
    const existing = await request(`/sites/${siteId}`);
    console.log(`Using Appwrite Site ${existing.name} (${existing.$id}).`);
    return existing;
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  const created = await request("/sites", {
    method: "POST",
    json: {
      siteId,
      name: "OrkestriaAI",
      framework: "nextjs",
      buildRuntime: "node-22",
      enabled: true,
      logging: true,
      timeout: 30,
      installCommand: "npm install",
      buildCommand: "npm run build:appwrite",
      startCommand: "",
      outputDirectory: "./.next",
      adapter: "ssr",
      deploymentRetention: 14,
    },
  });
  console.log(`Created Appwrite Site ${created.name} (${created.$id}).`);
  return created;
}

function variableId(key) {
  return `ork-${key.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`.slice(0, 36);
}

async function upsertVariables() {
  const variables = [
    ["NEXT_PUBLIC_APPWRITE_ENDPOINT", endpoint, false],
    ["NEXT_PUBLIC_APPWRITE_PROJECT_ID", projectId, false],
    ["APPWRITE_API_KEY", apiKey, true],
    ["APPWRITE_DATABASE_ID", process.env.APPWRITE_DATABASE_ID || "orkestria", false],
    [
      "APPWRITE_WORKSPACE_UPLOADS_BUCKET_ID",
      process.env.APPWRITE_WORKSPACE_UPLOADS_BUCKET_ID || "workspace-uploads",
      false,
    ],
    [
      "APPWRITE_RUN_EVIDENCE_BUCKET_ID",
      process.env.APPWRITE_RUN_EVIDENCE_BUCKET_ID || "run-evidence",
      false,
    ],
    [
      "APPWRITE_EXPORTS_BUCKET_ID",
      process.env.APPWRITE_EXPORTS_BUCKET_ID || "compliance-exports",
      false,
    ],
    [
      "APPWRITE_FUNCTION_ID",
      process.env.APPWRITE_FUNCTION_ID || "orchestrator",
      false,
    ],
    ["ORK_AUTH_PROVIDER", "appwrite", false],
  ];
  const current = await request(`/sites/${siteId}/variables?total=false`);
  const byKey = new Map((current.variables ?? []).map((item) => [item.key, item]));

  for (const [key, value, secret] of variables) {
    const existing = byKey.get(key);
    if (existing) {
      await request(`/sites/${siteId}/variables/${existing.$id}`, {
        method: "PUT",
        json: { key, value, secret },
      });
    } else {
      await request(`/sites/${siteId}/variables`, {
        method: "POST",
        json: { variableId: variableId(key), key, value, secret },
      });
    }
  }
  console.log(`Synchronized ${variables.length} Appwrite Site variables.`);
}

async function createDeployment() {
  const code = await readFile(archivePath);
  const form = new FormData();
  form.set("code", new Blob([code], { type: "application/gzip" }), "code.tar.gz");
  form.set("installCommand", "npm install");
  form.set("buildCommand", "npm run build:appwrite");
  form.set("outputDirectory", "./.next");
  form.set("activate", "true");

  const deployment = await request(`/sites/${siteId}/deployments`, {
    method: "POST",
    body: form,
  });
  console.log(`Deployment ${deployment.$id} queued.`);
  return deployment;
}

async function waitForDeployment(deploymentId) {
  const terminal = new Set(["ready", "failed", "cancelled"]);
  let lastStatus = "";

  for (let attempt = 0; attempt < 180; attempt += 1) {
    const deployment = await request(
      `/sites/${siteId}/deployments/${deploymentId}`,
    );
    if (deployment.status !== lastStatus) {
      console.log(`Deployment status: ${deployment.status}.`);
      lastStatus = deployment.status;
    }
    if (terminal.has(deployment.status)) {
      if (deployment.status !== "ready") {
        const logs = deployment.buildLogs || deployment.buildLog || "";
        throw new Error(
          `Appwrite deployment ${deployment.status}.${logs ? `\n${logs}` : ""}`,
        );
      }
      return deployment;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5000));
  }

  throw new Error("Appwrite deployment did not finish within 15 minutes.");
}

await getOrCreateSite();
await upsertVariables();
const deployment = await createDeployment();
await waitForDeployment(deployment.$id);
const site = await request(`/sites/${siteId}`);

console.log(
  JSON.stringify(
    {
      siteId: site.$id,
      deploymentId: deployment.$id,
      status: "ready",
      domains: site.domains ?? [],
    },
    null,
    2,
  ),
);

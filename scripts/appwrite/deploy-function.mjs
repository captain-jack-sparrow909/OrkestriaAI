import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT?.replace(/\/$/, "");
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const functionId = process.env.APPWRITE_FUNCTION_ID || "orchestrator";

if (!endpoint || !projectId || !apiKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID, or APPWRITE_API_KEY.",
  );
}

const headers = {
  "X-Appwrite-Project": projectId,
  "X-Appwrite-Key": apiKey,
  "X-Appwrite-Response-Format": "1.9.5",
};

async function appwrite(path, options = {}) {
  const response = await fetch(`${endpoint}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `${response.status} ${path}: ${payload.message || "Appwrite request failed"}`,
    );
  }
  return payload;
}

const sourceDirectory = resolve("functions/orchestrator");
const stagingDirectory = await mkdtemp(join(tmpdir(), "orkestria-function-"));
const archivePath = join(stagingDirectory, "orchestrator.tar.gz");

try {
  execFileSync("tar", ["-czf", archivePath, "-C", sourceDirectory, "."]);
  const archive = await readFile(archivePath);
  const form = new FormData();
  form.set("code", new Blob([archive], { type: "application/gzip" }), "orchestrator.tar.gz");
  form.set("activate", "true");
  form.set("entrypoint", "src/main.js");
  form.set("commands", "npm install");

  const deployment = await appwrite(`/functions/${functionId}/deployments`, {
    method: "POST",
    body: form,
  });

  process.stdout.write(`Deployment ${deployment.$id} queued`);
  let current = deployment;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (["ready", "failed", "canceled"].includes(current.status)) break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 3000));
    current = await appwrite(`/functions/${functionId}/deployments/${deployment.$id}`);
    process.stdout.write(".");
  }

  process.stdout.write("\n");
  if (current.status !== "ready") {
    const buildSummary = String(current.buildLogs || current.buildStdout || "")
      .trim()
      .slice(-2000);
    throw new Error(
      `Function deployment ended with status "${current.status}".${buildSummary ? `\n${buildSummary}` : ""}`,
    );
  }

  console.log(`Orchestrator active · deployment ${deployment.$id}`);
} finally {
  await rm(stagingDirectory, { recursive: true, force: true });
}

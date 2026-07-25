import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the OrkestriaAI landing page and product suite", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>OrkestriaAI — Intelligence that gets work done<\/title>/i);
  assert.match(html, /Intelligence that/);
  assert.match(html, /gets work done\./);
  assert.match(html, /Atlas/);
  assert.match(html, /Loom/);
  assert.match(html, /Sentry/);
  assert.match(html, /Helio/);
  assert.match(html, /Aegis/);
  assert.match(html, /Your approval is required/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("renders every primary marketing route", async () => {
  const routes = [
    ["/products", /Meet the orchestra\./],
    ["/workflows", /Loom Workflow Studio/i],
    ["/security", /Trust is a product feature\./],
    ["/pricing", /Start small\./],
    ["/sign-in", /Continue to your workspace/],
  ];

  for (const [path, expected] of routes) {
    const response = await render(path);
    assert.equal(response.status, 200, `${path} should respond successfully`);
    assert.match(await response.text(), expected);
  }
});

test("keeps production metadata and the Appwrite blueprint aligned", async () => {
  const [layout, packageJson, blueprint, envExample] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../docs/PRODUCT_BLUEPRINT.md", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /OrkestriaAI — Intelligence that gets work done/);
  assert.match(layout, /\/og\.png/);
  assert.doesNotMatch(layout, /codex-preview|Starter Project/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(blueprint, /Appwrite architecture/);
  assert.match(blueprint, /approval_requests/);
  assert.match(envExample, /NEXT_PUBLIC_APPWRITE_PROJECT_ID/);
});

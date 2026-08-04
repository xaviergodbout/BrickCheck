import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
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

test("server-renders the BrickCheck loading shell and metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>BrickCheck — Find every piece<\/title>/i);
  assert.match(html, /name="description" content="Search a LEGO set/);
  assert.match(html, /property="og:image" content="http:\/\/localhost(?::3000)?\/og\.png"/);
  assert.match(html, /href="\/brickcheck-icon\.webp"/);
  assert.match(html, /class="loading-screen"/);
  assert.match(html, /Opening your workbench…/);
});

test("keeps the inventory interactions and full-height shell in source", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /setTimeout\(\(\) => setPreviewing\(true\), 1000\)/);
  assert.match(page, /createPortal\(/);
  assert.match(page, /anchorName/);
  assert.match(page, /positionAnchor/);
  assert.match(page, /"all", "missing", "found", "minifigs"/);
  assert.match(page, /"part" \| "quantity" \| "size"/);
  assert.match(page, /"asc" \| "desc"/);
  assert.match(page, /type GroupMode = "none" \| "color" \| "status"/);
  assert.doesNotMatch(page, /option value="bag"/);
  assert.match(page, /setTheme\("dark"\)/);
  assert.match(page, /className="mobile-menu"/);
  assert.match(page, /<h2>Spare parts<\/h2>/);
  assert.match(page, /page_size=1000/);
  assert.match(page, /className="search-kind-tabs"/);
  assert.match(page, /visibleSearchResults/);
  assert.match(page, /setTimeout\(\(\) => void performSearch\(query\), 400\)/);
  assert.match(page, /className="gallery-modal"/);
  assert.match(page, /setImages: string\[\]/);
  assert.match(page, /translateY\(-3px\)/);
  assert.match(page, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(page, />Mark all</i);
  assert.doesNotMatch(page, /Explore sample check/i);
  assert.match(css, /\.app-shell\s*\{[^}]*min-height:\s*100vh/s);
  assert.match(css, /footer\s*\{[^}]*margin-top:\s*auto/s);
  assert.match(css, /object-fit:\s*contain/);
  assert.match(css, /top:\s*calc\(anchor\(bottom\) \+ 10px\)/);
  assert.match(css, /\.search-results\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill/s);
  assert.match(css, /\.set-card-image\s*\{[^}]*aspect-ratio:\s*1 \/ 1/s);
  assert.match(css, /\.section-heading\.minifig-heading\s*\{[^}]*background:\s*var\(--yellow\)/s);
  assert.doesNotMatch(css, /border-left:\s*3px solid var\(--yellow\)/);

  await Promise.all([
    access(new URL("../public/brickcheck-icon.webp", import.meta.url)),
    access(new URL("../public/og.png", import.meta.url)),
  ]);
});

test("is configured for a repository-path-safe GitHub Pages export", async () => {
  const [nextConfig, viteConfig, workflow] = await Promise.all([
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8"),
  ]);

  assert.match(nextConfig, /output:\s*"export"/);
  assert.match(nextConfig, /GITHUB_REPOSITORY/);
  assert.match(nextConfig, /assetPrefix:\s*basePath/);
  assert.match(viteConfig, /base:\s*githubPagesBase/);
  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /path:\s*dist\/client/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});

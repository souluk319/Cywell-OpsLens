import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(repoRoot, "apps", "web", "dist");
const evidenceDir = path.join(
  repoRoot,
  "docs",
  "product-goals",
  "cywell-opslens-console-mod",
  "presentation",
  "assets"
);

const shots = {
  dashboard: path.join(evidenceDir, "dev015-opslens-dashboard-desktop.png"),
  assistant: path.join(evidenceDir, "dev015-opslens-assistant-movable.png"),
  mobile: path.join(evidenceDir, "dev015-opslens-mobile-nav.png")
};

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

async function assertBuiltApp() {
  try {
    await fs.access(path.join(distDir, "index.html"));
  } catch {
    throw new Error(
      "apps/web/dist/index.html was not found. Run `npm run -w @kugnus/web build` before capturing evidence."
    );
  }
  await fs.mkdir(evidenceDir, { recursive: true });
}

function safePathFromRequest(requestUrl) {
  const url = new URL(requestUrl ?? "/", "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const resolved = path.normalize(path.join(distDir, pathname));
  if (!resolved.startsWith(distDir)) {
    return null;
  }
  return resolved;
}

async function serveDist() {
  const server = createServer(async (request, response) => {
    let filePath = safePathFromRequest(request.url);
    if (!filePath) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    try {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
      const body = await fs.readFile(filePath);
      response.writeHead(200, {
        "content-type": contentTypes.get(path.extname(filePath)) ?? "application/octet-stream"
      });
      response.end(body);
    } catch {
      const body = await fs.readFile(path.join(distDir, "index.html"));
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(body);
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind local evidence server.");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}/index.html`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function preparePage(page, baseUrl, activeNavId = "dashboards") {
  await page.addInitScript(() => {
    window.localStorage.setItem("cywell-opslens-language", "ko");
    window.localStorage.setItem(
      "cywell-opslens-expanded-nav-sections",
      JSON.stringify(["Monitoring", "Cywell"])
    );
  });
  const url = new URL(baseUrl);
  if (activeNavId !== "overview") {
    url.searchParams.set("nav", activeNavId);
  }
  await page.goto(url.toString(), { waitUntil: "networkidle" });
  await page.getByTestId(`active-page-${activeNavId}`).waitFor({ state: "visible" });
  await page.getByTestId("main-stage").waitFor({ state: "visible" });
}

async function captureEvidence() {
  await assertBuiltApp();
  const server = await serveDist();
  const browser = await chromium.launch();

  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const dashboardPage = await desktop.newPage();
    await preparePage(dashboardPage, server.baseUrl, "dashboards");
    await dashboardPage.screenshot({ path: shots.dashboard, fullPage: true });

    const assistantPage = await desktop.newPage();
    await preparePage(assistantPage, server.baseUrl, "alerting");
    await assistantPage.getByTestId("assistant-launcher").click();
    await assistantPage.getByTestId("assistant-popover").waitFor({ state: "visible" });
    await assistantPage.getByTestId("assistant-placement-toggle").click();
    await assistantPage.getByTestId("assistant-placement-move").click();
    await assistantPage.screenshot({ path: shots.assistant, fullPage: true });
    await desktop.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const mobilePage = await mobile.newPage();
    await preparePage(mobilePage, server.baseUrl, "dashboards");
    await mobilePage.getByTestId("nav-collapse-toggle").click();
    await mobilePage.screenshot({ path: shots.mobile, fullPage: true });
    await mobile.close();
  } finally {
    await browser.close();
    await server.close();
  }

  const result = {};
  for (const [key, filePath] of Object.entries(shots)) {
    const stat = await fs.stat(filePath);
    if (stat.size < 20_000) {
      throw new Error(`${key} screenshot is unexpectedly small: ${stat.size} bytes`);
    }
    result[key] = {
      path: path.relative(repoRoot, filePath).replace(/\\/g, "/"),
      bytes: stat.size
    };
  }

  console.log(JSON.stringify({ status: "PASS", screenshots: result }, null, 2));
}

captureEvidence().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

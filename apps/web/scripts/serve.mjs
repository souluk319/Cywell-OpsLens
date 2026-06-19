import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { request as httpsRequest } from "node:https";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const distDir = resolve(here, "../dist");
const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? "0.0.0.0";
const tlsCertFile = process.env.CYWELL_OPSLENS_TLS_CERT_FILE;
const tlsKeyFile = process.env.CYWELL_OPSLENS_TLS_KEY_FILE;
const apiProxyBaseUrl =
  process.env.CYWELL_OPSLENS_API_PROXY_BASE_URL ??
  process.env.CYWELL_OPSLENS_API_URL ??
  "https://cywell-opslens-api:443";
const apiProxyTlsVerify =
  process.env.CYWELL_OPSLENS_API_PROXY_TLS_VERIFY === "true";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

function loadTlsOptions() {
  if (!tlsCertFile || !tlsKeyFile) {
    return undefined;
  }

  if (!existsSync(tlsCertFile) || !existsSync(tlsKeyFile)) {
    return undefined;
  }

  return {
    cert: readFileSync(tlsCertFile),
    key: readFileSync(tlsKeyFile)
  };
}

function send(response, statusCode, body, contentType) {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": statusCode === 200 ? "no-cache" : "no-store"
  });
  response.end(body);
}

function proxyApiRequest(request, response, url) {
  const target = new URL(url.pathname + url.search, apiProxyBaseUrl);
  const isHttps = target.protocol === "https:";
  const proxy = (isHttps ? httpsRequest : httpRequest)(
    target,
    {
      method: request.method,
      headers: {
        ...request.headers,
        host: target.host
      },
      rejectUnauthorized: isHttps ? apiProxyTlsVerify : undefined
    },
    (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode ?? 502, {
        ...proxyResponse.headers,
        "Cache-Control": "no-store"
      });
      proxyResponse.pipe(response);
    }
  );

  proxy.on("error", (error) => {
    send(
      response,
      502,
      JSON.stringify({
        error: "api proxy unavailable",
        message: error instanceof Error ? error.message : "unknown proxy error"
      }),
      "application/json; charset=utf-8"
    );
  });

  request.pipe(proxy);
}

function safeAssetPath(pathname) {
  const normalized = decodeURIComponent(pathname).replace(/^\/+/, "");
  const assetPath = resolve(distDir, normalized || "index.html");
  if (!assetPath.startsWith(distDir)) {
    return join(distDir, "index.html");
  }
  return assetPath;
}

async function requestHandler(request, response) {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

    if (url.pathname === "/healthz") {
      send(
        response,
        200,
        JSON.stringify({
          status: "ok",
          service: "cywell-opslens-dashboard",
          mode: "console-plugin"
        }),
        "application/json; charset=utf-8"
      );
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      proxyApiRequest(request, response, url);
      return;
    }

    const assetPath = safeAssetPath(url.pathname);
    const fallbackPath = join(distDir, "index.html");
    const filePath = existsSync(assetPath) ? assetPath : fallbackPath;
    const body = await readFile(filePath);
    const contentType = contentTypes.get(extname(filePath)) ?? "application/octet-stream";
    send(response, 200, body, contentType);
  } catch (error) {
    send(
      response,
      500,
      JSON.stringify({
        error: error instanceof Error ? error.message : "dashboard serve error"
      }),
      "application/json; charset=utf-8"
    );
  }
}

const tlsOptions = loadTlsOptions();
const server = tlsOptions
  ? createHttpsServer(tlsOptions, requestHandler)
  : createHttpServer(requestHandler);

server.listen(port, host, () => {
  const scheme = tlsOptions ? "https" : "http";
  console.log(`Cywell OpsLens dashboard listening on ${scheme}://${host}:${port}`);
});

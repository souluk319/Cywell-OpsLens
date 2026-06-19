import { existsSync, readFileSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import {
  createActionPlan,
  exportOpsLensRagEvidence,
  getOpsLensAdminOverview,
  getOpsLensRuntimeReadiness,
  createOpsLensToolResponse,
  getDashboardRisks,
  getOpsLensTools,
  handleOpsLensMcpRequest,
  listOpsLensRagApprovalQueue,
  planOpsLensRagIngestion,
  reviewOpsLensRagApprovalQueue,
  submitOpsLensRagApprovalQueue,
  syncContext,
  validateOpsLensRagDocument
} from "./api";
import { loadEnvFile } from "./env";
import {
  analyzeOpsLensIncident,
  intakeOpsLensAlertmanagerIncidents
} from "./incidents";
import {
  discoverOcpResources,
  getOcpCoverageMatrix,
  getOcpCoverageDiagnostic,
  getOcpConsoleOverview,
  getOcpRelatedResources,
  getOcpResource,
  getOcpTopology,
  getOcpPodLogs,
  getOcpStatus,
  listOcpEvents,
  listOcpResource,
  reviewOcpResourceAccess,
  reviewOcpResourceAccessMatrix
} from "./ocpClient";

loadEnvFile();

const port = Number(process.env.KUGNUS_API_PORT ?? process.env.PORT ?? 4174);
const host = process.env.KUGNUS_API_HOST ?? process.env.HOST ?? "127.0.0.1";
const tlsCertFile = process.env.CYWELL_OPSLENS_TLS_CERT_FILE;
const tlsKeyFile = process.env.CYWELL_OPSLENS_TLS_KEY_FILE;

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

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) {
    return {};
  }
  return JSON.parse(text);
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown
) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "authorization,content-type,x-cywell-api-key",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function sendNotFound(response: ServerResponse) {
  sendJson(response, 404, {
    error: "route missing"
  });
}

function classifyRequestError(error: unknown) {
  const message = error instanceof Error ? error.message : "unknown request error";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("not discovered") ||
    normalized.includes("route missing")
  ) {
    return {
      statusCode: 404,
      code: "resource-not-found",
      error: message
    };
  }

  if (
    normalized.includes("rbac denied") ||
    normalized.includes("forbidden") ||
    normalized.includes("not allowed")
  ) {
    return {
      statusCode: 403,
      code: "rbac-denied",
      error: message
    };
  }

  if (
    normalized.includes("ocp api is not reachable") ||
    (normalized.includes("ocp api ") && normalized.includes(" returned ")) ||
    normalized.includes("timed out") ||
    normalized.includes("socket") ||
    normalized.includes("upstream") ||
    normalized.includes("fallback")
  ) {
    return {
      statusCode: 502,
      code: "ocp-upstream-read-failed",
      error: message
    };
  }

  return {
    statusCode: 400,
    code: "bad-request",
    error: message
  };
}

const requestHandler = async (request: IncomingMessage, response: ServerResponse) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

    if (request.method === "OPTIONS") {
      sendJson(response, 204, {});
      return;
    }

    if (request.method === "GET" && url.pathname === "/healthz") {
      sendJson(response, 200, {
        status: "ok",
        service: "cywell-opslens-api",
        mode: "mock-readonly"
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard/risks") {
      sendJson(response, 200, getDashboardRisks());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/context/sync") {
      sendJson(response, 200, syncContext((await readJson(request)) as never));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/actions/plan") {
      sendJson(
        response,
        200,
        await createActionPlan((await readJson(request)) as never, {
          authorization: request.headers.authorization
        })
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/opslens/tools") {
      sendJson(response, 200, getOpsLensTools());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/opslens/admin/overview") {
      sendJson(response, 200, await getOpsLensAdminOverview());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/opslens/runtime/readiness") {
      sendJson(response, 200, await getOpsLensRuntimeReadiness());
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/opslens/admin/rag/validate"
    ) {
      sendJson(
        response,
        200,
        validateOpsLensRagDocument((await readJson(request)) as never)
      );
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/opslens/admin/rag/evidence-export"
    ) {
      sendJson(
        response,
        200,
        exportOpsLensRagEvidence((await readJson(request)) as never)
      );
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/opslens/admin/rag/approval-queue"
    ) {
      sendJson(response, 200, await listOpsLensRagApprovalQueue());
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/opslens/admin/rag/approval-queue/submit"
    ) {
      sendJson(
        response,
        200,
        await submitOpsLensRagApprovalQueue((await readJson(request)) as never)
      );
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/opslens/admin/rag/approval-queue/review"
    ) {
      sendJson(
        response,
        200,
        await reviewOpsLensRagApprovalQueue((await readJson(request)) as never)
      );
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/opslens/admin/rag/approval-queue/ingestion-plan"
    ) {
      sendJson(
        response,
        200,
        await planOpsLensRagIngestion((await readJson(request)) as never)
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/opslens/ask") {
      sendJson(
        response,
        200,
        await createOpsLensToolResponse((await readJson(request)) as never)
      );
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/opslens/incidents/analyze"
    ) {
      sendJson(
        response,
        200,
        await analyzeOpsLensIncident((await readJson(request)) as never)
      );
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/opslens/incidents/alertmanager"
    ) {
      sendJson(
        response,
        200,
        await intakeOpsLensAlertmanagerIncidents((await readJson(request)) as never)
      );
      return;
    }

    if (
      request.method === "POST" &&
      (url.pathname === "/mcp" || url.pathname === "/api/opslens/mcp")
    ) {
      const mcpResponse = await handleOpsLensMcpRequest((await readJson(request)) as never);
      if (!mcpResponse) {
        sendJson(response, 202, {});
        return;
      }
      sendJson(response, mcpResponse.error ? 400 : 200, mcpResponse);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/ocp/status") {
      sendJson(response, 200, await getOcpStatus());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/ocp/console-overview") {
      sendJson(response, 200, await getOcpConsoleOverview());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/ocp/api-resources") {
      sendJson(response, 200, await discoverOcpResources());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/ocp/access-review") {
      sendJson(
        response,
        200,
        await reviewOcpResourceAccess({
          apiVersion: url.searchParams.get("apiVersion") ?? undefined,
          kind: url.searchParams.get("kind") ?? undefined,
          resource: url.searchParams.get("resource") ?? undefined,
          namespace: url.searchParams.get("namespace") ?? undefined,
          name: url.searchParams.get("name") ?? undefined,
          verb: url.searchParams.get("verb") ?? undefined
        })
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/ocp/access-matrix") {
      sendJson(
        response,
        200,
        await reviewOcpResourceAccessMatrix({
          apiVersion: url.searchParams.get("apiVersion") ?? undefined,
          kind: url.searchParams.get("kind") ?? undefined,
          resource: url.searchParams.get("resource") ?? undefined,
          namespace: url.searchParams.get("namespace") ?? undefined,
          name: url.searchParams.get("name") ?? undefined
        })
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/ocp/coverage-matrix") {
      const maxResources = url.searchParams.get("maxResources");
      sendJson(
        response,
        200,
        await getOcpCoverageMatrix({
          namespace: url.searchParams.get("namespace") ?? undefined,
          maxResources: maxResources ? Number(maxResources) : undefined,
          includeDetails: url.searchParams.get("includeDetails") !== "false"
        })
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/ocp/coverage-diagnostic") {
      sendJson(
        response,
        200,
        await getOcpCoverageDiagnostic({
          apiVersion: url.searchParams.get("apiVersion") ?? undefined,
          kind: url.searchParams.get("kind") ?? undefined,
          resource: url.searchParams.get("resource") ?? undefined,
          namespace: url.searchParams.get("namespace") ?? undefined
        })
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/ocp/resources") {
      sendJson(
        response,
        200,
        await listOcpResource({
          apiVersion: url.searchParams.get("apiVersion") ?? undefined,
          kind: url.searchParams.get("kind") ?? undefined,
          resource: url.searchParams.get("resource") ?? undefined,
          namespace: url.searchParams.get("namespace") ?? undefined,
          labelSelector: url.searchParams.get("labelSelector") ?? undefined,
          fieldSelector: url.searchParams.get("fieldSelector") ?? undefined,
          limit: Number(url.searchParams.get("limit") ?? 50),
          continueToken: url.searchParams.get("continue") ?? undefined,
          full: url.searchParams.get("full") === "true"
        })
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/ocp/topology") {
      sendJson(
        response,
        200,
        await getOcpTopology({
          namespace: url.searchParams.get("namespace") ?? undefined,
          limit: Number(url.searchParams.get("limit") ?? 200)
        })
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/ocp/resource") {
      const name = url.searchParams.get("name");
      if (!name) {
        throw new Error("name query parameter is required");
      }

      sendJson(
        response,
        200,
        await getOcpResource({
          apiVersion: url.searchParams.get("apiVersion") ?? undefined,
          kind: url.searchParams.get("kind") ?? undefined,
          resource: url.searchParams.get("resource") ?? undefined,
          namespace: url.searchParams.get("namespace") ?? undefined,
          name,
          full: url.searchParams.get("full") === "true"
        })
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/ocp/related") {
      const name = url.searchParams.get("name");
      if (!name) {
        throw new Error("name query parameter is required");
      }

      sendJson(
        response,
        200,
        await getOcpRelatedResources({
          apiVersion: url.searchParams.get("apiVersion") ?? undefined,
          kind: url.searchParams.get("kind") ?? undefined,
          resource: url.searchParams.get("resource") ?? undefined,
          namespace: url.searchParams.get("namespace") ?? undefined,
          name
        })
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/ocp/pod-logs") {
      const namespace = url.searchParams.get("namespace");
      const pod = url.searchParams.get("pod");
      if (!namespace || !pod) {
        throw new Error("namespace and pod query parameters are required");
      }

      sendJson(
        response,
        200,
        await getOcpPodLogs({
          namespace,
          pod,
          container: url.searchParams.get("container") ?? undefined,
          previous: url.searchParams.get("previous") === "true",
          tailLines: Number(url.searchParams.get("tailLines") ?? 200),
          sinceSeconds: url.searchParams.get("sinceSeconds")
            ? Number(url.searchParams.get("sinceSeconds"))
            : undefined
        })
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/ocp/events") {
      const name = url.searchParams.get("name");
      if (!name) {
        throw new Error("name query parameter is required");
      }

      sendJson(
        response,
        200,
        await listOcpEvents({
          apiVersion: url.searchParams.get("apiVersion") ?? undefined,
          kind: url.searchParams.get("kind") ?? undefined,
          namespace: url.searchParams.get("namespace") ?? undefined,
          name,
          uid: url.searchParams.get("uid") ?? undefined,
          limit: Number(url.searchParams.get("limit") ?? 100)
        })
      );
      return;
    }

    sendNotFound(response);
  } catch (error) {
    const classified = classifyRequestError(error);
    sendJson(response, classified.statusCode, {
      code: classified.code,
      error: classified.error
    });
  }
};

const tlsOptions = loadTlsOptions();
const server = tlsOptions
  ? createHttpsServer(tlsOptions, requestHandler)
  : createHttpServer(requestHandler);

server.listen(port, host, () => {
  const scheme = tlsOptions ? "https" : "http";
  console.log(`Cywell OpsLens API listening on ${scheme}://${host}:${port}`);
});

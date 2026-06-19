import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { loadEnvFile } from "./env";

export type LightspeedQueryMode = "ask" | "troubleshooting";

export interface LightspeedReferencedDocument {
  doc_url: string;
  doc_title: string;
}

export interface LightspeedQueryResponse {
  conversation_id: string;
  response: string;
  referenced_documents: LightspeedReferencedDocument[];
  truncated: boolean;
  input_tokens: number;
  output_tokens: number;
  available_quotas: Record<string, number>;
  tool_calls: unknown[];
  tool_results: unknown[];
}

interface LightspeedConfig {
  baseUrl?: string;
  token?: string;
  provider?: string;
  model?: string;
  tlsVerify: boolean;
  timeoutMs: number;
}

const defaultInClusterLightspeedBaseUrl =
  "https://lightspeed-app-server.openshift-lightspeed.svc.cluster.local:8443";

function boolFromEnv(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) {
    return defaultValue;
  }
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function secondsFromEnv(value: string | undefined, defaultValue: number) {
  if (value === undefined) {
    return defaultValue;
  }
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : defaultValue;
}

function getLightspeedConfig(): LightspeedConfig {
  loadEnvFile();

  const configuredBaseUrl = process.env.OPENSHIFT_LIGHTSPEED_BASE_URL;
  const baseUrl = configuredBaseUrl || defaultInClusterLightspeedBaseUrl;
  const tlsVerify =
    process.env.OPENSHIFT_LIGHTSPEED_TLS_VERIFY !== undefined
      ? boolFromEnv(process.env.OPENSHIFT_LIGHTSPEED_TLS_VERIFY, true)
      : !boolFromEnv(
          process.env.OPENSHIFT_LIGHTSPEED_INSECURE_SKIP_TLS_VERIFY,
          !configuredBaseUrl
        );

  return {
    baseUrl,
    token:
      process.env.OPENSHIFT_LIGHTSPEED_API_TOKEN ??
      process.env.OPENSHIFT_LIGHTSPEED_TOKEN,
    provider: process.env.OPENSHIFT_LIGHTSPEED_PROVIDER,
    model: process.env.OPENSHIFT_LIGHTSPEED_MODEL,
    tlsVerify,
    timeoutMs:
      secondsFromEnv(process.env.OPENSHIFT_LIGHTSPEED_TIMEOUT_SECONDS, 12) *
      1000
  };
}

function bearerTokenFromHeader(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.replace(/^Bearer\s+/i, "") || undefined;
}

function resolveStreamingQueryUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  const path = url.pathname.replace(/\/+$/, "");

  if (path.endsWith("/v1/streaming_query")) {
    return url;
  }

  url.pathname = path.endsWith("/v1")
    ? `${path}/streaming_query`
    : `${path}/v1/streaming_query`;
  return url;
}

function safeHttpError(statusCode: number, body: string) {
  let detail = "";
  try {
    const parsed = JSON.parse(body) as { detail?: unknown; error?: unknown };
    const rawDetail = parsed.detail ?? parsed.error;
    if (typeof rawDetail === "string") {
      detail = `: ${rawDetail.slice(0, 180)}`;
    }
  } catch {
    // Keep errors redacted; body may contain implementation details.
  }
  return `OpenShift Lightspeed /v1/streaming_query failed with HTTP ${statusCode}${detail}`;
}

function normalizeStreamingResponse(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("OpenShift Lightspeed /v1/streaming_query returned no answer");
  }

  const lines = trimmed.split(/\r?\n/);
  const eventLines = lines.some((line) => line.startsWith("data:"))
    ? lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.replace(/^data:\s?/, ""))
      .filter((line) => line && line !== "[DONE]")
    : lines;

  const toolEvidence: string[] = [];
  const answerLines = eventLines.filter((line) => {
    const value = line.trim();
    if (/^Tool call:/i.test(value)) {
      return false;
    }
    if (/^Tool result:/i.test(value)) {
      const rawJson = value.replace(/^Tool result:\s*/i, "");
      try {
        const parsed = JSON.parse(rawJson) as { content?: unknown };
        if (typeof parsed.content === "string" && parsed.content.trim()) {
          toolEvidence.push(parsed.content.trim());
        }
      } catch {
        // Keep telemetry out of the chat even when a tool event is not JSON.
      }
      return false;
    }
    return true;
  });

  const answer = answerLines.join("\n").trim();
  if (answer) {
    return answer;
  }

  if (toolEvidence.length > 0) {
    const evidence = toolEvidence
      .slice(0, 3)
      .map((item) => item.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n- ");
    return [
      "OpenShift Lightspeed returned read-only cluster evidence but did not emit a final prose answer.",
      "",
      "Key evidence:",
      `- ${evidence}`
    ].join("\n");
  }

  return trimmed;
}

async function postText(params: {
  url: URL;
  payload: unknown;
  token: string;
  tlsVerify: boolean;
  timeoutMs: number;
}): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const body = JSON.stringify(params.payload);
    const isHttps = params.url.protocol === "https:";
    const requestImpl = isHttps ? httpsRequest : httpRequest;
    const request = requestImpl(
      params.url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.token}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        },
        rejectUnauthorized: isHttps ? params.tlsVerify : undefined,
        timeout: params.timeoutMs
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const statusCode = response.statusCode ?? 0;
          if (statusCode < 200 || statusCode >= 300) {
            reject(new Error(safeHttpError(statusCode, text)));
            return;
          }
          try {
            resolve(normalizeStreamingResponse(text));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(
        new Error("OpenShift Lightspeed /v1/streaming_query timed out")
      );
    });
    request.on("error", (error) => {
      reject(
        new Error(
          `OpenShift Lightspeed /v1/streaming_query is unreachable: ${error.message}`
        )
      );
    });
    request.write(body);
    request.end();
  });
}

export function describeLightspeedTarget() {
  const config = getLightspeedConfig();
  return {
    configured: Boolean(config.baseUrl && config.token),
    providerConfigured: Boolean(config.provider),
    modelConfigured: Boolean(config.model),
    tlsVerify: config.tlsVerify,
    timeoutMs: config.timeoutMs
  };
}

export async function queryOpenShiftLightspeed(params: {
  query: string;
  mode: LightspeedQueryMode;
  contextAttachment?: unknown;
  bearerToken?: string;
}) {
  const config = getLightspeedConfig();
  const token = bearerTokenFromHeader(params.bearerToken) ?? config.token;
  if (!config.baseUrl || !token) {
    throw new Error(
      "OpenShift Lightspeed base URL or bearer token is not configured"
    );
  }

  const attachments = params.contextAttachment
    ? [
        {
          attachment_type: "configuration",
          content_type: "application/json",
          content: JSON.stringify(params.contextAttachment)
        }
      ]
    : undefined;

  const payload = {
    query: params.query,
    mode: params.mode,
    ...(config.provider ? { provider: config.provider } : {}),
    ...(config.model ? { model: config.model } : {}),
    ...(attachments ? { attachments } : {})
  };

  const response = await postText({
    url: resolveStreamingQueryUrl(config.baseUrl),
    payload,
    token,
    tlsVerify: config.tlsVerify,
    timeoutMs: config.timeoutMs
  });

  return {
    conversation_id: "",
    response,
    referenced_documents: [],
    truncated: false,
    input_tokens: Math.ceil(JSON.stringify(payload).length / 4),
    output_tokens: Math.ceil(response.length / 4),
    available_quotas: {},
    tool_calls: [],
    tool_results: []
  };
}

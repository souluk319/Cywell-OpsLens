import type {
  OcpApiResource,
  OcpApiResourcesResponse,
  OcpConnectionStatus,
  OcpCoverageDiagnosticResponse,
  OcpCoverageGap,
  OcpCoverageGapType,
  OcpCoverageMatrixResponse,
  OcpDiagnosticFinding,
  OcpEventsResponse,
  OcpEventSummary,
  OcpConsoleOverviewResponse,
  OcpPodLogsResponse,
  OcpPrometheusQueryResponse,
  OcpResourceAccessMatrixResponse,
  OcpResourceAccessReview,
  OcpResourceAccessReviewResponse,
  OcpResourceCoverageEntry,
  OcpResourceDetailResponse,
  OcpResourceListResponse,
  OcpRelatedResourcesResponse,
  OcpResourceSummary,
  OcpTopologyNode,
  OcpTopologyResponse,
  OcpConditionSummary
} from "@kugnus/contracts";
import { lookup as dnsLookup } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { RequestOptions } from "node:https";
import { getOcpConfig, type OcpConfig } from "./env";

interface KubernetesApiResource {
  name: string;
  singularName?: string;
  namespaced: boolean;
  kind: string;
  verbs: string[];
  shortNames?: string[];
  categories?: string[];
}

interface KubernetesApiResourceList {
  groupVersion: string;
  resources: KubernetesApiResource[];
}

interface KubernetesGroupList {
  groups: Array<{
    name: string;
    preferredVersion?: {
      groupVersion: string;
      version: string;
    };
    versions: Array<{
      groupVersion: string;
      version: string;
    }>;
  }>;
}

interface KubeList {
  metadata?: {
    continue?: string;
  };
  items?: Array<Record<string, unknown>>;
}

interface RawOwnerReference {
  apiVersion?: unknown;
  kind?: unknown;
  name?: unknown;
  uid?: unknown;
  controller?: unknown;
  blockOwnerDeletion?: unknown;
}

const discoveryCacheTtlMs = 30_000;
let discoveryCache:
  | {
      expiresAt: number;
      response: OcpApiResourcesResponse;
    }
  | undefined;
let activeBaseUrl: string | undefined;
let activeToken: string | undefined;
const routeAddressCacheTtlMs = 60_000;
const routeAddressCache = new Map<
  string,
  {
    address: string;
    expiresAt: number;
    family: number;
  }
>();

const sensitiveKeyPattern =
  /(^data$|^stringData$|token|password|passwd|secret|client-key|private-key|authorization|bearer|api[_-]?key|certificate)/i;
const partialObjectMetadataAccept =
  "application/json;as=PartialObjectMetadata;g=meta.k8s.io;v=v1, application/json";
const partialObjectMetadataListAccept =
  "application/json;as=PartialObjectMetadataList;g=meta.k8s.io;v=v1, application/json";

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim();
  const url = new URL(trimmed);

  url.pathname = url.pathname
    .replace(/\/+$/, "")
    .replace(/\/api$/, "")
    .replace(/\/apis$/, "");
  if (!url.pathname) {
    url.pathname = "/";
  }

  if (url.port === "8443") {
    url.port = "6443";
  }

  return url.toString().replace(/\/+$/, "");
}

function configuredStatus(config: OcpConfig): OcpConnectionStatus {
  const firstBaseUrl = candidateBaseUrls(config)[0];

  return {
    configured: Boolean(firstBaseUrl && candidateTokens(config).length > 0),
    reachable: false,
    baseUrl: activeBaseUrl ?? firstBaseUrl,
    tlsVerify: config.tlsVerify
  };
}

function assertConfigured(config: OcpConfig): asserts config is OcpConfig & {
  baseUrlCandidates: string[];
} {
  if (candidateBaseUrls(config).length === 0 || candidateTokens(config).length === 0) {
    throw new Error(
      "OCP API base URL and token are required. Set OCP_API_BASE_URL/OCP_API_TOKEN or kubeconfig plus OCP_API_TOKEN."
    );
  }
}

function candidateBaseUrls(config: OcpConfig) {
  const candidates = [
    activeBaseUrl,
    ...config.baseUrlCandidates,
    config.baseUrl
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(candidates.map((value) => normalizeBaseUrl(value))));
}

function candidateTokens(config: OcpConfig) {
  return Array.from(
    new Set(
      [activeToken, ...config.tokenCandidates, config.token].filter(
        (value): value is string => Boolean(value)
      )
    )
  );
}

function ocpPathForResource(
  resource: Pick<OcpApiResource, "group" | "version" | "name">,
  namespace?: string,
  name?: string
) {
  const encodedResource = encodeURIComponent(resource.name);
  const encodedName = name ? `/${encodeURIComponent(name)}` : "";

  if (resource.group) {
    const base = `/apis/${resource.group}/${resource.version}`;
    return namespace
      ? `${base}/namespaces/${encodeURIComponent(namespace)}/${encodedResource}${encodedName}`
      : `${base}/${encodedResource}${encodedName}`;
  }

  const base = `/api/${resource.version}`;
  return namespace
    ? `${base}/namespaces/${encodeURIComponent(namespace)}/${encodedResource}${encodedName}`
    : `${base}/${encodedResource}${encodedName}`;
}

async function requestJson<T>(
  config: OcpConfig,
  path: string,
  options?: {
    accept?: string;
    method?: "GET" | "POST";
    body?: unknown;
    searchParams?: URLSearchParams;
    timeoutMs?: number;
  }
): Promise<T> {
  assertConfigured(config);

  const errors: string[] = [];

  for (const base of candidateBaseUrls(config)) {
    for (const token of candidateTokens(config)) {
      try {
        const result = await requestJsonFromBase<T>(
          config,
          base,
          token,
          path,
          options
        );
        activeBaseUrl = base;
        activeToken = token;
        return result;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  throw new Error(errors.join(" | ") || "OCP API request failed");
}

async function requestText(
  config: OcpConfig,
  path: string,
  options?: {
    accept?: string;
    searchParams?: URLSearchParams;
    timeoutMs?: number;
  }
): Promise<string> {
  assertConfigured(config);

  const errors: string[] = [];

  for (const base of candidateBaseUrls(config)) {
    for (const token of candidateTokens(config)) {
      try {
        const result = await requestTextFromBase(config, base, token, path, options);
        activeBaseUrl = base;
        activeToken = token;
        return result;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  throw new Error(errors.join(" | ") || "OCP API text request failed");
}

async function requestJsonFromBase<T>(
  config: OcpConfig,
  base: string,
  token: string,
  path: string,
  options?: {
    accept?: string;
    method?: "GET" | "POST";
    body?: unknown;
    searchParams?: URLSearchParams;
    timeoutMs?: number;
  }
): Promise<T> {
  const url = new URL(path, `${base}/`);
  if (options?.searchParams) {
    url.search = options.searchParams.toString();
  }

  const requestImpl = url.protocol === "http:" ? httpRequest : httpsRequest;
  const body =
    options?.body === undefined ? undefined : JSON.stringify(options.body);
  const requestOptions: RequestOptions = {
    method: options?.method ?? "GET",
    headers: {
      Accept: options?.accept ?? "application/json",
      Authorization: `Bearer ${token}`
    }
  };
  if (body) {
    requestOptions.headers = {
      ...requestOptions.headers,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body)
    };
  }

  if (url.protocol === "https:") {
    requestOptions.rejectUnauthorized = config.tlsVerify;
    if (config.caCert) {
      requestOptions.ca = config.caCert;
    }
  }

  return await new Promise((resolve, reject) => {
    const req = requestImpl(url, requestOptions, (res) => {
      const chunks: Buffer[] = [];

      res.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(
            new Error(
              `OCP API ${url.origin}${url.pathname} returned ${res.statusCode}: ${body.slice(0, 180)}`
            )
          );
          return;
        }

        try {
          resolve(JSON.parse(body) as T);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on("error", reject);
    const timeoutMs = options?.timeoutMs ?? config.timeoutMs;
    req.setTimeout(timeoutMs, () => {
      req.destroy(
        new Error(`OCP API request timed out after ${timeoutMs}ms`)
      );
    });
    req.end(body);
  });
}

async function requestTextFromBase(
  config: OcpConfig,
  base: string,
  token: string,
  path: string,
  options?: {
    accept?: string;
    searchParams?: URLSearchParams;
    timeoutMs?: number;
  }
): Promise<string> {
  const url = new URL(path, `${base}/`);
  if (options?.searchParams) {
    url.search = options.searchParams.toString();
  }

  const requestImpl = url.protocol === "http:" ? httpRequest : httpsRequest;
  const requestOptions: RequestOptions = {
    method: "GET",
    headers: {
      Accept: options?.accept ?? "text/plain",
      Authorization: `Bearer ${token}`
    }
  };

  if (url.protocol === "https:") {
    requestOptions.rejectUnauthorized = config.tlsVerify;
    if (config.caCert) {
      requestOptions.ca = config.caCert;
    }
  }

  return await new Promise((resolve, reject) => {
    const req = requestImpl(url, requestOptions, (res) => {
      const chunks: Buffer[] = [];

      res.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(
            new Error(
              `OCP API ${url.origin}${url.pathname} returned ${res.statusCode}: ${body.slice(0, 180)}`
            )
          );
          return;
        }

        resolve(body);
      });
    });

    req.on("error", reject);
    const timeoutMs = options?.timeoutMs ?? config.timeoutMs;
    req.setTimeout(timeoutMs, () => {
      req.destroy(
        new Error(`OCP API request timed out after ${timeoutMs}ms`)
      );
    });
    req.end();
  });
}

function lookupAddress(hostname: string) {
  return new Promise<{ address: string; family: number }>((resolve, reject) => {
    dnsLookup(hostname, { family: 0 }, (error, address, family) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ address: String(address), family: Number(family) });
    });
  });
}

function routeWildcardSuffix(hostname: string) {
  const parts = hostname.split(".");
  return parts.length > 2 ? parts.slice(1).join(".") : undefined;
}

async function resolveRouteRouterAddress(hostname: string) {
  const suffix = routeWildcardSuffix(hostname);
  if (!suffix) {
    throw new Error(`No wildcard route suffix for ${hostname}`);
  }

  const cached = routeAddressCache.get(suffix);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  const routerHosts = [
    `console-openshift-console.${suffix}`,
    `oauth-openshift.${suffix}`,
    `default-route-openshift-image-registry.${suffix}`
  ];
  const errors: string[] = [];

  for (const routerHost of routerHosts) {
    try {
      const resolved = await lookupAddress(routerHost);
      const cachedAddress = {
        ...resolved,
        expiresAt: Date.now() + routeAddressCacheTtlMs
      };
      routeAddressCache.set(suffix, cachedAddress);
      return cachedAddress;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(errors.join(" | ") || "route router DNS lookup failed");
}

function monitoringRouteLookup(routeHost: string): RequestOptions["lookup"] {
  return ((hostname: string, options: unknown, maybeCallback?: unknown) => {
    const callback =
      typeof options === "function" ? options : maybeCallback;
    if (typeof callback !== "function") {
      return;
    }
    const wantsAll =
      typeof options === "object" &&
      options !== null &&
      "all" in options &&
      Boolean((options as { all?: unknown }).all);

    resolveRouteRouterAddress(routeHost)
      .then((resolved) => {
        if (wantsAll) {
          callback(null, [{ address: resolved.address, family: resolved.family }]);
          return;
        }
        callback(null, resolved.address, resolved.family);
      })
      .catch(() => {
        dnsLookup(hostname, { family: 0 }, (error, address, family) => {
          if (error) {
            if (wantsAll) {
              callback(error, []);
              return;
            }
            callback(error, "127.0.0.1", 4);
            return;
          }
          if (wantsAll) {
            callback(null, [{ address: String(address), family: Number(family) }]);
            return;
          }
          callback(null, String(address), Number(family));
        });
      });
  }) as RequestOptions["lookup"];
}

async function requestMonitoringRouteJson<T>(
  config: OcpConfig,
  routeName: string,
  path: string,
  options?: {
    searchParams?: URLSearchParams;
    timeoutMs?: number;
  }
): Promise<T> {
  const route = await requestJson<{
    spec?: {
      host?: string;
    };
  }>(
    config,
    `/apis/route.openshift.io/v1/namespaces/openshift-monitoring/routes/${encodeURIComponent(routeName)}`
  );
  const routeHost = route.spec?.host;
  if (!routeHost) {
    throw new Error(`openshift-monitoring route ${routeName} has no host`);
  }

  const url = new URL(path, `https://${routeHost}/`);
  if (options?.searchParams) {
    url.search = options.searchParams.toString();
  }

  const errors: string[] = [];

  for (const token of candidateTokens(config)) {
    try {
      return await new Promise((resolve, reject) => {
        const requestOptions: RequestOptions = {
          method: "GET",
          hostname: routeHost,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`
          },
          lookup: monitoringRouteLookup(routeHost),
          path: `${url.pathname}${url.search}`,
          port: 443,
          rejectUnauthorized: config.tlsVerify
        };
        requestOptions.servername = routeHost;
        if (config.caCert) {
          requestOptions.ca = config.caCert;
        }

        const req = httpsRequest(requestOptions, (res) => {
          const chunks: Buffer[] = [];

          res.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });

          res.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf8");
            if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
              reject(
                new Error(
                  `monitoring route ${routeName} returned ${res.statusCode}: ${body.slice(0, 180)}`
                )
              );
              return;
            }

            try {
              resolve(JSON.parse(body) as T);
            } catch (error) {
              reject(error);
            }
          });
        });

        req.on("error", reject);
        const timeoutMs = options?.timeoutMs ?? config.timeoutMs;
        req.setTimeout(timeoutMs, () => {
          req.destroy(
            new Error(`monitoring route request timed out after ${timeoutMs}ms`)
          );
        });
        req.end();
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(
    errors.join(" | ") || `monitoring route ${routeName} request failed`
  );
}

function splitGroupVersion(groupVersion: string) {
  const parts = groupVersion.split("/");
  if (parts.length === 1) {
    return {
      group: "",
      version: parts[0]
    };
  }

  return {
    group: parts.slice(0, -1).join("/"),
    version: parts.at(-1) ?? ""
  };
}

function isSubresource(name: string) {
  return name.includes("/");
}

function isSecretResource(resource: Pick<OcpApiResource, "name" | "kind">) {
  return resource.kind === "Secret" || resource.name === "secrets";
}

function toApiResource(
  groupVersion: string,
  preferredVersions: Set<string>,
  resource: KubernetesApiResource
): OcpApiResource {
  const { group, version } = splitGroupVersion(groupVersion);

  return {
    group,
    version,
    apiVersion: groupVersion,
    name: resource.name,
    kind: resource.kind,
    namespaced: resource.namespaced,
    verbs: resource.verbs ?? [],
    shortNames: resource.shortNames ?? [],
    categories: resource.categories ?? [],
    preferred: preferredVersions.has(groupVersion) || group === "",
    safeToList:
      !isSubresource(resource.name) &&
      (resource.verbs ?? []).includes("list") &&
      resource.kind !== "Secret"
  };
}

function summarizeResource(item: Record<string, unknown>): OcpResourceSummary {
  const metadata = item.metadata as
    | {
        name?: string;
        namespace?: string;
        uid?: string;
        creationTimestamp?: string;
        labels?: Record<string, string>;
        annotations?: Record<string, string>;
        ownerReferences?: RawOwnerReference[];
      }
    | undefined;

  const kind = String(item.kind ?? "");

  return {
    apiVersion: String(item.apiVersion ?? ""),
    kind,
    metadata: {
      name: metadata?.name ?? "",
      namespace: metadata?.namespace,
      uid: metadata?.uid,
      creationTimestamp: metadata?.creationTimestamp,
      labels: metadata?.labels,
      annotations: metadata?.annotations,
      ownerReferences: summarizeOwnerReferences(metadata?.ownerReferences)
    },
    type: typeof item.type === "string" ? item.type : undefined,
    status: item.status,
    spec: kind === "Secret" ? undefined : item.spec,
    dataRedacted:
      kind === "Secret" || "data" in item || "stringData" in item
        ? true
        : undefined
  };
}

function summarizeOwnerReferences(value: unknown) {
  const references = Array.isArray(value) ? value : [];
  return references
    .map((reference) => {
      const record = reference as RawOwnerReference;
      return {
        apiVersion: String(record.apiVersion ?? ""),
        kind: String(record.kind ?? ""),
        name: String(record.name ?? ""),
        uid: typeof record.uid === "string" ? record.uid : undefined,
        controller:
          typeof record.controller === "boolean" ? record.controller : undefined,
        blockOwnerDeletion:
          typeof record.blockOwnerDeletion === "boolean"
            ? record.blockOwnerDeletion
            : undefined
      };
    })
    .filter((reference) => reference.kind && reference.name);
}

function sanitizeResource(value: unknown): {
  value: unknown;
  redactionCount: number;
} {
  if (Array.isArray(value)) {
    let redactionCount = 0;
    const sanitized = value.map((item) => {
      const result = sanitizeResource(item);
      redactionCount += result.redactionCount;
      return result.value;
    });
    return { value: sanitized, redactionCount };
  }

  if (!value || typeof value !== "object") {
    return { value, redactionCount: 0 };
  }

  let redactionCount = 0;
  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(record)) {
    if (sensitiveKeyPattern.test(key)) {
      sanitized[key] = "[REDACTED]";
      redactionCount += 1;
      continue;
    }

    const result = sanitizeResource(item);
    sanitized[key] = result.value;
    redactionCount += result.redactionCount;
  }

  return {
    value: sanitized,
    redactionCount
  };
}

function getObjectMetadata(item: Record<string, unknown>) {
  return item.metadata as
    | {
        name?: string;
        namespace?: string;
        uid?: string;
      }
    | undefined;
}

function summarizeEvent(item: Record<string, unknown>): OcpEventSummary {
  const metadata = getObjectMetadata(item);
  const involvedObject = item.involvedObject as
    | OcpEventSummary["regarding"]
    | undefined;
  const regarding = (item.regarding as OcpEventSummary["regarding"] | undefined) ??
    involvedObject;
  const source = item.source as { component?: string; host?: string } | undefined;

  return {
    apiVersion: String(item.apiVersion ?? "v1"),
    kind: String(item.kind ?? "Event"),
    name: metadata?.name ?? "",
    namespace: metadata?.namespace,
    reason: typeof item.reason === "string" ? item.reason : undefined,
    type: typeof item.type === "string" ? item.type : undefined,
    message: typeof item.message === "string" ? item.message : undefined,
    source:
      typeof item.reportingController === "string"
        ? item.reportingController
        : source?.component ?? source?.host,
    firstTimestamp:
      typeof item.firstTimestamp === "string"
        ? item.firstTimestamp
        : typeof item.eventTime === "string"
          ? item.eventTime
          : undefined,
    lastTimestamp:
      typeof item.lastTimestamp === "string"
        ? item.lastTimestamp
        : typeof item.eventTime === "string"
          ? item.eventTime
          : undefined,
    count: typeof item.count === "number" ? item.count : undefined,
    regarding
  };
}

function conditionsFrom(value: unknown): OcpConditionSummary[] {
  const conditions = Array.isArray(value) ? value : [];
  return conditions.map((condition) => {
    const record = condition as Record<string, unknown>;
    return {
      type: String(record.type ?? ""),
      status: String(record.status ?? ""),
      reason: typeof record.reason === "string" ? record.reason : undefined,
      message: typeof record.message === "string" ? record.message : undefined
    };
  });
}

function conditionStatus(
  conditions: OcpConditionSummary[],
  type: string
): string | undefined {
  return conditions.find((condition) => condition.type === type)?.status;
}

async function listAllItems(
  config: OcpConfig,
  path: string,
  limit = 500,
  accept?: string
): Promise<Array<Record<string, unknown>>> {
  const items: Array<Record<string, unknown>> = [];
  let continueToken: string | undefined;

  for (let page = 0; page < 20; page += 1) {
    const searchParams = new URLSearchParams({
      limit: String(limit)
    });
    if (continueToken) {
      searchParams.set("continue", continueToken);
    }

    const list = await requestJson<KubeList>(config, path, {
      accept,
      searchParams
    });
    items.push(...(list.items ?? []));

    continueToken = list.metadata?.continue;
    if (!continueToken) {
      break;
    }
  }

  return items;
}

async function listAllItemsSafe(config: OcpConfig, path: string) {
  try {
    return await listAllItems(config, path);
  } catch {
    return [];
  }
}

function compactError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 240);
}

function titleCaseResourceName(name: string) {
  return name
    .replace(/[-_]/g, " ")
    .replace(/s$/i, "")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\s+/g, "");
}

function requestedResourceStub(params: {
  apiVersion?: string;
  kind?: string;
  resource?: string;
  namespace?: string;
}): OcpApiResource {
  const apiVersion = params.apiVersion ?? "v1";
  const { group, version } = splitGroupVersion(apiVersion);
  const name = params.resource?.trim() || params.kind?.toLowerCase() || "resources";

  return {
    group,
    version,
    apiVersion,
    name,
    kind: params.kind?.trim() || titleCaseResourceName(name),
    namespaced: Boolean(params.namespace),
    verbs: [],
    shortNames: [],
    categories: [],
    preferred: false,
    safeToList: false
  };
}

function classifyListFailure(
  message: string,
  evidence: string[]
): OcpResourceListResponse["failure"] {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("not discovered") ||
    normalized.includes("not listable") ||
    normalized.includes("not found")
  ) {
    return {
      code: "resource-not-found",
      statusCode: 404,
      message,
      retryable: false,
      evidence
    };
  }

  if (
    normalized.includes("rbac denied") ||
    normalized.includes("forbidden") ||
    normalized.includes("not allowed")
  ) {
    return {
      code: "rbac-denied",
      statusCode: 403,
      message,
      retryable: true,
      evidence
    };
  }

  if (
    normalized.includes("secret raw fetch is blocked") ||
    normalized.includes("security review")
  ) {
    return {
      code: "resource-read-blocked",
      statusCode: 403,
      message,
      retryable: false,
      evidence
    };
  }

  if (
    normalized.includes("ocp api is not reachable") ||
    normalized.includes("timed out") ||
    normalized.includes("socket") ||
    normalized.includes("upstream") ||
    normalized.includes("fallback")
  ) {
    return {
      code: "ocp-upstream-read-failed",
      statusCode: 502,
      message,
      retryable: true,
      evidence
    };
  }

  return {
    code: "bad-request",
    statusCode: 400,
    message,
    retryable: true,
    evidence
  };
}

function failedListResponse(params: {
  status: OcpConnectionStatus;
  requested: {
    apiVersion?: string;
    kind?: string;
    resource?: string;
    namespace?: string;
    labelSelector?: string;
    fieldSelector?: string;
  };
  resource?: OcpApiResource;
  access?: OcpResourceAccessReview;
  message: string;
  evidence: string[];
}): OcpResourceListResponse {
  const resource = params.resource ?? requestedResourceStub(params.requested);

  return {
    status: params.status,
    resource,
    namespace: resource.namespaced ? params.requested.namespace : undefined,
    failure: classifyListFailure(params.message, params.evidence),
    selectors: {
      labelSelector: params.requested.labelSelector?.trim() || undefined,
      fieldSelector: params.requested.fieldSelector?.trim() || undefined
    },
    items: [],
    access: {
      list: params.access
    },
    redaction: {
      secretDataRedacted: true,
      fullSecretFetchBlocked: true
    }
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    })
  );

  return results;
}

const relatedChildResourceCandidates = [
  { apiVersion: "v1", name: "pods" },
  { apiVersion: "v1", name: "replicationcontrollers" },
  { apiVersion: "apps/v1", name: "replicasets" },
  { apiVersion: "apps/v1", name: "deployments" },
  { apiVersion: "apps/v1", name: "statefulsets" },
  { apiVersion: "apps/v1", name: "daemonsets" },
  { apiVersion: "batch/v1", name: "jobs" },
  { apiVersion: "batch/v1", name: "cronjobs" },
  { apiVersion: "build.openshift.io/v1", name: "builds" }
];

function itemHasOwnerUid(item: Record<string, unknown>, ownerUid: string) {
  const metadata = getObjectMetadata(item) as
    | {
        ownerReferences?: RawOwnerReference[];
      }
    | undefined;
  return summarizeOwnerReferences(metadata?.ownerReferences).some(
    (owner) => owner.uid === ownerUid
  );
}

async function getVersionStatus(
  config: OcpConfig
): Promise<Partial<OcpConnectionStatus>> {
  const version = await requestJson<{
    gitVersion?: string;
    platform?: string;
  }>(config, "/version");

  return {
    gitVersion: version.gitVersion,
    platform: version.platform
  };
}

async function tryGetCurrentUser(config: OcpConfig) {
  try {
    const user = await requestJson<{ metadata?: { name?: string } }>(
      config,
      "/apis/user.openshift.io/v1/users/~"
    );
    return user.metadata?.name;
  } catch {
    return undefined;
  }
}

function requireReadVerb(verb: string) {
  if (!["get", "list", "watch"].includes(verb)) {
    throw new Error(`read-only access review does not support verb '${verb}'`);
  }
  return verb;
}

function accessDenied(access: OcpResourceAccessReview) {
  return !access.allowed && !access.evaluationError;
}

async function reviewResourceAccess(
  config: OcpConfig,
  resource: Pick<OcpApiResource, "group" | "version" | "apiVersion" | "name" | "namespaced"> & {
    subresource?: string;
  },
  params: {
    verb: string;
    namespace?: string;
    name?: string;
  }
): Promise<OcpResourceAccessReview> {
  const verb = requireReadVerb(params.verb);
  const namespace = resource.namespaced ? params.namespace : undefined;
  const evidence = [
    "authorization.k8s.io/v1 SelfSubjectAccessReview",
    `${verb} ${resource.apiVersion}/${resource.name}${resource.subresource ? `/${resource.subresource}` : ""}`,
    namespace ? `namespace=${namespace}` : "cluster scope"
  ];

  try {
    const review = await requestJson<{
      status?: {
        allowed?: boolean;
        denied?: boolean;
        reason?: string;
        evaluationError?: string;
      };
    }>(config, "/apis/authorization.k8s.io/v1/selfsubjectaccessreviews", {
      method: "POST",
      body: {
        apiVersion: "authorization.k8s.io/v1",
        kind: "SelfSubjectAccessReview",
        spec: {
          resourceAttributes: {
            group: resource.group,
            version: resource.version,
            resource: resource.name,
            subresource: resource.subresource,
            verb,
            namespace,
            name: params.name
          }
        }
      },
      timeoutMs: Math.min(config.timeoutMs, 3000)
    });

    return {
      verb,
      allowed: Boolean(review.status?.allowed),
      denied: review.status?.denied,
      reason: review.status?.reason,
      evaluationError: review.status?.evaluationError,
      namespace,
      name: params.name,
      resourceAttributes: {
        group: resource.group,
        version: resource.version,
        resource: resource.name,
        subresource: resource.subresource
      },
      evidence
    };
  } catch (error) {
    return {
      verb,
      allowed: false,
      evaluationError:
        error instanceof Error ? error.message : "SelfSubjectAccessReview failed",
      namespace,
      name: params.name,
      resourceAttributes: {
        group: resource.group,
        version: resource.version,
        resource: resource.name,
        subresource: resource.subresource
      },
      evidence
    };
  }
}

export async function getOcpStatus(): Promise<OcpConnectionStatus> {
  const config = getOcpConfig();
  const base = configuredStatus(config);

  if (!base.configured) {
    return {
      ...base,
      error: "OCP API is not configured"
    };
  }

  try {
    const [version, userName] = await Promise.all([
      getVersionStatus(config),
      tryGetCurrentUser(config)
    ]);

    return {
      ...base,
      ...version,
      baseUrl: activeBaseUrl ?? base.baseUrl,
      userName,
      reachable: true
    };
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : "OCP API request failed"
    };
  }
}

export async function discoverOcpResources(): Promise<OcpApiResourcesResponse> {
  const now = Date.now();
  if (discoveryCache && discoveryCache.expiresAt > now) {
    return discoveryCache.response;
  }

  const config = getOcpConfig();
  const status = await getOcpStatus();
  if (!status.configured || !status.reachable) {
    return {
      status,
      resources: [],
      errors: []
    };
  }

  const errors: OcpApiResourcesResponse["errors"] = [];
  const resources: OcpApiResource[] = [];

  try {
    const coreVersions = await requestJson<{ versions: string[] }>(
      config,
      "/api"
    );
    const groupList = await requestJson<KubernetesGroupList>(config, "/apis");
    const preferredVersions = new Set(
      groupList.groups
        .map((group) => group.preferredVersion?.groupVersion)
        .filter((value): value is string => Boolean(value))
    );

    const groupVersions = [
      ...coreVersions.versions,
      ...groupList.groups.flatMap((group) =>
        group.versions.map((version) => version.groupVersion)
      )
    ];

    const discovered = await Promise.all(
      groupVersions.map(async (groupVersion) => {
        const path = groupVersion.includes("/")
          ? `/apis/${groupVersion}`
          : `/api/${groupVersion}`;
        try {
          const list = await requestJson<KubernetesApiResourceList>(
            config,
            path
          );
          return list.resources
            .filter((resource) => !isSubresource(resource.name))
            .map((resource) =>
              toApiResource(list.groupVersion, preferredVersions, resource)
            );
        } catch (error) {
          errors.push({
            apiVersion: groupVersion,
            message:
              error instanceof Error
                ? error.message
                : "resource discovery failed"
          });
          return [];
        }
      })
    );

    resources.push(...discovered.flat());
  } catch (error) {
    errors.push({
      apiVersion: "*",
      message:
        error instanceof Error ? error.message : "API discovery failed"
    });
  }

  const response: OcpApiResourcesResponse = {
    status: {
      ...status,
      discoveredResourceCount: resources.length
    },
    resources: resources.sort((a, b) =>
      `${a.apiVersion}/${a.name}`.localeCompare(`${b.apiVersion}/${b.name}`)
    ),
    errors
  };

  discoveryCache = {
    expiresAt: now + discoveryCacheTtlMs,
    response
  };

  return response;
}

function findDiscoveredResource(
  discovery: OcpApiResourcesResponse,
  params: {
    apiVersion?: string;
    kind?: string;
    resource?: string;
  },
  verb?: string
) {
  return discovery.resources.find((resource) => {
    if (params.apiVersion && resource.apiVersion !== params.apiVersion) {
      return false;
    }
    if (params.resource && resource.name !== params.resource) {
      return false;
    }
    if (params.kind && resource.kind !== params.kind) {
      return false;
    }
    return verb ? resource.verbs.includes(verb) : true;
  });
}

export async function reviewOcpResourceAccess(params: {
  apiVersion?: string;
  kind?: string;
  resource?: string;
  namespace?: string;
  name?: string;
  verb?: string;
}): Promise<OcpResourceAccessReviewResponse> {
  const config = getOcpConfig();
  const discovery = await discoverOcpResources();
  if (!discovery.status.configured || !discovery.status.reachable) {
    throw new Error(discovery.status.error ?? "OCP API is not reachable");
  }

  const verb = requireReadVerb(params.verb ?? "list");
  const match = findDiscoveredResource(discovery, params, verb);
  if (!match) {
    throw new Error(
      "requested OCP resource was not discovered or does not expose that read verb"
    );
  }

  return {
    status: discovery.status,
    resource: match,
    access: await reviewResourceAccess(config, match, {
      verb,
      namespace: params.namespace,
      name: params.name
    })
  };
}

export async function reviewOcpResourceAccessMatrix(params: {
  apiVersion?: string;
  kind?: string;
  resource?: string;
  namespace?: string;
  name?: string;
}): Promise<OcpResourceAccessMatrixResponse> {
  const config = getOcpConfig();
  const discovery = await discoverOcpResources();
  if (!discovery.status.configured || !discovery.status.reachable) {
    throw new Error(discovery.status.error ?? "OCP API is not reachable");
  }

  const match = findDiscoveredResource(discovery, params);
  if (!match) {
    throw new Error("requested OCP resource was not discovered");
  }

  const readVerbs = ["get", "list", "watch"] as const;
  const entries = await Promise.all(
    readVerbs.map(async (verb) => {
      if (!match.verbs.includes(verb)) {
        return [verb, undefined] as const;
      }
      return [
        verb,
        await reviewResourceAccess(config, match, {
          verb,
          namespace: params.namespace,
          name: verb === "get" ? params.name : undefined
        })
      ] as const;
    })
  );

  return {
    status: discovery.status,
    resource: match,
    namespace: match.namespaced ? params.namespace : undefined,
    name: params.name,
    access: Object.fromEntries(
      entries.filter((entry): entry is [typeof readVerbs[number], OcpResourceAccessReview] =>
        Boolean(entry[1])
      )
    )
  };
}

function ocpResourceKey(resource: Pick<OcpApiResource, "apiVersion" | "name">) {
  return `${resource.apiVersion}/${resource.name}`;
}

function coverageScope(
  resource: Pick<OcpApiResource, "namespaced">,
  namespace?: string
): OcpResourceCoverageEntry["scope"] {
  if (!resource.namespaced) {
    return "cluster";
  }
  return namespace ? "namespace" : "all-namespaces";
}

type CoverageEntryDraft = Omit<OcpResourceCoverageEntry, "gap">;

function classifyCoverageError(error?: string): OcpCoverageGap {
  const message = error ?? "coverage probe failed for an unknown reason";
  const normalized = message.toLowerCase();

  if (normalized.includes("conversion webhook")) {
    return {
      type: "conversion-webhook-error",
      severity: "critical",
      retryable: false,
      message,
      evidence: [
        "Kubernetes API server returned an error from a conversion webhook",
        "resource discovery succeeded but object list/read failed"
      ]
    };
  }

  if (normalized.includes("timed out") || normalized.includes("timeout")) {
    return {
      type: "timeout",
      severity: "warning",
      retryable: true,
      message,
      evidence: [
        "read-only Kubernetes API request exceeded the configured timeout"
      ]
    };
  }

  if (
    normalized.includes(" returned 5") ||
    normalized.includes("internalerror") ||
    normalized.includes("service unavailable")
  ) {
    return {
      type: "cluster-api-error",
      severity: "critical",
      retryable: true,
      message,
      evidence: [
        "Kubernetes API server returned a 5xx or internal API error"
      ]
    };
  }

  return {
    type: "unknown-error",
    severity: "warning",
    retryable: true,
    message,
    evidence: ["read-only coverage probe returned an unclassified error"]
  };
}

function classifyCoverageGap(entry: CoverageEntryDraft): OcpCoverageGap {
  if (entry.list.status === "listed" && entry.detail.status === "read") {
    return {
      type: "none",
      severity: "info",
      retryable: false,
      message: "list and sample get probes succeeded",
      evidence: [
        "list probe returned at least one object",
        "sample detail probe succeeded"
      ]
    };
  }

  if (entry.list.status === "listed" && entry.detail.status !== "error") {
    return {
      type: "none",
      severity: "info",
      retryable: false,
      message: "list probe succeeded",
      evidence: ["list probe returned at least one object"]
    };
  }

  if (entry.list.status === "empty") {
    return {
      type: "empty",
      severity: "info",
      retryable: false,
      message: "resource is readable but no objects were returned in this scope",
      evidence: ["list probe succeeded with an empty item list"]
    };
  }

  if (entry.list.status === "denied") {
    return {
      type: "rbac-denied",
      severity: "warning",
      retryable: false,
      message: entry.list.error ?? "RBAC denied list access",
      evidence: [
        "SelfSubjectAccessReview denied the list verb",
        ...(entry.list.access?.evidence ?? [])
      ]
    };
  }

  if (entry.list.status === "blocked") {
    return {
      type: "policy-blocked",
      severity: "warning",
      retryable: false,
      message: entry.list.error ?? "read-safe policy blocked this resource",
      evidence: ["Kugnus read-safety policy blocked raw sensitive resource access"]
    };
  }

  if (entry.list.status === "unsupported") {
    return {
      type: "list-unsupported",
      severity: "info",
      retryable: false,
      message: entry.list.error ?? "resource does not expose the list verb",
      evidence: ["Kubernetes API discovery did not advertise the list verb"]
    };
  }

  if (entry.list.status === "skipped") {
    return {
      type: "not-probed",
      severity: "info",
      retryable: true,
      message: entry.list.error ?? "resource was not included in this bounded scan",
      evidence: ["coverage scan was bounded before this resource was probed"]
    };
  }

  if (entry.list.status === "error") {
    return classifyCoverageError(entry.list.error);
  }

  if (entry.detail.status === "error") {
    return classifyCoverageError(entry.detail.error);
  }

  return classifyCoverageError(entry.list.error);
}

function finalizeCoverageEntry(entry: CoverageEntryDraft): OcpResourceCoverageEntry {
  return {
    ...entry,
    gap: classifyCoverageGap(entry)
  };
}

function alternateListResources(
  discovery: OcpApiResourcesResponse,
  resource: OcpApiResource
) {
  return discovery.resources
    .filter(
      (candidate) =>
        candidate.name === resource.name &&
        candidate.kind === resource.kind &&
        candidate.group === resource.group &&
        candidate.apiVersion !== resource.apiVersion &&
        candidate.safeToList
    )
    .sort((a, b) => {
      if (a.preferred !== b.preferred) {
        return a.preferred ? -1 : 1;
      }
      return a.apiVersion.localeCompare(b.apiVersion);
    });
}

function staticCoverageEntry(
  resource: OcpApiResource,
  params: {
    status: OcpResourceCoverageEntry["list"]["status"];
    namespace?: string;
    error?: string;
  }
): OcpResourceCoverageEntry {
  return finalizeCoverageEntry({
    resource,
    scope: coverageScope(resource, params.namespace),
    namespace: resource.namespaced ? params.namespace : undefined,
    list: {
      status: params.status,
      sampleItemCount: 0,
      continuesAfterSample: false,
      error: params.error
    },
    detail: {
      status:
        params.status === "unsupported"
          ? "unsupported"
          : params.status === "denied"
            ? "denied"
            : "skipped",
      error: params.error
    },
    evidence: [
      `${ocpResourceKey(resource)} discovered from Kubernetes API discovery`,
      params.status === "blocked"
        ? "read-safe policy blocked this resource"
        : params.status === "unsupported"
          ? "resource does not expose the list verb"
          : params.status === "skipped"
            ? "resource was not probed in this bounded scan"
            : "coverage status derived without a mutating request"
    ]
  });
}

async function listResourceSample(
  config: OcpConfig,
  resource: OcpApiResource,
  namespace?: string
) {
  const searchParams = new URLSearchParams({
    limit: "1"
  });
  const path = ocpPathForResource(resource, resource.namespaced ? namespace : undefined);

  try {
    return await requestJson<KubeList>(config, path, {
      accept: partialObjectMetadataListAccept,
      searchParams,
      timeoutMs: Math.min(config.timeoutMs, 4000)
    });
  } catch (metadataError) {
    try {
      return await requestJson<KubeList>(config, path, {
        searchParams,
        timeoutMs: Math.min(config.timeoutMs, 4000)
      });
    } catch (jsonError) {
      throw new Error(
        `${compactError(metadataError)} | json fallback: ${compactError(jsonError)}`
      );
    }
  }
}

async function readCoverageDetail(
  config: OcpConfig,
  resource: OcpApiResource,
  item: Record<string, unknown>,
  namespace?: string
): Promise<OcpResourceCoverageEntry["detail"]> {
  if (!resource.verbs.includes("get")) {
    return {
      status: "unsupported",
      error: "resource does not expose the get verb"
    };
  }

  const summary = summarizeResource(item);
  const sampleName = summary.metadata.name;
  const sampleNamespace = resource.namespaced
    ? summary.metadata.namespace ?? namespace
    : undefined;

  if (!sampleName) {
    return {
      status: "skipped",
      error: "sample item did not include metadata.name"
    };
  }

  const access = await reviewResourceAccess(config, resource, {
    verb: "get",
    namespace: sampleNamespace,
    name: sampleName
  });
  if (accessDenied(access)) {
    return {
      status: "denied",
      access,
      sampleName,
      sampleNamespace,
      error: access.reason ?? "RBAC denied get"
    };
  }

  try {
    const raw = await requestJson<Record<string, unknown>>(
      config,
      ocpPathForResource(resource, sampleNamespace, sampleName),
      {
        accept: partialObjectMetadataAccept,
        timeoutMs: Math.min(config.timeoutMs, 4000)
      }
    );
    const sanitized = sanitizeResource(raw);
    return {
      status: "read",
      access,
      sampleName,
      sampleNamespace,
      redactionCount: sanitized.redactionCount
    };
  } catch (metadataError) {
    try {
      const raw = await requestJson<Record<string, unknown>>(
        config,
        ocpPathForResource(resource, sampleNamespace, sampleName),
        {
          timeoutMs: Math.min(config.timeoutMs, 4000)
        }
      );
      const sanitized = sanitizeResource(raw);
      return {
        status: "read",
        access,
        sampleName,
        sampleNamespace,
        redactionCount: sanitized.redactionCount
      };
    } catch (jsonError) {
      return {
        status: "error",
        access,
        sampleName,
        sampleNamespace,
        error: `${compactError(metadataError)} | json fallback: ${compactError(jsonError)}`
      };
    }
  }
}

async function probeCoverageResource(
  config: OcpConfig,
  resource: OcpApiResource,
  params: {
    namespace?: string;
    includeDetails: boolean;
  }
): Promise<OcpResourceCoverageEntry> {
  const namespace = resource.namespaced ? params.namespace : undefined;
  const evidence = [
    `${ocpResourceKey(resource)} discovered from Kubernetes API discovery`,
    "list probe uses SelfSubjectAccessReview",
    "list probe uses limit=1 and read-only GET"
  ];

  const access = await reviewResourceAccess(config, resource, {
    verb: "list",
    namespace
  });
  if (accessDenied(access)) {
    return finalizeCoverageEntry({
      resource,
      scope: coverageScope(resource, namespace),
      namespace,
      list: {
        status: "denied",
        access,
        sampleItemCount: 0,
        continuesAfterSample: false,
        error: access.reason ?? "RBAC denied list"
      },
      detail: {
        status: "denied",
        error: "detail probe skipped because list was denied"
      },
      evidence
    });
  }

  try {
    const list = await listResourceSample(config, resource, namespace);
    const sample = list.items?.[0];
    const listStatus = sample ? "listed" : "empty";
    const detail = sample
      ? params.includeDetails
        ? await readCoverageDetail(config, resource, sample, namespace)
        : {
            status: "skipped" as const,
            sampleName: summarizeResource(sample).metadata.name,
            sampleNamespace: summarizeResource(sample).metadata.namespace,
            error: "detail probe disabled for this scan"
          }
      : {
          status: "empty" as const,
          error: "no sample item returned by list probe"
        };

    return finalizeCoverageEntry({
      resource,
      scope: coverageScope(resource, namespace),
      namespace,
      list: {
        status: listStatus,
        access,
        sampleItemCount: list.items?.length ?? 0,
        continuesAfterSample: Boolean(list.metadata?.continue)
      },
      detail,
      evidence: [
        ...evidence,
        "list response summarized without returning raw sensitive payloads",
        params.includeDetails
          ? "sample detail probe uses read-only GET and redaction accounting"
          : "sample detail probe disabled"
      ]
    });
  } catch (error) {
    return finalizeCoverageEntry({
      resource,
      scope: coverageScope(resource, namespace),
      namespace,
      list: {
        status: "error",
        access,
        sampleItemCount: 0,
        continuesAfterSample: false,
        error: compactError(error)
      },
      detail: {
        status: "error",
        error: "detail probe skipped because list probe failed"
      },
      evidence
    });
  }
}

export async function getOcpCoverageMatrix(params: {
  namespace?: string;
  maxResources?: number;
  includeDetails?: boolean;
} = {}): Promise<OcpCoverageMatrixResponse> {
  const config = getOcpConfig();
  const discovery = await discoverOcpResources();
  if (!discovery.status.configured || !discovery.status.reachable) {
    throw new Error(discovery.status.error ?? "OCP API is not reachable");
  }

  const includeDetails = params.includeDetails !== false;
  const requestedMaxResources =
    typeof params.maxResources === "number" &&
    Number.isFinite(params.maxResources) &&
    params.maxResources > 0
      ? Math.floor(params.maxResources)
      : undefined;
  const safeResources = discovery.resources.filter((resource) => resource.safeToList);
  const probeTargets = requestedMaxResources
    ? safeResources.slice(0, requestedMaxResources)
    : safeResources;
  const targetKeys = new Set(probeTargets.map(ocpResourceKey));
  const probed = await mapWithConcurrency(
    probeTargets,
    6,
    async (resource) =>
      await probeCoverageResource(config, resource, {
        namespace: params.namespace,
        includeDetails
      })
  );
  const probedByKey = new Map(
    probed.map((entry) => [ocpResourceKey(entry.resource), entry])
  );

  const resources = discovery.resources.map((resource) => {
    const probedEntry = probedByKey.get(ocpResourceKey(resource));
    if (probedEntry) {
      return probedEntry;
    }
    if (targetKeys.has(ocpResourceKey(resource))) {
      return staticCoverageEntry(resource, {
        status: "error",
        namespace: params.namespace,
        error: "coverage probe did not produce a result"
      });
    }
    if (isSecretResource(resource) && !config.allowSecretFetch) {
      return staticCoverageEntry(resource, {
        status: "blocked",
        namespace: params.namespace,
        error: "Secret read is blocked unless OCP_ALLOW_SECRET_FETCH=true"
      });
    }
    if (!resource.verbs.includes("list")) {
      return staticCoverageEntry(resource, {
        status: "unsupported",
        namespace: params.namespace,
        error: "resource does not expose the list verb"
      });
    }
    return staticCoverageEntry(resource, {
      status: "skipped",
      namespace: params.namespace,
      error: requestedMaxResources
        ? `bounded scan probed ${requestedMaxResources} safe resources`
        : "resource was not marked safe to list"
    });
  });

  const countListStatus = (status: OcpResourceCoverageEntry["list"]["status"]) =>
    resources.filter((entry) => entry.list.status === status).length;
  const gapTypes: Record<OcpCoverageGapType, number> = {
    none: 0,
    "not-probed": 0,
    "policy-blocked": 0,
    "list-unsupported": 0,
    "rbac-denied": 0,
    empty: 0,
    "cluster-api-error": 0,
    "conversion-webhook-error": 0,
    timeout: 0,
    "unknown-error": 0
  };
  for (const entry of resources) {
    gapTypes[entry.gap.type] += 1;
  }

  return {
    status: discovery.status,
    generatedAt: new Date().toISOString(),
    probe: {
      requestedMaxResources,
      includeDetails,
      namespace: params.namespace
    },
    totals: {
      discovered: discovery.resources.length,
      safeToList: safeResources.length,
      probed: probeTargets.length,
      listed: countListStatus("listed"),
      empty: countListStatus("empty"),
      denied: countListStatus("denied"),
      blocked: countListStatus("blocked"),
      unsupported: countListStatus("unsupported"),
      skipped: countListStatus("skipped"),
      error: countListStatus("error"),
      detailRead: resources.filter((entry) => entry.detail.status === "read").length,
      gapTypes
    },
    resources,
    evidence: [
      "coverage matrix is generated from Kubernetes API discovery",
      "safe resources are probed with SelfSubjectAccessReview and read-only GET list limit=1",
      "sample detail probes use read-only GET and redaction accounting",
      "Secrets remain blocked by default",
      requestedMaxResources
        ? `bounded scan requested maxResources=${requestedMaxResources}`
        : "unbounded scan requested all safeToList resources"
    ]
  };
}

function conditionData(value: unknown): OcpConditionSummary[] {
  return conditionsFrom(value).filter((condition) => condition.type);
}

function finding(
  id: string,
  label: string,
  status: OcpDiagnosticFinding["status"],
  message: string,
  evidence: string[],
  data?: unknown
): OcpDiagnosticFinding {
  return {
    id,
    label,
    status,
    message,
    evidence,
    data
  };
}

async function tryReadJsonFinding<T>(
  config: OcpConfig,
  path: string,
  params: {
    id: string;
    label: string;
    notFoundMessage: string;
    errorEvidence: string;
  }
): Promise<
  | { ok: true; value: T }
  | { ok: false; finding: OcpDiagnosticFinding }
> {
  try {
    return {
      ok: true,
      value: await requestJson<T>(config, path, {
        timeoutMs: Math.min(config.timeoutMs, 4000)
      })
    };
  } catch (error) {
    const message = compactError(error);
    const status = message.includes(" returned 404:") ? "missing" : "error";
    return {
      ok: false,
      finding: finding(
        params.id,
        params.label,
        status,
        status === "missing" ? params.notFoundMessage : message,
        [params.errorEvidence]
      )
    };
  }
}

function crdNameForResource(resource: OcpApiResource) {
  return resource.group ? `${resource.name}.${resource.group}` : undefined;
}

function apiServiceNameForResource(resource: OcpApiResource) {
  return resource.group ? `${resource.version}.${resource.group}` : undefined;
}

function serviceReferenceFromCrd(crd: Record<string, unknown>) {
  const spec = crd.spec as
    | {
        conversion?: {
          strategy?: string;
          webhook?: {
            clientConfig?: {
              service?: {
                namespace?: string;
                name?: string;
                path?: string;
                port?: number;
              };
              url?: string;
              caBundle?: string;
            };
            conversionReviewVersions?: string[];
          };
        };
        versions?: Array<{
          name?: string;
          served?: boolean;
          storage?: boolean;
        }>;
      }
    | undefined;
  const service = spec?.conversion?.webhook?.clientConfig?.service;

  return {
    strategy: spec?.conversion?.strategy,
    service:
      service?.namespace && service.name
        ? {
            namespace: service.namespace,
            name: service.name,
            path: service.path,
            port: service.port
          }
        : undefined,
    url: spec?.conversion?.webhook?.clientConfig?.url,
    caBundlePresent: Boolean(spec?.conversion?.webhook?.clientConfig?.caBundle),
    conversionReviewVersions:
      spec?.conversion?.webhook?.conversionReviewVersions ?? [],
    versions: spec?.versions ?? []
  };
}

async function diagnoseCrd(
  config: OcpConfig,
  resource: OcpApiResource,
  findings: OcpDiagnosticFinding[]
) {
  const crdName = crdNameForResource(resource);
  if (!crdName) {
    findings.push(
      finding(
        "crd",
        "CustomResourceDefinition",
        "skipped",
        "core API resources do not have a CRD object",
        [`${resource.apiVersion}/${resource.name} is a core API resource`]
      )
    );
    return undefined;
  }

  const access = await reviewResourceAccess(
    config,
    {
      group: "apiextensions.k8s.io",
      version: "v1",
      apiVersion: "apiextensions.k8s.io/v1",
      name: "customresourcedefinitions",
      namespaced: false
    },
    {
      verb: "get",
      name: crdName
    }
  );
  if (accessDenied(access)) {
    findings.push(
      finding(
        "crd",
        "CustomResourceDefinition",
        "warning",
        access.reason ?? "RBAC denied CRD get access",
        access.evidence
      )
    );
    return undefined;
  }

  const result = await tryReadJsonFinding<Record<string, unknown>>(
    config,
    `/apis/apiextensions.k8s.io/v1/customresourcedefinitions/${encodeURIComponent(crdName)}`,
    {
      id: "crd",
      label: "CustomResourceDefinition",
      notFoundMessage: `CRD ${crdName} was not found`,
      errorEvidence: "read-only GET customresourcedefinitions"
    }
  );
  if (!result.ok) {
    findings.push(result.finding);
    return undefined;
  }

  const conversion = serviceReferenceFromCrd(result.value);
  findings.push(
    finding(
      "crd",
      "CustomResourceDefinition",
      conversion.strategy === "Webhook" ? "warning" : "ok",
      conversion.strategy === "Webhook"
        ? `CRD ${crdName} uses Webhook conversion`
        : `CRD ${crdName} conversion strategy is ${conversion.strategy ?? "None"}`,
      [
        access.evidence.join(" | "),
        `metadata.name=${crdName}`,
        `conversion.strategy=${conversion.strategy ?? "None"}`
      ],
      {
        name: crdName,
        conversion,
        conditions: conditionData((result.value.status as Record<string, unknown> | undefined)?.conditions)
      }
    )
  );

  return conversion;
}

async function diagnoseApiService(
  config: OcpConfig,
  resource: OcpApiResource,
  findings: OcpDiagnosticFinding[]
) {
  const apiServiceName = apiServiceNameForResource(resource);
  if (!apiServiceName) {
    findings.push(
      finding(
        "api-service",
        "APIService",
        "skipped",
        "core API resources do not have an APIService object",
        [`${resource.apiVersion}/${resource.name} is a core API resource`]
      )
    );
    return;
  }

  const result = await tryReadJsonFinding<Record<string, unknown>>(
    config,
    `/apis/apiregistration.k8s.io/v1/apiservices/${encodeURIComponent(apiServiceName)}`,
    {
      id: "api-service",
      label: "APIService",
      notFoundMessage: `APIService ${apiServiceName} was not found; this is expected for CRD-backed APIs`,
      errorEvidence: "read-only GET apiservices"
    }
  );
  if (!result.ok) {
    findings.push(result.finding);
    return;
  }

  const conditions = conditionData(
    (result.value.status as Record<string, unknown> | undefined)?.conditions
  );
  const unavailable = conditions.find(
    (condition) => condition.type === "Available" && condition.status !== "True"
  );
  findings.push(
    finding(
      "api-service",
      "APIService",
      unavailable ? "critical" : "ok",
      unavailable
        ? `APIService ${apiServiceName} is not Available`
        : `APIService ${apiServiceName} is Available`,
      ["read-only GET apiregistration.k8s.io/v1 APIService"],
      {
        name: apiServiceName,
        conditions
      }
    )
  );
}

async function diagnoseWebhookService(
  config: OcpConfig,
  service: NonNullable<ReturnType<typeof serviceReferenceFromCrd>["service"]>,
  findings: OcpDiagnosticFinding[]
) {
  const servicePath = `/api/v1/namespaces/${encodeURIComponent(service.namespace)}/services/${encodeURIComponent(service.name)}`;
  const serviceResult = await tryReadJsonFinding<Record<string, unknown>>(
    config,
    servicePath,
    {
      id: "webhook-service",
      label: "Conversion Webhook Service",
      notFoundMessage: `Service ${service.namespace}/${service.name} was not found`,
      errorEvidence: "read-only GET conversion webhook Service"
    }
  );
  if (!serviceResult.ok) {
    findings.push(serviceResult.finding);
  } else {
    const spec = serviceResult.value.spec as
      | {
          type?: string;
          ports?: Array<{ name?: string; port?: number; targetPort?: string | number }>;
          selector?: Record<string, string>;
        }
      | undefined;
    findings.push(
      finding(
        "webhook-service",
        "Conversion Webhook Service",
        "ok",
        `Service ${service.namespace}/${service.name} exists`,
        ["read-only GET v1 Service"],
        {
          namespace: service.namespace,
          name: service.name,
          type: spec?.type,
          ports: spec?.ports ?? [],
          selector: spec?.selector ?? {}
        }
      )
    );
  }

  const endpointsResult = await tryReadJsonFinding<Record<string, unknown>>(
    config,
    `/api/v1/namespaces/${encodeURIComponent(service.namespace)}/endpoints/${encodeURIComponent(service.name)}`,
    {
      id: "webhook-endpoints",
      label: "Conversion Webhook Endpoints",
      notFoundMessage: `Endpoints ${service.namespace}/${service.name} were not found`,
      errorEvidence: "read-only GET conversion webhook Endpoints"
    }
  );
  if (!endpointsResult.ok) {
    findings.push(endpointsResult.finding);
  } else {
    const subsets =
      ((endpointsResult.value.subsets as Array<Record<string, unknown>> | undefined) ??
        []);
    const readyAddresses = subsets.reduce(
      (count, subset) =>
        count +
        (((subset.addresses as unknown[] | undefined) ?? []).length),
      0
    );
    const notReadyAddresses = subsets.reduce(
      (count, subset) =>
        count +
        (((subset.notReadyAddresses as unknown[] | undefined) ?? []).length),
      0
    );
    findings.push(
      finding(
        "webhook-endpoints",
        "Conversion Webhook Endpoints",
        readyAddresses > 0 ? "ok" : "critical",
        readyAddresses > 0
          ? `Endpoints expose ${readyAddresses} ready address(es)`
          : "Endpoints exist but have no ready addresses",
        ["read-only GET v1 Endpoints"],
        {
          namespace: service.namespace,
          name: service.name,
          readyAddresses,
          notReadyAddresses,
          subsetCount: subsets.length
        }
      )
    );
  }

  const sliceSearch = new URLSearchParams({
    labelSelector: `kubernetes.io/service-name=${service.name}`,
    limit: "100"
  });
  try {
    const slices = await requestJson<{
      items?: Array<{
        endpoints?: Array<{ conditions?: { ready?: boolean } }>;
      }>;
    }>(
      config,
      `/apis/discovery.k8s.io/v1/namespaces/${encodeURIComponent(service.namespace)}/endpointslices`,
      {
        searchParams: sliceSearch,
        timeoutMs: Math.min(config.timeoutMs, 4000)
      }
    );
    const endpoints = (slices.items ?? []).flatMap((slice) => slice.endpoints ?? []);
    const readyEndpoints = endpoints.filter(
      (endpoint) => endpoint.conditions?.ready !== false
    ).length;
    findings.push(
      finding(
        "webhook-endpoint-slices",
        "Conversion Webhook EndpointSlices",
        readyEndpoints > 0 ? "ok" : "warning",
        `${slices.items?.length ?? 0} EndpointSlice(s), ${readyEndpoints} ready endpoint(s)`,
        ["read-only LIST discovery.k8s.io/v1 EndpointSlice with service-name label selector"],
        {
          namespace: service.namespace,
          service: service.name,
          slices: slices.items?.length ?? 0,
          endpoints: endpoints.length,
          readyEndpoints
        }
      )
    );
  } catch (error) {
    findings.push(
      finding(
        "webhook-endpoint-slices",
        "Conversion Webhook EndpointSlices",
        "error",
        compactError(error),
        ["read-only LIST discovery.k8s.io/v1 EndpointSlice with service-name label selector"]
      )
    );
  }
}

async function diagnoseAlternateVersions(
  config: OcpConfig,
  discovery: OcpApiResourcesResponse,
  resource: OcpApiResource,
  namespace: string | undefined,
  findings: OcpDiagnosticFinding[]
) {
  const alternates = alternateListResources(discovery, resource);
  if (alternates.length === 0) {
    findings.push(
      finding(
        "alternate-versions",
        "Alternate API Versions",
        "missing",
        "No alternate served API version was discovered for this resource",
        [`${ocpResourceKey(resource)} has no discovered safe alternate version`]
      )
    );
    return;
  }

  const results = await Promise.all(
    alternates.map(async (alternate) => {
      try {
        const access = await reviewResourceAccess(config, alternate, {
          verb: "list",
          namespace: alternate.namespaced ? namespace : undefined
        });
        if (accessDenied(access)) {
          return {
            apiVersion: alternate.apiVersion,
            preferred: alternate.preferred,
            status: "denied",
            allowed: false,
            message: access.reason ?? "RBAC denied list"
          };
        }
        const list = await listResourceSample(
          config,
          alternate,
          alternate.namespaced ? namespace : undefined
        );
        return {
          apiVersion: alternate.apiVersion,
          preferred: alternate.preferred,
          status: list.items?.[0] ? "listed" : "empty",
          allowed: true,
          sampleItemCount: list.items?.length ?? 0,
          continuesAfterSample: Boolean(list.metadata?.continue)
        };
      } catch (error) {
        return {
          apiVersion: alternate.apiVersion,
          preferred: alternate.preferred,
          status: "error",
          allowed: false,
          message: compactError(error)
        };
      }
    })
  );

  const working = results.find(
    (result) => result.status === "listed" || result.status === "empty"
  );
  findings.push(
    finding(
      "alternate-versions",
      "Alternate API Versions",
      working ? "ok" : "critical",
      working
        ? `Alternate ${working.apiVersion} is readable`
        : "No alternate API version could be listed",
      [
        "same group/resource/kind alternate versions discovered from Kubernetes API discovery",
        "alternate probes use SelfSubjectAccessReview and read-only list limit=1"
      ],
      {
        requestedApiVersion: resource.apiVersion,
        alternates: results
      }
    )
  );
}

async function runDiagnosticStep(
  findings: OcpDiagnosticFinding[],
  params: {
    id: string;
    label: string;
    timeoutMs: number;
    evidence: string[];
  },
  step: () => Promise<void>
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      step(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            new Error(
              `${params.label} diagnostic step timed out after ${params.timeoutMs}ms`
            )
          );
        }, params.timeoutMs);
      })
    ]);
  } catch (error) {
    findings.push(
      finding(
        params.id,
        params.label,
        "error",
        compactError(error),
        params.evidence
      )
    );
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export async function getOcpCoverageDiagnostic(params: {
  apiVersion?: string;
  resource?: string;
  kind?: string;
  namespace?: string;
}): Promise<OcpCoverageDiagnosticResponse> {
  const config = getOcpConfig();
  const discovery = await discoverOcpResources();
  if (!discovery.status.configured || !discovery.status.reachable) {
    throw new Error(discovery.status.error ?? "OCP API is not reachable");
  }

  const match = findDiscoveredResource(discovery, params);
  if (!match) {
    throw new Error("requested OCP resource was not discovered");
  }

  const coverage = match.safeToList
    ? await probeCoverageResource(config, match, {
        namespace: params.namespace,
        includeDetails: false
      })
    : staticCoverageEntry(match, {
        status: isSecretResource(match)
          ? "blocked"
          : match.verbs.includes("list")
            ? "skipped"
            : "unsupported",
        namespace: params.namespace,
        error: isSecretResource(match)
          ? "Secret read is blocked unless OCP_ALLOW_SECRET_FETCH=true"
          : match.verbs.includes("list")
            ? "resource is not marked safe to list"
            : "resource does not expose the list verb"
      });

  const findings: OcpDiagnosticFinding[] = [
    finding(
      "coverage-gap",
      "Coverage Gap",
      coverage.gap.severity === "critical"
        ? "critical"
        : coverage.gap.severity === "warning"
          ? "warning"
          : "ok",
      coverage.gap.message,
      coverage.gap.evidence,
      {
        listStatus: coverage.list.status,
        detailStatus: coverage.detail.status,
        gapType: coverage.gap.type,
        retryable: coverage.gap.retryable
      }
    )
  ];

  let conversion: Awaited<ReturnType<typeof diagnoseCrd>> | undefined;
  await runDiagnosticStep(
    findings,
    {
      id: "crd-diagnostic-timeout",
      label: "CustomResourceDefinition",
      timeoutMs: 10_000,
      evidence: ["bounded read-only CRD diagnostic"]
    },
    async () => {
      conversion = await diagnoseCrd(config, match, findings);
    }
  );
  await runDiagnosticStep(
    findings,
    {
      id: "apiservice-diagnostic-timeout",
      label: "APIService",
      timeoutMs: 8_000,
      evidence: ["bounded read-only APIService diagnostic"]
    },
    async () => {
      await diagnoseApiService(config, match, findings);
    }
  );
  await runDiagnosticStep(
    findings,
    {
      id: "alternate-versions-diagnostic-timeout",
      label: "Alternate API Versions",
      timeoutMs: 10_000,
      evidence: ["bounded read-only alternate API version diagnostic"]
    },
    async () => {
      await diagnoseAlternateVersions(
        config,
        discovery,
        match,
        params.namespace,
        findings
      );
    }
  );
  if (conversion?.service) {
    const conversionService = conversion.service;
    await runDiagnosticStep(
      findings,
      {
        id: "webhook-service-diagnostic-timeout",
        label: "Conversion Webhook Service",
        timeoutMs: 8_000,
        evidence: ["bounded read-only conversion webhook service diagnostic"]
      },
      async () => {
        await diagnoseWebhookService(config, conversionService, findings);
      }
    );
  } else if (conversion?.strategy === "Webhook") {
    findings.push(
      finding(
        "webhook-service",
        "Conversion Webhook Service",
        "critical",
        "CRD uses webhook conversion but does not reference a cluster Service",
        ["CRD spec.conversion.webhook.clientConfig.service missing"]
      )
    );
  }

  return {
    status: discovery.status,
    generatedAt: new Date().toISOString(),
    resource: match,
    namespace: match.namespaced ? params.namespace : undefined,
    coverage,
    findings,
    nextChecks: [
      `Inspect ${ocpResourceKey(match)} coverage finding and RBAC evidence`,
      "Inspect CRD conversion strategy, served/storage versions, and webhook client config",
      "Inspect Alternate API Versions finding before deciding whether the user can read the resource through another served version",
      "Inspect conversion webhook Service and endpoint readiness when a webhook is configured",
      "If the API server reports conversion webhook failures, repair the owning Operator or webhook backend before retrying list/get"
    ],
    risks: [
      "A conversion webhook failure can make list/get fail even when discovery and RBAC are healthy.",
      "Objects stored in a different served version may be unreadable until conversion succeeds.",
      "Kugnus keeps the failure visible as evidence instead of hiding or mutating cluster state."
    ],
    rollbackPath: [
      "No automatic rollback or mutation is performed by Kugnus.",
      "Use the owning Operator or approved OpenShift runbook to restore webhook service health.",
      "After the webhook is healthy, rerun the coverage full scan to verify the gap is closed."
    ],
    evidence: [
      "diagnostic uses read-only Kubernetes API GET/LIST requests",
      "coverage probe is guarded by SelfSubjectAccessReview",
      "CRD/APIService/Service/Endpoints/EndpointSlice checks do not mutate cluster state"
    ]
  };
}

export async function listOcpResource(params: {
  apiVersion?: string;
  kind?: string;
  resource?: string;
  namespace?: string;
  labelSelector?: string;
  fieldSelector?: string;
  limit?: number;
  continueToken?: string;
  full?: boolean;
}): Promise<OcpResourceListResponse> {
  const config = getOcpConfig();
  const discovery = await discoverOcpResources();
  if (!discovery.status.configured || !discovery.status.reachable) {
    const message = discovery.status.error ?? "OCP API is not reachable";
    return failedListResponse({
      status: discovery.status,
      requested: params,
      message,
      evidence: [
        message,
        "resource list returned a named failure instead of an unexplained HTTP 400",
        "no cluster mutation was attempted"
      ]
    });
  }

  const match = findDiscoveredResource(discovery, params, "list");

  if (!match) {
    const requested = `${params.apiVersion ?? "unknown"}/${params.resource ?? params.kind ?? "unknown"}`;
    return failedListResponse({
      status: discovery.status,
      requested: params,
      message: "requested OCP resource was not discovered or is not listable",
      evidence: [
        `${requested} was not found in the discovered listable API resources`,
        "the UI can continue with an empty named-failure state",
        "no cluster mutation was attempted"
      ]
    });
  }

  if (isSecretResource(match) && !config.allowSecretFetch) {
    const message =
      "Secret raw fetch is blocked. Set OCP_ALLOW_SECRET_FETCH=true only after a security review.";
    return failedListResponse({
      status: discovery.status,
      requested: params,
      resource: match,
      message,
      evidence: [
        message,
        `${match.apiVersion}/${match.name} remains blocked by the read-only secret boundary`,
        "no cluster mutation was attempted"
      ]
    });
  }

  const access = await reviewResourceAccess(config, match, {
    verb: "list",
    namespace: params.namespace
  });
  if (accessDenied(access)) {
    const message = `RBAC denied list for ${match.apiVersion}/${match.name}: ${access.reason ?? "not allowed"}`;
    return failedListResponse({
      status: discovery.status,
      requested: params,
      resource: match,
      access,
      message,
      evidence: [
        message,
        "SelfSubjectAccessReview did not allow this read path",
        "no cluster mutation was attempted"
      ]
    });
  }

  const searchParams = new URLSearchParams();
  searchParams.set("limit", String(params.limit ?? 50));
  if (params.continueToken) {
    searchParams.set("continue", params.continueToken);
  }
  if (params.labelSelector?.trim()) {
    searchParams.set("labelSelector", params.labelSelector.trim());
  }
  if (params.fieldSelector?.trim()) {
    searchParams.set("fieldSelector", params.fieldSelector.trim());
  }

  const path = ocpPathForResource(
    match,
    match.namespaced ? params.namespace : undefined
  );

  const accept = params.full
    ? "application/json"
    : "application/json;as=PartialObjectMetadataList;g=meta.k8s.io;v=v1, application/json";

  let servedResource = match;
  let servedAccess = access;
  let fallback: OcpResourceListResponse["fallback"] | undefined;
  let list:
    | {
        metadata?: { continue?: string };
        items?: Array<Record<string, unknown>>;
      }
    | undefined;

  try {
    list = await requestJson<{
      metadata?: { continue?: string };
      items?: Array<Record<string, unknown>>;
    }>(config, path, {
      accept,
      searchParams
    });
  } catch (error) {
    if (params.continueToken) {
      throw error;
    }

    const originalError = compactError(error);
    if (!params.full) {
      try {
        list = await requestJson<{
          metadata?: { continue?: string };
          items?: Array<Record<string, unknown>>;
        }>(config, path, {
          accept: "application/json",
          searchParams
        });
        fallback = {
          requestedApiVersion: match.apiVersion,
          servedApiVersion: match.apiVersion,
          reason: originalError,
          evidence: [
            `${match.apiVersion}/${match.name} PartialObjectMetadata list failed`,
            `${match.apiVersion}/${match.name} JSON list fallback succeeded`,
            "fallback used the same read-only GET list after SelfSubjectAccessReview"
          ]
        };
      } catch {
        // Continue to served API-version alternates before surfacing the original error.
      }
    }

    if (!list) {
      const alternates = alternateListResources(discovery, match);

      for (const alternate of alternates) {
        const alternateAccess = await reviewResourceAccess(config, alternate, {
          verb: "list",
          namespace: alternate.namespaced ? params.namespace : undefined
        });
        if (accessDenied(alternateAccess)) {
          continue;
        }

        try {
          const alternatePath = ocpPathForResource(
            alternate,
            alternate.namespaced ? params.namespace : undefined
          );
          list = await requestJson<{
            metadata?: { continue?: string };
            items?: Array<Record<string, unknown>>;
          }>(config, alternatePath, {
            accept,
            searchParams
          });
          servedResource = alternate;
          servedAccess = alternateAccess;
          fallback = {
            requestedApiVersion: match.apiVersion,
            servedApiVersion: alternate.apiVersion,
            reason: originalError,
            evidence: [
              `${match.apiVersion}/${match.name} list failed`,
              `${alternate.apiVersion}/${alternate.name} alternate version list succeeded`,
              "fallback used read-only GET list and SelfSubjectAccessReview"
            ]
          };
          break;
        } catch {
          // Try the next served API version before surfacing the original failure.
        }
      }
    }

    if (!list) {
      const message = compactError(error);
      return failedListResponse({
        status: discovery.status,
        requested: params,
        resource: match,
        access,
        message,
        evidence: [
          `${match.apiVersion}/${match.name} list failed`,
          message,
          "metadata fallback and served-version alternates did not produce a readable list",
          "no cluster mutation was attempted"
        ]
      });
    }
  }

  return {
    status: discovery.status,
    resource: servedResource,
    namespace: servedResource.namespaced ? params.namespace : undefined,
    fallback,
    selectors: {
      labelSelector: params.labelSelector?.trim() || undefined,
      fieldSelector: params.fieldSelector?.trim() || undefined
    },
    items: (list.items ?? []).map(summarizeResource),
    continueToken: list.metadata?.continue,
    access: {
      list: servedAccess
    },
    redaction: {
      secretDataRedacted: true,
      fullSecretFetchBlocked: !config.allowSecretFetch
    }
  };
}

export async function getOcpResource(params: {
  apiVersion?: string;
  kind?: string;
  resource?: string;
  namespace?: string;
  name: string;
  full?: boolean;
}): Promise<OcpResourceDetailResponse> {
  const config = getOcpConfig();
  const discovery = await discoverOcpResources();
  if (!discovery.status.configured || !discovery.status.reachable) {
    throw new Error(discovery.status.error ?? "OCP API is not reachable");
  }

  const match = findDiscoveredResource(discovery, params, "get");

  if (!match) {
    throw new Error("requested OCP resource was not discovered or is not gettable");
  }

  if (isSecretResource(match) && !config.allowSecretFetch) {
    throw new Error(
      "Secret raw fetch is blocked. Set OCP_ALLOW_SECRET_FETCH=true only after a security review."
    );
  }

  const access = await reviewResourceAccess(config, match, {
    verb: "get",
    namespace: params.namespace,
    name: params.name
  });
  if (accessDenied(access)) {
    throw new Error(
      `RBAC denied get for ${match.apiVersion}/${match.name}: ${access.reason ?? "not allowed"}`
    );
  }

  const path = ocpPathForResource(
    match,
    match.namespaced ? params.namespace : undefined,
    params.name
  );
  const accept = params.full
    ? "application/json"
    : "application/json;as=PartialObjectMetadata;g=meta.k8s.io;v=v1, application/json";
  let servedResource = match;
  let servedAccess = access;
  let fallback: OcpResourceDetailResponse["fallback"] | undefined;
  let item: Record<string, unknown> | undefined;

  try {
    item = await requestJson<Record<string, unknown>>(config, path, {
      accept
    });
  } catch (error) {
    const originalError = compactError(error);
    const alternates = alternateListResources(discovery, match).filter(
      (alternate) => alternate.verbs.includes("get")
    );

    for (const alternate of alternates) {
      const alternateAccess = await reviewResourceAccess(config, alternate, {
        verb: "get",
        namespace: alternate.namespaced ? params.namespace : undefined,
        name: params.name
      });
      if (accessDenied(alternateAccess)) {
        continue;
      }

      try {
        const alternatePath = ocpPathForResource(
          alternate,
          alternate.namespaced ? params.namespace : undefined,
          params.name
        );
        item = await requestJson<Record<string, unknown>>(config, alternatePath, {
          accept
        });
        servedResource = alternate;
        servedAccess = alternateAccess;
        fallback = {
          requestedApiVersion: match.apiVersion,
          servedApiVersion: alternate.apiVersion,
          reason: originalError,
          evidence: [
            `${match.apiVersion}/${match.name} get failed`,
            `${alternate.apiVersion}/${alternate.name} alternate version get succeeded`,
            "fallback used read-only GET detail and SelfSubjectAccessReview"
          ]
        };
        break;
      } catch {
        // Try the next served API version before surfacing the original failure.
      }
    }

    if (!item) {
      throw error;
    }
  }
  const raw = sanitizeResource(item);

  return {
    status: discovery.status,
    resource: servedResource,
    namespace: servedResource.namespaced ? params.namespace : undefined,
    name: params.name,
    fallback,
    item: summarizeResource(item),
    raw: raw.value,
    access: {
      get: servedAccess
    },
    redaction: {
      secretDataRedacted: true,
      fullSecretFetchBlocked: !config.allowSecretFetch,
      sensitiveFieldRedactionCount: raw.redactionCount
    }
  };
}

export async function getOcpRelatedResources(params: {
  apiVersion?: string;
  kind?: string;
  resource?: string;
  namespace?: string;
  name: string;
}): Promise<OcpRelatedResourcesResponse> {
  const config = getOcpConfig();
  const discovery = await discoverOcpResources();
  if (!discovery.status.configured || !discovery.status.reachable) {
    throw new Error(discovery.status.error ?? "OCP API is not reachable");
  }

  const detail = await getOcpResource({
    ...params,
    full: false
  });
  const targetUid = detail.item.metadata.uid;
  const owners = detail.item.metadata.ownerReferences ?? [];
  const children: OcpRelatedResourcesResponse["children"] = [];
  const errors: OcpRelatedResourcesResponse["errors"] = [];

  if (targetUid) {
    const candidates = relatedChildResourceCandidates
      .map((candidate) =>
        discovery.resources.find(
          (resource) =>
            resource.apiVersion === candidate.apiVersion &&
            resource.name === candidate.name &&
            resource.verbs.includes("list") &&
            !isSecretResource(resource)
        )
      )
      .filter((resource): resource is OcpApiResource => Boolean(resource));

    await Promise.all(
      candidates.map(async (resource) => {
        const namespace = resource.namespaced ? params.namespace : undefined;
        try {
          const access = await reviewResourceAccess(config, resource, {
            verb: "list",
            namespace
          });
          if (accessDenied(access)) {
            errors.push({
              resource: `${resource.apiVersion}/${resource.name}`,
              message: access.reason ?? "RBAC denied list"
            });
            return;
          }

          const path = ocpPathForResource(resource, namespace);
          const items = await listAllItems(
            config,
            path,
            500,
            "application/json;as=PartialObjectMetadataList;g=meta.k8s.io;v=v1, application/json"
          );
          children.push(
            ...items
              .filter((item) => itemHasOwnerUid(item, targetUid))
              .map((item) => ({
                resource,
                item: summarizeResource(item)
              }))
          );
        } catch (error) {
          errors.push({
            resource: `${resource.apiVersion}/${resource.name}`,
            message:
              error instanceof Error ? error.message : "related list failed"
          });
        }
      })
    );
  }

  children.sort((a, b) =>
    `${a.item.kind}/${a.item.metadata.namespace ?? ""}/${a.item.metadata.name}`.localeCompare(
      `${b.item.kind}/${b.item.metadata.namespace ?? ""}/${b.item.metadata.name}`
    )
  );

  return {
    status: discovery.status,
    target: {
      apiVersion: params.apiVersion,
      kind: params.kind ?? detail.resource.kind,
      resource: params.resource ?? detail.resource.name,
      namespace: detail.namespace,
      name: params.name,
      uid: targetUid
    },
    owners,
    children,
    evidence: [
      "metadata.ownerReferences from sanitized object detail",
      "child resources filtered by ownerReferences.uid",
      "child scans use PartialObjectMetadataList",
      "child scans are guarded by SelfSubjectAccessReview list checks"
    ],
    errors
  };
}

function topologyId(type: OcpTopologyNode["type"], item: OcpResourceSummary) {
  return `${type}:${item.metadata.namespace ?? "_cluster"}:${item.metadata.name}`;
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function readRecordPath(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function labelsMatch(
  labels: Record<string, string> | undefined,
  selector: Record<string, string>
) {
  const entries = Object.entries(selector);
  if (entries.length === 0) {
    return false;
  }
  return entries.every(([key, value]) => labels?.[key] === value);
}

function workloadSelector(item: OcpResourceSummary) {
  const matchLabels = stringRecord(readRecordPath(item.spec, ["selector", "matchLabels"]));
  if (Object.keys(matchLabels).length > 0) {
    return matchLabels;
  }
  return stringRecord(readRecordPath(item.spec, ["selector"]));
}

function serviceSelector(item: OcpResourceSummary) {
  return stringRecord(readRecordPath(item.spec, ["selector"]));
}

function routeTargetService(item: OcpResourceSummary) {
  const target = readRecordPath(item.spec, ["to"]);
  if (!target || typeof target !== "object") {
    return undefined;
  }
  const record = target as Record<string, unknown>;
  const kind = typeof record.kind === "string" ? record.kind : "Service";
  const name = typeof record.name === "string" ? record.name : undefined;
  return kind === "Service" ? name : undefined;
}

function workloadHealth(item: OcpResourceSummary): OcpTopologyNode["health"] {
  const status = item.status as Record<string, unknown> | undefined;
  if (!status || typeof status !== "object") {
    return "unknown";
  }

  if (item.kind === "Pod") {
    const phase = String(status.phase ?? "");
    if (phase === "Running" || phase === "Succeeded") {
      return "ready";
    }
    if (phase === "Pending" || phase === "Unknown") {
      return "warning";
    }
    return "danger";
  }

  if (item.kind === "Deployment") {
    const replicas = Number(status.replicas ?? 0);
    const available = Number(status.availableReplicas ?? 0);
    const unavailable = Number(status.unavailableReplicas ?? 0);
    if (replicas === 0) {
      return "unknown";
    }
    if (available >= replicas && unavailable === 0) {
      return "ready";
    }
    return available > 0 ? "warning" : "danger";
  }

  if (
    item.kind === "DeploymentConfig" ||
    item.kind === "StatefulSet" ||
    item.kind === "DaemonSet" ||
    item.kind === "ReplicaSet" ||
    item.kind === "ReplicationController"
  ) {
    const desired =
      Number(status.replicas ?? status.desiredNumberScheduled ?? status.desiredReplicas ?? 0);
    const ready =
      Number(status.readyReplicas ?? status.availableReplicas ?? status.numberReady ?? 0);
    const unavailable = Number(status.unavailableReplicas ?? status.numberUnavailable ?? 0);
    if (desired === 0) {
      return "unknown";
    }
    if (ready >= desired && unavailable === 0) {
      return "ready";
    }
    return ready > 0 ? "warning" : "danger";
  }

  if (item.kind === "Job") {
    if (Number(status.succeeded ?? 0) > 0) {
      return "ready";
    }
    if (Number(status.failed ?? 0) > 0) {
      return "danger";
    }
    return "warning";
  }

  if (item.kind === "CronJob") {
    return status.lastScheduleTime ? "ready" : "unknown";
  }

  if (item.kind === "HorizontalPodAutoscaler") {
    const current = Number(status.currentReplicas ?? 0);
    const desired = Number(status.desiredReplicas ?? 0);
    if (current > 0 && desired > 0 && current >= desired) {
      return "ready";
    }
    return current > 0 ? "warning" : "unknown";
  }

  if (item.kind === "PodDisruptionBudget") {
    const allowed = Number(status.disruptionsAllowed ?? 0);
    const currentHealthy = Number(status.currentHealthy ?? 0);
    const desiredHealthy = Number(status.desiredHealthy ?? 0);
    if (allowed > 0 || currentHealthy >= desiredHealthy) {
      return "ready";
    }
    return currentHealthy > 0 ? "warning" : "danger";
  }

  return "unknown";
}

function topologyNode(
  type: OcpTopologyNode["type"],
  resource: OcpApiResource,
  item: OcpResourceSummary,
  evidence: string[]
): OcpTopologyNode {
  return {
    id: topologyId(type, item),
    type,
    label: item.metadata.name,
    namespace: item.metadata.namespace,
    health: workloadHealth(item),
    resource,
    item,
    evidence
  };
}

async function topologyListResource(params: {
  apiVersion: string;
  resource: string;
  namespace?: string;
  limit: number;
  errors: OcpTopologyResponse["errors"];
}) {
  try {
    return await listOcpResource({
      apiVersion: params.apiVersion,
      resource: params.resource,
      namespace: params.namespace,
      limit: params.limit,
      full: true
    });
  } catch (error) {
    params.errors.push({
      resource: `${params.apiVersion}/${params.resource}`,
      message: compactError(error)
    });
    return undefined;
  }
}

export async function getOcpTopology(params: {
  namespace?: string;
  limit?: number;
} = {}): Promise<OcpTopologyResponse> {
  const status = await getOcpStatus();
  if (!status.configured || !status.reachable) {
    throw new Error(status.error ?? "OCP API is not reachable");
  }

  const limit = Math.min(Math.max(params.limit ?? 200, 1), 500);
  const errors: OcpTopologyResponse["errors"] = [];
  const [
    deploymentConfigs,
    deployments,
    statefulsets,
    daemonsets,
    replicasets,
    replicationControllers,
    hpas,
    pdbs,
    pods,
    services,
    routes,
    jobs,
    cronjobs
  ] = await Promise.all([
    topologyListResource({
      apiVersion: "apps.openshift.io/v1",
      resource: "deploymentconfigs",
      namespace: params.namespace,
      limit,
      errors
    }),
    topologyListResource({
      apiVersion: "apps/v1",
      resource: "deployments",
      namespace: params.namespace,
      limit,
      errors
    }),
    topologyListResource({
      apiVersion: "apps/v1",
      resource: "statefulsets",
      namespace: params.namespace,
      limit,
      errors
    }),
    topologyListResource({
      apiVersion: "apps/v1",
      resource: "daemonsets",
      namespace: params.namespace,
      limit,
      errors
    }),
    topologyListResource({
      apiVersion: "apps/v1",
      resource: "replicasets",
      namespace: params.namespace,
      limit,
      errors
    }),
    topologyListResource({
      apiVersion: "v1",
      resource: "replicationcontrollers",
      namespace: params.namespace,
      limit,
      errors
    }),
    topologyListResource({
      apiVersion: "autoscaling/v2",
      resource: "horizontalpodautoscalers",
      namespace: params.namespace,
      limit,
      errors
    }),
    topologyListResource({
      apiVersion: "policy/v1",
      resource: "poddisruptionbudgets",
      namespace: params.namespace,
      limit,
      errors
    }),
    topologyListResource({
      apiVersion: "v1",
      resource: "pods",
      namespace: params.namespace,
      limit,
      errors
    }),
    topologyListResource({
      apiVersion: "v1",
      resource: "services",
      namespace: params.namespace,
      limit,
      errors
    }),
    topologyListResource({
      apiVersion: "route.openshift.io/v1",
      resource: "routes",
      namespace: params.namespace,
      limit,
      errors
    }),
    topologyListResource({
      apiVersion: "batch/v1",
      resource: "jobs",
      namespace: params.namespace,
      limit,
      errors
    }),
    topologyListResource({
      apiVersion: "batch/v1",
      resource: "cronjobs",
      namespace: params.namespace,
      limit,
      errors
    })
  ]);

  const nodes: OcpTopologyResponse["nodes"] = [];
  const edges: OcpTopologyResponse["edges"] = [];

  for (const item of routes?.items ?? []) {
    nodes.push(
      topologyNode("route", routes!.resource, item, [
        "route.openshift.io/v1/routes read through the OpenShift API",
        "route target service is derived from spec.to.name"
      ])
    );
  }
  for (const item of services?.items ?? []) {
    nodes.push(
      topologyNode("service", services!.resource, item, [
        "v1/services read through the OpenShift API",
        "service selector is matched against pod labels"
      ])
    );
  }
  for (const item of deploymentConfigs?.items ?? []) {
    nodes.push(
      topologyNode("deploymentconfig", deploymentConfigs!.resource, item, [
        "apps.openshift.io/v1/deploymentconfigs read through the OpenShift API",
        "deploymentconfig selector is matched against pod labels"
      ])
    );
  }
  for (const item of deployments?.items ?? []) {
    nodes.push(
      topologyNode("deployment", deployments!.resource, item, [
        "apps/v1/deployments read through the OpenShift API",
        "deployment selector is matched against pod labels"
      ])
    );
  }
  for (const item of statefulsets?.items ?? []) {
    nodes.push(
      topologyNode("statefulset", statefulsets!.resource, item, [
        "apps/v1/statefulsets read through the OpenShift API",
        "statefulset selector is matched against pod labels"
      ])
    );
  }
  for (const item of daemonsets?.items ?? []) {
    nodes.push(
      topologyNode("daemonset", daemonsets!.resource, item, [
        "apps/v1/daemonsets read through the OpenShift API",
        "daemonset selector is matched against pod labels"
      ])
    );
  }
  for (const item of replicasets?.items ?? []) {
    nodes.push(
      topologyNode("replicaset", replicasets!.resource, item, [
        "apps/v1/replicasets read through the OpenShift API",
        "replicaset selector is matched against pod labels and ownerReferences"
      ])
    );
  }
  for (const item of replicationControllers?.items ?? []) {
    nodes.push(
      topologyNode("replicationcontroller", replicationControllers!.resource, item, [
        "v1/replicationcontrollers read through the OpenShift API",
        "replicationcontroller selector is matched against pod labels"
      ])
    );
  }
  for (const item of hpas?.items ?? []) {
    nodes.push(
      topologyNode("hpa", hpas!.resource, item, [
        "autoscaling/v2/horizontalpodautoscalers read through the OpenShift API",
        "scaleTargetRef is matched against workload controller nodes"
      ])
    );
  }
  for (const item of pdbs?.items ?? []) {
    nodes.push(
      topologyNode("pdb", pdbs!.resource, item, [
        "policy/v1/poddisruptionbudgets read through the OpenShift API",
        "pdb selector is matched against protected pod labels"
      ])
    );
  }
  for (const item of pods?.items ?? []) {
    nodes.push(
      topologyNode("pod", pods!.resource, item, [
        "v1/pods read through the OpenShift API",
        "pod phase and labels are used for topology health and edges"
      ])
    );
  }
  for (const item of cronjobs?.items ?? []) {
    nodes.push(
      topologyNode("cronjob", cronjobs!.resource, item, [
        "batch/v1/cronjobs read through the OpenShift API",
        "cronjob ownerReferences are matched against jobs"
      ])
    );
  }
  for (const item of jobs?.items ?? []) {
    nodes.push(
      topologyNode("job", jobs!.resource, item, [
        "batch/v1/jobs read through the OpenShift API",
        "job ownerReferences are matched against cronjobs and pods"
      ])
    );
  }

  const workloadControllers = [
    {
      type: "deploymentconfig",
      kind: "DeploymentConfig",
      label: "DeploymentConfig selector",
      items: deploymentConfigs?.items ?? []
    },
    {
      type: "deployment",
      kind: "Deployment",
      label: "Deployment selector",
      items: deployments?.items ?? []
    },
    {
      type: "statefulset",
      kind: "StatefulSet",
      label: "StatefulSet selector",
      items: statefulsets?.items ?? []
    },
    {
      type: "daemonset",
      kind: "DaemonSet",
      label: "DaemonSet selector",
      items: daemonsets?.items ?? []
    },
    {
      type: "replicaset",
      kind: "ReplicaSet",
      label: "ReplicaSet selector",
      items: replicasets?.items ?? []
    },
    {
      type: "replicationcontroller",
      kind: "ReplicationController",
      label: "ReplicationController selector",
      items: replicationControllers?.items ?? []
    }
  ] as const;

  const serviceByName = new Map(
    (services?.items ?? []).map((item) => [
      `${item.metadata.namespace ?? ""}/${item.metadata.name}`,
      item
    ])
  );

  for (const route of routes?.items ?? []) {
    const serviceName = routeTargetService(route);
    if (!serviceName) {
      continue;
    }
    const service = serviceByName.get(
      `${route.metadata.namespace ?? ""}/${serviceName}`
    );
    if (!service) {
      continue;
    }
    edges.push({
      id: `route:${topologyId("route", route)}->service:${topologyId("service", service)}`,
      from: topologyId("route", route),
      to: topologyId("service", service),
      type: "routes-to",
      label: "Route -> Service",
      evidence: [`${route.metadata.name} spec.to.name=${serviceName}`]
    });
  }

  for (const service of services?.items ?? []) {
    const selector = serviceSelector(service);
    for (const pod of pods?.items ?? []) {
      if (service.metadata.namespace !== pod.metadata.namespace) {
        continue;
      }
      if (!labelsMatch(pod.metadata.labels, selector)) {
        continue;
      }
      edges.push({
        id: `service:${topologyId("service", service)}->pod:${topologyId("pod", pod)}`,
        from: topologyId("service", service),
        to: topologyId("pod", pod),
        type: "selects",
        label: "Service selector",
        evidence: [
          `${service.metadata.name} selector matched pod labels`,
          Object.entries(selector).map(([key, value]) => `${key}=${value}`).join(", ")
        ].filter(Boolean)
      });
    }
  }

  for (const controllerGroup of workloadControllers) {
    for (const controller of controllerGroup.items) {
      const selector = workloadSelector(controller);
      for (const pod of pods?.items ?? []) {
        if (controller.metadata.namespace !== pod.metadata.namespace) {
          continue;
        }
        if (!labelsMatch(pod.metadata.labels, selector)) {
          continue;
        }
        edges.push({
          id: `${controllerGroup.type}:${topologyId(controllerGroup.type, controller)}->pod:${topologyId("pod", pod)}`,
          from: topologyId(controllerGroup.type, controller),
          to: topologyId("pod", pod),
          type: "selects",
          label: controllerGroup.label,
          evidence: [
            `${controller.metadata.name} selector matched pod labels`,
            Object.entries(selector).map(([key, value]) => `${key}=${value}`).join(", ")
          ].filter(Boolean)
        });
      }
    }
  }

  for (const childGroup of workloadControllers) {
    for (const child of childGroup.items) {
      for (const owner of child.metadata.ownerReferences ?? []) {
        const parentGroup = workloadControllers.find((group) => group.kind === owner.kind);
        const parent = parentGroup?.items.find(
          (item) =>
            item.metadata.namespace === child.metadata.namespace &&
            item.metadata.name === owner.name
        );
        if (!parentGroup || !parent) {
          continue;
        }
        edges.push({
          id: `${parentGroup.type}:${topologyId(parentGroup.type, parent)}->${childGroup.type}:${topologyId(childGroup.type, child)}`,
          from: topologyId(parentGroup.type, parent),
          to: topologyId(childGroup.type, child),
          type: "owns",
          label: "OwnerReference",
          evidence: [
            `${child.metadata.name} ownerReferences includes ${owner.kind}/${owner.name}`
          ]
        });
      }
    }
  }

  for (const hpa of hpas?.items ?? []) {
    const target = readRecordPath(hpa.spec, ["scaleTargetRef"]);
    if (!target || typeof target !== "object") {
      continue;
    }
    const targetRecord = target as Record<string, unknown>;
    const targetKind = typeof targetRecord.kind === "string" ? targetRecord.kind : undefined;
    const targetName = typeof targetRecord.name === "string" ? targetRecord.name : undefined;
    if (!targetKind || !targetName) {
      continue;
    }
    const targetGroup = workloadControllers.find((group) => group.kind === targetKind);
    const targetItem = targetGroup?.items.find(
      (item) =>
        item.metadata.namespace === hpa.metadata.namespace &&
        item.metadata.name === targetName
    );
    if (!targetGroup || !targetItem) {
      continue;
    }
    edges.push({
      id: `hpa:${topologyId("hpa", hpa)}->${targetGroup.type}:${topologyId(targetGroup.type, targetItem)}`,
      from: topologyId("hpa", hpa),
      to: topologyId(targetGroup.type, targetItem),
      type: "selects",
      label: "Scale target",
      evidence: [
        `${hpa.metadata.name} scaleTargetRef=${targetKind}/${targetName}`
      ]
    });
  }

  for (const pdb of pdbs?.items ?? []) {
    const selector = workloadSelector(pdb);
    for (const pod of pods?.items ?? []) {
      if (pdb.metadata.namespace !== pod.metadata.namespace) {
        continue;
      }
      if (!labelsMatch(pod.metadata.labels, selector)) {
        continue;
      }
      edges.push({
        id: `pdb:${topologyId("pdb", pdb)}->pod:${topologyId("pod", pod)}`,
        from: topologyId("pdb", pdb),
        to: topologyId("pod", pod),
        type: "selects",
        label: "PDB selector",
        evidence: [
          `${pdb.metadata.name} selector matched protected pod labels`,
          Object.entries(selector).map(([key, value]) => `${key}=${value}`).join(", ")
        ].filter(Boolean)
      });
    }
  }

  for (const job of jobs?.items ?? []) {
    for (const owner of job.metadata.ownerReferences ?? []) {
      if (owner.kind !== "CronJob") {
        continue;
      }
      const cronjob = (cronjobs?.items ?? []).find(
        (item) =>
          item.metadata.namespace === job.metadata.namespace &&
          item.metadata.name === owner.name
      );
      if (!cronjob) {
        continue;
      }
      edges.push({
        id: `cronjob:${topologyId("cronjob", cronjob)}->job:${topologyId("job", job)}`,
        from: topologyId("cronjob", cronjob),
        to: topologyId("job", job),
        type: "owns",
        label: "OwnerReference",
        evidence: [`${job.metadata.name} ownerReferences includes CronJob/${owner.name}`]
      });
    }
  }

  for (const pod of pods?.items ?? []) {
    for (const owner of pod.metadata.ownerReferences ?? []) {
      if (owner.kind !== "Job") {
        continue;
      }
      const job = (jobs?.items ?? []).find(
        (item) =>
          item.metadata.namespace === pod.metadata.namespace &&
          item.metadata.name === owner.name
      );
      if (!job) {
        continue;
      }
      edges.push({
        id: `job:${topologyId("job", job)}->pod:${topologyId("pod", pod)}`,
        from: topologyId("job", job),
        to: topologyId("pod", pod),
        type: "owns",
        label: "OwnerReference",
        evidence: [`${pod.metadata.name} ownerReferences includes Job/${owner.name}`]
      });
    }
  }

  return {
    status,
    namespace: params.namespace,
    generatedAt: new Date().toISOString(),
    nodes,
    edges,
    evidence: [
      "Topology uses only get/list/read-safe OpenShift API requests",
      "Service and workload controller edges are selector-derived",
      "Route, HPA, PDB, controller, and Job edges are target/selector/ownerReference-derived",
      "No create/update/patch/delete verbs are used"
    ],
    errors
  };
}

export async function getOcpPodLogs(params: {
  namespace: string;
  pod: string;
  container?: string;
  previous?: boolean;
  tailLines?: number;
  sinceSeconds?: number;
}): Promise<OcpPodLogsResponse> {
  const config = getOcpConfig();
  const status = await getOcpStatus();
  if (!status.configured || !status.reachable) {
    throw new Error(status.error ?? "OCP API is not reachable");
  }

  const tailLines = Math.min(Math.max(params.tailLines ?? 200, 1), 2000);
  const sinceSeconds =
    typeof params.sinceSeconds === "number"
      ? Math.min(Math.max(Math.floor(params.sinceSeconds), 1), 86_400)
      : undefined;
  const access = await reviewResourceAccess(
    config,
    {
      group: "",
      version: "v1",
      apiVersion: "v1",
      name: "pods",
      subresource: "log",
      namespaced: true
    },
    {
      verb: "get",
      namespace: params.namespace,
      name: params.pod
    }
  );
  if (accessDenied(access)) {
    throw new Error(
      `RBAC denied get for v1/pods/log: ${access.reason ?? "not allowed"}`
    );
  }

  let container = params.container;

  if (!container) {
    const pod = await requestJson<{
      spec?: {
        containers?: Array<{ name?: string }>;
        initContainers?: Array<{ name?: string }>;
      };
    }>(
      config,
      `/api/v1/namespaces/${encodeURIComponent(params.namespace)}/pods/${encodeURIComponent(params.pod)}`
    );
    container =
      pod.spec?.containers?.find((candidate) => candidate.name)?.name ??
      pod.spec?.initContainers?.find((candidate) => candidate.name)?.name;
  }

  const searchParams = new URLSearchParams({
    tailLines: String(tailLines)
  });
  if (sinceSeconds) {
    searchParams.set("sinceSeconds", String(sinceSeconds));
  }
  if (container) {
    searchParams.set("container", container);
  }
  if (params.previous) {
    searchParams.set("previous", "true");
  }

  const logs = await requestText(
    config,
    `/api/v1/namespaces/${encodeURIComponent(params.namespace)}/pods/${encodeURIComponent(params.pod)}/log`,
    {
      accept: "application/json, application/yaml, */*",
      searchParams
    }
  );

  return {
    status,
    namespace: params.namespace,
    pod: params.pod,
    container,
    previous: Boolean(params.previous),
    tailLines,
    sinceSeconds,
    logs,
    truncated: logs.split(/\r?\n/).length >= tailLines,
    access
  };
}

export async function listOcpEvents(params: {
  apiVersion?: string;
  kind?: string;
  namespace?: string;
  name: string;
  uid?: string;
  limit?: number;
}): Promise<OcpEventsResponse> {
  const config = getOcpConfig();
  const status = await getOcpStatus();
  if (!status.configured || !status.reachable) {
    throw new Error(status.error ?? "OCP API is not reachable");
  }

  const access = await reviewResourceAccess(
    config,
    {
      group: "",
      version: "v1",
      apiVersion: "v1",
      name: "events",
      namespaced: true
    },
    {
      verb: "list",
      namespace: params.namespace
    }
  );
  if (accessDenied(access)) {
    throw new Error(
      `RBAC denied list for v1/events: ${access.reason ?? "not allowed"}`
    );
  }

  const searchParams = new URLSearchParams({
    limit: String(Math.min(Math.max(params.limit ?? 100, 1), 500))
  });
  searchParams.set("fieldSelector", `involvedObject.name=${params.name}`);

  const path = params.namespace
    ? `/api/v1/namespaces/${encodeURIComponent(params.namespace)}/events`
    : "/api/v1/events";

  const list = await requestJson<{
    items?: Array<Record<string, unknown>>;
  }>(config, path, {
    searchParams
  });

  const events = (list.items ?? [])
    .map(summarizeEvent)
    .filter((event) => {
      const regarding = event.regarding;
      if (params.uid && regarding?.uid && regarding.uid !== params.uid) {
        return false;
      }
      if (params.kind && regarding?.kind && regarding.kind !== params.kind) {
        return false;
      }
      if (params.namespace && regarding?.namespace && regarding.namespace !== params.namespace) {
        return false;
      }
      return regarding?.name === params.name || event.name.includes(params.name);
    })
    .sort((a, b) =>
      String(b.lastTimestamp ?? b.firstTimestamp ?? "").localeCompare(
        String(a.lastTimestamp ?? a.firstTimestamp ?? "")
      )
    );

  return {
    status,
    target: {
      apiVersion: params.apiVersion,
      kind: params.kind,
      name: params.name,
      namespace: params.namespace,
      uid: params.uid
    },
    items: events,
    access
  };
}

type ConsoleDashboard = OcpConsoleOverviewResponse["consoleDashboard"];
type ConsoleDashboardStatusCard = ConsoleDashboard["statusCards"][number];
type ConsoleDashboardUtilization = ConsoleDashboard["utilization"];

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function eventTimeMs(event: OcpEventSummary) {
  const raw = event.lastTimestamp ?? event.firstTimestamp;
  const parsed = raw ? Date.parse(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestPrometheusValue(sample: OcpPrometheusQueryResponse["results"][number]) {
  if (sample.values?.length) {
    const latest = sample.values[sample.values.length - 1];
    const value = Number(latest[1]);
    return Number.isFinite(value) ? value : undefined;
  }

  if (sample.value) {
    const value = Number(sample.value[1]);
    return Number.isFinite(value) ? value : undefined;
  }

  return undefined;
}

function conditionSeverity(
  condition: OcpConditionSummary
): ConsoleDashboardStatusCard["severity"] {
  if (/failing|degraded/i.test(condition.type)) {
    return "critical";
  }
  if (/notupgradeable|progressing|available/i.test(condition.type)) {
    return "warning";
  }
  return "info";
}

function lightspeedVersionFromCsvs(csvs: Array<Record<string, unknown>>) {
  const csv = csvs.find((item) => {
    const metadata = getObjectMetadata(item);
    return metadata?.name?.toLowerCase().includes("lightspeed");
  });
  const metadata = getObjectMetadata(csv ?? {});
  const spec = recordValue(csv?.spec);
  const version = stringValue(spec?.version);
  return version ?? metadata?.name;
}

function buildConsoleStatusCards(params: {
  clusterConditions: OcpConditionSummary[];
  degradedItems: Array<{ name: string; conditions: OcpConditionSummary[] }>;
  monitoring: OcpConsoleOverviewResponse["monitoring"];
  recentEvents: OcpEventSummary[];
}) {
  const cards: ConsoleDashboardStatusCard[] = [];

  params.clusterConditions
    .filter((condition) => condition.status === "True")
    .filter((condition) =>
      /failing|notupgradeable|progressing|retrievedupdates|available/i.test(
        condition.type
      )
    )
    .forEach((condition, index) => {
      cards.push({
        id: `clusterversion-${condition.type}-${index}`,
        title: condition.type,
        severity: conditionSeverity(condition),
        message:
          condition.message ??
          condition.reason ??
          `${condition.type} is ${condition.status}`,
        source: "clusterversion"
      });
    });

  params.degradedItems.slice(0, 6).forEach((operator, index) => {
    const degraded = operator.conditions.find(
      (condition) => condition.type === "Degraded"
    );
    cards.push({
      id: `clusteroperator-${operator.name}-${index}`,
      title: operator.name || "ClusterOperator",
      severity: "critical",
      message:
        degraded?.message ??
        degraded?.reason ??
        "ClusterOperator reports Degraded=True",
      source: "clusteroperator"
    });
  });

  params.monitoring.sample.slice(0, 4).forEach((alert, index) => {
    cards.push({
      id: `monitoring-${alert.alertname}-${index}`,
      title: alert.alertname,
      severity: alert.severity === "critical" ? "critical" : "warning",
      message: `${alert.state ?? "alert"}${alert.namespace ? ` / ${alert.namespace}` : ""}`,
      source: "monitoring"
    });
  });

  params.recentEvents
    .filter((event) => event.type === "Warning")
    .slice(0, 4)
    .forEach((event, index) => {
      cards.push({
        id: `event-${event.name}-${index}`,
        title: event.reason ?? event.name,
        severity: "warning",
        message: event.message ?? event.regarding?.name ?? "Warning event",
        timestamp: event.lastTimestamp ?? event.firstTimestamp,
        source: "event"
      });
    });

  return cards.slice(0, 12);
}

async function getConsoleDashboardUtilization(
  config: OcpConfig
): Promise<ConsoleDashboardUtilization> {
  const end = new Date();
  const start = new Date(end.getTime() - 60 * 60 * 1000);
  const metricSpecs: Array<{
    id: ConsoleDashboardUtilization["series"][number]["id"];
    label: string;
    unit: string;
    query: string;
  }> = [
    {
      id: "cpu",
      label: "CPU",
      unit: "cores",
      query: 'sum(rate(container_cpu_usage_seconds_total{container!="",pod!=""}[5m]))'
    },
    {
      id: "memory",
      label: "Memory",
      unit: "bytes",
      query: 'sum(container_memory_working_set_bytes{container!="",pod!=""})'
    },
    {
      id: "filesystem",
      label: "File system",
      unit: "bytes",
      query:
        'sum(node_filesystem_size_bytes{mountpoint="/sysroot"} - node_filesystem_avail_bytes{mountpoint="/sysroot"}) or sum(node_filesystem_size_bytes{mountpoint="/"} - node_filesystem_avail_bytes{mountpoint="/"}) or sum(node_filesystem_size_bytes{fstype!="",mountpoint!=""} - node_filesystem_avail_bytes{fstype!="",mountpoint!=""})'
    },
    {
      id: "network-in",
      label: "Network in",
      unit: "bytes/s",
      query: "sum(rate(container_network_receive_bytes_total[5m]))"
    },
    {
      id: "network-out",
      label: "Network out",
      unit: "bytes/s",
      query: "sum(rate(container_network_transmit_bytes_total[5m]))"
    },
    {
      id: "pods",
      label: "Pods",
      unit: "count",
      query: "count(kube_pod_info)"
    }
  ];

  const results = await Promise.all(
    metricSpecs.map(async (spec) => {
      const response = await queryOcpPrometheus({
        query: spec.query,
        range: {
          start,
          end,
          stepSeconds: 300
        },
        timeoutMs: 1200
      });
      const firstSample = response.results[0];
      return {
        response,
        series: {
          id: spec.id,
          label: spec.label,
          unit: spec.unit,
          latest: firstSample ? latestPrometheusValue(firstSample) : undefined,
          samples: response.results,
          query: spec.query,
          error: response.error
        }
      };
    })
  );

  const enabled = results.some((result) => result.response.enabled);
  const reachable = results.some((result) => result.response.reachable);
  const source: ConsoleDashboardUtilization["source"] = reachable
    ? "openshift-monitoring"
    : enabled
      ? "unavailable"
      : "disabled";
  const error = results.find((result) => result.response.error)?.response.error;

  return {
    enabled,
    reachable,
    source,
    series: results.map((result) => result.series),
    evidence: reachable
      ? (results.find((result) => result.response.reachable)?.response.evidence ?? [
          "openshift-monitoring route query_range",
          "read-only Prometheus utilization queries"
        ])
      : [
          "openshift-monitoring utilization unavailable",
          "no synthetic utilization values were generated"
        ],
    error
  };
}

export async function getOcpConsoleOverview(): Promise<OcpConsoleOverviewResponse> {
  const config = getOcpConfig();
  const status = await getOcpStatus();
  if (!status.configured || !status.reachable) {
    throw new Error(status.error ?? "OCP API is not reachable");
  }

  const [
    clusterVersion,
    clusterOperators,
    nodes,
    namespaces,
    pods,
    deployments,
    routes,
    ingresses,
    services,
    builds,
    imageStreams,
    infrastructure,
    storageClasses,
    persistentVolumeClaims,
    events,
    lightspeedCsvs,
    monitoring,
    utilization
  ] = await Promise.all([
    requestJson<Record<string, unknown>>(
      config,
      "/apis/config.openshift.io/v1/clusterversions/version"
    ).catch(() => undefined),
    listAllItemsSafe(config, "/apis/config.openshift.io/v1/clusteroperators"),
    listAllItemsSafe(config, "/api/v1/nodes"),
    listAllItemsSafe(config, "/api/v1/namespaces"),
    listAllItemsSafe(config, "/api/v1/pods"),
    listAllItemsSafe(config, "/apis/apps/v1/deployments"),
    listAllItemsSafe(config, "/apis/route.openshift.io/v1/routes"),
    listAllItemsSafe(config, "/apis/networking.k8s.io/v1/ingresses"),
    listAllItemsSafe(config, "/api/v1/services"),
    listAllItemsSafe(config, "/apis/build.openshift.io/v1/builds"),
    listAllItemsSafe(config, "/apis/image.openshift.io/v1/imagestreams"),
    requestJson<Record<string, unknown>>(
      config,
      "/apis/config.openshift.io/v1/infrastructures/cluster"
    ).catch(() => undefined),
    listAllItemsSafe(config, "/apis/storage.k8s.io/v1/storageclasses"),
    listAllItemsSafe(config, "/api/v1/persistentvolumeclaims"),
    listAllItemsSafe(config, "/api/v1/events"),
    listAllItemsSafe(
      config,
      "/apis/operators.coreos.com/v1alpha1/namespaces/openshift-lightspeed/clusterserviceversions"
    ),
    getMonitoringAlerts(config),
    getConsoleDashboardUtilization(config)
  ]);

  const clusterStatus = clusterVersion?.status as
    | Record<string, unknown>
    | undefined;
  const desired = clusterStatus?.desired as
    | { version?: string; image?: string }
    | undefined;

  const operatorItems = clusterOperators.map((operator) => {
    const metadata = getObjectMetadata(operator);
    const operatorStatus = operator.status as Record<string, unknown> | undefined;
    return {
      name: metadata?.name ?? "",
      conditions: conditionsFrom(operatorStatus?.conditions)
    };
  });
  const degradedItems = operatorItems.filter(
    (operator) => conditionStatus(operator.conditions, "Degraded") === "True"
  );

  const nodeItems = nodes.map((node) => {
    const metadata = node.metadata as
      | {
          name?: string;
          labels?: Record<string, string>;
        }
      | undefined;
    const nodeStatus = node.status as Record<string, unknown> | undefined;
    const conditions = conditionsFrom(nodeStatus?.conditions);
    const labels = metadata?.labels ?? {};
    return {
      name: metadata?.name ?? "",
      ready: conditionStatus(conditions, "Ready") === "True",
      roles: Object.keys(labels)
        .filter((key) => key.startsWith("node-role.kubernetes.io/"))
        .map((key) => key.replace("node-role.kubernetes.io/", "")),
      kubeletVersion:
        typeof (nodeStatus?.nodeInfo as { kubeletVersion?: unknown } | undefined)
          ?.kubeletVersion === "string"
          ? String(
              (nodeStatus?.nodeInfo as { kubeletVersion?: string }).kubeletVersion
            )
          : undefined
    };
  });

  const podSummaries = pods.map((pod) => {
    const statusRecord = pod.status as Record<string, unknown> | undefined;
    const phase = String(statusRecord?.phase ?? "");
    const statuses = [
      ...((statusRecord?.containerStatuses as Array<Record<string, unknown>> | undefined) ??
        []),
      ...((statusRecord?.initContainerStatuses as Array<Record<string, unknown>> | undefined) ??
        [])
    ];
    const crashLooping = statuses.some((container) => {
      const state = container.state as
        | {
            waiting?: {
              reason?: string;
            };
          }
        | undefined;
      return state?.waiting?.reason === "CrashLoopBackOff";
    });

    return {
      phase,
      crashLooping
    };
  });

  const deploymentUnavailable = deployments.filter((deployment) => {
    const statusRecord = deployment.status as Record<string, unknown> | undefined;
    return Number(statusRecord?.unavailableReplicas ?? 0) > 0;
  }).length;

  const failedBuilds = builds.filter((build) => {
    const statusRecord = build.status as Record<string, unknown> | undefined;
    return ["Failed", "Error", "Cancelled"].includes(
      String(statusRecord?.phase ?? "")
    );
  }).length;
  const clusterConditions = conditionsFrom(clusterStatus?.conditions);
  const infrastructureStatus = recordValue(infrastructure?.status);
  const recentEvents = events
    .map(summarizeEvent)
    .sort((a, b) => eventTimeMs(b) - eventTimeMs(a))
    .slice(0, 20);
  const infrastructureName = stringValue(infrastructureStatus?.infrastructureName);
  const infrastructureApiUrl = stringValue(infrastructureStatus?.apiServerURL);
  const clusterId =
    stringValue(clusterStatus?.clusterID) ??
    stringValue(
      (clusterVersion?.spec as Record<string, unknown> | undefined)?.clusterID
    ) ??
    infrastructureName;
  const openshiftVersion = desired?.version ?? status.gitVersion;
  const channel =
    typeof (clusterVersion?.spec as { channel?: unknown } | undefined)
      ?.channel === "string"
      ? String((clusterVersion?.spec as { channel?: string }).channel)
      : undefined;

  return {
    status,
    generatedAt: new Date().toISOString(),
    cluster: {
      version: status.gitVersion,
      desiredVersion: desired?.version,
      channel,
      conditions: clusterConditions
    },
    operators: {
      total: operatorItems.length,
      degraded: degradedItems.length,
      progressing: operatorItems.filter(
        (operator) => conditionStatus(operator.conditions, "Progressing") === "True"
      ).length,
      unavailable: operatorItems.filter(
        (operator) => conditionStatus(operator.conditions, "Available") === "False"
      ).length,
      degradedItems: degradedItems.slice(0, 12)
    },
    nodes: {
      total: nodeItems.length,
      ready: nodeItems.filter((node) => node.ready).length,
      notReady: nodeItems.filter((node) => !node.ready).length,
      items: nodeItems.slice(0, 20)
    },
    workloads: {
      namespaces: namespaces.length,
      pods: {
        total: podSummaries.length,
        running: podSummaries.filter((pod) => pod.phase === "Running").length,
        pending: podSummaries.filter((pod) => pod.phase === "Pending").length,
        failed: podSummaries.filter((pod) => pod.phase === "Failed").length,
        crashLooping: podSummaries.filter((pod) => pod.crashLooping).length
      },
      deployments: {
        total: deployments.length,
        unavailable: deploymentUnavailable
      }
    },
    networking: {
      routes: routes.length,
      ingresses: ingresses.length,
      services: services.length
    },
    supplyChain: {
      builds: builds.length,
      failedBuilds,
      imageStreams: imageStreams.length
    },
    monitoring,
    consoleDashboard: {
      details: {
        apiUrl: infrastructureApiUrl ?? status.baseUrl,
        clusterId,
        infrastructureName,
        openshiftVersion,
        channel,
        highAvailability: nodeItems.length > 1 ? "multi-node" : "single-node",
        lightspeedVersion: lightspeedVersionFromCsvs(lightspeedCsvs)
      },
      inventory: {
        nodes: nodeItems.length,
        pods: podSummaries.length,
        storageClasses: storageClasses.length,
        persistentVolumeClaims: persistentVolumeClaims.length,
        routes: routes.length,
        services: services.length
      },
      statusCards: buildConsoleStatusCards({
        clusterConditions,
        degradedItems,
        monitoring,
        recentEvents
      }),
      activity: recentEvents.slice(0, 12),
      utilization
    },
    evidence: [
      "config.openshift.io/v1 ClusterVersion/version",
      "config.openshift.io/v1 Infrastructure/cluster",
      "config.openshift.io/v1 ClusterOperator list",
      "v1 Node/Namespace/Pod/Service lists",
      "apps/v1 Deployment list",
      "route.openshift.io/v1 Route list",
      "networking.k8s.io/v1 Ingress list",
      "storage.k8s.io/v1 StorageClass list",
      "v1 PersistentVolumeClaim list",
      "v1 Event list",
      "build.openshift.io/v1 Build list",
      "image.openshift.io/v1 ImageStream list",
      "openshift-monitoring service proxy when available"
    ]
  };
}

async function getMonitoringAlerts(
  config: OcpConfig
): Promise<OcpConsoleOverviewResponse["monitoring"]> {
  const query = "ALERTS{alertstate=\"firing\"}";
  const response = await queryOcpPrometheus({
    query,
    timeoutMs: 1200
  });

  if (!response.enabled || !response.reachable) {
    return {
      reachable: false,
      firingAlerts: 0,
      warningAlerts: 0,
      criticalAlerts: 0,
      sample: [],
      error: response.error
    };
  }

  const sample = response.results.slice(0, 10).map((result) => ({
    alertname: result.metric.alertname ?? "unknown",
    severity: result.metric.severity,
    namespace: result.metric.namespace,
    state: result.metric.alertstate
  }));
  const warningAlerts = response.results.filter(
    (result) => result.metric.severity === "warning"
  ).length;
  const criticalAlerts = response.results.filter(
    (result) => result.metric.severity === "critical"
  ).length;

  return {
    reachable: true,
    firingAlerts: response.results.length,
    warningAlerts,
    criticalAlerts,
    sample
  };
}

function prometheusProxyPaths(kind: "query" | "query_range") {
  return [
    `/api/v1/namespaces/openshift-monitoring/services/https:thanos-querier:9091/proxy/api/v1/${kind}`,
    `/api/v1/namespaces/openshift-monitoring/services/https:prometheus-k8s:9091/proxy/api/v1/${kind}`,
    `/api/v1/namespaces/openshift-monitoring/services/http:prometheus-k8s:9090/proxy/api/v1/${kind}`
  ];
}

function prometheusTime(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function prometheusSamples(
  results: Array<{
    metric?: Record<string, string>;
    value?: [number | string, string];
    values?: Array<[number | string, string]>;
  }>
): OcpPrometheusQueryResponse["results"] {
  return results.slice(0, 12).map((result) => ({
    metric: result.metric ?? {},
    value: result.value
      ? [Number(result.value[0]), String(result.value[1])]
      : undefined,
    values: result.values
      ? result.values.slice(-20).map((value) => [
          Number(value[0]),
          String(value[1])
        ])
      : undefined
  }));
}

export async function queryOcpPrometheus(params: {
  query: string;
  range?: {
    start: string | Date;
    end: string | Date;
    stepSeconds?: number;
  };
  timeoutMs?: number;
}): Promise<OcpPrometheusQueryResponse> {
  const config = getOcpConfig();
  const status = await getOcpStatus();
  const range = params.range
    ? {
        start: prometheusTime(params.range.start),
        end: prometheusTime(params.range.end),
        stepSeconds: Math.min(
          Math.max(Math.floor(params.range.stepSeconds ?? 30), 1),
          3600
        )
      }
    : undefined;

  if (!config.enableMonitoringProxy) {
    return {
      status,
      enabled: false,
      reachable: false,
      query: params.query,
      range,
      results: [],
      warnings: [],
      evidence: [
        "monitoring service proxy was not queried because OCP_ENABLE_MONITORING_PROXY is false"
      ],
      error:
        "Monitoring service proxy is disabled. Set OCP_ENABLE_MONITORING_PROXY=true to query live Prometheus metrics."
    };
  }

  if (!status.configured || !status.reachable) {
    return {
      status,
      enabled: true,
      reachable: false,
      query: params.query,
      range,
      results: [],
      warnings: [],
      evidence: ["OCP API status is not reachable, Prometheus proxy not queried"],
      error: status.error ?? "OCP API is not reachable"
    };
  }

  const searchParams = new URLSearchParams({
    query: params.query
  });
  const kind = range ? "query_range" : "query";
  if (range) {
    searchParams.set("start", range.start);
    searchParams.set("end", range.end);
    searchParams.set("step", String(range.stepSeconds));
  }

  const errors: string[] = [];

  for (const routeName of ["thanos-querier", "prometheus-k8s"]) {
    try {
      const response = await requestMonitoringRouteJson<{
        status?: string;
        warnings?: string[];
        data?: {
          resultType?: string;
          result?: Array<{
            metric?: Record<string, string>;
            value?: [number | string, string];
            values?: Array<[number | string, string]>;
          }>;
        };
      }>(config, routeName, `/api/v1/${kind}`, {
        searchParams,
        timeoutMs: params.timeoutMs ?? 2000
      });

      return {
        status,
        enabled: true,
        reachable: true,
        query: params.query,
        range,
        resultType: response.data?.resultType,
        results: prometheusSamples(response.data?.result ?? []),
        warnings: response.warnings ?? [],
        evidence: [
          `openshift-monitoring route ${routeName}`,
          "Prometheus query used route Bearer token authentication",
          range
            ? `Prometheus query_range ${range.start}..${range.end} step=${range.stepSeconds}s`
            : "Prometheus instant query"
        ]
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  for (const path of prometheusProxyPaths(kind)) {
    try {
      const response = await requestJson<{
        status?: string;
        warnings?: string[];
        data?: {
          resultType?: string;
          result?: Array<{
            metric?: Record<string, string>;
            value?: [number | string, string];
            values?: Array<[number | string, string]>;
          }>;
        };
      }>(config, path, {
        searchParams,
        timeoutMs: params.timeoutMs ?? 2000
      });

      return {
        status,
        enabled: true,
        reachable: true,
        query: params.query,
        range,
        resultType: response.data?.resultType,
        results: prometheusSamples(response.data?.result ?? []),
        warnings: response.warnings ?? [],
        evidence: [
          `openshift-monitoring service proxy ${path}`,
          "Prometheus query used read-only Kubernetes service proxy GET",
          range
            ? `Prometheus query_range ${range.start}..${range.end} step=${range.stepSeconds}s`
            : "Prometheus instant query"
        ]
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    status,
    enabled: true,
    reachable: false,
    query: params.query,
    range,
    results: [],
    warnings: [],
    evidence: [
      "attempted openshift-monitoring service proxy candidates",
      "Prometheus query used read-only Kubernetes service proxy GET"
    ],
    error: errors[0]?.slice(0, 240) ?? "monitoring query failed"
  };
}

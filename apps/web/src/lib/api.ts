import type {
  ActionPlanRequest,
  ActionPlanResponse,
  ContextSyncRequest,
  ContextSyncResponse,
  DashboardRisksResponse,
  OcpConsoleOverviewResponse,
  OcpApiResourcesResponse,
  OcpConnectionStatus,
  OcpCoverageDiagnosticResponse,
  OcpCoverageMatrixResponse,
  OcpEventsResponse,
  OcpPodLogsResponse,
  OpsLensAdminOverviewResponse,
  OpsLensRagApprovalQueueSubmitRequest,
  OpsLensRagApprovalQueueSubmissionResponse,
  OpsLensRagEvidenceExportRequest,
  OpsLensRagEvidenceExportResponse,
  OpsLensRagValidationRequest,
  OpsLensRagValidationResponse,
  OcpResourceAccessMatrixResponse,
  OcpResourceAccessReviewResponse,
  OcpResourceDetailResponse,
  OcpResourceListResponse,
  OcpRelatedResourcesResponse
} from "@kugnus/contracts";

function getApiBase() {
  if (typeof window === "undefined") {
    return "";
  }

  const apiBase = new URL(window.location.href).searchParams.get("apiBase") ?? "";
  return apiBase.replace(/\/+$/, "");
}

function resolveApiPath(path: string) {
  const apiBase = getApiBase();
  if (!apiBase) {
    return path;
  }
  return `${apiBase}${path.startsWith("/") ? path : `/${path}`}`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const requestPath = resolveApiPath(path);
  const response = await fetch(requestPath, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    throw new Error(`${requestPath} failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export function fetchDashboardRisks() {
  return requestJson<DashboardRisksResponse>("/api/dashboard/risks");
}

export function fetchOpsLensAdminOverview() {
  return requestJson<OpsLensAdminOverviewResponse>("/api/opslens/admin/overview");
}

export function validateOpsLensRagDocument(request: OpsLensRagValidationRequest) {
  return requestJson<OpsLensRagValidationResponse>("/api/opslens/admin/rag/validate", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function exportOpsLensRagEvidence(request: OpsLensRagEvidenceExportRequest) {
  return requestJson<OpsLensRagEvidenceExportResponse>(
    "/api/opslens/admin/rag/evidence-export",
    {
      method: "POST",
      body: JSON.stringify(request)
    }
  );
}

export function submitOpsLensRagApprovalQueue(
  request: OpsLensRagApprovalQueueSubmitRequest
) {
  return requestJson<OpsLensRagApprovalQueueSubmissionResponse>(
    "/api/opslens/admin/rag/approval-queue/submit",
    {
      method: "POST",
      body: JSON.stringify(request)
    }
  );
}

export function syncConsoleContext(request: ContextSyncRequest) {
  return requestJson<ContextSyncResponse>("/api/context/sync", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function createActionPlan(request: ActionPlanRequest) {
  return requestJson<ActionPlanResponse>("/api/actions/plan", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function fetchOcpStatus() {
  return requestJson<OcpConnectionStatus>("/api/ocp/status");
}

export function fetchOcpConsoleOverview() {
  return requestJson<OcpConsoleOverviewResponse>("/api/ocp/console-overview");
}

export function fetchOcpApiResources() {
  return requestJson<OcpApiResourcesResponse>("/api/ocp/api-resources");
}

export function fetchOcpAccessReview(params: {
  apiVersion: string;
  resource: string;
  namespace?: string;
  name?: string;
  verb?: string;
}) {
  const searchParams = new URLSearchParams({
    apiVersion: params.apiVersion,
    resource: params.resource,
    verb: params.verb ?? "list"
  });

  if (params.namespace) {
    searchParams.set("namespace", params.namespace);
  }
  if (params.name) {
    searchParams.set("name", params.name);
  }

  return requestJson<OcpResourceAccessReviewResponse>(
    `/api/ocp/access-review?${searchParams.toString()}`
  );
}

export function fetchOcpAccessMatrix(params: {
  apiVersion: string;
  resource: string;
  namespace?: string;
  name?: string;
}) {
  const searchParams = new URLSearchParams({
    apiVersion: params.apiVersion,
    resource: params.resource
  });

  if (params.namespace) {
    searchParams.set("namespace", params.namespace);
  }
  if (params.name) {
    searchParams.set("name", params.name);
  }

  return requestJson<OcpResourceAccessMatrixResponse>(
    `/api/ocp/access-matrix?${searchParams.toString()}`
  );
}

export function fetchOcpCoverageMatrix(params: {
  namespace?: string;
  maxResources?: number;
  includeDetails?: boolean;
} = {}) {
  const searchParams = new URLSearchParams();

  if (params.namespace) {
    searchParams.set("namespace", params.namespace);
  }
  if (params.maxResources) {
    searchParams.set("maxResources", String(params.maxResources));
  }
  if (params.includeDetails === false) {
    searchParams.set("includeDetails", "false");
  }

  const query = searchParams.toString();
  return requestJson<OcpCoverageMatrixResponse>(
    `/api/ocp/coverage-matrix${query ? `?${query}` : ""}`
  );
}

export function fetchOcpCoverageDiagnostic(params: {
  apiVersion: string;
  resource: string;
  namespace?: string;
}) {
  const searchParams = new URLSearchParams({
    apiVersion: params.apiVersion,
    resource: params.resource
  });

  if (params.namespace) {
    searchParams.set("namespace", params.namespace);
  }

  return requestJson<OcpCoverageDiagnosticResponse>(
    `/api/ocp/coverage-diagnostic?${searchParams.toString()}`
  );
}

export function fetchOcpResourceList(params: {
  apiVersion: string;
  resource: string;
  namespace?: string;
  labelSelector?: string;
  fieldSelector?: string;
  limit?: number;
  continueToken?: string;
  full?: boolean;
}) {
  const searchParams = new URLSearchParams({
    apiVersion: params.apiVersion,
    resource: params.resource,
    limit: String(params.limit ?? 50)
  });

  if (params.namespace) {
    searchParams.set("namespace", params.namespace);
  }
  if (params.labelSelector) {
    searchParams.set("labelSelector", params.labelSelector);
  }
  if (params.fieldSelector) {
    searchParams.set("fieldSelector", params.fieldSelector);
  }
  if (params.continueToken) {
    searchParams.set("continue", params.continueToken);
  }
  if (params.full) {
    searchParams.set("full", "true");
  }

  return requestJson<OcpResourceListResponse>(
    `/api/ocp/resources?${searchParams.toString()}`
  );
}

export function fetchOcpResourceDetail(params: {
  apiVersion: string;
  resource: string;
  namespace?: string;
  name: string;
  full?: boolean;
}) {
  const searchParams = new URLSearchParams({
    apiVersion: params.apiVersion,
    resource: params.resource,
    name: params.name
  });

  if (params.namespace) {
    searchParams.set("namespace", params.namespace);
  }
  if (params.full) {
    searchParams.set("full", "true");
  }

  return requestJson<OcpResourceDetailResponse>(
    `/api/ocp/resource?${searchParams.toString()}`
  );
}

export function fetchOcpRelatedResources(params: {
  apiVersion: string;
  resource: string;
  namespace?: string;
  name: string;
}) {
  const searchParams = new URLSearchParams({
    apiVersion: params.apiVersion,
    resource: params.resource,
    name: params.name
  });

  if (params.namespace) {
    searchParams.set("namespace", params.namespace);
  }

  return requestJson<OcpRelatedResourcesResponse>(
    `/api/ocp/related?${searchParams.toString()}`
  );
}

export function fetchOcpPodLogs(params: {
  namespace: string;
  pod: string;
  container?: string;
  previous?: boolean;
  tailLines?: number;
}) {
  const searchParams = new URLSearchParams({
    namespace: params.namespace,
    pod: params.pod,
    tailLines: String(params.tailLines ?? 200)
  });

  if (params.container) {
    searchParams.set("container", params.container);
  }
  if (params.previous) {
    searchParams.set("previous", "true");
  }

  return requestJson<OcpPodLogsResponse>(
    `/api/ocp/pod-logs?${searchParams.toString()}`
  );
}

export function fetchOcpEvents(params: {
  apiVersion?: string;
  kind?: string;
  namespace?: string;
  name: string;
  uid?: string;
  limit?: number;
}) {
  const searchParams = new URLSearchParams({
    name: params.name,
    limit: String(params.limit ?? 100)
  });

  if (params.apiVersion) {
    searchParams.set("apiVersion", params.apiVersion);
  }
  if (params.kind) {
    searchParams.set("kind", params.kind);
  }
  if (params.namespace) {
    searchParams.set("namespace", params.namespace);
  }
  if (params.uid) {
    searchParams.set("uid", params.uid);
  }

  return requestJson<OcpEventsResponse>(
    `/api/ocp/events?${searchParams.toString()}`
  );
}

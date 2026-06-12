import type {
  OcpEventSummary,
  OcpResourceSummary,
  OpsLensIncidentAnalysisRequest,
  OpsLensIncidentAnalysisResponse,
  OpsLensIncidentEventEvidence,
  OpsLensIncidentLogEvidence,
  OpsLensIncidentMetricEvidence,
  OpsLensIncidentResourceEvidence
} from "@kugnus/contracts";
import { randomUUID } from "node:crypto";
import {
  createOpsLensToolResponse,
  createPlanOnlyRemediationProposal
} from "./api";
import {
  getOcpPodLogs,
  getOcpResource,
  listOcpEvents,
  listOcpResource,
  queryOcpPrometheus
} from "./ocpClient";

const sensitivePattern =
  /(bearer\s+[a-z0-9._-]+|(?:token|password|passwd|secret|api[_-]?key)\s*[:=]\s*[^,\s;]+)/gi;

function assertIncidentRequest(
  request: OpsLensIncidentAnalysisRequest
): asserts request is OpsLensIncidentAnalysisRequest {
  if (
    !request ||
    typeof request.clusterId !== "string" ||
    typeof request.tenantId !== "string" ||
    !request.alert ||
    typeof request.alert.name !== "string"
  ) {
    throw new Error("invalid OpsLens incident analysis request");
  }
}

function compactError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function redactText(text: string, maxLength = 6000) {
  let redactionCount = 0;
  const redacted = text.replace(sensitivePattern, () => {
    redactionCount += 1;
    return "<REDACTED>";
  });
  const truncated = redacted.length > maxLength;
  return {
    text: truncated ? redacted.slice(redacted.length - maxLength) : redacted,
    truncated,
    redactionCount
  };
}

function redactEvent(event: OcpEventSummary) {
  const message = event.message ? redactText(event.message, 1000) : undefined;
  return {
    event: {
      ...event,
      message: message?.text ?? event.message
    },
    redactionCount: message?.redactionCount ?? 0
  };
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeWorkload(workload?: string) {
  return workload?.replace(/^(deployment|statefulset|daemonset|pod)\//i, "");
}

function promqlString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function inferLabelSelector(request: OpsLensIncidentAnalysisRequest) {
  if (request.evidenceHints?.labelSelector?.trim()) {
    return request.evidenceHints.labelSelector.trim();
  }

  const workload = normalizeWorkload(
    request.alert.workload ?? request.alert.resource?.name
  );
  if (!workload || request.alert.resource?.kind === "Pod") {
    return undefined;
  }

  return `app=${workload}`;
}

function stripReplicaSetHash(name: string) {
  return name.replace(/-[a-z0-9]{9,10}$/i, "");
}

function inferRemediationTarget(params: {
  resource?: OpsLensIncidentResourceEvidence;
  pods: OcpResourceSummary[];
  fallbackName?: string;
}) {
  const owner =
    params.resource?.item.metadata.ownerReferences?.find((ref) => ref.controller) ??
    params.pods[0]?.metadata.ownerReferences?.find((ref) => ref.controller) ??
    params.resource?.item.metadata.ownerReferences?.[0] ??
    params.pods[0]?.metadata.ownerReferences?.[0];

  if (owner?.kind === "ReplicaSet" && owner.name) {
    return {
      apiVersion: "apps/v1",
      kind: "Deployment",
      name: stripReplicaSetHash(owner.name),
      confidence: "medium" as const,
      evidence: [`Pod ownerReference points to ReplicaSet/${owner.name}`],
      missingEvidence: [
        "Deployment detail was not read; workload name is inferred from ReplicaSet owner"
      ]
    };
  }

  if (
    owner?.name &&
    ["Deployment", "StatefulSet", "DaemonSet"].includes(owner.kind)
  ) {
    return {
      apiVersion: owner.apiVersion || "apps/v1",
      kind: owner.kind,
      name: owner.name,
      confidence: "high" as const,
      evidence: [`Pod ownerReference points to ${owner.kind}/${owner.name}`],
      missingEvidence: []
    };
  }

  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    name: params.fallbackName ?? "unknown-workload",
    confidence: "low" as const,
    evidence: ["No controller ownerReference was available for remediation target"],
    missingEvidence: [
      "owning workload was not confirmed from Pod ownerReferences"
    ]
  };
}

function getContainerSpecs(spec: unknown): Array<Record<string, unknown>> {
  if (!isRecord(spec) || !Array.isArray(spec.containers)) {
    return [];
  }
  return spec.containers.filter(isRecord);
}

function inferContainerName(spec: unknown, requested?: string) {
  if (requested?.trim()) {
    return requested.trim();
  }

  const firstContainer = getContainerSpecs(spec)[0];
  return typeof firstContainer?.name === "string" ? firstContainer.name : "api";
}

function inferMemoryLimit(spec: unknown, containerName: string) {
  const container =
    getContainerSpecs(spec).find((item) => item.name === containerName) ??
    getContainerSpecs(spec)[0];
  if (!container || !isRecord(container.resources)) {
    return undefined;
  }
  const limits = container.resources.limits;
  if (!isRecord(limits) || typeof limits.memory !== "string") {
    return undefined;
  }
  return limits.memory;
}

async function capture<T>(
  source: string,
  errors: OpsLensIncidentAnalysisResponse["errors"],
  missingEvidence: string[],
  read: () => Promise<T>
) {
  try {
    return await read();
  } catch (error) {
    const message = compactError(error);
    errors.push({ source, message });
    missingEvidence.push(`${source}: ${message}`);
    return undefined;
  }
}

function toResourceEvidence(
  detail: Awaited<ReturnType<typeof getOcpResource>> | undefined
): OpsLensIncidentResourceEvidence | undefined {
  if (!detail) {
    return undefined;
  }

  return {
    resource: detail.resource,
    item: detail.item,
    fallback: detail.fallback,
    accessEvidence: detail.access.get?.evidence ?? [],
    sensitiveFieldRedactionCount: detail.redaction.sensitiveFieldRedactionCount
  };
}

function toLogEvidence(
  logs: Awaited<ReturnType<typeof getOcpPodLogs>> | undefined,
  sinceSeconds: number
): OpsLensIncidentLogEvidence | undefined {
  if (!logs) {
    return undefined;
  }

  const redacted = redactText(logs.logs);
  return {
    namespace: logs.namespace,
    pod: logs.pod,
    container: logs.container,
    previous: logs.previous,
    tailLines: logs.tailLines,
    sinceSeconds,
    logs: redacted.text,
    truncated: logs.truncated || redacted.truncated,
    redacted: true,
    redactionCount: redacted.redactionCount,
    accessEvidence: logs.access.evidence
  };
}

function toEventEvidence(
  events: Awaited<ReturnType<typeof listOcpEvents>> | undefined
): OpsLensIncidentEventEvidence | undefined {
  if (!events) {
    return undefined;
  }

  const redacted = events.items.map(redactEvent);
  return {
    target: events.target,
    items: redacted.map((entry) => entry.event),
    redacted: true,
    redactionCount: redacted.reduce(
      (count, entry) => count + entry.redactionCount,
      0
    ),
    accessEvidence: events.access.evidence
  };
}

async function collectMetricEvidence(params: {
  alertName: string;
  namespace?: string;
  podName?: string;
  windowMinutes: number;
  since: Date;
  until: Date;
  missingEvidence: string[];
  errors: OpsLensIncidentAnalysisResponse["errors"];
  evidence: string[];
  ocpReads: string[];
}): Promise<OpsLensIncidentMetricEvidence> {
  const window = `${params.windowMinutes}m`;
  const queries = [
    {
      name: "firing-alert",
      query: `ALERTS{alertstate="firing",alertname="${promqlString(params.alertName)}"${
        params.namespace ? `,namespace="${promqlString(params.namespace)}"` : ""
      }}`
    },
    ...(params.namespace && params.podName
      ? [
          {
            name: "pod-restarts",
            query:
              `sum by (namespace,pod) (increase(kube_pod_container_status_restarts_total{namespace="${promqlString(
                params.namespace
              )}",pod="${promqlString(params.podName)}"}[${window}]))`
          },
          {
            name: "pod-cpu",
            query:
              `sum by (namespace,pod) (rate(container_cpu_usage_seconds_total{namespace="${promqlString(
                params.namespace
              )}",pod="${promqlString(
                params.podName
              )}",container!="",container!="POD"}[${window}]))`
          },
          {
            name: "pod-memory",
            query:
              `sum by (namespace,pod) (container_memory_working_set_bytes{namespace="${promqlString(
                params.namespace
              )}",pod="${promqlString(
                params.podName
              )}",container!="",container!="POD"})`
          }
        ]
      : [])
  ];

  const results: OpsLensIncidentMetricEvidence["queries"] = [];

  for (const query of queries) {
    try {
      const response = await queryOcpPrometheus({
        query: query.query,
        range:
          query.name === "pod-memory"
            ? {
                start: params.since,
                end: params.until,
                stepSeconds: 30
              }
            : undefined,
        timeoutMs: 2000
      });

      if (!response.enabled) {
        params.missingEvidence.push(`metrics/${query.name}: ${response.error}`);
      } else if (!response.reachable) {
        params.errors.push({
          source: `metrics/${query.name}`,
          message: response.error ?? "Prometheus query failed"
        });
        params.missingEvidence.push(
          `metrics/${query.name}: ${response.error ?? "Prometheus query failed"}`
        );
      } else {
        params.ocpReads.push(`prometheus ${query.name}`);
        params.evidence.push(`Prometheus metric query ${query.name} succeeded`);
      }

      results.push({
        name: query.name,
        query: query.query,
        enabled: response.enabled,
        reachable: response.reachable,
        resultType: response.resultType,
        sample: response.results,
        error: response.error,
        evidence: response.evidence
      });
    } catch (error) {
      const message = compactError(error);
      params.errors.push({ source: `metrics/${query.name}`, message });
      params.missingEvidence.push(`metrics/${query.name}: ${message}`);
      results.push({
        name: query.name,
        query: query.query,
        enabled: true,
        reachable: false,
        sample: [],
        error: message,
        evidence: ["Prometheus metric query failed before response parsing"]
      });
    }
  }

  return {
    enabled: results.some((result) => result.enabled),
    reachable: results.some((result) => result.reachable),
    windowMinutes: params.windowMinutes,
    redacted: true,
    queries: results,
    evidence: unique(results.flatMap((result) => result.evidence))
  };
}

export async function analyzeOpsLensIncident(
  request: OpsLensIncidentAnalysisRequest
): Promise<OpsLensIncidentAnalysisResponse> {
  assertIncidentRequest(request);

  const startedAt = Date.now();
  const requestId = `incident-${randomUUID()}`;
  const now = new Date();
  const windowMinutes = Math.min(Math.max(request.windowMinutes ?? 10, 1), 60);
  const sinceSeconds = windowMinutes * 60;
  const since = new Date(now.getTime() - sinceSeconds * 1000);
  const namespace =
    request.alert.resource?.namespace ?? request.alert.namespace ?? undefined;
  const workload = normalizeWorkload(
    request.alert.workload ?? request.alert.resource?.name
  );
  const tailLines = Math.min(
    Math.max(request.evidenceHints?.tailLines ?? 200, 10),
    2000
  );
  const errors: OpsLensIncidentAnalysisResponse["errors"] = [];
  const missingEvidence: string[] = [];
  const ocpReads: string[] = [];
  const evidence: string[] = [
    "incident analysis runs read-only OpenShift API requests only",
    `log query uses sinceSeconds=${sinceSeconds} for the last ${windowMinutes} minutes`
  ];

  const resourceInput = request.alert.resource;
  const resourceDetail =
    resourceInput?.name
      ? await capture("resource detail", errors, missingEvidence, async () => {
          const detail = await getOcpResource({
            apiVersion: resourceInput.apiVersion,
            kind: resourceInput.kind,
            resource: resourceInput.resource,
            namespace,
            name: resourceInput.name,
            full: true
          });
          ocpReads.push(`get ${detail.resource.apiVersion}/${detail.resource.name}`);
          evidence.push(
            `${detail.resource.kind}/${detail.name} detail read through SelfSubjectAccessReview`
          );
          return detail;
        })
      : undefined;

  const labelSelector = inferLabelSelector(request);
  const podFieldSelector =
    request.evidenceHints?.fieldSelector ??
    (request.evidenceHints?.podName ? `metadata.name=${request.evidenceHints.podName}` : undefined);
  const podList = await capture("pod candidates", errors, missingEvidence, async () => {
    const list = await listOcpResource({
      apiVersion: "v1",
      resource: "pods",
      namespace,
      labelSelector,
      fieldSelector: podFieldSelector,
      limit: 5,
      full: false
    });
    ocpReads.push("list v1/pods");
    evidence.push(
      `pod candidates listed with ${labelSelector ? `labelSelector=${labelSelector}` : "no label selector"}`
    );
    return list;
  });

  const podCandidates: OcpResourceSummary[] = podList?.items ?? [];
  const podName =
    request.evidenceHints?.podName ??
    (resourceInput?.kind === "Pod" ? resourceInput.name : undefined) ??
    podCandidates[0]?.metadata.name;
  const podNamespace = namespace ?? podCandidates[0]?.metadata.namespace;

  if (!podName || !podNamespace) {
    missingEvidence.push("pod logs: no pod candidate was available");
  }

  const podLogs =
    podName && podNamespace
      ? await capture("pod logs", errors, missingEvidence, async () => {
          const logs = await getOcpPodLogs({
            namespace: podNamespace,
            pod: podName,
            container: request.evidenceHints?.container,
            tailLines,
            sinceSeconds
          });
          ocpReads.push("get v1/pods/log");
          evidence.push(`${podNamespace}/${podName} logs read for last ${windowMinutes} minutes`);
          return logs;
        })
      : undefined;

  const previousPodLogs =
    podName && podNamespace
      ? await capture("previous pod logs", errors, missingEvidence, async () => {
          const logs = await getOcpPodLogs({
            namespace: podNamespace,
            pod: podName,
            container: request.evidenceHints?.container,
            previous: true,
            tailLines: Math.min(tailLines, 100),
            sinceSeconds
          });
          ocpReads.push("get v1/pods/log?previous=true");
          evidence.push(`${podNamespace}/${podName} previous logs read when available`);
          return logs;
        })
      : undefined;

  const eventsName = podName ?? resourceInput?.name ?? workload;
  const eventResult =
    eventsName
      ? await capture("events", errors, missingEvidence, async () => {
          const events = await listOcpEvents({
            apiVersion: resourceInput?.apiVersion ?? "v1",
            kind: resourceInput?.kind ?? (podName ? "Pod" : undefined),
            namespace: podNamespace ?? namespace,
            name: eventsName,
            limit: 100
          });
          ocpReads.push("list v1/events");
          evidence.push(`events listed for ${eventsName}`);
          return events;
        })
      : undefined;

  const logEvidence = toLogEvidence(podLogs, sinceSeconds);
  const previousLogEvidence = toLogEvidence(previousPodLogs, sinceSeconds);
  const eventEvidence = toEventEvidence(eventResult);
  const metricEvidence = await collectMetricEvidence({
    alertName: request.alert.name,
    namespace: podNamespace ?? namespace,
    podName,
    windowMinutes,
    since,
    until: now,
    missingEvidence,
    errors,
    evidence,
    ocpReads
  });
  const redactionCount =
    redactText(JSON.stringify(request)).redactionCount +
    (logEvidence?.redactionCount ?? 0) +
    (previousLogEvidence?.redactionCount ?? 0) +
    (eventEvidence?.redactionCount ?? 0);
  const resourceEvidence = toResourceEvidence(resourceDetail);
  const containerName = inferContainerName(
    resourceEvidence?.item.spec,
    request.evidenceHints?.container
  );
  const observedMemoryLimit = inferMemoryLimit(
    resourceEvidence?.item.spec,
    containerName
  );
  const remediationTarget = inferRemediationTarget({
    resource: resourceEvidence,
    pods: podCandidates,
    fallbackName: workload ?? podName ?? resourceInput?.name
  });

  const analysisPrompt = [
    request.question ?? "alert-triggered OpenShift incident analysis",
    `alert=${request.alert.name}`,
    `namespace=${namespace ?? "unknown"}`,
    `workload=${workload ?? "unknown"}`,
    `window=${windowMinutes}m`,
    `readEvidence=${evidence.join("; ")}`,
    `metricEvidence=${metricEvidence.queries
      .map((query) => `${query.name}:${query.reachable ? "reachable" : "missing"}`)
      .join("; ")}`,
    `missingEvidence=${missingEvidence.join("; ")}`
  ].join("\n");

  const baseAnalysis = await createOpsLensToolResponse({
    tool: "propose_remediation",
    input: {
      clusterId: request.clusterId,
      tenantId: request.tenantId,
      namespace,
      workload,
      question: analysisPrompt,
      intent: "alert-triggered-incident-analysis",
      alertName: request.alert.name,
      constraints: {
        readOnly: true,
        includeCustomerRunbooks: true,
        maxDocuments: 3
      }
    },
    caller: request.caller ?? {
      source: "api"
    }
  });
  const remediationProposal = createPlanOnlyRemediationProposal({
    namespace: podNamespace ?? namespace ?? "unknown",
    workload: remediationTarget.name,
    targetApiVersion: remediationTarget.apiVersion,
    targetKind: remediationTarget.kind,
    targetName: remediationTarget.name,
    targetConfidence: remediationTarget.confidence,
    container: containerName,
    currentValue: observedMemoryLimit ?? "unknown",
    currentValueSource: observedMemoryLimit ? "cluster-observed" : "unknown",
    currentValueObservedInCluster: Boolean(observedMemoryLimit),
    evidence: unique([
      ...evidence,
      ...ocpReads,
      ...remediationTarget.evidence
    ]),
    missingEvidence: unique([
      ...missingEvidence,
      ...remediationTarget.missingEvidence,
      ...(observedMemoryLimit
        ? []
        : [`${containerName} container memory limit was not observed in resource detail`])
    ]),
    risks: baseAnalysis.risks,
    rollbackPath: baseAnalysis.rollbackPath
  });

  const analysis = {
    ...baseAnalysis,
    summary:
      `${request.alert.name} alert에 대해 최근 ${windowMinutes}분의 read-only OCP evidence와 Cywell private RAG를 결합했습니다.`,
    recommendedSteps: unique([
      `최근 ${windowMinutes}분 Pod 로그, 이벤트, 리소스 상태를 같은 화면에서 비교한다.`,
      "Prometheus metric correlation이 없거나 실패한 경우 metric missingEvidence를 별도 표시한다.",
      "읽지 못한 evidence는 missingEvidence에 남기고 추정 답변으로 대체하지 않는다.",
      "YAML 변경안은 plan-only review artifact로만 다루고 자동 apply/delete/scale은 수행하지 않는다.",
      ...baseAnalysis.recommendedSteps
    ]),
    proposedYamlPatch: remediationProposal.yamlPatch,
    remediationProposal,
    missingEvidence: unique([...baseAnalysis.missingEvidence, ...missingEvidence]),
    evidence: unique([...baseAnalysis.evidence, ...evidence, ...ocpReads]),
    audit: {
      ...baseAnalysis.audit,
      sources: unique([...baseAnalysis.audit.sources, ...ocpReads]),
      redactionCount: baseAnalysis.audit.redactionCount + redactionCount
    }
  };

  return {
    requestId,
    generatedAt: now.toISOString(),
    actionMode: "planOnly",
    clusterId: request.clusterId,
    tenantId: request.tenantId,
    alert: request.alert,
    timeWindow: {
      minutes: windowMinutes,
      since: since.toISOString(),
      until: now.toISOString()
    },
    resource: resourceEvidence,
    podCandidates,
    podLogs: logEvidence,
    previousPodLogs: previousLogEvidence,
    events: eventEvidence,
    metrics: metricEvidence,
    analysis,
    missingEvidence: unique(missingEvidence),
    evidence: unique(evidence),
    errors,
    policy: {
      readOnly: true,
      planOnly: true,
      mutationAllowed: false,
      secretFetchBlocked: true,
      rawDocumentReturned: false,
      serverSideRedaction: true,
      logWindowMinutes: windowMinutes,
      maxLogTailLines: tailLines,
      monitoringProxyEnabled: metricEvidence.enabled
    },
    audit: {
      tenantId: request.tenantId,
      clusterId: request.clusterId,
      namespace,
      user: request.caller?.user,
      ocpReads: unique(ocpReads),
      redactionCount,
      latencyMs: Math.max(1, Date.now() - startedAt)
    }
  };
}

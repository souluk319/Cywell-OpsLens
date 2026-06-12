import type {
  KubernetesObject,
  LightspeedReconcilePlan,
  OLSConfig,
  OlsMcpServer,
  OpsLensInstallation,
  OpsLensReconcilePlan,
  OpsLensReconcileStatus
} from "./types.js";

const defaultNamespace = "cywell-opslens";
const appName = "cywell-opslens";

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function stable(value: unknown) {
  return JSON.stringify(value, Array.from(flattenKeys(value)).sort());
}

function flattenKeys(value: unknown, keys = new Set<string>()) {
  if (Array.isArray(value)) {
    for (const item of value) {
      flattenKeys(item, keys);
    }
    return keys;
  }

  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      keys.add(key);
      flattenKeys(nested, keys);
    }
  }
  return keys;
}

function namespaceFor(installation: OpsLensInstallation) {
  return installation.spec.targetNamespace ?? installation.metadata.namespace ?? defaultNamespace;
}

function labels(component: string) {
  return {
    "app.kubernetes.io/name": appName,
    "app.kubernetes.io/component": component
  };
}

function normalizeRagSettings(installation: OpsLensInstallation) {
  const documentIntake = installation.spec.rag?.documentIntake;
  const approvalQueue = installation.spec.rag?.approvalQueue;
  const mode = documentIntake?.mode ?? "ValidateOnly";
  const evidenceExport: "enabled" | "disabled" =
    documentIntake?.evidenceExport !== false ? "enabled" : "disabled";
  const rawDocumentReturnRequested = documentIntake?.rawDocumentReturnAllowed === true;
  const rawDocumentReturnAllowed = false;
  const approvalQueueMode: "DesignOnly" | "Disabled" = approvalQueue?.mode ?? "DesignOnly";
  const enqueueRequested = approvalQueue?.enqueueAllowed === true;
  const enqueueAllowed = false;
  const requiredApprovals = approvalQueue?.requiredApprovals?.length
    ? approvalQueue.requiredApprovals
    : ["rag-owner", "cluster-sre"];

  return {
    documentIntakeMode: mode,
    evidenceExport,
    rawDocumentReturnAllowed,
    rawDocumentReturnRequested,
    approvalQueueMode,
    enqueueAllowed,
    enqueueRequested,
    requiredApprovals,
    env: {
      documentIntakeMode: mode === "ValidateOnly" ? "validate-only" : mode,
      evidenceExport,
      rawDocumentReturnAllowed: String(rawDocumentReturnAllowed),
      approvalQueueMode: approvalQueueMode === "DesignOnly" ? "design-only" : "disabled",
      approvalQueueEnqueueAllowed: String(enqueueAllowed),
      requiredApprovals: requiredApprovals.join(",")
    }
  };
}

function service(name: string, namespace: string, component: string, ports: unknown[]): KubernetesObject {
  return {
    apiVersion: "v1",
    kind: "Service",
    metadata: {
      name,
      namespace,
      labels: labels(component)
    },
    spec: {
      selector: labels(component),
      ports
    }
  };
}

function deployment(
  name: string,
  namespace: string,
  component: string,
  image: string,
  replicas: number,
  container: Record<string, unknown>
): KubernetesObject {
  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      name,
      namespace,
      labels: labels(component)
    },
    spec: {
      replicas,
      selector: {
        matchLabels: labels(component)
      },
      template: {
        metadata: {
          labels: labels(component)
        },
        spec: {
          serviceAccountName: component === "api" ? "cywell-opslens-api" : undefined,
          containers: [
            {
              name: component,
              image,
              imagePullPolicy: "IfNotPresent",
              ...container
            }
          ]
        }
      }
    }
  };
}

export function buildOpsLensResources(installation: OpsLensInstallation): KubernetesObject[] {
  const namespace = namespaceFor(installation);
  const api = installation.spec.components.api;
  const dashboard = installation.spec.components.dashboard;
  const vector = installation.spec.components.vectorStore;
  const runtime = installation.spec.components.modelRuntime;
  const rag = normalizeRagSettings(installation);
  const apiServiceName = api.serviceName ?? "cywell-opslens-api";
  const dashboardServiceName = dashboard.serviceName ?? "cywell-opslens-dashboard";
  const vectorImage = vector.image ?? "docker.io/qdrant/qdrant:v1.12.1";
  const runtimeImage = runtime.image ?? "quay.io/cywell/opslens-vllm:0.1.0";
  const resources: KubernetesObject[] = [
    {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: {
        name: namespace,
        labels: {
          "app.kubernetes.io/name": appName
        }
      }
    },
    {
      apiVersion: "v1",
      kind: "ServiceAccount",
      metadata: {
        name: "cywell-opslens-api",
        namespace,
        labels: labels("api")
      }
    },
    {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: {
        name: "cywell-opslens-rag-policy",
        namespace,
        labels: labels("rag-policy"),
        annotations: {
          "opslens.cywell.io/document-intake": "validate-only",
          "opslens.cywell.io/approval-queue": "design-only"
        }
      },
      data: {
        documentIntakeMode: rag.env.documentIntakeMode,
        evidenceExport: rag.env.evidenceExport,
        rawDocumentReturnAllowed: rag.env.rawDocumentReturnAllowed,
        approvalQueueMode: rag.env.approvalQueueMode,
        approvalQueueEnqueueAllowed: rag.env.approvalQueueEnqueueAllowed,
        requiredApprovals: rag.env.requiredApprovals
      }
    },
    deployment(apiServiceName, namespace, "api", api.image, api.replicas ?? 2, {
      env: [
        {
          name: "CYWELL_OPSLENS_VECTOR_URL",
          value: "http://cywell-opslens-vector:6333"
        },
        {
          name: "CYWELL_OPSLENS_MODEL_URL",
          value: "http://cywell-opslens-vllm:8000"
        },
        {
          name: "CYWELL_OPSLENS_ACTION_MODE",
          value: "plan-only"
        },
        {
          name: "CYWELL_OPSLENS_RAG_DOCUMENT_INTAKE_MODE",
          value: rag.env.documentIntakeMode
        },
        {
          name: "CYWELL_OPSLENS_RAG_EVIDENCE_EXPORT",
          value: rag.env.evidenceExport
        },
        {
          name: "CYWELL_OPSLENS_RAG_RAW_DOCUMENT_RETURN_ALLOWED",
          value: rag.env.rawDocumentReturnAllowed
        },
        {
          name: "CYWELL_OPSLENS_RAG_APPROVAL_QUEUE_MODE",
          value: rag.env.approvalQueueMode
        },
        {
          name: "CYWELL_OPSLENS_RAG_APPROVAL_QUEUE_ENQUEUE_ALLOWED",
          value: rag.env.approvalQueueEnqueueAllowed
        },
        {
          name: "CYWELL_OPSLENS_RAG_REQUIRED_APPROVALS",
          value: rag.env.requiredApprovals
        }
      ],
      ports: [
        {
          name: "http",
          containerPort: 8080
        }
      ],
      resources: api.resources
    }),
    service(apiServiceName, namespace, "api", [
      {
        name: "http",
        port: 80,
        targetPort: "http"
      },
      {
        name: "mcp",
        port: 443,
        targetPort: "http"
      }
    ]),
    deployment(
      dashboardServiceName,
      namespace,
      "dashboard",
      dashboard.image,
      dashboard.replicas ?? 1,
      {
        ports: [
          {
            name: "http",
            containerPort: 8080
          }
        ]
      }
    ),
    service(dashboardServiceName, namespace, "dashboard", [
      {
        name: "http",
        port: 80,
        targetPort: "http"
      }
    ]),
    {
      apiVersion: "apps/v1",
      kind: "StatefulSet",
      metadata: {
        name: "cywell-opslens-vector",
        namespace,
        labels: labels("vector-store")
      },
      spec: {
        serviceName: "cywell-opslens-vector",
        replicas: 1,
        selector: {
          matchLabels: labels("vector-store")
        },
        template: {
          metadata: {
            labels: labels("vector-store")
          },
          spec: {
            containers: [
              {
                name: vector.provider === "pgvector" ? "pgvector" : "qdrant",
                image: vectorImage,
                imagePullPolicy: "IfNotPresent",
                ports: [
                  {
                    name: "http",
                    containerPort: vector.provider === "pgvector" ? 5432 : 6333
                  }
                ],
                volumeMounts: [
                  {
                    name: "vector-data",
                    mountPath: vector.provider === "pgvector" ? "/var/lib/postgresql/data" : "/qdrant/storage"
                  }
                ]
              }
            ]
          }
        },
        volumeClaimTemplates: [
          {
            metadata: {
              name: "vector-data"
            },
            spec: {
              accessModes: ["ReadWriteOnce"],
              resources: {
                requests: {
                  storage: vector.storageSize ?? "20Gi"
                }
              }
            }
          }
        ]
      }
    },
    service("cywell-opslens-vector", namespace, "vector-store", [
      {
        name: "http",
        port: vector.provider === "pgvector" ? 5432 : 6333,
        targetPort: "http"
      }
    ]),
    deployment("cywell-opslens-vllm", namespace, "model-runtime", runtimeImage, runtime.replicas ?? 1, {
      args: ["--model", runtime.model],
      ports: [
        {
          name: "http",
          containerPort: 8000
        }
      ],
      resources:
        runtime.gpu?.enabled === false
          ? undefined
          : {
              limits: {
                [runtime.gpu?.deviceClass ?? "nvidia.com/gpu"]: String(runtime.gpu?.count ?? 1)
              }
            }
    }),
    service("cywell-opslens-vllm", namespace, "model-runtime", [
      {
        name: "http",
        port: 8000,
        targetPort: "http"
      }
    ])
  ];

  if (installation.spec.consolePlugin?.enabled !== false) {
    resources.push({
      apiVersion: "console.openshift.io/v1",
      kind: "ConsolePlugin",
      metadata: {
        name: installation.spec.consolePlugin?.name ?? "cywell-opslens",
        labels: labels("console-plugin")
      },
      spec: {
        displayName: "Cywell OpsLens",
        service: {
          name: dashboardServiceName,
          namespace,
          port: 80,
          basePath: "/"
        },
        proxy: [
          {
            alias: "opslens-api",
            service: {
              name: apiServiceName,
              namespace,
              port: 80
            },
            authorize: true
          }
        ]
      }
    });
  }

  return resources;
}

export function desiredMcpServer(installation: OpsLensInstallation): OlsMcpServer {
  const registration = installation.spec.lightspeedRegistration;
  const headers: OlsMcpServer["headers"] = [];

  if (registration.userTokenForwarding !== false) {
    headers.push({
      name: "Authorization",
      valueFrom: {
        type: "kubernetes"
      }
    });
  }

  if (registration.apiKeySecretName) {
    headers.push({
      name: "X-Cywell-Api-Key",
      valueFrom: {
        type: "secret",
        secretRef: {
          name: registration.apiKeySecretName
        }
      }
    });
  }

  return {
    name: registration.mcpServerName ?? "cywell-opslens",
    url:
      registration.endpoint ??
      `https://cywell-opslens-api.${namespaceFor(installation)}.svc.cluster.local/mcp`,
    timeout: 30,
    headers
  };
}

export function planLightspeedRegistration(
  installation: OpsLensInstallation,
  currentOlsConfig?: OLSConfig
): LightspeedReconcilePlan {
  const registration = installation.spec.lightspeedRegistration;
  const mode = registration.mode ?? "ValidateOnly";
  const namespace = registration.olsConfigNamespace ?? "openshift-lightspeed";
  const name = registration.olsConfigName ?? "cluster";
  const desiredServer = desiredMcpServer(installation);
  const target = {
    name,
    namespace,
    mcpServerName: desiredServer.name,
    endpoint: desiredServer.url
  };
  const evidence = [
    `target OLSConfig ${namespace}/${name}`,
    `registration mode ${mode}`,
    `desired MCP server ${desiredServer.name} -> ${desiredServer.url}`
  ];
  const missingEvidence: string[] = [];
  const risk = [
    "OpenShift Lightspeed MCP is Technology Preview; do not use this path as the only production support channel.",
    "MCP tool responses must remain server-side redacted because OLS query filters do not guarantee protection for returned tool content.",
    "Operator-triggered OLSConfig patching must be explicit and auditable through OpsLensInstallation.spec.lightspeedRegistration.mode."
  ];
  const rollbackPath = [
    `restore previous OLSConfig ${namespace}/${name} spec.featureGates and spec.mcpServers from GitOps or cluster backup`,
    `remove the ${desiredServer.name} mcpServers entry if OpsLens is uninstalled`,
    "rerun Lightspeed MCP smoke verification after rollback"
  ];

  if (!desiredServer.url.endsWith("/mcp")) {
    missingEvidence.push("lightspeedRegistration.endpoint must end with /mcp");
    return {
      mode,
      phase: "Invalid",
      mutationAllowed: false,
      willPatch: false,
      target,
      desiredServer,
      evidence,
      missingEvidence,
      risk,
      rollbackPath
    };
  }

  if (!currentOlsConfig) {
    missingEvidence.push(`current OLSConfig ${namespace}/${name} is not readable`);
    return {
      mode,
      phase: "MissingOLSConfig",
      mutationAllowed: false,
      willPatch: false,
      target,
      desiredServer,
      evidence,
      missingEvidence,
      risk,
      rollbackPath
    };
  }

  const currentFeatureGates = currentOlsConfig.spec?.featureGates ?? [];
  const currentServers = currentOlsConfig.spec?.mcpServers ?? [];
  const otherServers = currentServers.filter((server) => server.name !== desiredServer.name);
  const existingServer = currentServers.find((server) => server.name === desiredServer.name);
  const desiredFeatureGates = unique([...currentFeatureGates, "MCPServer"]);
  const desiredServers = [...otherServers, desiredServer];
  const patch = {
    spec: {
      featureGates: desiredFeatureGates,
      mcpServers: desiredServers
    }
  };
  const currentComparable = {
    featureGates: currentFeatureGates,
    mcpServers: currentServers
  };
  const desiredComparable = {
    featureGates: desiredFeatureGates,
    mcpServers: desiredServers
  };
  const changed = stable(currentComparable) !== stable(desiredComparable);

  if (!currentFeatureGates.includes("MCPServer")) {
    missingEvidence.push("current OLSConfig does not enable MCPServer feature gate");
  }

  if (!existingServer) {
    missingEvidence.push(`current OLSConfig does not contain ${desiredServer.name} MCP server`);
  } else if (stable(existingServer) !== stable(desiredServer)) {
    missingEvidence.push(`current ${desiredServer.name} MCP server differs from desired endpoint or headers`);
  }

  if (mode === "ValidateOnly") {
    return {
      mode,
      phase: changed ? "NeedsPatch" : "Ready",
      mutationAllowed: false,
      willPatch: false,
      target,
      desiredServer,
      evidence: [
        ...evidence,
        "ValidateOnly mode computed desired OLSConfig state but will not patch the cluster"
      ],
      missingEvidence,
      risk,
      rollbackPath: ["no cluster mutation is performed in ValidateOnly mode", ...rollbackPath]
    };
  }

  return {
    mode,
    phase: changed ? "PatchPlanned" : "Ready",
    mutationAllowed: true,
    willPatch: changed,
    target,
    desiredServer,
    strategicMergePatch: patch,
    evidence: [
      ...evidence,
      changed
        ? "PatchOLSConfig mode produced a strategic merge patch for spec.featureGates and spec.mcpServers"
        : "current OLSConfig already matches the desired OpsLens MCP registration"
    ],
    missingEvidence,
    risk,
    rollbackPath
  };
}

function buildStatus(
  installation: OpsLensInstallation,
  lightspeed: LightspeedReconcilePlan
): OpsLensReconcileStatus {
  const api = installation.spec.components.api;
  const dashboard = installation.spec.components.dashboard;
  const runtime = installation.spec.components.modelRuntime;
  const rag = normalizeRagSettings(installation);
  const blocked = lightspeed.phase === "Invalid" || lightspeed.phase === "MissingOLSConfig";

  return {
    phase: blocked ? "Blocked" : lightspeed.phase === "PatchPlanned" ? "Installing" : "Ready",
    conditions: [
      {
        type: "LightspeedRegistration",
        status: blocked ? "False" : "True",
        reason: lightspeed.phase,
        message:
          lightspeed.missingEvidence.length > 0
            ? lightspeed.missingEvidence.join("; ")
            : `Lightspeed registration is ${lightspeed.phase}`
      },
      {
        type: "AssistantSafety",
        status: "True",
        reason: "PlanOnly",
        message: "Assistant actions remain read-only or plan-only; Operator patching is limited to explicit install reconciliation."
      },
      {
        type: "RagDocumentIntake",
        status: rag.rawDocumentReturnRequested ? "False" : "True",
        reason: "ValidateOnly",
        message: rag.rawDocumentReturnRequested
          ? "RAG raw document return is disabled in MVP 0.1."
          : "RAG document intake is validate-only and raw document return is disabled."
      },
      {
        type: "RagApprovalQueue",
        status: rag.enqueueRequested ? "False" : "True",
        reason: rag.approvalQueueMode,
        message: rag.enqueueRequested
          ? "RAG approval queue enqueue is disabled in MVP 0.1."
          : "RAG document intake is validate-only; evidence export is allowed and approval queue mutation is disabled."
      }
    ],
    components: {
      api: {
        ready: true,
        service: api.serviceName ?? "cywell-opslens-api",
        image: api.image
      },
      dashboard: {
        ready: true,
        service: dashboard.serviceName ?? "cywell-opslens-dashboard",
        image: dashboard.image
      },
      vectorStore: {
        ready: true
      },
      modelRuntime: {
        ready: true,
        image: runtime.image
      }
    },
    lightspeedRegistration: {
      phase: lightspeed.phase,
      evidence: lightspeed.evidence
    },
    rag: {
      documentIntake: {
        mode: "ValidateOnly",
        evidenceExport: rag.evidenceExport,
        rawDocumentReturnAllowed: false
      },
      approvalQueue: {
        phase: rag.approvalQueueMode,
        enqueueAllowed: false,
        evidence: [
          "RAG document upload is validate-only in MVP 0.1",
          "RAG evidence export is allowed for audit-safe artifacts",
          "approval queue enqueue and durable ingestion are disabled"
        ]
      }
    }
  };
}

export function buildOpsLensReconcilePlan(
  installation: OpsLensInstallation,
  currentOlsConfig?: OLSConfig
): OpsLensReconcilePlan {
  const lightspeedRegistration = planLightspeedRegistration(installation, currentOlsConfig);

  return {
    actionMode: "operator-reconcile-plan",
    desiredResources: buildOpsLensResources(installation),
    lightspeedRegistration,
    statusPatch: buildStatus(installation, lightspeedRegistration),
    policy: {
      assistantMutationAllowed: false,
      operatorMutationRequiresPatchMode: true,
      mode: lightspeedRegistration.mode,
      willPatchLightspeed: lightspeedRegistration.willPatch,
      ragApprovalQueueMutationAllowed: false,
      ragRawDocumentReturnAllowed: false
    }
  };
}

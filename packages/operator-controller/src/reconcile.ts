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
const serviceServingCertAnnotation = "service.beta.openshift.io/serving-cert-secret-name";
const tlsMountPath = "/var/run/secrets/cywell-opslens/tls";
const apiTlsSecretName = "cywell-opslens-api-tls";
const dashboardTlsSecretName = "cywell-opslens-dashboard-tls";
const consoleNamespace = "openshift-console";
const lightspeedNamespace = "openshift-lightspeed";
const httpsContainerPort = 9443;
const httpsServicePort = 443;

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

function service(
  name: string,
  namespace: string,
  component: string,
  ports: unknown[],
  annotations?: Record<string, string>
): KubernetesObject {
  return {
    apiVersion: "v1",
    kind: "Service",
    metadata: {
      name,
      namespace,
      labels: labels(component),
      ...(annotations ? { annotations } : {})
    },
    spec: {
      selector: labels(component),
      ports
    }
  };
}

function namespacePeer(namespace: string) {
  return {
    namespaceSelector: {
      matchLabels: {
        "kubernetes.io/metadata.name": namespace
      }
    }
  };
}

function appPeer() {
  return {
    podSelector: {
      matchLabels: {
        "app.kubernetes.io/name": appName
      }
    }
  };
}

function ingressNetworkPolicy(
  name: string,
  namespace: string,
  component: string,
  sourceNamespaces: string[]
): KubernetesObject {
  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name,
      namespace,
      labels: labels(component)
    },
    spec: {
      podSelector: {
        matchLabels: labels(component)
      },
      policyTypes: ["Ingress"],
      ingress: [
        {
          from: [...sourceNamespaces.map(namespacePeer), appPeer()],
          ports: [
            {
              protocol: "TCP",
              port: httpsContainerPort
            }
          ]
        }
      ]
    }
  };
}

function deployment(
  name: string,
  namespace: string,
  component: string,
  image: string,
  replicas: number,
  container: Record<string, unknown>,
  podSpec: Record<string, unknown> = {}
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
          ],
          ...podSpec
        }
      }
    }
  };
}

function postgresAuthSecret(namespace: string): KubernetesObject {
  return {
    apiVersion: "v1",
    kind: "Secret",
    metadata: {
      name: "cywell-opslens-postgres-auth",
      namespace,
      labels: labels("vector-store")
    },
    type: "Opaque",
    stringData: {
      password: "<generated-by-operator>",
      url: `postgres://opslens:<generated-by-operator>@cywell-opslens-vector.${namespace}.svc.cluster.local:5432/opslens?sslmode=disable`
    }
  };
}

function cleanupResource(
  apiVersion: string,
  kind: string,
  name: string,
  namespace: string,
  component: string
): KubernetesObject {
  return {
    apiVersion,
    kind,
    metadata: {
      name,
      namespace,
      labels: labels(component),
      annotations: {
        "opslens.cywell.io/cleanup-mode": "owned-stale-runtime-only"
      }
    }
  };
}

export function buildOpsLensCleanupResources(
  installation: OpsLensInstallation
): KubernetesObject[] {
  const namespace = namespaceFor(installation);
  const vectorProvider = installation.spec.components.vectorStore.provider ?? "pgvector";
  const runtimeProvider = installation.spec.components.modelRuntime.provider ?? "vllm";
  const cleanup: KubernetesObject[] = [];

  if (vectorProvider === "inmemory") {
    cleanup.push(
      cleanupResource("apps/v1", "StatefulSet", "cywell-opslens-vector", namespace, "vector-store"),
      cleanupResource("v1", "Service", "cywell-opslens-vector", namespace, "vector-store"),
      cleanupResource("v1", "Secret", "cywell-opslens-postgres-auth", namespace, "vector-store")
    );
  }

  if (runtimeProvider === "mock-local") {
    cleanup.push(
      cleanupResource("apps/v1", "Deployment", "cywell-opslens-vllm", namespace, "model-runtime"),
      cleanupResource("v1", "Service", "cywell-opslens-vllm", namespace, "model-runtime")
    );
  }

  return cleanup;
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
  const vectorProvider = vector.provider ?? "pgvector";
  const vectorImage = vector.image ?? "docker.io/pgvector/pgvector:pg16";
  const runtimeImage = runtime.image ?? "quay.io/cywell/opslens-vllm:0.1.0";
  const apiEnv: Record<string, unknown>[] = [
    { name: "KUGNUS_API_HOST", value: "0.0.0.0" },
    { name: "KUGNUS_API_PORT", value: String(httpsContainerPort) },
    { name: "PORT", value: String(httpsContainerPort) },
    { name: "CYWELL_OPSLENS_TLS_CERT_FILE", value: `${tlsMountPath}/tls.crt` },
    { name: "CYWELL_OPSLENS_TLS_KEY_FILE", value: `${tlsMountPath}/tls.key` },
    { name: "CYWELL_OPSLENS_VECTOR_PROVIDER", value: vectorProvider }
  ];

  if (vectorProvider === "pgvector") {
    apiEnv.push({
      name: "CYWELL_OPSLENS_POSTGRES_URL",
      valueFrom: {
        secretKeyRef: {
          name: "cywell-opslens-postgres-auth",
          key: "url"
        }
      }
    });
  }

  if (runtime.provider !== "mock-local") {
    apiEnv.push({
      name: "CYWELL_OPSLENS_MODEL_URL",
      value: "http://cywell-opslens-vllm:8000"
    });
  }

  apiEnv.push(
    { name: "CYWELL_OPSLENS_RAG_RUNTIME_MODE", value: "local" },
    { name: "CYWELL_OPSLENS_ACTION_MODE", value: "plan-only" },
    { name: "CYWELL_OPSLENS_RAG_DOCUMENT_INTAKE_MODE", value: rag.env.documentIntakeMode },
    { name: "CYWELL_OPSLENS_RAG_EVIDENCE_EXPORT", value: rag.env.evidenceExport },
    { name: "CYWELL_OPSLENS_RAG_RAW_DOCUMENT_RETURN_ALLOWED", value: rag.env.rawDocumentReturnAllowed },
    { name: "CYWELL_OPSLENS_RAG_APPROVAL_QUEUE_MODE", value: rag.env.approvalQueueMode },
    { name: "CYWELL_OPSLENS_RAG_APPROVAL_QUEUE_ENQUEUE_ALLOWED", value: rag.env.approvalQueueEnqueueAllowed },
    { name: "CYWELL_OPSLENS_RAG_REQUIRED_APPROVALS", value: rag.env.requiredApprovals }
  );
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
    ...(vectorProvider === "pgvector" ? [postgresAuthSecret(namespace)] : []),
    deployment(apiServiceName, namespace, "api", api.image, api.replicas ?? 2, {
      env: apiEnv,
      ports: [
        {
          name: "https",
          containerPort: httpsContainerPort
        }
      ],
      volumeMounts: [
        {
          name: "service-serving-cert",
          mountPath: tlsMountPath,
          readOnly: true
        }
      ],
      readinessProbe: {
        httpGet: {
          path: "/healthz",
          port: "https",
          scheme: "HTTPS"
        },
        initialDelaySeconds: 5,
        periodSeconds: 10
      },
      resources: api.resources
    }, {
      volumes: [
        {
          name: "service-serving-cert",
          secret: {
            secretName: apiTlsSecretName
          }
        }
      ]
    }),
    service(apiServiceName, namespace, "api", [
      {
        name: "https",
        port: httpsServicePort,
        targetPort: "https"
      }
    ], {
      [serviceServingCertAnnotation]: apiTlsSecretName
    }),
    ingressNetworkPolicy(
      "cywell-opslens-api-ingress",
      namespace,
      "api",
      [consoleNamespace, lightspeedNamespace]
    ),
    deployment(
      dashboardServiceName,
      namespace,
      "dashboard",
      dashboard.image,
      dashboard.replicas ?? 1,
      {
        env: [
          {
            name: "HOST",
            value: "0.0.0.0"
          },
          {
            name: "PORT",
            value: String(httpsContainerPort)
          },
          {
            name: "CYWELL_OPSLENS_TLS_CERT_FILE",
            value: `${tlsMountPath}/tls.crt`
          },
          {
            name: "CYWELL_OPSLENS_TLS_KEY_FILE",
            value: `${tlsMountPath}/tls.key`
          }
        ],
        ports: [
          {
            name: "https",
            containerPort: httpsContainerPort
          }
        ],
        volumeMounts: [
          {
            name: "service-serving-cert",
            mountPath: tlsMountPath,
            readOnly: true
          }
        ],
        readinessProbe: {
          httpGet: {
            path: "/healthz",
            port: "https",
            scheme: "HTTPS"
          },
          initialDelaySeconds: 5,
          periodSeconds: 10
        }
      },
      {
        volumes: [
          {
            name: "service-serving-cert",
            secret: {
              secretName: dashboardTlsSecretName
            }
          }
        ]
      }
    ),
    service(dashboardServiceName, namespace, "dashboard", [
      {
        name: "https",
        port: httpsServicePort,
        targetPort: "https"
      }
    ], {
      [serviceServingCertAnnotation]: dashboardTlsSecretName
    }),
    ingressNetworkPolicy(
      "cywell-opslens-dashboard-ingress",
      namespace,
      "dashboard",
      [consoleNamespace]
    ),
    ...(vectorProvider === "inmemory"
      ? []
      : [
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
                      name: "pgvector",
                      image: vectorImage,
                      imagePullPolicy: "IfNotPresent",
                      env: [
                        {
                          name: "POSTGRES_DB",
                          value: "opslens"
                        },
                        {
                          name: "POSTGRES_USER",
                          value: "opslens"
                        },
                        {
                          name: "PGDATA",
                          value: "/var/lib/postgresql/data/pgdata"
                        },
                        {
                          name: "POSTGRES_PASSWORD",
                          valueFrom: {
                            secretKeyRef: {
                              name: "cywell-opslens-postgres-auth",
                              key: "password"
                            }
                          }
                        }
                      ],
                      ports: [
                        {
                          name: "postgres",
                          containerPort: 5432
                        }
                      ],
                      volumeMounts: [
                        {
                          name: "vector-data",
                          mountPath: "/var/lib/postgresql/data"
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
              name: "postgres",
              port: 5432,
              targetPort: "postgres"
            }
          ])
        ]),
    ...(runtime.provider === "mock-local"
      ? []
      : [
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
        backend: {
          type: "Service",
          service: {
            name: dashboardServiceName,
            namespace,
            port: httpsServicePort,
            basePath: "/"
          }
        },
        proxy: [
          {
            alias: "opslens-api",
            authorization: "UserToken",
            endpoint: {
              type: "Service",
              service: {
                name: apiServiceName,
                namespace,
                port: httpsServicePort
              }
            }
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
  const vector = installation.spec.components.vectorStore;
  const runtime = installation.spec.components.modelRuntime;
  const rag = normalizeRagSettings(installation);
  const blocked = lightspeed.phase === "Invalid" || lightspeed.phase === "MissingOLSConfig";
  const vectorProvider = vector.provider ?? "pgvector";
  const runtimeProvider = runtime.provider ?? "vllm";

  return {
    phase: blocked ? "Blocked" : "Installing",
    conditions: [
      {
        type: "WorkloadsAvailable",
        status: "False",
        reason: blocked ? "Blocked" : "WaitingForWorkloads",
        message: blocked
          ? "Workload readiness is blocked until the reconciliation blocker is resolved."
          : "Dry-run status does not claim workload readiness before the live controller observes Deployments and StatefulSets."
      },
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
        ready: false,
        service: api.serviceName ?? "cywell-opslens-api",
        image: api.image
      },
      dashboard: {
        ready: false,
        service: dashboard.serviceName ?? "cywell-opslens-dashboard",
        image: dashboard.image
      },
      vectorStore: {
        ready: vectorProvider === "inmemory",
        service: vectorProvider === "inmemory" ? "inmemory" : "cywell-opslens-vector",
        image: vector.image
      },
      modelRuntime: {
        ready: runtimeProvider === "mock-local",
        service: runtimeProvider === "mock-local" ? "mock-local" : "cywell-opslens-vllm",
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
    cleanupResources: buildOpsLensCleanupResources(installation),
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

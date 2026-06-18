export type LightspeedRegistrationMode = "ValidateOnly" | "PatchOLSConfig";

export interface KubernetesObject {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: Record<string, unknown>;
  data?: Record<string, string>;
  stringData?: Record<string, string>;
  type?: string;
}

export interface OpsLensInstallation {
  apiVersion: "opslens.cywell.io/v1alpha1";
  kind: "OpsLensInstallation";
  metadata: {
    name: string;
    namespace?: string;
  };
  spec: {
    version: string;
    targetNamespace?: string;
    components: {
      api: {
        image: string;
        replicas?: number;
        serviceName?: string;
        resources?: Record<string, unknown>;
      };
      dashboard: {
        image: string;
        replicas?: number;
        serviceName?: string;
      };
      vectorStore: {
        provider: "pgvector" | "inmemory";
        image?: string;
        storageSize?: string;
      };
      modelRuntime: {
        provider: "vllm" | "external" | "mock-local";
        image?: string;
        model: string;
        replicas?: number;
        gpu?: {
          enabled?: boolean;
          deviceClass?: string;
          count?: number;
        };
      };
    };
    lightspeedRegistration: {
      mode?: LightspeedRegistrationMode;
      olsConfigName?: string;
      olsConfigNamespace?: string;
      mcpServerName?: string;
      apiKeySecretName?: string;
      userTokenForwarding?: boolean;
      endpoint?: string;
    };
    rag?: {
      documentIntake?: {
        mode?: "ValidateOnly";
        evidenceExport?: boolean;
        rawDocumentReturnAllowed?: boolean;
      };
      approvalQueue?: {
        mode?: "DesignOnly" | "Disabled";
        enqueueAllowed?: boolean;
        requiredApprovals?: string[];
      };
    };
    consolePlugin?: {
      enabled?: boolean;
      name?: string;
    };
  };
}

export interface OlsMcpHeader {
  name: string;
  valueFrom: {
    type: "kubernetes" | "secret" | "client";
    secretRef?: {
      name: string;
    };
  };
}

export interface OlsMcpServer {
  name: string;
  url: string;
  timeout: number;
  headers: OlsMcpHeader[];
}

export interface OLSConfig {
  apiVersion: "ols.openshift.io/v1alpha1";
  kind: "OLSConfig";
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: {
    featureGates?: string[];
    mcpServers?: OlsMcpServer[];
    [key: string]: unknown;
  };
}

export interface ConsoleOperatorConfig {
  apiVersion: "operator.openshift.io/v1";
  kind: "Console";
  metadata: {
    name: "cluster";
  };
  spec?: {
    plugins?: string[];
    [key: string]: unknown;
  };
}

export interface LightspeedReconcilePlan {
  mode: LightspeedRegistrationMode;
  phase: "Ready" | "NeedsPatch" | "PatchPlanned" | "MissingOLSConfig" | "Invalid";
  mutationAllowed: boolean;
  willPatch: boolean;
  target: {
    name: string;
    namespace: string;
    mcpServerName: string;
    endpoint: string;
  };
  desiredServer?: OlsMcpServer;
  strategicMergePatch?: {
    spec: {
      featureGates: string[];
      mcpServers: OlsMcpServer[];
    };
  };
  evidence: string[];
  missingEvidence: string[];
  risk: string[];
  rollbackPath: string[];
}

export interface ConsolePluginEnablementPlan {
  phase: "Ready" | "PatchPlanned";
  mutationAllowed: true;
  willPatch: boolean;
  target: {
    apiVersion: "operator.openshift.io/v1";
    kind: "Console";
    name: "cluster";
    pluginName: string;
  };
  mergePatch?: {
    spec: {
      plugins: string[];
    };
  };
  evidence: string[];
  risk: string[];
  rollbackPath: string[];
}

export interface OpsLensReconcileStatus {
  phase: "Ready" | "Installing" | "Blocked";
  conditions: Array<{
    type: string;
    status: "True" | "False";
    reason: string;
    message: string;
  }>;
  components: Record<
    string,
    {
      ready: boolean;
      service?: string;
      image?: string;
    }
  >;
  lightspeedRegistration: {
    phase: LightspeedReconcilePlan["phase"];
    evidence: string[];
  };
  rag: {
    documentIntake: {
      mode: "ValidateOnly";
      evidenceExport: "enabled" | "disabled";
      rawDocumentReturnAllowed: boolean;
    };
    approvalQueue: {
      phase: "DesignOnly" | "Disabled";
      enqueueAllowed: boolean;
      evidence: string[];
    };
  };
}

export interface OpsLensReconcilePlan {
  actionMode: "operator-reconcile-plan";
  desiredResources: KubernetesObject[];
  cleanupResources: KubernetesObject[];
  lightspeedRegistration: LightspeedReconcilePlan;
  consolePluginEnablement: ConsolePluginEnablementPlan;
  statusPatch: OpsLensReconcileStatus;
  policy: {
    assistantMutationAllowed: false;
    operatorMutationRequiresPatchMode: true;
    mode: LightspeedRegistrationMode;
    willPatchLightspeed: boolean;
    ragApprovalQueueMutationAllowed: false;
    ragRawDocumentReturnAllowed: false;
  };
}

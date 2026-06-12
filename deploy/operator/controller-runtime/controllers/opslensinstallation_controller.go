package controllers

import (
	"context"
	"fmt"
	"reflect"
	"strings"

	opslensv1alpha1 "github.com/cywell/opslens-operator/api/v1alpha1"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/intstr"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	"sigs.k8s.io/controller-runtime/pkg/log"
)

const (
	appName            = "cywell-opslens"
	apiServiceAccount  = "cywell-opslens-api"
	ragPolicyConfigMap = "cywell-opslens-rag-policy"
)

type OpsLensInstallationReconciler struct {
	client.Client
	Scheme *runtime.Scheme
}

func (r *OpsLensInstallationReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	logger := log.FromContext(ctx)

	var installation opslensv1alpha1.OpsLensInstallation
	if err := r.Get(ctx, req.NamespacedName, &installation); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	namespace := targetNamespace(&installation)
	if err := r.reconcileAPIServiceAccount(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileRAGPolicy(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileAPIDeployment(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileAPIService(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileDashboardDeployment(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileDashboardService(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileVectorStore(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileVectorService(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileModelRuntime(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileModelRuntimeService(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileConsolePlugin(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileLightspeedRegistration(ctx, &installation); err != nil {
		return ctrl.Result{}, err
	}

	installation.Status = buildStatus(&installation)
	if err := r.Status().Update(ctx, &installation); err != nil {
		logger.Error(err, "unable to update OpsLensInstallation status")
		return ctrl.Result{}, err
	}

	return ctrl.Result{}, nil
}

func (r *OpsLensInstallationReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&opslensv1alpha1.OpsLensInstallation{}).
		Owns(&corev1.ConfigMap{}).
		Owns(&corev1.ServiceAccount{}).
		Owns(&corev1.Service{}).
		Owns(&appsv1.Deployment{}).
		Owns(&appsv1.StatefulSet{}).
		Complete(r)
}

func (r *OpsLensInstallationReconciler) reconcileAPIServiceAccount(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	serviceAccount := &corev1.ServiceAccount{
		ObjectMeta: metav1.ObjectMeta{
			Name:      apiServiceAccount,
			Namespace: namespace,
		},
	}

	_, err := controllerutil.CreateOrUpdate(ctx, r.Client, serviceAccount, func() error {
		serviceAccount.Labels = labels("api")
		return r.setControllerReferenceIfSameNamespace(installation, namespace, serviceAccount)
	})
	return err
}

func (r *OpsLensInstallationReconciler) reconcileAPIService(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	return r.reconcileService(ctx, installation, namespace, valueOrDefault(installation.Spec.Components.API.ServiceName, "cywell-opslens-api"), "api", []corev1.ServicePort{
		{Name: "http", Port: 80, TargetPort: intstr.FromString("http")},
		{Name: "mcp", Port: 443, TargetPort: intstr.FromString("http")},
	})
}

func (r *OpsLensInstallationReconciler) reconcileDashboardService(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	return r.reconcileService(ctx, installation, namespace, valueOrDefault(installation.Spec.Components.Dashboard.ServiceName, "cywell-opslens-dashboard"), "dashboard", []corev1.ServicePort{
		{Name: "http", Port: 80, TargetPort: intstr.FromString("http")},
	})
}

func (r *OpsLensInstallationReconciler) reconcileVectorService(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	port := int32(6333)
	if installation.Spec.Components.VectorStore.Provider == "pgvector" {
		port = 5432
	}

	return r.reconcileService(ctx, installation, namespace, "cywell-opslens-vector", "vector-store", []corev1.ServicePort{
		{Name: "http", Port: port, TargetPort: intstr.FromString("http")},
	})
}

func (r *OpsLensInstallationReconciler) reconcileModelRuntimeService(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	return r.reconcileService(ctx, installation, namespace, "cywell-opslens-vllm", "model-runtime", []corev1.ServicePort{
		{Name: "http", Port: 8000, TargetPort: intstr.FromString("http")},
	})
}

func (r *OpsLensInstallationReconciler) reconcileService(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string, name string, component string, ports []corev1.ServicePort) error {
	service := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: namespace,
		},
	}

	_, err := controllerutil.CreateOrUpdate(ctx, r.Client, service, func() error {
		service.Labels = labels(component)
		service.Spec.Selector = labels(component)
		service.Spec.Ports = ports
		return r.setControllerReferenceIfSameNamespace(installation, namespace, service)
	})
	return err
}

func (r *OpsLensInstallationReconciler) reconcileRAGPolicy(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	settings := normalizeRAGSettings(installation)
	configMap := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      ragPolicyConfigMap,
			Namespace: namespace,
		},
	}

	_, err := controllerutil.CreateOrUpdate(ctx, r.Client, configMap, func() error {
		configMap.Labels = labels("rag-policy")
		configMap.Annotations = map[string]string{
			"opslens.cywell.io/document-intake": "validate-only",
			"opslens.cywell.io/approval-queue": "design-only",
		}
		configMap.Data = map[string]string{
			"documentIntakeMode": settings.DocumentIntakeMode,
			"evidenceExport": settings.EvidenceExport,
			"rawDocumentReturnAllowed": "false",
			"approvalQueueMode": settings.ApprovalQueueMode,
			"approvalQueueEnqueueAllowed": "false",
			"requiredApprovals": settings.RequiredApprovals,
		}
		return r.setControllerReferenceIfSameNamespace(installation, namespace, configMap)
	})
	return err
}

func (r *OpsLensInstallationReconciler) reconcileDashboardDeployment(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	name := valueOrDefault(installation.Spec.Components.Dashboard.ServiceName, "cywell-opslens-dashboard")
	replicas := int32(1)
	if installation.Spec.Components.Dashboard.Replicas != nil {
		replicas = *installation.Spec.Components.Dashboard.Replicas
	}

	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: namespace,
		},
	}

	_, err := controllerutil.CreateOrUpdate(ctx, r.Client, deployment, func() error {
		deployment.Labels = labels("dashboard")
		deployment.Spec.Replicas = &replicas
		deployment.Spec.Selector = &metav1.LabelSelector{MatchLabels: labels("dashboard")}
		deployment.Spec.Template.Labels = labels("dashboard")
		deployment.Spec.Template.Spec.Containers = []corev1.Container{
			{
				Name:            "dashboard",
				Image:           installation.Spec.Components.Dashboard.Image,
				ImagePullPolicy: corev1.PullIfNotPresent,
				Ports: []corev1.ContainerPort{
					{Name: "http", ContainerPort: 8080},
				},
			},
		}
		return r.setControllerReferenceIfSameNamespace(installation, namespace, deployment)
	})
	return err
}

func (r *OpsLensInstallationReconciler) reconcileVectorStore(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	provider := valueOrDefault(installation.Spec.Components.VectorStore.Provider, "qdrant")
	image := valueOrDefault(installation.Spec.Components.VectorStore.Image, "docker.io/qdrant/qdrant:v1.12.1")
	port := int32(6333)
	mountPath := "/qdrant/storage"
	if provider == "pgvector" {
		port = 5432
		mountPath = "/var/lib/postgresql/data"
	}
	storageSize := valueOrDefault(installation.Spec.Components.VectorStore.StorageSize, "20Gi")
	storageQuantity, err := resource.ParseQuantity(storageSize)
	if err != nil {
		return fmt.Errorf("invalid vector store storageSize %q: %w", storageSize, err)
	}
	statefulSet := &appsv1.StatefulSet{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "cywell-opslens-vector",
			Namespace: namespace,
		},
	}
	replicas := int32(1)

	_, err = controllerutil.CreateOrUpdate(ctx, r.Client, statefulSet, func() error {
		statefulSet.Labels = labels("vector-store")
		statefulSet.Spec.Replicas = &replicas
		statefulSet.Spec.ServiceName = "cywell-opslens-vector"
		statefulSet.Spec.Selector = &metav1.LabelSelector{MatchLabels: labels("vector-store")}
		statefulSet.Spec.Template.Labels = labels("vector-store")
		statefulSet.Spec.Template.Spec.Containers = []corev1.Container{
			{
				Name:            provider,
				Image:           image,
				ImagePullPolicy: corev1.PullIfNotPresent,
				Ports: []corev1.ContainerPort{
					{Name: "http", ContainerPort: port},
				},
				VolumeMounts: []corev1.VolumeMount{
					{Name: "vector-data", MountPath: mountPath},
				},
			},
		}
		statefulSet.Spec.VolumeClaimTemplates = []corev1.PersistentVolumeClaim{
			{
				ObjectMeta: metav1.ObjectMeta{Name: "vector-data"},
				Spec: corev1.PersistentVolumeClaimSpec{
					AccessModes: []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
					Resources: corev1.VolumeResourceRequirements{
						Requests: corev1.ResourceList{
							corev1.ResourceStorage: storageQuantity,
						},
					},
				},
			},
		}
		return r.setControllerReferenceIfSameNamespace(installation, namespace, statefulSet)
	})
	return err
}

func (r *OpsLensInstallationReconciler) reconcileModelRuntime(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	image := valueOrDefault(installation.Spec.Components.ModelRuntime.Image, "quay.io/cywell/opslens-vllm:0.1.0")
	resources := corev1.ResourceRequirements{}
	if installation.Spec.Components.ModelRuntime.GPU == nil || installation.Spec.Components.ModelRuntime.GPU.Enabled == nil || *installation.Spec.Components.ModelRuntime.GPU.Enabled {
		deviceClass := "nvidia.com/gpu"
		count := int64(1)
		if installation.Spec.Components.ModelRuntime.GPU != nil {
			deviceClass = valueOrDefault(installation.Spec.Components.ModelRuntime.GPU.DeviceClass, deviceClass)
			if installation.Spec.Components.ModelRuntime.GPU.Count != nil {
				count = int64(*installation.Spec.Components.ModelRuntime.GPU.Count)
			}
		}
		resources.Limits = corev1.ResourceList{
			corev1.ResourceName(deviceClass): *resource.NewQuantity(count, resource.DecimalSI),
		}
	}
	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "cywell-opslens-vllm",
			Namespace: namespace,
		},
	}
	replicas := int32(1)
	if installation.Spec.Components.ModelRuntime.Replicas != nil {
		replicas = *installation.Spec.Components.ModelRuntime.Replicas
	}

	_, err := controllerutil.CreateOrUpdate(ctx, r.Client, deployment, func() error {
		deployment.Labels = labels("model-runtime")
		deployment.Spec.Replicas = &replicas
		deployment.Spec.Selector = &metav1.LabelSelector{MatchLabels: labels("model-runtime")}
		deployment.Spec.Template.Labels = labels("model-runtime")
		deployment.Spec.Template.Spec.Containers = []corev1.Container{
			{
				Name:            "vllm",
				Image:           image,
				ImagePullPolicy: corev1.PullIfNotPresent,
				Args:            []string{"--model", installation.Spec.Components.ModelRuntime.Model},
				Ports: []corev1.ContainerPort{
					{Name: "http", ContainerPort: 8000},
				},
				Resources: resources,
			},
		}
		return r.setControllerReferenceIfSameNamespace(installation, namespace, deployment)
	})
	return err
}

func (r *OpsLensInstallationReconciler) reconcileConsolePlugin(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	if installation.Spec.ConsolePlugin != nil && installation.Spec.ConsolePlugin.Enabled != nil && !*installation.Spec.ConsolePlugin.Enabled {
		return nil
	}

	name := "cywell-opslens"
	if installation.Spec.ConsolePlugin != nil {
		name = valueOrDefault(installation.Spec.ConsolePlugin.Name, name)
	}
	plugin := &unstructured.Unstructured{}
	plugin.SetAPIVersion("console.openshift.io/v1")
	plugin.SetKind("ConsolePlugin")
	plugin.SetName(name)

	_, err := controllerutil.CreateOrUpdate(ctx, r.Client, plugin, func() error {
		plugin.SetLabels(labels("console-plugin"))
		plugin.Object["spec"] = map[string]interface{}{
			"displayName": "Cywell OpsLens",
			"service": map[string]interface{}{
				"name":      valueOrDefault(installation.Spec.Components.Dashboard.ServiceName, "cywell-opslens-dashboard"),
				"namespace": namespace,
				"port":      int64(80),
				"basePath":  "/",
			},
			"proxy": []interface{}{
				map[string]interface{}{
					"alias": "opslens-api",
					"service": map[string]interface{}{
						"name":      valueOrDefault(installation.Spec.Components.API.ServiceName, "cywell-opslens-api"),
						"namespace": namespace,
						"port":      int64(80),
					},
					"authorize": true,
				},
			},
		}
		return nil
	})
	return err
}

func (r *OpsLensInstallationReconciler) reconcileAPIDeployment(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	settings := normalizeRAGSettings(installation)
	name := valueOrDefault(installation.Spec.Components.API.ServiceName, "cywell-opslens-api")
	replicas := int32(2)
	if installation.Spec.Components.API.Replicas != nil {
		replicas = *installation.Spec.Components.API.Replicas
	}

	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: namespace,
		},
	}

	_, err := controllerutil.CreateOrUpdate(ctx, r.Client, deployment, func() error {
		deployment.Labels = labels("api")
		deployment.Spec.Replicas = &replicas
		deployment.Spec.Selector = &metav1.LabelSelector{MatchLabels: labels("api")}
		deployment.Spec.Template.Labels = labels("api")
		deployment.Spec.Template.Spec.ServiceAccountName = apiServiceAccount
		deployment.Spec.Template.Spec.Containers = []corev1.Container{
			{
				Name:            "api",
				Image:           installation.Spec.Components.API.Image,
				ImagePullPolicy: corev1.PullIfNotPresent,
				Env: []corev1.EnvVar{
					{Name: "CYWELL_OPSLENS_VECTOR_URL", Value: "http://cywell-opslens-vector:6333"},
					{Name: "CYWELL_OPSLENS_MODEL_URL", Value: "http://cywell-opslens-vllm:8000"},
					{Name: "CYWELL_OPSLENS_ACTION_MODE", Value: "plan-only"},
					{Name: "CYWELL_OPSLENS_RAG_DOCUMENT_INTAKE_MODE", Value: settings.DocumentIntakeMode},
					{Name: "CYWELL_OPSLENS_RAG_EVIDENCE_EXPORT", Value: settings.EvidenceExport},
					{Name: "CYWELL_OPSLENS_RAG_RAW_DOCUMENT_RETURN_ALLOWED", Value: "false"},
					{Name: "CYWELL_OPSLENS_RAG_APPROVAL_QUEUE_MODE", Value: settings.ApprovalQueueMode},
					{Name: "CYWELL_OPSLENS_RAG_APPROVAL_QUEUE_ENQUEUE_ALLOWED", Value: "false"},
					{Name: "CYWELL_OPSLENS_RAG_REQUIRED_APPROVALS", Value: settings.RequiredApprovals},
				},
				Ports: []corev1.ContainerPort{
					{Name: "http", ContainerPort: 8080},
				},
			},
		}
		return r.setControllerReferenceIfSameNamespace(installation, namespace, deployment)
	})
	return err
}

func (r *OpsLensInstallationReconciler) reconcileLightspeedRegistration(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation) error {
	registration := installation.Spec.LightspeedRegistration
	mode := registration.Mode
	if mode == "" {
		mode = opslensv1alpha1.LightspeedValidateOnly
	}
	if mode == opslensv1alpha1.LightspeedValidateOnly {
		return nil
	}

	olsConfigName := valueOrDefault(registration.OLSConfigName, "cluster")
	olsConfigNamespace := valueOrDefault(registration.OLSConfigNamespace, "openshift-lightspeed")
	desiredEndpoint := valueOrDefault(registration.Endpoint, fmt.Sprintf("https://cywell-opslens-api.%s.svc.cluster.local/mcp", targetNamespace(installation)))
	if !strings.HasSuffix(desiredEndpoint, "/mcp") {
		return fmt.Errorf("lightspeedRegistration endpoint must end with /mcp: %s", desiredEndpoint)
	}

	olsConfig := &unstructured.Unstructured{}
	olsConfig.SetAPIVersion("ols.openshift.io/v1alpha1")
	olsConfig.SetKind("OLSConfig")
	if err := r.Get(ctx, types.NamespacedName{Name: olsConfigName, Namespace: olsConfigNamespace}, olsConfig); err != nil {
		return fmt.Errorf("read target OLSConfig before PatchOLSConfig reconciliation: %w", err)
	}

	original := olsConfig.DeepCopy()
	changed := false

	featureGates, found, err := unstructured.NestedStringSlice(olsConfig.Object, "spec", "featureGates")
	if err != nil {
		return fmt.Errorf("read OLSConfig spec.featureGates: %w", err)
	}
	if !found {
		featureGates = []string{}
	}
	featureGates, featureGateChanged := appendUniqueString(featureGates, "MCPServer")
	changed = changed || featureGateChanged

	mcpServers, found, err := unstructured.NestedSlice(olsConfig.Object, "spec", "mcpServers")
	if err != nil {
		return fmt.Errorf("read OLSConfig spec.mcpServers: %w", err)
	}
	if !found {
		mcpServers = []interface{}{}
	}
	serverName := valueOrDefault(registration.MCPServerName, "cywell-opslens")
	desiredServer := desiredLightspeedMCPServer(installation, serverName, desiredEndpoint)
	mcpServers, serverChanged := upsertMCPServer(mcpServers, desiredServer, serverName)
	changed = changed || serverChanged

	if err := unstructured.SetNestedStringSlice(olsConfig.Object, featureGates, "spec", "featureGates"); err != nil {
		return fmt.Errorf("set OLSConfig spec.featureGates: %w", err)
	}
	if err := unstructured.SetNestedSlice(olsConfig.Object, mcpServers, "spec", "mcpServers"); err != nil {
		return fmt.Errorf("set OLSConfig spec.mcpServers: %w", err)
	}

	annotations := olsConfig.GetAnnotations()
	if annotations == nil {
		annotations = map[string]string{}
	}
	if annotations["opslens.cywell.io/reconcile-mode"] != string(opslensv1alpha1.LightspeedPatchOLSConfig) {
		annotations["opslens.cywell.io/reconcile-mode"] = string(opslensv1alpha1.LightspeedPatchOLSConfig)
		changed = true
	}
	rollbackPath := fmt.Sprintf("restore previous OLSConfig %s/%s spec.featureGates and spec.mcpServers from GitOps or cluster backup", olsConfigNamespace, olsConfigName)
	if annotations["opslens.cywell.io/rollback-path"] != rollbackPath {
		annotations["opslens.cywell.io/rollback-path"] = rollbackPath
		changed = true
	}
	olsConfig.SetAnnotations(annotations)

	if !changed {
		return nil
	}
	return r.Patch(ctx, olsConfig, client.MergeFrom(original))
}

func desiredLightspeedMCPServer(installation *opslensv1alpha1.OpsLensInstallation, serverName string, endpoint string) map[string]interface{} {
	registration := installation.Spec.LightspeedRegistration
	headers := []interface{}{}
	if registration.UserTokenForwarding == nil || *registration.UserTokenForwarding {
		headers = append(headers, map[string]interface{}{
			"name": "Authorization",
			"valueFrom": map[string]interface{}{
				"type": "kubernetes",
			},
		})
	}
	if registration.APIKeySecretName != "" {
		headers = append(headers, map[string]interface{}{
			"name": "X-Cywell-Api-Key",
			"valueFrom": map[string]interface{}{
				"type": "secret",
				"secretRef": map[string]interface{}{
					"name": registration.APIKeySecretName,
				},
			},
		})
	}

	return map[string]interface{}{
		"name":    serverName,
		"url":     endpoint,
		"timeout": int64(30),
		"headers": headers,
	}
}

func appendUniqueString(values []string, value string) ([]string, bool) {
	for _, candidate := range values {
		if candidate == value {
			return values, false
		}
	}
	return append(values, value), true
}

func upsertMCPServer(existing []interface{}, desired map[string]interface{}, name string) ([]interface{}, bool) {
	changed := false
	found := false
	updated := make([]interface{}, 0, len(existing)+1)
	for _, item := range existing {
		server, ok := item.(map[string]interface{})
		if ok && server["name"] == name {
			found = true
			if !reflect.DeepEqual(server, desired) {
				changed = true
			}
			updated = append(updated, desired)
			continue
		}
		updated = append(updated, item)
	}
	if !found {
		updated = append(updated, desired)
		changed = true
	}
	return updated, changed
}

type ragSettings struct {
	DocumentIntakeMode string
	EvidenceExport string
	ApprovalQueueMode string
	RequiredApprovals string
}

func normalizeRAGSettings(installation *opslensv1alpha1.OpsLensInstallation) ragSettings {
	approvals := "rag-owner,cluster-sre"
	if installation.Spec.RAG != nil && installation.Spec.RAG.ApprovalQueue != nil && len(installation.Spec.RAG.ApprovalQueue.RequiredApprovals) > 0 {
		approvals = ""
		for index, approval := range installation.Spec.RAG.ApprovalQueue.RequiredApprovals {
			if index > 0 {
				approvals += ","
			}
			approvals += approval
		}
	}

	return ragSettings{
		DocumentIntakeMode: "validate-only",
		EvidenceExport: "enabled",
		ApprovalQueueMode: "design-only",
		RequiredApprovals: approvals,
	}
}

func buildStatus(installation *opslensv1alpha1.OpsLensInstallation) opslensv1alpha1.OpsLensInstallationStatus {
	lightspeedPhase := "Ready"
	registrationMode := installation.Spec.LightspeedRegistration.Mode
	if registrationMode == "" {
		registrationMode = opslensv1alpha1.LightspeedValidateOnly
	}
	if registrationMode == opslensv1alpha1.LightspeedPatchOLSConfig {
		lightspeedPhase = "PatchPlanned"
	}

	return opslensv1alpha1.OpsLensInstallationStatus{
		Phase: "Ready",
		Conditions: []metav1.Condition{
			{
				Type: "LightspeedRegistration",
				Status: metav1.ConditionTrue,
				Reason: lightspeedPhase,
				Message: "Lightspeed registration keeps ValidateOnly and PatchOLSConfig paths explicit.",
			},
			{
				Type: "AssistantSafety",
				Status: metav1.ConditionTrue,
				Reason: "PlanOnly",
				Message: "Assistant actions remain read-only or plan-only.",
			},
			{
				Type: "RagDocumentIntake",
				Status: metav1.ConditionTrue,
				Reason: "ValidateOnly",
				Message: "RAG document intake is validate-only and raw document return is disabled.",
			},
			{
				Type: "RagApprovalQueue",
				Status: metav1.ConditionTrue,
				Reason: "DesignOnly",
				Message: "RAG approval queue enqueue is disabled in MVP 0.1.",
			},
		},
		LightspeedRegistration: opslensv1alpha1.LightspeedRegistrationStatus{
			Phase: lightspeedPhase,
			Evidence: []string{
				"ValidateOnly never mutates OLSConfig",
				"PatchOLSConfig is the only Lightspeed mutation path",
			},
		},
		RAG: opslensv1alpha1.RAGPolicyStatus{
			DocumentIntake: opslensv1alpha1.RAGDocumentIntakeStatus{
				Mode: "ValidateOnly",
				EvidenceExport: "enabled",
				RawDocumentReturnAllowed: false,
			},
			ApprovalQueue: opslensv1alpha1.RAGApprovalQueueStatus{
				Phase: "DesignOnly",
				EnqueueAllowed: false,
				Evidence: []string{
					"RAG document upload is validate-only in MVP 0.1",
					"approval queue enqueue and durable ingestion are disabled",
				},
			},
		},
	}
}

func (r *OpsLensInstallationReconciler) setControllerReferenceIfSameNamespace(installation *opslensv1alpha1.OpsLensInstallation, namespace string, object client.Object) error {
	if installation.Namespace != namespace {
		return nil
	}
	return controllerutil.SetControllerReference(installation, object, r.Scheme)
}

func targetNamespace(installation *opslensv1alpha1.OpsLensInstallation) string {
	return valueOrDefault(installation.Spec.TargetNamespace, installation.Namespace)
}

func valueOrDefault(value string, fallback string) string {
	if value != "" {
		return value
	}
	return fallback
}

func labels(component string) map[string]string {
	return map[string]string{
		"app.kubernetes.io/name": appName,
		"app.kubernetes.io/component": component,
	}
}

package controllers

import (
	"context"
	"fmt"

	opslensv1alpha1 "github.com/cywell/opslens-operator/api/v1alpha1"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	"sigs.k8s.io/controller-runtime/pkg/log"
)

const (
	appName = "cywell-opslens"
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
	if err := r.reconcileRAGPolicy(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileAPIDeployment(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileDashboardDeployment(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileVectorStore(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileModelRuntime(ctx, &installation, namespace); err != nil {
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
		Owns(&appsv1.Deployment{}).
		Owns(&appsv1.StatefulSet{}).
		Complete(r)
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
		return controllerutil.SetControllerReference(installation, configMap, r.Scheme)
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
				Name:  "dashboard",
				Image: installation.Spec.Components.Dashboard.Image,
			},
		}
		return controllerutil.SetControllerReference(installation, deployment, r.Scheme)
	})
	return err
}

func (r *OpsLensInstallationReconciler) reconcileVectorStore(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	provider := valueOrDefault(installation.Spec.Components.VectorStore.Provider, "qdrant")
	image := valueOrDefault(installation.Spec.Components.VectorStore.Image, "docker.io/qdrant/qdrant:v1.12.1")
	statefulSet := &appsv1.StatefulSet{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "cywell-opslens-vector",
			Namespace: namespace,
		},
	}
	replicas := int32(1)

	_, err := controllerutil.CreateOrUpdate(ctx, r.Client, statefulSet, func() error {
		statefulSet.Labels = labels("vector-store")
		statefulSet.Spec.Replicas = &replicas
		statefulSet.Spec.ServiceName = "cywell-opslens-vector"
		statefulSet.Spec.Selector = &metav1.LabelSelector{MatchLabels: labels("vector-store")}
		statefulSet.Spec.Template.Labels = labels("vector-store")
		statefulSet.Spec.Template.Spec.Containers = []corev1.Container{
			{
				Name:  provider,
				Image: image,
			},
		}
		return controllerutil.SetControllerReference(installation, statefulSet, r.Scheme)
	})
	return err
}

func (r *OpsLensInstallationReconciler) reconcileModelRuntime(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	image := valueOrDefault(installation.Spec.Components.ModelRuntime.Image, "quay.io/cywell/opslens-vllm:0.1.0")
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
				Name:  "vllm",
				Image: image,
				Args:  []string{"--model", installation.Spec.Components.ModelRuntime.Model},
			},
		}
		return controllerutil.SetControllerReference(installation, deployment, r.Scheme)
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
		deployment.Spec.Template.Spec.ServiceAccountName = "cywell-opslens-api"
		deployment.Spec.Template.Spec.Containers = []corev1.Container{
			{
				Name:  "api",
				Image: installation.Spec.Components.API.Image,
				Env: []corev1.EnvVar{
					{Name: "CYWELL_OPSLENS_ACTION_MODE", Value: "plan-only"},
					{Name: "CYWELL_OPSLENS_RAG_DOCUMENT_INTAKE_MODE", Value: settings.DocumentIntakeMode},
					{Name: "CYWELL_OPSLENS_RAG_EVIDENCE_EXPORT", Value: settings.EvidenceExport},
					{Name: "CYWELL_OPSLENS_RAG_RAW_DOCUMENT_RETURN_ALLOWED", Value: "false"},
					{Name: "CYWELL_OPSLENS_RAG_APPROVAL_QUEUE_MODE", Value: settings.ApprovalQueueMode},
					{Name: "CYWELL_OPSLENS_RAG_APPROVAL_QUEUE_ENQUEUE_ALLOWED", Value: "false"},
					{Name: "CYWELL_OPSLENS_RAG_REQUIRED_APPROVALS", Value: settings.RequiredApprovals},
				},
			},
		}
		return controllerutil.SetControllerReference(installation, deployment, r.Scheme)
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

	// The production implementation patches OLSConfig.spec.featureGates and spec.mcpServers here.
	// This skeleton keeps the mode split explicit: ValidateOnly never mutates, PatchOLSConfig is the only patch path.
	_ = types.NamespacedName{Name: olsConfigName, Namespace: olsConfigNamespace}
	_ = desiredEndpoint
	return nil
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

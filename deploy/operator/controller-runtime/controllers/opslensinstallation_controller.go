package controllers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"reflect"
	"strings"

	opslensv1alpha1 "github.com/cywell/opslens-operator/api/v1alpha1"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
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
	appName                      = "cywell-opslens"
	apiServiceAccount            = "cywell-opslens-api"
	ragPolicyConfigMap           = "cywell-opslens-rag-policy"
	serviceServingCertAnnotation = "service.beta.openshift.io/serving-cert-secret-name"
	tlsMountPath                 = "/var/run/secrets/cywell-opslens/tls"
	apiTLSSecretName             = "cywell-opslens-api-tls"
	dashboardTLSSecretName       = "cywell-opslens-dashboard-tls"
	consoleNamespace             = "openshift-console"
	lightspeedNamespace          = "openshift-lightspeed"
	httpsContainerPort           = int32(9443)
	httpsServicePort             = int32(443)
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

	if err := r.reconcileAPIReadOnlyRBAC(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileRAGPolicy(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcilePostgresAuthSecret(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileAPIDeployment(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileAPIService(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileAPINetworkPolicy(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileDashboardDeployment(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileDashboardService(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileDashboardRoute(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileDashboardNetworkPolicy(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if valueOrDefault(installation.Spec.Components.VectorStore.Provider, "pgvector") != "inmemory" {
		if err := r.reconcileVectorStore(ctx, &installation, namespace); err != nil {
			return ctrl.Result{}, err
		}

		if err := r.reconcileVectorService(ctx, &installation, namespace); err != nil {
			return ctrl.Result{}, err
		}
	} else if err := r.pruneVectorStore(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if installation.Spec.Components.ModelRuntime.Provider != "mock-local" {
		if err := r.reconcileModelRuntime(ctx, &installation, namespace); err != nil {
			return ctrl.Result{}, err
		}

		if err := r.reconcileModelRuntimeService(ctx, &installation, namespace); err != nil {
			return ctrl.Result{}, err
		}
	} else if err := r.pruneModelRuntime(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.reconcileConsolePlugin(ctx, &installation, namespace); err != nil {
		return ctrl.Result{}, err
	}

	if consolePluginEnabled(&installation) {
		if err := r.reconcileConsolePluginEnablement(ctx, &installation); err != nil {
			return ctrl.Result{}, err
		}
	}

	if err := r.reconcileLightspeedRegistration(ctx, &installation); err != nil {
		return ctrl.Result{}, err
	}

	installation.Status = r.buildStatus(ctx, &installation, namespace)
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
		Owns(&corev1.Secret{}).
		Owns(&corev1.ServiceAccount{}).
		Owns(&corev1.Service{}).
		Owns(&appsv1.Deployment{}).
		Owns(&appsv1.StatefulSet{}).
		Owns(&networkingv1.NetworkPolicy{}).
		Complete(r)
}

func (r *OpsLensInstallationReconciler) pruneVectorStore(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	objects := []client.Object{
		&appsv1.StatefulSet{ObjectMeta: metav1.ObjectMeta{Name: "cywell-opslens-vector", Namespace: namespace}},
		&corev1.Service{ObjectMeta: metav1.ObjectMeta{Name: "cywell-opslens-vector", Namespace: namespace}},
		&corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: "cywell-opslens-postgres-auth", Namespace: namespace}},
	}
	return r.deleteManagedObjects(ctx, installation, objects...)
}

func (r *OpsLensInstallationReconciler) pruneModelRuntime(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	objects := []client.Object{
		&appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Name: "cywell-opslens-vllm", Namespace: namespace}},
		&corev1.Service{ObjectMeta: metav1.ObjectMeta{Name: "cywell-opslens-vllm", Namespace: namespace}},
	}
	return r.deleteManagedObjects(ctx, installation, objects...)
}

func (r *OpsLensInstallationReconciler) deleteManagedObjects(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, objects ...client.Object) error {
	for _, object := range objects {
		if err := r.deleteManagedObject(ctx, installation, object); err != nil {
			return err
		}
	}
	return nil
}

func (r *OpsLensInstallationReconciler) deleteManagedObject(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, object client.Object) error {
	key := types.NamespacedName{Name: object.GetName(), Namespace: object.GetNamespace()}
	if err := r.Get(ctx, key, object); err != nil {
		return client.IgnoreNotFound(err)
	}
	if !isOwnedByInstallation(installation, object) {
		return nil
	}
	return client.IgnoreNotFound(r.Delete(ctx, object))
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

func (r *OpsLensInstallationReconciler) reconcileAPIReadOnlyRBAC(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	roleName := apiReadOnlyRBACName(namespace)
	role := &rbacv1.ClusterRole{
		ObjectMeta: metav1.ObjectMeta{Name: roleName},
	}

	if _, err := controllerutil.CreateOrUpdate(ctx, r.Client, role, func() error {
		role.Labels = labels("api-readonly-rbac")
		role.Rules = apiReadOnlyPolicyRules()
		return nil
	}); err != nil {
		return err
	}

	binding := &rbacv1.ClusterRoleBinding{
		ObjectMeta: metav1.ObjectMeta{Name: roleName},
	}
	_, err := controllerutil.CreateOrUpdate(ctx, r.Client, binding, func() error {
		binding.Labels = labels("api-readonly-rbac")
		binding.RoleRef = rbacv1.RoleRef{
			APIGroup: rbacv1.GroupName,
			Kind:     "ClusterRole",
			Name:     roleName,
		}
		binding.Subjects = []rbacv1.Subject{
			{
				Kind:      rbacv1.ServiceAccountKind,
				Name:      apiServiceAccount,
				Namespace: namespace,
			},
		}
		return nil
	})
	return err
}

func (r *OpsLensInstallationReconciler) reconcilePostgresAuthSecret(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	if installation.Spec.Components.VectorStore.Provider != "" && installation.Spec.Components.VectorStore.Provider != "pgvector" {
		return nil
	}

	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "cywell-opslens-postgres-auth",
			Namespace: namespace,
		},
	}

	_, err := controllerutil.CreateOrUpdate(ctx, r.Client, secret, func() error {
		secret.Labels = labels("vector-store")
		secret.Type = corev1.SecretTypeOpaque
		if secret.Data == nil {
			secret.Data = map[string][]byte{}
		}
		password := string(secret.Data["password"])
		if password == "" {
			generated, err := randomHex(24)
			if err != nil {
				return err
			}
			password = generated
			secret.Data["password"] = []byte(password)
		}
		secret.Data["url"] = []byte(fmt.Sprintf(
			"postgres://opslens:%s@cywell-opslens-vector.%s.svc.cluster.local:5432/opslens?sslmode=disable",
			password,
			namespace,
		))
		return r.setControllerReferenceIfSameNamespace(installation, namespace, secret)
	})
	return err
}

func (r *OpsLensInstallationReconciler) reconcileAPIService(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	return r.reconcileServiceWithAnnotations(ctx, installation, namespace, valueOrDefault(installation.Spec.Components.API.ServiceName, "cywell-opslens-api"), "api", []corev1.ServicePort{
		{Name: "https", Port: httpsServicePort, TargetPort: intstr.FromString("https")},
	}, map[string]string{
		serviceServingCertAnnotation: apiTLSSecretName,
	})
}

func (r *OpsLensInstallationReconciler) reconcileDashboardService(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	return r.reconcileServiceWithAnnotations(ctx, installation, namespace, valueOrDefault(installation.Spec.Components.Dashboard.ServiceName, "cywell-opslens-dashboard"), "dashboard", []corev1.ServicePort{
		{Name: "https", Port: httpsServicePort, TargetPort: intstr.FromString("https")},
	}, map[string]string{
		serviceServingCertAnnotation: dashboardTLSSecretName,
	})
}

func (r *OpsLensInstallationReconciler) reconcileDashboardRoute(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	name := valueOrDefault(installation.Spec.Components.Dashboard.ServiceName, "cywell-opslens-dashboard")
	route := &unstructured.Unstructured{}
	route.SetAPIVersion("route.openshift.io/v1")
	route.SetKind("Route")
	route.SetName(name)
	route.SetNamespace(namespace)

	_, err := controllerutil.CreateOrUpdate(ctx, r.Client, route, func() error {
		route.SetLabels(labels("dashboard"))
		route.SetAnnotations(map[string]string{
			"opslens.cywell.io/exposure": "dashboard-demo-route",
		})
		route.Object["spec"] = map[string]interface{}{
			"to": map[string]interface{}{
				"kind": "Service",
				"name": name,
			},
			"port": map[string]interface{}{
				"targetPort": "https",
			},
			"tls": map[string]interface{}{
				"termination":                   "reencrypt",
				"insecureEdgeTerminationPolicy": "Redirect",
			},
		}
		return r.setControllerReferenceIfSameNamespace(installation, namespace, route)
	})
	return err
}

func (r *OpsLensInstallationReconciler) reconcileVectorService(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	port := int32(6333)
	portName := "http"
	if installation.Spec.Components.VectorStore.Provider == "pgvector" {
		port = 5432
		portName = "postgres"
	}

	return r.reconcileService(ctx, installation, namespace, "cywell-opslens-vector", "vector-store", []corev1.ServicePort{
		{Name: portName, Port: port, TargetPort: intstr.FromString(portName)},
	})
}

func (r *OpsLensInstallationReconciler) reconcileModelRuntimeService(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	return r.reconcileService(ctx, installation, namespace, "cywell-opslens-vllm", "model-runtime", []corev1.ServicePort{
		{Name: "http", Port: 8000, TargetPort: intstr.FromString("http")},
	})
}

func (r *OpsLensInstallationReconciler) reconcileService(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string, name string, component string, ports []corev1.ServicePort) error {
	return r.reconcileServiceWithAnnotations(ctx, installation, namespace, name, component, ports, nil)
}

func (r *OpsLensInstallationReconciler) reconcileServiceWithAnnotations(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string, name string, component string, ports []corev1.ServicePort, annotations map[string]string) error {
	service := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: namespace,
		},
	}

	_, err := controllerutil.CreateOrUpdate(ctx, r.Client, service, func() error {
		service.Labels = labels(component)
		service.Annotations = annotations
		service.Spec.Selector = labels(component)
		service.Spec.Ports = ports
		return r.setControllerReferenceIfSameNamespace(installation, namespace, service)
	})
	return err
}

func (r *OpsLensInstallationReconciler) reconcileAPINetworkPolicy(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	return r.reconcileIngressNetworkPolicy(ctx, installation, namespace, "cywell-opslens-api-ingress", "api", []string{consoleNamespace, lightspeedNamespace})
}

func (r *OpsLensInstallationReconciler) reconcileDashboardNetworkPolicy(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	return r.reconcileIngressNetworkPolicy(ctx, installation, namespace, "cywell-opslens-dashboard-ingress", "dashboard", []string{consoleNamespace})
}

func (r *OpsLensInstallationReconciler) reconcileIngressNetworkPolicy(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string, name string, component string, sourceNamespaces []string) error {
	policy := &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: namespace,
		},
	}
	protocol := corev1.ProtocolTCP
	port := intstr.FromInt(int(httpsContainerPort))

	_, err := controllerutil.CreateOrUpdate(ctx, r.Client, policy, func() error {
		from := []networkingv1.NetworkPolicyPeer{}
		for _, sourceNamespace := range sourceNamespaces {
			from = append(from, networkingv1.NetworkPolicyPeer{
				NamespaceSelector: &metav1.LabelSelector{
					MatchLabels: map[string]string{
						"kubernetes.io/metadata.name": sourceNamespace,
					},
				},
			})
		}
		from = append(from, networkingv1.NetworkPolicyPeer{
			PodSelector: &metav1.LabelSelector{
				MatchLabels: map[string]string{
					"app.kubernetes.io/name": appName,
				},
			},
		})

		policy.Labels = labels(component)
		policy.Spec = networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{
				MatchLabels: labels(component),
			},
			PolicyTypes: []networkingv1.PolicyType{
				networkingv1.PolicyTypeIngress,
			},
			Ingress: []networkingv1.NetworkPolicyIngressRule{
				{
					From: from,
					Ports: []networkingv1.NetworkPolicyPort{
						{
							Protocol: &protocol,
							Port:     &port,
						},
					},
				},
			},
		}
		return r.setControllerReferenceIfSameNamespace(installation, namespace, policy)
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
			"opslens.cywell.io/approval-queue":  "design-only",
		}
		configMap.Data = map[string]string{
			"documentIntakeMode":          settings.DocumentIntakeMode,
			"evidenceExport":              settings.EvidenceExport,
			"rawDocumentReturnAllowed":    "false",
			"approvalQueueMode":           settings.ApprovalQueueMode,
			"approvalQueueEnqueueAllowed": "false",
			"requiredApprovals":           settings.RequiredApprovals,
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
				Env: []corev1.EnvVar{
					{Name: "HOST", Value: "0.0.0.0"},
					{Name: "PORT", Value: fmt.Sprintf("%d", httpsContainerPort)},
					{Name: "CYWELL_OPSLENS_TLS_CERT_FILE", Value: "/var/run/secrets/cywell-opslens/tls/tls.crt"},
					{Name: "CYWELL_OPSLENS_TLS_KEY_FILE", Value: "/var/run/secrets/cywell-opslens/tls/tls.key"},
				},
				Ports: []corev1.ContainerPort{
					{Name: "https", ContainerPort: httpsContainerPort},
				},
				VolumeMounts: []corev1.VolumeMount{
					{Name: "service-serving-cert", MountPath: tlsMountPath, ReadOnly: true},
				},
				ReadinessProbe: &corev1.Probe{
					ProbeHandler: corev1.ProbeHandler{
						HTTPGet: &corev1.HTTPGetAction{
							Path:   "/healthz",
							Port:   intstr.FromString("https"),
							Scheme: corev1.URISchemeHTTPS,
						},
					},
					InitialDelaySeconds: 5,
					PeriodSeconds:       10,
				},
			},
		}
		deployment.Spec.Template.Spec.Volumes = []corev1.Volume{
			{
				Name: "service-serving-cert",
				VolumeSource: corev1.VolumeSource{
					Secret: &corev1.SecretVolumeSource{
						SecretName: dashboardTLSSecretName,
					},
				},
			},
		}
		return r.setControllerReferenceIfSameNamespace(installation, namespace, deployment)
	})
	return err
}

func (r *OpsLensInstallationReconciler) reconcileVectorStore(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	provider := valueOrDefault(installation.Spec.Components.VectorStore.Provider, "pgvector")
	image := valueOrDefault(installation.Spec.Components.VectorStore.Image, "docker.io/pgvector/pgvector:pg16")
	port := int32(6333)
	portName := "http"
	mountPath := "/var/lib/opslens/vector"
	var env []corev1.EnvVar
	if provider == "pgvector" {
		port = 5432
		portName = "postgres"
		mountPath = "/var/lib/postgresql/data"
		env = []corev1.EnvVar{
			{Name: "POSTGRES_DB", Value: "opslens"},
			{Name: "POSTGRES_USER", Value: "opslens"},
			{Name: "PGDATA", Value: "/var/lib/postgresql/data/pgdata"},
			{Name: "POSTGRES_PASSWORD", ValueFrom: &corev1.EnvVarSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: "cywell-opslens-postgres-auth"},
					Key:                  "password",
				},
			}},
		}
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
				Env:             env,
				Ports: []corev1.ContainerPort{
					{Name: portName, ContainerPort: port},
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

func randomHex(byteCount int) (string, error) {
	buffer := make([]byte, byteCount)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
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
	if !consolePluginEnabled(installation) {
		return nil
	}

	name := consolePluginName(installation)
	plugin := &unstructured.Unstructured{}
	plugin.SetAPIVersion("console.openshift.io/v1")
	plugin.SetKind("ConsolePlugin")
	plugin.SetName(name)

	_, err := controllerutil.CreateOrUpdate(ctx, r.Client, plugin, func() error {
		plugin.SetLabels(labels("console-plugin"))
		plugin.Object["spec"] = map[string]interface{}{
			"displayName": "Cywell OpsLens",
			"backend": map[string]interface{}{
				"type": "Service",
				"service": map[string]interface{}{
					"name":      valueOrDefault(installation.Spec.Components.Dashboard.ServiceName, "cywell-opslens-dashboard"),
					"namespace": namespace,
					"port":      int64(httpsServicePort),
					"basePath":  "/",
				},
			},
			"proxy": []interface{}{
				map[string]interface{}{
					"alias":         "opslens-api",
					"authorization": "UserToken",
					"endpoint": map[string]interface{}{
						"type": "Service",
						"service": map[string]interface{}{
							"name":      valueOrDefault(installation.Spec.Components.API.ServiceName, "cywell-opslens-api"),
							"namespace": namespace,
							"port":      int64(httpsServicePort),
						},
					},
				},
			},
		}
		return nil
	})
	return err
}

func (r *OpsLensInstallationReconciler) reconcileConsolePluginEnablement(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation) error {
	name := consolePluginName(installation)
	consoleOperator := &unstructured.Unstructured{}
	consoleOperator.SetAPIVersion("operator.openshift.io/v1")
	consoleOperator.SetKind("Console")
	if err := r.Get(ctx, types.NamespacedName{Name: "cluster"}, consoleOperator); err != nil {
		return fmt.Errorf("read consoles.operator.openshift.io/cluster before ConsolePlugin enablement: %w", err)
	}

	plugins, found, err := unstructured.NestedStringSlice(consoleOperator.Object, "spec", "plugins")
	if err != nil {
		return fmt.Errorf("read Console cluster spec.plugins: %w", err)
	}
	if !found {
		plugins = []string{}
	}

	plugins, changed := appendUniqueString(plugins, name)
	if !changed {
		return nil
	}

	original := consoleOperator.DeepCopy()
	if err := unstructured.SetNestedStringSlice(consoleOperator.Object, plugins, "spec", "plugins"); err != nil {
		return fmt.Errorf("set Console cluster spec.plugins: %w", err)
	}
	return r.Patch(ctx, consoleOperator, client.MergeFrom(original))
}

func (r *OpsLensInstallationReconciler) reconcileAPIDeployment(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) error {
	settings := normalizeRAGSettings(installation)
	name := valueOrDefault(installation.Spec.Components.API.ServiceName, "cywell-opslens-api")
	vectorProvider := valueOrDefault(installation.Spec.Components.VectorStore.Provider, "pgvector")
	modelProvider := valueOrDefault(installation.Spec.Components.ModelRuntime.Provider, "vllm")
	replicas := int32(2)
	if installation.Spec.Components.API.Replicas != nil {
		replicas = *installation.Spec.Components.API.Replicas
	}

	env := []corev1.EnvVar{
		{Name: "KUGNUS_API_HOST", Value: "0.0.0.0"},
		{Name: "KUGNUS_API_PORT", Value: fmt.Sprintf("%d", httpsContainerPort)},
		{Name: "PORT", Value: fmt.Sprintf("%d", httpsContainerPort)},
		{Name: "CYWELL_OPSLENS_TLS_CERT_FILE", Value: "/var/run/secrets/cywell-opslens/tls/tls.crt"},
		{Name: "CYWELL_OPSLENS_TLS_KEY_FILE", Value: "/var/run/secrets/cywell-opslens/tls/tls.key"},
		{Name: "CYWELL_OPSLENS_VECTOR_PROVIDER", Value: vectorProvider},
	}
	if vectorProvider == "pgvector" {
		env = append(env, corev1.EnvVar{Name: "CYWELL_OPSLENS_POSTGRES_URL", ValueFrom: &corev1.EnvVarSource{
			SecretKeyRef: &corev1.SecretKeySelector{
				LocalObjectReference: corev1.LocalObjectReference{Name: "cywell-opslens-postgres-auth"},
				Key:                  "url",
			},
		}})
	}
	if modelProvider != "mock-local" {
		env = append(env, corev1.EnvVar{Name: "CYWELL_OPSLENS_MODEL_URL", Value: "http://cywell-opslens-vllm:8000"})
	}
	env = append(env,
		corev1.EnvVar{Name: "CYWELL_OPSLENS_RAG_RUNTIME_MODE", Value: "local"},
		corev1.EnvVar{Name: "CYWELL_OPSLENS_ACTION_MODE", Value: "plan-only"},
		corev1.EnvVar{Name: "CYWELL_OPSLENS_RAG_DOCUMENT_INTAKE_MODE", Value: settings.DocumentIntakeMode},
		corev1.EnvVar{Name: "CYWELL_OPSLENS_RAG_EVIDENCE_EXPORT", Value: settings.EvidenceExport},
		corev1.EnvVar{Name: "CYWELL_OPSLENS_RAG_RAW_DOCUMENT_RETURN_ALLOWED", Value: "false"},
		corev1.EnvVar{Name: "CYWELL_OPSLENS_RAG_APPROVAL_QUEUE_MODE", Value: settings.ApprovalQueueMode},
		corev1.EnvVar{Name: "CYWELL_OPSLENS_RAG_APPROVAL_QUEUE_ENQUEUE_ALLOWED", Value: "false"},
		corev1.EnvVar{Name: "CYWELL_OPSLENS_RAG_REQUIRED_APPROVALS", Value: settings.RequiredApprovals},
	)

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
				Env: env,
				Ports: []corev1.ContainerPort{
					{Name: "https", ContainerPort: httpsContainerPort},
				},
				VolumeMounts: []corev1.VolumeMount{
					{Name: "service-serving-cert", MountPath: tlsMountPath, ReadOnly: true},
				},
				ReadinessProbe: &corev1.Probe{
					ProbeHandler: corev1.ProbeHandler{
						HTTPGet: &corev1.HTTPGetAction{
							Path:   "/healthz",
							Port:   intstr.FromString("https"),
							Scheme: corev1.URISchemeHTTPS,
						},
					},
					InitialDelaySeconds: 5,
					PeriodSeconds:       10,
				},
			},
		}
		deployment.Spec.Template.Spec.Volumes = []corev1.Volume{
			{
				Name: "service-serving-cert",
				VolumeSource: corev1.VolumeSource{
					Secret: &corev1.SecretVolumeSource{
						SecretName: apiTLSSecretName,
					},
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
	EvidenceExport     string
	ApprovalQueueMode  string
	RequiredApprovals  string
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
		EvidenceExport:     "enabled",
		ApprovalQueueMode:  "design-only",
		RequiredApprovals:  approvals,
	}
}

type observedComponent struct {
	status   opslensv1alpha1.OpsLensComponentStatus
	required bool
	message  string
}

func (r *OpsLensInstallationReconciler) observeDeploymentComponent(ctx context.Context, namespace string, name string, service string, image string) observedComponent {
	component := observedComponent{
		required: true,
		status: opslensv1alpha1.OpsLensComponentStatus{
			Ready:   false,
			Service: service,
			Image:   image,
		},
		message: fmt.Sprintf("%s Deployment is not observed yet", name),
	}

	var deployment appsv1.Deployment
	if err := r.Get(ctx, types.NamespacedName{Namespace: namespace, Name: name}, &deployment); err != nil {
		if apierrors.IsNotFound(err) {
			return component
		}
		component.message = fmt.Sprintf("%s Deployment readiness could not be read: %s", name, err.Error())
		return component
	}

	desiredReplicas := int32(1)
	if deployment.Spec.Replicas != nil {
		desiredReplicas = *deployment.Spec.Replicas
	}
	component.status.Ready = desiredReplicas == 0 ||
		(deployment.Status.ObservedGeneration >= deployment.Generation &&
			deployment.Status.ReadyReplicas >= desiredReplicas &&
			deployment.Status.AvailableReplicas >= desiredReplicas)
	if component.status.Ready {
		component.message = fmt.Sprintf("%s Deployment is available", name)
	} else {
		component.message = fmt.Sprintf(
			"%s Deployment waiting for readiness ready=%d available=%d desired=%d observedGeneration=%d generation=%d",
			name,
			deployment.Status.ReadyReplicas,
			deployment.Status.AvailableReplicas,
			desiredReplicas,
			deployment.Status.ObservedGeneration,
			deployment.Generation,
		)
	}
	return component
}

func (r *OpsLensInstallationReconciler) observeStatefulSetComponent(ctx context.Context, namespace string, name string, service string, image string) observedComponent {
	component := observedComponent{
		required: true,
		status: opslensv1alpha1.OpsLensComponentStatus{
			Ready:   false,
			Service: service,
			Image:   image,
		},
		message: fmt.Sprintf("%s StatefulSet is not observed yet", name),
	}

	var statefulSet appsv1.StatefulSet
	if err := r.Get(ctx, types.NamespacedName{Namespace: namespace, Name: name}, &statefulSet); err != nil {
		if apierrors.IsNotFound(err) {
			return component
		}
		component.message = fmt.Sprintf("%s StatefulSet readiness could not be read: %s", name, err.Error())
		return component
	}

	desiredReplicas := int32(1)
	if statefulSet.Spec.Replicas != nil {
		desiredReplicas = *statefulSet.Spec.Replicas
	}
	component.status.Ready = desiredReplicas == 0 ||
		(statefulSet.Status.ObservedGeneration >= statefulSet.Generation &&
			statefulSet.Status.ReadyReplicas >= desiredReplicas)
	if component.status.Ready {
		component.message = fmt.Sprintf("%s StatefulSet is ready", name)
	} else {
		component.message = fmt.Sprintf(
			"%s StatefulSet waiting for readiness ready=%d desired=%d observedGeneration=%d generation=%d",
			name,
			statefulSet.Status.ReadyReplicas,
			desiredReplicas,
			statefulSet.Status.ObservedGeneration,
			statefulSet.Generation,
		)
	}
	return component
}

func (r *OpsLensInstallationReconciler) observeDashboardRoute(ctx context.Context, namespace string, name string) (opslensv1alpha1.DashboardRouteStatus, string) {
	status := opslensv1alpha1.DashboardRouteStatus{
		Ready:      false,
		Name:       name,
		Service:    name,
		TLS:        "reencrypt",
		EntryPoint: "OpenShift Route",
	}
	message := fmt.Sprintf("%s Route is not observed yet", name)

	route := &unstructured.Unstructured{}
	route.SetAPIVersion("route.openshift.io/v1")
	route.SetKind("Route")
	if err := r.Get(ctx, types.NamespacedName{Namespace: namespace, Name: name}, route); err != nil {
		if apierrors.IsNotFound(err) {
			return status, message
		}
		status.EntryPoint = "OpenShift Route status unreadable"
		return status, fmt.Sprintf("%s Route readiness could not be read: %s", name, err.Error())
	}

	if service, found, _ := unstructured.NestedString(route.Object, "spec", "to", "name"); found && service != "" {
		status.Service = service
	}
	if tls, found, _ := unstructured.NestedString(route.Object, "spec", "tls", "termination"); found && tls != "" {
		status.TLS = tls
	}
	if host, found, _ := unstructured.NestedString(route.Object, "spec", "host"); found && host != "" {
		status.Host = host
	}
	if status.Host == "" {
		if ingresses, found, _ := unstructured.NestedSlice(route.Object, "status", "ingress"); found && len(ingresses) > 0 {
			if ingress, ok := ingresses[0].(map[string]interface{}); ok {
				if host, ok := ingress["host"].(string); ok {
					status.Host = host
				}
			}
		}
	}

	status.Ready = status.Service == name && status.Host != ""
	if status.Ready {
		return status, fmt.Sprintf("%s Route is admitted and targets Service/%s", name, status.Service)
	}
	return status, fmt.Sprintf("%s Route is waiting for admission or Service target service=%s hostSet=%t", name, status.Service, status.Host != "")
}

func localOnlyComponent(service string, image string, message string) observedComponent {
	return observedComponent{
		required: false,
		status: opslensv1alpha1.OpsLensComponentStatus{
			Ready:   true,
			Service: service,
			Image:   image,
		},
		message: message,
	}
}

func (r *OpsLensInstallationReconciler) buildStatus(ctx context.Context, installation *opslensv1alpha1.OpsLensInstallation, namespace string) opslensv1alpha1.OpsLensInstallationStatus {
	lightspeedPhase := "Ready"
	registrationMode := installation.Spec.LightspeedRegistration.Mode
	if registrationMode == "" {
		registrationMode = opslensv1alpha1.LightspeedValidateOnly
	}
	if registrationMode == opslensv1alpha1.LightspeedPatchOLSConfig {
		lightspeedPhase = "PatchPlanned"
	}

	api := installation.Spec.Components.API
	dashboard := installation.Spec.Components.Dashboard
	vectorStore := installation.Spec.Components.VectorStore
	modelRuntime := installation.Spec.Components.ModelRuntime
	apiStatus := r.observeDeploymentComponent(ctx, namespace, "cywell-opslens-api", valueOrDefault(api.ServiceName, "cywell-opslens-api"), api.Image)
	dashboardServiceName := valueOrDefault(dashboard.ServiceName, "cywell-opslens-dashboard")
	dashboardStatus := r.observeDeploymentComponent(ctx, namespace, "cywell-opslens-dashboard", dashboardServiceName, dashboard.Image)
	dashboardRoute, dashboardRouteMessage := r.observeDashboardRoute(ctx, namespace, dashboardServiceName)
	vectorStatus := localOnlyComponent("inmemory", vectorStore.Image, "vector store uses in-memory provider for this profile")
	if valueOrDefault(vectorStore.Provider, "pgvector") != "inmemory" {
		vectorStatus = r.observeStatefulSetComponent(ctx, namespace, "cywell-opslens-vector", "cywell-opslens-vector", vectorStore.Image)
	}
	modelStatus := localOnlyComponent("mock-local", modelRuntime.Image, "model runtime uses mock-local provider for this profile")
	if modelRuntime.Provider != "mock-local" {
		modelStatus = r.observeDeploymentComponent(ctx, namespace, "cywell-opslens-vllm", "cywell-opslens-vllm", modelRuntime.Image)
	}

	componentObservations := map[string]observedComponent{
		"api":          apiStatus,
		"dashboard":    dashboardStatus,
		"vectorStore":  vectorStatus,
		"modelRuntime": modelStatus,
	}
	components := map[string]opslensv1alpha1.OpsLensComponentStatus{}
	workloadMessages := []string{}
	workloadsReady := true
	for name, observation := range componentObservations {
		components[name] = observation.status
		if observation.required && !observation.status.Ready {
			workloadsReady = false
			workloadMessages = append(workloadMessages, observation.message)
		}
	}
	workloadConditionStatus := metav1.ConditionTrue
	workloadReason := "AllReady"
	workloadMessage := "Required OpsLens workloads are available or intentionally local-only for this profile."
	if !workloadsReady {
		workloadConditionStatus = metav1.ConditionFalse
		workloadReason = "WaitingForWorkloads"
		workloadMessage = strings.Join(workloadMessages, "; ")
	}
	routeConditionStatus := metav1.ConditionTrue
	routeConditionReason := "RouteAdmitted"
	if !dashboardRoute.Ready {
		routeConditionStatus = metav1.ConditionFalse
		routeConditionReason = "WaitingForRoute"
	}
	phase := "Ready"
	if !workloadsReady || !dashboardRoute.Ready {
		phase = "Installing"
	}

	return opslensv1alpha1.OpsLensInstallationStatus{
		Phase:          phase,
		Components:     components,
		DashboardRoute: dashboardRoute,
		Conditions: []metav1.Condition{
			{
				Type:    "WorkloadsAvailable",
				Status:  workloadConditionStatus,
				Reason:  workloadReason,
				Message: workloadMessage,
			},
			{
				Type:    "DashboardRouteAvailable",
				Status:  routeConditionStatus,
				Reason:  routeConditionReason,
				Message: dashboardRouteMessage,
			},
			{
				Type:    "LightspeedRegistration",
				Status:  metav1.ConditionTrue,
				Reason:  lightspeedPhase,
				Message: "Lightspeed registration keeps ValidateOnly and PatchOLSConfig paths explicit.",
			},
			{
				Type:    "AssistantSafety",
				Status:  metav1.ConditionTrue,
				Reason:  "PlanOnly",
				Message: "Assistant actions remain read-only or plan-only.",
			},
			{
				Type:    "RagDocumentIntake",
				Status:  metav1.ConditionTrue,
				Reason:  "ValidateOnly",
				Message: "RAG document intake is validate-only and raw document return is disabled.",
			},
			{
				Type:    "RagApprovalQueue",
				Status:  metav1.ConditionTrue,
				Reason:  "DesignOnly",
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
				Mode:                     "ValidateOnly",
				EvidenceExport:           "enabled",
				RawDocumentReturnAllowed: false,
			},
			ApprovalQueue: opslensv1alpha1.RAGApprovalQueueStatus{
				Phase:          "DesignOnly",
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
	controller := true
	blockOwnerDeletion := false
	ownerReference := metav1.OwnerReference{
		APIVersion:         opslensv1alpha1.GroupVersion.String(),
		Kind:               "OpsLensInstallation",
		Name:               installation.Name,
		UID:                installation.UID,
		Controller:         &controller,
		BlockOwnerDeletion: &blockOwnerDeletion,
	}
	ownerReferences := object.GetOwnerReferences()
	nextOwnerReferences := make([]metav1.OwnerReference, 0, len(ownerReferences)+1)
	for _, existing := range ownerReferences {
		if existing.APIVersion == ownerReference.APIVersion && existing.Kind == ownerReference.Kind && existing.Name == ownerReference.Name {
			continue
		}
		if existing.Controller != nil && *existing.Controller {
			return fmt.Errorf("%s/%s is already controlled by %s/%s", object.GetNamespace(), object.GetName(), existing.APIVersion, existing.Name)
		}
		nextOwnerReferences = append(nextOwnerReferences, existing)
	}
	object.SetOwnerReferences(append(nextOwnerReferences, ownerReference))
	return nil
}

func isOwnedByInstallation(installation *opslensv1alpha1.OpsLensInstallation, object client.Object) bool {
	for _, owner := range object.GetOwnerReferences() {
		if owner.APIVersion != opslensv1alpha1.GroupVersion.String() || owner.Kind != "OpsLensInstallation" || owner.Name != installation.Name {
			continue
		}
		if owner.UID == installation.UID || owner.UID == "" || installation.UID == "" {
			return true
		}
	}
	return false
}

func targetNamespace(installation *opslensv1alpha1.OpsLensInstallation) string {
	return valueOrDefault(installation.Spec.TargetNamespace, installation.Namespace)
}

func consolePluginEnabled(installation *opslensv1alpha1.OpsLensInstallation) bool {
	return installation.Spec.ConsolePlugin == nil ||
		installation.Spec.ConsolePlugin.Enabled == nil ||
		*installation.Spec.ConsolePlugin.Enabled
}

func consolePluginName(installation *opslensv1alpha1.OpsLensInstallation) string {
	name := "cywell-opslens"
	if installation.Spec.ConsolePlugin != nil {
		name = valueOrDefault(installation.Spec.ConsolePlugin.Name, name)
	}
	return name
}

func valueOrDefault(value string, fallback string) string {
	if value != "" {
		return value
	}
	return fallback
}

func labels(component string) map[string]string {
	return map[string]string{
		"app.kubernetes.io/name":      appName,
		"app.kubernetes.io/component": component,
	}
}

func apiReadOnlyRBACName(namespace string) string {
	return fmt.Sprintf("%s-api-readonly-%s", appName, namespace)
}

func apiReadOnlyPolicyRules() []rbacv1.PolicyRule {
	readOnly := []string{"get", "list", "watch"}
	return []rbacv1.PolicyRule{
		{
			APIGroups: []string{""},
			Resources: []string{
				"configmaps",
				"endpoints",
				"events",
				"limitranges",
				"namespaces",
				"nodes",
				"persistentvolumeclaims",
				"persistentvolumes",
				"pods",
				"pods/log",
				"replicationcontrollers",
				"resourcequotas",
				"serviceaccounts",
				"services",
			},
			Verbs: readOnly,
		},
		{
			APIGroups: []string{"events.k8s.io"},
			Resources: []string{"events"},
			Verbs:     readOnly,
		},
		{
			APIGroups: []string{"apps"},
			Resources: []string{"daemonsets", "deployments", "replicasets", "statefulsets"},
			Verbs:     readOnly,
		},
		{
			APIGroups: []string{"apps.openshift.io"},
			Resources: []string{"deploymentconfigs"},
			Verbs:     readOnly,
		},
		{
			APIGroups: []string{"batch"},
			Resources: []string{"cronjobs", "jobs"},
			Verbs:     readOnly,
		},
		{
			APIGroups: []string{"autoscaling"},
			Resources: []string{"horizontalpodautoscalers"},
			Verbs:     readOnly,
		},
		{
			APIGroups: []string{"policy"},
			Resources: []string{"poddisruptionbudgets"},
			Verbs:     readOnly,
		},
		{
			APIGroups: []string{"route.openshift.io"},
			Resources: []string{"routes"},
			Verbs:     readOnly,
		},
		{
			APIGroups: []string{"networking.k8s.io"},
			Resources: []string{"ingresses", "networkpolicies"},
			Verbs:     readOnly,
		},
		{
			APIGroups: []string{"discovery.k8s.io"},
			Resources: []string{"endpointslices"},
			Verbs:     readOnly,
		},
		{
			APIGroups: []string{"storage.k8s.io"},
			Resources: []string{"storageclasses"},
			Verbs:     readOnly,
		},
		{
			APIGroups: []string{"snapshot.storage.k8s.io"},
			Resources: []string{"volumesnapshots"},
			Verbs:     readOnly,
		},
		{
			APIGroups: []string{"image.openshift.io"},
			Resources: []string{"imagestreams", "imagestreamtags"},
			Verbs:     readOnly,
		},
		{
			APIGroups: []string{"build.openshift.io"},
			Resources: []string{"buildconfigs", "builds"},
			Verbs:     readOnly,
		},
		{
			APIGroups: []string{"operators.coreos.com"},
			Resources: []string{"catalogsources", "clusterserviceversions", "installplans", "subscriptions"},
			Verbs:     readOnly,
		},
		{
			APIGroups: []string{"packages.operators.coreos.com"},
			Resources: []string{"packagemanifests"},
			Verbs:     readOnly,
		},
		{
			APIGroups: []string{"console.openshift.io"},
			Resources: []string{"consoleplugins"},
			Verbs:     readOnly,
		},
		{
			APIGroups: []string{"ols.openshift.io"},
			Resources: []string{"olsconfigs"},
			Verbs:     readOnly,
		},
		{
			APIGroups: []string{"config.openshift.io"},
			Resources: []string{"clusteroperators", "clusterversions", "dnses"},
			Verbs:     readOnly,
		},
		{
			APIGroups: []string{"operator.openshift.io"},
			Resources: []string{"consoles", "dnses"},
			Verbs:     readOnly,
		},
		{
			APIGroups: []string{"apiextensions.k8s.io"},
			Resources: []string{"customresourcedefinitions"},
			Verbs:     readOnly,
		},
		{
			APIGroups: []string{"apiregistration.k8s.io"},
			Resources: []string{"apiservices"},
			Verbs:     readOnly,
		},
		{
			APIGroups: []string{"rbac.authorization.k8s.io"},
			Resources: []string{"clusterrolebindings", "clusterroles", "rolebindings", "roles"},
			Verbs:     readOnly,
		},
		{
			APIGroups: []string{"monitoring.coreos.com"},
			Resources: []string{"podmonitors", "prometheusrules", "servicemonitors"},
			Verbs:     readOnly,
		},
	}
}

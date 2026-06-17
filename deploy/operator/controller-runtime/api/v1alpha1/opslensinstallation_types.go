package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
)

type LightspeedRegistrationMode string

const (
	LightspeedValidateOnly   LightspeedRegistrationMode = "ValidateOnly"
	LightspeedPatchOLSConfig LightspeedRegistrationMode = "PatchOLSConfig"
)

type OpsLensInstallationSpec struct {
	Version                string                         `json:"version"`
	TargetNamespace        string                         `json:"targetNamespace,omitempty"`
	Components             OpsLensComponents             `json:"components"`
	RAG                    *OpsLensRAGPolicy              `json:"rag,omitempty"`
	LightspeedRegistration LightspeedRegistrationSpec     `json:"lightspeedRegistration"`
	ConsolePlugin          *ConsolePluginSpec             `json:"consolePlugin,omitempty"`
}

type OpsLensComponents struct {
	API          APIComponentSpec          `json:"api"`
	Dashboard    DashboardComponentSpec    `json:"dashboard"`
	VectorStore  VectorStoreComponentSpec  `json:"vectorStore"`
	ModelRuntime ModelRuntimeComponentSpec `json:"modelRuntime"`
}

type APIComponentSpec struct {
	Image       string `json:"image"`
	Replicas    *int32 `json:"replicas,omitempty"`
	ServiceName string `json:"serviceName,omitempty"`
}

type DashboardComponentSpec struct {
	Image       string `json:"image"`
	Replicas    *int32 `json:"replicas,omitempty"`
	ServiceName string `json:"serviceName,omitempty"`
}

type VectorStoreComponentSpec struct {
	Provider    string `json:"provider"`
	Image       string `json:"image,omitempty"`
	StorageSize string `json:"storageSize,omitempty"`
}

type ModelRuntimeComponentSpec struct {
	Provider string      `json:"provider"`
	Image    string      `json:"image,omitempty"`
	Model    string      `json:"model"`
	Replicas *int32      `json:"replicas,omitempty"`
	GPU      *GPUSpec     `json:"gpu,omitempty"`
}

type GPUSpec struct {
	Enabled     *bool  `json:"enabled,omitempty"`
	DeviceClass string `json:"deviceClass,omitempty"`
	Count       *int32 `json:"count,omitempty"`
}

type OpsLensRAGPolicy struct {
	DocumentIntake *RAGDocumentIntakeSpec `json:"documentIntake,omitempty"`
	ApprovalQueue *RAGApprovalQueueSpec   `json:"approvalQueue,omitempty"`
}

type RAGDocumentIntakeSpec struct {
	Mode                     string `json:"mode,omitempty"`
	EvidenceExport           *bool  `json:"evidenceExport,omitempty"`
	RawDocumentReturnAllowed *bool  `json:"rawDocumentReturnAllowed,omitempty"`
}

type RAGApprovalQueueSpec struct {
	Mode              string   `json:"mode,omitempty"`
	EnqueueAllowed    *bool    `json:"enqueueAllowed,omitempty"`
	RequiredApprovals []string `json:"requiredApprovals,omitempty"`
}

type LightspeedRegistrationSpec struct {
	Mode                LightspeedRegistrationMode `json:"mode,omitempty"`
	OLSConfigName       string                     `json:"olsConfigName,omitempty"`
	OLSConfigNamespace  string                     `json:"olsConfigNamespace,omitempty"`
	MCPServerName       string                     `json:"mcpServerName,omitempty"`
	APIKeySecretName    string                     `json:"apiKeySecretName,omitempty"`
	UserTokenForwarding *bool                      `json:"userTokenForwarding,omitempty"`
	Endpoint            string                     `json:"endpoint,omitempty"`
}

type ConsolePluginSpec struct {
	Enabled *bool  `json:"enabled,omitempty"`
	Name    string `json:"name,omitempty"`
}

type OpsLensInstallationStatus struct {
	Phase                  string                            `json:"phase,omitempty"`
	Conditions             []metav1.Condition                `json:"conditions,omitempty"`
	Components             map[string]OpsLensComponentStatus `json:"components,omitempty"`
	DashboardRoute          DashboardRouteStatus              `json:"dashboardRoute,omitempty"`
	LightspeedRegistration LightspeedRegistrationStatus      `json:"lightspeedRegistration,omitempty"`
	RAG                    RAGPolicyStatus                   `json:"rag,omitempty"`
}

type OpsLensComponentStatus struct {
	Ready   bool   `json:"ready"`
	Service string `json:"service,omitempty"`
	Image   string `json:"image,omitempty"`
}

type DashboardRouteStatus struct {
	Ready      bool   `json:"ready"`
	Name       string `json:"name,omitempty"`
	Service    string `json:"service,omitempty"`
	Host       string `json:"host,omitempty"`
	TLS        string `json:"tls,omitempty"`
	EntryPoint string `json:"entryPoint,omitempty"`
}

type LightspeedRegistrationStatus struct {
	Phase    string   `json:"phase,omitempty"`
	Evidence []string `json:"evidence,omitempty"`
}

type RAGPolicyStatus struct {
	DocumentIntake RAGDocumentIntakeStatus `json:"documentIntake,omitempty"`
	ApprovalQueue RAGApprovalQueueStatus   `json:"approvalQueue,omitempty"`
}

type RAGDocumentIntakeStatus struct {
	Mode                     string `json:"mode,omitempty"`
	EvidenceExport           string `json:"evidenceExport,omitempty"`
	RawDocumentReturnAllowed bool   `json:"rawDocumentReturnAllowed"`
}

type RAGApprovalQueueStatus struct {
	Phase          string   `json:"phase,omitempty"`
	EnqueueAllowed bool     `json:"enqueueAllowed"`
	Evidence       []string `json:"evidence,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
type OpsLensInstallation struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`
	Spec              OpsLensInstallationSpec   `json:"spec,omitempty"`
	Status            OpsLensInstallationStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true
type OpsLensInstallationList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []OpsLensInstallation `json:"items"`
}

func (in *OpsLensInstallation) DeepCopyObject() runtime.Object {
	if in == nil {
		return nil
	}
	out := new(OpsLensInstallation)
	*out = *in
	out.ObjectMeta = *in.ObjectMeta.DeepCopy()
	return out
}

func (in *OpsLensInstallationList) DeepCopyObject() runtime.Object {
	if in == nil {
		return nil
	}
	out := new(OpsLensInstallationList)
	*out = *in
	out.ListMeta = in.ListMeta
	if in.Items != nil {
		out.Items = make([]OpsLensInstallation, len(in.Items))
		copy(out.Items, in.Items)
	}
	return out
}

func init() {
	SchemeBuilder.Register(&OpsLensInstallation{}, &OpsLensInstallationList{})
}

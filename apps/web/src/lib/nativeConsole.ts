import type { OcpResourceSummary } from "@kugnus/contracts";

export interface NativeConsoleResourceRef {
  apiVersion: string;
  resource: string;
  kind?: string;
}

export function nativeConsoleHref(path: string) {
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (window.location.hostname.includes("console-openshift-console")) {
      return `${origin}${path}`;
    }
  }
  return `https://console-openshift-console.apps-crc.testing${path}`;
}

export function nativeConsoleApiPath(resource: NativeConsoleResourceRef, item?: OcpResourceSummary) {
  const kind = item?.kind || resource.kind || resource.resource;
  const apiPath =
    resource.apiVersion === "v1"
      ? `core~v1~${kind}`
      : `${resource.apiVersion.replace("/", "~")}~${kind}`;

  return encodeURIComponent(apiPath);
}

export function nativeObjectPath(
  resource: NativeConsoleResourceRef,
  item: OcpResourceSummary
) {
  const name = encodeURIComponent(item.metadata.name);
  const apiPath = nativeConsoleApiPath(resource, item);
  const namespace = item.metadata.namespace;

  if (namespace) {
    return `/k8s/ns/${encodeURIComponent(namespace)}/${apiPath}/${name}`;
  }

  return `/k8s/cluster/${apiPath}/${name}`;
}

export function nativeResourceListPath(
  resource: NativeConsoleResourceRef,
  namespace = "default"
) {
  const apiPath = nativeConsoleApiPath(resource);
  return `/k8s/ns/${encodeURIComponent(namespace)}/${apiPath}`;
}

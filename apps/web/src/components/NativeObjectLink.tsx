import type { OcpResourceSummary } from "@kugnus/contracts";
import { ExternalLink } from "lucide-react";
import type React from "react";
import {
  nativeConsoleHref,
  nativeObjectPath,
  type NativeConsoleResourceRef
} from "../lib/nativeConsole";

interface NativeObjectLinkProps {
  resource: NativeConsoleResourceRef;
  item: OcpResourceSummary;
  children?: React.ReactNode;
  testId?: string;
}

export function NativeObjectLink({
  resource,
  item,
  children,
  testId
}: NativeObjectLinkProps) {
  return (
    <a
      className="native-object-name-link"
      href={nativeConsoleHref(nativeObjectPath(resource, item))}
      target="_blank"
      rel="noreferrer"
      data-testid={testId}
    >
      <strong>{children ?? item.metadata.name}</strong>
      <ExternalLink size={12} aria-hidden="true" />
    </a>
  );
}

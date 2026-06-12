import * as React from "react";

const pluginName = "cywell-opslens";
const apiProxyBase = `/api/proxy/plugin/${pluginName}/opslens-api`;
const dashboardUrl = `/api/plugins/${pluginName}/index.html?apiBase=${encodeURIComponent(apiProxyBase)}&surface=console-plugin`;

export default function OpsLensRoute() {
  return (
    <iframe
      data-testid="opslens-console-plugin-frame"
      src={dashboardUrl}
      style={{
        border: 0,
        display: "block",
        height: "calc(100vh - 56px)",
        width: "100%"
      }}
      title="Cywell OpsLens"
    />
  );
}

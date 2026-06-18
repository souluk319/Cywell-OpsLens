const pluginName = "cywell-opslens";
const apiProxyBase = `/api/proxy/plugin/${pluginName}/opslens-api`;
const dashboardUrl = `/api/plugins/${pluginName}/index.html?apiBase=${encodeURIComponent(apiProxyBase)}&surface=console-plugin`;

export default function OpsLensRoute() {
  if (typeof window !== "undefined") {
    window.location.replace(dashboardUrl);
  }

  return null;
}

const apiProxyBase = "/api/proxy/plugin/cywell-opslens/opslens-api";
const OPSLENS_DASHBOARD_URL = `/api/plugins/cywell-opslens/index.html?apiBase=${encodeURIComponent(apiProxyBase)}&surface=console-plugin`;

export default function OpsLensRoute() {
  if (typeof window !== "undefined") {
    window.location.replace(OPSLENS_DASHBOARD_URL);
  }

  return null;
}

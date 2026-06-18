const OPSLENS_DASHBOARD_URL =
  "/api/plugins/cywell-opslens/index.html?apiBase=%2Fapi%2Fproxy%2Fplugin%2Fcywell-opslens%2Fopslens-api&surface=console-plugin";

export default function OpsLensRoute() {
  if (typeof window !== "undefined") {
    window.location.replace(OPSLENS_DASHBOARD_URL);
  }

  return null;
}

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";

let loaded = false;

function findEnvFile(start = process.cwd()) {
  let current = resolve(start);
  const root = parse(current).root;

  while (true) {
    const candidate = join(current, ".env");
    if (existsSync(candidate)) {
      return candidate;
    }
    if (current === root) {
      return undefined;
    }
    current = dirname(current);
  }
}

export function loadEnvFile(path = findEnvFile()) {
  if (loaded || !path || !existsSync(path)) {
    loaded = true;
    return;
  }

  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const index = line.indexOf("=");
    if (index < 0) {
      continue;
    }

    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }

  loaded = true;
}

export interface OcpConfig {
  baseUrl?: string;
  baseUrlCandidates: string[];
  token?: string;
  tokenCandidates: string[];
  caCert?: string;
  tlsVerify: boolean;
  allowSecretFetch: boolean;
  enableMonitoringProxy: boolean;
  timeoutMs: number;
}

function boolFromEnv(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) {
    return defaultValue;
  }
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function firstEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function ocpTlsVerifyFromEnv() {
  const explicitVerify = firstEnv(
    "OCP_TLS_VERIFY",
    "OPENSHIFT_API_TLS_VERIFY",
    "KUBE_TLS_VERIFY"
  );
  if (explicitVerify !== undefined) {
    return boolFromEnv(explicitVerify, true);
  }

  const insecureSkip = firstEnv(
    "OCP_INSECURE_SKIP_TLS_VERIFY",
    "OPENSHIFT_API_INSECURE_SKIP_TLS_VERIFY",
    "KUBE_INSECURE_SKIP_TLS_VERIFY"
  );
  if (insecureSkip !== undefined) {
    return !boolFromEnv(insecureSkip, false);
  }

  return true;
}

function secondsFromEnv(value: string | undefined, defaultValue: number) {
  if (value === undefined) {
    return defaultValue;
  }
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : defaultValue;
}

export function getOcpConfig(): OcpConfig {
  loadEnvFile();

  const explicitBaseUrl =
    process.env.OCP_API_BASE_URL ??
    process.env.OPENSHIFT_API_BASE_URL ??
    process.env.KUBE_API_BASE_URL;
  const inClusterBaseUrl = readInClusterBaseUrl();
  const baseUrlCandidates = Array.from(
    new Set(
      [explicitBaseUrl, inClusterBaseUrl, ...readKubeconfigServers()].filter(
        (value): value is string => Boolean(value)
      )
    )
  );
  const explicitToken =
    process.env.OCP_API_TOKEN ??
    process.env.OPENSHIFT_API_TOKEN ??
    process.env.KUBE_API_TOKEN;
  const inClusterToken = readInClusterServiceAccountToken();
  const tokenCandidates = Array.from(
    new Set(
      [explicitToken, inClusterToken, ...readKubeconfigTokens()].filter(
        (value): value is string => Boolean(value)
      )
    )
  );

  return {
    baseUrl: explicitBaseUrl ?? baseUrlCandidates[0],
    baseUrlCandidates,
    token: explicitToken ?? tokenCandidates[0],
    tokenCandidates,
    caCert: readInClusterServiceAccountCa(),
    tlsVerify: ocpTlsVerifyFromEnv(),
    allowSecretFetch: boolFromEnv(process.env.OCP_ALLOW_SECRET_FETCH, false),
    enableMonitoringProxy: boolFromEnv(
      process.env.OCP_ENABLE_MONITORING_PROXY,
      false
    ),
    timeoutMs:
      secondsFromEnv(
        firstEnv(
          "OCP_API_TIMEOUT_SECONDS",
          "OPENSHIFT_API_TIMEOUT_SECONDS",
          "KUBE_API_TIMEOUT_SECONDS"
        ),
        8
      ) * 1000
  };
}

function readInClusterBaseUrl() {
  const host = process.env.KUBERNETES_SERVICE_HOST;
  const port = process.env.KUBERNETES_SERVICE_PORT ?? "443";
  if (!host) {
    return undefined;
  }
  return `https://${host}:${port}`;
}

function readInClusterServiceAccountToken() {
  const tokenPath =
    process.env.KUBERNETES_SERVICEACCOUNT_TOKEN_PATH ??
    "/var/run/secrets/kubernetes.io/serviceaccount/token";
  if (!existsSync(tokenPath)) {
    return undefined;
  }
  const token = readFileSync(tokenPath, "utf8").trim();
  return token || undefined;
}

function readInClusterServiceAccountCa() {
  const caPath =
    process.env.KUBERNETES_SERVICEACCOUNT_CA_PATH ??
    "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt";
  if (!existsSync(caPath)) {
    return undefined;
  }
  const ca = readFileSync(caPath, "utf8");
  return ca.trim() ? ca : undefined;
}

function readKubeconfigServers() {
  const kubeconfig = process.env.KUBECONFIG ?? join(homedir(), ".kube", "config");
  const paths = kubeconfig.split(process.platform === "win32" ? ";" : ":");
  const servers: string[] = [];

  for (const path of paths) {
    if (!path || !existsSync(path)) {
      continue;
    }
    const content = readFileSync(path, "utf8");
    for (const match of content.matchAll(/server:\s*(https?:\/\/\S+)/g)) {
      servers.push(match[1].trim());
    }
  }

  return servers;
}

function readKubeconfigTokens() {
  const kubeconfig = process.env.KUBECONFIG ?? join(homedir(), ".kube", "config");
  const paths = kubeconfig.split(process.platform === "win32" ? ";" : ":");
  const tokens: string[] = [];

  for (const path of paths) {
    if (!path || !existsSync(path)) {
      continue;
    }
    const content = readFileSync(path, "utf8");
    for (const match of content.matchAll(/token:\s*("?)(\S+?)\1\s*$/gm)) {
      tokens.push(match[2].trim());
    }
  }

  return tokens;
}

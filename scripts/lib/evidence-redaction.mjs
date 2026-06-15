import { existsSync, readFileSync } from "node:fs";

const COMMON_VALUE_DENYLIST = new Set(["true", "false", "0", "1", "yes", "no"]);

const ENDPOINT_KEY_PATTERN =
  /(?:OCP|OPENSHIFT|KUBE|KUBERNETES|LIGHTSPEED|CYWELL_OPSLENS).*?(?:URL|URI|HOST|HOSTNAME|SERVER|ENDPOINT|BASE_URL)/i;
const SECRET_KEY_PATTERN = /(?:TOKEN|PASSWORD|PASSWD|SECRET|API[_-]?KEY|BEARER)/i;

function dotEnvEntries() {
  if (!existsSync(".env")) return [];
  return readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .flatMap((line) => {
      const match = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (!match) return [];
      const value = match[2].trim().replace(/^['"]|['"]$/g, "");
      return [[match[1], value]];
    });
}

function envEntries() {
  return Object.entries(process.env).filter(([key]) =>
    /(?:OCP|OPENSHIFT|KUBE|KUBERNETES|LIGHTSPEED|CYWELL_OPSLENS)/i.test(key)
  );
}

function usefulValue(value) {
  const text = String(value ?? "").trim();
  return text.length >= 8 && !COMMON_VALUE_DENYLIST.has(text.toLowerCase());
}

function addUrlParts(values, value) {
  try {
    const url = new URL(value);
    for (const part of [url.host, url.hostname, `${url.protocol}//${url.host}`]) {
      if (usefulValue(part)) values.add(part);
    }
  } catch {
    // Non-URL values can still be hostnames or tokens.
  }
}

function configuredValues(pattern) {
  const values = new Set();
  for (const [key, value] of [...dotEnvEntries(), ...envEntries()]) {
    if (!pattern.test(key) || !usefulValue(value)) continue;
    values.add(String(value).trim());
    addUrlParts(values, String(value).trim());
  }
  return [...values].sort((left, right) => right.length - left.length);
}

export function configuredEndpointValues() {
  return configuredValues(ENDPOINT_KEY_PATTERN);
}

export function configuredSecretValues() {
  return configuredValues(SECRET_KEY_PATTERN);
}

export function sanitizeConfiguredEndpoints(value, replacement = "<redacted-live-endpoint>") {
  let result = String(value ?? "");
  for (const endpoint of configuredEndpointValues()) {
    result = result.split(endpoint).join(replacement);
  }
  return result;
}

export function sanitizeConfiguredSecrets(value, replacement = "<redacted>") {
  let result = String(value ?? "");
  for (const secret of configuredSecretValues()) {
    result = result.split(secret).join(replacement);
  }
  return result;
}

export function sanitizeCommonSensitive(value) {
  return sanitizeConfiguredSecrets(sanitizeConfiguredEndpoints(value))
    .replace(/--token\s+\S+/gi, "--token <redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/([?&](?:access_)?token=)[^&\s]+/gi, "$1<redacted>")
    .replace(/(auth|token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>")
    .replace(
      /\b(?:10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})\b/g,
      "<redacted-private-ip>"
    );
}

export function sensitiveEndpointLeakLike(value) {
  const text = String(value ?? "");
  return configuredEndpointValues().some((endpoint) => text.includes(endpoint)) ||
    /\b(?:10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})\b/.test(text);
}

export function sanitizeArtifact(value, stringSanitizer = sanitizeCommonSensitive) {
  if (typeof value === "string") return stringSanitizer(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeArtifact(item, stringSanitizer));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        sanitizeArtifact(nestedValue, stringSanitizer)
      ])
    );
  }
  return value;
}

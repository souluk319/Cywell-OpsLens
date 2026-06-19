# Cywell OpsLens Dev 0.1.8 KH Connectivity Answer Sheet

Date: 2026-06-19
Branch: feat/OpsLens-Dev0.1.8
Head: 48e82dc2
Target tag: v0.1.8-kh-crc420-48e82dc2
Target cluster: KH Windows CRC, OpenShift 4.20.x, linux-amd64

## Goal

Dev 0.1.8 is not considered complete because images are built or pods are Ready.
It is complete only when the installed Operator, ConsolePlugin, dashboard route,
OpsLens API, OpenShift resource proxy, and OpenShift Lightspeed assistant path are
all connected on the KH CRC cluster.

## Official Contract

1. OpenShift Console dynamic plugins are the supported extension mechanism for
   custom pages, navigation items, perspectives, and proxy-backed console calls.
   - Source: Red Hat OpenShift Container Platform 4.20 web console dynamic plugins.
   - Required proof: `ConsolePlugin/cywell-opslens` exists and
     `console.operator.openshift.io/cluster.spec.plugins` contains
     `cywell-opslens`.

2. A ConsolePlugin proxy that needs the logged-in OpenShift user's token must use
   `authorization: UserToken`.
   - Source: Red Hat ConsolePlugin dynamic plugin proxy documentation.
   - Required proof: `ConsolePlugin/cywell-opslens.spec.proxy[alias=opslens-api]`
     has `authorization: UserToken`.

3. OpenShift Lightspeed is valid only after its provider Secret, `OLSConfig`, and
   app-server deployment are Ready.
   - Source: Red Hat OpenShift Lightspeed configuration documentation.
   - Required proof: `OLSConfig/cluster` is Ready and `lightspeed-app-server` is
     Available.

4. OpenShift Lightspeed REST queries require a Kubernetes bearer token with
   Lightspeed query access.
   - Source: Red Hat OpenShift Lightspeed RBAC and REST API documentation.
   - Required proof: the OpsLens API service account can call the Lightspeed API,
     or the ConsolePlugin proxy forwards an authorized user token.

5. Cluster introspection is a separate capability from "the dashboard is up".
   - Required proof: OpsLens must separately report API health, OCP API reachability,
     ConsolePlugin proxy status, Lightspeed readiness, and assistant response.

## Fixed Failure Causes

| Cause | Symptom | Root cause | Current fix |
| --- | --- | --- | --- |
| stale-catalog-tag | package/CSV still showed an older build | CatalogSource and OLM cached old package metadata | Rebuilt and pushed a tag-specific catalog image, then replaced stale Subscription/CSV/InstallPlan state |
| stale-deployment-image | API/dashboard stayed on an older image tag | Existing CR and operator reconciliation did not converge to the new tag | Updated `OpsLensInstallation.spec` and verified deployment images match the target tag |
| consoleplugin-disabled | OpenShift console had no OpsLens entry | ConsolePlugin CR alone is not enough | Added `cywell-opslens` to `console.operator.openshift.io/cluster.spec.plugins` |
| route-asset-404 | first click or plugin route could serve 404/stale UI | route/plugin asset path and cached plugin bundle were not validated together | Verifier now checks `/opslens` and plugin asset route separately |
| lightspeed-networkpolicy-denied | OpsLens API said Lightspeed unavailable | `lightspeed-app-server` NetworkPolicy allowed console/monitoring but not `cywell-opslens` API pods | Added KH dev allow policy from OpsLens API pods to Lightspeed app-server TCP 8443 |
| api-proxy-400 | BuildConfig list path failed with HTTP 400 | Exact API path had to be validated after new API deployment | Verified exact BuildConfig resource path returns HTTP 200 from the deployed API pod |

## KH Dev-Only Network Policy

The Lightspeed app-server was Ready, but OpsLens API pods could not reach it.
The fix is intentionally narrow:

- namespace: `openshift-lightspeed`
- ingress target: `lightspeed-app-server`
- allowed source namespace: `cywell-opslens`
- allowed source pod labels:
  - `app.kubernetes.io/name=cywell-opslens`
  - `app.kubernetes.io/component=api`
- port: TCP 8443

This is a KH CRC development connectivity policy. A production design should turn
the same requirement into install-time RBAC/network policy generation with explicit
cluster-owner approval.

## Acceptance Criteria

The deployment gate passes only if all required checks are true:

- CatalogSource image uses `v0.1.8-kh-crc420-48e82dc2`.
- PackageManifest current CSV is `cywell-opslens-operator.v0.1.8`.
- Subscription current/installed CSV is `cywell-opslens-operator.v0.1.8`.
- CSV phase is `Succeeded`.
- Operator, API, and dashboard deployments are 1/1 and use the target tag.
- `OpsLensInstallation/cywell-opslens` is Ready and reports version `0.1.8`.
- Dashboard route returns HTTP 200.
- OpenShift console `/opslens` route returns HTTP 200.
- ConsolePlugin is enabled in the console Operator config.
- ConsolePlugin `opslens-api` proxy uses `UserToken`.
- API pod can reach Kubernetes API with its in-cluster service account.
- API pod can reach `lightspeed-app-server` `/readiness`.
- API pod can query the OpsLens BuildConfig resource path without HTTP 400.
- OpsLens assistant returns a real `openshift-lightspeed/...` response.

Known warning:

- The Codex in-app browser can be blocked by the local CRC certificate authority.
  CLI/route verification can pass while visual first-click still needs a logged-in
  Chrome or user browser session check.

## Verification Commands

```powershell
npm run verify:kh:crc420-deployment
npm run verify:kh:crc420-connection
npm run verify:console-plugin
```

Expected status:

- `verify:kh:crc420-deployment`: `PASS_WITH_WARNINGS` at worst, with only the
  browser CA warning remaining.
- `verify:kh:crc420-connection`: `PASS_WITH_WARNINGS` at worst, with no required
  connectivity failure.
- `verify:console-plugin`: `0 fail`.

## Current Verified State

Latest KH gate result:

- Deployment gate: `PASS_WITH_WARNINGS`
- Connection gate: `PASS_WITH_WARNINGS`
- ConsolePlugin asset gate: `0 fail`

Required connectivity is passing:

- Operator, API, dashboard, catalog, Subscription, InstallPlan, CSV, and CR all
  match `v0.1.8-kh-crc420-48e82dc2`.
- `/opslens` returns HTTP 200 from the OpenShift console route.
- Dashboard route returns HTTP 200.
- ConsolePlugin `opslens-api` proxy uses `UserToken`.
- Anonymous proxy requests are blocked with HTTP 401, which is expected.
- OpsLens API can reach the Kubernetes API from its in-cluster service account.
- OpsLens API can reach OpenShift Lightspeed app-server readiness.
- The exact BuildConfig resource path that previously emitted HTTP 400 now
  returns HTTP 200.
- OpsLens assistant returns through
  `openshift-lightspeed/v1/streaming_query:ask`.

Remaining warning:

- `browser:first-load`: Codex in-app browser is blocked by the KH CRC local CA.
  This is a visual/browser trust issue, not an OpsLens route/API/Lightspeed
  connection failure. Logged-in Chrome/user-browser verification is still needed
  for screenshots.

## Evidence Files

- `test-results/cywell-opslens-kh-crc420-deployment.json`
- `test-results/cywell-opslens-kh-crc420-connection.json`
- `test-results/cywell-opslens-console-plugin-assets.json`
- `test-results/kh-opslens-api-lightspeed-smoke-v0.1.8-48e82dc2.json`
- `test-results/kh-opslens-api-buildconfigs-smoke-v0.1.8-48e82dc2.txt`

## Source Links

- Red Hat OpenShift 4.20 web console dynamic plugins:
  https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html-single/web_console/index
- ConsolePlugin API:
  https://docs.redhat.com/en/documentation/openshift_container_platform/4.17/html/console_apis/consoleplugin-console-openshift-io-v1
- OpenShift Lightspeed install:
  https://docs.redhat.com/en/documentation/red_hat_openshift_lightspeed/1.0/html/install/ols-installing-lightspeed
- OpenShift Lightspeed configure:
  https://docs.redhat.com/en/documentation/red_hat_openshift_lightspeed/1.0/html/configure/ols-configuring-openshift-lightspeed
- OLSConfig API:
  https://docs.redhat.com/en/documentation/red_hat_openshift_lightspeed/1.0/html/configure/olsconfig-api

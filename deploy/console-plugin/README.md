# Cywell OpsLens Manual ConsolePlugin Deploy

Goal: prove the OpenShift Web Console left navigation entry first. The ConsolePlugin must add one official left-nav shortcut named `Cywell OpsLens`, route it to `/opslens`, and use that route only as a launcher to the independent OpsLens dashboard asset. It must not iframe the dashboard.

Pass/fail target:

- `ConsolePlugin/cywell-opslens` exists.
- `Deployment/cywell-opslens-console-plugin` is ready in `cywell-opslens-system`.
- `Service/cywell-opslens-console-plugin` serves HTTPS assets on port `9443`.
- `consoles.operator.openshift.io/cluster.spec.plugins` contains `cywell-opslens` without removing any existing plugin.
- Administrator perspective shows `Cywell OpsLens` in the left navigation.
- Clicking it opens `/opslens`, then the launcher route redirects to the full OpsLens dashboard asset.

Local preparation:

```bash
npm run -w @kugnus/web build
npm run verify:console-plugin
```

Approval-gated CRC actions:

```bash
oc apply -f deploy/console-plugin/
oc get deployment,svc -n cywell-opslens-system
oc get consoleplugin cywell-opslens
```

Enable the plugin only with a merge-safe JSON patch:

```bash
oc get console.operator.openshift.io cluster -o json \
  | node scripts/print-console-plugin-enable-patch.mjs \
  > test-results/cywell-opslens-console-plugin-enable.patch.json

cat test-results/cywell-opslens-console-plugin-enable.patch.json

oc patch console.operator.openshift.io cluster \
  --type=json \
  --patch-file=test-results/cywell-opslens-console-plugin-enable.patch.json
```

If the generated patch is `[]`, the plugin is already enabled and no patch is needed.

Read-only evidence after the console reload:

```bash
oc get console.operator.openshift.io cluster -o jsonpath='{.spec.plugins}{"\n"}'
oc get deployment/cywell-opslens-console-plugin -n cywell-opslens-system
oc get svc/cywell-opslens-console-plugin -n cywell-opslens-system
oc get consoleplugin cywell-opslens -o yaml
```

Known boundary: this manual path proves the ConsolePlugin menu shortcut and launcher route before Operator wrapping. Full dashboard API calls need the `opslens-api` proxy target service to exist; that is separate from the first menu-render proof.

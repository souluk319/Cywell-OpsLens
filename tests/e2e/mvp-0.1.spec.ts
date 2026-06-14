import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mockContext } from "@kugnus/contracts";

test.describe("Cywell OpsLens MVP 0.1 acceptance", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  async function openAssistant(page: Page) {
    await page.getByTestId("assistant-launcher").click();
    await expect(page.getByTestId("assistant-popover")).toBeVisible();
  }

  test("AC-UI-001 keeps alert evidence visible while assistant popover is open", async ({
    page
  }) => {
    await expect(page.getByTestId("assistant-launcher")).toBeVisible();
    await expect(page.getByTestId("assistant-popover")).toHaveCount(0);
    await openAssistant(page);
    await expect(page.getByTestId("alert-evidence-table")).toBeVisible();
    await expect(page.getByTestId("severity-header")).toBeVisible();
    await expect(page.getByTestId("count-header")).toBeVisible();
    await expect(page.getByTestId("status-header")).toBeVisible();

    const layout = await page.evaluate(() => {
      const rect = (testId: string) => {
        const node = document.querySelector(`[data-testid="${testId}"]`);
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return {
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          width: box.width,
          height: box.height
        };
      };

      return {
        popover: rect("assistant-popover"),
        wrap: rect("alert-table-wrap"),
        headers: [
          rect("severity-header"),
          rect("count-header"),
          rect("status-header")
        ]
      };
    });

    expect(layout.popover).not.toBeNull();
    expect(layout.wrap).not.toBeNull();
    for (const box of layout.headers) {
      expect(box).not.toBeNull();
      expect(box?.right ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(layout.wrap?.right ?? 0);
      const overlapsPopover =
        (box?.right ?? 0) > (layout.popover?.left ?? 0) &&
        (box?.left ?? 0) < (layout.popover?.right ?? 0) &&
        (box?.bottom ?? 0) > (layout.popover?.top ?? 0) &&
        (box?.top ?? 0) < (layout.popover?.bottom ?? 0);
      expect(overlapsPopover).toBe(false);
    }

    await page.screenshot({
      path: "test-results/playwright/ac-ui-001-alerts-non-occluding.png",
      fullPage: false
    });
  });

  test("AC-UI-002 opens assistant from the lower-right launcher without resizing console workspace", async ({
    page
  }) => {
    const before = await page.getByTestId("workspace").boundingBox();
    await expect(page.getByTestId("assistant-launcher")).toHaveAttribute(
      "aria-expanded",
      "false"
    );

    await openAssistant(page);
    await expect(page.getByTestId("assistant-launcher")).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    const after = await page.getByTestId("workspace").boundingBox();
    const launcher = await page.getByTestId("assistant-launcher").boundingBox();
    const popover = await page.getByTestId("assistant-popover").boundingBox();

    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(launcher).not.toBeNull();
    expect(popover).not.toBeNull();
    expect(Math.round(after?.width ?? 0)).toBe(Math.round(before?.width ?? 0));
    expect((launcher?.right ?? 0) > (after?.right ?? 0) - 96).toBe(true);
    expect((launcher?.bottom ?? 0) > (after?.bottom ?? 0) - 96).toBe(true);
    expect((popover?.right ?? 0) <= (launcher?.right ?? 0) + 4).toBe(true);

    await page.getByRole("button", { name: "Close assistant" }).click();
    await expect(page.getByTestId("assistant-popover")).toHaveCount(0);
    await expect(page.getByTestId("assistant-launcher")).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  test("AC-CTX-001 renders context chips and publisher payload", async ({
    page
  }) => {
    await openAssistant(page);
    await expect(page.getByTestId("api-status")).toContainText("API ready");
    await expect(page.getByTestId("context-chips")).toContainText("Cluster");
    await expect(page.getByTestId("context-chips")).toContainText(
      "prod-ocp"
    );
    await expect(page.getByTestId("context-chips")).toContainText(
      "openshift-cluster-version"
    );

    const payload = await page.getByTestId("context-payload").textContent();
    const parsed = JSON.parse(payload ?? "{}") as {
      route?: string;
      namespace?: string;
      selectedTab?: string;
      filters?: Record<string, string>;
      visibleRows?: unknown[];
      resource?: { kind?: string; name?: string };
    };

    expect(parsed.route).toContain("/monitoring/alerts");
    expect(parsed.namespace).toBe("openshift-cluster-version");
    expect(parsed.selectedTab).toBe("Alerts");
    expect(parsed.filters?.state).toBe("firing");
    expect(parsed.resource?.kind).toBe("ClusterVersion");
    expect(parsed.resource?.name).toBe("version");
    expect(parsed.visibleRows?.length).toBeGreaterThanOrEqual(3);
    await expect(page.getByTestId("api-trace")).toContainText("plan-");
  });

  test("AC-ANS-001 answer contract includes evidence, citations, risk, and rollback", async ({
    page
  }) => {
    await openAssistant(page);
    const requiredBlocks = [
      "answer-judgment",
      "answer-evidence",
      "answer-candidates",
      "answer-next-checks",
      "answer-risks",
      "answer-rollback",
      "answer-citations"
    ];

    for (const block of requiredBlocks) {
      await expect(page.getByTestId(block)).toBeVisible();
      await expect(page.getByTestId(block)).not.toBeEmpty();
    }

    await expect(page.getByTestId("answer-risks")).toContainText(
      "Missing Evidence"
    );
    await expect(page.getByTestId("answer-rollback")).toContainText(
      "Rollback"
    );
    await expect(page.getByTestId("answer-citations")).toContainText(
      "OpenShift update troubleshooting docs"
    );
  });

  test("AC-SAFE-001 remains read-only and preserves log/YAML evidence surfaces", async ({
    page
  }) => {
    await openAssistant(page);
    await expect(page.getByTestId("assistant-popover")).toContainText(
      "actionMode=readOnly"
    );
    await expect(page.getByTestId("assistant-popover")).not.toContainText(
      "oc apply"
    );
    await expect(page.getByTestId("assistant-popover")).not.toContainText(
      "oc delete"
    );
    await expect(page.getByTestId("assistant-popover")).not.toContainText(
      "oc scale"
    );

    await page.getByRole("button", { name: "Logs" }).click();
    await expect(page.getByTestId("log-viewport")).toBeVisible();

    const workspaceBox = await page.getByTestId("workspace").boundingBox();
    const logBox = await page.getByTestId("log-viewport").boundingBox();
    expect(workspaceBox).not.toBeNull();
    expect(logBox).not.toBeNull();
    expect((logBox?.width ?? 0) / (workspaceBox?.width ?? 1)).toBeGreaterThan(
      0.5
    );

    await page
      .getByLabel("Evidence view")
      .getByRole("button", { name: "YAML" })
      .click();
    const yaml = page.getByTestId("yaml-textarea");
    await expect(yaml).toBeVisible();
    const selectionWorks = await yaml.evaluate((node) => {
      const textarea = node as HTMLTextAreaElement;
      textarea.setSelectionRange(0, 10);
      return textarea.selectionStart === 0 && textarea.selectionEnd === 10;
    });
    expect(selectionWorks).toBe(true);
  });

  test("AC-API-001 exposes dashboard, context sync, and action plan contracts", async ({
    request
  }) => {
    const dashboard = await request.get("/api/dashboard/risks");
    expect(dashboard.ok()).toBe(true);
    const dashboardBody = (await dashboard.json()) as {
      source?: string;
      activeRisks?: unknown[];
      knowledgeSources?: unknown[];
    };
    expect(dashboardBody.source).toBe("mock-backend");
    expect(dashboardBody.activeRisks?.length).toBeGreaterThanOrEqual(3);
    expect(dashboardBody.knowledgeSources?.length).toBeGreaterThanOrEqual(2);

    const context = await request.post("/api/context/sync", {
      data: {
        context: mockContext
      }
    });
    expect(context.ok()).toBe(true);
    const contextBody = (await context.json()) as {
      accepted?: boolean;
      requestId?: string;
      contextHash?: string;
      rbac?: { namespaceScope?: string };
    };
    expect(contextBody.accepted).toBe(true);
    expect(contextBody.requestId).toContain("ctx-");
    expect(contextBody.contextHash).toHaveLength(16);
    expect(contextBody.rbac?.namespaceScope).toBe(
      "openshift-cluster-version"
    );

    const plan = await request.post("/api/actions/plan", {
      data: {
        prompt: "ClusterNotUpgradeable alert를 triage 해줘.",
        context: mockContext,
        scenario: "ClusterNotUpgradeable"
      }
    });
    expect(plan.ok()).toBe(true);
    const planBody = (await plan.json()) as {
      requestId?: string;
      answer?: { actionMode?: string; citations?: unknown[] };
      audit?: {
        contextHash?: string;
        sources?: string[];
        actionMode?: string;
      };
    };
    expect(planBody.requestId).toContain("plan-");
    expect(planBody.answer?.actionMode).toBe("readOnly");
    expect(planBody.answer?.citations?.length).toBeGreaterThanOrEqual(2);
    expect(planBody.audit?.contextHash).toHaveLength(16);
    expect(planBody.audit?.sources?.length).toBeGreaterThanOrEqual(3);
    expect(planBody.audit?.actionMode).toBe("readOnly");
  });

  test("AC-LS-001 exposes Cywell OpsLens as a read-only Lightspeed MCP tool surface", async ({
    request
  }) => {
    const tools = await request.get("/api/opslens/tools");
    expect(tools.ok()).toBe(true);
    const toolsBody = (await tools.json()) as {
      mcpTechnologyPreview?: boolean;
      tools?: Array<{
        name?: string;
        description?: string;
        readOnly?: boolean;
        approvalRequired?: boolean;
      }>;
      evidence?: string[];
    };
    expect(toolsBody.mcpTechnologyPreview).toBe(true);
    const expectedToolNames = [
      "get_cluster_signal",
      "retrieve_customer_knowledge",
      "generate_playbook",
      "open_console_deep_link",
      "run_preflight",
      "propose_remediation"
    ];
    const toolNames = toolsBody.tools?.map((tool) => tool.name) ?? [];
    for (const toolName of expectedToolNames) {
      expect(toolNames).toContain(toolName);
    }
    expect(toolsBody.tools?.every((tool) => tool.readOnly === true)).toBe(true);
    const playbookTool = toolsBody.tools?.find(
      (tool) => tool.name === "generate_playbook"
    );
    expect(playbookTool?.description).toContain(
      "우리 회사 결제 시스템 Pod 장애 대응 매뉴얼 알려줘"
    );
    expect(playbookTool?.description).toContain("missingEvidence");
    expect(
      toolsBody.tools?.some((tool) => tool.name === "apply_remediation")
    ).toBe(false);
    expect(toolsBody.evidence?.join(" ")).toContain("OpenShift Lightspeed");

    const ask = await request.post("/api/opslens/ask", {
      data: {
        tool: "generate_playbook",
        input: {
          clusterId: "prod-ocp",
          tenantId: "cywell-payments",
          namespace: "payments",
          workload: "payments-api",
          intent: "pod-crashloop-root-cause-and-recovery",
          question:
            "우리 회사 결제 시스템 Pod 장애 대응 매뉴얼 알려줘. token=secret-demo",
          constraints: {
            readOnly: true,
            includeCustomerRunbooks: true,
            maxDocuments: 3
          }
        },
        caller: {
          source: "lightspeed",
          user: "sre.kim@example.com"
        }
      }
    });
    expect(ask.ok()).toBe(true);
    const askBody = (await ask.json()) as {
      actionMode?: string;
      summary?: string;
      recommendedSteps?: string[];
      citations?: Array<{
        id?: string;
        label?: string;
        sourceType?: string;
        redacted?: boolean;
      }>;
      policy?: {
        privateRag?: boolean;
        rawDocumentReturned?: boolean;
        mutationAllowed?: boolean;
        mcpTechnologyPreview?: boolean;
      };
      audit?: {
        model?: string;
        redactionCount?: number;
        sources?: string[];
        runtimeRag?: {
          mode?: string;
          status?: string;
          provider?: { vectorStore?: string; modelRuntime?: string };
          retrievalAttempted?: boolean;
          localFallbackUsed?: boolean;
          citationsUsed?: string;
          missingEvidence?: string[];
        };
      };
      risks?: string[];
      rollbackPath?: string[];
    };
    expect(askBody.actionMode).toBe("readOnly");
    expect(askBody.summary).toContain("<REDACTED>");
    expect(askBody.recommendedSteps?.join(" ")).toContain("자동 rollback은 수행하지 않는다");
    expect(
      askBody.citations?.some(
        (citation) =>
          citation.sourceType === "customer-runbook" &&
          citation.redacted === true &&
          citation.label?.includes("Payments API Pod 장애 대응 매뉴얼")
      )
    ).toBe(true);
    expect(askBody.policy).toMatchObject({
      privateRag: true,
      rawDocumentReturned: false,
      mutationAllowed: false,
      mcpTechnologyPreview: true
    });
    expect(askBody.audit?.redactionCount).toBeGreaterThan(0);
    expect(askBody.audit?.model).toBe("cywell-private-rag-local-vector/v0.1");
    expect(askBody.audit?.runtimeRag).toMatchObject({
      mode: "local",
      status: "disabled",
      provider: {
        vectorStore: "qdrant",
        modelRuntime: "vllm"
      },
      retrievalAttempted: false,
      localFallbackUsed: true,
      citationsUsed: "local-fallback"
    });
    expect(askBody.audit?.runtimeRag?.missingEvidence?.join(" ")).toContain(
      "live Qdrant/vLLM retrieval was not requested"
    );
    expect(askBody.audit?.sources?.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(askBody)).not.toContain("secret-demo");
    expect(askBody.risks?.join(" ")).toContain("Technology Preview");
    expect(askBody.rollbackPath?.join(" ")).toContain("GitOps");

    const mcpTools = await request.post("/api/opslens/mcp", {
      data: {
        jsonrpc: "2.0",
        id: "tools-1",
        method: "tools/list"
      }
    });
    expect(mcpTools.ok()).toBe(true);
    const mcpToolsBody = (await mcpTools.json()) as {
      result?: {
        tools?: Array<{
          name?: string;
          description?: string;
          annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
        }>;
      };
    };
    expect(
      mcpToolsBody.result?.tools?.some(
        (tool) =>
          tool.name === "generate_playbook" &&
          tool.annotations?.readOnlyHint === true &&
          tool.annotations?.destructiveHint === false
      )
    ).toBe(true);
    const mcpToolNames =
      mcpToolsBody.result?.tools?.map((tool) => tool.name).filter(Boolean) ?? [];
    for (const toolName of expectedToolNames) {
      expect(mcpToolNames).toContain(toolName);
      const listedTool = mcpToolsBody.result?.tools?.find(
        (tool) => tool.name === toolName
      );
      expect(listedTool?.annotations?.readOnlyHint).toBe(true);
      expect(listedTool?.annotations?.destructiveHint).toBe(false);
    }
    expect(
      mcpToolsBody.result?.tools?.find((tool) => tool.name === "run_preflight")
        ?.description
    ).toContain("OLSConfig MCP registration");
    expect(
      mcpToolsBody.result?.tools?.find(
        (tool) => tool.name === "propose_remediation"
      )?.description
    ).toContain("never apply, delete, scale, patch, or mutate");
    expect(mcpToolNames).not.toContain("apply_remediation");

    const mcpCall = await request.post("/api/opslens/mcp", {
      data: {
        jsonrpc: "2.0",
        id: "call-1",
        method: "tools/call",
        params: {
          name: "generate_playbook",
          arguments: {
            clusterId: "prod-ocp",
            tenantId: "cywell-payments",
            namespace: "payments",
            workload: "payments-api",
            intent: "pod-crashloop-root-cause-and-recovery",
            question: "우리 회사 결제 시스템 Pod 장애 대응 매뉴얼 알려줘"
          }
        }
      }
    });
    expect(mcpCall.ok()).toBe(true);
    const mcpCallBody = (await mcpCall.json()) as {
      result?: {
        isError?: boolean;
        structuredContent?: {
          tool?: string;
          actionMode?: string;
          policy?: { rawDocumentReturned?: boolean; mutationAllowed?: boolean };
          citations?: Array<{ sourceType?: string }>;
          audit?: {
            runtimeRag?: {
              status?: string;
              localFallbackUsed?: boolean;
              citationsUsed?: string;
            };
          };
        };
      };
    };
    expect(mcpCallBody.result?.isError).toBe(false);
    expect(mcpCallBody.result?.structuredContent?.tool).toBe("generate_playbook");
    expect(mcpCallBody.result?.structuredContent?.actionMode).toBe("readOnly");
    expect(mcpCallBody.result?.structuredContent?.policy).toMatchObject({
      rawDocumentReturned: false,
      mutationAllowed: false
    });
    expect(
      mcpCallBody.result?.structuredContent?.citations?.some(
        (citation) => citation.sourceType === "customer-runbook"
      )
    ).toBe(true);
    expect(mcpCallBody.result?.structuredContent?.audit?.runtimeRag).toMatchObject({
      status: "disabled",
      localFallbackUsed: true,
      citationsUsed: "local-fallback"
    });

    const callMcpTool = async (id: string, name: string) => {
      const response = await request.post("/api/opslens/mcp", {
        data: {
          jsonrpc: "2.0",
          id,
          method: "tools/call",
          params: {
            name,
            arguments: {
              clusterId: "prod-ocp",
              tenantId: "cywell-payments",
              namespace: "payments",
              workload: "payments-api",
              intent: "lightspeed-tool-contract-check",
              question:
                "우리 회사 결제 시스템 Pod 장애 대응 동선을 만들어줘. token=tool-secret"
            }
          }
        }
      });
      expect(response.ok()).toBe(true);
      const body = (await response.json()) as {
        result?: {
          isError?: boolean;
          structuredContent?: {
            tool?: string;
            actionMode?: string;
            summary?: string;
            recommendedSteps?: string[];
            missingEvidence?: string[];
            consoleLinks?: string[];
            evidence?: string[];
            policy?: {
              rawDocumentReturned?: boolean;
              mutationAllowed?: boolean;
            };
          };
        };
      };
      expect(body.result?.isError).toBe(false);
      expect(body.result?.structuredContent?.policy).toMatchObject({
        rawDocumentReturned: false,
        mutationAllowed: false
      });
      expect(JSON.stringify(body)).not.toContain("tool-secret");
      expect(JSON.stringify(body)).not.toContain("apply_remediation");
      return body.result?.structuredContent;
    };

    const deepLink = await callMcpTool(
      "call-open-console-deep-link",
      "open_console_deep_link"
    );
    expect(deepLink?.tool).toBe("open_console_deep_link");
    expect(deepLink?.actionMode).toBe("readOnly");
    expect(deepLink?.summary).toContain("OpenShift Console");
    expect(deepLink?.summary).toContain("deep link");
    expect(deepLink?.consoleLinks).toContain(
      "/k8s/ns/payments/deployments/payments-api"
    );
    expect(deepLink?.consoleLinks).toContain("/opslens/admin");
    expect(deepLink?.missingEvidence?.join(" ")).toContain("Console route");
    expect(deepLink?.evidence?.join(" ")).toContain(
      "tool profile=open_console_deep_link"
    );

    const preflight = await callMcpTool("call-run-preflight", "run_preflight");
    expect(preflight?.tool).toBe("run_preflight");
    expect(preflight?.actionMode).toBe("readOnly");
    expect(preflight?.summary).toContain("preflight");
    expect(preflight?.recommendedSteps?.join(" ")).toContain(
      "verify:evidence-checkpoint"
    );
    expect(preflight?.missingEvidence?.join(" ")).toContain("live OCP API");
    expect(preflight?.missingEvidence?.join(" ")).toContain("OLSConfig");
    expect(preflight?.missingEvidence?.join(" ")).toContain("MCP");
    expect(preflight?.consoleLinks).toContain("/opslens/admin");
    expect(preflight?.evidence?.join(" ")).toContain("tool profile=run_preflight");
  });

  test("AC-AIOPS-001 builds a plan-only incident packet from live OCP evidence", async ({
    request
  }) => {
    test.setTimeout(45_000);

    const pods = await request.get(
      "/api/ocp/resources?apiVersion=v1&resource=pods&limit=10"
    );
    expect(pods.ok()).toBe(true);
    const podsBody = (await pods.json()) as {
      items?: Array<{
        metadata: {
          name: string;
          namespace?: string;
        };
      }>;
    };
    const firstPod = podsBody.items?.find(
      (item) => item.metadata.name && item.metadata.namespace
    );
    expect(firstPod?.metadata.name).toBeTruthy();
    expect(firstPod?.metadata.namespace).toBeTruthy();

    const incident = await request.post("/api/opslens/incidents/analyze", {
      data: {
        clusterId: "prod-ocp",
        tenantId: "cywell-payments",
        windowMinutes: 10,
        question:
          "최근 10분 로그와 이벤트로 원인 후보와 plan만 제안해줘. password=demo-secret",
        alert: {
          name: "PodCrashLooping",
          severity: "warning",
          namespace: firstPod?.metadata.namespace,
          workload: firstPod?.metadata.name,
          resource: {
            apiVersion: "v1",
            kind: "Pod",
            resource: "pods",
            namespace: firstPod?.metadata.namespace,
            name: firstPod?.metadata.name
          }
        },
        evidenceHints: {
          podName: firstPod?.metadata.name,
          fieldSelector: `metadata.name=${firstPod?.metadata.name}`,
          tailLines: 20
        },
        caller: {
          source: "api",
          user: "sre.kim@example.com"
        }
      }
    });
    expect(incident.ok()).toBe(true);
    const body = (await incident.json()) as {
      actionMode?: string;
      timeWindow?: { minutes?: number };
      podLogs?: {
        pod?: string;
        namespace?: string;
        sinceSeconds?: number;
        logs?: string;
        redacted?: boolean;
        accessEvidence?: string[];
      };
      events?: {
        accessEvidence?: string[];
        redacted?: boolean;
      };
      analysis?: {
        actionMode?: string;
        recommendedSteps?: string[];
        citations?: Array<{ sourceType?: string }>;
        proposedYamlPatch?: string;
        remediationProposal?: {
          artifactType?: string;
          actionMode?: string;
          mutationAllowed?: boolean;
          patchType?: string;
          target?: {
            apiVersion?: string;
            kind?: string;
            namespace?: string;
            name?: string;
            container?: string;
            fieldPath?: string;
            confidence?: string;
          };
          currentValue?: {
            value?: string;
            source?: string;
            observedInCluster?: boolean;
            evidence?: string[];
          };
          proposedValue?: {
            value?: string;
            source?: string;
            evidence?: string[];
          };
          triggerEvidence?: {
            logs?: {
              windowMinutes?: number;
              sinceSeconds?: number;
              currentRead?: boolean;
              previousRead?: boolean;
              redacted?: boolean;
              pod?: string;
              missingEvidence?: string[];
            };
            events?: {
              read?: boolean;
              count?: number;
              redacted?: boolean;
              missingEvidence?: string[];
            };
            metrics?: {
              windowMinutes?: number;
              enabled?: boolean;
              reachable?: boolean;
              queries?: Array<{
                name?: string;
                status?: string;
                sampleCount?: number;
              }>;
              missingEvidence?: string[];
            };
            runbookCitations?: string[];
          };
          yamlPatch?: string;
          evidence?: string[];
          missingEvidence?: string[];
          risks?: string[];
          rollbackPath?: string[];
          forbiddenActions?: string[];
          reviewGate?: {
            required?: boolean;
            approvers?: string[];
            evidence?: string[];
          };
        };
        policy?: {
          rawDocumentReturned?: boolean;
          mutationAllowed?: boolean;
        };
        audit?: { sources?: string[] };
      };
      policy?: {
        planOnly?: boolean;
        mutationAllowed?: boolean;
        serverSideRedaction?: boolean;
        rawDocumentReturned?: boolean;
        logWindowMinutes?: number;
      };
      missingEvidence?: string[];
      evidence?: string[];
      audit?: { ocpReads?: string[]; redactionCount?: number };
    };

    expect(body.actionMode).toBe("planOnly");
    expect(body.timeWindow?.minutes).toBe(10);
    expect(body.policy).toMatchObject({
      planOnly: true,
      mutationAllowed: false,
      serverSideRedaction: true,
      rawDocumentReturned: false,
      logWindowMinutes: 10
    });
    expect(body.podLogs?.pod).toBe(firstPod?.metadata.name);
    expect(body.podLogs?.namespace).toBe(firstPod?.metadata.namespace);
    expect(body.podLogs?.sinceSeconds).toBe(600);
    expect(body.podLogs?.redacted).toBe(true);
    expect(typeof body.podLogs?.logs).toBe("string");
    expect(body.podLogs?.accessEvidence?.join(" ")).toContain(
      "SelfSubjectAccessReview"
    );
    expect(body.events?.redacted).toBe(true);
    expect(body.analysis?.actionMode).toBe("planOnly");
    expect(body.analysis?.recommendedSteps?.join(" ")).toContain("최근 10분");
    expect(body.analysis?.recommendedSteps?.join(" ")).toContain("plan-only");
    expect(body.analysis?.proposedYamlPatch).toContain("memory: 4Gi");
    expect(body.analysis?.remediationProposal).toMatchObject({
      artifactType: "opslens.remediation.proposal.v0.1",
      actionMode: "planOnly",
      mutationAllowed: false,
      patchType: "strategicMerge"
    });
    expect(body.analysis?.remediationProposal?.target?.apiVersion).toBe("apps/v1");
    expect(body.analysis?.remediationProposal?.target?.namespace).toBe(
      firstPod?.metadata.namespace
    );
    expect(
      body.analysis?.remediationProposal?.target?.fieldPath
    ).toContain("resources.limits.memory");
    expect(body.analysis?.remediationProposal?.target?.confidence).toMatch(
      /^(high|medium|low)$/
    );
    expect(body.analysis?.remediationProposal?.currentValue?.source).toMatch(
      /^(cluster-observed|runbook-baseline|unknown)$/
    );
    expect(body.analysis?.remediationProposal?.proposedValue).toMatchObject({
      value: "4Gi",
      source: "candidate-remediation"
    });
    expect(body.analysis?.remediationProposal?.triggerEvidence?.logs).toMatchObject({
      windowMinutes: 10,
      sinceSeconds: 600,
      currentRead: true,
      redacted: true
    });
    expect(body.analysis?.remediationProposal?.triggerEvidence?.events?.redacted).toBe(
      true
    );
    expect(
      body.analysis?.remediationProposal?.triggerEvidence?.metrics?.queries?.map(
        (query) => query.name
      )
    ).toEqual(
      expect.arrayContaining([
        "firing-alert",
        "pod-restarts",
        "pod-cpu",
        "pod-memory"
      ])
    );
    expect(
      body.analysis?.remediationProposal?.triggerEvidence?.runbookCitations?.some(
        (citation) => citation.includes("customer-runbook")
      )
    ).toBe(true);
    expect(body.analysis?.remediationProposal?.yamlPatch).toContain(
      "memory: 4Gi"
    );
    expect(body.analysis?.remediationProposal?.forbiddenActions).toEqual([
      "apply",
      "delete",
      "scale"
    ]);
    expect(body.analysis?.remediationProposal?.reviewGate).toMatchObject({
      required: true
    });
    expect(
      JSON.stringify(body.analysis?.remediationProposal)
    ).not.toMatch(/\b(oc|kubectl)\s+(apply|delete|scale)\b/i);
    expect(body.analysis?.policy).toMatchObject({
      rawDocumentReturned: false,
      mutationAllowed: false
    });
    expect(
      body.analysis?.citations?.some(
        (citation) => citation.sourceType === "customer-runbook"
      )
    ).toBe(true);
    expect(body.audit?.ocpReads?.join(" ")).toContain("v1/pods");
    expect(body.audit?.redactionCount).toBeGreaterThan(0);
    expect(body.missingEvidence).toBeDefined();
    expect(body.evidence?.join(" ")).toContain("read-only");
    expect(JSON.stringify(body)).not.toContain("password=demo-secret");
  });

  test("AC-AIOPS-001 accepts Alertmanager webhook alerts as plan-only incident intake", async ({
    request
  }) => {
    test.setTimeout(45_000);

    const pods = await request.get(
      "/api/ocp/resources?apiVersion=v1&resource=pods&limit=10"
    );
    expect(pods.ok()).toBe(true);
    const podsBody = (await pods.json()) as {
      items?: Array<{
        metadata: {
          name: string;
          namespace?: string;
        };
      }>;
    };
    const firstPod = podsBody.items?.find(
      (item) => item.metadata.name && item.metadata.namespace
    );
    expect(firstPod?.metadata.name).toBeTruthy();
    expect(firstPod?.metadata.namespace).toBeTruthy();

    const intake = await request.post("/api/opslens/incidents/alertmanager", {
      data: {
        receiver: "cywell-opslens",
        status: "firing",
        groupLabels: {
          alertname: "PodCrashLooping"
        },
        commonLabels: {
          cluster: "prod-ocp",
          tenant: "cywell-payments",
          namespace: firstPod?.metadata.namespace,
          severity: "warning"
        },
        commonAnnotations: {
          summary:
            "Alertmanager webhook should become a plan-only incident packet. secret=demo-secret"
        },
        alerts: [
          {
            status: "firing",
            labels: {
              alertname: "PodCrashLooping",
              namespace: firstPod?.metadata.namespace,
              pod: firstPod?.metadata.name,
              workload: firstPod?.metadata.name,
              severity: "warning",
              "app.kubernetes.io/name": "payments-api"
            },
            annotations: {
              description:
                "Collect logs, events, metrics, and runbook citations only. token=demo-secret"
            },
            startsAt: new Date().toISOString(),
            fingerprint: "playwright-alertmanager-intake"
          }
        ]
      }
    });

    expect(intake.ok()).toBe(true);
    const body = (await intake.json()) as {
      artifactType?: string;
      actionMode?: string;
      alertCount?: number;
      acceptedCount?: number;
      rawAlertReturned?: boolean;
      clusterMutationAttempted?: boolean;
      mutationAllowed?: boolean;
      policy?: {
        planOnly?: boolean;
        mutationAllowed?: boolean;
        rawAlertReturned?: boolean;
        serverSideRedaction?: boolean;
      };
      audit?: {
        source?: string;
        incidentRequestIds?: string[];
        redactionCount?: number;
      };
      incidents?: Array<{
        actionMode?: string;
        podLogs?: {
          pod?: string;
          namespace?: string;
          sinceSeconds?: number;
          redacted?: boolean;
        };
        analysis?: {
          remediationProposal?: {
            artifactType?: string;
            actionMode?: string;
            mutationAllowed?: boolean;
            yamlPatch?: string;
            triggerEvidence?: {
              metrics?: {
                queries?: Array<{ name?: string }>;
              };
              runbookCitations?: string[];
            };
          };
          policy?: {
            rawDocumentReturned?: boolean;
            mutationAllowed?: boolean;
          };
        };
        policy?: {
          mutationAllowed?: boolean;
          rawDocumentReturned?: boolean;
        };
      }>;
      evidence?: string[];
      missingEvidence?: string[];
    };
    const firstIncident = body.incidents?.[0];

    expect(body).toMatchObject({
      artifactType: "opslens.alertmanager-incident-intake.v0.1",
      actionMode: "planOnly",
      alertCount: 1,
      acceptedCount: 1,
      rawAlertReturned: false,
      clusterMutationAttempted: false,
      mutationAllowed: false
    });
    expect(body.policy).toMatchObject({
      planOnly: true,
      mutationAllowed: false,
      rawAlertReturned: false,
      serverSideRedaction: true
    });
    expect(body.audit?.source).toBe("alertmanager-webhook");
    expect(body.audit?.incidentRequestIds?.length).toBe(1);
    expect(body.audit?.redactionCount).toBeGreaterThan(0);
    expect(firstIncident?.actionMode).toBe("planOnly");
    expect(firstIncident?.policy).toMatchObject({
      mutationAllowed: false,
      rawDocumentReturned: false
    });
    expect(firstIncident?.podLogs).toMatchObject({
      pod: firstPod?.metadata.name,
      namespace: firstPod?.metadata.namespace,
      sinceSeconds: 600,
      redacted: true
    });
    expect(firstIncident?.analysis?.policy).toMatchObject({
      rawDocumentReturned: false,
      mutationAllowed: false
    });
    expect(firstIncident?.analysis?.remediationProposal).toMatchObject({
      artifactType: "opslens.remediation.proposal.v0.1",
      actionMode: "planOnly",
      mutationAllowed: false
    });
    expect(firstIncident?.analysis?.remediationProposal?.yamlPatch).toContain(
      "memory: 4Gi"
    );
    expect(
      firstIncident?.analysis?.remediationProposal?.triggerEvidence?.metrics?.queries?.map(
        (query) => query.name
      )
    ).toEqual(
      expect.arrayContaining([
        "firing-alert",
        "pod-restarts",
        "pod-cpu",
        "pod-memory"
      ])
    );
    expect(
      firstIncident?.analysis?.remediationProposal?.triggerEvidence?.runbookCitations
        ?.length
    ).toBeGreaterThan(0);
    expect(body.evidence?.join(" ")).toContain("Alertmanager webhook payload");
    expect(body.missingEvidence).toBeDefined();
    expect(JSON.stringify(body)).not.toContain("demo-secret");
    expect(JSON.stringify(body)).toContain("<REDACTED>");
  });

  test("AC-AIOPS-002 correlates incident analysis with Prometheus metric evidence or explicit metric gaps", async ({
    request
  }) => {
    test.setTimeout(45_000);

    const pods = await request.get(
      "/api/ocp/resources?apiVersion=v1&resource=pods&limit=10"
    );
    expect(pods.ok()).toBe(true);
    const podsBody = (await pods.json()) as {
      items?: Array<{
        metadata: {
          name: string;
          namespace?: string;
        };
      }>;
    };
    const firstPod = podsBody.items?.find(
      (item) => item.metadata.name && item.metadata.namespace
    );
    expect(firstPod?.metadata.name).toBeTruthy();
    expect(firstPod?.metadata.namespace).toBeTruthy();

    const incident = await request.post("/api/opslens/incidents/analyze", {
      data: {
        clusterId: "prod-ocp",
        tenantId: "cywell-payments",
        windowMinutes: 10,
        alert: {
          name: "PodCrashLooping",
          severity: "warning",
          namespace: firstPod?.metadata.namespace,
          workload: firstPod?.metadata.name,
          resource: {
            apiVersion: "v1",
            kind: "Pod",
            resource: "pods",
            namespace: firstPod?.metadata.namespace,
            name: firstPod?.metadata.name
          }
        },
        evidenceHints: {
          podName: firstPod?.metadata.name,
          fieldSelector: `metadata.name=${firstPod?.metadata.name}`,
          tailLines: 10
        }
      }
    });
    expect(incident.ok()).toBe(true);
    const body = (await incident.json()) as {
      metrics?: {
        enabled?: boolean;
        reachable?: boolean;
        windowMinutes?: number;
        redacted?: boolean;
        queries?: Array<{
          name?: string;
          query?: string;
          enabled?: boolean;
          reachable?: boolean;
          sample?: unknown[];
          evidence?: string[];
          error?: string;
        }>;
        evidence?: string[];
      };
      policy?: {
        monitoringProxyEnabled?: boolean;
        mutationAllowed?: boolean;
      };
      missingEvidence?: string[];
      audit?: { ocpReads?: string[] };
    };

    expect(body.policy?.mutationAllowed).toBe(false);
    expect(body.metrics?.windowMinutes).toBe(10);
    expect(body.metrics?.redacted).toBe(true);
    expect(body.policy?.monitoringProxyEnabled).toBe(body.metrics?.enabled);
    const queryNames = body.metrics?.queries?.map((query) => query.name) ?? [];
    expect(queryNames).toEqual(
      expect.arrayContaining([
        "firing-alert",
        "pod-restarts",
        "pod-cpu",
        "pod-memory"
      ])
    );
    expect(
      body.metrics?.queries?.every((query) => query.query && query.sample)
    ).toBe(true);

    if (body.metrics?.enabled && body.metrics.reachable) {
      expect(
        body.metrics.queries?.some((query) => query.reachable === true)
      ).toBe(true);
      expect(body.audit?.ocpReads?.join(" ")).toContain("prometheus");
      expect(body.metrics.evidence?.join(" ")).toContain("Prometheus");
    } else {
      expect(body.missingEvidence?.join(" ")).toContain("metrics/");
      expect(
        body.metrics?.queries?.some((query) => Boolean(query.error))
      ).toBe(true);
    }
  });

  test("AC-DASH-001 renders the dedicated OpsLens admin dashboard", async ({
    page,
    request
  }) => {
    const response = await request.get("/api/opslens/admin/overview");
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as {
      rag?: {
        documents?: Array<{
          label?: string;
          redacted?: boolean;
          evidence?: string[];
        }>;
        uploadIntake?: { mode?: string; evidence?: string[] };
        productionReadiness?: {
          status?: string;
          actionMode?: string;
          contractReady?: boolean;
          approvalRequired?: boolean;
          productionQueueLive?: boolean;
          ingestionWorkerLive?: boolean;
          vectorWriteAuditSinkLive?: boolean;
          vectorWriteAttempted?: boolean;
          ingestionJobCreated?: boolean;
          mutationAllowedByThisVerifier?: boolean;
          components?: {
            queue?: { backendClass?: string; storesRawMarkdown?: boolean };
            vectorWriteAuditSink?: { appendOnly?: boolean };
          };
          requiredApprovals?: string[];
          firstProductionActions?: Array<{
            id?: string;
            owner?: string;
            phase?: string;
            status?: string;
            request?: string;
            evidenceNeeded?: string;
            nextCommand?: string;
            mutation?: boolean;
            requiresExplicitApproval?: boolean;
            blockedBy?: string[];
            rollbackPath?: string;
          }>;
          missingEvidence?: string[];
        };
      };
      tokenUsage?: {
        budgetTokens?: number;
        usedTokens?: number;
        routes?: Array<{ route?: string; inputTokens?: number; outputTokens?: number }>;
      };
      runtime?: {
        gpu?: { samples?: unknown[] };
        readiness?: {
          status?: string;
          actionMode?: string;
          mutationAllowed?: boolean;
          rawDocumentReturned?: boolean;
          vectorStore?: {
            provider?: string;
            status?: string;
            liveProbeEnabled?: boolean;
          };
          modelRuntime?: {
            provider?: string;
            status?: string;
            liveProbeEnabled?: boolean;
          };
          missingEvidence?: string[];
        };
        liveHandoff?: {
          status?: string;
          actionMode?: string;
          runtimePlatformOwner?: string;
          dataMlOwner?: string;
          liveProbeEnabled?: boolean;
          qdrantStatus?: string;
          vllmStatus?: string;
          runtimeReadinessAction?: {
            id?: string;
            owner?: string;
            readOnlyCommandIds?: string[];
          };
          runtimeRagAction?: {
            id?: string;
            owner?: string;
            readOnlyCommandIds?: string[];
          };
          requiredReadOnlyCommands?: string[];
          approvalGatedCommandCount?: number;
          mutationAllowedByThisVerifier?: boolean;
          clusterMutationAttempted?: boolean;
          registryMutationAttempted?: boolean;
          vectorWriteAttempted?: boolean;
          missingEvidence?: string[];
        };
      };
      incidents?: Array<{
        metricQueries?: Array<{ name?: string; status?: string }>;
        remediationProposal?: {
          artifactType?: string;
          actionMode?: string;
          mutationAllowed?: boolean;
          patchType?: string;
          target?: {
            kind?: string;
            name?: string;
            fieldPath?: string;
            confidence?: string;
          };
          currentValue?: { value?: string; source?: string };
          proposedValue?: { value?: string; source?: string };
          triggerEvidence?: {
            logs?: { windowMinutes?: number; currentRead?: boolean };
            metrics?: { queries?: Array<{ name?: string; status?: string }> };
            runbookCitations?: string[];
          };
          yamlPatch?: string;
          forbiddenActions?: string[];
          reviewGate?: { required?: boolean };
        };
      }>;
      aiops?: {
        incidentPipeline?: {
          status?: string;
          artifactStatus?: string;
          actionMode?: string;
          headSha?: string;
          worktreeDirty?: boolean;
          liveSmokeStatus?: string;
          selectedPod?: { namespace?: string; name?: string };
          clusterMutationAttempted?: boolean;
          registryMutationAttempted?: boolean;
          vectorWriteAttempted?: boolean;
          ingestionJobCreated?: boolean;
          mutationAllowedByThisVerifier?: boolean;
          requiredMetricQueries?: string[];
          metricQueries?: Array<{
            name?: string;
            status?: string;
            sampleCount?: number;
            missingEvidence?: string[];
          }>;
          monitoringProxyHandoff?: {
            status?: string;
            actionMode?: string;
            owner?: string;
            enabled?: boolean;
            reachable?: boolean;
            approvalRequired?: boolean;
            requiredQueries?: string[];
            readyQueries?: string[];
            missingQueries?: string[];
            nextCommand?: string;
            readOnlyCommands?: Array<{
              id?: string;
              mutation?: boolean;
              requiresNetwork?: boolean;
              writesLocalEvidence?: boolean;
            }>;
            mutationAllowedByThisVerifier?: boolean;
            clusterMutationAttempted?: boolean;
            evidence?: string[];
            missingEvidence?: string[];
          };
          triggerEvidenceRequired?: string[];
          alertmanagerIntake?: {
            artifactType?: string;
            actionMode?: string;
            alertCount?: number;
            acceptedCount?: number;
            rawAlertReturned?: boolean;
            mutationAllowed?: boolean;
            clusterMutationAttempted?: boolean;
            incidentRequestIds?: string[];
            evidence?: string[];
            missingEvidence?: string[];
          };
          acceptance?: string[];
          evidence?: string[];
          missingEvidence?: string[];
          risk?: string[];
          rollbackPath?: string[];
        };
      };
      installReadiness?: {
        lightspeedMcp?: string;
        environmentIsolation?: string;
        envContract?: {
          status?: string;
          artifactStatus?: string;
          actionMode?: string;
          headSha?: string;
          worktreeDirty?: boolean | string;
          activeOcpTarget?: boolean;
          activeLightspeedTarget?: boolean;
          activeKeyCount?: number;
          commentedTrackedCount?: number;
          duplicateActiveKeys?: string[];
          activeMissingValues?: string[];
          checks?: Array<{ name?: string; status?: string; detail?: string }>;
          clusterMutationAttempted?: boolean;
          registryMutationAttempted?: boolean;
          vectorWriteAttempted?: boolean;
          mutationAllowedByThisVerifier?: boolean;
          evidence?: string[];
          missingEvidence?: string[];
        };
        lightspeedExtensionPoint?: string;
        extensionPoint?: {
          status?: string;
          artifactStatus?: string;
          actionMode?: string;
          productContract?: string;
          lightspeedFacingEndpoint?: string;
          localSmokeEndpoint?: string;
          undocumentedWebhookSupported?: boolean;
          legacyConfigMapRegistrationSupported?: boolean;
          technologyPreview?: boolean;
          olsconfig?: {
            kind?: string;
            featureGates?: string[];
            server?: {
              name?: string;
              url?: string;
              userBearerForwarding?: boolean;
              secretHeader?: boolean;
            };
          };
          routes?: Array<{
            path?: string;
            method?: string;
            role?: string;
          }>;
          requirements?: Array<{ id?: string; pass?: boolean }>;
          mutationBoundary?: {
            clusterMutationAttempted?: boolean;
            registryMutationAttempted?: boolean;
            vectorWriteAttempted?: boolean;
            mutationAllowedByThisVerifier?: boolean;
          };
          missingEvidence?: string[];
          risk?: string[];
          rollbackPath?: string[];
          evidence?: string[];
        };
        operatorPackaging?: string;
        ocpConnectivity?: string;
        connectivity?: {
          status?: string;
          artifactStatus?: string;
          actionMode?: string;
          classification?: string;
          clusterMutationAttempted?: boolean;
          mutationAllowedByThisVerifier?: boolean;
          target?: {
            host?: string;
            port?: number | string;
            tokenConfigured?: boolean;
            tlsVerify?: boolean;
          };
          diagnostics?: {
            dns?: string;
            tcp?: string;
            tls?: string;
            kubernetesVersion?: string;
            oc?: string;
            rbacAccessReviews?: Array<{
              id?: string;
              verb?: string;
              resource?: string;
              status?: string;
              required?: boolean;
              command?: string;
            }>;
          };
          actionHints?: Array<{
            id?: string;
            severity?: string;
            summary?: string;
            evidence?: string;
            nextCheck?: string;
          }>;
          readOnlyTroubleshootingCommands?: Array<{
            id?: string;
            command?: string;
            mutation?: boolean;
          }>;
          missingEvidence?: string[];
          risk?: string[];
          rollbackPath?: string[];
        };
        networkHandoff?: {
          status?: string;
          artifactStatus?: string;
          actionMode?: string;
          classification?: string;
          clusterMutationAttempted?: boolean;
          registryMutationAttempted?: boolean;
          mutationAllowedByThisVerifier?: boolean;
          target?: {
            host?: string;
            port?: number | string;
            redactedBaseUrl?: string;
            tokenConfigured?: boolean;
            tlsVerify?: boolean;
          };
          markdownPath?: string;
          adminRequests?: string[];
          readOnlyCommands?: Array<{
            id?: string;
            command?: string;
            mutation?: boolean;
          }>;
          firstNetworkActions?: Array<{
            id?: string;
            owner?: string;
            phase?: string;
            status?: string;
            request?: string;
            evidenceNeeded?: string;
            nextCommand?: string;
            mutation?: boolean;
            requiresExplicitApproval?: boolean;
            blockedBy?: string[];
            rollbackPath?: string;
          }>;
          ticketPacket?: {
            id?: string;
            owner?: string;
            title?: string;
            severity?: string;
            classification?: string;
            redactedTarget?: string;
            summary?: string;
            evidenceChecklist?: string[];
            firstReadOnlyAction?: {
              id?: string;
              status?: string;
              nextCommand?: string;
              mutation?: boolean;
              requiresExplicitApproval?: boolean;
            };
            approvalGatedAction?: {
              id?: string;
              status?: string;
              nextCommand?: string;
              mutation?: boolean;
              requiresExplicitApproval?: boolean;
            };
            nextCommands?: string[];
            blockedBy?: string[];
            mutationBoundary?: {
              clusterMutationAttempted?: boolean;
              registryMutationAttempted?: boolean;
              mutationAllowedByThisVerifier?: boolean;
              networkChangeRequiresExplicitApproval?: boolean;
            };
            risk?: string;
            rollbackPath?: string;
          };
          sourceArtifacts?: Array<{
            id?: string;
            fresh?: boolean;
          }>;
          missingEvidence?: string[];
          risk?: string[];
          rollbackPath?: string[];
        };
        operatorDryRun?: string;
        operatorRuntimeBoundary?: string;
        operatorRuntimeBoundarySummary?: {
          status?: string;
          artifactStatus?: string;
          actionMode?: string;
          headSha?: string;
          worktreeDirty?: boolean | string;
          clusterMutationAttempted?: boolean;
          registryMutationAttempted?: boolean;
          mutationAllowedByThisVerifier?: boolean;
          parity?: {
            lightspeedMode?: string;
            lightspeedPhase?: string;
            willPatchLightspeed?: boolean | string;
            assistantMutationAllowed?: boolean | string;
            ragApprovalQueueMutationAllowed?: boolean | string;
            ragRawDocumentReturnAllowed?: boolean | string;
          };
          goLightspeedMutationBoundary?: {
            functionFound?: boolean;
            validateOnlyGuardBeforeRead?: boolean;
            endpointGuardBeforeRead?: boolean;
            patchCallCount?: number;
            patchAfterRead?: boolean;
            configMapReferenceCount?: number;
            reconcileBeforeStatus?: boolean;
          };
          evidence?: string[];
          missingEvidence?: string[];
          risk?: string[];
          rollbackPath?: string[];
        };
        installPlan?: string;
        approvalPlan?: {
          actionMode?: string;
          clusterMutationAttempted?: boolean;
          mutationAllowedByThisVerifier?: boolean;
          requiredApprovals?: string[];
          firstApprovalActions?: Array<{
            id?: string;
            owner?: string;
            phase?: string;
            status?: string;
            request?: string;
            evidenceNeeded?: string;
            nextCommand?: string;
            mutation?: boolean;
            requiresExplicitApproval?: boolean;
            blockedBy?: string[];
            rollbackPath?: string;
          }>;
          mutatingCommands?: Array<{ id?: string; requiresExplicitApproval?: boolean }>;
          lightspeedRegistration?: {
            actionMode?: string;
            status?: string;
            phase?: string;
            mode?: string;
            configResourceKind?: string;
            target?: { namespace?: string; name?: string };
            desiredServer?: { name?: string; url?: string };
            willPatch?: boolean;
            operatorMutationAllowedByMode?: boolean;
            clusterMutationAttempted?: boolean;
            mutationAllowedByThisVerifier?: boolean;
            legacyConfigMapMutationAttempted?: boolean;
            readOnlyCommands?: Array<{ id?: string; command?: string }>;
          };
          ragIngestion?: {
            actionMode?: string;
            status?: string;
            queueEvidenceStatus?: string;
            approvedPlanStatus?: string;
            clusterMutationAttempted?: boolean;
            vectorWriteAttempted?: boolean;
            ingestionJobCreated?: boolean;
            mutationAllowedByThisVerifier?: boolean;
            requiredApprovals?: string[];
            mutatingCommands?: Array<{ id?: string; requiresExplicitApproval?: boolean }>;
          };
          risk?: string[];
          rollbackPath?: string[];
        };
        catalogToolchain?: string;
        catalogToolchainPlan?: {
          status?: string;
          artifactStatus?: string;
          actionMode?: string;
          registryAuthConfigured?: boolean;
          registryBaseReadable?: boolean;
          registryMutationAttempted?: boolean;
          clusterMutationAttempted?: boolean;
          mutationAllowedByThisVerifier?: boolean;
          cli?: Array<{ name?: string; available?: boolean }>;
          readOnlyCommands?: Array<{ id?: string; mutation?: boolean }>;
          setupCommands?: Array<{
            id?: string;
            requiresHumanSecretInput?: boolean;
            mutation?: boolean;
          }>;
          localArtifactCommands?: Array<{ id?: string; mutation?: boolean }>;
          risk?: string[];
          rollbackPath?: string[];
          missingEvidence?: string[];
        };
        certificationReadiness?: string;
        certificationPlan?: {
          status?: string;
          artifactStatus?: string;
          actionMode?: string;
          markdownPath?: string;
          registryMutationAttempted?: boolean;
          clusterMutationAttempted?: boolean;
          mutationAllowedByThisVerifier?: boolean;
          headSha?: string;
          worktreeDirty?: boolean;
          cli?: Array<{
            name?: string;
            available?: boolean;
            requiredForExternalSubmission?: boolean;
          }>;
          toolingHandoff?: {
            actionMode?: string;
            status?: string;
            toolingSatisfiedBy?: string;
            missingRequiredTools?: string[];
            runnerEvidence?: {
              path?: string;
              requiredSchema?: string;
              status?: string;
              approved?: boolean;
              sameHead?: boolean;
              mutation?: boolean;
              requiresExplicitApproval?: boolean;
              runner?: {
                id?: string;
                image?: string;
                imageDigest?: string;
                approvedBy?: string;
                ticket?: string;
                approvedAt?: string;
              };
              toolVersions?: {
                oc?: string;
                docker?: string;
                opm?: string;
                operatorSdk?: string;
              };
              evidenceArtifacts?: Record<string, string>;
              missingEvidence?: string[];
              nextCommands?: string[];
            };
            freshnessPolicy?: {
              requiredHead?: string;
              worktreeRequirement?: string;
              rerunAfter?: string[];
            };
            executionLanes?: Array<{
              id?: string;
              owner?: string;
              status?: string;
              mutation?: boolean;
              requiresExplicitApproval?: boolean;
              blockedBy?: string[];
              nextCommands?: string[];
            }>;
            readOnlyCommands?: Array<{ id?: string; command?: string; mutation?: boolean }>;
            setupCommands?: Array<{ id?: string; mutation?: boolean }>;
            approvalGatedCommands?: Array<{ id?: string; mutation?: boolean }>;
            nextCommands?: string[];
          };
          firstSubmissionActions?: Array<{
            id?: string;
            owner?: string;
            phase?: string;
            status?: string;
            request?: string;
            evidenceNeeded?: string;
            nextCommand?: string;
            mutation?: boolean;
            requiresExplicitApproval?: boolean;
            blockedBy?: string[];
            rollbackPath?: string;
          }>;
          documents?: Record<string, string>;
          gateCounts?: {
            internalCatalog?: {
              pass?: number;
              warn?: number;
              fail?: number;
              total?: number;
            };
            communityOperator?: {
              pass?: number;
              warn?: number;
              fail?: number;
              total?: number;
            };
            certifiedOperator?: {
              pass?: number;
              warn?: number;
              fail?: number;
              total?: number;
            };
          };
          risk?: string[];
          rollbackPath?: string[];
          missingEvidence?: string[];
        };
        communityOperatorSubmission?: string;
        communitySubmissionPlan?: {
          status?: string;
          artifactStatus?: string;
          actionMode?: string;
          externalSubmissionAttempted?: boolean;
          registryMutationAttempted?: boolean;
          clusterMutationAttempted?: boolean;
          mutationAllowedByThisVerifier?: boolean;
          headSha?: string;
          worktreeDirty?: boolean;
          parityPassed?: boolean;
          submissionLayout?: {
            root?: string;
            packageName?: string;
            version?: string;
            ci?: string;
            catalogTemplate?: string;
            manifests?: string[];
            metadata?: string;
            scorecard?: string;
          };
          sourceBundleParity?: Array<{
            id?: string;
            source?: string;
            target?: string;
            match?: boolean;
          }>;
          readOnlyCommands?: Array<{ id?: string; command?: string; mutation?: boolean }>;
          approvalGatedCommands?: Array<{
            id?: string;
            command?: string;
            mutation?: boolean;
            requiresExplicitApproval?: boolean;
          }>;
          firstSubmissionActions?: Array<{
            id?: string;
            owner?: string;
            status?: string;
            nextCommand?: string;
            mutation?: boolean;
            requiresExplicitApproval?: boolean;
            blockedBy?: string[];
          }>;
          risk?: string[];
          rollbackPath?: string[];
          missingEvidence?: string[];
        };
        imageBuilds?: string;
        ownedImageProvenance?: string;
        ownedImageProvenancePlan?: {
          actionMode?: string;
          registryMutationAttempted?: boolean;
          clusterMutationAttempted?: boolean;
          mutationAllowedByThisVerifier?: boolean;
          requiredImages?: string[];
          images?: Array<{ name?: string; status?: string }>;
          missingEvidence?: string[];
          risk?: string[];
          rollbackPath?: string[];
        };
        externalRuntimeImages?: string;
        externalRuntimePlan?: {
          actionMode?: string;
          registryMutationAttempted?: boolean;
          clusterMutationAttempted?: boolean;
          mutationAllowedByThisVerifier?: boolean;
          requiredApprovals?: string[];
          externalImages?: Array<{
            name?: string;
            status?: string;
            draftStatus?: string;
          }>;
          evidenceDrafts?: Array<{ name?: string; status?: string }>;
          mutatingCommands?: Array<{ id?: string; requiresExplicitApproval?: boolean }>;
          risk?: string[];
          rollbackPath?: string[];
          missingEvidence?: string[];
        };
        externalRuntimeReviewPacket?: string;
        externalRuntimeReview?: {
          status?: string;
          artifactStatus?: string;
          actionMode?: string;
          markdownPath?: string;
          registryMutationAttempted?: boolean;
          clusterMutationAttempted?: boolean;
          mutationAllowedByThisVerifier?: boolean;
          requiredApprovals?: string[];
          markdownPath?: string;
          firstReviewerActions?: Array<{
            imageName?: string;
            role?: string;
            request?: string;
            evidenceNeeded?: string;
            nextCommand?: string;
            sourceDigestInspectionStatus?: string;
            candidateStatus?: string;
            finalEvidenceExists?: boolean;
          }>;
          firstRegistryActions?: Array<{
            id?: string;
            owner?: string;
            phase?: string;
            status?: string;
            request?: string;
            evidenceNeeded?: string;
            nextCommand?: string;
            mutation?: boolean;
            requiresExplicitApproval?: boolean;
            blockedBy?: string[];
            rollbackPath?: string;
          }>;
          candidateHandoff?: Array<{
            imageName?: string;
            status?: string;
            owner?: string;
            candidateStatus?: string;
            candidateLabel?: string;
            candidateImage?: string;
            releaseEligible?: boolean;
            criticalFindings?: number | string;
            highFindings?: number | string;
            reviewDecision?: string;
            approvalRequired?: boolean;
            mutationAllowed?: boolean;
            evidenceNeeded?: string;
            nextCommand?: string;
            blockedBy?: string[];
            rollbackPath?: string;
          }>;
          images?: Array<{
            name?: string;
            sourceDigestInspectionStatus?: string;
            finalEvidenceExists?: boolean;
            candidateMatrix?: {
              status?: string;
              matrixStatus?: string;
              bestCandidate?: {
                label?: string;
                image?: string;
                criticalFindings?: number | string;
                highFindings?: number | string;
              };
              zeroCriticalCount?: number;
              recommendation?: string;
              missingEvidenceCount?: number;
            };
            reviewerRequests?: Array<{
              role?: string;
              request?: string;
              evidenceNeeded?: string;
              nextCommand?: string;
            }>;
            missingEvidenceCount?: number;
          }>;
          readOnlyCommands?: Array<{
            id?: string;
            mutation?: boolean;
            writesLocalEvidence?: boolean;
          }>;
          approvalGatedCommands?: Array<{
            id?: string;
            mutation?: boolean;
            requiresExplicitApproval?: boolean;
          }>;
          missingEvidence?: string[];
          risk?: string[];
          rollbackPath?: string[];
        };
        securityScan?: string;
        securityScanPlan?: {
          status?: string;
          artifactStatus?: string;
          actionMode?: string;
          registryMutationAttempted?: boolean;
          clusterMutationAttempted?: boolean;
          mutationAllowedByThisVerifier?: boolean;
          cli?: Array<{ name?: string; available?: boolean }>;
          images?: Array<{
            name?: string;
            required?: boolean;
            vulnerabilityReportExists?: boolean;
            sbomExists?: boolean;
            reviewExists?: boolean;
            reviewDraft?: {
              exists?: boolean;
              evidenceState?: string;
              sameHead?: boolean;
              reviewerProvided?: boolean;
              ticketProvided?: boolean;
              readyForFinalReview?: boolean;
            };
          }>;
          runnerEvidence?: {
            status?: string;
            actionMode?: string;
            evidenceWritten?: boolean;
            fresh?: boolean;
            executeDockerFallback?: boolean;
            scannerDigestsPinned?: boolean;
            missingTargets?: string[];
            registryMutationAttempted?: boolean;
            clusterMutationAttempted?: boolean;
            mutationAllowedByThisVerifier?: boolean;
          };
          readOnlyCommands?: Array<{
            id?: string;
            mutation?: boolean;
            writesLocalEvidence?: boolean;
          }>;
          setupCommands?: Array<{ id?: string; mutation?: boolean }>;
          approvalGatedCommands?: Array<{
            id?: string;
            command?: string;
            mutation?: boolean;
            requiresExplicitApproval?: boolean;
          }>;
          firstSecurityReviewActions?: Array<{
            id?: string;
            owner?: string;
            phase?: string;
            status?: string;
            request?: string;
            evidenceNeeded?: string;
            nextCommand?: string;
            mutation?: boolean;
            requiresExplicitApproval?: boolean;
            blockedBy?: string[];
            rollbackPath?: string;
          }>;
          risk?: string[];
          rollbackPath?: string[];
          missingEvidence?: string[];
        };
        releasePublish?: string;
        releasePlan?: {
          actionMode?: string;
          registryMutationAttempted?: boolean;
          clusterMutationAttempted?: boolean;
          mutationAllowedByThisVerifier?: boolean;
          requiredApprovals?: string[];
          firstPublishActions?: Array<{
            id?: string;
            owner?: string;
            phase?: string;
            status?: string;
            request?: string;
            evidenceNeeded?: string;
            nextCommand?: string;
            mutation?: boolean;
            requiresExplicitApproval?: boolean;
            blockedBy?: string[];
            rollbackPath?: string;
          }>;
          mutatingCommands?: Array<{ id?: string; requiresExplicitApproval?: boolean }>;
          risk?: string[];
          rollbackPath?: string[];
          missingEvidence?: string[];
        };
        releaseRefresh?: string;
        refresh?: {
          status?: string;
          artifactStatus?: string;
          actionMode?: string;
          registryMutationAttempted?: boolean;
          clusterMutationAttempted?: boolean;
          mutationAllowedByThisVerifier?: boolean;
          localDockerBuildAllowed?: boolean;
          headSha?: string;
          worktreeDirty?: boolean;
          commands?: Array<{
            id?: string;
            status?: string;
            expectedNonZero?: boolean;
          }>;
          artifacts?: Array<{
            id?: string;
            status?: string;
            fresh?: boolean;
          }>;
          actionQueue?: {
            status?: string;
            ownerPacketCount?: number;
            ownerPacketsReady?: boolean;
            missingOwnerPackets?: string[];
            ownerPacketCleanup?: {
              dir?: string;
              expectedFiles?: string[];
              staleRemoved?: string[];
              deletionAllowed?: boolean;
            };
            ownerPackets?: Array<{
              owner?: string;
              markdownPath?: string;
              exists?: boolean;
              firstActionId?: string;
              firstActionPriority?: string;
              firstNextCommand?: string;
              approvalGatedCommandCount?: number;
            }>;
          };
          risk?: string[];
          rollbackPath?: string[];
          missingEvidence?: string[];
        };
        releaseEvidenceBundle?: string;
        bundle?: {
          status?: string;
          artifactStatus?: string;
          actionMode?: string;
          registryMutationAttempted?: boolean;
          clusterMutationAttempted?: boolean;
          mutationAllowedByThisVerifier?: boolean;
          headSha?: string;
          worktreeDirty?: boolean;
          decision?: {
            publishReady?: boolean;
            installReady?: boolean;
            roadmapComplete?: boolean;
          };
          sourceArtifacts?: Array<{
            id?: string;
            status?: string;
            fresh?: boolean;
            acceptable?: boolean;
            mutationViolation?: boolean;
          }>;
          commandCounts?: {
            readOnly?: number;
            mutatingApprovalRequired?: number;
          };
          mutationBoundaryPassed?: boolean;
          missingEvidence?: string[];
          risk?: string[];
          rollbackPath?: string[];
        };
        releaseActionQueue?: string;
        actionQueue?: {
          status?: string;
          artifactStatus?: string;
          actionMode?: string;
          registryMutationAttempted?: boolean;
          clusterMutationAttempted?: boolean;
          mutationAllowedByThisVerifier?: boolean;
          headSha?: string;
          worktreeDirty?: boolean;
          owners?: Array<{
            owner?: string;
            open?: number;
            blocker?: number;
            high?: number;
          }>;
          ownerPackets?: Array<{
            owner?: string;
            status?: string;
            markdownPath?: string;
            open?: number;
            blocker?: number;
            high?: number;
            itemIds?: string[];
            firstActionId?: string;
            firstActionPriority?: string;
            firstActionSource?: string;
            firstActionRequest?: string;
            firstNextCommand?: string;
            firstEvidenceNeeded?: string;
            firstBlockedBy?: string[];
            nextCommands?: string[];
            readOnlyCommandIds?: string[];
            approvalGatedCommandIds?: string[];
            missingRequiredTools?: string[];
            mutationAllowedByThisVerifier?: boolean;
          }>;
          criticalPath?: Array<{
            lane?: string;
            label?: string;
            owner?: string;
            priority?: string;
            actionId?: string;
            source?: string;
            request?: string;
            evidenceNeeded?: string;
            nextCommand?: string;
            blockedBy?: string[];
            diagnostics?: string[];
            acceptance?: string[];
          }>;
          ownerPacketCleanup?: {
            dir?: string;
            expectedFiles?: string[];
            staleRemoved?: string[];
            deletionAllowed?: boolean;
          };
          items?: Array<{
            id?: string;
            owner?: string;
            priority?: string;
            source?: string;
            evidenceNeeded?: string;
            nextCommand?: string;
            handoffNextCommands?: string[];
            setupCommands?: Array<{ id?: string; mutation?: boolean }>;
            readOnlyCommands?: Array<{
              id?: string;
              command?: string;
              mutation?: boolean;
            }>;
            approvalGatedCommands?: Array<{
              id?: string;
              mutation?: boolean;
              requiresExplicitApproval?: boolean;
            }>;
            missingRequiredTools?: string[];
            blockedBy?: string[];
            diagnostics?: Array<{
              id?: string;
              label?: string;
              value?: string;
            }>;
          }>;
          sourceArtifacts?: Array<{
            id?: string;
            status?: string;
            fresh?: boolean;
            required?: boolean;
            mutationViolation?: boolean;
          }>;
          commandCounts?: {
            readOnly?: number;
            approvalGated?: number;
          };
          mutationBoundaryPassed?: boolean;
          missingEvidence?: string[];
          risk?: string[];
          rollbackPath?: string[];
        };
        ocpAuthRbacPlan?: string;
        authRbacPlan?: {
          status?: string;
          artifactStatus?: string;
          actionMode?: string;
          classification?: string;
          preferredCredentialMode?: string;
          fallbackCredentialMode?: string;
          clusterMutationAttempted?: boolean;
          registryMutationAttempted?: boolean;
          mutationAllowedByThisVerifier?: boolean;
          rbac?: {
            namespace?: string;
            serviceAccount?: string;
            clusterRole?: string;
            ruleCount?: number;
            verbs?: string[];
            readOnlyOnly?: boolean;
            secretsIncluded?: boolean;
          };
          readOnlyCommands?: Array<{
            id?: string;
            command?: string;
            mutation?: boolean;
          }>;
          approvalGatedCommands?: Array<{
            id?: string;
            mutation?: boolean;
            requiresExplicitApproval?: boolean;
          }>;
          missingEvidence?: string[];
          risk?: string[];
          rollbackPath?: string[];
        };
        liveHandoff?: string;
        handoff?: {
          status?: string;
          artifactStatus?: string;
          actionMode?: string;
          currentGapClassification?: string;
          clusterMutationAttempted?: boolean;
          registryMutationAttempted?: boolean;
          mutationAllowedByThisVerifier?: boolean;
          postApprovalSmoke?: {
            artifactStatus?: string;
            requiredAfterAuthRbacApproval?: boolean;
            command?: string;
            ocpClassification?: string;
            requiredRbacAllowed?: boolean;
            requiredRbacReviewCount?: number;
            requiredRbacAllowedCount?: number;
            requiredRbacDeniedCount?: number;
            requiredRbacUnknownCount?: number;
            lightspeedClassification?: string;
            lightspeedAuthReady?: boolean;
            sourceArtifacts?: Array<{
              id?: string;
              status?: string;
              fresh?: boolean;
            }>;
            verifierRuns?: Array<{
              id?: string;
              ok?: boolean;
              skipped?: boolean;
            }>;
            missingEvidence?: string[];
          };
          readOnlyCommands?: Array<{
            id?: string;
            command?: string;
            mutation?: boolean;
            writesEvidence?: boolean;
          }>;
          actionHints?: Array<{ id?: string; severity?: string }>;
          forbiddenCommands?: string[];
          risk?: string[];
          rollbackPath?: string[];
        };
        evidenceCheckpoint?: string;
        checkpoint?: {
          status?: string;
          artifactStatus?: string;
          headSha?: string;
          worktreeDirty?: boolean;
          lanes?: Array<{
            id?: string;
            label?: string;
            status?: string;
            artifactStatus?: string;
          }>;
          missingEvidence?: string[];
          blockers?: string[];
          risk?: string[];
          rollbackPath?: string[];
        };
        certification?: string;
        evidence?: string[];
      };
      lightspeed?: {
        mcp?: {
          endpoint?: string;
          localEndpoint?: string;
          toolCount?: number;
          readOnlyCount?: number;
          mutatingToolExcluded?: boolean;
          routing?: {
            status?: string;
            artifactStatus?: string;
            selectedPasses?: number;
            responsePasses?: number;
            total?: number;
            threshold?: number;
            headSha?: string;
            worktreeDirty?: boolean;
            evidence?: string[];
            missingEvidence?: string[];
          };
          trojanHorse?: {
            status?: string;
            artifactStatus?: string;
            question?: string;
            selectedTool?: string;
            citationCount?: number;
            redactionPassed?: boolean;
            mutationAllowed?: boolean;
            rawDocumentReturned?: boolean;
            clusterMutationAttempted?: boolean;
            vectorWriteAttempted?: boolean;
            headSha?: string;
            worktreeDirty?: boolean;
            evidence?: string[];
            missingEvidence?: string[];
          };
          integrationHandoff?: {
            status?: string;
            artifactStatus?: string;
            actionMode?: string;
            headSha?: string;
            worktreeDirty?: boolean;
            localProof?: {
              trojanHorse?: {
                selectedTool?: string;
                citationCount?: number;
                customerRunbookCitationFound?: boolean;
                redactionPassed?: boolean;
              };
              routing?: {
                selectedPasses?: number;
                responsePasses?: number;
                total?: number;
                threshold?: number;
              };
            };
            liveReadiness?: {
              status?: string;
              classification?: string;
              networkClassification?: string;
              nextCommand?: string;
            };
            olsconfig?: {
              templateReady?: boolean;
              desiredServer?: { url?: string };
            };
            readOnlyCommands?: Array<{
              id?: string;
              command?: string;
              mutation?: boolean;
              writesLocalEvidence?: boolean;
            }>;
            approvalGatedCommands?: Array<{
              id?: string;
              command?: string;
              mutation?: boolean;
              requiresExplicitApproval?: boolean;
              owner?: string;
            }>;
            clusterMutationAttempted?: boolean;
            registryMutationAttempted?: boolean;
            vectorWriteAttempted?: boolean;
            ingestionJobCreated?: boolean;
            mutationAllowedByThisVerifier?: boolean;
            evidence?: string[];
            missingEvidence?: string[];
            risk?: string[];
            rollbackPath?: string[];
          };
          excludedTools?: string[];
          tools?: Array<{
            name?: string;
            category?: string;
            actionMode?: string;
            readOnly?: boolean;
            approvalRequired?: boolean;
            destructive?: boolean;
            dashboardSurface?: string;
          }>;
          evidence?: string[];
        };
      };
      policy?: {
        mutationAllowed?: boolean;
        rawDocumentReturned?: boolean;
        uploadApplyAllowed?: boolean;
      };
    };

    expect(body.rag?.documents?.length).toBeGreaterThanOrEqual(3);
    expect(
      body.rag?.documents?.some(
        (document) =>
          document.label?.includes("Payments API") &&
          document.redacted === true &&
          document.evidence?.join(" ").includes("metadata only")
      )
    ).toBe(true);
    expect(JSON.stringify(body)).not.toContain("PAYMENT_DB_HOST");
    expect(body.rag?.uploadIntake?.mode).toBe("validate-only");
    expect(body.rag?.uploadIntake?.evidence?.join(" ")).toContain(
      "local vector index"
    );
    expect(body.rag?.productionReadiness).toMatchObject({
      status: "approval-required",
      actionMode: "productionReadinessOnly",
      contractReady: true,
      approvalRequired: true,
      productionQueueLive: false,
      ingestionWorkerLive: false,
      vectorWriteAuditSinkLive: false,
      vectorWriteAttempted: false,
      ingestionJobCreated: false,
      mutationAllowedByThisVerifier: false
    });
    expect(body.rag?.productionReadiness?.components?.queue).toMatchObject({
      backendClass: "database-backed",
      storesRawMarkdown: false
    });
    expect(
      body.rag?.productionReadiness?.components?.vectorWriteAuditSink?.appendOnly
    ).toBe(true);
    expect(body.rag?.productionReadiness?.requiredApprovals).toEqual(
      expect.arrayContaining(["rag-owner", "cluster-sre", "security-reviewer"])
    );
    const ragProductionFirstActions =
      body.rag?.productionReadiness?.firstProductionActions ?? [];
    expect(ragProductionFirstActions.length).toBeGreaterThanOrEqual(2);
    expect(
      ragProductionFirstActions.some(
        (action) =>
          action.owner === "rag-owner" &&
          action.mutation === false &&
          action.requiresExplicitApproval === false &&
          /verify:rag:production-readiness/.test(action.nextCommand ?? "")
      )
    ).toBe(true);
    expect(
      ragProductionFirstActions.some(
        (action) =>
          action.id?.startsWith("approval-gated-") &&
          action.owner === "cluster-sre" &&
          action.mutation === true &&
          action.requiresExplicitApproval === true &&
          /oc apply/.test(action.nextCommand ?? "")
      )
    ).toBe(true);
    expect(
      ragProductionFirstActions.every((action) => Array.isArray(action.blockedBy))
    ).toBe(true);
    expect(body.tokenUsage?.budgetTokens).toBeGreaterThan(
      body.tokenUsage?.usedTokens ?? 0
    );
    expect(
      body.tokenUsage?.routes?.some((route) => route.route === "lightspeed-mcp")
    ).toBe(true);
    const adminMcpToolNames =
      body.lightspeed?.mcp?.tools?.map((tool) => tool.name) ?? [];
    expect(body.lightspeed?.mcp).toMatchObject({
      endpoint: "/mcp",
      localEndpoint: "/api/opslens/mcp",
      toolCount: 6,
      readOnlyCount: 6,
      mutatingToolExcluded: true
    });
    expect(["pass", "needs-evidence", "failed"]).toContain(
      body.lightspeed?.mcp?.routing?.status
    );
    expect(body.lightspeed?.mcp?.routing?.threshold).toBe(8);
    expect(body.lightspeed?.mcp?.routing?.evidence?.join(" ")).toContain(
      "verify:lightspeed:routing"
    );
    expect(["pass", "needs-evidence", "failed"]).toContain(
      body.lightspeed?.mcp?.trojanHorse?.status
    );
    expect(body.lightspeed?.mcp?.trojanHorse?.question).toBe(
      "우리 회사 결제 시스템 Pod 장애 대응 매뉴얼 알려줘"
    );
    expect(body.lightspeed?.mcp?.trojanHorse?.evidence?.join(" ")).toContain(
      "verify:lightspeed:trojan-horse"
    );
    if (body.lightspeed?.mcp?.trojanHorse?.status === "pass") {
      expect(body.lightspeed.mcp.trojanHorse.selectedTool).toBe(
        "generate_playbook"
      );
      expect(body.lightspeed.mcp.trojanHorse.citationCount).toBeGreaterThan(0);
      expect(body.lightspeed.mcp.trojanHorse.redactionPassed).toBe(true);
      expect(body.lightspeed.mcp.trojanHorse.mutationAllowed).toBe(false);
      expect(body.lightspeed.mcp.trojanHorse.rawDocumentReturned).toBe(false);
      expect(body.lightspeed.mcp.trojanHorse.clusterMutationAttempted).toBe(false);
      expect(body.lightspeed.mcp.trojanHorse.vectorWriteAttempted).toBe(false);
      expect(body.lightspeed.mcp.trojanHorse.worktreeDirty).toBe(false);
    }
    if (body.lightspeed?.mcp?.routing?.status === "pass") {
      expect(body.lightspeed.mcp.routing.selectedPasses).toBeGreaterThanOrEqual(
        body.lightspeed.mcp.routing.threshold ?? 8
      );
      expect(body.lightspeed.mcp.routing.responsePasses).toBeGreaterThanOrEqual(
        body.lightspeed.mcp.routing.threshold ?? 8
      );
      expect(body.lightspeed.mcp.routing.worktreeDirty).toBe(false);
    }
    expect([
      "ready-for-live-registration-review",
      "live-ready",
      "needs-evidence",
      "blocked",
      "failed"
    ]).toContain(body.lightspeed?.mcp?.integrationHandoff?.status);
    expect(body.lightspeed?.mcp?.integrationHandoff).toMatchObject({
      actionMode: "handoffOnly",
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      vectorWriteAttempted: false,
      ingestionJobCreated: false,
      mutationAllowedByThisVerifier: false
    });
    expect(
      body.lightspeed?.mcp?.integrationHandoff?.readOnlyCommands?.length
    ).toBeGreaterThan(0);
    expect(
      body.lightspeed?.mcp?.integrationHandoff?.readOnlyCommands?.every(
        (command) => command.mutation === false
      )
    ).toBe(true);
    expect(
      body.lightspeed?.mcp?.integrationHandoff?.approvalGatedCommands?.every(
        (command) =>
          command.mutation === true && command.requiresExplicitApproval === true
      )
    ).toBe(true);
    expect(
      body.lightspeed?.mcp?.integrationHandoff?.olsconfig?.desiredServer?.url
    ).toContain("/mcp");
    expect(
      body.lightspeed?.mcp?.integrationHandoff?.evidence?.join(" ")
    ).toContain("verify:lightspeed:integration-handoff");
    expect(["ready", "needs-evidence", "failed"]).toContain(
      body.installReadiness?.lightspeedExtensionPoint
    );
    expect(body.installReadiness?.extensionPoint).toMatchObject({
      actionMode: "readOnlyEvidenceOnly",
      productContract: "OLSConfig.spec.mcpServers custom MCP server",
      lightspeedFacingEndpoint: "/mcp",
      localSmokeEndpoint: "/api/opslens/mcp",
      undocumentedWebhookSupported: false,
      legacyConfigMapRegistrationSupported: false,
      technologyPreview: true
    });
    expect(body.installReadiness?.extensionPoint?.olsconfig?.kind).toBe(
      "OLSConfig"
    );
    expect(
      body.installReadiness?.extensionPoint?.olsconfig?.featureGates
    ).toContain("MCPServer");
    expect(
      body.installReadiness?.extensionPoint?.olsconfig?.server?.url
    ).toContain("/mcp");
    expect(body.installReadiness?.extensionPoint?.olsconfig?.server).toMatchObject({
      userBearerForwarding: true,
      secretHeader: true
    });
    expect(
      body.installReadiness?.extensionPoint?.routes?.map((route) => route.path)
    ).toEqual(expect.arrayContaining(["/mcp", "/api/opslens/mcp"]));
    expect(
      body.installReadiness?.extensionPoint?.mutationBoundary
    ).toMatchObject({
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      vectorWriteAttempted: false,
      mutationAllowedByThisVerifier: false
    });
    expect(
      body.installReadiness?.extensionPoint?.requirements?.some(
        (requirement) =>
          requirement.id === "no-undocumented-lightspeed-webhook" &&
          requirement.pass === true
      )
    ).toBe(true);
    expect(body.installReadiness?.evidence?.join(" ")).toContain(
      "verify:lightspeed-extension"
    );
    if (
      body.lightspeed?.mcp?.integrationHandoff?.status ===
        "ready-for-live-registration-review" ||
      body.lightspeed?.mcp?.integrationHandoff?.status === "live-ready"
    ) {
      expect(body.lightspeed.mcp.integrationHandoff.worktreeDirty).toBe(false);
      expect(
        body.lightspeed.mcp.integrationHandoff.olsconfig?.templateReady
      ).toBe(true);
    }
    expect(body.lightspeed?.mcp?.excludedTools).toContain("apply_remediation");
    expect(adminMcpToolNames).toEqual(
      expect.arrayContaining([
        "get_cluster_signal",
        "retrieve_customer_knowledge",
        "generate_playbook",
        "open_console_deep_link",
        "run_preflight",
        "propose_remediation"
      ])
    );
    expect(
      body.lightspeed?.mcp?.tools?.every(
        (tool) =>
          tool.readOnly === true &&
          tool.approvalRequired === false &&
          tool.destructive === false
      )
    ).toBe(true);
    expect(
      body.lightspeed?.mcp?.tools?.find(
        (tool) => tool.name === "open_console_deep_link"
      )
    ).toMatchObject({
      category: "console-navigation",
      actionMode: "readOnly",
      dashboardSurface: "openshift-console"
    });
    expect(
      body.lightspeed?.mcp?.tools?.find((tool) => tool.name === "run_preflight")
    ).toMatchObject({
      category: "preflight",
      actionMode: "readOnly",
      dashboardSurface: "install-readiness"
    });
    expect(
      body.lightspeed?.mcp?.tools?.find(
        (tool) => tool.name === "propose_remediation"
      )
    ).toMatchObject({
      category: "plan-only-remediation",
      actionMode: "planOnly"
    });
    expect(body.lightspeed?.mcp?.evidence?.join(" ")).toContain("AC-LS-001");
    expect(body.runtime?.gpu?.samples?.length).toBe(12);
    expect([
      "ready",
      "needs-live-check",
      "degraded",
      "failed"
    ]).toContain(body.runtime?.readiness?.status);
    expect(body.runtime?.readiness).toMatchObject({
      actionMode: "readOnly",
      mutationAllowed: false,
      rawDocumentReturned: false
    });
    expect(body.runtime?.readiness?.vectorStore).toMatchObject({
      provider: "qdrant",
      liveProbeEnabled: false
    });
    expect(body.runtime?.readiness?.modelRuntime).toMatchObject({
      provider: "vllm",
      liveProbeEnabled: false
    });
    expect(body.runtime?.readiness?.missingEvidence?.join(" ")).toContain(
      "live readiness was not probed"
    );
    expect(["ready", "needs-live-evidence", "blocked"]).toContain(
      body.runtime?.liveHandoff?.status
    );
    expect(body.runtime?.liveHandoff).toMatchObject({
      actionMode: "handoffOnly",
      runtimePlatformOwner: "runtime-platform",
      dataMlOwner: "data-ml-engineer",
      liveProbeEnabled: false,
      qdrantStatus: body.runtime?.readiness?.vectorStore?.status,
      vllmStatus: body.runtime?.readiness?.modelRuntime?.status,
      mutationAllowedByThisVerifier: false,
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      vectorWriteAttempted: false
    });
    expect(
      body.runtime?.liveHandoff?.runtimeReadinessAction
    ).toMatchObject({
      id: "runtime-platform-run-live-vllm-qdrant-probes",
      owner: "runtime-platform"
    });
    expect(
      body.runtime?.liveHandoff?.runtimeReadinessAction?.readOnlyCommandIds
    ).toEqual(expect.arrayContaining(["runtime-readiness-live"]));
    expect(body.runtime?.liveHandoff?.runtimeRagAction).toMatchObject({
      id: "data-ml-engineer-prove-runtime-rag-live-quality",
      owner: "data-ml-engineer"
    });
    expect(
      body.runtime?.liveHandoff?.runtimeRagAction?.readOnlyCommandIds
    ).toEqual(
      expect.arrayContaining(["runtime-rag-contract", "runtime-rag-fixture"])
    );
    expect(body.runtime?.liveHandoff?.requiredReadOnlyCommands).toEqual(
      expect.arrayContaining([
        "runtime-readiness-live",
        "runtime-rag-contract",
        "runtime-rag-fixture"
      ])
    );
    expect(body.runtime?.liveHandoff?.approvalGatedCommandCount).toBe(0);

    const runtimeReadiness = await request.get("/api/opslens/runtime/readiness");
    expect(runtimeReadiness.ok()).toBe(true);
    const runtimeReadinessBody = (await runtimeReadiness.json()) as {
      actionMode?: string;
      mutationAllowed?: boolean;
      vectorStore?: { provider?: string; liveProbeEnabled?: boolean };
      modelRuntime?: { provider?: string; liveProbeEnabled?: boolean };
    };
    expect(runtimeReadinessBody).toMatchObject({
      actionMode: "readOnly",
      mutationAllowed: false
    });
    expect(runtimeReadinessBody.vectorStore).toMatchObject({
      provider: "qdrant",
      liveProbeEnabled: false
    });
    expect(runtimeReadinessBody.modelRuntime).toMatchObject({
      provider: "vllm",
      liveProbeEnabled: false
    });
    expect(
      body.incidents?.[0]?.metricQueries?.map((query) => query.name)
    ).toEqual(
      expect.arrayContaining([
        "firing-alert",
        "pod-restarts",
        "pod-cpu",
        "pod-memory"
      ])
    );
    expect(body.incidents?.[0]?.remediationProposal).toMatchObject({
      artifactType: "opslens.remediation.proposal.v0.1",
      actionMode: "planOnly",
      mutationAllowed: false,
      patchType: "strategicMerge"
    });
    expect(
      body.incidents?.[0]?.remediationProposal?.target?.fieldPath
    ).toContain("resources.limits.memory");
    expect(body.incidents?.[0]?.remediationProposal?.currentValue).toMatchObject({
      value: "2Gi",
      source: "runbook-baseline"
    });
    expect(body.incidents?.[0]?.remediationProposal?.proposedValue).toMatchObject({
      value: "4Gi",
      source: "candidate-remediation"
    });
    expect(
      body.incidents?.[0]?.remediationProposal?.triggerEvidence?.logs
    ).toMatchObject({
      windowMinutes: 10,
      currentRead: true
    });
    expect(
      body.incidents?.[0]?.remediationProposal?.triggerEvidence?.metrics?.queries?.map(
        (query) => query.name
      )
    ).toEqual(expect.arrayContaining(["firing-alert", "pod-memory"]));
    expect(
      body.incidents?.[0]?.remediationProposal?.triggerEvidence?.runbookCitations
        ?.length
    ).toBeGreaterThan(0);
    expect(body.incidents?.[0]?.remediationProposal?.yamlPatch).toContain(
      "memory: 4Gi"
    );
    expect(body.incidents?.[0]?.remediationProposal?.forbiddenActions).toEqual([
      "apply",
      "delete",
      "scale"
    ]);
    expect(body.incidents?.[0]?.remediationProposal?.reviewGate).toMatchObject({
      required: true
    });
    expect(["ready", "needs-live-evidence", "failed"]).toContain(
      body.aiops?.incidentPipeline?.status
    );
    expect(body.aiops?.incidentPipeline).toMatchObject({
      actionMode: "readOnlyEvidenceOnly",
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      vectorWriteAttempted: false,
      ingestionJobCreated: false,
      mutationAllowedByThisVerifier: false
    });
    expect(
      body.aiops?.incidentPipeline?.acceptance
    ).toEqual(
      expect.arrayContaining(["AC-AIOPS-001", "AC-AIOPS-002", "AC-DASH-001"])
    );
    expect(
      body.aiops?.incidentPipeline?.requiredMetricQueries
    ).toEqual(
      expect.arrayContaining([
        "firing-alert",
        "pod-restarts",
        "pod-cpu",
        "pod-memory"
      ])
    );
    expect(
      body.aiops?.incidentPipeline?.metricQueries?.map((query) => query.name)
    ).toEqual(
      expect.arrayContaining([
        "firing-alert",
        "pod-restarts",
        "pod-cpu",
        "pod-memory"
      ])
    );
    const monitoringProxyHandoff =
      body.aiops?.incidentPipeline?.monitoringProxyHandoff;
    expect(["ready", "needs-approval", "needs-evidence"]).toContain(
      monitoringProxyHandoff?.status
    );
    expect(monitoringProxyHandoff).toMatchObject({
      actionMode: "handoffOnly",
      owner: "cluster-sre",
      mutationAllowedByThisVerifier: false,
      clusterMutationAttempted: false
    });
    expect(monitoringProxyHandoff?.requiredQueries).toEqual(
      expect.arrayContaining([
        "firing-alert",
        "pod-restarts",
        "pod-cpu",
        "pod-memory"
      ])
    );
    expect(monitoringProxyHandoff?.nextCommand).toContain("verify:aiops");
    expect(
      monitoringProxyHandoff?.readOnlyCommands?.map((command) => command.id)
    ).toEqual(expect.arrayContaining(["aiops-monitoring-proxy-smoke"]));
    expect(
      monitoringProxyHandoff?.readOnlyCommands?.find(
        (command) => command.id === "aiops-monitoring-proxy-smoke"
      )
    ).toMatchObject({
      mutation: false,
      requiresNetwork: true,
      writesLocalEvidence: true
    });
    expect(
      `${monitoringProxyHandoff?.evidence?.join(" ") ?? ""} ${
        monitoringProxyHandoff?.missingEvidence?.join(" ") ?? ""
      }`
    ).toMatch(/monitoring proxy|Monitoring proxy|OCP_ENABLE_MONITORING_PROXY/);
    expect(
      body.aiops?.incidentPipeline?.triggerEvidenceRequired
    ).toEqual(
      expect.arrayContaining(["logs", "events", "metrics", "runbookCitations"])
    );
    expect(body.aiops?.incidentPipeline?.alertmanagerIntake).toMatchObject({
      artifactType: "opslens.alertmanager-incident-intake.v0.1",
      rawAlertReturned: false,
      mutationAllowed: false,
      clusterMutationAttempted: false
    });
    expect(
      body.aiops?.incidentPipeline?.alertmanagerIntake?.evidence?.join(" ")
    ).toContain("/api/opslens/incidents/alertmanager");
    expect(body.aiops?.incidentPipeline?.evidence?.join(" ")).toMatch(
      /verify:aiops|AI Ops incident pipeline/i
    );
    expect([
      "ready",
      "needs-live-check",
      "needs-configuration",
      "failed"
    ]).toContain(body.installReadiness?.lightspeedMcp);
    expect(body.installReadiness?.evidence?.join(" ")).toContain(
      "Lightspeed"
    );
    expect(body.installReadiness?.evidence?.join(" ")).toContain(
      "Lightspeed currentGap="
    );
    expect(["ready", "needs-evidence", "failed"]).toContain(
      body.installReadiness?.environmentIsolation
    );
    expect(body.installReadiness?.envContract).toMatchObject({
      actionMode: "localEnvAuditOnly",
      activeOcpTarget: true,
      activeLightspeedTarget: true,
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      vectorWriteAttempted: false,
      mutationAllowedByThisVerifier: false
    });
    expect(
      body.installReadiness?.envContract?.checks?.map((check) => check.name)
    ).toEqual(
      expect.arrayContaining([
        "OCP base URL and token",
        "Lightspeed TLS isolation",
        "Actual .env OCP target active",
        "Actual .env Lightspeed target active"
      ])
    );
    expect(
      body.installReadiness?.envContract?.duplicateActiveKeys
    ).toEqual([]);
    expect(
      body.installReadiness?.envContract?.activeMissingValues
    ).toEqual([]);
    expect(body.installReadiness?.evidence?.join(" ")).toMatch(/verify:env/);
    expect(body.installReadiness?.operatorPackaging).toBe("draft");
    expect(["ready", "needs-evidence", "failed"]).toContain(
      body.installReadiness?.ocpConnectivity
    );
    expect(body.installReadiness?.connectivity).toMatchObject({
      actionMode: "readOnly",
      clusterMutationAttempted: false,
      mutationAllowedByThisVerifier: false
    });
    expect(
      body.installReadiness?.connectivity?.classification
    ).toMatch(
      /api-ready|tcp-timeout|tcp-unreachable|dns-unresolved|api-unreachable|auth-or-rbac|auth-failed|tls-handshake-failed|not-configured|invalid-api-url|token-missing/
    );
    expect(body.installReadiness?.connectivity?.target?.host).toMatch(
      /redacted/i
    );
    expect(
      body.installReadiness?.connectivity?.target?.redactedBaseUrl
    ).toContain("<redacted-ocp-api>");
    expect(
      body.installReadiness?.connectivity?.actionHints?.length ?? 0
    ).toBeGreaterThan(0);
    expect(
      body.installReadiness?.connectivity?.actionHints
        ?.map((hint) => `${hint.id} ${hint.summary} ${hint.nextCheck}`)
        .join(" ")
    ).toMatch(/ocp:connectivity|vpn|firewall|dns|token|tls|api/i);
    expect(
      body.installReadiness?.connectivity?.actionHints
        ?.map((hint) => `${hint.summary} ${hint.nextCheck}`)
        .join(" ")
    ).toContain("--timeout-ms 30000");
    expect(
      body.installReadiness?.connectivity?.readOnlyTroubleshootingCommands
        ?.every((command) => command.mutation === false)
    ).toBe(true);
    expect(
      body.installReadiness?.connectivity?.readOnlyTroubleshootingCommands
        ?.map((command) => `${command.id} ${command.command}`)
        .join(" ")
    ).toMatch(/Test-NetConnection|Resolve-DnsName|verify:ocp:connectivity/i);
    const ocpNetworkEvidenceText = JSON.stringify({
      connectivity: body.installReadiness?.connectivity,
      networkHandoff: body.installReadiness?.networkHandoff
    });
    expect(ocpNetworkEvidenceText).not.toMatch(
      /\b(?:10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})\b/
    );
    expect(ocpNetworkEvidenceText).not.toMatch(
      /\b(?:api|console|oauth)[A-Za-z0-9.-]*ocp[A-Za-z0-9.-]*\b/i
    );
    expect(body.installReadiness?.networkHandoff).toMatchObject({
      actionMode: "handoffOnly",
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      mutationAllowedByThisVerifier: false
    });
    expect(body.installReadiness?.networkHandoff?.target?.host).toMatch(
      /redacted/i
    );
    expect(
      body.installReadiness?.networkHandoff?.target?.redactedBaseUrl
    ).toContain("<redacted-ocp-api>");
    expect(
      body.installReadiness?.networkHandoff?.sourceArtifacts?.map(
        (source) => source.id
      )
    ).toEqual(expect.arrayContaining(["evidenceCheckpoint"]));
    expect(
      body.installReadiness?.networkHandoff?.sourceArtifacts?.find(
        (source) => source.id === "evidenceCheckpoint"
      )
    ).toMatchObject({
      fresh: true
    });
    expect(body.installReadiness?.networkHandoff?.ticketPacket).toMatchObject({
      id: "network-sre-ocp-api-reachability-ticket",
      owner: "network-sre",
      classification: body.installReadiness?.networkHandoff?.classification,
      redactedTarget: expect.stringContaining("<redacted-ocp-api>")
    });
    expect(
      body.installReadiness?.networkHandoff?.ticketPacket?.evidenceChecklist?.join(
        " "
      )
    ).toContain("classification=");
    expect(
      body.installReadiness?.networkHandoff?.ticketPacket?.firstReadOnlyAction
    ).toMatchObject({
      mutation: false,
      requiresExplicitApproval: false
    });
    expect(
      body.installReadiness?.networkHandoff?.ticketPacket?.nextCommands?.join(" ")
    ).toMatch(/verify:ocp:connectivity|Test-NetConnection|Resolve-DnsName|route print/);
    expect(
      body.installReadiness?.networkHandoff?.ticketPacket?.mutationBoundary
    ).toMatchObject({
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      mutationAllowedByThisVerifier: false
    });
    const networkFirstActions =
      body.installReadiness?.networkHandoff?.firstNetworkActions ?? [];
    expect(networkFirstActions.length).toBeGreaterThanOrEqual(3);
    expect(
      networkFirstActions.some(
        (action) =>
          action.mutation === false &&
          action.requiresExplicitApproval === false &&
          /Test-NetConnection|Resolve-DnsName|verify:ocp:connectivity|route print/i.test(
            action.nextCommand ?? ""
          )
      )
    ).toBe(true);
    expect(
      networkFirstActions.every(
        (action) => action.mutation !== true || action.requiresExplicitApproval === true
      )
    ).toBe(true);
    expect(
      networkFirstActions.every((action) => Array.isArray(action.blockedBy))
    ).toBe(true);
    if (
      ["tcp-timeout", "tcp-unreachable", "dns-unresolved"].includes(
        body.installReadiness?.networkHandoff?.classification ?? ""
      )
    ) {
      expect(
        networkFirstActions.some(
          (action) =>
            action.id === "approval-gated-network-route-change" &&
            action.mutation === true &&
            action.requiresExplicitApproval === true
        )
      ).toBe(true);
    }
    expect(body.installReadiness?.connectivity?.target).toMatchObject({
      tokenConfigured: expect.any(Boolean),
      tlsVerify: expect.any(Boolean)
    });
    expect(
      body.installReadiness?.connectivity?.diagnostics?.rbacAccessReviews?.length
    ).toBeGreaterThan(0);
    expect(
      body.installReadiness?.connectivity?.diagnostics?.rbacAccessReviews?.map(
        (review) => review.id
      )
    ).toEqual(
      expect.arrayContaining([
        "can-i-list-pods",
        "can-i-get-pod-logs",
        "can-i-get-olsconfigs"
      ])
    );
    expect(
      body.installReadiness?.connectivity?.diagnostics?.rbacAccessReviews?.every(
        (review) =>
          ["allowed", "denied", "unknown"].includes(review.status ?? "") &&
          review.command?.startsWith("oc auth can-i")
      )
    ).toBe(true);
    expect(body.installReadiness?.evidence?.join(" ")).toMatch(
      /OCP connectivity classification/i
    );
    expect(body.installReadiness?.evidence?.join(" ")).toContain(
      `classification=${body.installReadiness?.connectivity?.classification}`
    );
    expect(["ready", "partial", "needs-evidence", "failed"]).toContain(
      body.installReadiness?.operatorDryRun
    );
    expect(body.installReadiness?.evidence?.join(" ")).toContain(
      "Operator dry-run"
    );
    expect(["ready", "needs-evidence", "failed"]).toContain(
      body.installReadiness?.operatorRuntimeBoundary
    );
    expect(body.installReadiness?.operatorRuntimeBoundarySummary).toMatchObject({
      actionMode: "operatorRuntimeParityOnly",
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      mutationAllowedByThisVerifier: false
    });
    expect(
      body.installReadiness?.operatorRuntimeBoundarySummary?.parity
    ).toMatchObject({
      lightspeedMode: "PatchOLSConfig",
      assistantMutationAllowed: false,
      ragApprovalQueueMutationAllowed: false,
      ragRawDocumentReturnAllowed: false
    });
    expect(
      body.installReadiness?.operatorRuntimeBoundarySummary
        ?.goLightspeedMutationBoundary
    ).toMatchObject({
      functionFound: true,
      validateOnlyGuardBeforeRead: true,
      endpointGuardBeforeRead: true,
      patchCallCount: 1,
      patchAfterRead: true,
      configMapReferenceCount: 0,
      reconcileBeforeStatus: true
    });
    expect(body.installReadiness?.evidence?.join(" ")).toContain(
      "Operator runtime boundary"
    );
    expect([
      "approval-required",
      "needs-evidence",
      "failed"
    ]).toContain(body.installReadiness?.installPlan);
    expect(body.installReadiness?.evidence?.join(" ")).toMatch(
      /install approval plan/i
    );
    expect(body.installReadiness?.approvalPlan).toMatchObject({
      actionMode: "approvalPlanOnly",
      clusterMutationAttempted: false,
      mutationAllowedByThisVerifier: false
    });
    expect(
      body.installReadiness?.approvalPlan?.requiredApprovals
    ).toEqual(
      expect.arrayContaining([
        "cluster-admin",
        "cluster-sre",
        "security-reviewer",
        "product-owner"
      ])
    );
    expect(
      body.installReadiness?.approvalPlan?.firstApprovalActions?.length ?? 0
    ).toBeGreaterThan(0);
    expect(
      body.installReadiness?.approvalPlan?.firstApprovalActions?.some(
        (action) =>
          action.mutation === false &&
          action.nextCommand?.match(/verify:|git status|ocp:connectivity/)
      )
    ).toBe(true);
    expect(
      body.installReadiness?.approvalPlan?.firstApprovalActions?.some(
        (action) =>
          action.mutation === true &&
          action.requiresExplicitApproval === true &&
          action.id?.startsWith("approval-gated-")
      )
    ).toBe(true);
    expect(
      body.installReadiness?.approvalPlan?.lightspeedRegistration
    ).toMatchObject({
      actionMode: "previewOnly",
      mode: "PatchOLSConfig",
      configResourceKind: "OLSConfig",
      clusterMutationAttempted: false,
      mutationAllowedByThisVerifier: false,
      legacyConfigMapMutationAttempted: false
    });
    expect(
      body.installReadiness?.approvalPlan?.lightspeedRegistration?.target
    ).toMatchObject({
      namespace: "openshift-lightspeed",
      name: "cluster"
    });
    expect(
      body.installReadiness?.approvalPlan?.lightspeedRegistration?.desiredServer
        ?.url
    ).toMatch(/\/mcp$/);
    expect(
      (
        body.installReadiness?.approvalPlan?.lightspeedRegistration
          ?.readOnlyCommands ?? []
      )
        .map((command) => command.command)
        .join(" ")
    ).toContain("verify:lightspeed:patch-preview");
    expect(body.installReadiness?.approvalPlan?.ragIngestion).toMatchObject({
      actionMode: "ingestionPlanOnly",
      clusterMutationAttempted: false,
      vectorWriteAttempted: false,
      ingestionJobCreated: false,
      mutationAllowedByThisVerifier: false
    });
    expect([
      "ready-for-ingestion-job",
      "needs-evidence",
      "failed"
    ]).toContain(body.installReadiness?.approvalPlan?.ragIngestion?.status);
    expect(
      body.installReadiness?.approvalPlan?.ragIngestion?.requiredApprovals
    ).toEqual(expect.arrayContaining(["rag-owner", "cluster-sre"]));
    expect([
      "ready-for-dry-run",
      "needs-tooling",
      "needs-evidence",
      "failed"
    ]).toContain(body.installReadiness?.catalogToolchain);
    expect(body.installReadiness?.catalogToolchainPlan).toMatchObject({
      actionMode: "toolchainPlanOnly",
      registryMutationAttempted: false,
      clusterMutationAttempted: false,
      mutationAllowedByThisVerifier: false
    });
    expect(
      typeof body.installReadiness?.catalogToolchainPlan?.registryBaseReadable
    ).toBe("boolean");
    expect(
      body.installReadiness?.catalogToolchainPlan?.cli?.map((tool) => tool.name)
    ).toEqual(expect.arrayContaining(["docker", "opm", "operator-sdk", "oc"]));
    expect(
      body.installReadiness?.catalogToolchainPlan?.readOnlyCommands?.every(
        (command) => command.mutation === false
      )
    ).toBe(true);
    expect(
      body.installReadiness?.catalogToolchainPlan?.localArtifactCommands?.every(
        (command) => command.mutation === false
      )
    ).toBe(true);
    expect(body.installReadiness?.evidence?.join(" ")).toMatch(
      /catalog toolchain/i
    );
    expect([
      "ready-for-review",
      "needs-tooling",
      "needs-evidence",
      "failed"
    ]).toContain(body.installReadiness?.certificationReadiness);
    expect(body.installReadiness?.certificationPlan).toMatchObject({
      actionMode: "certificationReadinessOnly",
      registryMutationAttempted: false,
      clusterMutationAttempted: false,
      mutationAllowedByThisVerifier: false
    });
    expect(
      body.installReadiness?.certificationPlan?.cli?.map((tool) => tool.name)
    ).toEqual(
      expect.arrayContaining(["oc", "docker", "opm", "operator-sdk"])
    );
    expect(
      body.installReadiness?.certificationPlan?.cli?.filter(
        (tool) => tool.requiredForExternalSubmission
      ).length ?? 0
    ).toBeGreaterThanOrEqual(4);
    expect(body.installReadiness?.certificationPlan?.toolingHandoff).toMatchObject({
      actionMode: "humanSetupOnly"
    });
    expect([
      "needs-tooling",
      "ready-for-validation",
      "needs-evidence"
    ]).toContain(
      body.installReadiness?.certificationPlan?.toolingHandoff?.status
    );
    expect(
      body.installReadiness?.certificationPlan?.toolingHandoff
        ?.toolingSatisfiedBy
    ).toMatch(/local-workstation|approved-ci-image|missing/);
    expect(
      body.installReadiness?.certificationPlan?.toolingHandoff
        ?.runnerEvidence
    ).toMatchObject({
      path: "docs/release/evidence/certification/approved-ci-runner.json",
      requiredSchema: "cywell.opslens.certification-ci-runner.v0.1",
      mutation: false
    });
    expect(
      body.installReadiness?.certificationPlan?.toolingHandoff
        ?.runnerEvidence?.status
    ).toMatch(/missing|needs-evidence|ready|invalid/);
    expect(
      body.installReadiness?.certificationPlan?.toolingHandoff
        ?.runnerEvidence?.nextCommands?.join(" ")
    ).toContain("verify:certification");
    expect(
      body.installReadiness?.certificationPlan?.toolingHandoff
        ?.runnerEvidence?.nextCommands?.join(" ")
    ).toContain("evidence:certification:ci-runner-draft");
    expect(
      body.installReadiness?.certificationPlan?.toolingHandoff?.runnerDraft
    ).toMatchObject({
      path: "docs/release/evidence/certification/approved-ci-runner.draft.json",
      finalEvidenceFile:
        "docs/release/evidence/certification/approved-ci-runner.json",
      actionMode: "draftOnly",
      draft: true,
      sameHead: true,
      mutation: false,
      registryMutationAttempted: false,
      clusterMutationAttempted: false,
      mutationAllowedByThisVerifier: false
    });
    expect(
      body.installReadiness?.certificationPlan?.toolingHandoff?.runnerDraft
        ?.evidenceState
    ).toMatch(/DRAFT_NEEDS_EVIDENCE|DRAFT_REVIEW_READY/);
    expect(
      body.installReadiness?.certificationPlan?.toolingHandoff?.runnerDraft
        ?.reviewerRequests?.length ?? 0
    ).toBeGreaterThanOrEqual(1);
    expect(
      body.installReadiness?.certificationPlan?.toolingHandoff
        ?.executionLanes?.map((lane) => lane.id)
    ).toEqual(
      expect.arrayContaining([
        "local-workstation",
        "approved-ci-image",
        "hosted-certification-pipeline"
      ])
    );
    expect(
      body.installReadiness?.certificationPlan?.toolingHandoff
        ?.executionLanes?.every(
          (lane) => lane.mutation !== true || lane.requiresExplicitApproval === true
        )
    ).toBe(true);
    expect(
      body.installReadiness?.certificationPlan?.toolingHandoff
        ?.freshnessPolicy?.requiredHead
    ).toBe("current Git HEAD");
    expect(
      body.installReadiness?.certificationPlan?.toolingHandoff
        ?.readOnlyCommands?.some(
          (command) =>
            command.command?.includes("verify:certification") &&
            command.mutation === false
        )
    ).toBe(true);
    expect(
      body.installReadiness?.certificationPlan?.toolingHandoff
        ?.setupCommands?.every((command) => command.mutation === false)
    ).toBe(true);
    expect(
      body.installReadiness?.certificationPlan?.toolingHandoff
        ?.approvalGatedCommands?.every((command) => command.mutation === true)
    ).toBe(true);
    const certificationFirstSubmissionActions =
      body.installReadiness?.certificationPlan?.firstSubmissionActions ?? [];
    expect(certificationFirstSubmissionActions.length).toBeGreaterThanOrEqual(
      3
    );
    expect(
      certificationFirstSubmissionActions.some(
        (action) =>
          action.owner === "release-manager" &&
          action.nextCommand?.includes("verify:certification") &&
          action.mutation === false &&
          action.requiresExplicitApproval === false
      )
    ).toBe(true);
    expect(
      certificationFirstSubmissionActions.some(
        (action) =>
          action.id?.startsWith("approval-gated-") &&
          /partner-connect-submit|operatorhub-submit/.test(
            action.id ?? ""
          ) &&
          action.mutation === true &&
          action.requiresExplicitApproval === true
      )
    ).toBe(true);
    expect(
      certificationFirstSubmissionActions.every((action) =>
        Array.isArray(action.blockedBy)
      )
    ).toBe(true);
    expect(
      body.installReadiness?.certificationPlan?.gateCounts?.internalCatalog?.total ??
        0
    ).toBeGreaterThan(0);
    expect(
      Object.keys(body.installReadiness?.certificationPlan?.documents ?? {})
    ).toEqual(
      expect.arrayContaining([
        "security",
        "support",
        "certificationTooling",
        "releaseGates"
      ])
    );
    expect(body.installReadiness?.evidence?.join(" ")).toMatch(
      /certification readiness/i
    );
    expect(["ready", "needs-evidence", "failed"]).toContain(
      body.installReadiness?.communityOperatorSubmission
    );
    expect(body.installReadiness?.communitySubmissionPlan).toMatchObject({
      actionMode: "submissionDraftOnly",
      externalSubmissionAttempted: false,
      registryMutationAttempted: false,
      clusterMutationAttempted: false,
      mutationAllowedByThisVerifier: false
    });
    expect(
      body.installReadiness?.communitySubmissionPlan?.submissionLayout?.root
    ).toBe("operators/cywell-opslens");
    expect(
      body.installReadiness?.communitySubmissionPlan?.readOnlyCommands?.some(
        (command) =>
          command.command?.includes("verify:community-submission") &&
          command.mutation === false
      )
    ).toBe(true);
    expect(
      body.installReadiness?.communitySubmissionPlan?.approvalGatedCommands?.every(
        (command) =>
          command.mutation === true &&
          command.requiresExplicitApproval === true
      )
    ).toBe(true);
    const communitySubmissionActions =
      body.installReadiness?.communitySubmissionPlan?.firstSubmissionActions ??
      [];
    expect(
      communitySubmissionActions.some(
        (action) =>
          action.nextCommand?.includes("verify:community-submission") &&
          action.mutation === false &&
          action.requiresExplicitApproval === false
      )
    ).toBe(true);
    expect(
      communitySubmissionActions.some(
        (action) =>
          action.id?.includes("approval-gated") &&
          action.mutation === true &&
          action.requiresExplicitApproval === true
      )
    ).toBe(true);
    expect(body.installReadiness?.evidence?.join(" ")).toMatch(
      /Community Operator submission/i
    );
    expect(["ready", "needs-evidence", "failed"]).toContain(
      body.installReadiness?.imageBuilds
    );
    expect(body.installReadiness?.evidence?.join(" ")).toContain(
      "image readiness"
    );
    expect(["ready", "needs-evidence", "failed"]).toContain(
      body.installReadiness?.ownedImageProvenance
    );
    expect(body.installReadiness?.ownedImageProvenancePlan).toMatchObject({
      actionMode: "readOnlyEvidenceOnly",
      registryMutationAttempted: false,
      clusterMutationAttempted: false,
      mutationAllowedByThisVerifier: false
    });
    expect(
      body.installReadiness?.ownedImageProvenancePlan?.requiredImages
    ).toEqual(expect.arrayContaining(["operator", "api", "dashboard", "bundle"]));
    expect(body.installReadiness?.evidence?.join(" ")).toMatch(
      /owned image provenance/i
    );
    expect([
      "approval-required",
      "needs-evidence",
      "failed"
    ]).toContain(body.installReadiness?.externalRuntimeImages);
    expect(body.installReadiness?.externalRuntimePlan).toMatchObject({
      actionMode: "approvalPlanOnly",
      registryMutationAttempted: false,
      clusterMutationAttempted: false,
      mutationAllowedByThisVerifier: false
    });
    expect(
      body.installReadiness?.externalRuntimePlan?.requiredApprovals
    ).toEqual(
      expect.arrayContaining([
        "registry-admin",
        "security-reviewer",
        "release-manager",
        "product-owner"
      ])
    );
    expect(
      body.installReadiness?.externalRuntimePlan?.externalImages?.map(
        (image) => image.name
      )
    ).toEqual(expect.arrayContaining(["vllm", "qdrant"]));
    expect(
      body.installReadiness?.externalRuntimePlan?.externalImages?.map(
        (image) => `${image.name}:${image.draftStatus}`
      )
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^vllm:(missing|draft-needs-evidence|draft-review-ready)$/),
        expect.stringMatching(/^qdrant:(missing|draft-needs-evidence|draft-review-ready)$/)
      ])
    );
    expect(
      body.installReadiness?.externalRuntimePlan?.evidenceTemplates?.map(
        (template) => `${template.name}:${template.status}`
      )
    ).toEqual(expect.arrayContaining(["vllm:ready", "qdrant:ready"]));
    expect(body.installReadiness?.externalRuntimePlan?.evidenceDrafts).toEqual(
      expect.any(Array)
    );
    expect(body.installReadiness?.evidence?.join(" ")).toMatch(
      /external runtime evidence templates/i
    );
    expect(["ready", "needs-evidence", "blocked"]).toContain(
      body.installReadiness?.externalRuntimeReviewPacket
    );
    expect(body.installReadiness?.externalRuntimeReview).toMatchObject({
      actionMode: "reviewPacketOnly",
      registryMutationAttempted: false,
      clusterMutationAttempted: false,
      mutationAllowedByThisVerifier: false
    });
    expect(
      body.installReadiness?.externalRuntimeReview?.requiredApprovals
    ).toEqual(
      expect.arrayContaining([
        "registry-admin",
        "security-reviewer",
        "release-manager",
        "product-owner"
      ])
    );
    expect(
      body.installReadiness?.externalRuntimeReview?.images?.map(
        (image) => image.name
      )
    ).toEqual(expect.arrayContaining(["vllm", "qdrant"]));
    expect(
      body.installReadiness?.externalRuntimeReview?.firstReviewerActions?.map(
        (action) => action.imageName
      )
    ).toEqual(expect.arrayContaining(["vllm", "qdrant"]));
    expect(
      body.installReadiness?.externalRuntimeReview?.firstReviewerActions?.every(
        (action) =>
          action.role &&
          action.nextCommand?.includes("evidence:external-runtime") &&
          action.finalEvidenceExists === false
      )
    ).toBe(true);
    const externalRuntimeRegistryActions =
      body.installReadiness?.externalRuntimeReview?.firstRegistryActions ?? [];
    expect(externalRuntimeRegistryActions.length).toBeGreaterThanOrEqual(2);
    expect(
      externalRuntimeRegistryActions.some(
        (action) =>
          action.owner === "registry-admin" &&
          action.nextCommand?.includes("evidence:external-runtime") &&
          action.mutation === false &&
          action.requiresExplicitApproval === false
      )
    ).toBe(true);
    expect(
      externalRuntimeRegistryActions.some(
        (action) =>
          action.owner === "registry-admin" &&
          action.id?.startsWith("approval-gated-") &&
          action.mutation === true &&
          action.requiresExplicitApproval === true
      )
    ).toBe(true);
    expect(
      externalRuntimeRegistryActions.every((action) =>
        Array.isArray(action.blockedBy)
      )
    ).toBe(true);
    expect(
      body.installReadiness?.externalRuntimeReview?.images?.map(
        (image) => `${image.name}:${image.sourceDigestInspectionStatus}`
      )
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^vllm:(pass|needs-evidence|missing)$/),
        expect.stringMatching(/^qdrant:(pass|needs-evidence|missing)$/)
      ])
    );
    expect(
      body.installReadiness?.externalRuntimeReview?.images?.map(
        (image) => `${image.name}:${image.candidateMatrix?.status}`
      )
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^vllm:(needs-candidate|no-improving-candidate|candidate-ready-for-review|current-evidence-release-eligible|missing)$/),
        expect.stringMatching(/^qdrant:(candidate-reduces-risk-but-remediation-required|candidate-ready-for-review|current-evidence-release-eligible|missing)$/)
      ])
    );
    const qdrantCandidate = body.installReadiness?.externalRuntimeReview?.images?.find(
      (image) => image.name === "qdrant"
    )?.candidateMatrix?.bestCandidate;
    if (qdrantCandidate) {
      expect(String(qdrantCandidate.criticalFindings)).toMatch(/^(\d+|unknown)$/);
      expect(String(qdrantCandidate.highFindings)).toMatch(/^(\d+|unknown)$/);
    }
    const externalRuntimeCandidateHandoff =
      body.installReadiness?.externalRuntimeReview?.candidateHandoff ?? [];
    expect(externalRuntimeCandidateHandoff.map((handoff) => handoff.imageName)).toEqual(
      expect.arrayContaining(["vllm", "qdrant"])
    );
    const qdrantCandidateHandoff = externalRuntimeCandidateHandoff.find(
      (handoff) => handoff.imageName === "qdrant"
    );
    expect(qdrantCandidateHandoff).toMatchObject({
      status: "ready-for-human-review",
      owner: "security-reviewer",
      candidateImage: "cywell/opslens-qdrant:candidate",
      releaseEligible: true,
      criticalFindings: 0,
      highFindings: 0,
      approvalRequired: true,
      mutationAllowed: false
    });
    expect(qdrantCandidateHandoff?.nextCommand).toContain("--scan-status approved");
    expect(qdrantCandidateHandoff?.blockedBy?.join(" ")).toMatch(
      /final reviewed runtime evidence/
    );
    const vllmCandidateHandoff = externalRuntimeCandidateHandoff.find(
      (handoff) => handoff.imageName === "vllm"
    );
    expect(vllmCandidateHandoff).toMatchObject({
      status: "blocked-by-remediation",
      releaseEligible: false,
      approvalRequired: true,
      mutationAllowed: false
    });
    const externalRuntimeReviewerCommands =
      body.installReadiness?.externalRuntimeReview?.images
        ?.flatMap((image) => image.reviewerRequests ?? [])
        .map((request) => request.nextCommand ?? "")
        .join(" ") ?? "";
    expect(externalRuntimeReviewerCommands).toContain(
      "evidence:external-runtime:draft"
    );
    expect(externalRuntimeReviewerCommands).toContain(
      "evidence:external-runtime:candidate-scan"
    );
    expect(
      body.installReadiness?.externalRuntimeReview?.readOnlyCommands?.every(
        (command) => command.mutation === false
      )
    ).toBe(true);
    expect(
      body.installReadiness?.externalRuntimeReview?.approvalGatedCommands?.every(
        (command) =>
          command.mutation === true &&
          command.requiresExplicitApproval === true
      )
    ).toBe(true);
    expect(body.installReadiness?.evidence?.join(" ")).toMatch(
      /external runtime review packet/i
    );
    expect([
      "ready-for-scan",
      "needs-tooling",
      "needs-evidence",
      "failed"
    ]).toContain(body.installReadiness?.securityScan);
    expect(body.installReadiness?.securityScanPlan).toMatchObject({
      actionMode: "scanPlanOnly",
      registryMutationAttempted: false,
      clusterMutationAttempted: false,
      mutationAllowedByThisVerifier: false
    });
    expect(
      body.installReadiness?.securityScanPlan?.cli?.map((tool) => tool.name)
    ).toEqual(expect.arrayContaining(["trivy", "syft", "grype", "cosign", "docker"]));
    expect(
      body.installReadiness?.securityScanPlan?.images?.map((image) => image.name)
    ).toEqual(
      expect.arrayContaining(["operator", "api", "dashboard", "bundle", "vllm", "qdrant"])
    );
    expect(body.installReadiness?.securityScanPlan?.runnerEvidence).toMatchObject({
      actionMode: "scanEvidenceLocalWrite",
      evidenceWritten: true,
      fresh: true,
      executeDockerFallback: true,
      scannerDigestsPinned: true,
      registryMutationAttempted: false,
      clusterMutationAttempted: false,
      mutationAllowedByThisVerifier: false
    });
    expect(
      body.installReadiness?.securityScanPlan?.runnerEvidence?.missingTargets
    ).toEqual([]);
    const operatorSecurityReviewDraft =
      body.installReadiness?.securityScanPlan?.images?.find(
        (image) => image.name === "operator"
      )?.reviewDraft;
    expect(operatorSecurityReviewDraft).toMatchObject({
      exists: true,
      evidenceState: expect.stringMatching(/^DRAFT_/),
      sameHead: true,
      decision: expect.stringMatching(
        /^(pending-review|approved|needs-remediation|accepted-risk|rejected|missing)$/
      ),
      explicitDecisionProvided: expect.any(Boolean),
      readyForFinalReview: false
    });
    expect(
      body.installReadiness?.securityScanPlan?.readOnlyCommands?.every(
        (command) => command.mutation === false
      )
    ).toBe(true);
    expect(
      body.installReadiness?.securityScanPlan?.readOnlyCommands?.map(
        (command) => command.id
      )
    ).toEqual(expect.arrayContaining(["security-review-drafts-all"]));
    expect(
      body.installReadiness?.securityScanPlan?.approvalGatedCommands?.every(
        (command) =>
          command.mutation === true &&
          command.requiresExplicitApproval === true
      )
    ).toBe(true);
    const securityFirstActions =
      body.installReadiness?.securityScanPlan?.firstSecurityReviewActions ?? [];
    expect(securityFirstActions.length).toBeGreaterThanOrEqual(2);
    expect(
      securityFirstActions.some(
        (action) =>
          action.owner === "security-reviewer" &&
          action.mutation === false &&
          action.requiresExplicitApproval === false &&
          /evidence:security-review:draft/.test(action.nextCommand ?? "")
      )
    ).toBe(true);
    expect(
      securityFirstActions.some(
        (action) =>
          action.id?.startsWith("approval-gated-sign-") &&
          action.owner === "registry-admin" &&
          action.mutation === true &&
          action.requiresExplicitApproval === true &&
          /cosign sign/.test(action.nextCommand ?? "")
      )
    ).toBe(true);
    expect(
      securityFirstActions.every((action) => Array.isArray(action.blockedBy))
    ).toBe(true);
    expect(body.installReadiness?.evidence?.join(" ")).toMatch(
      /security scan/i
    );
    expect([
      "approval-required",
      "needs-evidence",
      "failed"
    ]).toContain(body.installReadiness?.releasePublish);
    expect(body.installReadiness?.releasePlan).toMatchObject({
      actionMode: "approvalPlanOnly",
      registryMutationAttempted: false,
      clusterMutationAttempted: false,
      mutationAllowedByThisVerifier: false
    });
    expect(
      body.installReadiness?.releasePlan?.requiredApprovals
    ).toEqual(
      expect.arrayContaining([
        "release-manager",
        "registry-admin",
        "security-reviewer",
        "product-owner"
      ])
    );
    expect(
      body.installReadiness?.releasePlan?.firstPublishActions?.length ?? 0
    ).toBeGreaterThan(0);
    expect(
      body.installReadiness?.releasePlan?.firstPublishActions?.some(
        (action) =>
          action.mutation === false &&
          action.nextCommand?.match(/verify:|git status/)
      )
    ).toBe(true);
    expect(
      body.installReadiness?.releasePlan?.firstPublishActions?.some(
        (action) =>
          action.mutation === true &&
          action.requiresExplicitApproval === true &&
          action.id?.startsWith("approval-gated-")
      )
    ).toBe(true);
    expect(body.installReadiness?.evidence?.join(" ")).toMatch(
      /release publish plan/i
    );
    expect(["ready", "needs-evidence", "blocked"]).toContain(
      body.installReadiness?.releaseRefresh
    );
    expect(body.installReadiness?.refresh).toMatchObject({
      actionMode: "localEvidenceRefresh",
      registryMutationAttempted: false,
      clusterMutationAttempted: false,
      mutationAllowedByThisVerifier: false,
      worktreeDirty: false
    });
    expect(
      body.installReadiness?.refresh?.commands?.map((command) => command.id)
    ).toEqual(
      expect.arrayContaining([
        "mvp-gate",
        "env-contract",
        "ocp-network-handoff-post-checkpoint",
        "community-operator-submission",
        "certification-readiness",
        "catalog-toolchain",
        "security-review-drafts-all",
        "security-scan-plan",
        "release-evidence-bundle"
      ])
    );
    expect(
      body.installReadiness?.refresh?.artifacts?.map((artifact) => artifact.id)
    ).toEqual(expect.arrayContaining(["envContract"]));
    expect(
      body.installReadiness?.refresh?.artifacts?.find(
        (artifact) => artifact.id === "envContract"
      )
    ).toMatchObject({
      status: "PASS",
      fresh: true
    });
    expect(
      body.installReadiness?.refresh?.commands?.find(
        (command) => command.id === "security-review-drafts-all"
      )
    ).toMatchObject({
      status: "PASS",
      expectedNonZero: false
    });
    expect(
      body.installReadiness?.refresh?.artifacts?.length ?? 0
    ).toBeGreaterThan(0);
    expect(body.installReadiness?.refresh?.actionQueue).toMatchObject({
      status: "ready",
      ownerPacketsReady: true,
      ownerPacketCleanup: {
        deletionAllowed: true
      }
    });
    expect(
      body.installReadiness?.refresh?.actionQueue?.ownerPacketCleanup?.expectedFiles
    ).toEqual(expect.arrayContaining(["cluster-admin.md", "release-manager.md"]));
    expect(
      body.installReadiness?.refresh?.actionQueue?.ownerPackets?.map(
        (packet) => packet.owner
      )
    ).toEqual(expect.arrayContaining(["cluster-admin", "release-manager"]));
    expect(
      body.installReadiness?.refresh?.actionQueue?.ownerPackets?.every(
        (packet) => packet.exists === true
      )
    ).toBe(true);
    expect(
      body.installReadiness?.refresh?.actionQueue?.ownerPackets?.every(
        (packet) => packet.firstActionId && packet.firstNextCommand
      )
    ).toBe(true);
    expect(body.installReadiness?.evidence?.join(" ")).toMatch(
      /release evidence refresh/i
    );
    expect(["approval-ready", "needs-evidence", "blocked"]).toContain(
      body.installReadiness?.releaseEvidenceBundle
    );
    expect(body.installReadiness?.bundle).toMatchObject({
      actionMode: "bundleOnly",
      registryMutationAttempted: false,
      clusterMutationAttempted: false,
      mutationAllowedByThisVerifier: false,
      worktreeDirty: false,
      mutationBoundaryPassed: true
    });
    expect(body.installReadiness?.bundle?.markdownPath).toContain(
      "cywell-opslens-release-evidence-bundle.md"
    );
    expect(
      body.installReadiness?.bundle?.sourceArtifacts?.map(
        (source) => source.id
      )
    ).toEqual(
      expect.arrayContaining([
        "mvpGate",
        "envContract",
        "consolePluginAssets",
        "lightspeedExtensionPoint",
        "certificationReadiness",
        "communityOperatorSubmission",
        "externalRuntimeReviewPacket",
        "releasePlan",
        "evidenceCheckpoint"
      ])
    );
    expect(
      body.installReadiness?.bundle?.commandCounts?.readOnly ?? 0
    ).toBeGreaterThan(0);
    expect(
      body.installReadiness?.bundle?.commandCounts?.mutatingApprovalRequired ?? 0
    ).toBeGreaterThan(0);
    expect(body.installReadiness?.evidence?.join(" ")).toMatch(
      /release evidence bundle/i
    );
    expect(["ready", "needs-evidence", "blocked"]).toContain(
      body.installReadiness?.releaseActionQueue
    );
    expect(body.installReadiness?.actionQueue).toMatchObject({
      actionMode: "actionQueueOnly",
      registryMutationAttempted: false,
      clusterMutationAttempted: false,
      mutationAllowedByThisVerifier: false,
      mutationBoundaryPassed: true
    });
    expect(
      body.installReadiness?.actionQueue?.missingEvidence?.join(" ")
    ).not.toMatch(/npm run verify:ocp:connectivity(?! -- --timeout-ms 30000)/);
    expect(body.installReadiness?.actionQueue?.criticalPath?.length ?? 0).toBeGreaterThan(0);
    expect(
      body.installReadiness?.actionQueue?.criticalPath?.map((entry) => entry.lane)
    ).toEqual(
      expect.arrayContaining([
        "live-ocp-lightspeed",
        "external-runtime-review",
        "release-publish",
        "install-approval"
      ])
    );
    expect(
      body.installReadiness?.actionQueue?.criticalPath?.every(
        (entry) => entry.owner && entry.actionId && entry.nextCommand
      )
    ).toBe(true);
    expect(body.installReadiness?.actionQueue?.markdownPath).toContain(
      "cywell-opslens-release-action-queue.md"
    );
    expect(
      body.installReadiness?.actionQueue?.sourceArtifacts?.map((source) => source.id)
    ).toEqual(expect.arrayContaining(["envContract"]));
    const actionQueueEnvSource =
      body.installReadiness?.actionQueue?.sourceArtifacts?.find(
        (source) => source.id === "envContract"
      );
    expect(actionQueueEnvSource).toMatchObject({
      status: "PASS",
      fresh: true,
      required: true,
      mutationViolation: false
    });
    const envTargetActions =
      body.installReadiness?.actionQueue?.items?.filter(
        (item) =>
          item.source === "envContract" ||
          item.id === "cluster-sre-fix-env-target-isolation"
      ) ?? [];
    if (
      actionQueueEnvSource?.status !== "PASS" ||
      actionQueueEnvSource?.fresh !== true ||
      actionQueueEnvSource?.mutationViolation === true
    ) {
      expect(envTargetActions.length).toBeGreaterThan(0);
      expect(envTargetActions[0]?.nextCommand).toBe("npm run verify:env");
      expect(envTargetActions[0]?.diagnostics?.map((item) => item.id)).toEqual(
        expect.arrayContaining([
          "env-contract-status",
          "env-contract-targets",
          "env-contract-key-gaps",
          "env-contract-boundary"
        ])
      );
    } else {
      expect(envTargetActions.length).toBe(0);
    }
    const actionQueueOwners =
      body.installReadiness?.actionQueue?.owners?.map((owner) => owner.owner) ?? [];
    expect(actionQueueOwners).toContain("release-manager");
    expect(actionQueueOwners).toContain("security-reviewer");
    expect(
      actionQueueOwners.some((owner) =>
        ["network-sre", "cluster-admin", "cluster-sre"].includes(owner)
      )
    ).toBe(true);
    const hasOpenOcpNetworkGap =
      body.installReadiness?.actionQueue?.sourceArtifacts?.some(
        (source) =>
          source.id === "ocpNetworkHandoff" &&
          !["PASS", "READY_FOR_LIVE_RECHECK"].includes(source.status ?? "")
      ) === true;
    const ocpNetworkActions =
      body.installReadiness?.actionQueue?.items?.filter(
        (item) =>
          item.source?.includes("ocpNetworkHandoff") ||
          item.source?.includes("ocpConnectivity") ||
          item.id?.includes("ocp-api") ||
          item.id?.includes("ocp-tls") ||
          item.id?.includes("ocp-auth-rbac")
      ) ?? [];
    if (hasOpenOcpNetworkGap) {
      expect(ocpNetworkActions.length).toBeGreaterThan(0);
      const networkDiagnosticAction = ocpNetworkActions.find((item) =>
        item.diagnostics?.some(
          (diagnostic) => diagnostic.id === "ocp-network-target"
        )
      );
      expect(networkDiagnosticAction?.diagnostics?.map((item) => item.id)).toEqual(
        expect.arrayContaining([
          "ocp-network-handoff-status",
          "ocp-network-target",
          "ocp-network-probes",
          "ocp-network-boundary"
        ])
      );
      expect(
        networkDiagnosticAction?.diagnostics?.find(
          (item) => item.id === "ocp-network-target"
        )?.value
      ).toMatch(/target=.*<redacted-ocp-api>.*port=.*tokenConfigured=(true|false)/);
      expect(
        networkDiagnosticAction?.diagnostics?.find(
          (item) => item.id === "ocp-network-probes"
        )?.value
      ).toMatch(/tcp=.*tls=.*version=.*oc=/);
      expect(
        networkDiagnosticAction?.diagnostics?.find(
          (item) => item.id === "ocp-network-boundary"
        )?.value
      ).toContain("clusterMutationAttempted=false");
    }
    const clusterAdminOwnerPacket =
      body.installReadiness?.actionQueue?.ownerPackets?.find(
        (packet) => packet.owner === "cluster-admin"
      );
    if (clusterAdminOwnerPacket) {
      expect(clusterAdminOwnerPacket.markdownPath).toContain("cluster-admin.md");
    }
    expect(
      body.installReadiness?.actionQueue?.ownerPackets?.every(
        (packet) =>
          packet.firstActionId &&
          packet.firstNextCommand &&
          packet.firstEvidenceNeeded
      )
    ).toBe(true);
    const firstBlockerOwnerPacket =
      body.installReadiness?.actionQueue?.ownerPackets?.find(
        (packet) => packet.status === "blocker"
      );
    if (firstBlockerOwnerPacket) {
      expect(firstBlockerOwnerPacket.firstActionPriority).toBe("blocker");
      expect(firstBlockerOwnerPacket.firstBlockedBy?.length ?? 0).toBeGreaterThan(0);
    }
    const networkOwnerPacket =
      body.installReadiness?.actionQueue?.ownerPackets?.find(
        (packet) => packet.owner === "network-sre"
      );
    if (networkOwnerPacket) {
      expect(networkOwnerPacket.firstNextCommand).toContain("--timeout-ms 30000");
    }
    const liveReaderRbacOwnerPacket =
      body.installReadiness?.actionQueue?.ownerPackets?.find((packet) =>
        packet.approvalGatedCommandIds?.includes("apply-live-evidence-reader-rbac")
      );
    expect(liveReaderRbacOwnerPacket?.nextCommands?.join(" ")).toContain(
      "evidence:ocp-auth-rbac-plan"
    );
    expect(liveReaderRbacOwnerPacket?.approvalGatedCommandIds).toEqual(
      expect.arrayContaining([
        "apply-live-evidence-reader-rbac",
        "create-short-lived-live-reader-token"
      ])
    );
    expect(liveReaderRbacOwnerPacket?.readOnlyCommandIds).toEqual(
      expect.arrayContaining(["verify-post-approval-live-reader-smoke"])
    );
    expect(liveReaderRbacOwnerPacket?.mutationAllowedByThisVerifier).toBe(false);
    expect(
      body.installReadiness?.actionQueue?.ownerPacketCleanup?.deletionAllowed
    ).toBe(true);
    expect(
      body.installReadiness?.actionQueue?.ownerPacketCleanup?.expectedFiles
    ).toEqual(expect.arrayContaining(["cluster-admin.md", "release-manager.md"]));
    const releaseManagerOwnerPacket =
      body.installReadiness?.actionQueue?.ownerPackets?.find(
        (packet) => packet.owner === "release-manager"
      );
    expect(releaseManagerOwnerPacket?.markdownPath).toContain(
      "release-manager.md"
    );
    expect(releaseManagerOwnerPacket?.readOnlyCommandIds).toEqual(
      expect.arrayContaining(["refresh-certification-evidence"])
    );
    expect(releaseManagerOwnerPacket?.approvalGatedCommandIds).toEqual(
      expect.arrayContaining(["partner-connect-submit"])
    );
    expect(
      body.installReadiness?.actionQueue?.items?.some((item) =>
        item.nextCommand?.startsWith("npm run")
      )
    ).toBe(true);
    expect(
      body.installReadiness?.actionQueue?.sourceArtifacts?.map((source) => source.id)
    ).toEqual(expect.arrayContaining(["aiopsIncidentPipeline", "lightspeedReadiness"]));
    const candidateMatrixItems =
      body.installReadiness?.actionQueue?.items?.filter((item) =>
        item.id?.includes("candidate-matrix")
      ) ?? [];
    expect(candidateMatrixItems.length).toBeGreaterThan(0);
    expect(
      candidateMatrixItems.every(
        (item) =>
          item.nextCommand?.includes("evidence:external-runtime:candidate-scan") ||
          item.nextCommand?.includes("evidence:external-runtime:draft")
      )
    ).toBe(true);
    const vllmRegistryDigestAction =
      body.installReadiness?.actionQueue?.items?.find(
        (item) => item.id === "external-runtime-vllm-registry-admin-1"
      );
    expect(
      vllmRegistryDigestAction?.readOnlyCommands?.map((command) => command.id)
    ).toEqual(
      expect.arrayContaining([
        "refresh-external-runtime-drafts",
        "inspect-source-vllm"
      ])
    );
    expect(
      vllmRegistryDigestAction?.approvalGatedCommands?.map(
        (command) => command.id
      )
    ).toEqual(expect.arrayContaining(["mirror-vllm"]));
    expect(vllmRegistryDigestAction?.diagnostics?.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "external-runtime-review-state",
        "source-digest-inspection",
        "registry-access"
      ])
    );
    expect(
      vllmRegistryDigestAction?.diagnostics?.find(
        (item) => item.id === "registry-access"
      )?.value
    ).toMatch(/classification=registry-/);
    const vllmCandidateAction =
      body.installReadiness?.actionQueue?.items?.find(
        (item) => item.id === "external-runtime-vllm-candidate-matrix"
      );
    expect(vllmCandidateAction?.diagnostics?.map((item) => item.id)).toEqual(
      expect.arrayContaining(["candidate-status", "candidate-best"])
    );
    if (vllmCandidateAction?.nextCommand?.includes("candidate-scan")) {
      expect(vllmCandidateAction.nextCommand).toContain(
        "--timeout-ms 7200000"
      );
      expect(vllmCandidateAction.nextCommand).toContain(
        "--trivy-timeout 30m"
      );
      expect(vllmCandidateAction.nextCommand).toContain(
        "--trivy-scanners vuln"
      );
      expect(vllmCandidateAction.diagnostics?.map((item) => item.id)).toEqual(
        expect.arrayContaining([
          "candidate-findings",
          "candidate-review",
          "candidate-critical-summary",
          "candidate-requirement"
        ])
      );
      expect(vllmCandidateAction.evidenceNeeded).toContain("criticalFindings=0");
      const criticalSummary = vllmCandidateAction.diagnostics?.find(
        (item) => item.id === "candidate-critical-summary"
      )?.value;
      expect(
        criticalSummary === "criticalPackages=none criticalIds=none" ||
          /criticalPackages=.*criticalIds=/.test(criticalSummary ?? "")
      ).toBe(true);
      expect(
        vllmCandidateAction.diagnostics?.find(
          (item) => item.id === "candidate-requirement"
        )?.value
      ).toMatch(/immutable .*digest.*criticalFindings=0|zero-critical/);
      const bestCandidateDiagnostic = vllmCandidateAction.diagnostics?.find(
        (item) => item.id === "candidate-best"
      )?.value;
      expect(
        bestCandidateDiagnostic === "missing" ||
          /releaseEligible=(true|false)/.test(bestCandidateDiagnostic ?? "")
      ).toBe(true);
    }
    const qdrantCandidateAction =
      body.installReadiness?.actionQueue?.items?.find(
        (item) => item.id === "external-runtime-qdrant-candidate-matrix"
      );
    expect(
      qdrantCandidateAction?.readOnlyCommands?.map((command) => command.id)
    ).toEqual(expect.arrayContaining(["scan-qdrant-candidate"]));
    expect(qdrantCandidateAction?.nextCommand).toContain(
      "evidence:external-runtime:draft"
    );
    expect(qdrantCandidateAction?.nextCommand).toContain("--scan-evidence");
    expect(qdrantCandidateAction?.nextCommand).toContain("--sbom-evidence");
    expect(qdrantCandidateAction?.nextCommand).toContain(
      "qdrant-cywell-minimal-ubi9"
    );
    expect(qdrantCandidateAction?.evidenceNeeded).toContain(
      "criticalFindings=0"
    );
    expect(qdrantCandidateAction?.evidenceNeeded).toContain("sbom=");
    expect(qdrantCandidateAction?.diagnostics?.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "candidate-status",
        "candidate-best",
        "candidate-findings",
        "candidate-delta",
        "candidate-review"
      ])
    );
    expect(
      qdrantCandidateAction?.diagnostics
        ?.find((item) => item.id === "candidate-findings")
        ?.value
    ).toMatch(/critical=0.*high=0/);
    expect(
      qdrantCandidateAction?.diagnostics
        ?.find((item) => item.id === "candidate-review")
        ?.value
    ).toContain("promotionApproved=false");
    const securityReviewAction = body.installReadiness?.actionQueue?.items?.find(
      (item) => item.id === "security-review-operator-final-evidence"
    );
    expect(securityReviewAction?.nextCommand).toContain(
      "evidence:security-review:draft"
    );
    expect(securityReviewAction?.evidenceNeeded).toContain(
      "reviewApproved=false"
    );
    expect(securityReviewAction?.diagnostics?.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "security-final-review",
        "security-review-draft",
        "security-scan-sbom",
        "security-reviewer-ticket"
      ])
    );
    expect(
      securityReviewAction?.diagnostics
        ?.find((item) => item.id === "security-scan-sbom")
        ?.value
    ).toMatch(/scan=(true|false).*sbom=(true|false)/);
    expect(
      securityReviewAction?.diagnostics
        ?.find((item) => item.id === "security-reviewer-ticket")
        ?.value
    ).toMatch(/reviewer=(true|false).*ticket=(true|false)/);
    expect(securityReviewAction?.readOnlyCommands?.map((command) => command.id)).toEqual(
      expect.arrayContaining(["security-review-drafts-all"])
    );
    expect(
      securityReviewAction?.approvalGatedCommands?.map((command) => command.id)
    ).toEqual(expect.arrayContaining(["sign-owned-operator"]));
    expect(
      securityReviewAction?.approvalGatedCommands?.every(
        (command) =>
          command.mutation === true && command.requiresExplicitApproval === true
      )
    ).toBe(true);
    const ocpAuthAction = body.installReadiness?.actionQueue?.items?.find(
      (item) => item.id === "cluster-admin-fix-ocp-auth-rbac"
    );
    if (ocpAuthAction) {
      expect(ocpAuthAction.nextCommand).toContain("evidence:ocp-auth-rbac-plan");
      expect(
        ocpAuthAction.readOnlyCommands?.some((command) =>
          command.command?.includes("oc apply --dry-run=server")
        )
      ).toBe(true);
      expect(
        ocpAuthAction.readOnlyCommands?.map((command) => command.id)
      ).toEqual(
        expect.arrayContaining(["verify-post-approval-live-reader-smoke"])
      );
      expect(ocpAuthAction.approvalGatedCommands?.map((command) => command.id)).toEqual(
        expect.arrayContaining([
          "apply-live-evidence-reader-rbac",
          "create-short-lived-live-reader-token"
        ])
      );
      expect(
        ocpAuthAction.approvalGatedCommands?.every(
          (command) =>
            command.mutation === true && command.requiresExplicitApproval === true
        )
      ).toBe(true);
    }
    const lightspeedReadinessAction =
      body.installReadiness?.actionQueue?.items?.find(
        (item) =>
          item.source === "checkpoint:lightspeedReadiness" ||
          item.id?.includes("lightspeed-readiness")
      );
    if (
      body.installReadiness?.actionQueue?.sourceArtifacts?.some(
        (source) =>
          source.id === "lightspeedReadiness" && source.status === "FAIL"
      )
    ) {
      expect(["cluster-admin", "cluster-sre", "network-sre"]).toContain(
        lightspeedReadinessAction?.owner
      );
      expect(lightspeedReadinessAction?.nextCommand).toMatch(
        /evidence:ocp-auth-rbac-plan|verify:lightspeed/
      );
      expect(lightspeedReadinessAction?.evidenceNeeded).toContain("OLSConfig");
      expect(lightspeedReadinessAction?.readOnlyCommands?.map((command) => command.id)).toEqual(
        expect.arrayContaining(["lightspeed-readiness-live"])
      );
      if (lightspeedReadinessAction?.id === "cluster-admin-fix-lightspeed-readiness-auth-rbac") {
        expect(lightspeedReadinessAction.diagnostics?.map((item) => item.id)).toEqual(
          expect.arrayContaining([
            "post-approval-rbac",
            "post-approval-lightspeed",
            "post-approval-sources"
          ])
        );
        expect(
          lightspeedReadinessAction.diagnostics
            ?.find((item) => item.id === "post-approval-rbac")
            ?.value
        ).toMatch(/allowed=\d+\/\d+/);
        expect(lightspeedReadinessAction.approvalGatedCommands?.map((command) => command.id)).toEqual(
          expect.arrayContaining([
            "apply-live-evidence-reader-rbac",
            "create-short-lived-live-reader-token"
          ])
        );
        expect(lightspeedReadinessAction.blockedBy?.join(" ")).toMatch(
          /auth-or-rbac|OLSConfig|credentials/
        );
      } else {
        expect(lightspeedReadinessAction?.blockedBy?.join(" ")).toMatch(
          /tls|tcp|dns|network|OLSConfig/i
        );
        expect(lightspeedReadinessAction?.diagnostics?.map((item) => item.id)).toEqual(
          expect.arrayContaining([
            "ocp-network-target",
            "ocp-network-probes",
            "ocp-network-boundary"
          ])
        );
      }
    }
    const ocpNetworkHandoffAction =
      body.installReadiness?.actionQueue?.items?.find(
        (item) => item.id === "cluster-admin-review-ocp-auth-rbac-handoff"
      );
    if (ocpNetworkHandoffAction) {
      expect(
        ocpNetworkHandoffAction.readOnlyCommands?.map((command) => command.id)
      ).toEqual(expect.arrayContaining(["ocp-connectivity"]));
      expect(
        ocpNetworkHandoffAction.readOnlyCommands?.every(
          (command) => command.mutation === false
        )
      ).toBe(true);
    }
    const certificationToolingAction =
      body.installReadiness?.actionQueue?.items?.find(
        (item) => item.id === "release-manager-complete-certification-tooling"
      );
    if (certificationToolingAction) {
      expect(certificationToolingAction.missingRequiredTools).toEqual(
        expect.arrayContaining(["opm", "operator-sdk"])
      );
      expect(
        certificationToolingAction.handoffNextCommands?.join(" ")
      ).toContain("verify:certification");
      expect(
        certificationToolingAction.readOnlyCommands?.map((command) => command.id)
      ).toEqual(
        expect.arrayContaining(["refresh-certification-evidence"])
      );
      expect(
        certificationToolingAction.approvalGatedCommands?.map(
          (command) => command.id
        )
      ).toEqual(expect.arrayContaining(["partner-connect-submit"]));
      expect(
        certificationToolingAction.setupCommands?.every(
          (command) => command.mutation === false
        )
      ).toBe(true);
    }
    const catalogRegistryAction =
      body.installReadiness?.actionQueue?.items?.find(
        (item) => item.id === "registry-admin-fix-catalog-base-image-auth"
      );
    if (
      body.installReadiness?.bundle?.missingEvidence?.some((entry) =>
        entry.includes("registry.redhat.io base image manifest")
      )
    ) {
      expect(catalogRegistryAction?.owner).toBe("registry-admin");
      expect(catalogRegistryAction?.evidenceNeeded).toContain(
        "registryBaseReadable=false"
      );
      expect(catalogRegistryAction?.nextCommand).toContain(
        "verify:catalog-toolchain"
      );
      expect(catalogRegistryAction?.readOnlyCommands?.map((command) => command.id)).toEqual(
        expect.arrayContaining([
          "registry-base-inspect",
          "refresh-catalog-toolchain-evidence",
          "catalog-local-build"
        ])
      );
      expect(catalogRegistryAction?.setupCommands?.map((command) => command.id)).toEqual(
        expect.arrayContaining(["registry-login"])
      );
    }
    const runtimeLiveAction =
      body.installReadiness?.actionQueue?.items?.find(
        (item) => item.id === "runtime-platform-run-live-vllm-qdrant-probes"
      );
    if (
      body.installReadiness?.refresh?.missingEvidence?.some((entry) =>
        entry.includes("runtimeReadiness:")
      )
    ) {
      expect(runtimeLiveAction?.owner).toBe("runtime-platform");
      expect(runtimeLiveAction?.nextCommand).toContain("verify:runtime");
      expect(runtimeLiveAction?.readOnlyCommands?.map((command) => command.id)).toEqual(
        expect.arrayContaining(["runtime-readiness-live"])
      );
      expect(runtimeLiveAction?.diagnostics?.map((item) => item.id)).toEqual(
        expect.arrayContaining([
          "runtime-readiness-status",
          "runtime-readiness-qdrant",
          "runtime-readiness-vllm"
        ])
      );
      expect(
        runtimeLiveAction?.diagnostics
          ?.find((item) => item.id === "runtime-readiness-status")
          ?.value
      ).toContain("liveProbe=false");
    }
    const runtimeRagAction =
      body.installReadiness?.actionQueue?.items?.find(
        (item) => item.id === "data-ml-engineer-prove-runtime-rag-live-quality"
      );
    if (
      body.installReadiness?.refresh?.missingEvidence?.some((entry) =>
        entry.includes("runtimeRag:")
      )
    ) {
      expect(runtimeRagAction?.owner).toBe("data-ml-engineer");
      expect(runtimeRagAction?.readOnlyCommands?.map((command) => command.id)).toEqual(
        expect.arrayContaining(["runtime-rag-contract", "runtime-rag-fixture"])
      );
      expect(runtimeRagAction?.evidenceNeeded).toContain("vLLM /v1/embeddings");
      expect(runtimeRagAction?.diagnostics?.map((item) => item.id)).toEqual(
        expect.arrayContaining([
          "runtime-rag-contract",
          "runtime-rag-fixture",
          "runtime-rag-live-gap",
          "runtime-rag-boundary"
        ])
      );
      expect(
        runtimeRagAction?.diagnostics
          ?.find((item) => item.id === "runtime-rag-fixture")
          ?.value
      ).toContain("status=PASS");
      expect(
        runtimeRagAction?.diagnostics
          ?.find((item) => item.id === "runtime-rag-contract")
          ?.value
      ).toContain("status=NEEDS_LIVE_EVIDENCE");
    }
    const ragOwnerQueueAction =
      body.installReadiness?.actionQueue?.items?.find(
        (item) => item.id === "rag-owner-enable-production-approval-queue"
      );
    if (
      body.installReadiness?.refresh?.missingEvidence?.some((entry) =>
        entry.includes("ragApprovalQueue:")
      )
    ) {
      expect(ragOwnerQueueAction?.owner).toBe("rag-owner");
      expect(ragOwnerQueueAction?.readOnlyCommands?.map((command) => command.id)).toEqual(
        expect.arrayContaining(["rag-approval-queue-contract"])
      );
      expect(ragOwnerQueueAction?.blockedBy?.join(" ")).toMatch(
        /production database-backed queue|production ingestion worker|vector write audit/
      );
      expect(ragOwnerQueueAction?.blockedBy?.some((entry) =>
        /releaseActionQueue:\s*releaseActionQueue:/i.test(entry)
      )).toBe(false);
    }
    const monitoringProxyAction =
      body.installReadiness?.actionQueue?.items?.find(
        (item) => item.id === "cluster-sre-enable-monitoring-proxy-evidence"
      );
    if (
      body.aiops?.incidentPipeline?.alertmanagerIntake?.missingEvidence?.some(
        (entry) =>
          entry.includes("Monitoring service proxy") ||
          entry.includes("OCP_ENABLE_MONITORING_PROXY")
      )
    ) {
      expect(monitoringProxyAction?.owner).toBe("cluster-sre");
      expect(monitoringProxyAction?.nextCommand).toContain("verify:aiops");
      expect(monitoringProxyAction?.evidenceNeeded).toContain(
        "OCP_ENABLE_MONITORING_PROXY=true"
      );
      expect(monitoringProxyAction?.readOnlyCommands?.map((command) => command.id)).toEqual(
        expect.arrayContaining(["aiops-monitoring-proxy-smoke"])
      );
      expect(monitoringProxyAction?.blockedBy?.join(" ")).toMatch(
        /metrics\/|Monitoring service proxy/
      );
    }
    expect(
      body.installReadiness?.actionQueue?.commandCounts?.readOnly ?? 0
    ).toBeGreaterThan(0);
    expect(
      body.installReadiness?.actionQueue?.commandCounts?.approvalGated ?? 0
    ).toBeGreaterThan(0);
    expect(body.installReadiness?.evidence?.join(" ")).toMatch(
      /release action queue/i
    );
    expect(["ready", "needs-evidence", "blocked"]).toContain(
      body.installReadiness?.ocpAuthRbacPlan
    );
    expect(body.installReadiness?.authRbacPlan).toMatchObject({
      actionMode: "approvalPlanOnly",
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      mutationAllowedByThisVerifier: false
    });
    expect(body.installReadiness?.authRbacPlan?.rbac).toMatchObject({
      namespace: "cywell-opslens",
      serviceAccount: "cywell-opslens/cywell-opslens-live-evidence-reader",
      clusterRole: "cywell-opslens-live-evidence-reader",
      readOnlyOnly: true,
      secretsIncluded: false
    });
    expect(
      body.installReadiness?.authRbacPlan?.approvalGatedCommands
        ?.find((command) => command.id === "apply-live-evidence-reader-rbac")
        ?.command
    ).toContain("opslens-live-evidence-reader.yaml");
    expect(
      body.installReadiness?.authRbacPlan?.readOnlyCommands?.every(
        (command) => command.mutation === false
      )
    ).toBe(true);
    expect(
      body.installReadiness?.authRbacPlan?.readOnlyCommands?.map(
        (command) => command.id
      )
    ).toEqual(
      expect.arrayContaining(["verify-post-approval-live-reader-smoke"])
    );
    expect(
      body.installReadiness?.authRbacPlan?.approvalGatedCommands?.every(
        (command) =>
          command.mutation === true &&
          command.requiresExplicitApproval === true
      )
    ).toBe(true);
    expect(body.installReadiness?.evidence?.join(" ")).toMatch(
      /auth\/RBAC plan/i
    );
    expect(["ready", "needs-evidence", "blocked"]).toContain(
      body.installReadiness?.liveHandoff
    );
    expect(body.installReadiness?.handoff).toMatchObject({
      actionMode: "handoffOnly",
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      mutationAllowedByThisVerifier: false
    });
    expect(
      body.installReadiness?.handoff?.readOnlyCommands?.length ?? 0
    ).toBeGreaterThan(0);
    expect(
      body.installReadiness?.handoff?.readOnlyCommands?.every(
        (command) => command.mutation === false
      )
    ).toBe(true);
    expect(body.installReadiness?.handoff?.postApprovalSmoke).toMatchObject({
      command: "npm run verify:ocp:live-reader-smoke -- --timeout-ms 30000"
    });
    expect(
      body.installReadiness?.handoff?.postApprovalSmoke?.requiredRbacReviewCount
    ).toBeGreaterThanOrEqual(0);
    expect(
      body.installReadiness?.handoff?.postApprovalSmoke
        ?.requiredRbacAllowedCount
    ).toBeGreaterThanOrEqual(0);
    expect(
      body.installReadiness?.handoff?.postApprovalSmoke
        ?.requiredRbacUnknownCount
    ).toBeGreaterThanOrEqual(0);
    expect(
      body.installReadiness?.handoff?.postApprovalSmoke?.sourceArtifacts?.map(
        (source) => source.id
      )
    ).toEqual(expect.arrayContaining(["ocpConnectivity"]));
    expect(
      body.installReadiness?.handoff?.postApprovalSmoke?.verifierRuns?.map(
        (run) => run.id
      )
    ).toEqual(
      expect.arrayContaining(["verify OCP connectivity with approved reader"])
    );
    expect(
      body.installReadiness?.handoff?.readOnlyCommands?.map(
        (command) => command.id
      )
    ).toEqual(expect.arrayContaining(["ocp-live-reader-smoke"]));
    expect(
      body.installReadiness?.handoff?.forbiddenCommands?.join(" ")
    ).toContain("oc apply");
    expect(body.installReadiness?.evidence?.join(" ")).toMatch(
      /live evidence handoff/i
    );
    expect(["ready", "needs-evidence", "blocked"]).toContain(
      body.installReadiness?.evidenceCheckpoint
    );
    expect(body.installReadiness?.checkpoint).toMatchObject({
      worktreeDirty: false
    });
    expect(
      body.installReadiness?.checkpoint?.lanes?.length
    ).toBeGreaterThan(0);
    expect(
      body.installReadiness?.checkpoint?.lanes?.map((lane) => lane.id)
    ).toEqual(expect.arrayContaining(["envContract", "consolePluginAssets"]));
    expect(body.installReadiness?.evidence?.join(" ")).toMatch(
      /evidence checkpoint/i
    );
    expect(body.installReadiness?.certification).toBe("draft");
    expect(body.policy).toMatchObject({
      mutationAllowed: false,
      rawDocumentReturned: false,
      uploadApplyAllowed: false
    });

    const validation = await request.post("/api/opslens/admin/rag/validate", {
      data: {
        tenantId: "cywell-payments",
        fileName: "payments-timeout-triage.md",
        markdown: [
          "---",
          "id: customer-runbook:payments-timeout-triage",
          "label: Payments Timeout Triage",
          "sourceType: customer-runbook",
          "trustLevel: draft",
          "---",
          "",
          "# Payments Timeout Triage",
          "",
          "결제 승인 지연이 감지되면 최근 10분의 API latency, gateway error rate, egress policy change, readiness probe 상태를 함께 확인한다.",
          "",
          "1. Secret 원문은 조회하지 않고 key reference와 mount 상태만 확인한다.",
          "2. 자동 rollback은 하지 않고 GitOps pull request로만 변경한다. token=demo-secret"
        ].join("\n")
      }
    });
    expect(validation.ok()).toBe(true);
    const validationBody = (await validation.json()) as {
      actionMode?: string;
      accepted?: boolean;
      redactionCount?: number;
      chunks?: Array<{ snippet?: string; redacted?: boolean }>;
      issues?: Array<{ severity?: string; code?: string }>;
      policy?: {
        validateOnly?: boolean;
        rawDocumentReturned?: boolean;
        uploadApplyAllowed?: boolean;
      };
      evidence?: string[];
    };
    expect(validationBody.actionMode).toBe("validateOnly");
    expect(validationBody.accepted).toBe(true);
    expect(validationBody.redactionCount).toBeGreaterThan(0);
    expect(validationBody.chunks?.length).toBeGreaterThan(0);
    expect(validationBody.chunks?.every((chunk) => chunk.redacted === true)).toBe(
      true
    );
    expect(JSON.stringify(validationBody)).not.toContain("token=demo-secret");
    expect(validationBody.policy).toMatchObject({
      validateOnly: true,
      rawDocumentReturned: false,
      uploadApplyAllowed: false
    });
    expect(validationBody.evidence?.join(" ")).toContain("local vector index");

    const evidenceExport = await request.post(
      "/api/opslens/admin/rag/evidence-export",
      {
        data: {
          tenantId: "cywell-payments",
          fileName: "payments-timeout-triage.md",
          markdown: [
            "---",
            "id: customer-runbook:payments-timeout-triage",
            "label: Payments Timeout Triage",
            "sourceType: customer-runbook",
            "trustLevel: draft",
            "---",
            "",
            "# Payments Timeout Triage",
            "",
            "결제 승인 지연이 감지되면 최근 10분의 API latency, gateway error rate, egress policy change, readiness probe 상태를 함께 확인한다.",
            "",
            "1. Secret 원문은 조회하지 않고 key reference와 mount 상태만 확인한다.",
            "2. 자동 rollback은 하지 않고 GitOps pull request로만 변경한다. token=demo-secret"
          ].join("\n"),
          requestedBy: "playwright",
          reason: "export token=demo-secret before approval"
        }
      }
    );
    expect(evidenceExport.ok()).toBe(true);
    const evidenceExportBody = (await evidenceExport.json()) as {
      artifactType?: string;
      exportId?: string;
      actionMode?: string;
      validation?: { accepted?: boolean };
      content?: {
        markdownReturned?: boolean;
        documentBodyReturned?: boolean;
        chunksRedacted?: boolean;
      };
      approvalQueue?: { mode?: string; enqueueAllowed?: boolean };
      audit?: { validationHash?: string; reason?: string };
      policy?: {
        rawDocumentReturned?: boolean;
        uploadApplyAllowed?: boolean;
        evidenceExportAllowed?: boolean;
        approvalQueueMutationAllowed?: boolean;
      };
    };
    expect(evidenceExportBody.artifactType).toBe(
      "opslens.rag.validation-evidence.v0.1"
    );
    expect(evidenceExportBody.exportId).toContain("rag-validation-");
    expect(evidenceExportBody.actionMode).toBe("validateOnly");
    expect(evidenceExportBody.validation?.accepted).toBe(true);
    expect(evidenceExportBody.content).toMatchObject({
      markdownReturned: false,
      documentBodyReturned: false,
      chunksRedacted: true
    });
    expect(evidenceExportBody.approvalQueue).toMatchObject({
      mode: "designOnly",
      enqueueAllowed: false
    });
    expect(evidenceExportBody.policy).toMatchObject({
      rawDocumentReturned: false,
      uploadApplyAllowed: false,
      evidenceExportAllowed: true,
      approvalQueueMutationAllowed: false
    });
    expect(evidenceExportBody.audit?.validationHash).toHaveLength(64);
    expect(JSON.stringify(evidenceExportBody)).not.toContain("token=demo-secret");

    const queueSubmit = await request.post(
      "/api/opslens/admin/rag/approval-queue/submit",
      {
        data: {
          tenantId: "cywell-payments",
          fileName: "payments-timeout-triage.md",
          markdown: [
            "---",
            "id: customer-runbook:payments-timeout-triage",
            "label: Payments Timeout Triage",
            "sourceType: customer-runbook",
            "trustLevel: draft",
            "---",
            "",
            "# Payments Timeout Triage",
            "",
            "결제 승인 지연이 감지되면 최근 10분의 API latency, gateway error rate, egress policy change, readiness probe 상태를 함께 확인한다.",
            "",
            "1. Secret 원문은 조회하지 않고 key reference와 mount 상태만 확인한다.",
            "2. 자동 rollback은 하지 않고 GitOps pull request로만 변경한다. token=demo-secret"
          ].join("\n"),
          requestedBy: "playwright",
          reason: "queue token=demo-secret for human approval",
          ticketRef: "OPS-PLAYWRIGHT"
        }
      }
    );
    expect(queueSubmit.ok()).toBe(true);
    const queueSubmitBody = (await queueSubmit.json()) as {
      artifactType?: string;
      queueItemId?: string;
      actionMode?: string;
      state?: string;
      content?: {
        rawMarkdownPersisted?: boolean;
        vectorWriteAttempted?: boolean;
      };
      approvalQueue?: {
        mode?: string;
        enqueueAllowed?: boolean;
        persisted?: boolean;
        blockers?: string[];
      };
      policy?: {
        queuePersistenceAllowed?: boolean;
        vectorWriteAllowed?: boolean;
        clusterMutationAllowed?: boolean;
      };
    };
    expect(queueSubmitBody.artifactType).toBe(
      "opslens.rag.approval-queue-submission.v0.2"
    );
    expect(queueSubmitBody.queueItemId).toContain("rag-queue-");
    expect(queueSubmitBody.actionMode).toBe("approvalQueueOnly");
    expect(queueSubmitBody.state).toBe("design-only");
    expect(queueSubmitBody.content).toMatchObject({
      rawMarkdownPersisted: false,
      vectorWriteAttempted: false
    });
    expect(queueSubmitBody.approvalQueue).toMatchObject({
      mode: "designOnly",
      enqueueAllowed: false,
      persisted: false
    });
    expect(queueSubmitBody.policy).toMatchObject({
      queuePersistenceAllowed: false,
      vectorWriteAllowed: false,
      clusterMutationAllowed: false
    });
    expect(JSON.stringify(queueSubmitBody)).not.toContain("token=demo-secret");

    const queueInventory = await request.get(
      "/api/opslens/admin/rag/approval-queue"
    );
    expect(queueInventory.ok()).toBe(true);
    const queueInventoryBody = (await queueInventory.json()) as {
      artifactType?: string;
      actionMode?: string;
      mode?: string;
      itemCount?: number;
      items?: unknown[];
      policy?: {
        readOnly?: boolean;
        chunksReturned?: boolean;
        vectorWriteAllowed?: boolean;
        clusterMutationAllowed?: boolean;
        approvalMutationAllowed?: boolean;
      };
    };
    expect(queueInventoryBody.artifactType).toBe(
      "opslens.rag.approval-queue-inventory.v0.2"
    );
    expect(queueInventoryBody.actionMode).toBe("approvalQueueReadOnly");
    expect(queueInventoryBody.mode).toBe("designOnly");
    expect(queueInventoryBody.itemCount).toBe(0);
    expect(queueInventoryBody.items).toHaveLength(0);
    expect(queueInventoryBody.policy).toMatchObject({
      readOnly: true,
      chunksReturned: false,
      vectorWriteAllowed: false,
      clusterMutationAllowed: false,
      approvalMutationAllowed: false
    });
    expect(JSON.stringify(queueInventoryBody)).not.toContain("token=demo-secret");

    const dashboard = page.getByTestId("opslens-admin-dashboard");
    await dashboard.scrollIntoViewIfNeeded();
    await expect(dashboard).toBeVisible();
    await expect(page.getByTestId("opslens-rag-health")).toContainText(
      "Payments API"
    );
    await expect(
      page.getByTestId("opslens-rag-production-readiness")
    ).toContainText("productionReadinessOnly");
    await expect(
      page.getByTestId("opslens-rag-production-readiness")
    ).toContainText("approval-required");
    await expect(
      page.getByTestId("opslens-rag-production-readiness")
    ).toContainText("contractReady=true");
    await expect(
      page.getByTestId("opslens-rag-production-readiness")
    ).toContainText("queueLive=false");
    await expect(
      page.getByTestId("opslens-rag-production-readiness")
    ).toContainText("vectorWrite=false");
    await expect(
      page.getByTestId("opslens-rag-production-readiness")
    ).toContainText("ingestionJobCreated=false");
    await expect(
      page.getByTestId("opslens-rag-production-first-actions")
    ).toContainText("rag-owner");
    await expect(
      page.getByTestId("opslens-rag-production-first-actions")
    ).toContainText("verify:rag:production-readiness");
    await expect(
      page.getByTestId("opslens-rag-production-first-actions")
    ).toContainText("approval-gated-apply-approved-rag-production-stack");
    await expect(
      page.getByTestId("opslens-rag-production-first-actions")
    ).toContainText("approval=true");
    await expect(page.getByTestId("opslens-token-usage")).toContainText(
      "lightspeed-mcp"
    );
    await expect(page.getByTestId("opslens-mcp-tool-surface")).toContainText(
      "Lightspeed MCP Tools"
    );
    await expect(page.getByTestId("opslens-mcp-tool-surface")).toContainText(
      "apply_remediation excluded"
    );
    await expect(
      page.getByTestId("opslens-mcp-tool-generate_playbook")
    ).toContainText("readOnly");
    await expect(
      page.getByTestId("opslens-mcp-tool-open_console_deep_link")
    ).toContainText("console-navigation");
    await expect(page.getByTestId("opslens-mcp-tool-run_preflight")).toContainText(
      "install-readiness"
    );
    await expect(
      page.getByTestId("opslens-mcp-tool-propose_remediation")
    ).toContainText("planOnly");
    await expect(
      page.getByTestId("opslens-lightspeed-routing-score")
    ).toContainText("routing=");
    await expect(
      page.getByTestId("opslens-lightspeed-trojan-horse")
    ).toContainText("tool=");
    await expect(
      page.getByTestId("opslens-lightspeed-trojan-horse")
    ).toContainText("mutationAllowed=false");
    await expect(
      page.getByTestId("opslens-lightspeed-integration-handoff")
    ).toContainText("handoffOnly");
    await expect(
      page.getByTestId("opslens-lightspeed-integration-handoff")
    ).toContainText("templateReady=true");
    await expect(
      page.getByTestId("opslens-lightspeed-integration-handoff")
    ).toContainText("clusterMutationAttempted=false");
    await expect(
      page.getByTestId("opslens-lightspeed-integration-handoff-commands")
    ).toContainText("readOnly=");
    await expect(
      page.getByTestId("opslens-lightspeed-integration-handoff-commands")
    ).toContainText("gated=");
    await expect(page.getByTestId("opslens-gpu-runtime")).toContainText(
      "Gemma 4"
    );
    await expect(page.getByTestId("opslens-runtime-readiness")).toContainText(
      "readOnly"
    );
    await expect(page.getByTestId("opslens-runtime-readiness")).toContainText(
      "qdrant="
    );
    await expect(page.getByTestId("opslens-runtime-readiness")).toContainText(
      "vllm="
    );
    await expect(page.getByTestId("opslens-runtime-readiness")).toContainText(
      "liveProbe=false"
    );
    await expect(page.getByTestId("opslens-runtime-live-handoff")).toContainText(
      "handoffOnly"
    );
    await expect(page.getByTestId("opslens-runtime-live-handoff")).toContainText(
      "runtimeOwner=runtime-platform"
    );
    await expect(page.getByTestId("opslens-runtime-live-handoff")).toContainText(
      "dataOwner=data-ml-engineer"
    );
    await expect(page.getByTestId("opslens-runtime-live-handoff")).toContainText(
      "liveProbe=false"
    );
    await expect(
      page.getByTestId("opslens-runtime-live-handoff-actions")
    ).toContainText("runtime-platform-run-live-vllm-qdrant-probes");
    await expect(
      page.getByTestId("opslens-runtime-live-handoff-actions")
    ).toContainText("runtime-readiness-live");
    await expect(
      page.getByTestId("opslens-runtime-live-handoff-actions")
    ).toContainText("data-ml-engineer-prove-runtime-rag-live-quality");
    await expect(
      page.getByTestId("opslens-runtime-live-handoff-actions")
    ).toContainText("runtime-rag-fixture");
    await expect(
      page.getByTestId("opslens-runtime-live-handoff-boundary")
    ).toContainText("mutationAllowedByThisVerifier=false");
    await expect(
      page.getByTestId("opslens-runtime-live-handoff-boundary")
    ).toContainText("clusterMutationAttempted=false");
    await expect(
      page.getByTestId("opslens-runtime-live-handoff-boundary")
    ).toContainText("vectorWriteAttempted=false");
    await expect(page.getByTestId("opslens-incident-metrics")).toContainText(
      "pod-memory"
    );
    await expect(page.getByTestId("opslens-remediation-proposal")).toContainText(
      "PodCrashLooping"
    );
    await expect(page.getByTestId("opslens-remediation-proposal")).toContainText(
      "memory: 4Gi"
    );
    await expect(page.getByTestId("opslens-remediation-proposal")).toContainText(
      "mutationAllowed=false"
    );
    await expect(page.getByTestId("opslens-remediation-proposal")).toContainText(
      "reviewGate=true"
    );
    await expect(
      page.getByTestId("opslens-remediation-trigger-evidence")
    ).toContainText("logs=true:10m");
    await expect(
      page.getByTestId("opslens-remediation-trigger-evidence")
    ).toContainText("pod-memory:ready");
    await expect(page.getByTestId("opslens-aiops-pipeline")).toContainText(
      "AI Ops Pipeline"
    );
    await expect(
      page.getByTestId("opslens-aiops-pipeline-evidence")
    ).toContainText("readOnlyEvidenceOnly");
    await expect(
      page.getByTestId("opslens-aiops-pipeline-evidence")
    ).toContainText("clusterMutationAttempted=false");
    await expect(
      page.getByTestId("opslens-aiops-pipeline-evidence")
    ).toContainText("vectorWriteAttempted=false");
    await expect(
      page.getByTestId("opslens-aiops-pipeline-evidence")
    ).toContainText("verify:aiops");
    await expect(
      page.getByTestId("opslens-aiops-pipeline-evidence")
    ).toContainText("triggerEvidence=");
    await expect(
      page.getByTestId("opslens-aiops-monitoring-proxy-handoff")
    ).toContainText("Monitoring Proxy");
    await expect(
      page.getByTestId("opslens-aiops-monitoring-proxy-handoff")
    ).toContainText("handoffOnly");
    await expect(
      page.getByTestId("opslens-aiops-monitoring-proxy-handoff")
    ).toContainText("owner=cluster-sre");
    await expect(
      page.getByTestId("opslens-aiops-monitoring-proxy-handoff")
    ).toContainText("approvalRequired=");
    await expect(
      page.getByTestId("opslens-aiops-monitoring-proxy-handoff")
    ).toContainText("mutationAllowedByThisVerifier=false");
    await expect(
      page.getByTestId("opslens-aiops-monitoring-proxy-commands")
    ).toContainText("npm run verify:aiops");
    await expect(
      page.getByTestId("opslens-aiops-monitoring-proxy-commands")
    ).toContainText("aiops-monitoring-proxy-smoke");
    await expect(
      page.getByTestId("opslens-aiops-monitoring-proxy-commands")
    ).toContainText("mutation=false");
    await expect(page.getByTestId("opslens-alertmanager-intake")).toContainText(
      "Alertmanager"
    );
    await expect(page.getByTestId("opslens-alertmanager-intake")).toContainText(
      "opslens.alertmanager-incident-intake.v0.1"
    );
    await expect(page.getByTestId("opslens-alertmanager-intake")).toContainText(
      "accepted="
    );
    await expect(page.getByTestId("opslens-alertmanager-intake")).toContainText(
      "rawAlertReturned=false"
    );
    await expect(page.getByTestId("opslens-alertmanager-intake")).toContainText(
      "clusterMutationAttempted=false"
    );
    await expect(page.getByTestId("opslens-alertmanager-intake")).toContainText(
      "mutationAllowed=false"
    );
    await expect(page.getByTestId("opslens-aiops-pipeline")).toContainText(
      "pod-memory"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "Certification"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "AI Ops Pipeline"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "Image Builds"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "Owned Provenance"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "External Runtime"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "Release Publish"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "Live Handoff"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "Network Handoff"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "Operator Dry-run"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "Operator Boundary"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "Operator Package"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "OCP Connectivity"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "Extension Point"
    );
    await expect(
      page.getByTestId("opslens-lightspeed-extension-point")
    ).toContainText("readOnlyEvidenceOnly");
    await expect(
      page.getByTestId("opslens-lightspeed-extension-point")
    ).toContainText("OLSConfig.spec.mcpServers");
    await expect(
      page.getByTestId("opslens-lightspeed-extension-point")
    ).toContainText("endpoint=/mcp");
    await expect(
      page.getByTestId("opslens-lightspeed-extension-point")
    ).toContainText("webhook=false");
    await expect(
      page.getByTestId("opslens-lightspeed-extension-point")
    ).toContainText("legacyConfigMap=false");
    await expect(
      page.getByTestId("opslens-lightspeed-extension-olsconfig")
    ).toContainText("OLSConfig");
    await expect(
      page.getByTestId("opslens-lightspeed-extension-olsconfig")
    ).toContainText("MCPServer");
    await expect(
      page.getByTestId("opslens-lightspeed-extension-olsconfig")
    ).toContainText("userBearer=true");
    await expect(
      page.getByTestId("opslens-lightspeed-extension-olsconfig")
    ).toContainText("secretHeader=true");
    await expect(
      page.getByTestId("opslens-lightspeed-extension-routes")
    ).toContainText("POST /mcp:lightspeed-facing");
    await expect(
      page.getByTestId("opslens-lightspeed-extension-routes")
    ).toContainText("POST /api/opslens/mcp:local-smoke-demo");
    await expect(
      page.getByTestId("opslens-lightspeed-extension-boundary")
    ).toContainText("mutationAllowedByThisVerifier=false");
    await expect(page.getByTestId("opslens-operator-package")).toContainText(
      "operatorPackageStaticOnly"
    );
    await expect(page.getByTestId("opslens-operator-package")).toContainText(
      "clusterMutationAttempted=false"
    );
    await expect(page.getByTestId("opslens-operator-package")).toContainText(
      "registryMutationAttempted=false"
    );
    await expect(
      page.getByTestId("opslens-operator-package-boundary")
    ).toContainText("staticOlsConfig=false");
    await expect(
      page.getByTestId("opslens-operator-package-boundary")
    ).toContainText("staticRegistration=false");
    await expect(
      page.getByTestId("opslens-operator-package-boundary")
    ).toContainText("approvalGatedTemplate=true");
    await expect(
      page.getByTestId("opslens-operator-package-boundary")
    ).toContainText("mode=PatchOLSConfig");
    await expect(
      page.getByTestId("opslens-operator-package-boundary")
    ).toContainText("approvalGatedOnly=true");
    await expect(
      page.getByTestId("opslens-operator-package-olsconfig")
    ).toContainText("OLSConfig");
    await expect(
      page.getByTestId("opslens-operator-package-olsconfig")
    ).toContainText("name=cluster");
    await expect(
      page.getByTestId("opslens-operator-package-olsconfig")
    ).toContainText("namespace=openshift-lightspeed");
    await expect(
      page.getByTestId("opslens-operator-package-olsconfig")
    ).toContainText("server=cywell-opslens");
    await expect(
      page.getByTestId("opslens-operator-package-olsconfig")
    ).toContainText("MCPServer");
    await expect(
      page.getByTestId("opslens-operator-package-olsconfig")
    ).toContainText("headers=kubernetes, secret");
    await expect(
      page.getByTestId("opslens-operator-package-forbidden")
    ).toContainText("legacy Lightspeed ConfigMap mutation");
    await expect(
      page.getByTestId("opslens-operator-runtime-boundary")
    ).toContainText("operatorRuntimeParityOnly");
    await expect(
      page.getByTestId("opslens-operator-runtime-boundary")
    ).toContainText("mode=PatchOLSConfig");
    await expect(
      page.getByTestId("opslens-operator-runtime-boundary")
    ).toContainText("willPatch=true");
    await expect(
      page.getByTestId("opslens-operator-runtime-boundary-guards")
    ).toContainText("ValidateOnlyBeforeRead=true");
    await expect(
      page.getByTestId("opslens-operator-runtime-boundary-guards")
    ).toContainText("endpointBeforeRead=true");
    await expect(
      page.getByTestId("opslens-operator-runtime-boundary-guards")
    ).toContainText("patchCallCount=1");
    await expect(
      page.getByTestId("opslens-operator-runtime-boundary-guards")
    ).toContainText("legacyConfigMapReferences=0");
    await expect(
      page.getByTestId("opslens-operator-runtime-boundary")
    ).toContainText("clusterMutationAttempted=false");
    await expect(
      page.getByTestId("opslens-operator-runtime-boundary")
    ).toContainText("mutationAllowedByThisVerifier=false");
    await expect(page.getByTestId("opslens-ocp-connectivity")).toContainText(
      /classification=/
    );
    await expect(page.getByTestId("opslens-ocp-connectivity")).toContainText(
      "clusterMutationAttempted=false"
    );
    await expect(page.getByTestId("opslens-ocp-connectivity")).toContainText(
      /dns=|tcp=/
    );
    await expect(page.getByTestId("opslens-ocp-connectivity")).toContainText(
      "<redacted-ocp-api>"
    );
    await expect(
      page.getByTestId("opslens-ocp-connectivity-rbac")
    ).toContainText("can-i-list-pods");
    await expect(
      page.getByTestId("opslens-ocp-connectivity-rbac")
    ).toContainText("can-i-get-olsconfigs");
    await expect(
      page.getByTestId("opslens-ocp-connectivity-rbac")
    ).toContainText("required=true");
    await expect(
      page.getByTestId("opslens-ocp-connectivity-actions")
    ).toContainText(/next=/);
    await expect(page.getByTestId("opslens-live-handoff")).toContainText(
      "handoffOnly"
    );
    await expect(page.getByTestId("opslens-live-handoff")).toContainText(
      "clusterMutationAttempted=false"
    );
    await expect(page.getByTestId("opslens-live-handoff")).toContainText(
      "registryMutationAttempted=false"
    );
    await expect(page.getByTestId("opslens-live-handoff")).toContainText(
      "smoke="
    );
    await expect(page.getByTestId("opslens-live-handoff")).toContainText(
      "ocp-live-reader-smoke"
    );
    await expect(
      page.getByTestId("opslens-live-handoff-post-approval-smoke")
    ).toContainText("rbac=");
    await expect(
      page.getByTestId("opslens-live-handoff-post-approval-smoke")
    ).toContainText("unknown=");
    await expect(
      page.getByTestId("opslens-live-handoff-post-approval-smoke")
    ).toContainText("lightspeedAuthReady=");
    await expect(
      page.getByTestId("opslens-live-handoff-post-approval-smoke")
    ).toContainText("ocpConnectivity");
    await expect(page.getByTestId("opslens-ocp-network-handoff")).toContainText(
      "handoffOnly"
    );
    await expect(page.getByTestId("opslens-ocp-network-handoff")).toContainText(
      /classification=/
    );
    await expect(page.getByTestId("opslens-ocp-network-handoff")).toContainText(
      "clusterMutationAttempted=false"
    );
    await expect(page.getByTestId("opslens-ocp-network-handoff")).toContainText(
      "registryMutationAttempted=false"
    );
    await expect(page.getByTestId("opslens-ocp-network-handoff")).toContainText(
      "<redacted-ocp-api>"
    );
    await expect(
      page.getByTestId("opslens-ocp-network-handoff-commands")
    ).toContainText("mutation=false");
    await expect(
      page.getByTestId("opslens-ocp-network-ticket-packet")
    ).toContainText("network-sre-ocp-api-reachability-ticket");
    await expect(
      page.getByTestId("opslens-ocp-network-ticket-packet")
    ).toContainText("network-sre");
    await expect(
      page.getByTestId("opslens-ocp-network-ticket-packet")
    ).toContainText("mutation=false");
    await expect(
      page.getByTestId("opslens-ocp-network-ticket-packet")
    ).toContainText(/approval=true|approval=false/);
    await expect(
      page.getByTestId("opslens-ocp-network-first-actions")
    ).toContainText(/network-sre-confirm-ocp-api|verify:ocp:connectivity/);
    await expect(
      page.getByTestId("opslens-ocp-network-first-actions")
    ).toContainText("mutation=false");
    await expect(
      page.getByTestId("opslens-ocp-network-first-actions")
    ).toContainText(/approval=true|network first actions missing/);
    await expect(
      page.getByTestId("opslens-ocp-network-source-artifacts")
    ).toContainText("evidenceCheckpoint:");
    await expect(
      page.getByTestId("opslens-ocp-network-source-artifacts")
    ).toContainText("fresh=true");
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "Auth/RBAC Plan"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "Environment"
    );
    await expect(page.getByTestId("opslens-env-contract")).toContainText(
      "Environment Isolation"
    );
    await expect(page.getByTestId("opslens-env-contract")).toContainText(
      "localEnvAuditOnly"
    );
    await expect(page.getByTestId("opslens-env-contract")).toContainText(
      "activeOcpTarget=true"
    );
    await expect(page.getByTestId("opslens-env-contract")).toContainText(
      "activeLightspeedTarget=true"
    );
    await expect(page.getByTestId("opslens-env-contract")).toContainText(
      "Commented Legacy"
    );
    await expect(
      page.getByTestId("opslens-env-contract-boundary")
    ).toContainText("clusterMutationAttempted=false");
    await expect(
      page.getByTestId("opslens-env-contract-boundary")
    ).toContainText("mutationAllowedByThisVerifier=false");
    await expect(
      page.getByTestId("opslens-env-contract-checks")
    ).toContainText("OCP base URL and token=PASS");
    await expect(page.getByTestId("opslens-ocp-auth-rbac-plan")).toContainText(
      "approvalPlanOnly"
    );
    await expect(page.getByTestId("opslens-ocp-auth-rbac-plan")).toContainText(
      "cywell-opslens"
    );
    await expect(page.getByTestId("opslens-ocp-auth-rbac-plan")).toContainText(
      "readOnly=true"
    );
    await expect(page.getByTestId("opslens-ocp-auth-rbac-plan")).toContainText(
      "secrets=false"
    );
    await expect(
      page.getByTestId("opslens-ocp-auth-rbac-plan-commands")
    ).toContainText("mutation=false");
    await expect(
      page.getByTestId("opslens-ocp-auth-rbac-plan-commands")
    ).toContainText("verify-post-approval-live-reader-smoke");
    await expect(
      page.getByTestId("opslens-ocp-auth-rbac-plan-approval")
    ).toContainText("approval=true");
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "Install Plan"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "RAG Ingestion"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "Catalog Toolchain"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "Security Scan"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "Runtime Review"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "Release Refresh"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "Release Bundle"
    );
    await expect(page.getByTestId("opslens-install-approval-plan")).toContainText(
      "approvalPlanOnly"
    );
    await expect(page.getByTestId("opslens-install-approval-plan")).toContainText(
      "clusterMutationAttempted=false"
    );
    await expect(page.getByTestId("opslens-install-approval-plan")).toContainText(
      "cluster-admin"
    );
    await expect(
      page.getByTestId("opslens-lightspeed-registration-plan")
    ).toContainText("previewOnly");
    await expect(
      page.getByTestId("opslens-lightspeed-registration-plan")
    ).toContainText("OLSConfig");
    await expect(
      page.getByTestId("opslens-lightspeed-registration-plan")
    ).toContainText("mode=PatchOLSConfig");
    await expect(
      page.getByTestId("opslens-lightspeed-registration-plan")
    ).toContainText("legacyConfigMapMutationAttempted=false");
    await expect(
      page.getByTestId("opslens-lightspeed-registration-plan")
    ).toContainText("clusterMutationAttempted=false");
    await expect(
      page.getByTestId("opslens-install-first-approval-actions")
    ).toContainText(/verify:|ocp:connectivity|git status/);
    await expect(
      page.getByTestId("opslens-install-first-approval-actions")
    ).toContainText("approval-gated-");
    await expect(
      page.getByTestId("opslens-install-first-approval-actions")
    ).toContainText("approval=true");
    await expect(
      page.getByTestId("opslens-lightspeed-registration-commands")
    ).toContainText("verify:lightspeed:patch-preview");
    await expect(
      page.getByTestId("opslens-rag-ingestion-approval-plan")
    ).toContainText("ingestionPlanOnly");
    await expect(
      page.getByTestId("opslens-rag-ingestion-approval-plan")
    ).toContainText("vectorWriteAttempted=false");
    await expect(
      page.getByTestId("opslens-rag-ingestion-approval-plan")
    ).toContainText("mutationAllowedByThisVerifier=false");
    await expect(page.getByTestId("opslens-catalog-toolchain")).toContainText(
      "toolchainPlanOnly"
    );
    await expect(page.getByTestId("opslens-catalog-toolchain")).toContainText(
      "registryMutationAttempted=false"
    );
    await expect(page.getByTestId("opslens-catalog-toolchain")).toContainText(
      "registryBaseReadable="
    );
    await expect(page.getByTestId("opslens-catalog-toolchain")).toContainText(
      "opm:"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "Certification Evidence"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "Community Submission"
    );
    await expect(page.getByTestId("opslens-certification-readiness")).toContainText(
      "certificationReadinessOnly"
    );
    await expect(page.getByTestId("opslens-certification-readiness")).toContainText(
      "clusterMutationAttempted=false"
    );
    await expect(page.getByTestId("opslens-certification-readiness")).toContainText(
      "mutationAllowedByThisVerifier=false"
    );
    await expect(page.getByTestId("opslens-certification-cli")).toContainText(
      "opm:"
    );
    await expect(page.getByTestId("opslens-certification-cli")).toContainText(
      "operator-sdk:"
    );
    await expect(
      page.getByTestId("opslens-certification-tooling-handoff")
    ).toContainText("humanSetupOnly");
    await expect(
      page.getByTestId("opslens-certification-tooling-handoff")
    ).toContainText("readOnlyCommands=");
    await expect(
      page.getByTestId("opslens-certification-tooling-handoff")
    ).toContainText("approvalGated=");
    await expect(
      page.getByTestId("opslens-certification-tooling-handoff")
    ).toContainText("satisfiedBy=");
    await expect(
      page.getByTestId("opslens-certification-ci-runner")
    ).toContainText("approved-ci-runner.json");
    await expect(
      page.getByTestId("opslens-certification-ci-runner")
    ).toContainText("mutation=false");
    await expect(
      page.getByTestId("opslens-certification-ci-runner")
    ).toContainText("operator-sdk:");
    await expect(
      page.getByTestId("opslens-certification-ci-runner-draft")
    ).toContainText("approved-ci-runner.draft.json");
    await expect(
      page.getByTestId("opslens-certification-ci-runner-draft")
    ).toContainText("sameHead=true");
    await expect(
      page.getByTestId("opslens-certification-ci-runner-draft")
    ).toContainText("mutation=false");
    await expect(
      page.getByTestId("opslens-certification-ci-runner-draft")
    ).toContainText(/DRAFT_NEEDS_EVIDENCE|DRAFT_REVIEW_READY/);
    await expect(
      page.getByTestId("opslens-certification-execution-lanes")
    ).toContainText("local-workstation");
    await expect(
      page.getByTestId("opslens-certification-execution-lanes")
    ).toContainText("hosted-certification-pipeline");
    await expect(
      page.getByTestId("opslens-certification-freshness-policy")
    ).toContainText("current Git HEAD");
    await expect(
      page.getByTestId("opslens-certification-tooling-next")
    ).toContainText("verify:certification");
    await expect(
      page.getByTestId("opslens-certification-first-submission-actions")
    ).toContainText(/community-operator-preflight|verify:certification/);
    await expect(
      page.getByTestId("opslens-certification-first-submission-actions")
    ).toContainText("approval-gated-");
    await expect(
      page.getByTestId("opslens-certification-first-submission-actions")
    ).toContainText("approval=true");
    await expect(page.getByTestId("opslens-certification-gates")).toContainText(
      "certifiedOperator"
    );
    await expect(page.getByTestId("opslens-community-submission")).toContainText(
      "submissionDraftOnly"
    );
    await expect(page.getByTestId("opslens-community-submission")).toContainText(
      "externalSubmissionAttempted=false"
    );
    await expect(page.getByTestId("opslens-community-submission")).toContainText(
      "clusterMutationAttempted=false"
    );
    await expect(
      page.getByTestId("opslens-community-submission-first-actions")
    ).toContainText("verify:community-submission");
    await expect(
      page.getByTestId("opslens-community-submission-first-actions")
    ).toContainText("approval=true");
    await expect(page.getByTestId("opslens-external-runtime-plan")).toContainText(
      "approvalPlanOnly"
    );
    await expect(page.getByTestId("opslens-external-runtime-plan")).toContainText(
      "registryMutationAttempted=false"
    );
    await expect(page.getByTestId("opslens-external-runtime-plan")).toContainText(
      "vllm"
    );
    await expect(
      page.getByTestId("opslens-external-runtime-review-packet")
    ).toContainText("reviewPacketOnly");
    await expect(
      page.getByTestId("opslens-external-runtime-review-packet")
    ).toContainText("registryMutationAttempted=false");
    await expect(
      page.getByTestId("opslens-external-runtime-review-packet")
    ).toContainText("vllm");
    await expect(
      page.getByTestId("opslens-external-runtime-first-actions")
    ).toContainText("vllm:");
    await expect(
      page.getByTestId("opslens-external-runtime-first-actions")
    ).toContainText("evidence:external-runtime");
    await expect(
      page.getByTestId("opslens-external-runtime-first-actions")
    ).toContainText("finalEvidence=false");
    await expect(
      page.getByTestId("opslens-external-runtime-registry-actions")
    ).toContainText("registry-admin");
    await expect(
      page.getByTestId("opslens-external-runtime-registry-actions")
    ).toContainText("evidence:external-runtime");
    await expect(
      page.getByTestId("opslens-external-runtime-registry-actions")
    ).toContainText("approval=true");
    await expect(
      page.getByTestId("opslens-external-runtime-candidates")
    ).toContainText(/candidate=/);
    await expect(
      page.getByTestId("opslens-external-runtime-candidates")
    ).toContainText(/zeroCritical=/);
    await expect(
      page.getByTestId("opslens-external-runtime-candidate-handoff")
    ).toContainText("qdrant:ready-for-human-review");
    await expect(
      page.getByTestId("opslens-external-runtime-candidate-handoff")
    ).toContainText("candidate=cywell/opslens-qdrant:candidate");
    await expect(
      page.getByTestId("opslens-external-runtime-candidate-handoff")
    ).toContainText("critical=0");
    await expect(
      page.getByTestId("opslens-external-runtime-candidate-handoff")
    ).toContainText("high=0");
    await expect(
      page.getByTestId("opslens-external-runtime-candidate-handoff")
    ).toContainText("approvalRequired=true");
    await expect(
      page.getByTestId("opslens-external-runtime-candidate-handoff")
    ).toContainText("mutationAllowed=false");
    await expect(
      page.getByTestId("opslens-external-runtime-candidate-handoff")
    ).toContainText("vllm:blocked-by-remediation");
    await expect(
      page.getByTestId("opslens-external-runtime-reviewer-actions")
    ).toContainText("evidence:external-runtime:draft");
    await expect(
      page.getByTestId("opslens-external-runtime-reviewer-actions")
    ).toContainText("scan-status approved");
    await expect(
      page.getByTestId("opslens-external-runtime-review-commands")
    ).toContainText("mutation=false");
    await expect(
      page.getByTestId("opslens-external-runtime-review-commands")
    ).toContainText("not-run");
    await expect(page.getByTestId("opslens-security-scan-plan")).toContainText(
      "scanPlanOnly"
    );
    await expect(page.getByTestId("opslens-security-scan-plan")).toContainText(
      "registryMutationAttempted=false"
    );
    await expect(page.getByTestId("opslens-security-scan-plan")).toContainText(
      "trivy:"
    );
    await expect(page.getByTestId("opslens-security-scan-plan")).toContainText(
      "security-review-drafts-all"
    );
    await expect(page.getByTestId("opslens-security-scan-plan")).toContainText(
      "sign-owned"
    );
    await expect(
      page.getByTestId("opslens-security-first-review-actions")
    ).toContainText("security-reviewer");
    await expect(
      page.getByTestId("opslens-security-first-review-actions")
    ).toContainText("evidence:security-review:draft");
    await expect(
      page.getByTestId("opslens-security-first-review-actions")
    ).toContainText("approval-gated-sign-owned");
    await expect(
      page.getByTestId("opslens-security-first-review-actions")
    ).toContainText("approval=true");
    await expect(
      page.getByTestId("opslens-security-scan-runner-evidence")
    ).toContainText("evidenceWritten=true");
    await expect(
      page.getByTestId("opslens-security-scan-runner-evidence")
    ).toContainText("fresh=true");
    await expect(
      page.getByTestId("opslens-security-scan-runner-evidence")
    ).toContainText("dockerFallback=true");
    await expect(
      page.getByTestId("opslens-security-scan-runner-evidence")
    ).toContainText("digestPinned=true");
    await expect(
      page.getByTestId("opslens-security-scan-runner-evidence")
    ).toContainText("missingTargets=none");
    await expect(page.getByTestId("opslens-security-review-drafts")).toContainText(
      "operator:draft="
    );
    await expect(page.getByTestId("opslens-security-review-drafts")).toContainText(
      "sameHead=true"
    );
    await expect(page.getByTestId("opslens-security-review-drafts")).toContainText(
      "explicitDecision="
    );
    await expect(page.getByTestId("opslens-security-review-drafts")).toContainText(
      "ready=false"
    );
    await expect(page.getByTestId("opslens-owned-image-provenance")).toContainText(
      "readOnlyEvidenceOnly"
    );
    await expect(page.getByTestId("opslens-owned-image-provenance")).toContainText(
      "registryMutationAttempted=false"
    );
    await expect(page.getByTestId("opslens-owned-image-provenance")).toContainText(
      "operator"
    );
    await expect(page.getByTestId("opslens-release-publish-plan")).toContainText(
      "approvalPlanOnly"
    );
    await expect(page.getByTestId("opslens-release-publish-plan")).toContainText(
      "registryMutationAttempted=false"
    );
    await expect(page.getByTestId("opslens-release-publish-plan")).toContainText(
      "release-manager"
    );
    await expect(
      page.getByTestId("opslens-release-first-publish-actions")
    ).toContainText(/verify:|git status/);
    await expect(
      page.getByTestId("opslens-release-first-publish-actions")
    ).toContainText("approval-gated-");
    await expect(
      page.getByTestId("opslens-release-first-publish-actions")
    ).toContainText("approval=true");
    await expect(
      page.getByTestId("opslens-release-refresh-security-review")
    ).toContainText("securityReviewDrafts=PASS");
    await expect(
      page.getByTestId("opslens-release-refresh-security-review")
    ).toContainText("id=security-review-drafts-all");
    await expect(page.getByTestId("opslens-release-evidence-bundle")).toContainText(
      "bundleOnly"
    );
    await expect(page.getByTestId("opslens-release-evidence-bundle")).toContainText(
      "cywell-opslens-release-evidence-bundle.md"
    );
    await expect(page.getByTestId("opslens-release-evidence-bundle")).toContainText(
      "mutationBoundaryPassed=true"
    );
    await expect(page.getByTestId("opslens-release-evidence-bundle")).toContainText(
      "registryMutationAttempted=false"
    );
    await expect(page.getByTestId("opslens-release-evidence-bundle")).toContainText(
      "readOnly="
    );
    await expect(page.getByTestId("opslens-release-action-queue")).toContainText(
      "actionQueueOnly"
    );
    await expect(page.getByTestId("opslens-release-action-queue")).toContainText(
      "cywell-opslens-release-action-queue.md"
    );
    await expect(page.getByTestId("opslens-release-action-queue")).toContainText(
      "mutationBoundaryPassed=true"
    );
    await expect(page.getByTestId("opslens-release-action-queue")).toContainText(
      "registryMutationAttempted=false"
    );
    await expect(
      page.getByTestId("opslens-release-action-queue-source-artifacts")
    ).toContainText("envContract:PASS:fresh=true:required=true:mutation=false");
    await expect(page.getByTestId("opslens-release-action-queue")).toContainText(
      /network-sre|cluster-admin|cluster-sre|release-manager/
    );
    await expect(
      page.getByTestId("opslens-release-action-queue-critical-path")
    ).toContainText("live-ocp-lightspeed");
    await expect(
      page.getByTestId("opslens-release-action-queue-critical-path")
    ).toContainText(/external-runtime-review|release-publish|install-approval/);
    await expect(
      page.getByTestId("opslens-release-action-queue-owner-packets")
    ).toContainText("cluster-admin.md");
    await expect(
      page.getByTestId("opslens-release-action-queue-owner-packets")
    ).toContainText("release-manager.md");
    await expect(
      page.getByTestId("opslens-release-action-queue-owner-packet-cleanup")
    ).toContainText("deletionAllowed=true");
    await expect(
      page.getByTestId("opslens-release-action-queue-owner-packet-cleanup")
    ).toContainText("cluster-admin.md");
    await expect(
      page.getByTestId("opslens-release-action-queue-items")
    ).toContainText(/npm run evidence:ocp-auth-rbac-plan|npm run verify:ocp:connectivity/);
    await expect(
      page.getByTestId("opslens-release-action-queue-approval-handoff")
    ).toContainText("apply-live-evidence-reader-rbac");
    await expect(
      page.getByTestId("opslens-release-action-queue-approval-handoff")
    ).toContainText("create-short-lived-live-reader-token");
    await expect(
      page.getByTestId("opslens-release-action-queue-readonly-handoff")
    ).toContainText("ocp-connectivity");
    await expect(
      page.getByTestId("opslens-release-action-queue-network-actions")
    ).toContainText(/ocp-network-target|network actions clear/);
    await expect(
      page.getByTestId("opslens-release-action-queue-network-actions")
    ).toContainText(/ocp-network-probes|network actions clear/);
    await expect(
      page.getByTestId("opslens-release-action-queue-tooling-handoff")
    ).toContainText("opm");
    await expect(
      page.getByTestId("opslens-release-action-queue-tooling-handoff")
    ).toContainText("operator-sdk");
    await expect(
      page.getByTestId("opslens-release-action-queue-candidate-actions")
    ).toContainText("evidence:external-runtime:candidate-scan");
    await expect(
      page.getByTestId("opslens-release-action-queue-candidate-actions")
    ).toContainText(/candidate-critical-summary|candidate-requirement/);
    await expect(
      page.getByTestId("opslens-release-action-queue-security-review-actions")
    ).toContainText("security-review-operator-final-evidence");
    await expect(
      page.getByTestId("opslens-release-action-queue-security-review-actions")
    ).toContainText("evidence:security-review:draft");
    await expect(
      page.getByTestId("opslens-release-action-queue-security-review-actions")
    ).toContainText("sign-owned-operator");
    await expect(
      page.getByTestId("opslens-release-action-queue-diagnostics")
    ).toContainText(/candidate-status|security-final-review|post-approval-rbac|source-digest-inspection|registry-access/);
    await expect(
      page.getByTestId("opslens-release-action-queue-catalog-registry-actions")
    ).toContainText(/registry-admin-fix-catalog-base-image-auth|catalog registry actions clear/);
    await expect(
      page.getByTestId("opslens-release-action-queue-catalog-registry-actions")
    ).toContainText(/registry-base-inspect|catalog registry actions clear/);
    await expect(
      page.getByTestId("opslens-release-action-queue-runtime-live-actions")
    ).toContainText(/runtime-platform-run-live-vllm-qdrant-probes|runtime live actions clear/);
    await expect(
      page.getByTestId("opslens-release-action-queue-runtime-live-actions")
    ).toContainText(/runtime-readiness-live|runtime live actions clear/);
    await expect(
      page.getByTestId("opslens-release-action-queue-runtime-live-actions")
    ).toContainText(/runtime-rag-fixture|runtime live actions clear/);
    await expect(
      page.getByTestId("opslens-release-action-queue-monitoring-proxy-actions")
    ).toContainText(/cluster-sre-enable-monitoring-proxy-evidence|monitoring proxy actions clear/);
    await expect(
      page.getByTestId("opslens-release-action-queue-monitoring-proxy-actions")
    ).toContainText(/aiops-monitoring-proxy-smoke|monitoring proxy actions clear/);
    await expect(
      page.getByTestId("opslens-release-action-queue-lightspeed-readiness-actions")
    ).toContainText(/cluster-admin-fix-lightspeed-readiness-auth-rbac|cluster-sre-fix-lightspeed-readiness-tls|network-sre-unblock-lightspeed-readiness-ocp-api|lightspeed readiness actions clear/);
    await expect(
      page.getByTestId("opslens-release-action-queue-lightspeed-readiness-actions")
    ).toContainText(/lightspeed-readiness-live|lightspeed readiness actions clear/);
    await expect(
      page.getByTestId("opslens-release-action-queue-diagnostics")
    ).toContainText(/post-approval-rbac|ocp-network-target|cluster-admin-fix-lightspeed-readiness-auth-rbac/);
    await expect(page.getByTestId("opslens-release-refresh")).toContainText(
      "localEvidenceRefresh"
    );
    await expect(page.getByTestId("opslens-release-refresh")).toContainText(
      "clusterMutationAttempted=false"
    );
    await expect(page.getByTestId("opslens-release-refresh")).toContainText(
      "dirty=false"
    );
    await expect(
      page.getByTestId("opslens-release-refresh-owner-packets")
    ).toContainText("cluster-admin.md");
    await expect(
      page.getByTestId("opslens-release-refresh-owner-packets")
    ).toContainText("exists=true");
    await expect(
      page.getByTestId("opslens-release-refresh-owner-packet-cleanup")
    ).toContainText("deletionAllowed=true");
    await expect(
      page.getByTestId("opslens-release-refresh-owner-packet-cleanup")
    ).toContainText("cluster-admin.md");
    await expect(page.getByTestId("opslens-evidence-checkpoint")).toContainText(
      /PASS|NEEDS_EVIDENCE|BLOCKED|missing/
    );
    await expect(page.getByTestId("opslens-evidence-checkpoint")).toContainText(
      "dirty=false"
    );
    await expect(page.getByTestId("opslens-evidence-checkpoint")).toContainText(
      "envContract"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      /needs-live-check|needs-configuration|needs-evidence|partial|ready|approval-required|failed|blocked/
    );
    await expect(
      page.getByTestId("opslens-install-readiness-evidence")
    ).toContainText("mutationAllowed=false");
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "mutationAllowed=false"
    );
    await page
      .getByTestId("opslens-rag-validation")
      .getByRole("button", { name: "Validate" })
      .click();
    await expect(page.getByTestId("opslens-rag-validation")).toContainText(
      "accepted"
    );
    await expect(page.getByTestId("opslens-rag-validation")).toContainText(
      "rawDocumentReturned=false"
    );
    await page
      .getByTestId("opslens-rag-validation")
      .getByRole("button", { name: "Export Evidence" })
      .click();
    await expect(page.getByTestId("opslens-rag-evidence-export")).toContainText(
      "rag-validation-"
    );
    await expect(page.getByTestId("opslens-rag-evidence-export")).toContainText(
      "designOnly"
    );
    await expect(page.getByTestId("opslens-rag-evidence-export")).toContainText(
      "enqueueAllowed=false"
    );
    await page
      .getByTestId("opslens-rag-validation")
      .getByRole("button", { name: "Queue Evidence" })
      .click();
    await expect(page.getByTestId("opslens-rag-approval-queue")).toContainText(
      "rag-queue-"
    );
    await expect(page.getByTestId("opslens-rag-approval-queue")).toContainText(
      "design-only"
    );
    await expect(page.getByTestId("opslens-rag-approval-queue")).toContainText(
      "persisted=false"
    );
    await expect(page.getByTestId("opslens-rag-approval-queue")).toContainText(
      "vectorWrite=false"
    );
    await expect(
      page.getByTestId("opslens-rag-approval-queue-inventory")
    ).toContainText("designOnly");
    await expect(
      page.getByTestId("opslens-rag-approval-queue-inventory")
    ).toContainText("0 queued");
    await expect(
      page.getByTestId("opslens-rag-approval-queue-inventory")
    ).toContainText("readOnly=true");
    await expect(
      page.getByTestId("opslens-rag-approval-queue-inventory")
    ).toContainText("approvalMutation=false");
  });

  test("AC-OCP-001 discovers and reads live OpenShift resources", async ({
    page,
    request
  }) => {
    test.setTimeout(120_000);

    const status = await request.get("/api/ocp/status");
    expect(status.ok()).toBe(true);
    const statusBody = (await status.json()) as {
      configured?: boolean;
      reachable?: boolean;
      gitVersion?: string;
      userName?: string;
    };
    expect(statusBody.configured).toBe(true);
    expect(statusBody.reachable).toBe(true);
    expect(statusBody.gitVersion).toBeTruthy();

    const discovery = await request.get("/api/ocp/api-resources");
    expect(discovery.ok()).toBe(true);
    const discoveryBody = (await discovery.json()) as {
      status?: { discoveredResourceCount?: number };
      resources?: Array<{
        apiVersion: string;
        name: string;
        kind: string;
        safeToList: boolean;
      }>;
    };
    expect(discoveryBody.status?.discoveredResourceCount).toBeGreaterThan(100);
    expect(
      JSON.stringify(discoveryBody).toLowerCase().includes("ocp_api_token")
    ).toBe(false);

    const podsResource = discoveryBody.resources?.find(
      (resource) => resource.apiVersion === "v1" && resource.name === "pods"
    );
    expect(podsResource?.safeToList).toBe(true);

    const accessReview = await request.get(
      "/api/ocp/access-review?apiVersion=v1&resource=pods&verb=list"
    );
    expect(accessReview.ok()).toBe(true);
    const accessReviewBody = (await accessReview.json()) as {
      access?: {
        allowed?: boolean;
        verb?: string;
        evidence?: string[];
      };
    };
    expect(accessReviewBody.access?.allowed).toBe(true);
    expect(accessReviewBody.access?.verb).toBe("list");
    expect(accessReviewBody.access?.evidence?.join(" ")).toContain(
      "SelfSubjectAccessReview"
    );

    const accessMatrix = await request.get(
      "/api/ocp/access-matrix?apiVersion=v1&resource=pods"
    );
    expect(accessMatrix.ok()).toBe(true);
    const accessMatrixBody = (await accessMatrix.json()) as {
      access?: {
        get?: { allowed?: boolean };
        list?: { allowed?: boolean };
        watch?: { allowed?: boolean };
      };
    };
    expect(accessMatrixBody.access?.get?.allowed).toBe(true);
    expect(accessMatrixBody.access?.list?.allowed).toBe(true);
    expect(accessMatrixBody.access?.watch?.allowed).toBe(true);

    const overview = await request.get("/api/ocp/console-overview");
    expect(overview.ok()).toBe(true);
    const overviewBody = (await overview.json()) as {
      cluster?: { version?: string; desiredVersion?: string };
      operators?: { total?: number; degraded?: number };
      nodes?: { total?: number; ready?: number };
      workloads?: {
        pods?: { total?: number; crashLooping?: number };
        deployments?: { total?: number };
      };
      networking?: { routes?: number; services?: number };
      supplyChain?: { imageStreams?: number };
      evidence?: string[];
    };
    expect(overviewBody.cluster?.version).toBeTruthy();
    expect(overviewBody.operators?.total).toBeGreaterThan(0);
    expect(overviewBody.nodes?.total).toBeGreaterThan(0);
    expect(overviewBody.workloads?.pods?.total).toBeGreaterThan(0);
    expect(overviewBody.networking?.services).toBeGreaterThan(0);
    expect(overviewBody.evidence?.length).toBeGreaterThan(5);

    const coverage = await request.get(
      "/api/ocp/coverage-matrix?maxResources=20&includeDetails=true"
    );
    expect(coverage.ok()).toBe(true);
    const coverageBody = (await coverage.json()) as {
      status?: { reachable?: boolean };
      totals?: {
        discovered?: number;
        safeToList?: number;
        probed?: number;
        listed?: number;
        empty?: number;
        blocked?: number;
        skipped?: number;
        detailRead?: number;
        gapTypes?: Record<string, number>;
      };
      resources?: Array<{
        resource: { apiVersion: string; name: string };
        list: {
          status: string;
          access?: { evidence?: string[] };
        };
        detail: { status: string };
        gap?: { type?: string; message?: string };
      }>;
      evidence?: string[];
    };
    expect(coverageBody.status?.reachable).toBe(true);
    expect(coverageBody.totals?.discovered).toBe(
      discoveryBody.status?.discoveredResourceCount
    );
    expect(coverageBody.totals?.safeToList).toBeGreaterThan(20);
    expect(coverageBody.totals?.probed).toBe(20);
    expect(coverageBody.resources?.length).toBe(coverageBody.totals?.discovered);
    expect(
      coverageBody.resources?.some((entry) =>
        entry.list.access?.evidence?.join(" ").includes(
          "SelfSubjectAccessReview"
        )
      )
    ).toBe(true);
    expect(
      coverageBody.resources?.find(
        (entry) =>
          entry.resource.apiVersion === "v1" &&
          entry.resource.name === "secrets"
      )
    ).toMatchObject({
      list: { status: "blocked" },
      gap: { type: "policy-blocked" }
    });
    expect(coverageBody.totals?.gapTypes?.["policy-blocked"]).toBe(1);
    expect(coverageBody.totals?.gapTypes?.["not-probed"]).toBeGreaterThan(0);
    expect(
      coverageBody.resources?.some((entry) => entry.gap?.type === "not-probed")
    ).toBe(true);
    expect(coverageBody.evidence?.join(" ")).toContain("Secrets remain blocked");

    const secretDiagnostic = await request.get(
      "/api/ocp/coverage-diagnostic?apiVersion=v1&resource=secrets"
    );
    expect(secretDiagnostic.ok()).toBe(true);
    const secretDiagnosticBody = (await secretDiagnostic.json()) as {
      coverage?: { gap?: { type?: string } };
      findings?: Array<{ label?: string; status?: string }>;
      evidence?: string[];
      rollbackPath?: string[];
    };
    expect(secretDiagnosticBody.coverage?.gap?.type).toBe("policy-blocked");
    expect(
      secretDiagnosticBody.findings?.some(
        (finding) => finding.label === "Coverage Gap"
      )
    ).toBe(true);
    expect(secretDiagnosticBody.evidence?.join(" ")).toContain("read-only");
    expect(secretDiagnosticBody.rollbackPath?.join(" ")).not.toContain("apply");

    const fullCoverage = await request.get(
      "/api/ocp/coverage-matrix?includeDetails=false",
      { timeout: 30_000 }
    );
    expect(fullCoverage.ok()).toBe(true);
    const fullCoverageBody = (await fullCoverage.json()) as {
      totals?: { safeToList?: number; probed?: number; skipped?: number };
      resources?: Array<{
        resource: { apiVersion: string; name: string };
        gap?: { type?: string };
      }>;
    };
    expect(fullCoverageBody.totals?.probed).toBe(
      fullCoverageBody.totals?.safeToList
    );
    expect(fullCoverageBody.totals?.skipped).toBe(0);
    const conversionWebhookGap = fullCoverageBody.resources?.find(
      (entry) => entry.gap?.type === "conversion-webhook-error"
    );
    if (conversionWebhookGap) {
      const diagnostic = await request.get(
        `/api/ocp/coverage-diagnostic?apiVersion=${encodeURIComponent(
          conversionWebhookGap.resource.apiVersion
        )}&resource=${encodeURIComponent(conversionWebhookGap.resource.name)}`,
        { timeout: 60_000 }
      );
      expect(diagnostic.ok()).toBe(true);
      const diagnosticBody = (await diagnostic.json()) as {
        coverage?: { gap?: { type?: string } };
        findings?: Array<{ label?: string; message?: string; status?: string }>;
        nextChecks?: string[];
      };
      expect(diagnosticBody.coverage?.gap?.type).toBe(
        "conversion-webhook-error"
      );
      expect(
        diagnosticBody.findings?.some(
          (finding) => finding.label === "CustomResourceDefinition"
        )
      ).toBe(true);
      expect(
        diagnosticBody.findings?.some((finding) =>
          finding.message?.toLowerCase().includes("webhook")
        )
      ).toBe(true);
      expect(diagnosticBody.nextChecks?.join(" ")).toContain("webhook");
      const alternateFinding = diagnosticBody.findings?.find(
        (finding) => finding.label === "Alternate API Versions"
      );
      expect(alternateFinding).toBeDefined();

      if (alternateFinding?.status === "ok") {
        const fallbackList = await request.get(
          `/api/ocp/resources?apiVersion=${encodeURIComponent(
            conversionWebhookGap.resource.apiVersion
          )}&resource=${encodeURIComponent(
            conversionWebhookGap.resource.name
          )}&limit=1`,
          { timeout: 30_000 }
        );
        expect(fallbackList.ok()).toBe(true);
        const fallbackListBody = (await fallbackList.json()) as {
          resource?: { apiVersion?: string; name?: string };
          namespace?: string;
          fallback?: {
            requestedApiVersion?: string;
            servedApiVersion?: string;
            evidence?: string[];
          };
          items?: Array<{
            metadata: { name?: string; namespace?: string };
          }>;
          access?: { list?: { allowed?: boolean; evidence?: string[] } };
        };
        expect(fallbackListBody.fallback?.requestedApiVersion).toBe(
          conversionWebhookGap.resource.apiVersion
        );
        expect(fallbackListBody.fallback?.servedApiVersion).toBeTruthy();
        expect(fallbackListBody.resource?.apiVersion).toBe(
          fallbackListBody.fallback?.servedApiVersion
        );
        expect(fallbackListBody.fallback?.evidence?.join(" ")).toContain(
          "alternate version list succeeded"
        );
        expect(fallbackListBody.access?.list?.allowed).toBe(true);
        expect(fallbackListBody.access?.list?.evidence?.join(" ")).toContain(
          "SelfSubjectAccessReview"
        );

        const fallbackItem = fallbackListBody.items?.[0];
        if (fallbackItem?.metadata.name) {
          const fallbackDetail = await request.get(
            `/api/ocp/resource?apiVersion=${encodeURIComponent(
              conversionWebhookGap.resource.apiVersion
            )}&resource=${encodeURIComponent(
              conversionWebhookGap.resource.name
            )}&name=${encodeURIComponent(fallbackItem.metadata.name)}${
              fallbackItem.metadata.namespace
                ? `&namespace=${encodeURIComponent(
                    fallbackItem.metadata.namespace
                  )}`
                : ""
            }&full=true`,
            { timeout: 30_000 }
          );
          expect(fallbackDetail.ok()).toBe(true);
          const fallbackDetailBody = (await fallbackDetail.json()) as {
            resource?: { apiVersion?: string };
            fallback?: {
              requestedApiVersion?: string;
              servedApiVersion?: string;
              evidence?: string[];
            };
            access?: { get?: { allowed?: boolean; evidence?: string[] } };
          };
          expect(fallbackDetailBody.fallback?.requestedApiVersion).toBe(
            conversionWebhookGap.resource.apiVersion
          );
          expect(fallbackDetailBody.resource?.apiVersion).toBe(
            fallbackDetailBody.fallback?.servedApiVersion
          );
          expect(fallbackDetailBody.fallback?.evidence?.join(" ")).toContain(
            "alternate version get succeeded"
          );
          expect(fallbackDetailBody.access?.get?.allowed).toBe(true);
        }
      }
    }

    const pods = await request.get(
      "/api/ocp/resources?apiVersion=v1&resource=pods&limit=50"
    );
    expect(pods.ok()).toBe(true);
    const podsBody = (await pods.json()) as {
      items?: Array<{
        metadata: {
          name: string;
          namespace?: string;
          labels?: Record<string, string>;
          ownerReferences?: Array<{ kind?: string; name?: string }>;
        };
      }>;
      continueToken?: string;
      access?: { list?: { allowed?: boolean; evidence?: string[] } };
    };
    expect(podsBody.items?.length).toBeGreaterThan(0);
    expect(podsBody.continueToken).toBeTruthy();
    expect(podsBody.access?.list?.allowed).toBe(true);
    expect(podsBody.access?.list?.evidence?.join(" ")).toContain(
      "SelfSubjectAccessReview"
    );

    const labeledPod = podsBody.items?.find((item) =>
      Object.values(item.metadata.labels ?? {}).some((value) => Boolean(value))
    );
    const labelEntry = Object.entries(labeledPod?.metadata.labels ?? {}).find(
      ([, value]) => Boolean(value)
    );
    expect(labelEntry).toBeDefined();
    const labelSelector = `${labelEntry?.[0]}=${labelEntry?.[1]}`;
    const labelFilteredPods = await request.get(
      `/api/ocp/resources?apiVersion=v1&resource=pods&limit=10&labelSelector=${encodeURIComponent(
        labelSelector
      )}`
    );
    expect(labelFilteredPods.ok()).toBe(true);
    const labelFilteredBody = (await labelFilteredPods.json()) as {
      selectors?: { labelSelector?: string };
      items?: Array<{ metadata: { labels?: Record<string, string> } }>;
    };
    expect(labelFilteredBody.selectors?.labelSelector).toBe(labelSelector);
    expect(labelFilteredBody.items?.length).toBeGreaterThan(0);
    expect(
      labelFilteredBody.items?.every(
        (item) => item.metadata.labels?.[labelEntry?.[0] ?? ""] === labelEntry?.[1]
      )
    ).toBe(true);

    const firstPod =
      podsBody.items?.find(
        (item) => (item.metadata.ownerReferences?.length ?? 0) > 0
      ) ?? podsBody.items?.[0];
    expect(firstPod?.metadata.name).toBeTruthy();

    const nextPods = await request.get(
      `/api/ocp/resources?apiVersion=v1&resource=pods&limit=5&continue=${encodeURIComponent(
        podsBody.continueToken ?? ""
      )}`
    );
    expect(nextPods.ok()).toBe(true);
    const nextPodsBody = (await nextPods.json()) as {
      items?: Array<{ metadata: { name: string } }>;
    };
    expect(nextPodsBody.items?.length).toBeGreaterThan(0);

    const fieldFilteredPods = await request.get(
      `/api/ocp/resources?apiVersion=v1&resource=pods&limit=5&fieldSelector=${encodeURIComponent(
        `metadata.name=${firstPod?.metadata.name ?? ""}`
      )}`
    );
    expect(fieldFilteredPods.ok()).toBe(true);
    const fieldFilteredBody = (await fieldFilteredPods.json()) as {
      selectors?: { fieldSelector?: string };
      items?: Array<{ metadata: { name: string } }>;
    };
    expect(fieldFilteredBody.selectors?.fieldSelector).toBe(
      `metadata.name=${firstPod?.metadata.name}`
    );
    expect(fieldFilteredBody.items?.[0]?.metadata.name).toBe(
      firstPod?.metadata.name
    );

    const podDetail = await request.get(
      `/api/ocp/resource?apiVersion=v1&resource=pods&full=true&namespace=${encodeURIComponent(
        firstPod?.metadata.namespace ?? ""
      )}&name=${encodeURIComponent(firstPod?.metadata.name ?? "")}`
    );
    expect(podDetail.ok()).toBe(true);
    const podDetailBody = (await podDetail.json()) as {
      raw?: { kind?: string; metadata?: { name?: string } };
      access?: { get?: { allowed?: boolean; evidence?: string[] } };
      redaction?: { sensitiveFieldRedactionCount?: number };
    };
    expect(podDetailBody.raw?.kind).toBe("Pod");
    expect(podDetailBody.raw?.metadata?.name).toBe(firstPod?.metadata.name);
    expect(podDetailBody.access?.get?.allowed).toBe(true);
    expect(podDetailBody.access?.get?.evidence?.join(" ")).toContain(
      "SelfSubjectAccessReview"
    );
    expect(JSON.stringify(podDetailBody).toLowerCase()).not.toContain(
      "ocp_api_token"
    );

    const related = await request.get(
      `/api/ocp/related?apiVersion=v1&resource=pods&namespace=${encodeURIComponent(
        firstPod?.metadata.namespace ?? ""
      )}&name=${encodeURIComponent(firstPod?.metadata.name ?? "")}`
    );
    expect(related.ok()).toBe(true);
    const relatedBody = (await related.json()) as {
      owners?: Array<{ kind?: string; name?: string }>;
      children?: unknown[];
      evidence?: string[];
    };
    expect(relatedBody.owners).toBeDefined();
    if ((firstPod?.metadata.ownerReferences?.length ?? 0) > 0) {
      expect(relatedBody.owners?.length).toBeGreaterThan(0);
      expect(relatedBody.owners?.[0]?.name).toBe(
        firstPod?.metadata.ownerReferences?.[0]?.name
      );
    }
    expect(relatedBody.children).toBeDefined();
    expect(relatedBody.evidence?.join(" ")).toContain("ownerReferences");

    const events = await request.get(
      `/api/ocp/events?apiVersion=v1&kind=Pod&namespace=${encodeURIComponent(
        firstPod?.metadata.namespace ?? ""
      )}&name=${encodeURIComponent(firstPod?.metadata.name ?? "")}`
    );
    expect(events.ok()).toBe(true);
    const eventsBody = (await events.json()) as {
      items?: unknown[];
      access?: { allowed?: boolean };
    };
    expect(eventsBody.items).toBeDefined();
    expect(eventsBody.access?.allowed).toBe(true);

    const logs = await request.get(
      `/api/ocp/pod-logs?namespace=${encodeURIComponent(
        firstPod?.metadata.namespace ?? ""
      )}&pod=${encodeURIComponent(firstPod?.metadata.name ?? "")}&tailLines=20`
    );
    expect(logs.ok()).toBe(true);
    const logsBody = (await logs.json()) as {
      pod?: string;
      namespace?: string;
      tailLines?: number;
      logs?: string;
      access?: { allowed?: boolean; resourceAttributes?: { subresource?: string } };
    };
    expect(logsBody.pod).toBe(firstPod?.metadata.name);
    expect(logsBody.namespace).toBe(firstPod?.metadata.namespace);
    expect(logsBody.tailLines).toBe(20);
    expect(typeof logsBody.logs).toBe("string");
    expect(logsBody.access?.allowed).toBe(true);
    expect(logsBody.access?.resourceAttributes?.subresource).toBe("log");

    const secret = await request.get(
      "/api/ocp/resources?apiVersion=v1&resource=secrets&limit=1"
    );
    expect(secret.status()).toBe(400);

    await page.goto("/");
    await expect(page.getByTestId("ocp-overview-status")).toContainText(
      "live OCP",
      { timeout: 15_000 }
    );
    await expect(page.getByTestId("ocp-console-overview")).toContainText(
      "Cluster Operators"
    );
    await expect(page.getByTestId("ocp-console-overview")).toContainText(
      "Workloads"
    );
    await expect(page.getByTestId("ocp-overview-evidence")).toContainText(
      "ClusterVersion"
    );
    await expect(page.getByTestId("ocp-coverage-status")).toContainText(
      "coverage ready",
      { timeout: 20_000 }
    );
    await expect(page.getByTestId("ocp-coverage-status")).toContainText(
      "discovered"
    );
    await expect(page.getByTestId("ocp-coverage-totals")).toContainText(
      "listed"
    );
    await expect(page.getByTestId("ocp-coverage-totals")).toContainText(
      "skipped"
    );
    await expect(page.getByTestId("ocp-coverage-totals")).toContainText(
      "policy-blocked"
    );
    await expect(page.getByTestId("ocp-coverage-totals")).toContainText(
      "not-probed"
    );
    await expect(page.getByTestId("ocp-coverage-matrix")).toContainText(
      "policy-blocked"
    );
    await expect(page.getByTestId("ocp-coverage-full-scan")).toBeVisible();
    await expect(page.getByTestId("ocp-coverage-export")).toBeVisible();
    await expect(page.getByTestId("ocp-coverage-matrix")).toContainText(
      "SelfSubjectAccessReview"
    );
    await expect(page.getByTestId("ocp-coverage-diagnostic")).toContainText(
      "Coverage Diagnostic",
      { timeout: 20_000 }
    );
    await expect(page.getByTestId("ocp-coverage-diagnostic")).toContainText(
      "Coverage Gap"
    );
    await expect(page.getByTestId("ocp-status")).toContainText("OCP reachable", {
      timeout: 15_000
    });
    await page.getByLabel("Search API resources").fill("pods");
    await expect(page.getByTestId("ocp-resource-table")).toContainText("Pod");
    if (firstPod?.metadata.namespace) {
      await expect(page.getByTestId("ocp-namespace-select")).toContainText(
        firstPod.metadata.namespace
      );
    }
    await expect(page.getByTestId("ocp-resource-items")).toContainText(
      firstPod?.metadata.name ?? ""
    );
    await expect(page.getByTestId("ocp-resource-access")).toContainText(
      "RBAC list allowed"
    );
    await page.getByTestId("ocp-label-selector").fill(labelSelector);
    await page.getByTestId("ocp-resource-load").click();
    await expect(page.getByTestId("ocp-resource-access")).toContainText(
      "RBAC list allowed"
    );
    await page.getByTestId("ocp-label-selector").fill("");
    await page
      .getByTestId("ocp-field-selector")
      .fill(`metadata.name=${firstPod?.metadata.name ?? ""}`);
    await page.getByTestId("ocp-resource-load").click();
    await expect(page.getByTestId("ocp-resource-items")).toContainText(
      firstPod?.metadata.name ?? ""
    );
    await page.getByTestId("ocp-field-selector").fill("");
    await page.getByTestId("ocp-resource-load").click();
    await expect(page.getByTestId("ocp-access-matrix")).toContainText(
      "get allowed"
    );
    await expect(page.getByTestId("ocp-access-matrix")).toContainText(
      "list allowed"
    );
    await expect(page.getByTestId("ocp-access-matrix")).toContainText(
      "watch allowed"
    );
    await expect(page.getByTestId("ocp-page-controls")).toContainText("Page 1");
    await expect(page.getByTestId("ocp-resource-detail")).toContainText(
      `"kind": "Pod"`
    );
    await expect(page.getByTestId("ocp-related-resources")).toContainText(
      "Owner References"
    );
    await page.getByTestId("ocp-detail-yaml-tab").click();
    await expect(page.getByTestId("ocp-resource-detail")).toContainText(
      "kind: Pod"
    );
    await expect(page.getByTestId("ocp-resource-detail")).toContainText(
      "apiVersion: v1"
    );
    await expect(page.getByTestId("ocp-resource-detail")).not.toContainText(
      "ocp_api_token"
    );
    await page.getByTestId("ocp-detail-json-tab").click();
    await expect(page.getByTestId("ocp-resource-events")).toContainText(
      /events|Event|No events/
    );
    await expect(page.getByTestId("ocp-pod-logs")).not.toBeEmpty();
    await expect(page.getByTestId("ocp-next-page")).toBeEnabled();
    await page.getByTestId("ocp-next-page").click();
    await expect(page.getByTestId("ocp-page-controls")).toContainText("Page 2");
    await expect(page.getByTestId("ocp-prev-page")).toBeEnabled();
  });
});

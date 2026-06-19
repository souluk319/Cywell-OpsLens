import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mockContext } from "@kugnus/contracts";
import {
  type ConsoleParityActionSurface,
  type ConsoleParityItem,
  consoleParitySections,
  consoleParityFunctionSignal,
  consoleParityFunctionProof,
  ocpConsoleParityItems
} from "../../apps/web/src/consoleParity";

const surfaceLabelsForTest: Record<ConsoleParityActionSurface, string> = {
  overview: "Cluster overview",
  evidence: "Evidence pane",
  "resource-explorer": "Resource explorer",
  "topology-graph": "Topology graph",
  "ops-dashboard": "OpsLens dashboard",
  "ops-admin": "OpsLens admin",
  opsbrain: "OpsBrain",
  assistant: "KOMSCO assistant"
};

test.describe("Cywell OpsLens MVP 0.1 acceptance", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  async function openAssistant(page: Page) {
    await page.getByTestId("assistant-launcher").click();
    await expect(page.getByTestId("assistant-popover")).toBeVisible();
  }

  async function closeAssistantIfOpen(page: Page) {
    if ((await page.getByTestId("assistant-popover").count()) > 0) {
      await page.getByTestId("assistant-close").click();
      await expect(page.getByTestId("assistant-popover")).toHaveCount(0);
    }
  }

  async function switchLanguage(page: Page, target: "ko" | "en") {
    if ((await page.locator("html").getAttribute("lang")) !== target) {
      await page
        .getByTestId(target === "ko" ? "language-ko-toggle" : "language-en-toggle")
        .click();
    }
    await expect(page.locator("html")).toHaveAttribute("lang", target);
  }

  function sectionTestIdFor(section: string) {
    return section
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function consoleItem(id: string) {
    const item = ocpConsoleParityItems.find((entry) => entry.id === id);
    if (!item) {
      throw new Error(`Unknown console parity item: ${id}`);
    }
    return item;
  }

  async function openConsoleNavItem(page: Page, item: ConsoleParityItem | string) {
    const navItem = typeof item === "string" ? consoleItem(item) : item;
    const button = page.getByTestId(`console-nav-${navItem.id}`);
    if (!(await button.isVisible())) {
      await page
        .getByTestId(`console-nav-section-${sectionTestIdFor(navItem.section)}`)
        .click();
    }
    await button.click();
  }

  function escapeForRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function expectConsoleParityRegistryIntegrity() {
    const validSurfaces: ConsoleParityActionSurface[] = [
      "overview",
      "evidence",
      "resource-explorer",
      "topology-graph",
      "ops-dashboard",
      "ops-admin",
      "opsbrain",
      "assistant"
    ];
    const validStatuses = [
      "covered",
      "native-deep-link",
      "ops-enhanced",
      "read-only-plan"
    ];
    const ids = new Set<string>();
    const sectionsWithItems = new Set<string>();

    expect(ocpConsoleParityItems.length).toBeGreaterThanOrEqual(25);

    for (const item of ocpConsoleParityItems) {
      expect(ids.has(item.id), `duplicate console item id: ${item.id}`).toBe(
        false
      );
      ids.add(item.id);
      sectionsWithItems.add(item.section);

      expect(item.label.trim(), `empty EN label: ${item.id}`).not.toBe("");
      expect(item.labelKo.trim(), `empty KO label: ${item.id}`).not.toBe("");
      expect(item.originalPath.trim(), `empty native path: ${item.id}`).not.toBe(
        ""
      );
      expect(
        item.originalPathKo.trim(),
        `empty KO native path: ${item.id}`
      ).not.toBe("");
      expect(
        item.targetSelector.trim(),
        `empty target selector: ${item.id}`
      ).not.toBe("");
      expect(item.command.trim(), `empty EN command: ${item.id}`).not.toBe("");
      expect(item.commandKo.trim(), `empty KO command: ${item.id}`).not.toBe("");
      expect(
        item.opsLensEnhancement.trim(),
        `empty EN enhancement: ${item.id}`
      ).not.toBe("");
      expect(
        item.opsLensEnhancementKo.trim(),
        `empty KO enhancement: ${item.id}`
      ).not.toBe("");
      expect(
        item.acceptance.trim(),
        `empty EN acceptance: ${item.id}`
      ).not.toBe("");
      expect(
        item.acceptanceKo.trim(),
        `empty KO acceptance: ${item.id}`
      ).not.toBe("");
      expect(validSurfaces).toContain(item.actionSurface);
      expect(validStatuses).toContain(item.status);

      const proof = consoleParityFunctionProof(item);
      expect(proof.mode.trim(), `empty proof mode: ${item.id}`).not.toBe("");
      expect(proof.input.trim(), `empty proof input: ${item.id}`).not.toBe("");
      expect(proof.inputKo.trim(), `empty KO proof input: ${item.id}`).not.toBe(
        ""
      );
      expect(proof.proof.trim(), `empty proof text: ${item.id}`).not.toBe("");
      expect(proof.proofKo.trim(), `empty KO proof text: ${item.id}`).not.toBe(
        ""
      );

      if (item.resourcePreset) {
        expect(item.evidenceView, `${item.id} cannot mix resource and evidence`).toBe(
          undefined
        );
        expect(
          ["resource-explorer", "ops-admin"],
          `${item.id} resource preset must be explorer-backed or admin evidence-backed`
        ).toContain(item.actionSurface);
        expect(
          item.resourcePreset.query.trim(),
          `empty resource query: ${item.id}`
        ).not.toBe("");
        expect(
          item.resourcePreset.preferredResources.length,
          `empty preferred resource list: ${item.id}`
        ).toBeGreaterThan(0);
        for (const resource of item.resourcePreset.preferredResources) {
          expect(resource, `malformed preferred resource: ${item.id}`).toMatch(
            /\S+\/\S+/
          );
        }
      }

      if (item.evidenceView) {
        expect(item.actionSurface, `${item.id} evidence view must use evidence surface`).toBe(
          "evidence"
        );
      }

      if (item.actionSurface === "assistant") {
        expect(item.targetSelector).toContain("assistant-launcher");
      }

      const signal = consoleParityFunctionSignal(item);
      expect(
        signal.selector.trim(),
        `empty function signal selector: ${item.id}`
      ).not.toBe("");
      expect(
        signal.description.trim(),
        `empty function signal description: ${item.id}`
      ).not.toBe("");
      expect(
        signal.descriptionKo.trim(),
        `empty KO function signal description: ${item.id}`
      ).not.toBe("");
    }

    expect(ids.size).toBe(ocpConsoleParityItems.length);
    for (const section of consoleParitySections) {
      expect(
        sectionsWithItems.has(section),
        `missing console parity section: ${section}`
      ).toBe(true);
    }
    expect(ocpConsoleParityItems.some((item) => item.resourcePreset)).toBe(true);
    expect(ocpConsoleParityItems.some((item) => item.evidenceView)).toBe(true);
    expect(
      ocpConsoleParityItems.some((item) => item.actionSurface === "assistant")
    ).toBe(true);
  }

async function waitForApiReady(page: Page) {
  await expect(page.getByTestId("api-status")).toContainText(
    /API (connected|연결됨)/,
    { timeout: 15_000 }
  );
}

async function waitForReadinessStatus(
  page: Page,
  expectedText: string
) {
  await expect(page.getByTestId("readiness-status")).toContainText(
    expectedText,
    { timeout: 15_000 }
  );
}

async function expectActiveConsoleAction(
  page: Page,
  itemId: string,
  label: string,
  surface: string,
  query?: string
) {
  const item = ocpConsoleParityItems.find((entry) => entry.id === itemId);
  if (!item) {
    throw new Error(`Unknown console parity item: ${itemId}`);
  }
  const proof = consoleParityFunctionProof(item);
  const signal = consoleParityFunctionSignal(item);
  const expectedOutcome = item.resourcePreset
    ? /^resource-(operating|empty|waiting|loading|missing|not-active)$/
    : item.evidenceView
      ? "evidence-view-active"
      : item.actionSurface === "assistant"
        ? "assistant-ready"
        : "target-mounted";

  await expect(page.getByTestId("console-active-action")).toHaveAttribute(
    "data-active-console-item",
    itemId
  );
  await expect(page.getByTestId("console-active-action")).toContainText(label);
  await expect(page.getByTestId("console-active-surface")).toContainText(surface);
  await expect(page.getByTestId("console-active-command")).toContainText(/\S/);
  await expect(page.getByTestId("console-active-acceptance")).toContainText(/\S/);
  await expect(page.getByTestId("console-active-target-status")).toHaveAttribute(
    "data-target-status",
    "mounted"
  );
  await expect(page.getByTestId("console-active-function-mode")).toHaveAttribute(
    "data-function-mode",
    proof.mode
  );
  await expect(page.getByTestId("console-active-action-outcome")).toHaveAttribute(
    "data-action-outcome",
    expectedOutcome
  );
  await expect(page.getByTestId("console-active-function-input")).toContainText(
    /\S/
  );
  await expect(page.getByTestId("console-active-action-proof")).toContainText(
    /\S/
  );
  await expect(page.getByTestId("console-active-function-signal")).toHaveAttribute(
    "data-function-signal-selector",
    signal.selector
  );
  await expect(page.getByTestId("console-active-function-signal")).toContainText(
    /\S/
  );
  await expect(page.locator(signal.selector)).toBeVisible({ timeout: 15_000 });

  if (query) {
    await expect(page.getByTestId("console-active-preset-query")).toContainText(
      query
    );
    await expect(page.getByTestId("console-active-preferred-resources")).toBeVisible();
  }

  if (query && item.actionSurface === "resource-explorer") {
    await expect(page.getByTestId("ocp-active-preset-query")).toContainText(
      query
    );
    await expect(page.getByTestId("ocp-active-preset-resources")).toContainText(
      /\S/
    );
    await expect(page.getByTestId("ocp-function-smoke")).toBeVisible();
    await expect(page.getByTestId("ocp-smoke-function-outcome")).toHaveAttribute(
      "data-function-outcome",
      /^(operating|empty|waiting|loading|missing)$/,
      { timeout: 15_000 }
    );
    await expect
      .poll(
        async () => {
          const smokeOutcome = await page
            .getByTestId("ocp-smoke-function-outcome")
            .getAttribute("data-function-outcome");
          const actionResourceOutcome = await page
            .getByTestId("console-active-action-outcome")
            .getAttribute("data-resource-function-outcome");
          const actionOutcome = await page
            .getByTestId("console-active-action-outcome")
            .getAttribute("data-action-outcome");
          return `${smokeOutcome ?? ""}|${actionResourceOutcome ?? ""}|${actionOutcome ?? ""}`;
        },
        { timeout: 15_000 }
      )
      .toMatch(/^(operating|empty|waiting|loading|missing)\|\1\|resource-\1$/);

    const smokeOutcome = await page
      .getByTestId("ocp-smoke-function-outcome")
      .getAttribute("data-function-outcome");
    if (smokeOutcome === "missing") {
      await expect(page.getByTestId("ocp-smoke-preset-match")).toHaveAttribute(
        "data-preset-match",
        "missing",
        { timeout: 15_000 }
      );
      await expect(page.getByTestId("ocp-smoke-mutation-guard")).toContainText(
        "read-only"
      );
      await expect(page.getByTestId("ocp-smoke-mutation-guard")).toContainText(
        "no create/update/patch/delete"
      );
      return;
    }

    await expect(page.getByTestId("ocp-smoke-preset-match")).toHaveAttribute(
      "data-preset-match",
      "matched",
      { timeout: 15_000 }
    );
    await expect(page.getByTestId("ocp-smoke-preset-match")).toContainText(
      /\S+\/\S+/
    );
    await expect(page.getByTestId("ocp-smoke-selected-api")).toContainText(
      /.+\s+[^/\s]+\/\S+/,
      { timeout: 15_000 }
    );
    await expect(page.getByTestId("ocp-smoke-list-status")).toHaveAttribute(
      "data-smoke-state",
      "ready",
      { timeout: 15_000 }
    );
    await expect(page.getByTestId("ocp-smoke-list-status")).toContainText(
      /items/
    );
    await expect(page.getByTestId("ocp-smoke-detail-status")).toHaveAttribute(
      "data-smoke-state",
      /^(ready|empty|pending)$/
    );
    await expect(page.getByTestId("ocp-smoke-events-status")).toHaveAttribute(
      "data-smoke-state",
      /^(ready|empty|pending)$/
    );
    await expect(page.getByTestId("ocp-smoke-logs-status")).toHaveAttribute(
      "data-smoke-state",
      /^(ready|empty|pending|not-applicable)$/
    );
    await expect(page.getByTestId("ocp-smoke-related-status")).toHaveAttribute(
      "data-smoke-state",
      /^(ready|empty|pending)$/
    );
    await expect(page.getByTestId("ocp-smoke-mutation-guard")).toContainText(
      "read-only"
    );
    await expect(page.getByTestId("ocp-smoke-mutation-guard")).toContainText(
      "no create/update/patch/delete"
    );
  }
}

async function expectConsoleFunctionEffect(
  page: Page,
  item: ConsoleParityItem,
  expectAssistantOpen = true
) {
  if (item.evidenceView) {
    await expect(
      page.getByTestId(`evidence-view-${item.evidenceView}`)
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(item.targetSelector)).toBeVisible();
  }

  if (item.actionSurface === "assistant" && expectAssistantOpen) {
    await expect(page.getByTestId("assistant-launcher")).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    await expect(page.getByTestId("assistant-popover")).toBeVisible();
    await closeAssistantIfOpen(page);
  }
}

  function configuredEndpointValuesForTest() {
    const values = new Set<string>();
    const common = new Set(["true", "false", "0", "1", "yes", "no"]);
    const localHost = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i;
    const endpointKey =
      /(?:OCP|OPENSHIFT|KUBE|KUBERNETES|LIGHTSPEED|CYWELL_OPSLENS).*?(?:URL|URI|HOST|HOSTNAME|SERVER|ENDPOINT|BASE_URL)/i;
    const add = (value?: string) => {
      const text = String(value ?? "").trim().replace(/^['"]|['"]$/g, "");
      if (text.length < 8 || common.has(text.toLowerCase())) return;
      try {
        const url = new URL(text);
        if (!localHost.test(url.hostname)) {
          values.add(text);
          values.add(url.hostname);
          values.add(url.host);
        }
        return;
      } catch {
        if (!localHost.test(text)) values.add(text);
      }
    };

    try {
      for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
        if (line.trim().startsWith("#")) continue;
        const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
        if (match && endpointKey.test(match[1])) add(match[2]);
      }
    } catch {
      // Test environments do not always provide a local .env file.
    }
    for (const [key, value] of Object.entries(process.env)) {
      if (endpointKey.test(key)) add(value);
    }
    return [...values].sort((left, right) => right.length - left.length);
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
      const visibleBox = {
        left: Math.max(box?.left ?? 0, layout.wrap?.left ?? 0),
        right: Math.min(box?.right ?? 0, layout.wrap?.right ?? 0),
        top: Math.max(box?.top ?? 0, layout.wrap?.top ?? 0),
        bottom: Math.min(box?.bottom ?? 0, layout.wrap?.bottom ?? 0)
      };
      const overlapsPopover =
        visibleBox.right > (layout.popover?.left ?? 0) &&
        visibleBox.left < (layout.popover?.right ?? 0) &&
        visibleBox.bottom > (layout.popover?.top ?? 0) &&
        visibleBox.top < (layout.popover?.bottom ?? 0);
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
    const launcherStyle = await page
      .getByTestId("assistant-launcher")
      .evaluate((node) => {
        const style = window.getComputedStyle(node);
        return {
          backgroundColor: style.backgroundColor,
          borderTopWidth: style.borderTopWidth,
          boxShadow: style.boxShadow
        };
      });
    const launcherIconStyle = await page
      .getByTestId("assistant-launcher-icon")
      .evaluate((node) => {
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return {
          objectFit: style.objectFit,
          width: rect.width,
          height: rect.height
        };
      });

    expect(launcherStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(launcherStyle.borderTopWidth).toBe("0px");
    expect(launcherStyle.boxShadow).toBe("none");
    expect(launcherIconStyle.objectFit).toBe("contain");
    expect(launcherIconStyle.width).toBeGreaterThan(48);
    expect(launcherIconStyle.height).toBeGreaterThan(48);

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

  test("AC-UI-002b lets operators unpin and move the assistant", async ({
    page
  }) => {
    await openAssistant(page);
    await expect(page.getByTestId("assistant-placement-status")).toContainText(
      "pinned"
    );

    await page.getByTestId("assistant-placement-toggle").click();
    await expect(page.getByTestId("assistant-placement-status")).toContainText(
      "movable"
    );
    await expect(page.getByTestId("assistant-popover")).toHaveClass(/floating/);

    const before = await page.getByTestId("assistant-popover").boundingBox();
    expect(before).not.toBeNull();
    await page.getByTestId("assistant-placement-move").click();

    await expect
      .poll(async () => {
        const after = await page.getByTestId("assistant-popover").boundingBox();
        return (
          Math.abs((after?.x ?? 0) - (before?.x ?? 0)) +
          Math.abs((after?.y ?? 0) - (before?.y ?? 0))
        );
      })
      .toBeGreaterThan(40);

    const dragBefore = await page.getByTestId("assistant-popover").boundingBox();
    const handle = await page.getByTestId("assistant-drag-handle").boundingBox();
    expect(dragBefore).not.toBeNull();
    expect(handle).not.toBeNull();

    await page.mouse.move((handle?.x ?? 0) + 80, (handle?.y ?? 0) + 24);
    await page.mouse.down();
    await page.mouse.move((handle?.x ?? 0) + 170, (handle?.y ?? 0) + 84, {
      steps: 6
    });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const dragAfter = await page.getByTestId("assistant-popover").boundingBox();
        return (
          Math.abs((dragAfter?.x ?? 0) - (dragBefore?.x ?? 0)) +
          Math.abs((dragAfter?.y ?? 0) - (dragBefore?.y ?? 0))
        );
      })
      .toBeGreaterThan(40);

    await page.getByTestId("assistant-placement-toggle").click();
    await expect(page.getByTestId("assistant-placement-status")).toContainText(
      "pinned"
    );
    await expect(page.getByTestId("assistant-popover")).toHaveClass(/pinned/);
  });

  test("AC-UI-003 makes every console navigation item actionable", async ({
    page
  }) => {
    test.setTimeout(240_000);
    const feedback = page.getByTestId("console-navigation-feedback");

    await openConsoleNavItem(page, "favorites");
    await expect(page.getByTestId("console-parity-matrix")).toBeVisible();
    await expect(page.getByTestId("console-parity-summary")).toContainText(
      "OpenShift Local 4.21.14"
    );

    for (const item of ocpConsoleParityItems) {
      await openConsoleNavItem(page, item);
      await expect(feedback).toContainText(item.label);
      await expectActiveConsoleAction(
        page,
        item.id,
        item.label,
        surfaceLabelsForTest[item.actionSurface],
        item.resourcePreset?.query
      );
      await expect(
        page.locator("[data-testid^='active-surface-']")
      ).toHaveCount(1);
      await expect(page.locator(item.targetSelector)).toBeVisible();
      await expectConsoleFunctionEffect(page, item);
      if (item.evidenceView) {
        const alternateView = item.evidenceView === "alerts" ? "logs" : "alerts";
        await page.getByTestId(`evidence-view-${alternateView}`).click();
        await expect(
          page.getByTestId(`evidence-view-${alternateView}`)
        ).toHaveAttribute("aria-pressed", "true");
      }
      if (item.actionSurface === "assistant") {
        await closeAssistantIfOpen(page);
      }
      if (item.resourcePreset) {
        if (item.actionSurface === "resource-explorer") {
          await page.getByTestId("ocp-resource-search").fill("manual-drift");
          await expect(page.getByTestId("ocp-resource-search")).toHaveValue(
            "manual-drift"
          );
        }
      }
      await page.getByTestId("console-active-open-surface").click();
      await expect(page.getByTestId("console-active-target-status")).toHaveAttribute(
        "data-target-status",
        "mounted"
      );
      await expect(page.locator(item.targetSelector)).toBeVisible();
      await expectConsoleFunctionEffect(page, item);

      if (item.resourcePreset) {
        if (item.actionSurface === "resource-explorer") {
          await expect(page.getByTestId("ocp-resource-search")).toHaveValue(
            item.resourcePreset.query
          );
        }
      }
    }

    await openConsoleNavItem(page, "workloads");
    await page.getByTestId("console-active-open-surface").click();
    await expect(page.getByTestId("ocp-active-preset-query")).toContainText(
      "pods"
    );
    await expect(page.getByTestId("ocp-workload-native-actions")).toBeVisible();
    await expect(page.getByTestId("ocp-workload-native-object-link")).toBeVisible();
    await expect(page.getByTestId("ocp-workload-yaml-action")).toBeVisible();
    await expect(page.getByTestId("ocp-workload-events-action")).toBeVisible();
    await expect(page.getByTestId("ocp-workload-logs-action")).toBeVisible();
    await expect(page.getByTestId("ocp-workload-related-action")).toBeVisible();
    await page.getByTestId("ocp-workload-yaml-action").click();
    await expect(page.getByTestId("ocp-detail-yaml-tab")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await page.getByTestId("ocp-workload-events-action").click();
    await expect(page.getByTestId("ocp-resource-events")).toBeVisible();
    await page.getByTestId("ocp-workload-related-action").click();
    await expect(page.getByTestId("ocp-related-resources")).toBeVisible();
    await page.getByTestId("console-active-ask-assistant").click();
    await expect(page.getByTestId("assistant-popover")).toBeVisible();
    await expect(page.getByTestId("assistant-draft")).toHaveValue(/Pods/);
    await page.getByTestId("assistant-close").click();
  });

  test("AC-UI-009 opens KOMSCO assistant for every version-pinned console item", async ({
    page
  }) => {
    test.setTimeout(180_000);

    await openConsoleNavItem(page, "favorites");
    await expect(page.getByTestId("console-parity-summary")).toContainText(
      "OpenShift Local 4.21.14"
    );

    for (const item of ocpConsoleParityItems) {
      const proof = consoleParityFunctionProof(item);
      await openConsoleNavItem(page, item);
      await closeAssistantIfOpen(page);
      await expect(page.getByTestId("console-active-action")).toHaveAttribute(
        "data-active-console-item",
        item.id
      );
      await page.getByTestId("console-active-ask-assistant").click();
      await expect(page.getByTestId("assistant-popover")).toBeVisible();
      await expect(page.getByTestId("assistant-draft")).toHaveValue(
        new RegExp(escapeForRegExp(item.label))
      );
      await expect(page.getByTestId("assistant-draft")).toHaveValue(
        new RegExp(escapeForRegExp(item.command))
      );
      await expect(page.getByTestId("assistant-draft")).toHaveValue(
        new RegExp(escapeForRegExp(item.originalPath))
      );
      await expect(page.getByTestId("assistant-draft")).toHaveValue(
        new RegExp(escapeForRegExp(proof.mode))
      );
      await expect(page.getByTestId("assistant-draft")).toHaveValue(
        new RegExp(escapeForRegExp(proof.input))
      );
      await expect(page.getByTestId("assistant-draft")).toHaveValue(
        new RegExp(escapeForRegExp(proof.proof))
      );
      await expect(page.getByTestId("assistant-draft")).toHaveValue(
        /read-only mode/
      );
      await expect(page.getByTestId("assistant-draft")).toHaveValue(
        /do not propose cluster mutation commands/
      );
      await page.getByTestId("assistant-close").click();
      await expect(page.getByTestId("assistant-popover")).toHaveCount(0);
    }
  });

  test("AC-UI-008 renders function proof for every version-pinned console item", async ({
    page
  }) => {
    test.setTimeout(180_000);
    await openConsoleNavItem(page, "favorites");
    await expect(page.getByTestId("console-parity-summary")).toContainText(
      `${ocpConsoleParityItems.length}`
    );

    for (const item of ocpConsoleParityItems) {
      const proof = consoleParityFunctionProof(item);
      const row = page.getByTestId(`console-parity-row-${item.id}`);
      const proofCell = page.getByTestId(`console-parity-function-${item.id}`);

      await expect(row).toHaveCount(1);
      await expect(proofCell).toHaveAttribute("data-function-mode", proof.mode);
      await expect(proofCell).toContainText(proof.input);
      await expect(proofCell).toContainText(proof.proof);
      await openConsoleNavItem(page, item);
      await expectActiveConsoleAction(
        page,
        item.id,
        item.label,
        surfaceLabelsForTest[item.actionSurface],
        item.resourcePreset?.query
      );
      await expect(page.getByTestId("console-active-function-input")).toContainText(
        proof.input
      );
      await expect(page.getByTestId("console-active-action-proof")).toContainText(
        proof.proof
      );
      await expectConsoleFunctionEffect(page, item);
      await closeAssistantIfOpen(page);
      await openConsoleNavItem(page, "favorites");
    }
  });

  test("AC-UI-010 keeps the version-pinned console registry internally valid", async () => {
    expectConsoleParityRegistryIntegrity();
  });

  test("AC-UI-006 makes Korean console navigation actionable", async ({
    page
  }) => {
    test.setTimeout(180_000);
    const feedback = page.getByTestId("console-navigation-feedback");

    await switchLanguage(page, "ko");
    await openConsoleNavItem(page, "favorites");
    await expect(page.getByTestId("console-parity-matrix")).toContainText(
      "OCP 4.21.14 콘솔 커버리지"
    );
    await expect(page.getByTestId("console-parity-summary")).toContainText(
      "원본 콘솔 항목"
    );

    for (const item of ocpConsoleParityItems) {
      const proof = consoleParityFunctionProof(item);
      await openConsoleNavItem(page, item);
      await expect(feedback).toContainText(item.labelKo);
      await expect(page.getByTestId("console-active-action")).toHaveAttribute(
        "data-active-console-item",
        item.id
      );
      await expect(page.getByTestId("console-active-action")).toContainText(
        item.labelKo
      );
      await expect(page.getByTestId("console-active-target-status")).toHaveAttribute(
        "data-target-status",
        "mounted"
      );
      await expect(page.getByTestId("console-active-function-input")).toContainText(
        proof.inputKo
      );
      await expect(page.getByTestId("console-active-action-proof")).toContainText(
        proof.proofKo
      );
      await expect(page.locator(item.targetSelector)).toBeVisible();
      await expectConsoleFunctionEffect(page, item);

      if (item.resourcePreset) {
        if (item.actionSurface === "resource-explorer") {
          await expect(page.getByTestId("ocp-resource-search")).toHaveValue(
            item.resourcePreset.query
          );
        }
      }

      await closeAssistantIfOpen(page);
      await page.getByTestId("console-active-ask-assistant").click();
      await expect(page.getByTestId("assistant-popover")).toBeVisible();
      await expect(page.getByTestId("assistant-draft")).toHaveValue(
        new RegExp(escapeForRegExp(item.labelKo))
      );
      await expect(page.getByTestId("assistant-draft")).toHaveValue(
        new RegExp(escapeForRegExp(item.commandKo))
      );
      await expect(page.getByTestId("assistant-draft")).toHaveValue(
        new RegExp(escapeForRegExp(item.originalPathKo))
      );
      await expect(page.getByTestId("assistant-draft")).toHaveValue(
        new RegExp(escapeForRegExp(proof.mode))
      );
      await expect(page.getByTestId("assistant-draft")).toHaveValue(
        new RegExp(escapeForRegExp(proof.inputKo))
      );
      await expect(page.getByTestId("assistant-draft")).toHaveValue(
        new RegExp(escapeForRegExp(proof.proofKo))
      );
      await expect(page.getByTestId("assistant-draft")).toHaveValue(/읽기 전용/);
      await expect(page.getByTestId("assistant-draft")).toHaveValue(
        /클러스터 변경 명령/
      );
      await page.getByTestId("assistant-close").click();
      await expect(page.getByTestId("assistant-popover")).toHaveCount(0);
    }
  });

  test("AC-LIVE-001 shows live OpsLens install state separately from demo data", async ({
    page
  }) => {
    await switchLanguage(page, "ko");
    await expect(page.getByTestId("opslens-live-install-status")).toBeVisible();
    await expect(page.getByTestId("opslens-live-install-status")).toContainText(
      "CRC 실시간 설치 신호"
    );
    await expect(page.getByTestId("opslens-live-install-ocp")).toContainText(
      /OCP (API 실시간|확인 필요)/
    );
    await expect(page.getByTestId("opslens-live-install-boundary")).toContainText(
      "읽기 전용"
    );
    await expect(page.getByTestId("opslens-live-install-cr")).toContainText(
      "설치 객체"
    );
    await expect(page.getByTestId("opslens-live-install-workloads")).toContainText(
      "워크로드"
    );
    await expect(page.getByTestId("opslens-live-install-pods")).toContainText(
      "파드"
    );
    await expect(page.getByTestId("opslens-live-install-route")).toContainText(
      /Route (없음|있음)|확인 중/
    );
    await expect(page.getByTestId("opslens-live-install-source")).toContainText(
      "출처: 실시간 OCP 리소스 API"
    );
    await expect(page.getByTestId("dashboard-data-source")).toContainText(
      /데모 데이터|실데이터/
    );

    await switchLanguage(page, "en");
    await expect(page.getByTestId("opslens-live-install-status")).toContainText(
      "Live CRC install signal"
    );
    await expect(page.getByTestId("opslens-live-install-source")).toContainText(
      "source: live OCP resource API"
    );
  });

  test("AC-UI-004 keeps KO/EN switching consistent and customer masthead stays compact", async ({
    page
  }) => {
    test.setTimeout(60_000);
    await switchLanguage(page, "ko");
    await expect(page.getByTestId("masthead-user-menu")).toContainText(
      "kubeadmin"
    );
    await expect(page.getByTestId("console-mode-toggle")).toHaveCount(0);
    await expect(page.getByTestId("console-mode-native")).toHaveCount(0);
    await expect(page.getByTestId("console-mode-opslens")).toHaveCount(0);
    await waitForApiReady(page);
    await expect(
      page.locator("[data-testid='masthead'] [data-testid='runtime-surface']")
    ).toHaveCount(0);
    await expect(
      page.locator("[data-testid='masthead'] [data-testid='api-route-mode']")
    ).toHaveCount(0);
    await expect(
      page.locator("[data-testid='masthead'] [data-testid='console-plugin-scope']")
    ).toHaveCount(0);
    await expect(
      page.locator("[data-testid='masthead'] [data-testid='install-flow-strip']")
    ).toHaveCount(0);
    await expect(
      page.locator("[data-testid='masthead'] [data-testid='mod-boundary-strip']")
    ).toHaveCount(0);
    await expect(
      page.locator("[data-testid='masthead'] [data-testid='apply-signal-strip']")
    ).toHaveCount(0);
    await expect(page.getByTestId("opslens-status-details")).toHaveCount(0);
    await expect(page.getByTestId("opslens-readiness-command-strip")).toHaveCount(0);
    await openConsoleNavItem(page, "opslens-admin");
    await expect(page.getByTestId("active-surface-ops-admin")).toBeVisible();
    await expect(page.getByTestId("opslens-readiness-command-strip")).toBeVisible();
    await waitForReadinessStatus(page, "근거 필요");
    await expect(page.getByTestId("readiness-passed")).toContainText(
      "통과 요건"
    );
    await expect(page.getByTestId("readiness-remaining")).toContainText(
      "남은 항목"
    );
    await expect(page.getByTestId("readiness-next-gate")).toContainText(
      "다음 게이트"
    );
    await expect(page.getByTestId("readiness-next-command")).toContainText(
      "다음 점검"
    );
    const localizedNavigation = [
      ["overview", "개요", "Overview"],
      ["search", "검색", "Search"],
      ["events", "이벤트", "Events"],
      ["favorites", "고정 메뉴", "Pinned navigation"],
      ["software-catalog", "소프트웨어 카탈로그", "Software Catalog"],
      ["operatorhub", "Operator 카탈로그", "Operator catalog"],
      ["installed-operators", "설치된 Operator", "Installed Operators"],
      ["helm", "Helm", "Helm"],
      ["alerting", "경고", "Alerting"],
      ["dashboards", "대시보드", "Dashboards"],
      ["metrics", "메트릭", "Metrics"],
      ["logs", "로그", "Logs"],
      ["topology", "토폴로지", "Topology"],
      ["workloads", "파드", "Pods"],
      ["deployments", "배포", "Deployments"],
      ["deployment-configs", "배포 설정", "Deployment Configs"],
      ["statefulsets", "상태 저장 세트", "StatefulSets"],
      ["secrets", "시크릿", "Secrets"],
      ["configmaps", "구성 맵", "ConfigMaps"],
      ["cronjobs", "CronJobs", "CronJobs"],
      ["jobs", "작업", "Jobs"],
      ["daemonsets", "데몬 세트", "DaemonSets"],
      ["replicasets", "복제 세트", "ReplicaSets"],
      ["replicationcontrollers", "복제 컨트롤러", "ReplicationControllers"],
      ["horizontalpodautoscalers", "HorizontalPodAutoscalers", "HorizontalPodAutoscalers"],
      ["poddisruptionbudgets", "PodDisruptionBudgets", "PodDisruptionBudgets"],
      ["networking", "라우트, 서비스, 인그레스", "Routes, Services, Ingresses"],
      ["network-policies", "네트워크 정책", "NetworkPolicies"],
      ["storage", "PVC, PV, StorageClass", "PVCs, PVs, StorageClasses"],
      ["builds", "빌드와 이미지 스트림", "Builds and ImageStreams"],
      ["compute", "노드와 머신", "Nodes and Machines"],
      ["user-management", "사용자, 그룹, 역할", "Users, Groups, Roles"],
      ["administration", "클러스터 설정", "Cluster Settings"],
      ["namespaces-crds", "네임스페이스와 CRD", "Namespaces and CRDs"],
      ["opslens-admin", "OpsLens 관리", "OpsLens Admin"],
      ["opsbrain", "OpsBrain", "OpsBrain"],
      ["komsco-assistant", "KOMSCO AI 어시스턴트", "KOMSCO AI Assistant"]
    ] as const;
    const localizedSections = [
      ["home", "홈", "Home"],
      ["favorites", "즐겨찾기", "Favorites"],
      ["ecosystem", "에코시스템", "Ecosystem"],
      ["workloads", "워크로드", "Workloads"],
      ["networking", "네트워킹", "Networking"],
      ["storage", "스토리지", "Storage"],
      ["builds", "빌드", "Builds"],
      ["monitoring", "모니터링", "Monitoring"],
      ["compute", "컴퓨트", "Compute"],
      ["user-management", "사용자 관리", "User Management"],
      ["administration", "관리", "Administration"],
      ["cywell", "Cywell", "Cywell"]
    ] as const;

    for (const [section, koLabel] of localizedSections) {
      await expect(page.getByTestId(`console-nav-section-${section}`)).toContainText(
        koLabel
      );
    }
    for (const [navId, koLabel] of localizedNavigation) {
      await expect(page.getByTestId(`console-nav-${navId}`)).toContainText(
        koLabel
      );
    }
    await openConsoleNavItem(page, "alerting");
    await expect(page.getByTestId("console-breadcrumb")).toContainText("모니터링");
    await expect(page.getByTestId("console-breadcrumb")).toContainText("경고");
    await expect(page.getByTestId("console-navigation-feedback")).toContainText(
      "경고"
    );

    await openAssistant(page);
    await expect(page.getByTestId("assistant-popover")).toContainText(
      "KOMSCO AI 어시스턴트"
    );
    await expect(page.getByTestId("assistant-connection-summary")).toContainText(
      "연결 판정"
    );
    await expect(page.getByTestId("assistant-integration-contract")).toContainText(
      "연동 계약"
    );
    await expect(page.getByTestId("assistant-integration-standalone")).toContainText(
      "CRC 검증 화면"
    );
    await expect(page.getByTestId("assistant-integration-console")).toContainText(
      "설치된 ConsolePlugin은 사용자 토큰 프록시"
    );
    await expect(page.getByTestId("assistant-integration-lightspeed")).toContainText(
      "OpenShift Lightspeed /v1/streaming_query"
    );
    await expect(page.getByTestId("assistant-execution-enter")).toContainText(
      "Enter는 KOMSCO AI 어시스턴트에 질문"
    );
    await expect(page.getByTestId("assistant-execution-fallback")).toContainText(
      "Lightspeed"
    );
    await expect(page.getByTestId("assistant-execution-newline")).toContainText(
      "Shift+Enter는 줄바꿈"
    );
    await expect(page.getByTestId("assistant-mode-matrix")).toContainText(
      "답변 출처"
    );
    await expect(page.getByTestId("assistant-mode-matrix")).toContainText(
      "클러스터 변경"
    );
    await expect(page.getByTestId("assistant-mutation-boundary")).toContainText(
      "실행 안 함"
    );
    await expect(page.getByTestId("assistant-connection-smoke")).toContainText(
      "연결 스모크"
    );
    await expect(page.getByTestId("assistant-smoke-context-sync")).toContainText(
      "컨텍스트 동기화"
    );
    await expect(page.getByTestId("assistant-smoke-action-plan")).toContainText(
      "액션 플랜 API"
    );
    await expect(
      page.getByTestId("assistant-smoke-mutation-boundary")
    ).toContainText("클러스터 변경");
    await expect(page.getByLabel("KOMSCO AI 어시스턴트에 질문")).toBeVisible();
    await expect(page.getByTestId("assistant-ask-button")).toContainText("질문");
    await expect(page.getByTestId("assistant-launcher")).toHaveAttribute(
      "title",
      "KOMSCO AI 어시스턴트"
    );

    await switchLanguage(page, "en");
    await openConsoleNavItem(page, "opslens-admin");
    await expect(page.getByTestId("active-surface-ops-admin")).toBeVisible();
    await expect(page.getByTestId("opslens-status-details")).toHaveCount(0);
    await expect(page.getByTestId("opslens-readiness-command-strip")).toBeVisible();
    await expect(page.getByTestId("opslens-live-install-status")).toContainText(
      "Live CRC install signal"
    );
    await expect(page.getByTestId("opslens-live-install-source")).toContainText(
      "source: live OCP resource API"
    );
    await waitForReadinessStatus(page, "needs evidence");
    await expect(page.getByTestId("readiness-passed")).toContainText(
      "passed requirements"
    );
    await expect(page.getByTestId("readiness-remaining")).toContainText(
      "remaining items"
    );
    await expect(page.getByTestId("readiness-next-gate")).toContainText(
      "next gate"
    );
    await expect(page.getByTestId("readiness-next-command")).toContainText(
      "next check"
    );
    for (const [section, , enLabel] of localizedSections) {
      await expect(page.getByTestId(`console-nav-section-${section}`)).toContainText(
        enLabel
      );
    }
    for (const [navId, , enLabel] of localizedNavigation) {
      await expect(page.getByTestId(`console-nav-${navId}`)).toContainText(
        enLabel
      );
    }
    await openConsoleNavItem(page, "alerting");
    await expect(page.getByTestId("console-breadcrumb")).toContainText("Monitoring");
    await expect(page.getByTestId("console-breadcrumb")).toContainText("Alerting");
    await expect(page.getByTestId("console-navigation-feedback")).toContainText(
      "Alerting"
    );
    await expect(page.getByTestId("assistant-integration-contract")).toContainText(
      "Integration contract"
    );
    await expect(page.getByTestId("assistant-integration-standalone")).toContainText(
      "CRC validation shell"
    );
    await expect(page.getByTestId("assistant-integration-console")).toContainText(
      "Installed ConsolePlugin uses the UserToken proxy"
    );
    await expect(page.getByTestId("assistant-integration-lightspeed")).toContainText(
      "OpenShift Lightspeed /v1/streaming_query"
    );
    await expect(page.getByTestId("assistant-execution-enter")).toContainText(
      "Enter asks KOMSCO AI Assistant"
    );
    await expect(page.getByTestId("assistant-execution-fallback")).toContainText(
      "Lightspeed"
    );
    await expect(page.getByTestId("assistant-execution-newline")).toContainText(
      "Shift+Enter adds a line"
    );
    if ((await page.getByTestId("assistant-popover").count()) === 0) {
      await openAssistant(page);
    }
    await expect(page.getByTestId("assistant-popover")).toBeVisible();
    await expect(page.getByTestId("assistant-answer-source")).toContainText(
      /OpenShift Lightspeed \/v1\/query|Lightspeed connection required|Lightspeed 연결 필요/
    );
    await expect(page.getByTestId("assistant-mutation-boundary")).toContainText(
      "not executed"
    );
    await expect(page.getByTestId("assistant-connection-smoke")).toContainText(
      "Connection smoke"
    );
    await expect(page.getByTestId("assistant-smoke-context-sync")).toContainText(
      "context sync"
    );
    await expect(page.getByTestId("assistant-smoke-action-plan")).toContainText(
      "action plan API"
    );
    await expect(
      page.getByTestId("assistant-smoke-mutation-boundary")
    ).toContainText("cluster mutation");
    await expect(page.getByLabel("Ask KOMSCO AI Assistant")).toBeVisible();
    await expect(page.getByTestId("assistant-ask-button")).toContainText("Ask");
    await expect(page.getByTestId("assistant-launcher")).toHaveAttribute(
      "title",
      "KOMSCO AI Assistant"
    );
  });

  test("AC-UI-005 makes masthead utilities and evidence actions clickable", async ({
    page
  }) => {
    const feedback = page.getByTestId("console-navigation-feedback");
    const frame = page.locator(".console-frame");

    await openConsoleNavItem(page, "workloads");
    await expect(page.getByTestId("console-nav-workloads")).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(page.getByTestId("active-page-workloads")).toBeVisible();

    await page.getByTestId("nav-collapse-toggle").click();
    await expect(frame).toHaveClass(/nav-collapsed/);
    await page.getByTestId("nav-collapse-toggle").click();
    await expect(frame).not.toHaveClass(/nav-collapsed/);
    await expect(page.getByTestId("console-nav-workloads")).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(page.getByTestId("active-page-workloads")).toBeVisible();

    await page.getByTestId("masthead-app-launcher").click();
    await expect(feedback).toContainText("Application launcher focused");

    await page.getByTestId("masthead-notifications").click();
    await expect(feedback).toContainText("Notifications focused");

    await page.getByTestId("masthead-create").click();
    await expect(feedback).toContainText("Create opened a plan-only workflow");
    await expect(page.getByTestId("assistant-popover")).toBeVisible();
    await page.getByTestId("assistant-close").click();
    await expect(page.getByTestId("assistant-popover")).toHaveCount(0);

    await page.getByTestId("masthead-help").click();
    await expect(feedback).toContainText("Help opened the KOMSCO AI Assistant");
    await expect(page.getByTestId("assistant-popover")).toBeVisible();
    await page.getByTestId("assistant-close").click();

    await openConsoleNavItem(page, "alerting");
    await expect(page.getByTestId("alert-table-wrap")).toBeVisible();
    await page.getByTestId("evidence-view-logs").click();
    await expect(page.getByTestId("log-viewport")).toBeVisible();
    await page.getByTestId("evidence-ask-logs").click();
    await expect(page.getByTestId("assistant-popover")).toBeVisible();
    await page.getByTestId("assistant-close").click();

    await page.getByTestId("evidence-view-yaml").click();
    await expect(page.getByTestId("yaml-textarea")).toBeVisible();
    await page.getByTestId("evidence-ask-yaml").click();
    await expect(page.getByTestId("assistant-popover")).toBeVisible();
    await page.getByTestId("assistant-close").click();

    await page.getByTestId("evidence-view-alerts").click();
    await expect(page.getByTestId("alert-evidence-table")).toBeVisible();
    await page.getByTestId("evidence-ask-alerts").click();
    await expect(page.getByTestId("assistant-popover")).toBeVisible();
  });

  test("AC-UI-007 shows installed ConsolePlugin proxy mode distinctly", async ({
    page
  }) => {
    const pluginApiBase = "/api/proxy/plugin/cywell-opslens/opslens-api";
    await page.goto(
      `/?surface=console-plugin&apiBase=${encodeURIComponent(pluginApiBase)}`
    );

    await expect(page.getByTestId("console-context-primary")).toContainText(
      "OpenShift ConsolePlugin"
    );
    await expect(page.getByTestId("console-context-secondary")).toContainText(
      "UserToken proxy"
    );
    await expect(
      page.locator("[data-testid='masthead'] [data-testid='runtime-surface']")
    ).toHaveCount(0);
    await expect(page.getByTestId("opslens-status-details")).toHaveCount(0);

    await openAssistant(page);
    await expect(page.getByTestId("assistant-api-route-mode")).toContainText(
      "console-plugin-user-token-proxy"
    );
    await expect(page.getByTestId("assistant-action-plan-path")).toContainText(
      "/api/proxy/plugin/cywell-opslens/opslens-api/api/actions/plan"
    );
    await expect(page.getByTestId("assistant-token-path")).toContainText(
      "OpenShift UserToken proxy"
    );
    await expect(page.getByTestId("assistant-integration-console")).toContainText(
      "Installed ConsolePlugin uses the UserToken proxy"
    );
    await expect(page.getByTestId("assistant-connection-summary")).toContainText(
      "Chat remains read-only/plan-only"
    );

    await switchLanguage(page, "ko");
    await expect(page.getByTestId("console-context-primary")).toContainText(
      "OpenShift 콘솔 플러그인"
    );
    await expect(page.getByTestId("console-context-secondary")).toContainText(
      "사용자 토큰 프록시"
    );
    await expect(page.getByTestId("opslens-status-details")).toHaveCount(0);
    await expect(page.getByTestId("assistant-api-route-mode")).toContainText(
      "console-plugin-user-token-proxy"
    );
    await expect(page.getByTestId("assistant-token-path")).toContainText(
      "OpenShift 사용자 토큰 프록시"
    );
    await expect(page.getByTestId("assistant-integration-console")).toContainText(
      "설치된 ConsolePlugin은 사용자 토큰 프록시"
    );
    await expect(page.getByTestId("assistant-connection-summary")).toContainText(
      "읽기 전용/계획 전용"
    );
  });

  test("AC-CTX-001 renders context chips and publisher payload", async ({
    page
  }) => {
    await openAssistant(page);
    await waitForApiReady(page);
    await expect(page.getByTestId("assistant-connection-status")).toContainText(
      "API connected / plan-only"
    );
    await expect(page.getByTestId("context-chips")).toContainText("Cluster");
    await expect(page.getByTestId("context-chips")).toContainText(
      "CRC preview"
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
    await expect(page.getByTestId("assistant-smoke-context-sync")).toContainText(
      "ready"
    );
    await expect(page.getByTestId("assistant-smoke-action-plan")).toContainText(
      "ready"
    );
    await expect(
      page.getByTestId("assistant-smoke-mutation-boundary")
    ).toContainText("blocked");

    const assistantDraft = page.getByTestId("assistant-draft");
    const keyboardPrompt =
      "현재 화면 증거만 기반으로 다음 확인 계획을 다시 만들어줘.";
    await assistantDraft.fill(keyboardPrompt);
    await assistantDraft.press("Shift+Enter");
    await expect(assistantDraft).toHaveValue(`${keyboardPrompt}\n`);
    await assistantDraft.type("줄바꿈 보존 후 Enter 전송.");
    await expect(page.getByTestId("assistant-ask-button")).toBeEnabled();

    const planResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/actions/plan") &&
        response.request().method() === "POST"
    );
    await assistantDraft.press("Enter");
    await planResponse;
    await expect(page.getByTestId("api-trace")).toContainText(
      /openshift-lightspeed/
    );
    await expect(page.getByTestId("answer-judgment")).toContainText(
      keyboardPrompt
    );
    await expect(page.getByTestId("answer-citations")).toContainText(
      /runbook|문서|OpenShift/i
    );
  });

  test("AC-ANS-001 answer contract includes evidence, citations, risk, and rollback", async ({
    page
  }) => {
    await openAssistant(page);
    await expect(page.getByTestId("assistant-chat-turns")).toBeVisible();
    await page.getByTestId("assistant-answer-details").locator("summary").click();
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
        vectorStore: "pgvector",
        modelRuntime: "vllm"
      },
      retrievalAttempted: false,
      localFallbackUsed: true,
      citationsUsed: "local-fallback"
    });
    expect(askBody.audit?.runtimeRag?.missingEvidence?.join(" ")).toContain(
      "live Postgres/pgvector and vLLM retrieval was not requested"
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
    test.slow();

    await openConsoleNavItem(page, "dashboards");
    await expect(page.getByTestId("active-surface-ops-dashboard")).toBeVisible();
    await expect(page.getByTestId("opslens-incident-metrics")).toBeVisible();
    await expect(page.getByTestId("opslens-severity-distribution")).toContainText(
      /critical|warning|info|success/
    );
    await expect(page.getByTestId("opslens-exposure-trend")).toBeVisible();
    await expect(page.getByTestId("active-risk-list")).toBeVisible();

    await openConsoleNavItem(page, "opslens-admin");
    await expect(page.getByTestId("active-surface-ops-admin")).toBeVisible();
    await expect(page.locator("[data-testid^='active-surface-']")).toHaveCount(1);
    await expect(page.getByTestId("opslens-status-details")).toHaveCount(0);

    await expect(page.getByTestId("opslens-readiness-command-strip")).toBeVisible();
    await expect(page.getByTestId("opslens-readiness-command-strip")).toContainText(
      "100% Readiness"
    );
    await expect(page.getByTestId("opslens-install-readiness")).toContainText(
      "Install Readiness"
    );
    await expect(page.getByTestId("opslens-lab-readiness")).toContainText(
      "Dedicated CRC Lab Readiness"
    );
    await expect(page.getByTestId("opslens-certification-readiness")).toContainText(
      /certification readiness/i
    );
    await expect(page.getByTestId("opslens-release-publish-plan")).toContainText(
      /release publish/i
    );

    const response = await request.get("/api/opslens/admin/overview");
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as {
      installReadiness?: {
        completionGate?: {
          percentComplete?: number;
          remainingTo100?: unknown[];
        };
      };
    };

    expect(body.installReadiness?.completionGate?.percentComplete).toBeGreaterThan(0);
    expect(
      Array.isArray(body.installReadiness?.completionGate?.remainingTo100)
    ).toBe(true);
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
    expect(secret.ok()).toBe(true);
    const secretBody = (await secret.json()) as {
      items?: unknown[];
      failure?: { code?: string; statusCode?: number };
      redaction?: { fullSecretFetchBlocked?: boolean };
    };
    expect(secretBody.items).toEqual([]);
    expect(secretBody.failure?.code).toBe("resource-read-blocked");
    expect(secretBody.failure?.statusCode).toBe(403);
    expect(secretBody.redaction?.fullSecretFetchBlocked).toBe(true);

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
    await page.getByTestId("console-nav-search").click();
    await expect(page.getByTestId("active-page-search")).toBeVisible();
    await expect(page.getByTestId("ocp-status")).toContainText("OCP reachable", {
      timeout: 15_000
    });
    await page.getByTestId("ocp-technical-explorer").locator("summary").click();
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
    await expect(page.getByTestId("ocp-function-smoke")).toBeVisible();
    await expect(page.getByTestId("ocp-smoke-selected-api")).toContainText(
      "Pod v1/pods"
    );
    await expect(page.getByTestId("ocp-smoke-list-status")).toContainText(
      "items"
    );
    await expect(page.getByTestId("ocp-smoke-detail-status")).toContainText(
      firstPod?.metadata.name ?? ""
    );
    await expect(page.getByTestId("ocp-native-object-detail")).toBeVisible();
    await expect(page.getByTestId("ocp-native-object-detail-title")).toContainText(
      firstPod?.metadata.name ?? ""
    );
    await expect(page.getByTestId("ocp-native-detail-tabs")).toContainText(
      "Details"
    );
    await expect(page.getByTestId("ocp-native-object-details")).toContainText(
      "Identity"
    );
    await expect(page.getByTestId("ocp-native-object-details")).toContainText(
      "Health"
    );
    await expect(page.getByTestId("ocp-smoke-events-status")).toContainText(
      /events|RBAC/
    );
    await expect(page.getByTestId("ocp-smoke-logs-status")).toContainText(
      /log lines|RBAC|pending/
    );
    await expect(page.getByTestId("ocp-smoke-related-status")).toContainText(
      /owners|children/
    );
    await expect(page.getByTestId("ocp-smoke-mutation-guard")).toContainText(
      "no create/update/patch/delete"
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
      /events|Event|No events|Started|Pulled|Scheduled/
    );
    await expect(page.getByTestId("ocp-pod-logs")).not.toBeEmpty();
    await expect(page.getByTestId("ocp-next-page")).toBeEnabled();
    await page.getByTestId("ocp-next-page").click();
    await expect(page.getByTestId("ocp-page-controls")).toContainText("Page 2");
    await expect(page.getByTestId("ocp-prev-page")).toBeEnabled();
  });
});

import {
  consoleParityFunctionProof,
  ocpConsoleBaseline,
  ocpConsoleParityItems,
  parityCoverageSummary
} from "../consoleParity";
import type { UiLanguage } from "../i18n";

interface OcpConsoleParityMatrixProps {
  language: UiLanguage;
  activeItemId: string;
  onSelectItem: (itemId: string) => void;
}

const parityCopy = {
  en: {
    eyebrow: "Version-pinned parity contract",
    title: "OCP 4.21.14 Console Coverage",
    subtitle:
      "OpsLens keeps native OpenShift console functions visible, then adds evidence, RAG, and read-only assistant actions on top.",
    source: "source",
    minimumRuntime: "Minimum runtime",
    referenceInventory: "Reference inventory",
    compatibilityProof: "4.20 proof",
    nativeItems: "native console items",
    cywellAdditions: "Cywell additions",
    totalMapped: "mapped actions",
    resourcePreset: "resource presets",
    evidenceViews: "evidence views",
    directSurfaces: "direct surfaces",
    liveViews: "Live Views",
    nativeLinks: "Native Links",
    planOnly: "Plan-only",
    gaps: "Gaps",
    original: "Original console path",
    opsLens: "OpsLens action",
    enhancement: "OpsLens +@",
    functionProof: "Function proof",
    acceptance: "Acceptance",
    coverageClass: "Class",
    status: "Status",
    covered: "covered",
    nativeDeepLink: "native link",
    opsEnhanced: "Ops enhanced",
    readOnlyPlan: "read-only plan",
    select: "Open"
  },
  ko: {
    eyebrow: "버전 고정 parity 계약",
    title: "OCP 4.21.14 콘솔 커버리지",
    subtitle:
      "OpsLens는 원본 OpenShift 콘솔 기능을 숨기지 않고 유지한 뒤, 근거/RAG/읽기 전용 어시스턴트 행동을 위에 얹습니다.",
    source: "출처",
    minimumRuntime: "최소 실행 버전",
    referenceInventory: "기준 인벤토리",
    compatibilityProof: "4.20 검증",
    nativeItems: "원본 콘솔 항목",
    cywellAdditions: "Cywell 추가 항목",
    totalMapped: "매핑된 행동",
    resourcePreset: "리소스 프리셋",
    evidenceViews: "근거 보기",
    directSurfaces: "직접 화면",
    liveViews: "Live View",
    nativeLinks: "원본 링크",
    planOnly: "Plan-only",
    gaps: "Gap",
    original: "원본 콘솔 경로",
    opsLens: "OpsLens 행동",
    enhancement: "OpsLens +@",
    functionProof: "기능 증거",
    acceptance: "완료 조건",
    coverageClass: "분류",
    status: "상태",
    covered: "대응됨",
    nativeDeepLink: "원본 링크",
    opsEnhanced: "Ops 강화",
    readOnlyPlan: "읽기 전용 계획",
    select: "열기"
  }
} as const;

const statusLabels = {
  en: {
    covered: "covered",
    "native-deep-link": "native link",
    "ops-enhanced": "Ops enhanced",
    "read-only-plan": "read-only plan"
  },
  ko: {
    covered: "대응됨",
    "native-deep-link": "원본 링크",
    "ops-enhanced": "Ops 강화",
    "read-only-plan": "읽기 전용 계획"
  }
} as const;

const coverageClassLabels = {
  en: {
    "live-view": "Live View",
    "native-deep-link": "Native Deep Link",
    "plan-only": "Plan-only",
    gap: "Gap"
  },
  ko: {
    "live-view": "Live View",
    "native-deep-link": "Native Deep Link",
    "plan-only": "Plan-only",
    gap: "Gap"
  }
} as const;

export function OcpConsoleParityMatrix({
  language,
  activeItemId,
  onSelectItem
}: OcpConsoleParityMatrixProps) {
  const copy = parityCopy[language];
  const summary = parityCoverageSummary();

  return (
    <section
      className="console-parity-matrix"
      data-testid="console-parity-matrix"
      aria-labelledby="console-parity-title"
    >
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="console-parity-title">{copy.title}</h2>
          <p>{copy.subtitle}</p>
        </div>
      </div>

      <div className="parity-summary-grid" data-testid="console-parity-summary">
        <article>
          <strong>{summary.sourceVersion}</strong>
          <span>{ocpConsoleBaseline.ocpDocVersion}</span>
        </article>
        <article>
          <strong>{summary.nativeCount}</strong>
          <span>{copy.nativeItems}</span>
        </article>
        <article>
          <strong>{summary.cywellCount}</strong>
          <span>{copy.cywellAdditions}</span>
        </article>
        <article>
          <strong>{summary.coveredCount}/{summary.totalCount}</strong>
          <span>{copy.totalMapped}</span>
        </article>
        <article>
          <strong>{summary.resourcePresetCount}</strong>
          <span>{copy.resourcePreset}</span>
        </article>
        <article>
          <strong>{summary.evidenceViewCount}</strong>
          <span>{copy.evidenceViews}</span>
        </article>
        <article>
          <strong>{summary.directSurfaceCount}</strong>
          <span>{copy.directSurfaces}</span>
        </article>
        <article>
          <strong>{summary.liveViewCount}</strong>
          <span>{copy.liveViews}</span>
        </article>
        <article>
          <strong>{summary.nativeDeepLinkCount}</strong>
          <span>{copy.nativeLinks}</span>
        </article>
        <article>
          <strong>{summary.planOnlyCount}</strong>
          <span>{copy.planOnly}</span>
        </article>
        <article>
          <strong>{summary.gapCount}</strong>
          <span>{copy.gaps}</span>
        </article>
      </div>

      <div className="parity-source-row" data-testid="console-parity-sources">
        {ocpConsoleBaseline.sources.map((source) => (
          <a href={source.url} key={source.url} rel="noreferrer" target="_blank">
            {copy.source}: {source.label}
          </a>
        ))}
      </div>

      <div
        className="parity-compatibility-row"
        data-testid="console-compatibility-boundary"
      >
        <span>
          {copy.minimumRuntime}: {ocpConsoleBaseline.minimumRuntime}
        </span>
        <span>
          {copy.referenceInventory}: {ocpConsoleBaseline.crcVersion}
        </span>
        <span>
          {copy.compatibilityProof}: {ocpConsoleBaseline.compatibilityProof}
        </span>
      </div>

      <div className="parity-table-wrap">
        <table className="parity-table">
          <thead>
            <tr>
              <th>{copy.original}</th>
              <th>{copy.opsLens}</th>
              <th>{copy.enhancement}</th>
              <th>{copy.functionProof}</th>
              <th>{copy.acceptance}</th>
              <th>{copy.coverageClass}</th>
              <th>{copy.status}</th>
              <th><span className="sr-only">{copy.select}</span></th>
            </tr>
          </thead>
          <tbody>
            {ocpConsoleParityItems.map((item) => {
              const functionProof = consoleParityFunctionProof(item);
              return (
                <tr
                  className={activeItemId === item.id ? "active" : ""}
                  data-active-parity-item={
                    activeItemId === item.id ? "true" : "false"
                  }
                  data-testid={`console-parity-row-${item.id}`}
                  key={item.id}
                >
                  <td>
                    <strong>
                      {language === "ko" ? item.labelKo : item.label}
                    </strong>
                    <span>
                      {language === "ko"
                        ? item.originalPathKo
                        : item.originalPath}
                    </span>
                  </td>
                  <td>{language === "ko" ? item.commandKo : item.command}</td>
                  <td>
                    {language === "ko"
                      ? item.opsLensEnhancementKo
                      : item.opsLensEnhancement}
                  </td>
                  <td
                    className="parity-function-proof"
                    data-function-mode={functionProof.mode}
                    data-testid={`console-parity-function-${item.id}`}
                  >
                    <strong>
                      {language === "ko"
                        ? functionProof.inputKo
                        : functionProof.input}
                    </strong>
                    <span>
                      {language === "ko"
                        ? functionProof.proofKo
                        : functionProof.proof}
                    </span>
                  </td>
                  <td>
                    {language === "ko" ? item.acceptanceKo : item.acceptance}
                  </td>
                  <td>
                    <span
                      className={`status-pill coverage-${item.coverageClass}`}
                      data-testid={`console-parity-class-${item.id}`}
                    >
                      {coverageClassLabels[language][item.coverageClass]}
                    </span>
                  </td>
                  <td>
                    <span className={`status-pill parity-${item.status}`}>
                      {statusLabels[language][item.status]}
                    </span>
                  </td>
                  <td>
                    <button
                      className="text-icon-button parity-open-button"
                      data-testid={`console-parity-open-${item.id}`}
                      type="button"
                      onClick={() => onSelectItem(item.id)}
                    >
                      {copy.select}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

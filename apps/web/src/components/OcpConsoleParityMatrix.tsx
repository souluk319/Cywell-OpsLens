import {
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
    nativeItems: "native console items",
    cywellAdditions: "Cywell additions",
    totalMapped: "mapped actions",
    original: "Original console path",
    opsLens: "OpsLens action",
    enhancement: "OpsLens +@",
    acceptance: "Acceptance",
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
    nativeItems: "원본 콘솔 항목",
    cywellAdditions: "Cywell 추가 항목",
    totalMapped: "매핑된 행동",
    original: "원본 콘솔 경로",
    opsLens: "OpsLens 행동",
    enhancement: "OpsLens +@",
    acceptance: "완료 조건",
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
      </div>

      <div className="parity-source-row" data-testid="console-parity-sources">
        {ocpConsoleBaseline.sources.map((source) => (
          <a href={source.url} key={source.url} rel="noreferrer" target="_blank">
            {copy.source}: {source.label}
          </a>
        ))}
      </div>

      <div className="parity-table-wrap">
        <table className="parity-table">
          <thead>
            <tr>
              <th>{copy.original}</th>
              <th>{copy.opsLens}</th>
              <th>{copy.enhancement}</th>
              <th>{copy.acceptance}</th>
              <th>{copy.status}</th>
              <th><span className="sr-only">{copy.select}</span></th>
            </tr>
          </thead>
          <tbody>
            {ocpConsoleParityItems.map((item) => (
              <tr
                className={activeItemId === item.id ? "active" : ""}
                data-testid={`console-parity-row-${item.id}`}
                key={item.id}
              >
                <td>
                  <strong>
                    {language === "ko" ? item.labelKo : item.label}
                  </strong>
                  <span>
                    {language === "ko" ? item.originalPathKo : item.originalPath}
                  </span>
                </td>
                <td>{language === "ko" ? item.commandKo : item.command}</td>
                <td>
                  {language === "ko"
                    ? item.opsLensEnhancementKo
                    : item.opsLensEnhancement}
                </td>
                <td>
                  {language === "ko" ? item.acceptanceKo : item.acceptance}
                </td>
                <td>
                  <span className={`status-pill parity-${item.status}`}>
                    {statusLabels[language][item.status]}
                  </span>
                </td>
                <td>
                  <button
                    className="text-icon-button parity-open-button"
                    type="button"
                    onClick={() => onSelectItem(item.id)}
                  >
                    {copy.select}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

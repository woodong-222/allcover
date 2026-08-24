/**
 * 접었다 펼 수 있는 섹션 카드.
 *
 * 네이티브 `<details>`/`<summary>` 를 쓴다. `useState` + 조건부 렌더로 직접 만들면
 * 키보드 토글(Enter/Space)과 스크린리더 확장/축소 안내를 손으로 다시 구현해야 한다.
 *
 * 기본 삼각형 마커는 브라우저마다 모양이 달라 감추고 직접 그린 셰브론을 쓴다.
 *
 * `defaultOpen` 은 "렌더 시점에 펼칠지" 만 결정한다. 그 뒤로는 사용자가 누른 네이티브
 * open/close 상태를 React 가 되돌리지 않는다 — 이 계산값이 이전 렌더와 같으면 React 는
 * DOM 의 `open` 속성을 다시 쓰지 않기 때문이다.
 */

import type { ReactNode } from 'react';

export type CollapsibleSectionProps = {
  title: string;
  /** 제목 옆 요약. 접힌 상태에서도 내용이 있다는 걸 알 수 있어야 한다 */
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function CollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  return (
    <details open={defaultOpen} className="group rounded-xl border bg-white">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl p-4 [&::-webkit-details-marker]:hidden">
        <span className="flex items-baseline gap-1">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {summary !== undefined && (
            <span className="text-sm font-normal text-slate-500">{summary}</span>
          )}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          className="h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-90"
        >
          <path
            d="M7 5l6 5-6 5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

/**
 * 공유 / 이미지 저장 / 텍스트 복사 액션 바.
 *
 * 이 컴포넌트는 순수 프레젠테이션이다. 실제 shareImage/downloadBlob/copyText 호출과
 * 상태(캡처 blob, 진행 결과) 관리는 부모가 갖고, 이 컴포넌트는 onShare/onDownload/onCopyText
 * 콜백과 ready/outcome 상태만 props로 받는다.
 *
 * onShare 는 버튼 onClick 안에서 동기적으로 호출해야 한다. 부모가 onShare 안에서 await 없이
 * 곧바로 shareImage(blob, ...)를 시작해야 iOS Safari의 user-activation(사용자 제스처)이
 * 첫 await 지점(navigator.share)까지 유지된다. 이 컴포넌트는 onShare 를 감싸는 어떤 프라미스
 * 체인도 만들지 않는다 — 그냥 그대로 호출한다.
 */

import type { ShareOutcome } from '../lib/share';

export type ShareBarProps = {
  onShare: () => void;
  onDownload: () => void;
  onCopyText: () => void;
  /** 결과 화면 진입 시 미리 캡처해둔 PNG blob이 준비됐는지 여부 */
  ready: boolean;
  /** 가장 최근 공유 시도 결과. 아직 시도 전이면 undefined */
  outcome?: ShareOutcome;
};

const HIT_AREA = 'min-h-[44px] min-w-[44px]';

/** outcome -> 사용자에게 보여줄 문구. cancelled/undefined는 null — 취소는 에러가 아니다 */
function outcomeMessage(outcome: ShareOutcome | undefined): string | null {
  switch (outcome) {
    case 'shared':
      return '공유했어요';
    case 'downloaded':
      return '이미지를 저장했어요';
    case 'failed':
      return '공유에 실패했어요';
    case 'cancelled':
    default:
      return null;
  }
}

export function ShareBar({ onShare, onDownload, onCopyText, ready, outcome }: ShareBarProps) {
  const message = outcomeMessage(outcome) ?? (!ready ? '이미지 준비 중' : '');

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onShare}
          disabled={!ready}
          className={`${HIT_AREA} flex-1 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300`}
        >
          공유하기
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={!ready}
          className={`${HIT_AREA} flex-1 rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400`}
        >
          이미지 저장
        </button>
        <button
          type="button"
          onClick={onCopyText}
          className={`${HIT_AREA} flex-1 rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700`}
        >
          텍스트 복사
        </button>
      </div>

      <p role="status" aria-live="polite" className="min-h-[1.25rem] text-sm text-slate-600">
        {message}
      </p>
    </div>
  );
}

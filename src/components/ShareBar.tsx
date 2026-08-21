/**
 * 공유 / 이미지 저장 / 텍스트 복사 액션 바.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §3 인수조건 D1~D4, E2
 *
 * D1/R2: captureBlob 은 부모가 결과 화면 진입 시 이미 캡처해둔 blob 을 prop 으로 받는다.
 * handleShare 는 이 blob 을 그대로 shareImage 에 넘기며, 그 전에 await 하는 지점이 없어야
 * 클릭 시점의 user-activation(iOS Safari)이 navigator.share 호출까지 유지된다.
 *
 * 이 바는 캡처 대상이 아니므로(ResultCard 와 달리) 일반 Tailwind 색상 유틸을 그대로 쓴다.
 */

import { useState } from 'react';
import { copyText, downloadBlob, shareImage } from '../lib/share';

export type ShareBarProps = {
  /** 결과 화면 진입 시 미리 캡처해둔 PNG blob. 아직 준비 중이면 null */
  captureBlob: Blob | null;
  filename: string;
  shareTitle?: string;
  /** 카카오톡 등에 붙여넣을 텍스트 요약 (summaryText.ts 로 만든 결과) */
  summaryText: string;
};

type Status =
  | { kind: 'idle' }
  | { kind: 'shared' }
  | { kind: 'downloaded' }
  | { kind: 'copied' }
  | { kind: 'error'; message: string };

const HIT_AREA = 'min-h-[44px] min-w-[44px]';

export function ShareBar({ captureBlob, filename, shareTitle, summaryText }: ShareBarProps) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  function handleShare(): void {
    if (!captureBlob) return;
    // 여기서부터 첫 await 지점(navigator.share)까지 동기적으로 이어져야 한다 (D1/R2).
    shareImage(captureBlob, filename, shareTitle)
      .then((outcome) => {
        if (outcome === 'shared') setStatus({ kind: 'shared' });
        else if (outcome === 'downloaded') setStatus({ kind: 'downloaded' });
        else if (outcome === 'cancelled') setStatus({ kind: 'idle' }); // D4: 에러로 취급하지 않는다
        else setStatus({ kind: 'error', message: '공유에 실패했어요. 다시 시도해주세요.' });
      })
      .catch(() => setStatus({ kind: 'error', message: '공유에 실패했어요. 다시 시도해주세요.' }));
  }

  function handleSave(): void {
    if (!captureBlob) return;
    downloadBlob(captureBlob, filename);
    setStatus({ kind: 'downloaded' });
  }

  function handleCopy(): void {
    copyText(summaryText)
      .then((ok) => {
        setStatus(ok ? { kind: 'copied' } : { kind: 'error', message: '복사에 실패했어요.' });
      })
      .catch(() => setStatus({ kind: 'error', message: '복사에 실패했어요.' }));
  }

  const imageReady = captureBlob !== null;

  const statusMessage =
    status.kind === 'shared'
      ? '공유했습니다'
      : status.kind === 'downloaded'
        ? '다운로드했습니다'
        : status.kind === 'copied'
          ? '복사했습니다'
          : status.kind === 'error'
            ? status.message
            : !imageReady
              ? '이미지 준비 중…'
              : '';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleShare}
          disabled={!imageReady}
          className={`${HIT_AREA} flex-1 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300`}
        >
          공유하기
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!imageReady}
          className={`${HIT_AREA} flex-1 rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400`}
        >
          이미지 저장
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className={`${HIT_AREA} flex-1 rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700`}
        >
          텍스트 복사
        </button>
      </div>

      <p role="status" aria-live="polite" className="min-h-[1.25rem] text-sm text-slate-600">
        {!imageReady && '이미지 준비 중…'}
        {status.kind === 'shared' && '공유했습니다'}
        {status.kind === 'downloaded' && '다운로드했습니다'}
        {status.kind === 'copied' && '복사했습니다'}
        {status.kind === 'error' && status.message}
      </p>
    </div>
  );
}

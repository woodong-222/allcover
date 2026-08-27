/**
 * 결과 이미지 공유/다운로드/텍스트 복사.
 *
 * iOS Safari 는 `await` 를 한 번이라도 거치면 user-activation(사용자 제스처)이 소실되어
 * navigator.share 가 NotAllowedError 로 실패한다. 그래서 shareImage 는 blob 을 인자로 받고
 * 내부에서 캡처하지 않는다. 호출하는 쪽(공유 버튼 클릭 핸들러)이 미리 준비해둔 blob 을
 * 즉시 넘겨야 첫 await 지점(navigator.share 자체)까지 사용자 제스처가 살아있다.
 */

export type ShareOutcome = 'shared' | 'cancelled' | 'downloaded' | 'failed';

/**
 * blob 을 파일로 다운로드시킨다.
 *
 * 브라우저별 다운로드 취소 패턴을 피하려고 두 가지를 지킨다.
 * 1. `<a>` 를 `document.body` 에 붙였다가 뗀다 — 일부 브라우저는 문서에 붙지 않은
 *    (detached) 앵커의 click()으로 시작된 다운로드를 무시하거나 취소한다.
 * 2. `revokeObjectURL` 을 click 과 같은 동기 블록에서 바로 호출하지 않는다 — 브라우저가
 *    blob URL 을 실제로 읽어들이기 전에 무효화되면 다운로드가 조용히 실패할 수 있다.
 *    `setTimeout(..., 0)` 으로 한 틱 미뤄 다운로드가 시작될 시간을 준다.
 *
 * 둘 다 불필요해 보인다고 지우지 말 것. 최신 데스크탑 Chrome/Firefox 에서는 대개 멀쩡하지만,
 * 이 앱에서 다운로드는 공유 미지원 환경의 유일한 폴백 경로라 조용히 실패하면 사용자에게
 * 대안이 없다.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * blob 을 공유하거나(Web Share API 지원 시), 지원하지 않거나 실패하면 다운로드로 폴백한다.
 * 사용자가 공유 시트를 취소하면 AbortError 가 오는데, 이건 실패가 아니라 사용자의 선택이므로
 * 에러로 취급하지 않고 'cancelled' 를 반환한다.
 */
export async function shareImage(
  blob: Blob,
  filename: string,
  title?: string,
): Promise<ShareOutcome> {
  const file = new File([blob], filename, { type: 'image/png' });

  const canShare = navigator.canShare?.({ files: [file] }) ?? false;

  if (canShare) {
    try {
      await navigator.share({ files: [file], title: title ?? 'allcover 정산' });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return 'cancelled';
      }
      // NotAllowedError 등 그 외 실패는 다운로드 폴백으로 이어간다
    }
  }

  try {
    downloadBlob(blob, filename);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

/** 클립보드에 텍스트를 복사한다. 실패하면 false를 반환하고 절대 throw하지 않는다. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

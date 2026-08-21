/**
 * 결과 카드 캡처 (PNG blob 생성).
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §3 인수조건 D, §5 R1/R2/R3
 *
 * R1: 캡처 대상 서브트리(ResultCard 등)는 src/index.css 의 hex CSS 변수(--card-*)만 사용하기로
 *     팀 규약이 정해져 있다. Tailwind v4 기본 팔레트는 oklch() 색인데, html-to-image 가
 *     노드를 SVG <foreignObject> 로 직렬화할 때 oklch() 가 깨질 수 있기 때문이다.
 *     캡처 대상 안에서 새 클래스를 추가할 때도 이 규약을 지켜야 한다.
 *
 * R2: captureNode 는 결과 화면 진입 시 useEffect 등으로 "미리" 호출해 blob 을 준비해두고,
 *     공유 버튼 클릭 핸들러는 그 blob 을 받아 await 없이 즉시 navigator.share 를 호출해야 한다.
 *     (자세한 이유는 share.ts 상단 주석 참고 — iOS user-activation 소실 방지)
 *
 * R3: 웹폰트가 캡처에서 누락되지 않도록 getFontEmbedCSS 로 계산한 fontEmbedCSS 를 넘긴다.
 *     같은 노드를 여러 번 캡처할 일이 있다면 createCapturer(node) 로 fontEmbedCSS 계산을
 *     캐시해 재사용할 수 있다.
 */

import { toBlob, getFontEmbedCSS } from 'html-to-image';

const CAPTURE_OPTIONS = {
  pixelRatio: 2,
  backgroundColor: '#ffffff',
  cacheBust: true,
} as const;

/** node 를 PNG blob 으로 캡처한다. 실패 시 의미 있는 메시지의 Error 를 던진다. */
export async function captureNode(node: HTMLElement): Promise<Blob> {
  let fontEmbedCSS: string | undefined;
  try {
    fontEmbedCSS = await getFontEmbedCSS(node);
  } catch {
    // 폰트 임베드 계산이 실패해도 캡처 자체는 계속 시도한다 (R3는 최선 노력)
    fontEmbedCSS = undefined;
  }

  let blob: Blob | null;
  try {
    blob = await toBlob(node, { ...CAPTURE_OPTIONS, fontEmbedCSS });
  } catch (cause) {
    throw new Error('결과 카드 이미지를 생성하지 못했습니다.', { cause });
  }

  if (!blob) {
    throw new Error('결과 카드 이미지를 생성하지 못했습니다.');
  }

  return blob;
}

/**
 * 같은 node 를 여러 번 캡처할 때 fontEmbedCSS 계산(비교적 비용이 큼)을 한 번만 하고
 * 재사용하는 캡처러를 만든다. 결과 화면 마운트 시 한 번 만들어 두고, 필요할 때마다
 * capture() 를 호출하는 형태로 쓴다.
 */
export function createCapturer(node: HTMLElement): { capture: () => Promise<Blob> } {
  let fontEmbedCSSPromise: Promise<string | undefined> | undefined;

  function getFontEmbedCSSCached(): Promise<string | undefined> {
    if (!fontEmbedCSSPromise) {
      fontEmbedCSSPromise = getFontEmbedCSS(node).catch(() => undefined);
    }
    return fontEmbedCSSPromise;
  }

  async function capture(): Promise<Blob> {
    const fontEmbedCSS = await getFontEmbedCSSCached();

    let blob: Blob | null;
    try {
      blob = await toBlob(node, { ...CAPTURE_OPTIONS, fontEmbedCSS });
    } catch (cause) {
      throw new Error('결과 카드 이미지를 생성하지 못했습니다.', { cause });
    }

    if (!blob) {
      throw new Error('결과 카드 이미지를 생성하지 못했습니다.');
    }

    return blob;
  }

  return { capture };
}

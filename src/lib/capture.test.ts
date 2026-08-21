import { describe, expect, it, vi } from 'vitest';

const toBlob = vi.fn();
const getFontEmbedCSS = vi.fn();

vi.mock('html-to-image', () => ({
  toBlob: (...args: unknown[]) => toBlob(...args),
  getFontEmbedCSS: (...args: unknown[]) => getFontEmbedCSS(...args),
}));

// html-to-image를 모킹한 뒤에 import 해야 모킹이 적용된다
const { captureNode, createCapturer } = await import('./capture');

function makeNode(): HTMLElement {
  return document.createElement('div');
}

describe('captureNode', () => {
  it('pixelRatio 2, backgroundColor 흰색, cacheBust true 옵션으로 toBlob을 호출한다', async () => {
    getFontEmbedCSS.mockResolvedValue('@font-face {}');
    const blob = new Blob(['png']);
    toBlob.mockResolvedValue(blob);

    const node = makeNode();
    const result = await captureNode(node);

    expect(result).toBe(blob);
    expect(toBlob).toHaveBeenCalledTimes(1);
    const [calledNode, options] = toBlob.mock.calls[0];
    expect(calledNode).toBe(node);
    expect(options).toMatchObject({
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: true,
      fontEmbedCSS: '@font-face {}',
    });
  });

  it('toBlob이 null을 반환하면 의미 있는 에러를 던진다', async () => {
    getFontEmbedCSS.mockResolvedValue(undefined);
    toBlob.mockResolvedValue(null);

    await expect(captureNode(makeNode())).rejects.toThrow(/생성하지 못했습니다/);
  });

  it('toBlob이 예외를 던지면 의미 있는 에러로 감싸서 던진다', async () => {
    getFontEmbedCSS.mockResolvedValue(undefined);
    toBlob.mockRejectedValue(new Error('boom'));

    await expect(captureNode(makeNode())).rejects.toThrow(/생성하지 못했습니다/);
  });
});

describe('createCapturer', () => {
  it('fontEmbedCSS 계산을 캐시해서 여러 번 capture해도 getFontEmbedCSS는 한 번만 호출한다', async () => {
    getFontEmbedCSS.mockClear();
    toBlob.mockClear();
    getFontEmbedCSS.mockResolvedValue('@font-face {}');
    toBlob.mockResolvedValue(new Blob(['png']));

    const node = makeNode();
    const { capture } = createCapturer(node);

    await capture();
    await capture();

    expect(getFontEmbedCSS).toHaveBeenCalledTimes(1);
    expect(toBlob).toHaveBeenCalledTimes(2);
  });
});

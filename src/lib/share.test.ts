import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyText, downloadBlob, shareImage } from './share';

function makeBlob(): Blob {
  return new Blob(['test'], { type: 'image/png' });
}

describe('shareImage', () => {
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    clickSpy.mockRestore();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'canShare');
    Reflect.deleteProperty(navigator, 'share');
  });

  it('D2: canShare가 true이고 share가 성공하면 "shared"를 반환하고 다운로드하지 않는다', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    navigator.canShare = vi.fn(() => true);
    navigator.share = shareMock;

    const outcome = await shareImage(makeBlob(), 'allcover-20260821.png', '제목');

    expect(outcome).toBe('shared');
    expect(shareMock).toHaveBeenCalledTimes(1);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('D4: share가 AbortError를 던지면 "cancelled"를 반환하고, 다운로드하지 않고, 에러를 전파하지 않는다', async () => {
    navigator.canShare = vi.fn(() => true);
    navigator.share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));

    await expect(
      shareImage(makeBlob(), 'allcover-20260821.png'),
    ).resolves.toBe('cancelled');
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('D3: canShare가 없으면(미지원 환경) "downloaded"를 반환하고 <a> 클릭이 발생한다', async () => {
    const outcome = await shareImage(makeBlob(), 'allcover-20260821.png');

    expect(outcome).toBe('downloaded');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('share가 AbortError가 아닌 일반 에러(예: NotAllowedError)를 던지면 다운로드로 폴백한다', async () => {
    navigator.canShare = vi.fn(() => true);
    navigator.share = vi
      .fn()
      .mockRejectedValue(new DOMException('not allowed', 'NotAllowedError'));

    const outcome = await shareImage(makeBlob(), 'allcover-20260821.png');

    expect(outcome).toBe('downloaded');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});

describe('downloadBlob', () => {
  it('objectURL을 만들고 <a download="filename"> 클릭 후 revoke한다', () => {
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    // click 시점의 <a> 엘리먼트 자체(this)를 캡처해 href/download 속성이 실제로
    // 설정됐는지 확인한다. download 값을 오타내거나 빠뜨려도 click 호출 자체는
    // 그대로 성공하므로, click 호출 여부만 보는 검사로는 이 회귀를 못 잡는다.
    let clickedAnchor: HTMLAnchorElement | undefined;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clickedAnchor = this;
      });

    downloadBlob(makeBlob(), 'foo.png');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(clickedAnchor?.download).toBe('foo.png');
    expect(clickedAnchor?.href).toContain('blob:mock-url');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe('copyText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clipboard.writeText 성공 시 true를 반환한다', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    await expect(copyText('hello')).resolves.toBe(true);
  });

  it('clipboard.writeText 실패 시 false를 반환한다', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    await expect(copyText('hello')).resolves.toBe(false);
  });
});

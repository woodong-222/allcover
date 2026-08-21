import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShareBar } from './ShareBar';
import * as shareLib from '../lib/share';

function makeBlob(): Blob {
  return new Blob(['png'], { type: 'image/png' });
}

describe('ShareBar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('captureBlob이 null이면 공유/저장 버튼이 비활성화되고 준비 중 문구를 보여준다', () => {
    render(<ShareBar captureBlob={null} filename="a.png" summaryText="text" />);
    expect(screen.getByRole('button', { name: '공유하기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '이미지 저장' })).toBeDisabled();
    expect(screen.getByText('이미지 준비 중…')).toBeInTheDocument();
  });

  it('D1: 공유 버튼 클릭 시 await 없이 즉시 shareImage를 호출한다 (핸들러가 동기 함수)', async () => {
    const shareImageSpy = vi
      .spyOn(shareLib, 'shareImage')
      .mockResolvedValue('shared');
    const user = userEvent.setup();
    render(
      <ShareBar captureBlob={makeBlob()} filename="allcover-20260821.png" summaryText="text" />,
    );

    await user.click(screen.getByRole('button', { name: '공유하기' }));

    expect(shareImageSpy).toHaveBeenCalledTimes(1);
    const [blobArg, filenameArg] = shareImageSpy.mock.calls[0];
    expect(blobArg).toBeInstanceOf(Blob);
    expect(filenameArg).toBe('allcover-20260821.png');
    expect(await screen.findByText('공유했습니다')).toBeInTheDocument();
  });

  it('D3: canShare 미지원 등으로 shareImage가 "downloaded"를 반환하면 다운로드 안내를 보여준다', async () => {
    vi.spyOn(shareLib, 'shareImage').mockResolvedValue('downloaded');
    const user = userEvent.setup();
    render(<ShareBar captureBlob={makeBlob()} filename="a.png" summaryText="text" />);

    await user.click(screen.getByRole('button', { name: '공유하기' }));

    expect(await screen.findByText('다운로드했습니다')).toBeInTheDocument();
  });

  it('D4: shareImage가 "cancelled"를 반환하면 에러 문구를 띄우지 않는다', async () => {
    vi.spyOn(shareLib, 'shareImage').mockResolvedValue('cancelled');
    const user = userEvent.setup();
    render(<ShareBar captureBlob={makeBlob()} filename="a.png" summaryText="text" />);

    await user.click(screen.getByRole('button', { name: '공유하기' }));

    // idle 상태로 돌아가고 에러 관련 문구는 없어야 한다
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/실패/)).not.toBeInTheDocument();
  });

  it('이미지 저장 버튼 클릭 시 downloadBlob을 호출한다', async () => {
    const downloadSpy = vi.spyOn(shareLib, 'downloadBlob').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<ShareBar captureBlob={makeBlob()} filename="a.png" summaryText="text" />);

    await user.click(screen.getByRole('button', { name: '이미지 저장' }));

    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('다운로드했습니다')).toBeInTheDocument();
  });

  it('텍스트 복사 버튼 클릭 시 copyText를 호출하고 성공 문구를 보여준다', async () => {
    vi.spyOn(shareLib, 'copyText').mockResolvedValue(true);
    const user = userEvent.setup();
    render(<ShareBar captureBlob={null} filename="a.png" summaryText="복사할 텍스트" />);

    await user.click(screen.getByRole('button', { name: '텍스트 복사' }));

    expect(shareLib.copyText).toHaveBeenCalledWith('복사할 텍스트');
    expect(await screen.findByText('복사했습니다')).toBeInTheDocument();
  });

  it('E2: 버튼 히트 영역이 44px 이상이 되도록 min-h/min-w 클래스를 갖는다', () => {
    render(<ShareBar captureBlob={makeBlob()} filename="a.png" summaryText="text" />);
    for (const label of ['공유하기', '이미지 저장', '텍스트 복사']) {
      const button = screen.getByRole('button', { name: label });
      expect(button.className).toMatch(/min-h-\[44px\]/);
      expect(button.className).toMatch(/min-w-\[44px\]/);
    }
  });
});

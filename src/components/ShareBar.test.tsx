import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ShareBar } from './ShareBar';

describe('ShareBar', () => {
  it('ready가 false면 공유/저장 버튼이 비활성화되고 "이미지 준비 중"을 보여준다', () => {
    render(
      <ShareBar onShare={vi.fn()} onDownload={vi.fn()} onCopyText={vi.fn()} ready={false} />,
    );
    expect(screen.getByRole('button', { name: '공유하기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '이미지 저장' })).toBeDisabled();
    expect(screen.getByText('이미지 준비 중')).toBeInTheDocument();
  });

  it('D1/R2: 공유 버튼 클릭은 onShare를 동기적으로(한 번) 호출한다', async () => {
    const onShare = vi.fn();
    const user = userEvent.setup();
    render(<ShareBar onShare={onShare} onDownload={vi.fn()} onCopyText={vi.fn()} ready={true} />);

    await user.click(screen.getByRole('button', { name: '공유하기' }));

    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it('이미지 저장 버튼 클릭은 onDownload를 호출한다', async () => {
    const onDownload = vi.fn();
    const user = userEvent.setup();
    render(
      <ShareBar onShare={vi.fn()} onDownload={onDownload} onCopyText={vi.fn()} ready={true} />,
    );

    await user.click(screen.getByRole('button', { name: '이미지 저장' }));

    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('텍스트 복사 버튼은 ready와 무관하게 항상 활성화되고 onCopyText를 호출한다', async () => {
    const onCopyText = vi.fn();
    const user = userEvent.setup();
    render(
      <ShareBar onShare={vi.fn()} onDownload={vi.fn()} onCopyText={onCopyText} ready={false} />,
    );

    const button = screen.getByRole('button', { name: '텍스트 복사' });
    expect(button).not.toBeDisabled();
    await user.click(button);

    expect(onCopyText).toHaveBeenCalledTimes(1);
  });

  it('outcome="shared"면 공유 완료 문구를 보여준다', () => {
    render(
      <ShareBar
        onShare={vi.fn()}
        onDownload={vi.fn()}
        onCopyText={vi.fn()}
        ready={true}
        outcome="shared"
      />,
    );
    expect(screen.getByText('공유했어요')).toBeInTheDocument();
  });

  it('outcome="downloaded"면 다운로드 완료 문구를 보여준다', () => {
    render(
      <ShareBar
        onShare={vi.fn()}
        onDownload={vi.fn()}
        onCopyText={vi.fn()}
        ready={true}
        outcome="downloaded"
      />,
    );
    expect(screen.getByText('이미지를 저장했어요')).toBeInTheDocument();
  });

  it('outcome="failed"면 실패 문구를 보여준다', () => {
    render(
      <ShareBar
        onShare={vi.fn()}
        onDownload={vi.fn()}
        onCopyText={vi.fn()}
        ready={true}
        outcome="failed"
      />,
    );
    expect(screen.getByText('공유에 실패했어요')).toBeInTheDocument();
  });

  it('D4: outcome="cancelled"면 아무 문구도 띄우지 않는다', () => {
    render(
      <ShareBar
        onShare={vi.fn()}
        onDownload={vi.fn()}
        onCopyText={vi.fn()}
        ready={true}
        outcome="cancelled"
      />,
    );
    expect(screen.queryByText(/실패|공유했어요|저장했어요/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('E2: 버튼 3개 모두 히트 영역이 44px 이상이 되도록 min-h/min-w 클래스를 갖는다', () => {
    render(<ShareBar onShare={vi.fn()} onDownload={vi.fn()} onCopyText={vi.fn()} ready={true} />);
    for (const label of ['공유하기', '이미지 저장', '텍스트 복사']) {
      const button = screen.getByRole('button', { name: label });
      expect(button.className).toMatch(/min-h-\[44px\]/);
      expect(button.className).toMatch(/min-w-\[44px\]/);
    }
  });
});

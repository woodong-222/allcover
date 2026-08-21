/**
 * 앱 전체가 함께 렌더되는지 확인하는 스모크 테스트.
 *
 * 개별 컴포넌트/라이브러리는 각자 단위 테스트가 있지만, 이 파일은
 * "스토어 액션 -> calculate -> settleTransfers -> ResultCard 표시"가
 * 실제로 하나로 이어지는지를 본다. App.tsx 배선이 끊기면 여기서 잡힌다.
 *
 * html-to-image 는 jsdom 에서 실제 렌더가 불가능하므로 모킹한다.
 * 캡처 성공 여부가 아니라 배선이 검증 대상이다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { useSettlementStore } from './store/useSettlementStore';
import { usePrefsStore } from './store/usePrefsStore';

vi.mock('./lib/capture', () => ({
  captureNode: vi.fn(async () => new Blob(['x'], { type: 'image/png' })),
  createCapturer: vi.fn(() => ({
    capture: async () => new Blob(['x'], { type: 'image/png' }),
  })),
}));

async function addMembers(user: ReturnType<typeof userEvent.setup>, names: string[]) {
  const input = screen.getByLabelText('멤버 이름');
  for (const name of names) {
    await user.type(input, name);
    await user.keyboard('{Enter}');
  }
}

describe('App 스모크', () => {
  beforeEach(() => {
    useSettlementStore.getState().resetSession();
    usePrefsStore.setState({
      gameFeePerGame: 0,
      shoeFee: 0,
      defaultAnte: 0,
      roundingUnit: 100,
      recentMemberNames: [],
    });
  });

  it('멤버가 없으면 결과 대신 안내 문구를 보여준다', () => {
    render(<App />);
    expect(screen.getByText('먼저 참여자 이름을 추가해주세요.')).toBeInTheDocument();
  });

  it('멤버를 추가하면 결과 영역과 공유 버튼이 나타난다', async () => {
    const user = userEvent.setup();
    render(<App />);

    await addMembers(user, ['가']);

    expect(screen.queryByText('먼저 참여자 이름을 추가해주세요.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /공유/ })).toBeInTheDocument();
  });

  it('게임비를 입력하고 판을 추가하면 결과 카드에 계산된 금액이 표시된다', async () => {
    const user = userEvent.setup();
    render(<App />);

    await addMembers(user, ['가', '나']);

    // 스토어 액션을 통해서만 상태를 바꾼다. settlement 객체를 직접 변형하면
    // imbalance 계산이 조용히 달라진다 (worker-calc 경고 지점).
    // React 밖에서 스토어를 건드리므로 act 로 감싸야 리렌더가 flush 된다.
    act(() => {
      useSettlementStore.getState().setFees({ gameFeePerGame: 4000, roundingUnit: 100 });
      useSettlementStore.getState().addRound();
      useSettlementStore.getState().addRound();
    });

    // 2판 x 4,000원 = 8,000원씩, 2명이므로 총 16,000원
    const card = screen.getByTestId('result-card');
    expect(within(card).getAllByText(/8,000원/).length).toBeGreaterThanOrEqual(2);
    expect(within(card).getByText(/16,000원/)).toBeInTheDocument();
  });

  it('총무를 지정하면 송금 목록에서 잔액 안내 문구가 사라진다', async () => {
    const user = userEvent.setup();
    render(<App />);

    await addMembers(user, ['가', '나']);
    act(() => {
      useSettlementStore.getState().setFees({ gameFeePerGame: 4000, roundingUnit: 100 });
      useSettlementStore.getState().addRound();
    });

    expect(screen.getByTestId('greedy-remainder-note')).toBeInTheDocument();

    const treasurerId = useSettlementStore.getState().settlement.members[0]?.id;
    act(() => {
      useSettlementStore.getState().setTreasurer(treasurerId);
    });

    expect(screen.queryByTestId('greedy-remainder-note')).not.toBeInTheDocument();
  });

  it('새 정산을 눌러 세션을 비워도 요금 프리셋은 남는다', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);

    await addMembers(user, ['가']);
    act(() => {
      useSettlementStore.getState().setFees({ gameFeePerGame: 4000, roundingUnit: 100 });
    });

    await user.click(screen.getByRole('button', { name: '새 정산' }));

    expect(useSettlementStore.getState().settlement.members).toHaveLength(0);
    expect(usePrefsStore.getState().gameFeePerGame).toBe(4000);
    confirmSpy.mockRestore();
  });
});

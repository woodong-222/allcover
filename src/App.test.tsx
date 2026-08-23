/**
 * 앱 전체가 함께 렌더되는지 확인하는 스모크 테스트.
 *
 * 개별 컴포넌트/라이브러리는 각자 단위 테스트가 있지만, 이 파일은
 * "스토어 액션 -> calculate -> ResultCard 표시"가
 * 실제로 하나로 이어지는지를 본다. App.tsx 배선이 끊기면 여기서 잡힌다.
 *
 * html-to-image 는 jsdom 에서 실제 렌더가 불가능하므로 모킹한다.
 * 캡처 성공 여부가 아니라 배선이 검증 대상이다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { useSettlementStore } from './store/useSettlementStore';
import { usePrefsStore } from './store/usePrefsStore';
import { resetPersistenceStateForTest, safeSet } from './lib/storage';
import { createCapturer } from './lib/capture';

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
      useSettlementStore.getState().setFees({ gameFeePerGame: 4000 });
      useSettlementStore.getState().addRound();
      useSettlementStore.getState().addRound();
    });

    // 2판 x 4,000원 = 8,000원씩, 2명이므로 총 16,000원
    const card = screen.getByTestId('result-card');
    expect(within(card).getAllByText(/8,000원/).length).toBeGreaterThanOrEqual(2);
    expect(within(card).getByText(/16,000원/)).toBeInTheDocument();
  });

  // 총무 지정과 송금 목록은 2026-08-21 에 제거됐다. 결과 카드는 "누가 얼마" 와 총액만 보여준다.
  // 회귀로 다시 들어오는 걸 막기 위해 부재를 고정한다.
  it('송금 안내와 총무 관련 표시가 결과 카드에 없다', async () => {
    const user = userEvent.setup();
    render(<App />);

    await addMembers(user, ['가', '나']);
    act(() => {
      useSettlementStore.getState().setFees({ gameFeePerGame: 4000 });
      useSettlementStore.getState().addRound();
    });

    expect(screen.queryByTestId('greedy-remainder-note')).not.toBeInTheDocument();
    expect(screen.queryByText(/총무/)).not.toBeInTheDocument();
    expect(screen.queryByText(/보내주세요/)).not.toBeInTheDocument();
  });

  /**
   * C4. quota 초과는 사파리 프라이빗 모드와 달리 **세션 중간에** 발생한다.
   * 마운트 시 한 번만 판정하는 구현에서는 이 테스트가 실패한다.
   */
  it('C4: 세션 도중 저장이 실패하면 안내 배너가 나타난다', async () => {
    resetPersistenceStateForTest();
    const user = userEvent.setup();
    render(<App />);

    const bannerText = /저장이 막혀 있어/;
    expect(screen.queryByText(bannerText)).not.toBeInTheDocument();

    // 멤버를 추가해 앱이 정상 동작 중임을 확인한 뒤, 그때부터 저장이 실패하게 만든다.
    await addMembers(user, ['가']);
    expect(screen.queryByText(bannerText)).not.toBeInTheDocument();

    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });

    act(() => {
      safeSet('allcover:session:v1', '{}');
    });

    expect(screen.getByText(bannerText)).toBeInTheDocument();
    setItemSpy.mockRestore();
  });

  it('C4: 저장이 실패해도 앱은 계속 동작한다', async () => {
    resetPersistenceStateForTest();
    const user = userEvent.setup();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });

    render(<App />);
    await addMembers(user, ['가', '나']);

    // 저장이 막혀도 입력과 계산은 그대로 굴러가야 한다.
    expect(useSettlementStore.getState().settlement.members).toHaveLength(2);
    expect(screen.getByTestId('result-card')).toBeInTheDocument();
    setItemSpy.mockRestore();
  });

  describe('D1/R2: 공유 버튼 클릭 -> navigator.share 호출', () => {
    afterEach(() => {
      Reflect.deleteProperty(navigator, 'canShare');
      Reflect.deleteProperty(navigator, 'share');
    });

    /**
     * 이 테스트가 잡으려는 회귀: App.tsx의 handleShare가 (실수로든 리팩터로든)
     * `async () => { await 뭔가; shareImage(...) }` 형태가 되는 것.
     * 그러면 클릭과 navigator.share 호출 사이에 최소 한 번의 await 경계가 생기고,
     * iOS Safari는 그 사이에 user-activation(사용자 제스처)을 잃어 공유 시트가 뜨지 않는다.
     *
     * "onShare가 호출됐다"만 보는 검사로는 이 회귀를 못 잡는다 — handleShare를 async로
     * 바꿔도 호출 자체는 여전히 일어나기 때문이다. 그래서 클릭 "이전"에 마이크로태스크를
     * 하나 예약해두고, navigator.share가 실제로 호출되는 시점에 그 마이크로태스크가 이미
     * 실행됐는지를 검사한다. 중간에 await가 하나라도 끼면 이벤트 루프가 마이크로태스크
     * 큐를 비우면서 예약해둔 마이크로태스크가 먼저 돌아 이 값이 true가 된다.
     *
     * fireEvent.click은 동기 디스패치이므로(userEvent.click과 달리) 클릭 자체가
     * 추가 await를 끼워넣지 않는다 — 그래서 이 트릭이 유효하다.
     *
     * 동시에 클릭 시점에 captureNode/createCapturer가 다시 호출되지 않는지도 함께
     * 검사한다 (D1: blob은 결과 화면 진입 시 미리 만들어져 있어야 하고, 클릭 시점에
     * 새로 캡처를 시작하면 안 된다).
     */
    it('클릭부터 navigator.share 호출까지 await 경계를 넘지 않고, 클릭 시점에 재캡처하지 않는다', async () => {
      const user = userEvent.setup();
      render(<App />);

      await addMembers(user, ['가']);
      act(() => {
        useSettlementStore.getState().setFees({ gameFeePerGame: 4000 });
        useSettlementStore.getState().addRound();
      });

      const shareButton = screen.getByRole('button', { name: '공유하기' });
      // 캡처 debounce(400ms) + mock capture()의 프라미스가 실제로 흘러가야 ready가 된다.
      await waitFor(() => expect(shareButton).not.toBeDisabled(), { timeout: 2000 });

      const captureCallsBeforeClick = vi.mocked(createCapturer).mock.calls.length;

      let microtaskFlushed = false;
      void Promise.resolve().then(() => {
        microtaskFlushed = true;
      });

      let sawMicrotaskFlushedAtShareCall: boolean | null = null;
      const shareSpy = vi.fn((_data: ShareData) => Promise.resolve());
      navigator.canShare = vi.fn(() => true);
      navigator.share = ((data: ShareData) => {
        sawMicrotaskFlushedAtShareCall = microtaskFlushed;
        return shareSpy(data);
      }) as typeof navigator.share;

      act(() => {
        fireEvent.click(shareButton);
      });

      expect(shareSpy).toHaveBeenCalledTimes(1);
      expect(sawMicrotaskFlushedAtShareCall).toBe(false);

      // D1: 클릭이 새 캡처를 트리거하지 않는다 — blob은 이미 준비돼 있었다.
      expect(vi.mocked(createCapturer).mock.calls.length).toBe(captureCallsBeforeClick);
    });
  });

  /**
   * 모드 전환은 **비파괴적**이어야 한다. 정산 모드로 바꿔도 입력해둔 순위·배당은
   * 남아 있고 계산에서만 빠진다. 잘못 눌렀을 때 되돌릴 수 없으면 안 되기 때문이다.
   */
  it('G2: 모드를 왕복해도 입력해둔 내기 데이터가 지워지지 않는다', async () => {
    const user = userEvent.setup();
    render(<App />);

    await addMembers(user, ['가', '나']);
    act(() => {
      useSettlementStore.getState().setFees({ gameFeePerGame: 4000 });
      useSettlementStore.getState().addRound();
    });

    const roundId = useSettlementStore.getState().settlement.rounds[0]!.id;
    const memberId = useSettlementStore.getState().settlement.members[0]!.id;
    act(() => {
      useSettlementStore.getState().setMethod(roundId, 'pot');
      useSettlementStore.getState().setAnte(roundId, 1000);
      useSettlementStore.getState().tapRank(roundId, memberId);
      useSettlementStore.getState().setPayout(roundId, [2000]);
    });

    const before = useSettlementStore.getState().settlement.rounds[0]!;

    await user.click(screen.getByRole('radio', { name: '정산' }));
    await user.click(screen.getByRole('radio', { name: '내기' }));

    const after = useSettlementStore.getState().settlement.rounds[0]!;
    expect(after.ranking).toEqual(before.ranking);
    expect(after.payout).toEqual(before.payout);
    expect(after.ante).toBe(before.ante);
    expect(after.method).toBe(before.method);
  });

  it('G1: 정산 모드에서는 내기 금액이 결과에 반영되지 않는다', async () => {
    const user = userEvent.setup();
    render(<App />);

    await addMembers(user, ['가', '나']);
    act(() => {
      useSettlementStore.getState().setFees({ gameFeePerGame: 4000 });
      useSettlementStore.getState().addRound();
    });

    const roundId = useSettlementStore.getState().settlement.rounds[0]!.id;
    const memberId = useSettlementStore.getState().settlement.members[0]!.id;
    act(() => {
      useSettlementStore.getState().setMethod(roundId, 'pot');
      useSettlementStore.getState().setAnte(roundId, 1000);
      useSettlementStore.getState().tapRank(roundId, memberId);
      useSettlementStore.getState().setPayout(roundId, [2000]);
    });

    // 내기는 제로섬이라 **총액은 두 모드에서 8,000원으로 같다**. 달라지는 건 개인 부담이다.
    // 총액으로 판정하면 어느 모드에서도 통과해 아무것도 검증하지 못한다.
    const card = screen.getByTestId('result-card');
    const rows = () =>
      within(card)
        .getAllByTestId('result-row')
        .map((row) => row.textContent ?? '');

    // 내기 모드: 1등이 배당 2,000을 받고 판돈 1,000을 냈으므로 3,000 / 5,000 으로 갈린다
    await user.click(screen.getByRole('radio', { name: '내기' }));
    expect(rows().some((t) => t.includes('3,000원'))).toBe(true);
    expect(rows().some((t) => t.includes('5,000원'))).toBe(true);

    // 정산 모드: 내기가 빠져 둘 다 게임비 4,000원씩만 부담한다
    await user.click(screen.getByRole('radio', { name: '정산' }));
    expect(rows().every((t) => t.includes('4,000원'))).toBe(true);
    expect(rows().some((t) => t.includes('3,000원'))).toBe(false);
  });

  it('새 정산을 눌러 세션을 비워도 요금 프리셋은 남는다', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);

    await addMembers(user, ['가']);
    act(() => {
      useSettlementStore.getState().setFees({ gameFeePerGame: 4000 });
    });

    await user.click(screen.getByRole('button', { name: '새 정산' }));

    expect(useSettlementStore.getState().settlement.members).toHaveLength(0);
    expect(usePrefsStore.getState().gameFeePerGame).toBe(4000);
    confirmSpy.mockRestore();
  });
});

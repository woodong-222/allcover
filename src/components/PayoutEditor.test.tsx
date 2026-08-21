import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Round, Settlement } from '../types';
import { roundDelta } from '../lib/calc';
import { useSettlementStore } from '../store/useSettlementStore';
import { PayoutEditor } from './PayoutEditor';

const MEMBERS = [
  { id: 'a', name: '가나' },
  { id: 'b', name: '나다' },
  { id: 'c', name: '다라' },
  { id: 'd', name: '라마' },
  { id: 'e', name: '마바' },
];

function makeRound(patch: Partial<Round> = {}): Round {
  return {
    id: 'r1',
    participants: ['a', 'b', 'c', 'd', 'e'],
    teams: null,
    method: 'pot',
    ante: 1000,
    payout: [],
    ranking: [],
    losers: [],
    transferSource: 'gameFee',
    transferAmount: 0,
    ...patch,
  };
}

function seed(round: Round): void {
  const settlement: Settlement = {
    version: 1,
    id: 's1',
    date: '2026-08-21T00:00:00.000Z',
    members: MEMBERS,
    gameFeePerGame: 4000,
    shoeFee: 2000,
    shoeRenters: [],
    defaultAnte: 1000,
    rounds: [round],
    extras: [],
    treasurerId: undefined,
    roundingUnit: 100,
  };
  useSettlementStore.setState({ settlement });
}

function Harness() {
  const round = useSettlementStore((s) => s.settlement.rounds[0]);
  return <PayoutEditor round={round} />;
}

function currentRound(): Round {
  return useSettlementStore.getState().settlement.rounds[0];
}

describe('PayoutEditor', () => {
  beforeEach(() => {
    seed(makeRound());
  });

  it('순위가 비어 있으면 안내만 보여준다', () => {
    render(<Harness />);
    expect(screen.getByText('먼저 순위를 정해주세요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '나머지 자동 분배' })).not.toBeInTheDocument();
  });

  it('ante 1,000 / 5명 / 1등 3,000 · 2등 2,000 이면 남은 판돈 0원', () => {
    seed(makeRound({ ranking: [['a'], ['b']], payout: [3000, 2000] }));
    render(<Harness />);

    expect(screen.getByText('남은 판돈 0원')).toBeInTheDocument();
    expect(roundDelta(currentRound(), 4000).imbalance).toBe(0);
  });

  it('배당 합계가 판돈에 못 미치면 남은 금액을 표시한다', () => {
    seed(makeRound({ ranking: [['a'], ['b']], payout: [3000, 1000] }));
    render(<Harness />);
    expect(screen.getByText('남은 판돈 1,000원 남음')).toBeInTheDocument();
  });

  it('배당 합계가 판돈을 초과하면 경고를 표시한다', () => {
    seed(makeRound({ ranking: [['a'], ['b']], payout: [4000, 3000] }));
    render(<Harness />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('남은 판돈 2,000원 초과');
    expect(status.className).toMatch(/text-red-800/);
  });

  it('"나머지 자동 분배" 클릭 후 imbalance가 정확히 0이 된다', async () => {
    seed(makeRound({ ranking: [['a'], ['b']], payout: [3000, 1000] }));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '나머지 자동 분배' }));

    expect(roundDelta(currentRound(), 4000).imbalance).toBe(0);
    expect(currentRound().payout).toEqual([3000, 2000]);
    expect(screen.getByText('남은 판돈 0원')).toBeInTheDocument();
  });

  it('팀전에서 100원 단위로 나눠떨어지지 않아도 imbalance가 정확히 0이 된다', async () => {
    const teamCases: { label: string; teams: string[][]; ante: number }[] = [
      // 2:3 팀전, 남은 판돈 3,500원 → 마지막(3명)에 인당 1,100원, 잔액 200원은 1등(2명)에 100원씩
      { label: '2:3', teams: [['a', 'b'], ['c', 'd', 'e']], ante: 1100 },
      // 3:2 팀전, 남은 판돈 2,650원 → 1등(3명)으로는 안 나뉘어 마지막(2명)에 인당 1,325원
      { label: '3:2', teams: [['a', 'b', 'c'], ['d', 'e']], ante: 1130 },
    ];

    for (const { teams, ante } of teamCases) {
      seed(makeRound({ teams, ranking: teams, ante, payout: [1000, 0] }));
      const user = userEvent.setup();
      const view = render(<Harness />);

      await user.click(screen.getByRole('button', { name: '나머지 자동 분배' }));

      expect(roundDelta(currentRound(), 4000).imbalance).toBe(0);
      expect(currentRound().payout.every((p) => p >= 0)).toBe(true);
      view.unmount();
    }
  });

  it('초과 배당도 "나머지 자동 분배"로 정확히 0이 된다', async () => {
    seed(makeRound({ ranking: [['a'], ['b']], payout: [9000, 4000] }));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '나머지 자동 분배' }));

    expect(roundDelta(currentRound(), 4000).imbalance).toBe(0);
    expect(currentRound().payout.every((p) => p >= 0)).toBe(true);
  });

  it('남은 판돈이 0이면 "나머지 자동 분배" 버튼이 비활성화된다', () => {
    seed(makeRound({ ranking: [['a'], ['b']], payout: [3000, 2000] }));
    render(<Harness />);
    expect(screen.getByRole('button', { name: '나머지 자동 분배' })).toBeDisabled();
  });

  it('승자독식 프리셋은 pot 전액을 1등 그룹 인당 배당으로 넣는다', async () => {
    seed(makeRound({ ranking: [['a'], ['b']], payout: [0, 0] }));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '승자독식' }));

    expect(currentRound().payout).toEqual([5000, 0]);
    expect(roundDelta(currentRound(), 4000).imbalance).toBe(0);
  });

  it('1·2등 차등 프리셋은 pot의 60/40으로 나눈다', async () => {
    seed(makeRound({ ranking: [['a'], ['b']], payout: [0, 0] }));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '1·2등 차등' }));

    expect(currentRound().payout).toEqual([3000, 2000]);
  });

  it('등수별 인당 배당 입력이 setPayout으로 반영된다 (E3: inputMode numeric)', async () => {
    seed(makeRound({ ranking: [['a'], ['b']], payout: [0, 0] }));
    const user = userEvent.setup();
    render(<Harness />);

    const first = screen.getByLabelText('1등 인당 배당');
    expect(first).toHaveAttribute('inputMode', 'numeric');
    await user.type(first, '3000');

    expect(currentRound().payout).toEqual([3000, 0]);
  });

  it('E2: 액션 버튼이 44px 히트 영역을 갖는다', () => {
    seed(makeRound({ ranking: [['a'], ['b']], payout: [0, 0] }));
    render(<Harness />);
    for (const name of ['나머지 자동 분배', '승자독식', '1·2등 차등']) {
      const button = screen.getByRole('button', { name });
      expect(button.className).toMatch(/min-h-\[44px\]/);
      expect(button.className).toMatch(/min-w-\[44px\]/);
    }
  });
});

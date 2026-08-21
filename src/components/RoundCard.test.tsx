import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Round, Settlement } from '../types';
import { useSettlementStore } from '../store/useSettlementStore';
import { RoundCard } from './RoundCard';

const MEMBERS = [
  { id: 'a', name: '가나' },
  { id: 'b', name: '나다' },
  { id: 'c', name: '다라' },
  { id: 'd', name: '라마' },
];

function makeRound(patch: Partial<Round> = {}): Round {
  return {
    id: 'r1',
    participants: ['a', 'b', 'c', 'd'],
    teams: null,
    method: 'none',
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
  if (!round) return <p>없음</p>;
  return <RoundCard round={round} index={0} />;
}

function currentRound(): Round {
  return useSettlementStore.getState().settlement.rounds[0];
}

describe('RoundCard', () => {
  beforeEach(() => {
    seed(makeRound());
  });

  it('판 번호와 복제/삭제 버튼을 보여준다', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByRole('heading', { name: '1판' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '복제' }));
    expect(useSettlementStore.getState().settlement.rounds).toHaveLength(2);

    await user.click(screen.getAllByRole('button', { name: '삭제' })[0]);
    expect(useSettlementStore.getState().settlement.rounds).toHaveLength(1);
  });

  it('참여자 칩을 탭하면 참여가 토글된다', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const group = screen.getByRole('group', { name: '참여자' });
    await user.click(within(group).getByRole('button', { name: '나다' }));

    expect(currentRound().participants).toEqual(['a', 'c', 'd']);
  });

  it('팀 상태 요약을 보여준다', () => {
    seed(makeRound({ teams: [['a', 'b'], ['c', 'd']] }));
    render(<Harness />);
    expect(screen.getByText('2팀 (2:2)')).toBeInTheDocument();
  });

  it('개인전이면 팀 요약이 "개인전"이다', () => {
    render(<Harness />);
    expect(screen.getByText('개인전')).toBeInTheDocument();
  });

  it('방식을 transfer로 바꾸면 판돈/배당 UI가 사라지고 진 쪽 선택이 나온다', async () => {
    seed(makeRound({ method: 'pot', ranking: [['a']], payout: [4000] }));
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByLabelText('인당 판돈')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '순위' })).toBeInTheDocument();
    expect(screen.getByLabelText('1등 인당 배당')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '판비 내주기' }));

    expect(screen.queryByLabelText('인당 판돈')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '순위' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('1등 인당 배당')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: '진 쪽' })).toBeInTheDocument();
  });

  it('transfer 금액 소스를 직접 입력으로 바꾸면 금액 필드가 나온다', async () => {
    seed(makeRound({ method: 'transfer' }));
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByText('한판비 4,000원을 그대로 씁니다.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '직접 입력' }));

    expect(currentRound().transferSource).toBe('custom');
    expect(screen.getByLabelText('내줄 금액 (1인분)')).toBeInTheDocument();
  });

  it('팀이 있을 때 진 쪽 팀 칩을 탭하면 그 팀 전원이 losers에 들어간다', async () => {
    seed(
      makeRound({
        method: 'transfer',
        teams: [
          ['a', 'b'],
          ['c', 'd'],
        ],
      }),
    );
    const user = userEvent.setup();
    render(<Harness />);

    const group = screen.getByRole('group', { name: '진 쪽' });
    await user.click(within(group).getByRole('button', { name: /2팀/ }));

    expect(currentRound().losers).toEqual(['c', 'd']);
  });

  it('개인전이면 진 쪽을 멤버 단위로 고른다', async () => {
    seed(makeRound({ method: 'transfer' }));
    const user = userEvent.setup();
    render(<Harness />);

    const group = screen.getByRole('group', { name: '진 쪽' });
    await user.click(within(group).getByRole('button', { name: '라마' }));

    expect(currentRound().losers).toEqual(['d']);
  });

  it('R4: imbalance가 0이 아닌 판에 경고 배지가 뜬다', () => {
    // ante 1,000 × 4명 = 4,000 판돈인데 1등에게 3,000만 배당 → imbalance -1,000
    seed(makeRound({ method: 'pot', ranking: [['a']], payout: [3000] }));
    render(<Harness />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('판돈 불일치');
    expect(alert).toHaveTextContent('1,000원');
  });

  it('imbalance가 0이면 경고 배지가 없다', () => {
    seed(makeRound({ method: 'pot', ranking: [['a']], payout: [4000] }));
    render(<Harness />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('팀 편성 변경 버튼으로 TeamSheet를 연다', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '팀 편성 변경' }));
    expect(screen.getByRole('dialog', { name: '팀 편성' })).toBeInTheDocument();
  });

  it('E1/E2: 칩 목록은 flex-wrap이고 칩/버튼이 44px 히트 영역을 갖는다', () => {
    render(<Harness />);

    const group = screen.getByRole('group', { name: '참여자' });
    const chip = within(group).getByRole('button', { name: '가나' });
    expect(chip.className).toMatch(/min-h-\[44px\]/);
    expect(chip.className).toMatch(/min-w-\[44px\]/);
    expect(chip.parentElement?.className).toMatch(/flex-wrap/);

    for (const name of ['복제', '삭제', '팀 편성 변경', '없음', '판돈 분배', '판비 내주기']) {
      expect(screen.getByRole('button', { name }).className).toMatch(/min-h-\[44px\]/);
    }
  });
});

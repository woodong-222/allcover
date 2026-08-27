import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Round, Settlement } from '../types';
import { useSettlementStore } from '../store/useSettlementStore';
import { TeamSheet } from './TeamSheet';

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
    rounds: [round],
    extras: [],
  };
  useSettlementStore.setState({ settlement });
}

function currentRound(): Round {
  return useSettlementStore.getState().settlement.rounds[0];
}

function Harness({ onClose }: { onClose: () => void }) {
  const round = useSettlementStore((s) => s.settlement.rounds[0]);
  const members = useSettlementStore((s) => s.settlement.members);
  return <TeamSheet round={round} members={members} open onClose={onClose} />;
}

describe('TeamSheet', () => {
  beforeEach(() => {
    seed(makeRound());
  });

  it('open이 false면 아무것도 렌더링하지 않는다', () => {
    render(
      <TeamSheet round={currentRound()} members={MEMBERS} open={false} onClose={() => {}} />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('4명을 2팀으로 균등 자동 배정하면 각 팀 2명이 된다', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: '2팀' }));
    await user.click(screen.getByRole('button', { name: '균등 자동 배정' }));
    await user.click(screen.getByRole('button', { name: '확인' }));

    const teams = currentRound().teams;
    expect(teams).toHaveLength(2);
    expect(teams?.map((t) => t.length)).toEqual([2, 2]);
    expect(teams?.flat().sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(onClose).toHaveBeenCalled();
  });

  it('칩을 탭할 때마다 소속 팀이 순환하고 배지가 바뀐다', async () => {
    const user = userEvent.setup();
    render(<Harness onClose={() => {}} />);

    await user.click(screen.getByRole('button', { name: '2팀' }));

    const chip = () => screen.getByRole('button', { name: /가나/ });
    expect(within(chip()).getByText('미배정')).toBeInTheDocument();

    await user.click(chip());
    expect(within(chip()).getByText('1팀')).toBeInTheDocument();

    await user.click(chip());
    expect(within(chip()).getByText('2팀')).toBeInTheDocument();

    await user.click(chip());
    expect(within(chip()).getByText('미배정')).toBeInTheDocument();
  });

  it('미배정 참여자가 남으면 확인 옆에 경고를 띄우되 막지는 않는다', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: '2팀' }));
    await user.click(screen.getByRole('button', { name: /가나/ })); // 1팀만 배정

    expect(screen.getByRole('alert')).toHaveTextContent('미배정 3명');

    await user.click(screen.getByRole('button', { name: '확인' }));
    expect(currentRound().teams).toEqual([['a'], []]);
    expect(onClose).toHaveBeenCalled();
  });

  it('개인전을 고르고 확인하면 teams가 null이 된다', async () => {
    seed(makeRound({ teams: [['a', 'b'], ['c', 'd']] }));
    const user = userEvent.setup();
    render(<Harness onClose={() => {}} />);

    // 기존 팀 편성이 편집 상태로 복원되어 있어야 한다
    expect(screen.getByRole('button', { name: '2팀' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('button', { name: /다라/ })).getByText('2팀')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '개인전' }));
    await user.click(screen.getByRole('button', { name: '확인' }));

    expect(currentRound().teams).toBeNull();
  });

  it('팀 수를 줄이면 사라진 팀의 인원이 미배정으로 돌아간다', async () => {
    seed(makeRound({ teams: [['a'], ['b'], ['c'], ['d']] }));
    const user = userEvent.setup();
    render(<Harness onClose={() => {}} />);

    await user.click(screen.getByRole('button', { name: '2팀' }));

    expect(within(screen.getByRole('button', { name: /다라/ })).getByText('미배정')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /가나/ })).getByText('1팀')).toBeInTheDocument();
  });

  it('배경 탭과 ESC로 닫힌다', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('칩 목록은 flex-wrap이고 버튼이 44px 히트 영역을 갖는다', async () => {
    const user = userEvent.setup();
    render(<Harness onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: '2팀' }));

    const chip = screen.getByRole('button', { name: /가나/ });
    expect(chip.className).toMatch(/min-h-\[44px\]/);
    expect(chip.className).toMatch(/min-w-\[44px\]/);
    expect(chip.parentElement?.className).toMatch(/flex-wrap/);

    for (const name of ['개인전', '2팀', '균등 자동 배정', '확인', '취소']) {
      expect(screen.getByRole('button', { name }).className).toMatch(/min-h-\[44px\]/);
    }
  });
});

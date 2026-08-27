import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Round, Settlement } from '../types';
import { useSettlementStore } from '../store/useSettlementStore';
import { RankPicker } from './RankPicker';

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
    rounds: [round],
    extras: [],
  };
  useSettlementStore.setState({ settlement });
}

/** 스토어의 최신 라운드를 다시 읽어 내려주는 래퍼. 실제 RoundCard와 같은 배선이다 */
function Harness() {
  const round = useSettlementStore((s) => s.settlement.rounds[0]);
  const members = useSettlementStore((s) => s.settlement.members);
  return <RankPicker round={round} members={members} />;
}

function chip(name: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(name) });
}

describe('RankPicker', () => {
  beforeEach(() => {
    seed(makeRound());
  });

  it('탭한 순서대로 1등/2등/3등 배지가 붙는다', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(chip('가나'));
    await user.click(chip('나다'));
    await user.click(chip('다라'));

    expect(within(chip('가나')).getByText('1등')).toBeInTheDocument();
    expect(within(chip('나다')).getByText('2등')).toBeInTheDocument();
    expect(within(chip('다라')).getByText('3등')).toBeInTheDocument();
    expect(useSettlementStore.getState().settlement.rounds[0].ranking).toEqual([
      ['a'],
      ['b'],
      ['c'],
    ]);
  });

  it('2등을 다시 탭하면 해제되고 기존 3등이 2등으로 당겨진다', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(chip('가나'));
    await user.click(chip('나다'));
    await user.click(chip('다라'));
    await user.click(chip('나다')); // 2등 해제

    expect(within(chip('가나')).getByText('1등')).toBeInTheDocument();
    expect(within(chip('다라')).getByText('2등')).toBeInTheDocument();
    expect(within(chip('나다')).getByText('무배당')).toBeInTheDocument();
    expect(useSettlementStore.getState().settlement.rounds[0].ranking).toEqual([['a'], ['c']]);
  });

  it('탭하지 않은 참여자는 무배당 라벨로 상태가 항상 보인다', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(chip('가나'));

    expect(screen.getAllByText('무배당')).toHaveLength(3);
    expect(
      screen.getByText('배당 받는 등수까지만 탭하세요. 나머지는 자동으로 무배당입니다.'),
    ).toBeInTheDocument();
  });

  it('팀전이면 팀 칩을 보여주고 팀 단위로 등수를 매긴다', async () => {
    seed(makeRound({ teams: [['a', 'b'], ['c', 'd']] }));
    const user = userEvent.setup();
    render(<Harness />);

    expect(chip('2팀')).toHaveTextContent('다라·라마');

    await user.click(chip('2팀'));

    expect(within(chip('2팀')).getByText('1등')).toBeInTheDocument();
    expect(useSettlementStore.getState().settlement.rounds[0].ranking).toEqual([['c', 'd']]);
  });

  it('칩 목록은 flex-wrap이고 각 칩은 44px 히트 영역을 갖는다', () => {
    render(<Harness />);
    const button = chip('가나');
    expect(button.className).toMatch(/min-h-\[44px\]/);
    expect(button.className).toMatch(/min-w-\[44px\]/);
    expect(button.parentElement?.className).toMatch(/flex-wrap/);
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Round, Settlement } from '../types';
import { useSettlementStore } from '../store/useSettlementStore';
import { RoundList } from './RoundList';

const MEMBERS = [
  { id: 'a', name: '가나' },
  { id: 'b', name: '나다' },
];

function seed(rounds: Round[]): void {
  const settlement: Settlement = {
    version: 1,
    id: 's1',
    date: '2026-08-21T00:00:00.000Z',
    mode: 'bet',
    members: MEMBERS,
    gameFeePerGame: 4000,
    shoeFee: 2000,
    shoeRenters: [],
    rounds,
    extras: [],
  };
  useSettlementStore.setState({ settlement });
}

describe('RoundList', () => {
  beforeEach(() => {
    seed([]);
  });

  it('판이 없으면 안내 문구를 보여준다', () => {
    render(<RoundList />);
    expect(screen.getByText(/아직 판이 없습니다/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '1판' })).not.toBeInTheDocument();
  });

  it('"판 추가"를 누르면 판이 1부터 번호가 매겨져 추가된다', async () => {
    const user = userEvent.setup();
    render(<RoundList />);

    await user.click(screen.getByRole('button', { name: '판 추가' }));
    expect(screen.getByRole('heading', { name: '1판' })).toBeInTheDocument();
    expect(screen.queryByText(/아직 판이 없습니다/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '판 추가' }));
    expect(screen.getByRole('heading', { name: '2판' })).toBeInTheDocument();
    expect(useSettlementStore.getState().settlement.rounds).toHaveLength(2);
  });

  it('새 판은 전체 멤버를 참여자로 채운다', async () => {
    const user = userEvent.setup();
    render(<RoundList />);

    await user.click(screen.getByRole('button', { name: '판 추가' }));

    expect(useSettlementStore.getState().settlement.rounds[0].participants).toEqual(['a', 'b']);
  });

  it('판을 삭제하면 목록에서 사라지고 번호가 다시 매겨진다', async () => {
    const user = userEvent.setup();
    render(<RoundList />);

    await user.click(screen.getByRole('button', { name: '판 추가' }));
    await user.click(screen.getByRole('button', { name: '판 추가' }));
    await user.click(screen.getAllByRole('button', { name: '삭제' })[0]);

    expect(useSettlementStore.getState().settlement.rounds).toHaveLength(1);
    expect(screen.getByRole('heading', { name: '1판' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '2판' })).not.toBeInTheDocument();
  });

  it('E2: 판 추가 버튼이 44px 히트 영역을 갖는다', () => {
    render(<RoundList />);
    const button = screen.getByRole('button', { name: '판 추가' });
    expect(button.className).toMatch(/min-h-\[44px\]/);
    expect(button.className).toMatch(/min-w-\[44px\]/);
  });
});

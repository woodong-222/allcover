import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Archive } from './Archive';
import { useArchiveStore } from '../store/useArchiveStore';
import { useSettlementStore } from '../store/useSettlementStore';
import { usePrefsStore, initialPrefs } from '../store/usePrefsStore';

beforeEach(() => {
  window.localStorage.clear();
  useArchiveStore.setState({ entries: [] });
  usePrefsStore.setState({ ...initialPrefs });
  useSettlementStore.getState().resetSession();
});

/** 멤버와 판이 들어 있는 정산을 화면 상태로 만든다 */
function seedSettlement(): void {
  const store = useSettlementStore.getState();
  store.setFees({ gameFeePerGame: 4000 });
  store.addMember('철수');
  store.addMember('영희');
  store.addRound();
}

async function expand(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const details = document.querySelector('details');
  if (details && !details.open) await user.click(screen.getByText(/보관함/));
}

describe('Archive', () => {
  it('저장한 게 없으면 안내 문구를 보여준다', async () => {
    const user = userEvent.setup();
    render(<Archive />);
    await expand(user);

    expect(screen.getByText(/저장한 정산이 없습니다/)).toBeInTheDocument();
    expect(screen.queryAllByTestId('archive-entry')).toHaveLength(0);
  });

  it('참여자가 없으면 저장 버튼이 비활성이다', async () => {
    const user = userEvent.setup();
    render(<Archive />);
    await expand(user);

    expect(screen.getByRole('button', { name: '지금 정산 임시 저장' })).toBeDisabled();
  });

  it('저장하면 목록에 자동 요약 이름으로 들어간다', async () => {
    const user = userEvent.setup();
    seedSettlement();
    render(<Archive />);
    await expand(user);

    await user.click(screen.getByRole('button', { name: '지금 정산 임시 저장' }));

    const rows = screen.getAllByTestId('archive-entry');
    expect(rows).toHaveLength(1);
    // 자동 요약에는 대표 이름과 인원이 들어간다
    expect(rows[0].textContent).toContain('철수 외 1명');
    expect(rows[0].textContent).toContain('2명 · 1판');
  });

  it('불러오기로 보관본이 화면 상태를 대체한다', async () => {
    const user = userEvent.setup();
    useArchiveStore.getState().save({
      label: '지난주',
      settlement: {
        id: 'old',
        date: '2026-08-20T00:00:00.000Z',
        members: [{ id: 'x', name: '민수' }],
        gameFeePerGame: 5500,
        shoeFee: 1000,
        shoeRenters: [],
        rounds: [],
        extras: [],
      },
    });

    render(<Archive />);
    await expand(user);
    await user.click(screen.getByRole('button', { name: '불러오기' }));

    const s = useSettlementStore.getState().settlement;
    expect(s.members.map((m) => m.name)).toEqual(['민수']);
    expect(s.gameFeePerGame).toBe(5500);
  });

  /** 불러오기는 되돌릴 수 없으므로 입력한 게 있으면 먼저 물어봐야 한다 */
  it('화면에 입력한 게 있으면 불러오기 전에 확인을 받고, 취소하면 그대로 둔다', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    useArchiveStore.getState().save({
      label: '지난주',
      settlement: {
        id: 'old',
        date: '2026-08-20T00:00:00.000Z',
        members: [{ id: 'x', name: '민수' }],
        gameFeePerGame: 5500,
        shoeFee: 0,
        shoeRenters: [],
        rounds: [],
        extras: [],
      },
    });
    seedSettlement();

    render(<Archive />);
    await expand(user);
    await user.click(screen.getByRole('button', { name: '불러오기' }));

    expect(confirmSpy).toHaveBeenCalled();
    // 취소했으므로 화면은 그대로다
    expect(useSettlementStore.getState().settlement.members.map((m) => m.name)).toEqual([
      '철수',
      '영희',
    ]);
    confirmSpy.mockRestore();
  });

  it('삭제하면 목록에서 사라진다', async () => {
    const user = userEvent.setup();
    seedSettlement();
    render(<Archive />);
    await expand(user);

    await user.click(screen.getByRole('button', { name: '지금 정산 임시 저장' }));
    expect(screen.getAllByTestId('archive-entry')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /삭제$/ }));
    expect(screen.queryAllByTestId('archive-entry')).toHaveLength(0);
  });

  it('이름을 탭해 바꿀 수 있다', async () => {
    const user = userEvent.setup();
    seedSettlement();
    render(<Archive />);
    await expand(user);
    await user.click(screen.getByRole('button', { name: '지금 정산 임시 저장' }));

    const row = screen.getAllByTestId('archive-entry')[0];
    await user.click(within(row).getByRole('button', { name: /이름 수정$/ }));

    const input = screen.getByLabelText('보관함 이름 수정');
    await user.clear(input);
    await user.type(input, '금요모임{Enter}');

    expect(useArchiveStore.getState().entries[0].label).toBe('금요모임');
    expect(screen.getAllByTestId('archive-entry')[0].textContent).toContain('금요모임');
  });
});

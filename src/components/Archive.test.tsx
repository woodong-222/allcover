import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Archive } from './Archive';
import { useArchiveStore } from '../store/useArchiveStore';
import { useSettlementStore } from '../store/useSettlementStore';
import { usePrefsStore, initialPrefs } from '../store/usePrefsStore';
import { resetPersistenceStateForTest } from '../lib/storage';
import type { Settlement } from '../types';

beforeEach(() => {
  window.localStorage.clear();
  resetPersistenceStateForTest();
  useArchiveStore.setState({ entries: [] });
  usePrefsStore.setState({ ...initialPrefs });
  useSettlementStore.getState().resetSession();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** 멤버와 판이 들어 있는 정산을 화면 상태로 만든다 */
function seedSettlement(): void {
  const store = useSettlementStore.getState();
  store.setFees({ gameFeePerGame: 4000 });
  store.addMember('철수');
  store.addMember('영희');
  store.addRound();
}

function mkSaved(patch: Partial<Settlement> = {}): Settlement {
  return {
    id: 'old',
    date: '2026-08-20T00:00:00.000Z',
    members: [{ id: 'x', name: '민수' }],
    gameFeePerGame: 5500,
    shoeFee: 1000,
    shoeRenters: [],
    rounds: [],
    extras: [],
    ...patch,
  };
}

function section(): HTMLDetailsElement {
  const details = document.querySelector('details');
  if (!details) throw new Error('보관함 섹션을 찾지 못했다');
  return details as HTMLDetailsElement;
}

/**
 * 보관함을 펼치고, 펼쳐졌는지 단언한다.
 *
 * jsdom 은 닫힌 `<details>` 의 자식도 그대로 노출한다. 이 단언이 없으면 섹션이 접힌 채여도
 * 아래 조회가 전부 통과해 테스트가 무의미해진다. 같은 이유로 내용 확인은
 * `toBeInTheDocument` 가 아니라 `toBeVisible` 로 한다.
 */
async function expand(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const details = section();
  if (!details.open) await user.click(screen.getByText(/보관함/));
  expect(details.open).toBe(true);
}

describe('Archive', () => {
  it('저장한 게 없으면 안내 문구를 보여준다', async () => {
    const user = userEvent.setup();
    render(<Archive />);
    await expand(user);

    expect(screen.getByText(/저장한 정산이 없습니다/)).toBeVisible();
    expect(screen.queryAllByTestId('archive-entry')).toHaveLength(0);
  });

  it('참여자가 없으면 저장 버튼이 비활성이고 이유가 버튼에 연결된다', async () => {
    const user = userEvent.setup();
    render(<Archive />);
    await expand(user);

    const button = screen.getByRole('button', { name: '지금 정산 임시 저장' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('참여자를 추가하면 저장할 수 있습니다.');
  });

  it('저장하면 목록에 자동 요약 이름으로 들어가고 결과를 알린다', async () => {
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
    expect(screen.getByRole('status')).toHaveTextContent('저장했습니다.');
  });

  /**
   * 저장 공간이 가득 차면 쓰기가 실패하지만, 실패한 값은 메모리 폴백에 남아 이번 세션 동안은
   * 목록에 그대로 보인다. 조용히 넘어가면 사용자는 저장됐다고 믿고 앱을 닫았다가 다음에
   * 열었을 때 그 항목만 없어진 걸 보게 된다.
   */
  it('저장이 실패하면 목록에 보이더라도 실패했다고 알린다', async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    seedSettlement();
    render(<Archive />);
    await expand(user);
    await user.click(screen.getByRole('button', { name: '지금 정산 임시 저장' }));

    expect(screen.getByRole('status')).toHaveTextContent(/저장하지 못했습니다/);
  });

  it('불러오기로 보관본이 화면 상태를 대체한다', async () => {
    const user = userEvent.setup();
    useArchiveStore.getState().save({ label: '지난주', settlement: mkSaved() });

    render(<Archive />);
    await expand(user);
    await user.click(screen.getByRole('button', { name: /불러오기$/ }));

    const s = useSettlementStore.getState().settlement;
    expect(s.members.map((m) => m.name)).toEqual(['민수']);
    expect(s.gameFeePerGame).toBe(5500);
  });

  /** 불러오기는 되돌릴 수 없으므로 입력한 게 있으면 먼저 물어봐야 한다 */
  it('화면에 입력한 게 있으면 불러오기 전에 확인을 받고, 취소하면 그대로 둔다', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    useArchiveStore.getState().save({ label: '지난주', settlement: mkSaved({ shoeFee: 0 }) });
    seedSettlement();

    render(<Archive />);
    await expand(user);
    await user.click(screen.getByRole('button', { name: /불러오기$/ }));

    expect(confirmSpy).toHaveBeenCalled();
    // 취소했으므로 화면은 그대로다
    expect(useSettlementStore.getState().settlement.members.map((m) => m.name)).toEqual([
      '철수',
      '영희',
    ]);
  });

  /**
   * 취소 경로만 보면 "확인을 눌러도 아무 일이 없는" 고장을 놓친다. 확인 뒤 실제로 화면이
   * 교체되는지까지 봐야 가드가 제 역할을 하는지 알 수 있다.
   */
  it('확인을 누르면 지금 입력한 정산을 덮어쓰고 보관본으로 바꾼다', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    useArchiveStore.getState().save({ label: '지난주', settlement: mkSaved({ shoeFee: 0 }) });
    seedSettlement();

    render(<Archive />);
    await expand(user);
    await user.click(screen.getByRole('button', { name: /불러오기$/ }));

    const s = useSettlementStore.getState().settlement;
    expect(s.members.map((m) => m.name)).toEqual(['민수']);
    expect(s.gameFeePerGame).toBe(5500);
  });

  it('삭제는 확인을 받고, 취소하면 목록에 그대로 남는다', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    seedSettlement();
    render(<Archive />);
    await expand(user);
    await user.click(screen.getByRole('button', { name: '지금 정산 임시 저장' }));

    await user.click(screen.getByRole('button', { name: /삭제$/ }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getAllByTestId('archive-entry')).toHaveLength(1);
  });

  it('확인하면 목록에서 사라진다', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    seedSettlement();
    render(<Archive />);
    await expand(user);

    await user.click(screen.getByRole('button', { name: '지금 정산 임시 저장' }));
    expect(screen.getAllByTestId('archive-entry')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /삭제$/ }));
    expect(screen.queryAllByTestId('archive-entry')).toHaveLength(0);
  });

  /**
   * 펼침 여부를 `entries.length > 0` 으로 계산하면 마지막 항목을 지우는 순간 값이 뒤집혀
   * React 가 `<details>` 의 open 을 도로 지운다. 사용자가 보고 있던 섹션이 스스로 접힌다.
   */
  it('마지막 보관본을 지워도 섹션은 펼친 채로 남는다', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    seedSettlement();
    render(<Archive />);
    await expand(user);
    await user.click(screen.getByRole('button', { name: '지금 정산 임시 저장' }));
    await user.click(screen.getByRole('button', { name: /삭제$/ }));

    expect(section().open).toBe(true);
    expect(screen.getByRole('button', { name: '지금 정산 임시 저장' })).toBeVisible();
  });

  it('보관본이 여러 개면 버튼 이름으로 어느 항목인지 구분된다', async () => {
    const user = userEvent.setup();
    useArchiveStore.getState().save({ label: '지난주', settlement: mkSaved() });
    useArchiveStore.getState().save({ label: '금요모임', settlement: mkSaved() });

    render(<Archive />);
    await expand(user);

    expect(screen.getByRole('button', { name: '금요모임 불러오기' })).toBeVisible();
    expect(screen.getByRole('button', { name: '지난주 불러오기' })).toBeVisible();
  });

  it('이름을 탭해 바꿀 수 있고 앞뒤 공백은 정리된다', async () => {
    const user = userEvent.setup();
    seedSettlement();
    render(<Archive />);
    await expand(user);
    await user.click(screen.getByRole('button', { name: '지금 정산 임시 저장' }));

    const row = screen.getAllByTestId('archive-entry')[0];
    await user.click(within(row).getByRole('button', { name: /이름 수정$/ }));

    const input = screen.getByLabelText('보관함 이름 수정');
    await user.clear(input);
    await user.type(input, '  금요모임  {Enter}');

    expect(useArchiveStore.getState().entries[0].label).toBe('금요모임');
    expect(screen.getAllByTestId('archive-entry')[0].textContent).toContain('금요모임');

    // 편집기를 다시 열어도 공백 붙은 원본이 아니라 정리된 이름이 들어 있다
    await user.click(screen.getByRole('button', { name: '금요모임 이름 수정' }));
    expect(screen.getByLabelText('보관함 이름 수정')).toHaveValue('금요모임');
  });
});

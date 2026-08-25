import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ExtraCosts } from './ExtraCosts';
import { useSettlementStore } from '../store/useSettlementStore';
import { usePrefsStore, initialPrefs } from '../store/usePrefsStore';
import type { Extra } from '../types';

beforeEach(() => {
  usePrefsStore.setState({ ...initialPrefs });
  useSettlementStore.getState().resetSession();
});

/** 항목이 하나도 없으면 <details>가 닫힌 채로 시작하므로, 폼을 쓰는 테스트는 먼저 펼쳐야 한다. */
function getSummary(): HTMLElement {
  const summary = screen.getByText('기타 비용').closest('summary');
  if (!summary) throw new Error('summary를 찾지 못했다');
  return summary;
}

async function expand(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(getSummary());
}

function addMembers(...names: string[]): string[] {
  for (const name of names) useSettlementStore.getState().addMember(name);
  return useSettlementStore.getState().settlement.members.map((m) => m.id);
}

/**
 * 스토어 액션(`addExtra`)을 우회해 extras를 직접 심는다.
 *
 * `addExtra`/`setExtraAmounts`는 0원 키를 정규화 단계에서 버리므로, 그 액션만 쓰면
 * "0원인 사람을 목록에서 빼는" 컴포넌트 쪽 필터가 한 번도 실행되지 않아 검증되지 않는다.
 */
function seedExtras(extras: Extra[]): void {
  useSettlementStore.setState((s) => ({ settlement: { ...s.settlement, extras } }));
}

/** NumberField는 천 단위 콤마가 붙은 문자열을 보여주므로 값 비교는 이 헬퍼로 한다. */
function fieldValue(labelText: string): string {
  return (screen.getByLabelText(labelText) as HTMLInputElement).value;
}

async function retype(
  user: ReturnType<typeof userEvent.setup>,
  labelText: string,
  value: string
): Promise<void> {
  const field = screen.getByLabelText(labelText);
  await user.clear(field);
  await user.type(field, value);
}

describe('ExtraCosts', () => {
  it('항목이 0건이면 <details>가 닫힌 상태로 시작한다', () => {
    render(<ExtraCosts />);

    const details = getSummary().closest('details');
    expect(details?.open).toBe(false);
  });

  it('저장된 항목이 있으면 <details>가 열린 상태로 시작한다 (새로고침 후 입력 내역이 안 보이는 문제 방지)', () => {
    const [a] = addMembers('가');
    useSettlementStore.getState().addExtra({ label: '간식비', amounts: { [a]: 5000 } });
    render(<ExtraCosts />);

    const details = getSummary().closest('details');
    expect(details?.open).toBe(true);
  });

  it('summary에 항목 수와 amounts 합계가 표시된다', () => {
    const [a, b] = addMembers('가', '나');
    useSettlementStore.getState().addExtra({ label: '간식비', amounts: { [a]: 2000, [b]: 3000 } });
    useSettlementStore.getState().addExtra({ label: '택시비', amounts: { [a]: 10000 } });
    render(<ExtraCosts />);

    expect(screen.getByText('· 2건 · 15,000원')).toBeInTheDocument();
    expect(screen.getByText('총 기타비용: 15,000원')).toBeInTheDocument();
  });

  it('항목이 없으면 summary에 "선택 사항" 힌트가 표시된다', () => {
    render(<ExtraCosts />);
    expect(screen.getByText('· 선택 사항')).toBeInTheDocument();
  });

  it('summary를 클릭하면 토글된다', async () => {
    const user = userEvent.setup();
    render(<ExtraCosts />);

    const details = getSummary().closest('details');
    expect(details?.open).toBe(false);

    await expand(user);
    expect(details?.open).toBe(true);

    await expand(user);
    expect(details?.open).toBe(false);
  });

  it('접힌 상태에서 펼치면 항목 추가 폼에 접근할 수 있다', async () => {
    const user = userEvent.setup();
    render(<ExtraCosts />);

    expect(screen.queryByLabelText('항목명')).not.toBeVisible();

    await expand(user);

    expect(screen.getByLabelText('항목명')).toBeVisible();
  });

  it('E3: 항목명/총액 입력이 label로 연결되고 금액은 numeric 키패드를 쓴다 (E4 전제조건, 실제 Tab 순회 검증은 a11y.test.tsx)', async () => {
    const user = userEvent.setup();
    render(<ExtraCosts />);
    await expand(user);

    expect(screen.getByLabelText('항목명')).toBeInTheDocument();
    expect(screen.getByLabelText('총액')).toHaveAttribute('inputMode', 'numeric');
  });

  describe('균등 분배 (개별 금액 입력 꺼짐)', () => {
    it('총액 10,000원을 3명이 나누면 splitEvenly 규칙대로 전원 3,334원이 저장된다', async () => {
      const [a, b, c] = addMembers('가', '나', '다');
      const user = userEvent.setup();
      render(<ExtraCosts />);
      await expand(user);

      await user.type(screen.getByLabelText('항목명'), '간식비');
      await user.type(screen.getByLabelText('총액'), '10000');
      await user.click(screen.getByRole('button', { name: '추가' }));

      // 전원이 같은 금액을 내도록 올린다. 한 명만 3,333원을 내는 분배는 이 앱의 규칙이 아니다.
      expect(useSettlementStore.getState().settlement.extras[0].amounts).toEqual({
        [a]: 3334,
        [b]: 3334,
        [c]: 3334,
      });
      // 올림 때문에 합계가 총액보다 2원 크다 — 이게 splitEvenly가 실제로 쓰였다는 증거다.
      expect(screen.getByText('총 기타비용: 10,002원')).toBeInTheDocument();
    });

    it('지정 멤버 분담을 선택하면 고른 사람에게만 균등 배정된다', async () => {
      const [a] = addMembers('가', '나');
      const user = userEvent.setup();
      render(<ExtraCosts />);
      await expand(user);

      await user.type(screen.getByLabelText('항목명'), '택시비');
      await user.type(screen.getByLabelText('총액'), '10000');
      await user.click(screen.getByRole('button', { name: '지정 멤버' }));
      await user.click(screen.getByLabelText('가'));
      await user.click(screen.getByRole('button', { name: '추가' }));

      expect(useSettlementStore.getState().settlement.extras[0].amounts).toEqual({ [a]: 10000 });
    });

    it('항목 추가 후 폼이 초기화된다', async () => {
      addMembers('가');
      const user = userEvent.setup();
      render(<ExtraCosts />);
      await expand(user);

      await user.type(screen.getByLabelText('항목명'), '간식비');
      await user.type(screen.getByLabelText('총액'), '5000');
      await user.click(screen.getByRole('button', { name: '추가' }));

      expect((screen.getByLabelText('항목명') as HTMLInputElement).value).toBe('');
      expect(fieldValue('총액')).toBe('');
    });
  });

  describe('개별 금액 입력', () => {
    it('토글을 켜면 균등 금액이 각 칸의 초기값으로 채워져 있다', async () => {
      addMembers('가', '나', '다');
      const user = userEvent.setup();
      render(<ExtraCosts />);
      await expand(user);

      await user.type(screen.getByLabelText('총액'), '10000');
      await user.click(screen.getByLabelText('개별 금액 입력'));

      expect(fieldValue('가 금액')).toBe('3,334');
      expect(fieldValue('나 금액')).toBe('3,334');
      expect(fieldValue('다 금액')).toBe('3,334');
    });

    it('사람별로 다른 금액을 넣으면 그대로 저장되고 합계가 실시간으로 보인다', async () => {
      const [a, b] = addMembers('가', '나');
      const user = userEvent.setup();
      render(<ExtraCosts />);
      await expand(user);

      await user.type(screen.getByLabelText('항목명'), '음료수');
      await user.type(screen.getByLabelText('총액'), '5000');
      await user.click(screen.getByLabelText('개별 금액 입력'));

      await retype(user, '가 금액', '2000');
      await retype(user, '나 금액', '2500');

      expect(screen.getByText('입력 합계: 4,500원')).toBeInTheDocument();
      expect(screen.getByText('총액 5,000원과 다릅니다')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: '추가' }));

      expect(useSettlementStore.getState().settlement.extras[0].amounts).toEqual({
        [a]: 2000,
        [b]: 2500,
      });
    });

    it('한 명만 고치면 나머지는 균등 금액을 유지한다', async () => {
      const [a, b] = addMembers('가', '나');
      const user = userEvent.setup();
      render(<ExtraCosts />);
      await expand(user);

      await user.type(screen.getByLabelText('항목명'), '음료수');
      await user.type(screen.getByLabelText('총액'), '5000');
      await user.click(screen.getByLabelText('개별 금액 입력'));
      await retype(user, '가 금액', '2000');
      await user.click(screen.getByRole('button', { name: '추가' }));

      expect(useSettlementStore.getState().settlement.extras[0].amounts).toEqual({
        [a]: 2000,
        [b]: 2500,
      });
    });

    it('입력한 금액의 합이 0이면 추가 버튼이 비활성화된다', async () => {
      addMembers('가');
      const user = userEvent.setup();
      render(<ExtraCosts />);
      await expand(user);

      await user.type(screen.getByLabelText('항목명'), '음료수');
      await user.type(screen.getByLabelText('총액'), '3000');
      await user.click(screen.getByLabelText('개별 금액 입력'));
      await user.clear(screen.getByLabelText('가 금액'));

      expect(screen.getByText('입력 합계: 0원')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '추가' })).toBeDisabled();
    });

    it('분담 대상을 고르지 않으면 입력칸 대신 안내를 보여준다', async () => {
      addMembers('가');
      const user = userEvent.setup();
      render(<ExtraCosts />);
      await expand(user);

      await user.click(screen.getByRole('button', { name: '지정 멤버' }));
      await user.click(screen.getByLabelText('개별 금액 입력'));

      expect(screen.getByText('분담 대상을 먼저 고르세요.')).toBeInTheDocument();
      expect(screen.queryByLabelText('가 금액')).not.toBeInTheDocument();
    });
  });

  describe('추가 버튼 활성 조건', () => {
    it('총액이 0이면 비활성화된다', async () => {
      addMembers('가');
      const user = userEvent.setup();
      render(<ExtraCosts />);
      await expand(user);

      await user.type(screen.getByLabelText('항목명'), '간식비');

      expect(screen.getByRole('button', { name: '추가' })).toBeDisabled();
      expect(useSettlementStore.getState().settlement.extras).toHaveLength(0);
    });

    it('항목명이 비어 있으면 비활성화된다', async () => {
      addMembers('가');
      const user = userEvent.setup();
      render(<ExtraCosts />);
      await expand(user);

      await user.type(screen.getByLabelText('총액'), '5000');

      expect(screen.getByRole('button', { name: '추가' })).toBeDisabled();
    });

    it('지정 멤버를 아무도 안 고르면 비활성화된다', async () => {
      addMembers('가');
      const user = userEvent.setup();
      render(<ExtraCosts />);
      await expand(user);

      await user.type(screen.getByLabelText('항목명'), '택시비');
      await user.type(screen.getByLabelText('총액'), '5000');
      await user.click(screen.getByRole('button', { name: '지정 멤버' }));

      expect(screen.getByRole('button', { name: '추가' })).toBeDisabled();
    });
  });

  describe('항목 목록', () => {
    it('전원이 같은 금액이면 이름을 묶어 압축해 보여준다', () => {
      const [a, b, c] = addMembers('가', '나', '다');
      seedExtras([{ id: 'e1', label: '간식비', amounts: { [a]: 3334, [b]: 3334, [c]: 3334 } }]);
      render(<ExtraCosts />);

      expect(screen.getByText('10,002원 · 가·나·다 각 3,334원')).toBeInTheDocument();
    });

    it('사람마다 금액이 다르면 각각 나열한다', () => {
      const [a, b] = addMembers('가', '나');
      seedExtras([{ id: 'e1', label: '음료수', amounts: { [a]: 2000, [b]: 2500 } }]);
      render(<ExtraCosts />);

      expect(screen.getByText('4,500원 · 가 2,000원 / 나 2,500원')).toBeInTheDocument();
    });

    it('금액이 0인 사람은 목록에 나오지 않는다', () => {
      const [a, b] = addMembers('가', '나');
      seedExtras([{ id: 'e1', label: '음료수', amounts: { [a]: 2000, [b]: 0 } }]);
      render(<ExtraCosts />);

      expect(screen.getByText('2,000원 · 가 2,000원')).toBeInTheDocument();
      expect(screen.queryByText(/나 0원/)).not.toBeInTheDocument();
    });

    it('낼 사람이 아무도 없는 항목은 경고로 눈에 띄게 표시된다', () => {
      addMembers('가');
      seedExtras([{ id: 'e1', label: '유령비', amounts: {} }]);
      render(<ExtraCosts />);

      const warning = screen.getByText('낼 사람이 없어 정산에 반영되지 않아요');
      expect(warning).toBeInTheDocument();
      // 텍스트만이 아니라 항목 카드 자체가 시각적으로 구분돼야 한다.
      expect(warning.closest('li')?.className).toMatch(/amber/);
    });

    it('금액이 전부 0이어도 낼 사람 없음으로 표시된다', () => {
      const [a] = addMembers('가');
      seedExtras([{ id: 'e1', label: '유령비', amounts: { [a]: 0 } }]);
      render(<ExtraCosts />);

      expect(screen.getByText('낼 사람이 없어 정산에 반영되지 않아요')).toBeInTheDocument();
    });

    it('삭제 버튼을 누르면 항목이 제거된다', async () => {
      const [a] = addMembers('가');
      useSettlementStore.getState().addExtra({ label: '간식비', amounts: { [a]: 5000 } });
      const user = userEvent.setup();
      render(<ExtraCosts />);
      // 항목이 있으니 이미 펼쳐져 있다 — summary를 다시 클릭하면 오히려 닫혀버리므로 건드리지 않는다.

      await user.click(screen.getByRole('button', { name: '간식비 삭제' }));

      expect(useSettlementStore.getState().settlement.extras).toHaveLength(0);
    });
  });

  describe('추가한 항목 수정', () => {
    it('수정을 누르면 사람별 금액 입력칸이 열리고 고친 값이 저장된다', async () => {
      const [a, b] = addMembers('가', '나');
      useSettlementStore.getState().addExtra({ label: '음료수', amounts: { [a]: 2500, [b]: 2500 } });
      const user = userEvent.setup();
      render(<ExtraCosts />);

      expect(screen.queryByLabelText('음료수 · 가 금액')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: '음료수 금액 수정' }));
      await retype(user, '음료수 · 가 금액', '2000');

      expect(useSettlementStore.getState().settlement.extras[0].amounts).toEqual({
        [a]: 2000,
        [b]: 2500,
      });
      expect(screen.getByText('4,500원 · 가 2,000원 / 나 2,500원')).toBeInTheDocument();
    });

    it('금액을 0으로 만들면 그 사람은 항목에서 빠진다', async () => {
      const [a, b] = addMembers('가', '나');
      useSettlementStore.getState().addExtra({ label: '음료수', amounts: { [a]: 2500, [b]: 2500 } });
      const user = userEvent.setup();
      render(<ExtraCosts />);

      await user.click(screen.getByRole('button', { name: '음료수 금액 수정' }));
      await user.clear(screen.getByLabelText('음료수 · 나 금액'));

      expect(useSettlementStore.getState().settlement.extras[0].amounts).toEqual({ [a]: 2500 });
      expect(screen.getByText('2,500원 · 가 2,500원')).toBeInTheDocument();
    });

    it('한 번에 한 항목만 편집칸이 열린다', async () => {
      const [a] = addMembers('가');
      useSettlementStore.getState().addExtra({ label: '음료수', amounts: { [a]: 2000 } });
      useSettlementStore.getState().addExtra({ label: '간식비', amounts: { [a]: 3000 } });
      const user = userEvent.setup();
      render(<ExtraCosts />);

      await user.click(screen.getByRole('button', { name: '음료수 금액 수정' }));
      await user.click(screen.getByRole('button', { name: '간식비 금액 수정' }));

      expect(screen.queryByLabelText('음료수 · 가 금액')).not.toBeInTheDocument();
      expect(screen.getByLabelText('간식비 · 가 금액')).toBeInTheDocument();
    });
  });

  describe('E2: 히트 영역', () => {
    it('분담 대상 체크박스를 감싼 label이 44x44px 히트 영역을 갖는다 (한 글자 이름도)', async () => {
      addMembers('가');
      const user = userEvent.setup();
      render(<ExtraCosts />);
      await expand(user);

      await user.click(screen.getByRole('button', { name: '지정 멤버' }));

      const label = screen.getByLabelText('가').closest('label');
      expect(label).not.toBeNull();
      expect(label?.className).toMatch(/min-h-11/);
      expect(label?.className).toMatch(/min-w-11/);
    });

    it('개별 금액 입력 토글의 클릭 대상(label)이 44px 이상이다', async () => {
      const user = userEvent.setup();
      render(<ExtraCosts />);
      await expand(user);

      const label = screen.getByLabelText('개별 금액 입력').closest('label');
      expect(label?.className).toMatch(/min-h-11/);
      expect(label?.className).toMatch(/min-w-11/);
    });

    it('폼 버튼들이 컨테이너가 아니라 버튼 자체에 44px 히트 영역을 갖는다', async () => {
      const user = userEvent.setup();
      render(<ExtraCosts />);
      await expand(user);

      for (const name of ['전체', '지정 멤버', '추가']) {
        const button = screen.getByRole('button', { name });
        expect(button.className, `${name} 버튼`).toMatch(/min-h-11/);
        expect(button.className, `${name} 버튼`).toMatch(/min-w-11/);
      }
    });

    it('항목의 수정/삭제 버튼이 버튼 자체에 44px 히트 영역을 갖는다', () => {
      const [a] = addMembers('가');
      useSettlementStore.getState().addExtra({ label: '간식비', amounts: { [a]: 5000 } });
      render(<ExtraCosts />);

      for (const name of ['간식비 금액 수정', '간식비 삭제']) {
        const button = screen.getByRole('button', { name });
        expect(button.className, `${name} 버튼`).toMatch(/min-h-11/);
        expect(button.className, `${name} 버튼`).toMatch(/min-w-11/);
      }
    });
  });
});

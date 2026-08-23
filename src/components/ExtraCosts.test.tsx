import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ExtraCosts } from './ExtraCosts';
import { useSettlementStore } from '../store/useSettlementStore';
import { usePrefsStore, initialPrefs } from '../store/usePrefsStore';

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

describe('ExtraCosts', () => {
  it('항목이 0건이면 <details>가 닫힌 상태로 시작한다', () => {
    render(<ExtraCosts />);

    const details = getSummary().closest('details');
    expect(details?.open).toBe(false);
  });

  it('저장된 항목이 있으면 <details>가 열린 상태로 시작한다 (새로고침 후 입력 내역이 안 보이는 문제 방지)', () => {
    useSettlementStore.getState().addExtra({ label: '간식비', amount: 5000, splitAmong: 'all' });
    render(<ExtraCosts />);

    const details = getSummary().closest('details');
    expect(details?.open).toBe(true);
  });

  it('summary에 항목 수와 합계 금액이 표시된다', () => {
    useSettlementStore.getState().addExtra({ label: '간식비', amount: 5000, splitAmong: 'all' });
    useSettlementStore.getState().addExtra({ label: '택시비', amount: 10000, splitAmong: 'all' });
    render(<ExtraCosts />);

    expect(screen.getByText('· 2건 · 15,000원')).toBeInTheDocument();
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

  it('E3: 항목명/금액 입력이 label로 연결되고 금액은 numeric 키패드를 쓴다 (E4 전제조건, 실제 Tab 순회 검증은 a11y.test.tsx)', async () => {
    const user = userEvent.setup();
    render(<ExtraCosts />);
    await expand(user);

    expect(screen.getByLabelText('항목명')).toBeInTheDocument();
    expect(screen.getByLabelText('금액')).toHaveAttribute('inputMode', 'numeric');
  });

  it('항목명과 금액을 입력하면 전체 분담으로 추가된다', async () => {
    const user = userEvent.setup();
    render(<ExtraCosts />);
    await expand(user);

    await user.type(screen.getByLabelText('항목명'), '간식비');
    await user.type(screen.getByLabelText('금액'), '12000');
    await user.click(screen.getByRole('button', { name: '추가' }));

    const extras = useSettlementStore.getState().settlement.extras;
    expect(extras).toHaveLength(1);
    expect(extras[0]).toMatchObject({ label: '간식비', amount: 12000, splitAmong: 'all' });
    expect(screen.getByText('총 기타비용: 12,000원')).toBeInTheDocument();
  });

  it('금액이 0이면 추가 버튼이 비활성화된다', async () => {
    const user = userEvent.setup();
    render(<ExtraCosts />);
    await expand(user);

    await user.type(screen.getByLabelText('항목명'), '간식비');

    expect(screen.getByRole('button', { name: '추가' })).toBeDisabled();
    expect(useSettlementStore.getState().settlement.extras).toHaveLength(0);
  });

  it('항목명이 비어 있으면 추가 버튼이 비활성화된다', async () => {
    const user = userEvent.setup();
    render(<ExtraCosts />);
    await expand(user);

    await user.type(screen.getByLabelText('금액'), '5000');

    expect(screen.getByRole('button', { name: '추가' })).toBeDisabled();
  });

  it('지정 멤버 분담을 선택해 특정 멤버에게만 배정할 수 있다', async () => {
    useSettlementStore.getState().addMember('철수');
    useSettlementStore.getState().addMember('영희');
    const user = userEvent.setup();
    render(<ExtraCosts />);
    await expand(user);

    await user.type(screen.getByLabelText('항목명'), '택시비');
    await user.type(screen.getByLabelText('금액'), '10000');
    await user.click(screen.getByRole('button', { name: '지정 멤버' }));
    await user.click(screen.getByLabelText('철수'));
    await user.click(screen.getByRole('button', { name: '추가' }));

    const extras = useSettlementStore.getState().settlement.extras;
    const memberId = useSettlementStore.getState().settlement.members[0].id;
    expect(extras[0].splitAmong).toEqual([memberId]);
  });

  it('삭제 버튼을 누르면 항목이 제거된다', async () => {
    useSettlementStore.getState().addExtra({ label: '간식비', amount: 5000, splitAmong: 'all' });
    const user = userEvent.setup();
    render(<ExtraCosts />);
    // 항목이 있으니 이미 펼쳐져 있다 — summary를 다시 클릭하면 오히려 닫혀버리므로 건드리지 않는다.

    await user.click(screen.getByRole('button', { name: '간식비 삭제' }));

    expect(useSettlementStore.getState().settlement.extras).toHaveLength(0);
  });

  it('E2: 분담 대상 체크박스를 감싼 label이 44x44px 히트 영역을 갖는다 (한 글자 이름도)', async () => {
    useSettlementStore.getState().addMember('가');
    const user = userEvent.setup();
    render(<ExtraCosts />);
    await expand(user);

    await user.click(screen.getByRole('button', { name: '지정 멤버' }));

    const label = screen.getByLabelText('가').closest('label');
    expect(label).not.toBeNull();
    expect(label?.className).toMatch(/min-h-11/);
    expect(label?.className).toMatch(/min-w-11/);
  });
});

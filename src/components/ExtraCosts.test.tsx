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

describe('ExtraCosts', () => {
  it('E3: 항목명/금액 입력이 label로 연결되고 금액은 numeric 키패드를 쓴다 (E4 전제조건, 실제 Tab 순회 검증은 a11y.test.tsx)', () => {
    render(<ExtraCosts />);
    expect(screen.getByLabelText('항목명')).toBeInTheDocument();
    expect(screen.getByLabelText('금액')).toHaveAttribute('inputMode', 'numeric');
  });

  it('항목명과 금액을 입력하면 전체 분담으로 추가된다', async () => {
    const user = userEvent.setup();
    render(<ExtraCosts />);

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

    await user.type(screen.getByLabelText('항목명'), '간식비');

    expect(screen.getByRole('button', { name: '추가' })).toBeDisabled();
    expect(useSettlementStore.getState().settlement.extras).toHaveLength(0);
  });

  it('항목명이 비어 있으면 추가 버튼이 비활성화된다', async () => {
    const user = userEvent.setup();
    render(<ExtraCosts />);

    await user.type(screen.getByLabelText('금액'), '5000');

    expect(screen.getByRole('button', { name: '추가' })).toBeDisabled();
  });

  it('지정 멤버 분담을 선택해 특정 멤버에게만 배정할 수 있다', async () => {
    useSettlementStore.getState().addMember('철수');
    useSettlementStore.getState().addMember('영희');
    const user = userEvent.setup();
    render(<ExtraCosts />);

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

    await user.click(screen.getByRole('button', { name: '간식비 삭제' }));

    expect(useSettlementStore.getState().settlement.extras).toHaveLength(0);
  });
});

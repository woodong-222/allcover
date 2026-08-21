import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { FeeSettings } from './FeeSettings';
import { useSettlementStore } from '../store/useSettlementStore';
import { usePrefsStore, initialPrefs } from '../store/usePrefsStore';

beforeEach(() => {
  usePrefsStore.setState({ ...initialPrefs });
  useSettlementStore.getState().resetSession();
});

describe('FeeSettings', () => {
  it('E3: 게임 단가/신발비/기본 판돈 입력이 label로 연결되고 numeric 키패드를 쓴다 (E4 전제조건, 실제 Tab 순회 검증은 a11y.test.tsx)', () => {
    render(<FeeSettings />);
    for (const label of ['게임 단가', '신발비', '기본 판돈']) {
      const input = screen.getByLabelText(label);
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('inputMode', 'numeric');
    }
  });

  it('게임 단가를 입력하면 스토어에 반영된다', async () => {
    const user = userEvent.setup();
    render(<FeeSettings />);

    await user.type(screen.getByLabelText('게임 단가'), '4000');

    expect(useSettlementStore.getState().settlement.gameFeePerGame).toBe(4000);
  });

  it('반올림 단위를 선택하면 스토어에 반영된다', async () => {
    const user = userEvent.setup();
    render(<FeeSettings />);

    await user.click(screen.getByRole('button', { name: '100원' }));

    expect(useSettlementStore.getState().settlement.roundingUnit).toBe(100);
    expect(screen.getByRole('button', { name: '100원' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('총무 미선택 시 안내 문구가 노출된다', () => {
    render(<FeeSettings />);
    expect(screen.getByText('잔액은 각자 카운터 결제')).toBeInTheDocument();
  });

  it('총무를 선택하면 안내 문구가 사라진다', async () => {
    useSettlementStore.getState().addMember('철수');
    const user = userEvent.setup();
    render(<FeeSettings />);

    const treasurerId = useSettlementStore.getState().settlement.members[0].id;
    await user.selectOptions(screen.getByLabelText('총무'), treasurerId);

    expect(useSettlementStore.getState().settlement.treasurerId).toBe(treasurerId);
    expect(screen.queryByText('잔액은 각자 카운터 결제')).not.toBeInTheDocument();
  });
});

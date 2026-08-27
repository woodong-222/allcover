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
  it('게임 단가/신발비 입력이 label로 연결되고 numeric 키패드를 쓴다 (실제 Tab 순회 검증은 a11y.test.tsx)', () => {
    render(<FeeSettings />);
    for (const label of ['게임 단가', '신발비']) {
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

  it('신발비를 입력하면 스토어에 반영된다', async () => {
    const user = userEvent.setup();
    render(<FeeSettings />);

    await user.type(screen.getByLabelText('신발비'), '2000');

    expect(useSettlementStore.getState().settlement.shoeFee).toBe(2000);
  });

  it('반올림은 항상 1원 단위 올림이라 반올림 단위 선택 UI가 렌더되지 않는다', () => {
    render(<FeeSettings />);

    expect(screen.queryByText('반올림 단위')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '반올림 단위' })).not.toBeInTheDocument();
    for (const label of ['0원', '10원', '100원']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
  });

  it('"기본 판돈"·"총무" 필드는 렌더되지 않는다', () => {
    render(<FeeSettings />);

    expect(screen.queryByLabelText('기본 판돈')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('총무')).not.toBeInTheDocument();
  });
});

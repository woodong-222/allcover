import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ShoeRentalPicker } from './ShoeRentalPicker';
import { useSettlementStore } from '../store/useSettlementStore';
import { usePrefsStore, initialPrefs } from '../store/usePrefsStore';

beforeEach(() => {
  usePrefsStore.setState({ ...initialPrefs });
  useSettlementStore.getState().resetSession();
});

describe('ShoeRentalPicker', () => {
  it('신발비가 0이면 안내 문구를 보여준다', () => {
    useSettlementStore.getState().addMember('철수');
    render(<ShoeRentalPicker />);

    expect(screen.getByText('신발비를 먼저 입력하세요')).toBeInTheDocument();
  });

  it('신발비가 있으면 멤버 체크박스가 표시된다', () => {
    useSettlementStore.getState().addMember('철수');
    useSettlementStore.getState().setFees({ shoeFee: 2000 });
    render(<ShoeRentalPicker />);

    expect(screen.getByLabelText('철수')).toBeInTheDocument();
    expect(screen.queryByText('신발비를 먼저 입력하세요')).not.toBeInTheDocument();
  });

  it('체크박스를 토글하면 스토어에 반영되고 요약 줄이 갱신된다', async () => {
    useSettlementStore.getState().addMember('철수');
    useSettlementStore.getState().setFees({ shoeFee: 2000 });
    const user = userEvent.setup();
    render(<ShoeRentalPicker />);

    await user.click(screen.getByLabelText('철수'));

    const memberId = useSettlementStore.getState().settlement.members[0].id;
    expect(useSettlementStore.getState().settlement.shoeRenters).toEqual([memberId]);
    expect(screen.getByText('1명 · 2,000원')).toBeInTheDocument();
  });

  it('토글 해제하면 스토어에서 제거된다', async () => {
    useSettlementStore.getState().addMember('철수');
    useSettlementStore.getState().setFees({ shoeFee: 2000 });
    const user = userEvent.setup();
    render(<ShoeRentalPicker />);

    await user.click(screen.getByLabelText('철수'));
    await user.click(screen.getByLabelText('철수'));

    expect(useSettlementStore.getState().settlement.shoeRenters).toEqual([]);
  });
});

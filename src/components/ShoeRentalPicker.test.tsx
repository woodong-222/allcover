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

  it('E2: 체크박스를 감싼 label이 44x44px 히트 영역을 갖는다 (한 글자 이름도)', () => {
    useSettlementStore.getState().addMember('가');
    useSettlementStore.getState().setFees({ shoeFee: 2000 });
    render(<ShoeRentalPicker />);

    const label = screen.getByLabelText('가').closest('label');
    expect(label).not.toBeNull();
    expect(label?.className).toMatch(/min-h-11/);
    expect(label?.className).toMatch(/min-w-11/);
  });
});

describe('ShoeRentalPicker — 접이식 (2026-08-24 사용자 요청)', () => {
  beforeEach(() => {
    usePrefsStore.setState({ ...initialPrefs });
    useSettlementStore.getState().resetSession();
  });

  function detailsEl() {
    return document.querySelector('details');
  }

  it('대여자가 없으면 접힌 상태로 시작한다', () => {
    useSettlementStore.getState().addMember('가');
    useSettlementStore.getState().setFees({ shoeFee: 2000 });
    render(<ShoeRentalPicker />);
    expect(detailsEl()?.hasAttribute('open')).toBe(false);
  });

  it('대여자가 있으면 펼친 상태로 시작하고 요약에 인원과 금액이 나온다', () => {
    useSettlementStore.getState().addMember('가');
    useSettlementStore.getState().setFees({ shoeFee: 2000 });
    const id = useSettlementStore.getState().settlement.members[0]!.id;
    useSettlementStore.getState().toggleShoeRenter(id);

    render(<ShoeRentalPicker />);
    expect(detailsEl()?.hasAttribute('open')).toBe(true);
    const summary = document.querySelector('summary');
    expect(summary?.textContent).toContain('1명');
    expect(summary?.textContent).toContain('2,000원');
  });

  it('대여자가 없으면 요약이 "선택 사항"이다', () => {
    useSettlementStore.getState().addMember('가');
    render(<ShoeRentalPicker />);
    expect(document.querySelector('summary')?.textContent).toContain('선택 사항');
  });
});

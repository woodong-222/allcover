import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemberEditor } from './MemberEditor';
import { useSettlementStore } from '../store/useSettlementStore';
import { usePrefsStore, initialPrefs } from '../store/usePrefsStore';

beforeEach(() => {
  usePrefsStore.setState({ ...initialPrefs });
  useSettlementStore.getState().resetSession();
});

describe('MemberEditor', () => {
  it('이름 입력창이 label과 연결되어 있다 (E4 전제조건, 실제 Tab 순회 검증은 a11y.test.tsx)', () => {
    render(<MemberEditor />);
    expect(screen.getByLabelText('멤버 이름')).toBeInTheDocument();
  });

  it('이름을 입력하고 추가 버튼을 누르면 멤버가 추가된다', async () => {
    const user = userEvent.setup();
    render(<MemberEditor />);

    await user.type(screen.getByLabelText('멤버 이름'), '철수');
    await user.click(screen.getByRole('button', { name: '추가' }));

    expect(useSettlementStore.getState().settlement.members).toHaveLength(1);
    expect(useSettlementStore.getState().settlement.members[0].name).toBe('철수');
    expect(screen.getByLabelText('멤버 이름')).toHaveValue('');
  });

  it('Enter 키로도 멤버가 추가된다', async () => {
    const user = userEvent.setup();
    render(<MemberEditor />);

    await user.type(screen.getByLabelText('멤버 이름'), '영희{Enter}');

    expect(useSettlementStore.getState().settlement.members).toHaveLength(1);
  });

  it('공백만 있는 이름은 추가를 거부한다', async () => {
    const user = userEvent.setup();
    render(<MemberEditor />);

    await user.type(screen.getByLabelText('멤버 이름'), '   ');
    expect(screen.getByRole('button', { name: '추가' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '추가' }));
    expect(useSettlementStore.getState().settlement.members).toHaveLength(0);
  });

  it('멤버 삭제 버튼을 누르면 멤버가 제거된다', async () => {
    useSettlementStore.getState().addMember('철수');
    const user = userEvent.setup();
    render(<MemberEditor />);

    await user.click(screen.getByRole('button', { name: '철수 삭제' }));

    expect(useSettlementStore.getState().settlement.members).toHaveLength(0);
  });

  it('최근 멤버 이름 칩을 탭하면 즉시 추가되고, 이미 추가된 이름은 칩이 비활성화된다', async () => {
    usePrefsStore.setState({ recentMemberNames: ['철수', '영희'] });
    const user = userEvent.setup();
    render(<MemberEditor />);

    await user.click(screen.getByRole('button', { name: '철수' }));

    expect(useSettlementStore.getState().settlement.members.map((m) => m.name)).toEqual(['철수']);
    expect(screen.getByRole('button', { name: '철수' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '영희' })).not.toBeDisabled();
  });

  it('중복된 이름은 추가되지만 시각적으로 경고 표시된다', async () => {
    useSettlementStore.getState().addMember('철수');
    useSettlementStore.getState().addMember('철수');
    render(<MemberEditor />);

    expect(useSettlementStore.getState().settlement.members).toHaveLength(2);
    expect(screen.getAllByText('중복')).toHaveLength(2);
  });
});

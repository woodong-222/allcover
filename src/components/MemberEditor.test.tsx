import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemberEditor } from './MemberEditor';
import { useSettlementStore } from '../store/useSettlementStore';
import { usePrefsStore, initialPrefs } from '../store/usePrefsStore';

beforeEach(() => {
  usePrefsStore.setState({ ...initialPrefs });
  useSettlementStore.getState().resetSession();
});

/**
 * "참여자" 칩 목록만 스코프해서 쿼리한다. addMember는 항상 최근 멤버 이름에도 같은
 * 이름을 추가하므로(usePrefsStore.addRecentMemberName), 멤버를 한 명이라도 추가하면
 * 같은 이름의 버튼이 "최근 멤버" 칩과 "참여자" 칩 양쪽에 존재해 스코프 없이는 모호해진다.
 */
function participantList(): HTMLElement {
  const list = screen.getByText(/^참여자 \(/).nextElementSibling;
  if (!(list instanceof HTMLElement)) throw new Error('참여자 목록을 찾지 못했다');
  return list;
}

describe('MemberEditor', () => {
  it('이름 입력창이 label과 연결되어 있다 (실제 Tab 순회 검증은 a11y.test.tsx)', () => {
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

    // 삭제 버튼의 접근 가능한 이름("철수 삭제")은 최근 멤버 칩과 겹치지 않으므로 스코프가 불필요하다.
    await user.click(screen.getByRole('button', { name: '철수 삭제' }));

    expect(useSettlementStore.getState().settlement.members).toHaveLength(0);
  });

  it('최근 멤버 이름 칩을 탭하면 즉시 추가되고, 이미 추가된 이름은 칩이 비활성화된다', async () => {
    usePrefsStore.setState({ recentMemberNames: ['철수', '영희'] });
    const user = userEvent.setup();
    render(<MemberEditor />);

    // 클릭 시점에는 "철수" 참여자 칩이 아직 없어 스코프 없이도 유일하다.
    await user.click(screen.getByRole('button', { name: '철수' }));

    // 추가된 뒤로는 참여자 칩에도 "철수"가 생기므로, 이제부터는 최근 멤버 칩 목록만 스코프해야
    // getByRole이 모호해지지 않는다 (addMember가 recentMemberNames에도 같은 이름을 넣는다).
    const recentList = screen.getByText('최근 멤버 · 탭해서 빠르게 추가').nextElementSibling;
    if (!(recentList instanceof HTMLElement)) throw new Error('최근 멤버 목록을 찾지 못했다');

    expect(useSettlementStore.getState().settlement.members.map((m) => m.name)).toEqual(['철수']);
    expect(within(recentList).getByRole('button', { name: '철수' })).toBeDisabled();
    expect(within(recentList).getByRole('button', { name: '영희' })).not.toBeDisabled();
  });

  it('중복된 이름은 추가되지만 시각적으로 경고 표시된다', async () => {
    useSettlementStore.getState().addMember('철수');
    useSettlementStore.getState().addMember('철수');
    render(<MemberEditor />);

    expect(useSettlementStore.getState().settlement.members).toHaveLength(2);
    expect(screen.getAllByText('중복')).toHaveLength(2);
  });

  it('최근 멤버 이름 칩이 44x44px 히트 영역을 갖는다 (한 글자 이름도)', () => {
    usePrefsStore.setState({ recentMemberNames: ['가'] });
    render(<MemberEditor />);

    const chip = screen.getByRole('button', { name: '가' });
    expect(chip.className).toMatch(/min-h-11/);
    expect(chip.className).toMatch(/min-w-11/);
  });

  it('참여자 칩 이름을 탭하면 인라인 편집으로 전환되고 Enter로 확정하면 스토어에 반영된다', async () => {
    useSettlementStore.getState().addMember('철수');
    const user = userEvent.setup();
    render(<MemberEditor />);

    await user.click(within(participantList()).getByRole('button', { name: '철수' }));
    const input = screen.getByLabelText('철수 이름 수정');
    await user.clear(input);
    await user.type(input, '철수2{Enter}');

    expect(useSettlementStore.getState().settlement.members[0].name).toBe('철수2');
    expect(within(participantList()).getByRole('button', { name: '철수2' })).toBeInTheDocument();
  });

  it('참여자 칩 편집 중 Escape를 누르면 원래 이름으로 되돌아가고 스토어는 바뀌지 않는다', async () => {
    useSettlementStore.getState().addMember('철수');
    const user = userEvent.setup();
    render(<MemberEditor />);

    await user.click(within(participantList()).getByRole('button', { name: '철수' }));
    const input = screen.getByLabelText('철수 이름 수정');
    await user.clear(input);
    await user.type(input, '엉뚱한이름');
    await user.keyboard('{Escape}');

    expect(useSettlementStore.getState().settlement.members[0].name).toBe('철수');
    expect(within(participantList()).getByRole('button', { name: '철수' })).toBeInTheDocument();
  });

  it('한 글자 이름 참여자 칩의 삭제 버튼도 44x44px 히트 영역을 갖는다', () => {
    useSettlementStore.getState().addMember('가');
    render(<MemberEditor />);

    const deleteButton = screen.getByRole('button', { name: '가 삭제' });
    expect(deleteButton.className).toMatch(/min-h-11/);
    expect(deleteButton.className).toMatch(/min-w-11/);
    const chip = deleteButton.closest('li');
    expect(chip?.className).toMatch(/min-h-11/);
    expect(chip?.className).toMatch(/min-w-11/);
  });

  it('멤버가 여러 명이면 참여자 칩이 flex-wrap 컨테이너 안에 내용 폭으로 렌더된다 (가로 스크롤 방지)', () => {
    for (let i = 1; i <= 10; i++) {
      useSettlementStore.getState().addMember(`멤버${i}`);
    }
    render(<MemberEditor />);

    const list = participantList();
    expect(list.tagName).toBe('UL');
    expect(list.className).toMatch(/flex-wrap/);

    const chip = within(list).getByRole('button', { name: '멤버1' }).closest('li');
    expect(chip?.className).toMatch(/inline-flex/);
    expect(chip?.className).not.toMatch(/w-full/);
  });
});

describe('MemberEditor — 칩 내부 탭 대상 히트 영역', () => {
  beforeEach(() => {
    usePrefsStore.setState({ ...initialPrefs });
    useSettlementStore.getState().resetSession();
  });

  /**
   * 실제 손가락이 닿는 건 칩 컨테이너가 아니라 그 안의 이름 버튼이다.
   * 컨테이너에만 min-h-11/min-w-11 을 걸고 안쪽 버튼을 min-h-9 로 두면
   * 한 글자 이름에서 28x36px 이 되어 최소 탭 영역에 못 미친다. 그래서 컨테이너가 아니라
   * 버튼을 검사한다.
   */
  it('한 글자 이름의 이름 버튼도 44px 최소 크기를 갖는다', () => {
    useSettlementStore.getState().addMember('가');
    render(<MemberEditor />);

    // "가" 는 참여자 칩과 최근 멤버 칩 양쪽에 있다. 둘 다 탭 대상이므로 전부 검사한다.
    const buttons = screen.getAllByRole('button', { name: '가' });
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      expect(b.className).toContain('min-h-11');
      expect(b.className).toContain('min-w-11');
    }
  });

  it('인라인 편집 입력도 44px 높이를 갖는다', async () => {
    const user = userEvent.setup();
    useSettlementStore.getState().addMember('가');
    render(<MemberEditor />);

    // 최근 멤버 칩(점선 테두리)은 "추가" 동작이라 편집이 안 열린다. 참여자 칩을 골라야 한다.
    const chipNameButton = screen
      .getAllByRole('button', { name: '가' })
      .find((b) => !b.className.includes('border-dashed'));
    expect(chipNameButton).toBeDefined();
    await user.click(chipNameButton!);
    const input = screen.getByDisplayValue('가');
    expect(input.className).toContain('min-h-11');
  });
});

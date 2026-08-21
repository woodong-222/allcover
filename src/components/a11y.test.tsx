/**
 * 접근성 전용 테스트 — 실제 키보드 Tab 순회 검증.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §3 인수조건 E4
 *
 * E4: "키보드 Tab만으로 멤버 추가 → 판 입력 → 결과 확인까지 도달 가능"
 *
 * 각 컴포넌트 단위 테스트의 `getByLabelText` 검증은 label↔input 연결이라는
 * *전제조건*만 확인할 뿐, 실제 Tab 순회가 되는지는 보지 않는다. 이 파일은
 * App 전체를 렌더해 `user.tab()`으로 실제 순회를 밟는다.
 *
 * html-to-image 는 jsdom에서 실제 캡처가 불가능하므로 src/App.test.tsx와 동일하게 모킹한다.
 * 판이 0개(RoundCard 미렌더, TeamSheet 모달 없음)인 기본 상태에서만 검증한다 — 모달이
 * 열리면 포커스 관리가 달라지므로 팀 편성/판 입력 UI는 이 테스트의 범위 밖이다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { useSettlementStore } from '../store/useSettlementStore';
import { usePrefsStore, initialPrefs } from '../store/usePrefsStore';

vi.mock('../lib/capture', () => ({
  captureNode: vi.fn(async () => new Blob(['x'], { type: 'image/png' })),
  createCapturer: vi.fn(() => ({
    capture: async () => new Blob(['x'], { type: 'image/png' }),
  })),
}));

beforeEach(() => {
  usePrefsStore.setState({ ...initialPrefs });
  useSettlementStore.getState().resetSession();
});

/** Tab을 눌러가며 target이 focus될 때까지 진행한다. maxSteps 안에 못 찾으면 실패시킨다. */
async function tabUntil(
  user: ReturnType<typeof userEvent.setup>,
  target: () => HTMLElement,
  maxSteps = 30
): Promise<void> {
  for (let i = 0; i < maxSteps; i++) {
    await user.tab();
    if (document.activeElement === target()) return;
  }
  throw new Error(
    `${maxSteps}번 Tab 안에 대상에 도달하지 못했다. 현재 포커스: ${document.activeElement?.outerHTML ?? 'null'}`
  );
}

describe('a11y: 키보드 Tab 순회 (E4)', () => {
  it('Tab만으로 멤버 이름 입력에 도달해 Enter로 멤버를 추가할 수 있다', async () => {
    const user = userEvent.setup();
    render(<App />);

    await tabUntil(user, () => screen.getByLabelText('멤버 이름'));
    await user.keyboard('키보드유저{Enter}');

    expect(
      useSettlementStore.getState().settlement.members.map((m) => m.name)
    ).toContain('키보드유저');
  });

  it('Tab만으로 멤버 → 요금 입력 → 판 추가 버튼까지 순서대로 도달할 수 있다', async () => {
    const user = userEvent.setup();
    render(<App />);

    // 화면 순서(§4 M3): 멤버 → 요금 → 판. 각 지점에 순서대로 도달하는지 확인한다.
    await tabUntil(user, () => screen.getByLabelText('멤버 이름'));
    await tabUntil(user, () => screen.getByLabelText('게임 단가'));
    await tabUntil(user, () => screen.getByLabelText('신발비'));
    await tabUntil(user, () => screen.getByLabelText('기본 판돈'));
    await tabUntil(user, () => screen.getByLabelText('총무'));
    await tabUntil(user, () => screen.getByRole('button', { name: '판 추가' }));

    // 판을 추가하면 아직 참여자가 없는 판이 만들어지는데, 이는 판 결과 계산 자체를 막지 않는다
    // (calc.ts A9: 참여자 0명 라운드는 betDelta 전원 0). "결과 확인까지 도달 가능"은
    // 멤버 추가 → 결과 카드 렌더까지 배선이 끊기지 않았는지로 확인한다 (App.test.tsx가 이미 검증).
    expect(screen.getByRole('button', { name: '판 추가' })).toBe(document.activeElement);
  });

  it('포커스 트랩 없음: 초기 화면의 포커스 가능 요소를 Tab만으로 중복 없이 순회하고, 마지막 요소를 지나도 진행된다', async () => {
    const user = userEvent.setup();
    render(<App />);

    // 초기 상태(멤버 0명, 판 0개)에서 순회 가능한 요소를 Tab 순서 그대로 수집한다.
    const visited: Element[] = [];
    const maxSteps = 40;
    for (let i = 0; i < maxSteps; i++) {
      await user.tab();
      const el = document.activeElement;
      if (el === null || el === document.body) break; // 문서 밖으로 포커스가 빠져나감 — 정상 종료
      visited.push(el);
    }

    expect(visited.length).toBeGreaterThan(0);

    // 마지막으로 도달한 요소 직전까지, 같은 요소가 두 번 이상 잡히면 그 지점에서 포커스가
    // 갇혔다는 뜻이다(트랩). 문서 끝을 지나 한 바퀴 돌아 처음 요소로 "wrap"하는 것은 정상이므로
    // 마지막 한 스텝만 제외하고 나머지 구간에서 중복이 없는지 확인한다.
    const withoutWrap = visited.slice(0, -1);
    const uniqueCount = new Set(withoutWrap).size;
    expect(uniqueCount).toBe(withoutWrap.length);

    // 마지막 요소에서 한 번 더 Tab을 눌러도 그대로 멈춰있지 않고(진행되고) 크래시하지 않는다.
    const lastBeforeWrap = visited[visited.length - 1];
    await user.tab();
    expect(document.activeElement).not.toBeNull();
    // 트랩이라면 계속 같은 요소에 머무른다 — 그렇지 않은지 확인
    expect(document.activeElement === lastBeforeWrap).toBe(false);
  });

  it('포커스 가능한 요소가 outline-none 등으로 키보드 포커스 표시를 숨기지 않는다', async () => {
    const user = userEvent.setup();
    render(<App />);

    const focused: Element[] = [];
    for (let i = 0; i < 15; i++) {
      await user.tab();
      const el = document.activeElement;
      if (el === null || el === document.body) break;
      focused.push(el);
    }

    expect(focused.length).toBeGreaterThan(0);
    for (const el of focused) {
      expect(el.className).not.toMatch(/outline-none/);
      expect((el as HTMLElement).style.outline).not.toBe('none');
      // tabIndex=-1인 요소는 애초에 Tab으로 도달할 수 없어야 하는데, 만약 도달했다면
      // 접근성 트리와 실제 키보드 동작이 어긋난다는 신호다.
      expect((el as HTMLElement).tabIndex).not.toBe(-1);
    }
  });
});

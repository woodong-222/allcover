import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Round, Settlement } from '../types';
import { roundDelta } from '../lib/calc';
import { useSettlementStore } from '../store/useSettlementStore';
import { PayoutEditor, distributeRemainder } from './PayoutEditor';

const MEMBERS = [
  { id: 'a', name: '가나' },
  { id: 'b', name: '나다' },
  { id: 'c', name: '다라' },
  { id: 'd', name: '라마' },
  { id: 'e', name: '마바' },
  { id: 'f', name: '바사' },
  { id: 'g', name: '사아' },
  { id: 'h', name: '아자' },
  { id: 'i', name: '자차' },
  { id: 'j', name: '차카' },
];

const ALL_IDS = MEMBERS.map((m) => m.id);

function makeRound(patch: Partial<Round> = {}): Round {
  return {
    id: 'r1',
    participants: ['a', 'b', 'c', 'd', 'e'],
    teams: null,
    method: 'pot',
    ante: 1000,
    payout: [],
    ranking: [],
    losers: [],
    transferSource: 'gameFee',
    transferAmount: 0,
    ...patch,
  };
}

function seed(round: Round): void {
  const settlement: Settlement = {
    version: 1,
    id: 's1',
    date: '2026-08-21T00:00:00.000Z',
    members: MEMBERS,
    gameFeePerGame: 4000,
    shoeFee: 2000,
    shoeRenters: [],
    rounds: [round],
    extras: [],
  };
  useSettlementStore.setState({ settlement });
}

function Harness() {
  const round = useSettlementStore((s) => s.settlement.rounds[0]);
  return <PayoutEditor round={round} />;
}

function currentRound(): Round {
  return useSettlementStore.getState().settlement.rounds[0];
}

describe('PayoutEditor', () => {
  beforeEach(() => {
    seed(makeRound());
  });

  it('순위가 비어 있으면 안내만 보여준다', () => {
    render(<Harness />);
    expect(screen.getByText('먼저 순위를 정해주세요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '나머지 자동 분배' })).not.toBeInTheDocument();
  });

  it('ante 1,000 / 5명 / 1등 3,000 · 2등 2,000 이면 남은 판돈 0원', () => {
    seed(makeRound({ ranking: [['a'], ['b']], payout: [3000, 2000] }));
    render(<Harness />);

    expect(screen.getByText('남은 판돈 0원')).toBeInTheDocument();
    expect(roundDelta(currentRound(), 4000).imbalance).toBe(0);
  });

  it('배당 합계가 판돈에 못 미치면 남은 금액을 표시한다', () => {
    seed(makeRound({ ranking: [['a'], ['b']], payout: [3000, 1000] }));
    render(<Harness />);
    expect(screen.getByText('남은 판돈 1,000원 남음')).toBeInTheDocument();
  });

  it('배당 합계가 판돈을 초과하면 경고를 표시한다', () => {
    seed(makeRound({ ranking: [['a'], ['b']], payout: [4000, 3000] }));
    render(<Harness />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('남은 판돈 2,000원 초과');
    expect(status.className).toMatch(/text-red-800/);
  });

  it('"나머지 자동 분배" 클릭 후 imbalance가 정확히 0이 된다', async () => {
    seed(makeRound({ ranking: [['a'], ['b']], payout: [3000, 1000] }));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '나머지 자동 분배' }));

    expect(roundDelta(currentRound(), 4000).imbalance).toBe(0);
    expect(currentRound().payout).toEqual([3000, 2000]);
    expect(screen.getByText('남은 판돈 0원')).toBeInTheDocument();
  });

  it('팀전에서 100원 단위로 나눠떨어지지 않아도 imbalance가 정확히 0이 된다', async () => {
    const teamCases: { label: string; teams: string[][]; ante: number }[] = [
      // 2:3 팀전, 남은 판돈 3,500원 → 마지막(3명)에 인당 1,100원, 잔액 200원은 1등(2명)에 100원씩
      { label: '2:3', teams: [['a', 'b'], ['c', 'd', 'e']], ante: 1100 },
      // 3:2 팀전, 남은 판돈 2,650원 → 1등(3명)으로는 안 나뉘어 마지막(2명)에 인당 1,325원
      { label: '3:2', teams: [['a', 'b', 'c'], ['d', 'e']], ante: 1130 },
    ];

    for (const { teams, ante } of teamCases) {
      seed(makeRound({ teams, ranking: teams, ante, payout: [1000, 0] }));
      const user = userEvent.setup();
      const view = render(<Harness />);

      await user.click(screen.getByRole('button', { name: '나머지 자동 분배' }));

      expect(roundDelta(currentRound(), 4000).imbalance).toBe(0);
      expect(currentRound().payout.every((p) => p >= 0)).toBe(true);
      view.unmount();
    }
  });

  it('초과 배당도 "나머지 자동 분배"로 정확히 0이 된다', async () => {
    seed(makeRound({ ranking: [['a'], ['b']], payout: [9000, 4000] }));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '나머지 자동 분배' }));

    expect(roundDelta(currentRound(), 4000).imbalance).toBe(0);
    expect(currentRound().payout.every((p) => p >= 0)).toBe(true);
  });

  it('남은 판돈이 0이면 "나머지 자동 분배" 버튼이 비활성화된다', () => {
    seed(makeRound({ ranking: [['a'], ['b']], payout: [3000, 2000] }));
    render(<Harness />);
    expect(screen.getByRole('button', { name: '나머지 자동 분배' })).toBeDisabled();
  });

  it('승자독식 프리셋은 pot 전액을 1등 그룹 인당 배당으로 넣는다', async () => {
    seed(makeRound({ ranking: [['a'], ['b']], payout: [0, 0] }));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '승자독식' }));

    expect(currentRound().payout).toEqual([5000, 0]);
    expect(roundDelta(currentRound(), 4000).imbalance).toBe(0);
  });

  it('1·2등 차등 프리셋은 pot의 60/40으로 나눈다', async () => {
    seed(makeRound({ ranking: [['a'], ['b']], payout: [0, 0] }));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '1·2등 차등' }));

    expect(currentRound().payout).toEqual([3000, 2000]);
  });

  it('등수별 인당 배당 입력이 setPayout으로 반영된다 (inputMode numeric)', async () => {
    seed(makeRound({ ranking: [['a'], ['b']], payout: [0, 0] }));
    const user = userEvent.setup();
    render(<Harness />);

    const first = screen.getByLabelText('1등 인당 배당');
    expect(first).toHaveAttribute('inputMode', 'numeric');
    await user.type(first, '3000');

    expect(currentRound().payout).toEqual([3000, 0]);
  });

  it('액션 버튼이 44px 히트 영역을 갖는다', () => {
    seed(makeRound({ ranking: [['a'], ['b']], payout: [0, 0] }));
    render(<Harness />);
    for (const name of ['나머지 자동 분배', '승자독식', '1·2등 차등']) {
      const button = screen.getByRole('button', { name });
      expect(button.className).toMatch(/min-h-\[44px\]/);
      expect(button.className).toMatch(/min-w-\[44px\]/);
    }
  });
});

/**
 * 프리셋과 자동 분배가 소수 payout을 만들면 (a) 결과 카드·공유 이미지에 소수가 찍히고
 * (b) NumberField가 소수점을 제거해 금액이 100배로 튀며 (c) (pot/n)*n !== pot 인 인원수에서
 * imbalance에 부동소수 먼지가 남아 "0원 어긋남"이라는 무의미한 경고가 뜬다.
 */
describe('PayoutEditor — 배당액 정수 보장', () => {
  /** n1:n2:n3 팀 구성으로 참여자와 순위를 만든다. ranking은 팀 그대로 */
  function teamRound(groupSizes: number[], ante: number, payout: number[]): Round {
    const teams: string[][] = [];
    let cursor = 0;
    for (const n of groupSizes) {
      teams.push(ALL_IDS.slice(cursor, cursor + n));
      cursor += n;
    }
    return makeRound({
      participants: ALL_IDS.slice(0, cursor),
      teams,
      ranking: teams,
      ante,
      payout,
    });
  }

  it('7명 3팀(3/2/2) 승자독식 → payout 전원 정수이고 imbalance가 정확히 0', async () => {
    // pot 7,000을 3명 그룹에 균등 배분하면 2333.333…이 된다. 이 값이 그대로 들어가면 안 된다.
    seed(teamRound([3, 2, 2], 1000, [0, 0, 0]));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '승자독식' }));

    const payout = currentRound().payout;
    expect(payout.every((p) => Number.isInteger(p))).toBe(true);
    expect(payout.every((p) => p >= 0)).toBe(true);
    expect(roundDelta(currentRound(), 4000).imbalance).toBe(0);
  });

  it('7명 3팀(3/2/2)에서 자동 분배 후 imbalance가 정확히 0이고 payout이 정수', async () => {
    // 내림한 1등 배당만 들어간 상태(잔액 1원). 1원은 어느 그룹 인원수로도 안 나뉜다.
    seed(teamRound([3, 2, 2], 1000, [2333, 0, 0]));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '나머지 자동 분배' }));

    const payout = currentRound().payout;
    expect(payout.every((p) => Number.isInteger(p))).toBe(true);
    expect(payout.every((p) => p >= 0)).toBe(true);
    expect(roundDelta(currentRound(), 4000).imbalance).toBe(0);
  });

  it('참여 9명 ante 100, 7명 그룹 + 2명 그룹 → 자동 분배 후 imbalance가 정확히 0', async () => {
    seed(teamRound([7, 2], 100, [100, 0]));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '나머지 자동 분배' }));

    const payout = currentRound().payout;
    expect(payout.every((p) => Number.isInteger(p))).toBe(true);
    expect(roundDelta(currentRound(), 4000).imbalance).toBe(0);
    expect(screen.getByText('남은 판돈 0원')).toBeInTheDocument();
  });

  it('정수 해가 없는 판에서도 소수를 만들지 않고 잔액을 정수로 남긴다', async () => {
    // 참여 9명 ante 100 → pot 900, 등수 그룹이 7명 하나뿐. 900 % 7 === 4 이므로
    // 7·p === 900 인 정수 p가 존재하지 않는다. 소수로 맞추면 imbalance에 1.1e-13이 남는다.
    seed(
      makeRound({
        participants: ALL_IDS.slice(0, 9),
        teams: [ALL_IDS.slice(0, 7)],
        ranking: [ALL_IDS.slice(0, 7)],
        ante: 100,
        payout: [0],
      }),
    );
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '나머지 자동 분배' }));

    const payout = currentRound().payout;
    const { imbalance } = roundDelta(currentRound(), 4000);
    expect(payout.every((p) => Number.isInteger(p))).toBe(true);
    // 남은 금액은 부동소수 먼지가 아니라 사람이 읽을 수 있는 정수여야 한다.
    expect(Number.isInteger(imbalance)).toBe(true);
    expect(imbalance).toBe(-4);
    expect(screen.getByText('남은 판돈 4원 남음')).toBeInTheDocument();
    // 더 줄일 수 없으므로 버튼은 비활성이 된다 (눌러도 안 바뀌는 버튼을 남기지 않는다)
    expect(screen.getByRole('button', { name: '나머지 자동 분배' })).toBeDisabled();
  });

  it('프리셋 2종 × 그룹 인원 1~5 조합 전부에서 payout이 정수이고 음수가 없다', async () => {
    const user = userEvent.setup();
    for (const n1 of [1, 2, 3, 4, 5]) {
      for (const n2 of [1, 2, 3, 4, 5]) {
        for (const preset of ['승자독식', '1·2등 차등']) {
          seed(teamRound([n1, n2], 1000, [0, 0]));
          const view = render(<Harness />);

          await user.click(screen.getByRole('button', { name: preset }));

          const payout = currentRound().payout;
          const label = `${preset} ${n1}:${n2}`;
          expect(payout.every((p) => Number.isInteger(p)), `${label} 정수`).toBe(true);
          expect(payout.every((p) => p >= 0), `${label} 음수 없음`).toBe(true);
          expect(
            Number.isInteger(roundDelta(currentRound(), 4000).imbalance),
            `${label} imbalance 정수`,
          ).toBe(true);
          view.unmount();
        }
      }
    }
  });
});

describe('distributeRemainder — 탐색 상한', () => {
  /**
   * 4단계 정수 해 탐색의 window 는 잔액에 선형 비례한다. 상한이 없으면 배당액 10억 입력 시
   * 7.5억 회를 돌아 메인 스레드가 10초 넘게 멈춘다. 게다가 PayoutEditor 가 매 렌더마다
   * 이 함수를 부르고 payout 은 localStorage 에 저장되므로, 새로고침해도 같은 값으로 다시
   * 멈춰 앱이 영구적으로 못 쓰게 된다.
   */
  it('배당액이 아무리 커도 유한 시간 안에 반환한다', () => {
    const started = Date.now();
    const out = distributeRemainder([1_000_000_000, 0, 0], [3, 4, 5], 7000);
    const elapsed = Date.now() - started;

    // 상한을 지우면 이 케이스가 수 초~수십 초 걸린다. 넉넉히 잡아도 2초를 넘으면 실패다.
    expect(elapsed).toBeLessThan(2000);
    expect(out).toHaveLength(3);
    expect(out.every(Number.isInteger)).toBe(true);
  });

  it('상한에 걸려도 음수 배당을 만들지 않는다', () => {
    // 상한 소진 시 5단계(최대한 담고 잔액은 남긴다)로 떨어지는데, 그 경로가 배당을
    // 음수로 만들면 사용자가 돈을 돌려받는 이상한 결과가 된다.
    const out = distributeRemainder([2_000_000_000, 0], [7, 11], 5000);
    expect(out.every((p) => p >= 0)).toBe(true);
    expect(out.every(Number.isInteger)).toBe(true);
  });
});

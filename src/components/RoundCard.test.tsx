import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Round, Settlement } from '../types';
import { roundDelta } from '../lib/calc';
import { useSettlementStore } from '../store/useSettlementStore';
import { RoundCard } from './RoundCard';

const MEMBERS = [
  { id: 'a', name: '가나' },
  { id: 'b', name: '나다' },
  { id: 'c', name: '다라' },
  { id: 'd', name: '라마' },
];

function makeRound(patch: Partial<Round> = {}): Round {
  return {
    id: 'r1',
    participants: ['a', 'b', 'c', 'd'],
    teams: null,
    method: 'none',
    ante: 1000,
    payout: [],
    ranking: [],
    losers: [],
    transferSource: 'gameFee',
    transferAmount: 0,
    ...patch,
  };
}

function seed(round: Round, members = MEMBERS): void {
  const settlement: Settlement = {
    version: 1,
    id: 's1',
    date: '2026-08-21T00:00:00.000Z',
    mode: 'bet',
    members,
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
  if (!round) return <p>없음</p>;
  return <RoundCard round={round} index={0} />;
}

function currentRound(): Round {
  return useSettlementStore.getState().settlement.rounds[0];
}

describe('RoundCard', () => {
  beforeEach(() => {
    seed(makeRound());
  });

  it('판 번호와 복제/삭제 버튼을 보여준다', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByRole('heading', { name: '1판' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '복제' }));
    expect(useSettlementStore.getState().settlement.rounds).toHaveLength(2);

    await user.click(screen.getAllByRole('button', { name: '삭제' })[0]);
    expect(useSettlementStore.getState().settlement.rounds).toHaveLength(1);
  });

  it('참여자 칩을 탭하면 참여가 토글된다', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const group = screen.getByRole('group', { name: '참여자' });
    await user.click(within(group).getByRole('button', { name: '나다' }));

    expect(currentRound().participants).toEqual(['a', 'c', 'd']);
  });

  it('팀 상태 요약을 보여준다', () => {
    seed(makeRound({ teams: [['a', 'b'], ['c', 'd']] }));
    render(<Harness />);
    expect(screen.getByText('2팀 (2:2)')).toBeInTheDocument();
  });

  it('개인전이면 팀 요약이 "개인전"이다', () => {
    render(<Harness />);
    expect(screen.getByText('개인전')).toBeInTheDocument();
  });

  it('방식을 transfer로 바꾸면 판돈/배당 UI가 사라지고 진 쪽 선택이 나온다', async () => {
    seed(makeRound({ method: 'pot', ranking: [['a']], payout: [4000] }));
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByLabelText('인당 판돈')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '순위' })).toBeInTheDocument();
    expect(screen.getByLabelText('1등 인당 배당')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '판비 내주기' }));

    expect(screen.queryByLabelText('인당 판돈')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '순위' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('1등 인당 배당')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: '진 쪽' })).toBeInTheDocument();
  });

  it('transfer 금액 소스를 직접 입력으로 바꾸면 금액 필드가 나온다', async () => {
    seed(makeRound({ method: 'transfer' }));
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByText('한판비 4,000원을 그대로 씁니다.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '직접 입력' }));

    expect(currentRound().transferSource).toBe('custom');
    expect(screen.getByLabelText('내줄 금액 (1인분)')).toBeInTheDocument();
  });

  it('팀이 있을 때 진 쪽 팀 칩을 탭하면 그 팀 전원이 losers에 들어간다', async () => {
    seed(
      makeRound({
        method: 'transfer',
        teams: [
          ['a', 'b'],
          ['c', 'd'],
        ],
      }),
    );
    const user = userEvent.setup();
    render(<Harness />);

    const group = screen.getByRole('group', { name: '진 쪽' });
    await user.click(within(group).getByRole('button', { name: /2팀/ }));

    expect(currentRound().losers).toEqual(['c', 'd']);
  });

  it('개인전이면 진 쪽을 멤버 단위로 고른다', async () => {
    seed(makeRound({ method: 'transfer' }));
    const user = userEvent.setup();
    render(<Harness />);

    const group = screen.getByRole('group', { name: '진 쪽' });
    await user.click(within(group).getByRole('button', { name: '라마' }));

    expect(currentRound().losers).toEqual(['d']);
  });

  it('R4: imbalance가 0이 아닌 판에 경고 배지가 뜬다', () => {
    // ante 1,000 × 4명 = 4,000 판돈인데 1등에게 3,000만 배당 → imbalance -1,000
    seed(makeRound({ method: 'pot', ranking: [['a']], payout: [3000] }));
    render(<Harness />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('판돈 불일치');
    expect(alert).toHaveTextContent('1,000원');
  });

  it('imbalance가 0이면 경고 배지가 없다', () => {
    seed(makeRound({ method: 'pot', ranking: [['a']], payout: [4000] }));
    render(<Harness />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('팀 편성 변경 버튼으로 TeamSheet를 연다', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '팀 편성 변경' }));
    expect(screen.getByRole('dialog', { name: '팀 편성' })).toBeInTheDocument();
  });

  it('E1/E2: 칩 목록은 flex-wrap이고 칩/버튼이 44px 히트 영역을 갖는다', () => {
    render(<Harness />);

    const group = screen.getByRole('group', { name: '참여자' });
    const chip = within(group).getByRole('button', { name: '가나' });
    expect(chip.className).toMatch(/min-h-\[44px\]/);
    expect(chip.className).toMatch(/min-w-\[44px\]/);
    expect(chip.parentElement?.className).toMatch(/flex-wrap/);

    for (const name of ['복제', '삭제', '팀 편성 변경', '없음', '판돈 분배', '판비 내주기']) {
      expect(screen.getByRole('button', { name }).className).toMatch(/min-h-\[44px\]/);
    }
  });
});

/**
 * finding #3 회귀 방지 — 소수 배당이 만들던 "0원 어긋남" 가짜 경고.
 * 예전에는 승자독식이 pot/인원을 그대로 넣어 2333.333…을 만들었고,
 * (pot/n)*n !== pot 인 인원수에서는 imbalance에 1.1e-13이 남았다.
 * formatKRW가 그 값을 "0원"으로 찍어 "판돈보다 0원 적습니다"라는 무의미한 빨간 경고가 떴다.
 */
describe('RoundCard — 가짜 불일치 경고 (finding #3)', () => {
  const NINE = Array.from({ length: 9 }, (_, i) => ({ id: `m${i}`, name: `참가자${i}` }));
  const NINE_IDS = NINE.map((m) => m.id);

  /**
   * groupSizes 대로 팀을 짜고 그 순서를 그대로 ranking 으로 쓴다.
   * participantCount 를 팀 인원 합보다 크게 주면 나머지는 순위 없는 무배당 참여자가 된다.
   */
  function potRound(groupSizes: number[], ante: number, participantCount?: number): Round {
    const teams: string[][] = [];
    let cursor = 0;
    for (const n of groupSizes) {
      teams.push(NINE_IDS.slice(cursor, cursor + n));
      cursor += n;
    }
    return makeRound({
      method: 'pot',
      participants: NINE_IDS.slice(0, participantCount ?? cursor),
      teams,
      ranking: teams,
      ante,
      payout: teams.map(() => 0),
    });
  }

  it('7명 3팀(3/2/2) 승자독식은 소수 배당을 만들지 않는다', async () => {
    // pot 7,000 / 1등 3명. 예전 구현은 2333.3333333333335 를 그대로 payout 에 넣었다.
    seed(potRound([3, 2, 2], 1000), NINE);
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '승자독식' }));

    expect(currentRound().payout.every((p) => Number.isInteger(p))).toBe(true);
    expect(roundDelta(currentRound(), 4000).imbalance).toBe(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('정수로 나눌 수 없는 판은 "0원"이 아니라 실제 남은 금액을 경고한다', async () => {
    // 9명 ante 100 → pot 900, 등수 그룹은 7명 하나. 900 % 7 === 4 라 정수 해가 없다.
    // 예전 구현: payout 128.571… → imbalance 1.14e-13 → "판돈보다 0원 적습니다" 라는 가짜 경고.
    seed(potRound([7], 100, 9), NINE);
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '승자독식' }));

    expect(currentRound().payout.every((p) => Number.isInteger(p))).toBe(true);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('판돈 불일치');
    expect(alert).toHaveTextContent('4원');
    expect(alert).not.toHaveTextContent('0원'); // 가짜 경고의 지문
  });
});

/**
 * §5-A-2 정산 모드 / 내기 모드. 인수조건 G3, G5.
 *
 * 정산 모드에서는 판이 "누가 몇 판 쳤나"만 센다. 내기 UI를 전부 숨기되
 * 라운드에 들어 있는 method/ante/payout/ranking/losers/teams 는 **지우지 않는다.**
 * 잘못 눌렀을 때 순위·배당이 날아가면 복구할 방법이 없기 때문이다.
 */
describe('RoundCard — 정산 모드 게이트 (G3, G5)', () => {
  /** 내기 입력이 꽉 찬 라운드. imbalance 도 0이 아니다 (pot 4,000 vs 배당 3,000) */
  function loadedRound(): Round {
    return makeRound({
      method: 'pot',
      teams: [
        ['a', 'b'],
        ['c', 'd'],
      ],
      ranking: [['a', 'b']],
      payout: [3000],
      losers: ['c', 'd'],
      ante: 1000,
    });
  }

  function seedWithMode(mode: 'normal' | 'bet', round: Round): void {
    seed(round);
    useSettlementStore.setState((s) => ({ settlement: { ...s.settlement, mode } }));
  }

  const BET_UI_QUERIES: [string, () => HTMLElement | null][] = [
    ['방식 세그먼트 없음', () => screen.queryByRole('button', { name: '없음' })],
    ['방식 세그먼트 판돈 분배', () => screen.queryByRole('button', { name: '판돈 분배' })],
    ['방식 세그먼트 판비 내주기', () => screen.queryByRole('button', { name: '판비 내주기' })],
    ['인당 판돈 입력', () => screen.queryByLabelText('인당 판돈')],
    ['RankPicker', () => screen.queryByRole('group', { name: '순위' })],
    ['PayoutEditor', () => screen.queryByLabelText('1등 인당 배당')],
    ['팀 편성 버튼', () => screen.queryByRole('button', { name: '팀 편성 변경' })],
  ];

  it('G3: 정산 모드에서는 내기 UI가 전부 렌더되지 않는다', () => {
    seedWithMode('normal', loadedRound());
    render(<Harness />);

    for (const [label, query] of BET_UI_QUERIES) {
      expect(query(), label).toBeNull();
    }
    // 진 쪽 선택도 없다 (transfer 로 바꿔도 마찬가지지만, 방식 세그먼트 자체가 없다)
    expect(screen.queryByRole('group', { name: '진 쪽' })).toBeNull();
  });

  it('G3: 내기 모드에서는 같은 라운드에서 내기 UI가 전부 보인다', () => {
    seedWithMode('bet', loadedRound());
    render(<Harness />);

    for (const [label, query] of BET_UI_QUERIES) {
      expect(query(), label).not.toBeNull();
    }
  });

  it('G3: 정산 모드에서도 판 번호·참여자·복제/삭제는 남는다', async () => {
    seedWithMode('normal', loadedRound());
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByRole('heading', { name: '1판' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '복제' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();

    // 참여자 체크는 정산 모드의 핵심 기능이라 계속 동작해야 한다
    const group = screen.getByRole('group', { name: '참여자' });
    await user.click(within(group).getByRole('button', { name: '나다' }));
    expect(currentRound().participants).toEqual(['a', 'c', 'd']);
  });

  it('G5: imbalance가 0이 아닌 라운드라도 정산 모드면 경고가 렌더되지 않는다', () => {
    const round = loadedRound();
    // 내기 모드에서는 실제로 경고가 뜨는 라운드임을 먼저 고정한다
    seedWithMode('bet', round);
    const bet = render(<Harness />);
    expect(screen.getByRole('alert')).toHaveTextContent('판돈 불일치');
    bet.unmount();

    seedWithMode('normal', round);
    render(<Harness />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('G2/비파괴: 정산 모드로 렌더해도 라운드의 내기 데이터가 그대로 남는다', () => {
    const round = loadedRound();
    const before = {
      method: round.method,
      ante: round.ante,
      payout: [...round.payout],
      ranking: round.ranking.map((g) => [...g]),
      losers: [...round.losers],
      teams: round.teams?.map((t) => [...t]) ?? null,
    };

    seedWithMode('normal', round);
    render(<Harness />);

    const after = currentRound();
    expect(after.method).toEqual(before.method);
    expect(after.ante).toEqual(before.ante);
    expect(after.payout).toEqual(before.payout);
    expect(after.ranking).toEqual(before.ranking);
    expect(after.losers).toEqual(before.losers);
    expect(after.teams).toEqual(before.teams);
  });
});

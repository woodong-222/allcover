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
    id: 's1',
    date: '2026-08-21T00:00:00.000Z',
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
    seed(makeRound({ method: 'pot', teams: [['a', 'b'], ['c', 'd']] }));
    render(<Harness />);
    expect(screen.getByText('2팀 (2:2)')).toBeInTheDocument();
  });

  it('개인전이면 팀 요약이 "개인전"이다', () => {
    seed(makeRound({ method: 'pot' }));
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

  it('imbalance가 0이 아닌 판에 경고 배지가 뜬다', () => {
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
    seed(makeRound({ method: 'pot' }));
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '팀 편성 변경' }));
    expect(screen.getByRole('dialog', { name: '팀 편성' })).toBeInTheDocument();
  });

  /**
   * 히트 영역은 실제 클릭 대상(button)에서 잰다. 감싸는 컨테이너에만 min-h 를 붙이면
   * 안쪽 버튼이 28×36px 로 남을 수 있으므로, 컨테이너를 보는 검사로 대체하면 안 된다.
   */
  it('칩 목록은 flex-wrap이고 칩/버튼이 44px 히트 영역을 갖는다', () => {
    seed(makeRound({ method: 'pot' }));
    render(<Harness />);

    const group = screen.getByRole('group', { name: '참여자' });
    const chip = within(group).getByRole('button', { name: '가나' });
    expect(chip.className).toMatch(/min-h-\[44px\]/);
    expect(chip.className).toMatch(/min-w-\[44px\]/);
    expect(chip.parentElement?.className).toMatch(/flex-wrap/);

    for (const name of ['복제', '삭제', '팀 편성 변경', '정산', '내기', '판돈 분배', '판비 내주기']) {
      const button = screen.getByRole('button', { name });
      expect(button.className, name).toMatch(/min-h-\[44px\]/);
      expect(button.className, name).toMatch(/min-w-\[44px\]/);
    }

    // 두 세그먼트 모두 flex-wrap 이라 320px 에서 줄바꿈될지언정 가로로 넘치지 않는다
    for (const legend of ['정산 방식', '내기 방식']) {
      const seg = screen.getByRole('group', { name: legend });
      const first = within(seg).getAllByRole('button')[0];
      expect(first.parentElement?.className, legend).toMatch(/flex-wrap/);
    }
  });
});

/**
 * 소수 배당이 만드는 "0원 어긋남" 가짜 경고를 막는다.
 * 승자독식이 pot/인원을 그대로 넣으면 2333.333…이 되고, (pot/n)*n !== pot 인 인원수에서는
 * imbalance에 1.1e-13이 남는다. formatKRW가 그 값을 "0원"으로 찍으면
 * "판돈보다 0원 적습니다"라는 무의미한 빨간 경고가 뜬다.
 */
describe('RoundCard — 가짜 불일치 경고', () => {
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
    // pot 7,000 / 1등 3명. 그대로 나누면 2333.3333333333335 가 payout 에 들어간다.
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
    // 소수로 맞추면 payout 128.571… → imbalance 1.14e-13 → "판돈보다 0원 적습니다" 라는 가짜 경고.
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
 * 2단 세그먼트 — 1단 `정산 / 내기`, 2단 `판돈 분배 / 판비 내주기`.
 *
 * 정산/내기는 판마다 `Round.method` 로 정해진다. 정산('none')을 고른 판은 내기 UI를
 * 전부 숨기되, 라운드에 들어 있는 ante/payout/ranking/losers/teams 는 지우지 않는다.
 * 잘못 눌렀을 때 순위·배당이 날아가면 복구할 방법이 없기 때문이다.
 */
describe('RoundCard — 정산/내기 2단 세그먼트', () => {
  /** 내기 입력이 꽉 찬 라운드. imbalance 도 0이 아니다 (pot 4,000 vs 배당 3,000) */
  function loadedRound(patch: Partial<Round> = {}): Round {
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
      ...patch,
    });
  }

  const BET_UI_QUERIES: [string, () => HTMLElement | null][] = [
    ['내기 방식 세그먼트', () => screen.queryByRole('group', { name: '내기 방식' })],
    ['내기 방식 판돈 분배', () => screen.queryByRole('button', { name: '판돈 분배' })],
    ['내기 방식 판비 내주기', () => screen.queryByRole('button', { name: '판비 내주기' })],
    ['인당 판돈 입력', () => screen.queryByLabelText('인당 판돈')],
    ['RankPicker', () => screen.queryByRole('group', { name: '순위' })],
    ['PayoutEditor', () => screen.queryByLabelText('1등 인당 배당')],
    ['팀 편성 버튼', () => screen.queryByRole('button', { name: '팀 편성 변경' })],
  ];

  it('정산을 고른 판에서는 내기 UI가 전부 렌더되지 않는다', () => {
    seed(loadedRound({ method: 'none' }));
    render(<Harness />);

    for (const [label, query] of BET_UI_QUERIES) {
      expect(query(), label).toBeNull();
    }
    expect(screen.queryByRole('group', { name: '진 쪽' })).toBeNull();

    // 1단 세그먼트는 남아 있고 "정산" 이 선택된 상태다
    expect(screen.getByRole('button', { name: '정산' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '내기' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('내기를 고른 판에서는 같은 라운드에서 내기 UI가 전부 보인다', () => {
    seed(loadedRound());
    render(<Harness />);

    for (const [label, query] of BET_UI_QUERIES) {
      expect(query(), label).not.toBeNull();
    }
    expect(screen.getByRole('button', { name: '내기' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('정산을 고른 판에서도 판 번호·참여자·복제/삭제는 남는다', async () => {
    seed(loadedRound({ method: 'none' }));
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByRole('heading', { name: '1판' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '복제' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();

    // 참여자 체크는 정산 판의 핵심 기능이라 계속 동작해야 한다
    const group = screen.getByRole('group', { name: '참여자' });
    await user.click(within(group).getByRole('button', { name: '나다' }));
    expect(currentRound().participants).toEqual(['a', 'c', 'd']);
  });

  it('정산 버튼을 누르면 method 가 none 이 되고 내기 UI가 사라진다', async () => {
    seed(loadedRound());
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByRole('group', { name: '내기 방식' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '정산' }));

    expect(currentRound().method).toBe('none');
    for (const [label, query] of BET_UI_QUERIES) {
      expect(query(), label).toBeNull();
    }
  });

  it('정산 판에서 내기를 누르면 판돈 분배로 시작한다', async () => {
    seed(makeRound({ method: 'none' }));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '내기' }));

    expect(currentRound().method).toBe('pot');
    expect(screen.getByLabelText('인당 판돈')).toBeInTheDocument();
  });

  it('판비 내주기를 고른 뒤 정산을 거쳐 내기로 돌아오면 판비 내주기가 복원된다', async () => {
    seed(loadedRound({ method: 'transfer' }));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '정산' }));
    await user.click(screen.getByRole('button', { name: '내기' }));

    expect(currentRound().method).toBe('transfer');
    expect(screen.getByRole('group', { name: '진 쪽' })).toBeInTheDocument();
  });

  it('imbalance가 0이 아닌 라운드라도 정산을 고르면 경고가 렌더되지 않는다', async () => {
    seed(loadedRound());
    const user = userEvent.setup();
    render(<Harness />);

    // 내기일 때는 실제로 경고가 뜨는 라운드임을 먼저 고정한다
    expect(screen.getByRole('alert')).toHaveTextContent('판돈 불일치');

    await user.click(screen.getByRole('button', { name: '정산' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  /**
   * 비파괴 왕복. 정산으로 바꿨다 내기로 돌아왔을 때 입력이 살아 있어야 한다.
   * `method` 는 정의상 'none' 을 거치므로 제외하고, 데이터 필드만 비교한다.
   */
  it('비파괴: 정산 -> 내기 왕복 후 ranking/payout/losers/teams/ante 가 그대로다', async () => {
    seed(loadedRound());
    const user = userEvent.setup();
    render(<Harness />);

    const pick = (r: Round) => ({
      ante: r.ante,
      payout: r.payout,
      ranking: r.ranking,
      losers: r.losers,
      teams: r.teams,
    });
    const before = pick(currentRound());

    await user.click(screen.getByRole('button', { name: '정산' }));
    expect(pick(currentRound()), '정산으로 바꾼 직후').toEqual(before);

    await user.click(screen.getByRole('button', { name: '내기' }));
    expect(pick(currentRound()), '내기로 되돌린 뒤').toEqual(before);
    expect(currentRound().method).toBe('pot');

    // 화면에도 그대로 살아 있어야 한다 — 스토어만 보면 렌더가 죽어도 통과한다
    expect(screen.getByLabelText('인당 판돈')).toHaveDisplayValue('1,000');
    expect(screen.getByLabelText('1등 인당 배당')).toHaveDisplayValue('3,000');
  });
});

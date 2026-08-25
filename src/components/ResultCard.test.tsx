import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { ResultCard, cardWidth, extraColumns } from './ResultCard';
import type { Extra, Member, MemberResult, Round, RoundBreakdown, Settlement } from '../types';

function makeMembers(count: number): Member[] {
  return Array.from({ length: count }, (_, i) => ({ id: `m${i + 1}`, name: `멤버${i + 1}` }));
}

function makeResult(memberId: string, overrides: Partial<MemberResult> = {}): MemberResult {
  return {
    memberId,
    gameCount: 3,
    gameFee: 12000,
    shoe: 0,
    extra: 0,
    betDelta: 0,
    subtotal: 12000,
    rounded: 12000,
    adjustment: 0,
    ...overrides,
  };
}

function makeSettlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    version: 1,
    id: 's1',
    date: '2026-08-21',
    members: makeMembers(3),
    gameFeePerGame: 4000,
    shoeFee: 2000,
    shoeRenters: [],
    rounds: [],
    extras: [],
    ...overrides,
  };
}

const baseCardProps = {
  breakdowns: [] as RoundBreakdown[],
  totalImbalance: 0,
};

describe('ResultCard', () => {
  it('헤더에 날짜와 인원수를 표시한다', () => {
    const members = makeMembers(3);
    const settlement = makeSettlement({ members });
    render(
      <ResultCard
        {...baseCardProps}
        settlement={settlement}
        results={members.map((m) => makeResult(m.id))}
      />,
    );
    expect(screen.getByText(/2026\.08\.21 \(금\)/)).toBeInTheDocument();
    expect(screen.getByText(/3명/)).toBeInTheDocument();
  });

  it('D5: 루트 카드 폭은 540px 고정이다', () => {
    const members = makeMembers(2);
    const settlement = makeSettlement({ members });
    render(
      <ResultCard
        {...baseCardProps}
        settlement={settlement}
        results={members.map((m) => makeResult(m.id))}
      />,
    );
    const card = screen.getByTestId('result-card');
    expect(card.style.width).toBe('540px');
  });

  it('D5: 멤버 12명까지 잘림 없이 모든 행이 렌더된다', () => {
    const members = makeMembers(12);
    const settlement = makeSettlement({ members });
    render(
      <ResultCard
        {...baseCardProps}
        settlement={settlement}
        results={members.map((m) => makeResult(m.id))}
      />,
    );
    expect(screen.getAllByTestId('result-row')).toHaveLength(12);
  });

  it('R9: 멤버 13명이면 표에 축소 스타일이 적용된다', () => {
    const members = makeMembers(13);
    const settlement = makeSettlement({ members });
    render(
      <ResultCard
        {...baseCardProps}
        settlement={settlement}
        results={members.map((m) => makeResult(m.id))}
      />,
    );
    const table = screen.getByTestId('member-table');
    expect(table.dataset.compact).toBe('true');
    expect(table.className).toMatch(/text-xs/);
  });

  it('멤버 12명 이하면 축소 스타일이 적용되지 않는다', () => {
    const members = makeMembers(12);
    const settlement = makeSettlement({ members });
    render(
      <ResultCard
        {...baseCardProps}
        settlement={settlement}
        results={members.map((m) => makeResult(m.id))}
      />,
    );
    const table = screen.getByTestId('member-table');
    expect(table.dataset.compact).toBe('false');
  });

  it('B3: adjustment가 0이 아니면 잔돈 조정 배지를 표시한다', () => {
    const members = makeMembers(1);
    const settlement = makeSettlement({ members });
    render(
      <ResultCard
        {...baseCardProps}
        settlement={settlement}
        results={[makeResult('m1', { adjustment: -100, rounded: 3300 })]}
      />,
    );
    expect(screen.getByTestId('adjustment-badge')).toHaveTextContent('잔돈 조정 -100원');
  });

  it('rounded가 음수면 "받음"으로 표기한다 (B4)', () => {
    const members = makeMembers(1);
    const settlement = makeSettlement({ members });
    render(
      <ResultCard
        {...baseCardProps}
        settlement={settlement}
        results={[makeResult('m1', { rounded: -2000 })]}
      />,
    );
    expect(screen.getByText(/2,000원 받음/)).toBeInTheDocument();
  });

  it('totalImbalance가 0이 아니면 경고 배지를 표시한다', () => {
    const members = makeMembers(2);
    const settlement = makeSettlement({ members });
    render(
      <ResultCard
        {...baseCardProps}
        settlement={settlement}
        results={members.map((m) => makeResult(m.id))}
        totalImbalance={-2000}
      />,
    );
    expect(screen.getByTestId('imbalance-warning')).toBeInTheDocument();
  });

  it('imbalance가 없으면 경고 배지를 표시하지 않는다', () => {
    const members = makeMembers(2);
    const settlement = makeSettlement({ members });
    render(
      <ResultCard
        {...baseCardProps}
        settlement={settlement}
        results={members.map((m) => makeResult(m.id))}
      />,
    );
    expect(screen.queryByTestId('imbalance-warning')).not.toBeInTheDocument();
  });

  it('불일치 판이 여러 개면 경고 블록에 판 번호와 어긋난 금액을 전부 나열한다', () => {
    const members = makeMembers(2);
    const rounds: Round[] = [
      {
        id: 'r1',
        participants: ['m1', 'm2'],
        teams: null,
        method: 'pot',
        ante: 1000,
        payout: [2000],
        ranking: [['m1']],
        losers: [],
        transferSource: 'custom',
        transferAmount: 0,
      },
      {
        id: 'r2',
        participants: ['m1', 'm2'],
        teams: null,
        method: 'pot',
        ante: 1000,
        payout: [4000],
        ranking: [['m2']],
        losers: [],
        transferSource: 'custom',
        transferAmount: 0,
      },
      {
        id: 'r3',
        participants: ['m1', 'm2'],
        teams: null,
        method: 'none',
        ante: 0,
        payout: [],
        ranking: [],
        losers: [],
        transferSource: 'custom',
        transferAmount: 0,
      },
    ];
    const settlement = makeSettlement({ members, rounds });
    const breakdowns: RoundBreakdown[] = [
      { roundId: 'r1', delta: { m1: 0, m2: 0 }, imbalance: 1000, surplus: 0 },
      { roundId: 'r2', delta: { m1: 0, m2: 0 }, imbalance: -500, surplus: 0 },
    ];
    render(
      <ResultCard
        {...baseCardProps}
        settlement={settlement}
        results={members.map((m) => makeResult(m.id))}
        breakdowns={breakdowns}
        totalImbalance={500}
      />,
    );
    const hint = screen.getByTestId('imbalance-cause-hint');
    // 1판, 2판 둘 다 나열되고, 3판(불일치 없음)은 나열되지 않는다
    expect(hint).toHaveTextContent('1판');
    expect(hint).toHaveTextContent('+1,000원');
    expect(hint).toHaveTextContent('2판');
    expect(hint).toHaveTextContent('-500원');
    expect(hint.textContent).not.toMatch(/3판/);
    expect(hint).toHaveTextContent('참여 인원을 바꾸면 판돈 총액이 달라지므로');
  });

  it('D7: pot 방식 라운드 요약에 방식·판돈·순위가 한 줄로 포함된다', () => {
    const members = makeMembers(2);
    const rounds: Round[] = [
      {
        id: 'r1',
        participants: ['m1', 'm2'],
        teams: null,
        method: 'pot',
        ante: 1000,
        payout: [2000],
        ranking: [['m1']],
        losers: [],
        transferSource: 'custom',
        transferAmount: 0,
      },
    ];
    const settlement = makeSettlement({ members, rounds });
    render(
      <ResultCard
        {...baseCardProps}
        settlement={settlement}
        results={members.map((m) => makeResult(m.id))}
      />,
    );
    const row = screen.getByTestId('round-summary-row');
    expect(row).toHaveTextContent('1판');
    expect(row).toHaveTextContent('판돈 분배');
    expect(row).toHaveTextContent('1,000원');
    expect(row).toHaveTextContent('1등 멤버1');
  });

  it('D7: transfer 방식 라운드 요약에 방식·금액·진 쪽이 포함된다', () => {
    const members = makeMembers(2);
    const rounds: Round[] = [
      {
        id: 'r1',
        participants: ['m1', 'm2'],
        teams: null,
        method: 'transfer',
        ante: 0,
        payout: [],
        ranking: [],
        losers: ['m2'],
        transferSource: 'custom',
        transferAmount: 4000,
      },
    ];
    const settlement = makeSettlement({ members, rounds });
    render(
      <ResultCard
        {...baseCardProps}
        settlement={settlement}
        results={members.map((m) => makeResult(m.id))}
      />,
    );
    const row = screen.getByTestId('round-summary-row');
    expect(row).toHaveTextContent('판비 내주기');
    expect(row).toHaveTextContent('4,000원');
    expect(row).toHaveTextContent('진 쪽 멤버2');
  });

  /**
   * G4: 내기 표시는 `rounds` 에서 파생한다 (2026-08-24). 전역 `mode` 플래그가 없어졌으므로
   * "판이 하나라도 내기면 보여주고, 전부 정산이면 숨긴다".
   */
  describe('G4: 전 판이 정산이면 내기 표시를 숨긴다', () => {
    function betRound(): Round {
      return {
        id: 'r1',
        participants: ['m1', 'm2'],
        teams: null,
        method: 'pot',
        ante: 1000,
        payout: [2000],
        ranking: [['m1']],
        losers: [],
        transferSource: 'custom',
        transferAmount: 0,
      };
    }

    /** 같은 판이지만 정산으로 고른 상태 */
    function settleRound(id: string): Round {
      return { ...betRound(), id, method: 'none', ante: 0, payout: [], ranking: [] };
    }

    it('전 판이 none 이면 "내기±" 열 헤더가 없다', () => {
      const members = makeMembers(2);
      const settlement = makeSettlement({
        members,
        rounds: [settleRound('r1'), settleRound('r2')],
      });
      render(
        <ResultCard
          {...baseCardProps}
          settlement={settlement}
          results={members.map((m) => makeResult(m.id, { betDelta: 500 }))}
        />,
      );
      expect(screen.queryByText('내기±')).not.toBeInTheDocument();
    });

    it('전 판이 none 이면 판별 내기 요약(D7)이 없다', () => {
      const members = makeMembers(2);
      const settlement = makeSettlement({ members, rounds: [settleRound('r1')] });
      render(
        <ResultCard
          {...baseCardProps}
          settlement={settlement}
          results={members.map((m) => makeResult(m.id))}
        />,
      );
      expect(screen.queryByTestId('round-summary-row')).not.toBeInTheDocument();
      expect(screen.queryByText('판별 내기 요약')).not.toBeInTheDocument();
    });

    it('판이 하나도 없으면 내기 표시가 없다', () => {
      const members = makeMembers(2);
      const settlement = makeSettlement({ members, rounds: [] });
      render(
        <ResultCard
          {...baseCardProps}
          settlement={settlement}
          results={members.map((m) => makeResult(m.id, { betDelta: 500 }))}
        />,
      );
      expect(screen.queryByText('내기±')).not.toBeInTheDocument();
      expect(screen.queryByText('판별 내기 요약')).not.toBeInTheDocument();
    });

    it('내기 판이 하나라도 있으면 "내기±" 열 헤더와 판별 내기 요약이 나온다', () => {
      const members = makeMembers(2);
      const settlement = makeSettlement({ members, rounds: [betRound()] });
      render(
        <ResultCard
          {...baseCardProps}
          settlement={settlement}
          results={members.map((m) => makeResult(m.id, { betDelta: 500 }))}
        />,
      );
      expect(screen.getByText('내기±')).toBeInTheDocument();
      expect(screen.getByTestId('round-summary-row')).toBeInTheDocument();
    });

    /** 정산 판 하나가 섞였다고 내기 판의 표시를 지워서는 안 된다 */
    it('정산 판과 내기 판이 섞여 있으면 내기 표시가 나오고 정산 판도 요약에 실린다', () => {
      const members = makeMembers(2);
      const settlement = makeSettlement({ members, rounds: [settleRound('r0'), betRound()] });
      render(
        <ResultCard
          {...baseCardProps}
          settlement={settlement}
          results={members.map((m) => makeResult(m.id, { betDelta: 500 }))}
        />,
      );
      expect(screen.getByText('내기±')).toBeInTheDocument();
      const rows = screen.getAllByTestId('round-summary-row');
      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveTextContent('내기 없음');
      expect(rows[1]).toHaveTextContent('판돈 분배');
    });

    it('전 판이 none 이고 totalImbalance === 0, breakdowns 전부 0이면 경고 블록과 원인 힌트가 없다', () => {
      const members = makeMembers(2);
      const settlement = makeSettlement({ members, rounds: [settleRound('r1')] });
      // calculate()가 method 게이트를 걸면 실제로는 betDelta/imbalance 모두 0이 된다.
      // 여기서는 ResultCard 자체가 그 입력을 그대로 존중해 아무 것도 안 그리는지만 본다.
      render(
        <ResultCard
          {...baseCardProps}
          settlement={settlement}
          results={members.map((m) => makeResult(m.id, { betDelta: 0 }))}
          breakdowns={[{ roundId: 'r1', delta: { m1: 0, m2: 0 }, imbalance: 0, surplus: 0 }]}
          totalImbalance={0}
        />,
      );
      expect(screen.queryByTestId('imbalance-warning')).not.toBeInTheDocument();
      expect(screen.queryByTestId('imbalance-cause-hint')).not.toBeInTheDocument();
    });

    it('내기± 열이 빠져도 표 열 개수가 헤더/바디 사이에 어긋나지 않는다', () => {
      const members = makeMembers(2);
      const settlement = makeSettlement({ members, rounds: [settleRound('r1')] });
      render(
        <ResultCard
          {...baseCardProps}
          settlement={settlement}
          results={members.map((m) => makeResult(m.id))}
        />,
      );
      const table = screen.getByTestId('member-table');
      const headerCellCount = table.querySelectorAll('thead th').length;
      const firstRow = table.querySelector('tbody tr');
      const bodyCellCount = firstRow?.querySelectorAll('td').length ?? 0;
      // 이름·판수·게임비·신발·최종 (내기± 제외, 기타비용 항목이 없어 기타 열도 없음)
      expect(headerCellCount).toBe(5);
      expect(bodyCellCount).toBe(headerCellCount);
    });
  });

  it('R1: 카드 배경/글자색이 hex CSS 변수(var(--card-*))로만 지정된다', () => {
    const ref = createRef<HTMLDivElement>();
    const members = makeMembers(1);
    const settlement = makeSettlement({ members });
    render(
      <ResultCard {...baseCardProps} ref={ref} settlement={settlement} results={[makeResult('m1')]} />,
    );
    const card = screen.getByTestId('result-card');
    expect(card.style.backgroundColor).toBe('var(--card-bg)');
    expect(card.style.color).toBe('var(--card-fg)');
    expect(ref.current).toBe(card);
  });

  it('R1 회귀 방지: 서브트리 어디에도 Tailwind 색상 유틸리티 클래스가 없다', () => {
    const members = makeMembers(2);
    const rounds: Round[] = [
      {
        id: 'r1',
        participants: ['m1', 'm2'],
        teams: null,
        method: 'pot',
        ante: 1000,
        payout: [2000],
        ranking: [['m1']],
        losers: [],
        transferSource: 'custom',
        transferAmount: 0,
      },
    ];
    // 기타 항목 열까지 서브트리에 포함시켜 새로 생긴 th/td 도 검사 대상에 넣는다
    const settlement = makeSettlement({
      members,
      rounds,
      extras: [
        { id: 'e1', label: '음료수', amounts: { m1: 2000, m2: 2500 } },
        { id: 'e2', label: '주차비', amounts: { m1: 3000 } },
      ],
    });
    render(
      <ResultCard
        {...baseCardProps}
        settlement={settlement}
        results={[
          makeResult('m1', { adjustment: -100, rounded: 3300, betDelta: 500, extra: 5000 }),
          makeResult('m2', { rounded: -1000, betDelta: -500, extra: 2500 }),
        ]}
        totalImbalance={-500}
      />,
    );
    const card = screen.getByTestId('result-card');
    const colorUtilPattern =
      /\b(?:bg|text|border|fill|stroke|ring|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d{2,3})?\b/;

    const offenders = [card, ...card.querySelectorAll('*')].filter((el) =>
      colorUtilPattern.test(el.className.toString()),
    );
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// F1 / F3 — 엔진이 계산한 경고가 실제로 화면에 도달하는지
//
// 이 두 블록은 한때 테스트가 0건이었다. 통째로 지워도 전체 스위트가 통과했는데,
// 그게 정확히 F1 의 원래 결함("엔진은 계산하는데 화면에 안 나온다")과 같은 구멍이다.
// ---------------------------------------------------------------------------
/** settlement/results 까지 갖춘 완전한 props. 경고 블록만 바꿔가며 렌더할 때 쓴다. */
function warningProps() {
  const members = makeMembers(2);
  return {
    ...baseCardProps,
    settlement: makeSettlement({ members }),
    results: members.map((m) => makeResult(m.id)),
  };
}

describe('ResultCard — 올림 초과분 표시 (F1)', () => {
  it('초과분이 있으면 총액 아래에 금액과 함께 안내가 뜬다', () => {
    render(<ResultCard {...warningProps()} roundingSurplus={2} />);
    const note = screen.getByTestId('rounding-surplus-note');
    expect(note).toBeInTheDocument();
    expect(note.textContent).toContain('2원');
  });

  it('초과분이 0이면 아무것도 뜨지 않는다', () => {
    render(<ResultCard {...warningProps()} roundingSurplus={0} />);
    expect(screen.queryByTestId('rounding-surplus-note')).not.toBeInTheDocument();
  });

  it('prop 을 넘기지 않아도 크래시하지 않고 조용히 숨는다', () => {
    render(<ResultCard {...warningProps()} />);
    expect(screen.queryByTestId('rounding-surplus-note')).not.toBeInTheDocument();
  });
});

describe('ResultCard — 분담 대상 없는 기타비용 경고 (F3)', () => {
  it('미수금 항목이 있으면 항목명과 금액이 경고에 나온다', () => {
    render(
      <ResultCard
        {...warningProps()}
        unassignedExtras={[{ label: '맥주', amount: 5000 }]}
      />,
    );
    const warn = screen.getByTestId('unassigned-extras-warning');
    expect(warn).toBeInTheDocument();
    expect(warn.textContent).toContain('맥주');
    expect(warn.textContent).toContain('5,000');
  });

  it('여러 항목이면 전부 나열한다', () => {
    render(
      <ResultCard
        {...warningProps()}
        unassignedExtras={[
          { label: '맥주', amount: 5000 },
          { label: '주차비', amount: 3000 },
        ]}
      />,
    );
    const warn = screen.getByTestId('unassigned-extras-warning');
    expect(warn.textContent).toContain('맥주');
    expect(warn.textContent).toContain('주차비');
    expect(warn.textContent).toContain('3,000');
  });

  it('미수금이 없으면 경고가 뜨지 않는다', () => {
    render(<ResultCard {...warningProps()} unassignedExtras={[]} />);
    expect(screen.queryByTestId('unassigned-extras-warning')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 기타비용을 항목명 열로 펼치기 (2026-08-25)
//
// 예전에는 항목이 몇 개든 "기타" 한 열에 합계만 찍혀서, 카드를 받은 사람이 그 돈이
// 무엇 때문인지 알 수 없었다. Extra.amounts 가 사람별 금액 맵이므로 항목별·사람별
// 금액을 그대로 표에 펼칠 수 있다.
// ---------------------------------------------------------------------------

function makeExtra(id: string, label: string, amounts: Record<string, number>): Extra {
  return { id, label, amounts };
}

/** 고정 열(기타 항목이 아닌 열)의 헤더 이름 */
const FIXED_HEADERS = ['이름', '판수', '게임비', '신발', '내기±', '최종'];

/** 표의 헤더 텍스트 배열 */
function headerLabels(): string[] {
  const table = screen.getByTestId('member-table');
  return [...table.querySelectorAll('thead th')].map((th) => th.textContent ?? '');
}

/** index 번째 행의 셀 텍스트 배열 */
function rowCells(index: number): string[] {
  const rows = screen.getAllByTestId('result-row');
  return [...rows[index].querySelectorAll('td')].map((td) => td.textContent ?? '');
}

describe('extraColumns — 항목을 열로 펼치는 규칙', () => {
  it('항목이 0개면 열이 하나도 없다', () => {
    expect(extraColumns([])).toEqual([]);
  });

  it('항목이 2개면 항목명 그대로 2열이 된다', () => {
    const columns = extraColumns([
      makeExtra('e1', '음료수', { m1: 2000 }),
      makeExtra('e2', '주차비', { m1: 3000 }),
    ]);
    expect(columns).toEqual([
      { label: '음료수', ids: ['e1'] },
      { label: '주차비', ids: ['e2'] },
    ]);
  });

  it('항목 수가 상한과 같으면 전부 개별 열이고 합치지 않는다', () => {
    const columns = extraColumns(
      ['A', 'B', 'C', 'D'].map((label, i) => makeExtra(`e${i + 1}`, label, {})),
      4,
    );
    expect(columns.map((c) => c.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(columns.every((c) => c.ids.length === 1)).toBe(true);
  });

  it('항목이 상한을 넘으면 앞 3개는 개별 열, 나머지는 "기타" 한 열로 합친다', () => {
    const columns = extraColumns(
      ['A', 'B', 'C', 'D', 'E', 'F'].map((label, i) => makeExtra(`e${i + 1}`, label, {})),
      4,
    );
    expect(columns).toHaveLength(4);
    expect(columns.map((c) => c.label)).toEqual(['A', 'B', 'C', '기타']);
    expect(columns[3].ids).toEqual(['e4', 'e5', 'e6']);
  });

  it('합칠 때 뒤쪽 항목을 버리지 않는다 — 모든 id 가 정확히 한 번씩 열에 들어간다', () => {
    // 버리면 열 합계가 MemberResult.extra 와 어긋나 카드가 조용히 거짓말을 한다.
    const extras = Array.from({ length: 9 }, (_, i) => makeExtra(`e${i + 1}`, `항목${i + 1}`, {}));
    const covered = extraColumns(extras, 4).flatMap((c) => c.ids);
    expect([...covered].sort()).toEqual(extras.map((e) => e.id).sort());
  });
});

describe('cardWidth — 열 수에 따른 카드 폭', () => {
  it('기타 열이 없거나 하나면 기본 540px 그대로다', () => {
    // 기존 540px 표에 이미 "기타" 열 하나가 들어가 있었으므로 첫 열은 넓히지 않는다.
    expect(cardWidth(0)).toBe(540);
    expect(cardWidth(1)).toBe(540);
  });

  it('두 번째 열부터 항목당 70px 씩 넓어진다', () => {
    expect(cardWidth(2)).toBe(610);
    expect(cardWidth(3)).toBe(680);
  });

  it('상한 720px 을 넘지 않는다', () => {
    // 4열이면 540 + 3×70 = 750 이지만 캡이 걸려 720 이 된다.
    expect(cardWidth(4)).toBe(720);
    expect(cardWidth(50)).toBe(720);
  });

  it('열이 늘어도 폭이 줄지 않는다', () => {
    const widths = [0, 1, 2, 3, 4, 5, 6].map(cardWidth);
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
  });
});

describe('ResultCard — 기타 열을 항목명으로 표시한다', () => {
  function renderWith(extras: Extra[], results?: MemberResult[]) {
    const members = makeMembers(2);
    render(
      <ResultCard
        {...baseCardProps}
        settlement={makeSettlement({ members, extras })}
        results={results ?? members.map((m) => makeResult(m.id))}
      />,
    );
  }

  it('표 헤더에 "기타" 대신 실제 항목명이 나온다', () => {
    renderWith([
      makeExtra('e1', '음료수', { m1: 2000, m2: 2500 }),
      makeExtra('e2', '주차비', { m1: 3000, m2: 3000 }),
    ]);
    const labels = headerLabels();
    expect(labels).toContain('음료수');
    expect(labels).toContain('주차비');
    expect(labels).not.toContain('기타');
  });

  it('사람마다 다른 금액이 각 항목 셀에 정확히 찍힌다', () => {
    renderWith(
      [makeExtra('e1', '음료수', { m1: 2000, m2: 2500 })],
      [makeResult('m1', { extra: 2000 }), makeResult('m2', { extra: 2500 })],
    );
    const col = headerLabels().indexOf('음료수');
    expect(col).toBeGreaterThan(-1);
    expect(rowCells(0)[col]).toBe('2,000원');
    expect(rowCells(1)[col]).toBe('2,500원');
  });

  it('그 항목을 안 먹은 사람 칸은 0원이다', () => {
    renderWith([makeExtra('e1', '주차비', { m1: 3000 })]);
    const col = headerLabels().indexOf('주차비');
    expect(rowCells(0)[col]).toBe('3,000원');
    expect(rowCells(1)[col]).toBe('0원');
  });

  it('항목이 0개면 기타 열 자체를 렌더하지 않는다', () => {
    renderWith([]);
    expect(headerLabels()).toEqual(['이름', '판수', '게임비', '신발', '최종']);
  });

  it('헤더 열 수와 바디 각 행의 셀 수가 항상 같다', () => {
    renderWith([
      makeExtra('e1', '음료수', { m1: 2000 }),
      makeExtra('e2', '주차비', { m2: 3000 }),
      makeExtra('e3', '간식', { m1: 1000, m2: 1000 }),
    ]);
    const columnCount = headerLabels().length;
    expect(columnCount).toBe(8); // 이름·판수·게임비·신발 + 항목 3 + 최종
    expect(rowCells(0)).toHaveLength(columnCount);
    expect(rowCells(1)).toHaveLength(columnCount);
  });

  it('항목이 상한을 넘으면 합쳐진 "기타" 칸에 나머지 금액의 합이 들어간다', () => {
    const extras = ['A', 'B', 'C', 'D', 'E', 'F'].map((label, i) =>
      makeExtra(`e${i + 1}`, label, { m1: (i + 1) * 100 }),
    );
    renderWith(extras, [makeResult('m1', { extra: 2100 }), makeResult('m2')]);
    const labels = headerLabels();
    expect(labels.filter((l) => !FIXED_HEADERS.includes(l))).toEqual(['A', 'B', 'C', '기타']);
    expect(rowCells(0)[labels.indexOf('기타')]).toBe('1,500원'); // 400 + 500 + 600
  });

  it('열 셀 금액의 합이 MemberResult.extra 와 일치한다', () => {
    // 열로 쪼개는 과정에서 금액이 새거나 중복되면 카드 총액과 어긋난다.
    const extras = ['음료수', '주차비', '간식', '맥주', '택시'].map((label, i) =>
      makeExtra(`e${i + 1}`, label, { m1: (i + 1) * 1000 }),
    );
    renderWith(extras, [makeResult('m1', { extra: 15000 }), makeResult('m2')]);
    const labels = headerLabels();
    const cells = rowCells(0);
    const sum = labels.reduce(
      (acc, label, i) =>
        FIXED_HEADERS.includes(label) ? acc : acc + Number(cells[i].replace(/[^0-9-]/g, '')),
      0,
    );
    expect(sum).toBe(15000);
  });
});

describe('ResultCard — 기타 항목 수에 따라 카드 폭이 늘어난다', () => {
  function widthWith(extras: Extra[]): string {
    const members = makeMembers(2);
    const { unmount } = render(
      <ResultCard
        {...baseCardProps}
        settlement={makeSettlement({ members, extras })}
        results={members.map((m) => makeResult(m.id))}
      />,
    );
    const width = screen.getByTestId('result-card').style.width;
    unmount();
    return width;
  }

  it('항목이 0~1개면 540px 그대로다', () => {
    expect(widthWith([])).toBe('540px');
    expect(widthWith([makeExtra('e1', '음료수', { m1: 2000 })])).toBe('540px');
  });

  it('항목이 늘면 카드가 넓어진다', () => {
    expect(widthWith([makeExtra('e1', 'A', {}), makeExtra('e2', 'B', {})])).toBe('610px');
    expect(
      widthWith([makeExtra('e1', 'A', {}), makeExtra('e2', 'B', {}), makeExtra('e3', 'C', {})]),
    ).toBe('680px');
  });

  it('항목이 아무리 많아도 상한 720px 을 넘지 않는다', () => {
    const many = Array.from({ length: 12 }, (_, i) => makeExtra(`e${i + 1}`, `항목${i + 1}`, {}));
    expect(widthWith(many)).toBe('720px');
  });
});

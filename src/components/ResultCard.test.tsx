import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { ResultCard } from './ResultCard';
import type { Member, MemberResult, Round, RoundBreakdown, Settlement } from '../types';

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
    mode: 'bet',
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

  describe('G4: 정산 모드에서 내기 표시를 숨긴다', () => {
    function makeBetRounds(): Round[] {
      return [
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
    }

    it('mode: "normal"이면 "내기±" 열 헤더가 없다', () => {
      const members = makeMembers(2);
      const rounds = makeBetRounds();
      const settlement = makeSettlement({ members, rounds, mode: 'normal' });
      render(
        <ResultCard
          {...baseCardProps}
          settlement={settlement}
          results={members.map((m) => makeResult(m.id, { betDelta: 500 }))}
        />,
      );
      expect(screen.queryByText('내기±')).not.toBeInTheDocument();
    });

    it('mode: "normal"이면 판별 내기 요약(D7)이 없다', () => {
      const members = makeMembers(2);
      const rounds = makeBetRounds();
      const settlement = makeSettlement({ members, rounds, mode: 'normal' });
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

    it('mode: "bet"이면 "내기±" 열 헤더와 판별 내기 요약이 그대로 있다', () => {
      const members = makeMembers(2);
      const rounds = makeBetRounds();
      const settlement = makeSettlement({ members, rounds, mode: 'bet' });
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

    it('mode: "normal"이고 totalImbalance === 0, breakdowns 전부 0이면 경고 블록과 원인 힌트가 없다', () => {
      const members = makeMembers(2);
      const rounds = makeBetRounds();
      const settlement = makeSettlement({ members, rounds, mode: 'normal' });
      // calculate()가 mode 게이트를 걸면 실제로는 betDelta/imbalance 모두 0이 된다.
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

    it('mode: "normal"에서도 표 열 개수가 헤더/바디 사이에 어긋나지 않는다', () => {
      const members = makeMembers(2);
      const settlement = makeSettlement({ members, mode: 'normal' });
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
      expect(headerCellCount).toBe(6); // 이름·판수·게임비·신발·기타·최종 (내기± 제외)
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
    const settlement = makeSettlement({ members, rounds });
    render(
      <ResultCard
        {...baseCardProps}
        settlement={settlement}
        results={[
          makeResult('m1', { adjustment: -100, rounded: 3300, betDelta: 500 }),
          makeResult('m2', { rounded: -1000, betDelta: -500 }),
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

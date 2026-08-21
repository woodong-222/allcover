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
    members: makeMembers(3),
    gameFeePerGame: 4000,
    shoeFee: 2000,
    shoeRenters: [],
    defaultAnte: 0,
    rounds: [],
    extras: [],
    roundingUnit: 100,
    ...overrides,
  };
}

const baseCardProps = {
  breakdowns: [] as RoundBreakdown[],
  totalImbalance: 0,
  transfers: [] as { from: string; to: string; amount: number }[],
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

  it('transfers를 TransferList를 통해 렌더하고, 총무 지정 시 헤더에 총무 이름을 보여준다', () => {
    const members = makeMembers(3);
    const settlement = makeSettlement({ members, treasurerId: 'm1' });
    const results = [
      makeResult('m1', { rounded: 16000 }),
      makeResult('m2', { rounded: 14000 }),
      makeResult('m3', { rounded: 12000 }),
    ];
    render(
      <ResultCard
        {...baseCardProps}
        settlement={settlement}
        results={results}
        transfers={[
          { from: 'm2', to: 'm1', amount: 14000 },
          { from: 'm3', to: 'm1', amount: 12000 },
        ]}
      />,
    );
    const rows = screen.getAllByTestId('transfer-row');
    expect(rows).toHaveLength(2);
    expect(screen.getByText(/총무 멤버1/)).toBeInTheDocument();
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
    const settlement = makeSettlement({ members, rounds, treasurerId: 'm1' });
    render(
      <ResultCard
        {...baseCardProps}
        settlement={settlement}
        results={[
          makeResult('m1', { adjustment: -100, rounded: 3300, betDelta: 500 }),
          makeResult('m2', { rounded: -1000, betDelta: -500 }),
        ]}
        totalImbalance={-500}
        transfers={[{ from: 'm2', to: 'm1', amount: 3300 }]}
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

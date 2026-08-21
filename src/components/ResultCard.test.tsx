import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { ResultCard } from './ResultCard';
import type { Member, MemberResult, Round, RoundBreakdown } from '../types';

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

const baseProps = {
  date: '2026-08-21',
  gameFeePerGame: 4000,
  breakdowns: [] as RoundBreakdown[],
  totalImbalance: 0,
  rounds: [] as Round[],
};

describe('ResultCard', () => {
  it('헤더에 날짜와 인원수를 표시한다', () => {
    const members = makeMembers(3);
    render(
      <ResultCard
        {...baseProps}
        members={members}
        results={members.map((m) => makeResult(m.id))}
      />,
    );
    expect(screen.getByText(/2026\.08\.21 \(금\)/)).toBeInTheDocument();
    expect(screen.getByText(/3명/)).toBeInTheDocument();
  });

  it('D5: 멤버 12명까지 잘림 없이 모든 행이 렌더된다', () => {
    const members = makeMembers(12);
    render(
      <ResultCard
        {...baseProps}
        members={members}
        results={members.map((m) => makeResult(m.id))}
      />,
    );
    expect(screen.getAllByTestId('result-row')).toHaveLength(12);
  });

  it('B3: adjustment가 0이 아니면 잔돈 조정 배지를 표시한다', () => {
    const members = makeMembers(1);
    render(
      <ResultCard
        {...baseProps}
        members={members}
        results={[makeResult('m1', { adjustment: -100, rounded: 3300 })]}
      />,
    );
    expect(screen.getByTestId('adjustment-badge')).toHaveTextContent('잔돈 조정 -100원');
  });

  it('rounded가 음수면 "받음"으로 표기한다 (B4)', () => {
    const members = makeMembers(1);
    render(
      <ResultCard
        {...baseProps}
        members={members}
        results={[makeResult('m1', { rounded: -2000 })]}
      />,
    );
    expect(screen.getByText(/2,000원 받음/)).toBeInTheDocument();
  });

  it('totalImbalance가 0이 아니면 경고 배지를 표시한다', () => {
    const members = makeMembers(2);
    render(
      <ResultCard
        {...baseProps}
        members={members}
        results={members.map((m) => makeResult(m.id))}
        totalImbalance={-2000}
      />,
    );
    expect(screen.getByTestId('imbalance-warning')).toBeInTheDocument();
  });

  it('imbalance가 없으면 경고 배지를 표시하지 않는다', () => {
    const members = makeMembers(2);
    render(
      <ResultCard
        {...baseProps}
        members={members}
        results={members.map((m) => makeResult(m.id))}
      />,
    );
    expect(screen.queryByTestId('imbalance-warning')).not.toBeInTheDocument();
  });

  it('총무 지정 시 각자 -> 총무 송금 리스트를 계산해서 보여준다', () => {
    const members = makeMembers(3);
    render(
      <ResultCard
        {...baseProps}
        members={members}
        results={[
          makeResult('m1', { rounded: 16000 }),
          makeResult('m2', { rounded: 14000 }),
          makeResult('m3', { rounded: 12000 }),
        ]}
        treasurerId="m1"
      />,
    );
    const rows = screen.getAllByTestId('transfer-row');
    // 총무 본인(m1)은 자기 자신에게 보내지 않으므로 나머지 2명만
    expect(rows).toHaveLength(2);
    expect(screen.getByText(/멤버2 → 멤버1에게/)).toBeInTheDocument();
    expect(screen.getByText(/멤버3 → 멤버1에게/)).toBeInTheDocument();
  });

  it('총무 미지정이고 transfers도 없으면 안내 문구를 보여준다', () => {
    const members = makeMembers(2);
    render(
      <ResultCard
        {...baseProps}
        members={members}
        results={members.map((m) => makeResult(m.id))}
      />,
    );
    expect(screen.getByText('총무를 지정하면 송금 안내를 볼 수 있어요')).toBeInTheDocument();
  });

  it('총무 미지정이고 transfers가 주어지면 그대로 렌더한다', () => {
    const members = makeMembers(2);
    render(
      <ResultCard
        {...baseProps}
        members={members}
        results={members.map((m) => makeResult(m.id))}
        transfers={[{ from: 'm1', to: 'm2', amount: 5000 }]}
      />,
    );
    expect(screen.getByText(/멤버1 → 멤버2에게/)).toBeInTheDocument();
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
    render(
      <ResultCard
        {...baseProps}
        rounds={rounds}
        members={members}
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
    render(
      <ResultCard
        {...baseProps}
        rounds={rounds}
        members={members}
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
    render(
      <ResultCard
        {...baseProps}
        ref={ref}
        members={members}
        results={[makeResult('m1')]}
      />,
    );
    const card = screen.getByTestId('result-card');
    expect(card.style.backgroundColor).toBe('var(--card-bg)');
    expect(card.style.color).toBe('var(--card-fg)');
    expect(ref.current).toBe(card);
  });
});

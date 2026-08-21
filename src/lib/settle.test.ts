import { describe, expect, it } from 'vitest';
import { settleTransfers } from './settle';
import type { Member, MemberResult } from '../types';

function members(...names: string[]): Member[] {
  return names.map((name) => ({ id: name, name }));
}

/** rounded 만 의미가 있는 최소 MemberResult */
function result(memberId: string, rounded: number): MemberResult {
  return {
    memberId,
    gameCount: 0,
    gameFee: 0,
    shoe: 0,
    extra: 0,
    betDelta: 0,
    subtotal: rounded,
    rounded,
    adjustment: 0,
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('settleTransfers — 총무 지정', () => {
  it('모두가 총무에게 보내고 총무 본인은 제외된다', () => {
    const ms = members('a', 'b', 'c');
    const rs = [result('a', 10000), result('b', 6000), result('c', 4000)];
    const t = settleTransfers(rs, ms, 'a');

    expect(t).toEqual([
      { from: 'b', to: 'a', amount: 6000 },
      { from: 'c', to: 'a', amount: 4000 },
    ]);
    expect(t.every((x) => x.from !== x.to)).toBe(true);
  });

  it('금액이 음수(받을 사람)면 총무가 그 사람에게 주는 역방향 송금이 된다', () => {
    const ms = members('a', 'b', 'c');
    const rs = [result('a', 10000), result('b', -3000), result('c', 4000)];
    const t = settleTransfers(rs, ms, 'a');

    expect(t).toContainEqual({ from: 'a', to: 'b', amount: 3000 });
    expect(t).toContainEqual({ from: 'c', to: 'a', amount: 4000 });
    expect(t).toHaveLength(2);
  });

  it('금액이 0인 사람은 송금 목록에서 빠진다', () => {
    const ms = members('a', 'b', 'c');
    const rs = [result('a', 5000), result('b', 0), result('c', 4000)];
    const t = settleTransfers(rs, ms, 'a');
    expect(t).toEqual([{ from: 'c', to: 'a', amount: 4000 }]);
  });

  it('총무 기준 수지가 균형을 이룬다: 총무 순수령액 === 나머지 부담 합계', () => {
    const ms = members('a', 'b', 'c', 'd');
    const rs = [result('a', 12000), result('b', -3000), result('c', 4000), result('d', 8000)];
    const t = settleTransfers(rs, ms, 'a');
    const inflow = sum(t.filter((x) => x.to === 'a').map((x) => x.amount));
    const outflow = sum(t.filter((x) => x.from === 'a').map((x) => x.amount));
    expect(inflow - outflow).toBe(-3000 + 4000 + 8000);
    expect(t.every((x) => x.amount > 0)).toBe(true);
  });

  it('총무 id 가 결과에 없으면 그리디 모드로 폴백한다', () => {
    const ms = members('a', 'b');
    const rs = [result('a', 5000), result('b', -5000)];
    const t = settleTransfers(rs, ms, 'nobody');
    expect(t).toEqual([{ from: 'a', to: 'b', amount: 5000 }]);
  });
});

describe('settleTransfers — 총무 미지정 (그리디 최소 송금)', () => {
  it('가장 큰 채무자와 가장 큰 채권자를 반복 매칭한다', () => {
    const ms = members('a', 'b', 'c', 'd');
    const rs = [result('a', 10000), result('b', 5000), result('c', -3000), result('d', -12000)];
    const t = settleTransfers(rs, ms);

    expect(t).toEqual([
      { from: 'a', to: 'd', amount: 10000 },
      { from: 'b', to: 'd', amount: 2000 },
      { from: 'b', to: 'c', amount: 3000 },
    ]);
  });

  it('송금 합계가 균형을 이룬다: 채권자는 정확히 받을 만큼 받고 채무자는 낼 만큼만 낸다', () => {
    const ms = members('a', 'b', 'c', 'd');
    const rs = [result('a', 10000), result('b', 5000), result('c', -3000), result('d', -12000)];
    const t = settleTransfers(rs, ms);

    for (const r of rs) {
      const paid = sum(t.filter((x) => x.from === r.memberId).map((x) => x.amount));
      const got = sum(t.filter((x) => x.to === r.memberId).map((x) => x.amount));
      expect(paid - got).toBe(r.rounded);
    }
  });

  it('총 부담이 0이 아니면(정산 총액이 남으면) 채권자 몫까지만 송금하고 나머지는 각자 낸다', () => {
    const ms = members('a', 'b', 'c');
    const rs = [result('a', 10000), result('b', 6000), result('c', -4000)];
    const t = settleTransfers(rs, ms);

    expect(t).toEqual([{ from: 'a', to: 'c', amount: 4000 }]);
    const total = sum(t.map((x) => x.amount));
    expect(total).toBe(4000); // min(채무 16,000, 채권 4,000)
  });

  it('전원 부담이 같으면 송금이 발생하지 않는다', () => {
    const ms = members('a', 'b', 'c');
    const rs = [result('a', 5000), result('b', 5000), result('c', 5000)];
    expect(settleTransfers(rs, ms)).toEqual([]);
  });

  it('빈 입력은 빈 배열을 반환한다', () => {
    expect(settleTransfers([], [])).toEqual([]);
    expect(settleTransfers([], members('a'), 'a')).toEqual([]);
  });

  it('members 순서를 따라 결정적인 결과를 낸다', () => {
    const ms = members('a', 'b', 'c', 'd');
    const rs = [result('a', 4000), result('b', 4000), result('c', -4000), result('d', -4000)];
    const first = settleTransfers(rs, ms);
    const again = settleTransfers(rs.slice().reverse(), ms);
    expect(again).toEqual(first);
    expect(first).toEqual([
      { from: 'a', to: 'c', amount: 4000 },
      { from: 'b', to: 'd', amount: 4000 },
    ]);
  });

  it('모든 송금 금액은 양수이고 자기 자신에게 보내지 않는다', () => {
    const ms = members('a', 'b', 'c', 'd', 'e');
    const rs = [
      result('a', 13500),
      result('b', -2500),
      result('c', 700),
      result('d', -11000),
      result('e', 0),
    ];
    const t = settleTransfers(rs, ms);
    for (const x of t) {
      expect(x.amount).toBeGreaterThan(0);
      expect(x.from).not.toBe(x.to);
    }
    const credit = sum(rs.filter((r) => r.rounded < 0).map((r) => -r.rounded));
    const debt = sum(rs.filter((r) => r.rounded > 0).map((r) => r.rounded));
    expect(sum(t.map((x) => x.amount))).toBe(Math.min(credit, debt));
  });
});

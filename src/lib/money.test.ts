import { describe, expect, it } from 'vitest';
import { distributeWithRemainder, roundTo, splitEvenly } from './money';

describe('roundTo', () => {
  it('B2: 반올림 단위 0이면 원 단위 그대로, 오차 0', () => {
    expect(roundTo(3333, 0)).toBe(3333);
    expect(roundTo(-1234, 0)).toBe(-1234);
    expect(roundTo(3333.5, 0)).toBe(3333.5);
  });

  it('10원/100원 단위로 반올림한다', () => {
    expect(roundTo(3333, 10)).toBe(3330);
    expect(roundTo(3335, 10)).toBe(3340);
    expect(roundTo(3333, 100)).toBe(3300);
    expect(roundTo(3350, 100)).toBe(3400);
    expect(roundTo(3349, 100)).toBe(3300);
  });

  it('B4: 음수도 부호 대칭으로 반올림한다', () => {
    expect(roundTo(-3333, 100)).toBe(-3300);
    expect(roundTo(-3350, 100)).toBe(-3400);
    expect(roundTo(-3349, 100)).toBe(-3300);
    expect(roundTo(-2450, 100)).toBe(-2500);
    expect(roundTo(-2440, 100)).toBe(-2400);
  });

  it('0은 어떤 단위에서도 0', () => {
    expect(roundTo(0, 0)).toBe(0);
    expect(roundTo(0, 10)).toBe(0);
    expect(roundTo(0, 100)).toBe(0);
  });
});

describe('splitEvenly', () => {
  it('R13: 나누어떨어지지 않아도 전부 정수이고 합계는 정확히 total 이다', () => {
    // 8,000원을 3명이 나누면 2,666.666… 이 아니라 2,667 / 2,667 / 2,666 이 되어야 한다
    expect(splitEvenly(8000, 3)).toEqual([2667, 2667, 2666]);
    expect(splitEvenly(8000, 3).reduce((a, b) => a + b, 0)).toBe(8000);
    expect(splitEvenly(8000, 3).every(Number.isInteger)).toBe(true);
  });

  it('R13: 나머지는 앞사람부터 순서대로 1원씩 흡수한다 (결정적)', () => {
    expect(splitEvenly(10, 4)).toEqual([3, 3, 2, 2]);
    expect(splitEvenly(10, 3)).toEqual([4, 3, 3]);
    expect(splitEvenly(9, 3)).toEqual([3, 3, 3]);
    // 같은 입력은 항상 같은 결과 — 새로고침해도 금액이 흔들리면 안 된다
    expect(splitEvenly(10, 4)).toEqual(splitEvenly(10, 4));
  });

  it('여러 조합에서 합계 보존과 정수성이 모두 성립한다', () => {
    for (let total = 0; total <= 200; total += 7) {
      for (let count = 1; count <= 9; count++) {
        const shares = splitEvenly(total, count);
        expect(shares).toHaveLength(count);
        expect(shares.every(Number.isInteger)).toBe(true);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
        // 사람 간 차이는 최대 1원
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('음수 총액도 정수로 쪼개고 합계를 보존한다', () => {
    expect(splitEvenly(-10, 3).reduce((a, b) => a + b, 0)).toBe(-10);
    expect(splitEvenly(-10, 3).every(Number.isInteger)).toBe(true);
  });

  it('인원이 0 이하면 빈 배열을 반환하고 크래시하지 않는다', () => {
    expect(splitEvenly(1000, 0)).toEqual([]);
    expect(splitEvenly(1000, -1)).toEqual([]);
  });
});

describe('distributeWithRemainder', () => {
  it('B1: 100원 단위, 10,000원을 3명 균등 → 각 3,300원 + 잔액 100원은 총무가 흡수, 합 10,000', () => {
    const share = 10000 / 3;
    const subtotals = { a: share, b: share, c: share };
    const out = distributeWithRemainder(subtotals, 100, 'a');

    expect(out.b.rounded).toBe(3300);
    expect(out.c.rounded).toBe(3300);
    expect(out.a.rounded).toBeCloseTo(3400, 6);

    const sum = out.a.rounded + out.b.rounded + out.c.rounded;
    expect(sum).toBeCloseTo(10000, 6);
  });

  it('B2: 단위 0이면 원본 그대로, adjustment 전원 0', () => {
    const subtotals = { a: 3333, b: 3333, c: 3334 };
    const out = distributeWithRemainder(subtotals, 0);

    expect(out.a).toEqual({ rounded: 3333, adjustment: 0 });
    expect(out.b).toEqual({ rounded: 3333, adjustment: 0 });
    expect(out.c).toEqual({ rounded: 3334, adjustment: 0 });
  });

  it('B3: 총무 미지정 시 잔액은 최대 부담자가 흡수하고 adjustment 가 -100원으로 남는다', () => {
    // 합계 9,900 인데 개별 반올림 합은 10,000 → 잔액 -100 을 최대 부담자(a)가 흡수
    const subtotals = { a: 5000, b: 2450, c: 2450 };
    const out = distributeWithRemainder(subtotals, 100);

    expect(out.b.rounded).toBe(2500);
    expect(out.c.rounded).toBe(2500);
    expect(out.a.rounded).toBe(4900);
    expect(out.a.adjustment).toBe(-100);
    expect(out.b.adjustment).toBe(50);
    expect(out.c.adjustment).toBe(50);
    expect(out.a.rounded + out.b.rounded + out.c.rounded).toBe(9900);
  });

  it('B3: 존재하지 않는 흡수자 id 를 주면 최대 부담자 규칙으로 폴백한다', () => {
    const subtotals = { a: 5000, b: 2450, c: 2450 };
    const out = distributeWithRemainder(subtotals, 100, 'nobody');
    expect(out.a.adjustment).toBe(-100);
  });

  it('B4: 음수 최종 금액(내기로 이득 본 사람)도 반올림이 정상 동작한다', () => {
    const subtotals = { a: -2440, b: 6000, c: 4000 };
    const out = distributeWithRemainder(subtotals, 100, 'b');

    expect(out.a.rounded).toBe(-2400);
    expect(out.c.rounded).toBe(4000);
    // a 가 40원 덜 받게 반올림되었으므로 총무 b 가 -40 을 흡수
    expect(out.b.rounded).toBe(5960);
    expect(out.a.rounded + out.b.rounded + out.c.rounded).toBe(7560);
    expect(out.a.rounded).toBeLessThan(0);
  });

  it('합계 보존: 반올림 후 총합이 반올림 전 총합과 일치한다', () => {
    const cases: Array<[Record<string, number>, 0 | 10 | 100]> = [
      [{ a: 1234, b: 5678, c: 9012 }, 100],
      [{ a: 1234, b: 5678, c: 9012 }, 10],
      [{ a: 1234, b: 5678, c: 9012 }, 0],
      [{ a: -1234, b: 5678 }, 100],
      [{ solo: 7777 }, 100],
    ];
    for (const [subtotals, unit] of cases) {
      const out = distributeWithRemainder(subtotals, unit);
      const before = Object.values(subtotals).reduce((a, b) => a + b, 0);
      const after = Object.values(out).reduce((a, b) => a + b.rounded, 0);
      expect(after).toBeCloseTo(before, 6);
    }
  });

  it('빈 입력은 빈 결과를 반환하고 크래시하지 않는다', () => {
    expect(distributeWithRemainder({}, 100)).toEqual({});
    expect(distributeWithRemainder({}, 100, 'a')).toEqual({});
  });

  it('adjustment 는 항상 rounded - subtotal 이다', () => {
    const subtotals: Record<string, number> = { a: 1234, b: 5678, c: 9012 };
    const out = distributeWithRemainder(subtotals, 100, 'c');
    for (const id of Object.keys(subtotals)) {
      expect(out[id].adjustment).toBeCloseTo(out[id].rounded - subtotals[id], 6);
    }
  });
});

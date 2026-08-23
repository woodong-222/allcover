import { describe, expect, it } from 'vitest';
import { distributeWithRemainder, roundTo, splitEvenly } from './money';
import { formatKRW, formatSigned } from './format';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('roundTo — 1원 단위 올림', () => {
  it('정수는 그대로 둔다', () => {
    expect(roundTo(3333)).toBe(3333);
    expect(roundTo(0)).toBe(0);
    expect(roundTo(-1234)).toBe(-1234);
  });

  it('소수는 1원 단위로 올린다', () => {
    expect(roundTo(3333.0001)).toBe(3334);
    expect(roundTo(3333.5)).toBe(3334);
    expect(roundTo(3333.9999)).toBe(3334);
  });

  it("B4(교체): 음수는 부호 대칭이 아니라 0 쪽으로 올린다 — Math.ceil 방향", () => {
    // 이전 roundTo(-3350, 100) 은 -3400 이었다. 지금은 0 쪽으로 붙는다.
    expect(roundTo(-2440.5)).toBe(-2440);
    expect(roundTo(-2440.9)).toBe(-2440);
    expect(roundTo(-0.5)).toBe(-0);
    // 받을 사람(음수)은 올림이 불리하게 작용해 1원 덜 받는다 — 전원 동일 방향의 대가다
    expect(roundTo(-9000.5)).toBeGreaterThan(-9000.5);
  });

  it('B5\': 어떤 입력에도 정수를 돌려준다', () => {
    for (const x of [0, 1, -1, 0.1, -0.1, 1234.5678, -1234.5678, 1e-12, -1e-12]) {
      expect(Number.isInteger(roundTo(x))).toBe(true);
    }
  });
});

describe('splitEvenly — 전원이 정확히 같은 금액을 낸다', () => {
  it('E1: 나누어떨어지지 않아도 전원이 같은 정수 금액을 낸다 (8,000 / 3명)', () => {
    // 8,000원을 3명이 나누면 2,666.666… 을 올려 **전원 2,667** 이다.
    // 이전 정책은 2,667 / 2,667 / 2,666 으로 합계를 8,000 에 맞췄지만, 볼링 모임에서
    // "왜 쟤만 1원 덜 내" 가 나오는 쪽이 1~2원 더 걷히는 쪽보다 나쁘다고 판단해
    // 2026-08-21 에 전원 동일로 바꿨다. 초과 1원은 CalcResult.roundingSurplus 로 드러난다.
    expect(splitEvenly(8000, 3)).toEqual([2667, 2667, 2667]);
    expect(splitEvenly(8000, 3).every(Number.isInteger)).toBe(true);
    // 합계는 total 이상이고, 초과분은 정확히 1원이다 (인원수 3 미만)
    expect(sum(splitEvenly(8000, 3))).toBe(8001);
    expect(sum(splitEvenly(8000, 3)) - 8000).toBe(1);
  });

  it('E1: 어떤 조합에서도 모든 몫이 서로 완전히 같다 (이번 정책 변경의 핵심)', () => {
    // 이 검사가 새 정책을 지키는 유일한 방어선이다. "사람 간 차이 <= 1원" 으로 느슨하게 두면
    // 옛 구현(한 명만 1원 덜 냄)이 그대로 통과하므로, 반드시 완전 동일성으로 조여 둔다.
    let uneven = 0;
    for (let total = 0; total <= 200; total += 7) {
      for (let count = 1; count <= 9; count++) {
        const shares = splitEvenly(total, count);
        expect(new Set(shares).size).toBe(1);
        expect(Math.max(...shares) - Math.min(...shares)).toBe(0);
        if (total % count !== 0) uneven++;
      }
    }
    // 나누어떨어지지 않는 케이스가 실제로 생성돼야 검사가 공허하지 않다
    expect(uneven).toBe(151);
  });

  it('E2: 초과분은 정확히 ceil(total/count)*count - total 이고 항상 인원수 미만이다', () => {
    let withSurplus = 0;
    for (let total = 0; total <= 200; total += 7) {
      for (let count = 1; count <= 9; count++) {
        const shares = splitEvenly(total, count);
        expect(shares).toHaveLength(count);
        expect(shares.every(Number.isInteger)).toBe(true);

        const surplus = sum(shares) - total;
        // 근사가 아니라 정확한 값이다 — toBeCloseTo 로 두면 1원 유출을 못 잡는다
        expect(surplus).toBe(Math.ceil(total / count) * count - total);
        expect(surplus).toBeGreaterThanOrEqual(0);
        // 상한도 정확하다: 나눗셈 한 번이 만드는 초과분은 반드시 인원수 미만이다
        expect(surplus).toBeLessThan(count);
        if (surplus > 0) withSurplus++;
      }
    }
    expect(withSurplus).toBe(151);
  });

  it('나누어떨어지면 초과분이 0 이고 합계가 정확히 total 이다', () => {
    for (const [total, count] of [
      [9, 3],
      [12000, 5],
      [16000, 4],
      [0, 7],
    ] as const) {
      const shares = splitEvenly(total, count);
      expect(new Set(shares).size).toBe(1);
      expect(sum(shares)).toBe(total);
    }
    expect(splitEvenly(9, 3)).toEqual([3, 3, 3]);
  });

  it('같은 입력은 항상 같은 결과다 (결정성 — 새로고침해도 금액이 흔들리면 안 된다)', () => {
    expect(splitEvenly(10, 4)).toEqual([3, 3, 3, 3]);
    expect(splitEvenly(10, 3)).toEqual([4, 4, 4]);
    for (const [total, count] of [
      [10, 4],
      [10, 3],
      [8000, 3],
      [13000, 6],
    ] as const) {
      expect(splitEvenly(total, count)).toEqual(splitEvenly(total, count));
    }
  });

  it('음수 총액도 전원 동일한 정수이고 합계는 total 이상이다', () => {
    // Math.ceil 은 0 쪽으로 가므로 -10/3 = -3.333… → 전원 -3, 합계 -9 (total 보다 1 크다)
    expect(splitEvenly(-10, 3)).toEqual([-3, -3, -3]);
    expect(sum(splitEvenly(-10, 3))).toBe(-9);
    expect(sum(splitEvenly(-10, 3)) - -10).toBe(1);
    expect(splitEvenly(-10, 3).every(Number.isInteger)).toBe(true);
  });

  it('인원이 0 이하면 빈 배열을 반환하고 크래시하지 않는다', () => {
    expect(splitEvenly(1000, 0)).toEqual([]);
    expect(splitEvenly(1000, -1)).toEqual([]);
  });
});

describe('distributeWithRemainder — 1원 올림 + 초과분 흡수', () => {
  it("B1': Σ subtotal 이 정수면 각자 rounded 가 정수이고 Σ rounded === Σ subtotal", () => {
    const subtotals = { a: 100.5, b: 100.5, c: 99 }; // Σ = 300
    const out = distributeWithRemainder(subtotals);

    expect(Object.values(out).every((x) => Number.isInteger(x.rounded))).toBe(true);
    expect(sum(Object.values(out).map((x) => x.rounded))).toBe(300);
    // 전원 올림 후 초과분 -1 을 최대 부담자 a 가 되돌려받는다
    expect(out.b.rounded).toBe(101);
    expect(out.c.rounded).toBe(99);
    expect(out.a.rounded).toBe(100);
  });

  it("B2': 흡수자를 제외한 전원의 rounded >= subtotal (올림 방향 보장)", () => {
    const subtotals = { a: 100.5, b: 100.5, c: 99 };
    const out = distributeWithRemainder(subtotals);
    for (const id of ['b', 'c']) {
      expect(out[id].rounded).toBeGreaterThanOrEqual(subtotals[id as 'b' | 'c']);
    }
  });

  it("B5': 흡수자 행과 음수 행을 포함해 모든 rounded 가 정수다", () => {
    const cases: Record<string, number>[] = [
      { a: 6667, b: 6667, c: 6666 },
      { a: -9000, b: 6000, c: 3000 },
      { a: 100.5, b: 100.5, c: 99 },
      { a: -2440.5, b: 2440.5 },
      { solo: 7777 },
    ];
    for (const subtotals of cases) {
      const out = distributeWithRemainder(subtotals);
      for (const share of Object.values(out)) {
        expect(Number.isInteger(share.rounded)).toBe(true);
      }
    }
  });

  it("B5': 부동소수 잔여가 흡수자 행에 새지 않는다 (Math.round 스냅)", () => {
    // reviewer 실측 사례: 6명이 13,000원을 나눠 가지면 Σ subtotal 에 1.8e-12 급 잔여가 남는다.
    // 스냅이 없으면 흡수자 행이 2166.9999999999982 같은 비정수가 되고,
    // "잔돈 조정 +0원" 배지가 공유 이미지에 박힌다.
    for (const [count, amount] of [
      [6, 13000],
      [7, 10000],
    ] as const) {
      const share = amount / count;
      const subtotals: Record<string, number> = {};
      for (let i = 0; i < count; i++) subtotals[`m${i}`] = share;

      // 전제 확인: 이 조합은 실제로 부동소수 잔여를 만든다 (테스트가 공허하지 않다)
      const rawRemainder =
        Object.values(subtotals).reduce((a, b) => a + b, 0) -
        Object.values(subtotals).reduce((a, b) => a + Math.ceil(b), 0);
      expect(Number.isInteger(rawRemainder)).toBe(false);

      const out = distributeWithRemainder(subtotals);
      for (const row of Object.values(out)) {
        expect(Number.isInteger(row.rounded)).toBe(true);
        expect(formatKRW(row.rounded)).not.toContain('.');
      }
    }
  });

  it("B6': 표시 문자열 어디에도 소수점이 없다", () => {
    const subtotals = { a: 6667, b: 6667, c: 6666, d: -9000 };
    const out = distributeWithRemainder(subtotals);
    for (const share of Object.values(out)) {
      expect(formatKRW(share.rounded)).not.toContain('.');
      expect(formatSigned(share.adjustment)).not.toContain('.');
    }
  });

  // 총무 지정은 2026-08-21 에 제거됐다. 흡수자는 항상 최대 부담자다.
  it('B3: 최대 부담자가 초과분을 흡수한다', () => {
    const subtotals = { small: 10.5, big: 1000.5, mid: 100 }; // Σ = 1111
    const out = distributeWithRemainder(subtotals);
    expect(out.small.rounded).toBe(11);
    expect(out.mid.rounded).toBe(100);
    expect(out.big.rounded).toBe(1000); // 1001 에서 초과분 -1 흡수
    expect(sum(Object.values(out).map((x) => x.rounded))).toBe(1111);
  });

  it('B3: 정수 subtotal 만 있으면 조정이 전혀 일어나지 않는다 (배지가 뜨지 않아야 한다)', () => {
    const subtotals = { a: 6667, b: 6667, c: 6666 };
    const out = distributeWithRemainder(subtotals);
    for (const share of Object.values(out)) {
      // 1.8e-12 같은 sub-원 잔여가 아니라 정확히 0 이어야 `!== 0` 배지 판정이 의미를 갖는다
      expect(share.adjustment).toBe(0);
    }
    expect(sum(Object.values(out).map((x) => x.rounded))).toBe(20000);
  });

  it('B4: 음수 최종 금액(받을 사람)도 정상 동작한다', () => {
    const subtotals = { a: -2400, b: 6000, c: 4000 };
    const out = distributeWithRemainder(subtotals);
    expect(out.a.rounded).toBe(-2400);
    expect(out.a.rounded).toBeLessThan(0);
    expect(out.c.rounded).toBe(4000);
    expect(sum(Object.values(out).map((x) => x.rounded))).toBe(7600);
  });

  it('빈 입력은 빈 결과를 반환하고 크래시하지 않는다', () => {
    expect(distributeWithRemainder({})).toEqual({});
  });

  it('adjustment 는 항상 rounded - subtotal 이다', () => {
    const subtotals: Record<string, number> = { a: 1234, b: 5678, c: 9012 };
    const out = distributeWithRemainder(subtotals);
    for (const id of Object.keys(subtotals)) {
      expect(out[id].adjustment).toBe(out[id].rounded - subtotals[id]);
    }
  });
});

/**
 * 금액 올림과 잔돈 배분.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §5-A-1, 인수조건 B1'~B6'
 */

/**
 * 1원 단위로 올린다. 반올림 단위 선택(0/10/100)은 5-A-1 에서 제거됐다.
 *
 * **음수 주의**: 이전 `roundTo(amount, unit)` 은 부호 대칭(0에서 멀어지는 방향)이라
 * `-3350` 이 `-3400` 이 됐지만, `Math.ceil` 은 0 쪽으로 간다 — `ceil(-2440.5) === -2440`.
 * 즉 받을 사람(음수)은 올림이 불리하게 작용해 1원 덜 받는다. 전원 동일 방향이라는
 * 일관성을 택한 결과이고, 실제로는 subtotal 이 이미 정수라 차이가 생기지 않는다.
 */
export function roundTo(amount: number): number {
  return Math.ceil(amount);
}

/**
 * `total` 을 `count` 명에게 나눈다. 합계는 항상 정확히 `total` 이다.
 *
 * `total` 이 정수면 결과도 **전부 정수**이고, 나누어떨어지지 않는 1원씩은 앞사람부터
 * 순서대로 흡수한다. 호출 측이 넘긴 순서가 곧 결정 순서이므로 같은 입력이면 항상 같은 결과다.
 * (소수점 금액이 그대로 공유 이미지에 찍히는 것을 막기 위한 것 — 계획서 R13)
 */
export function splitEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  let rest = total - base * count; // 정수 입력이면 0 <= rest < count 인 정수
  const shares: number[] = [];
  for (let i = 0; i < count; i++) {
    const bonus = rest > 0 ? Math.min(1, rest) : 0;
    shares.push(base + bonus);
    rest -= bonus;
  }
  return shares;
}

export type RoundedShare = { rounded: number; adjustment: number };

/**
 * 각자의 부담액을 1원 단위로 올리고, 그렇게 생긴 초과분을 **최대 부담자**가 흡수한다.
 *
 * 총무 지정이 제거되면서(2026-08-21) 흡수자 선택지가 사라져 규칙이 하나로 고정됐다.
 *
 * 전원을 올리므로 `Σ rounded >= Σ subtotal` 이 되고, 그 초과분을 흡수자가 되돌려받아
 * `Σ rounded === Math.round(Σ subtotal)` 이 성립한다. `Σ subtotal` 이 정수이면
 * (입력이 정수로 강제되므로 실무에서는 항상) `Σ rounded === Σ subtotal` 이 정확히 성립한다 (B1'').
 *
 * 흡수분은 더하기 전에 `Math.round` 로 스냅한다. 이게 없으면 `total` 누적 과정의
 * 부동소수 잔여(예: 1.8e-12)가 흡수자 행에 새어 `rounded`·`adjustment` 가 비정수가 되고,
 * "잔돈 조정 +0원" 같은 무의미한 배지가 공유 이미지에 박힌다 (B5', B6', B3).
 * 스냅이 총액 보존을 깨지 않으려면 `Σ subtotal` 이 정수여야 하는데, 이는 입력이 정수로
 * 강제되고 모든 나눗셈이 `splitEvenly` 를 거치므로 항상 성립한다 (B1' 전제).
 */
export function distributeWithRemainder(
  subtotals: Record<string, number>,
): Record<string, RoundedShare> {
  const ids = Object.keys(subtotals);
  const out: Record<string, RoundedShare> = {};
  if (ids.length === 0) return out;

  let total = 0;
  let roundedTotal = 0;
  for (const id of ids) {
    const rounded = roundTo(subtotals[id]);
    out[id] = { rounded, adjustment: rounded - subtotals[id] };
    total += subtotals[id];
    roundedTotal += rounded;
  }

  const absorber = ids.reduce((best, id) => (subtotals[id] > subtotals[best] ? id : best), ids[0]);

  const remainder = Math.round(total - roundedTotal);
  if (remainder !== 0) {
    out[absorber].rounded += remainder;
    out[absorber].adjustment = out[absorber].rounded - subtotals[absorber];
  }
  return out;
}

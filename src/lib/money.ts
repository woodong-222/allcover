/** 금액 올림과 잔돈 배분. */

/**
 * 1원 단위로 올린다.
 *
 * 음수는 0 쪽으로 붙는다 — `ceil(-2440.5) === -2440`. 받을 사람은 그만큼 1원 덜 받는
 * 셈인데, 전원이 같은 방향으로 올라간다는 일관성을 택한 결과다. subtotal 이 이미 정수라
 * 실제로는 차이가 생기지 않는다.
 */
export function roundTo(amount: number): number {
  return Math.ceil(amount);
}

/**
 * `total` 을 `count` 명에게 나눈다. **전원이 정확히 같은 금액을 낸다.**
 *
 * 나누어떨어지지 않으면 1원 단위로 올리므로 합계가 `total` 보다 최대 `count - 1` 원 커진다.
 * 예: 8,000원을 3명이 나누면 `2,667 × 3 = 8,001` 로 1원이 더 걷힌다.
 *
 * 합계를 `total` 에 정확히 맞추려면 누군가 한 명은 1원을 덜 내야 하는데, 볼링 모임에서
 * "왜 쟤만 1원 덜 내" 가 나오는 쪽이 1~2원 더 걷히는 쪽보다 나쁘다고 봤다. 더 걷힌 금액은
 * `calculate()` 가 `roundingSurplus` 로 내보내 화면에서 설명한다.
 *
 * `total` 이 정수면 결과도 전부 정수다 — 공유 이미지에 소수점이 찍히지 않는다.
 */
export function splitEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  return Array<number>(count).fill(Math.ceil(total / count));
}

export type RoundedShare = { rounded: number; adjustment: number };

/**
 * 각자의 부담액을 1원 단위로 올리고, 그렇게 생긴 초과분을 최대 부담자가 흡수한다.
 *
 * 전원을 올리므로 `Σ rounded >= Σ subtotal` 이 되고, 그 초과분을 흡수자가 되돌려받아
 * `Σ rounded === Math.round(Σ subtotal)` 이 성립한다. `Σ subtotal` 이 정수이면
 * (입력이 정수로 강제되므로 실무에서는 항상) `Σ rounded === Σ subtotal` 이 정확히 성립한다.
 *
 * 흡수분은 더하기 전에 `Math.round` 로 스냅한다. 이게 없으면 `total` 누적 과정의
 * 부동소수 잔여(예: 1.8e-12)가 흡수자 행에 새어 `rounded`·`adjustment` 가 비정수가 되고,
 * "잔돈 조정 +0원" 같은 무의미한 배지가 공유 이미지에 박힌다.
 * 스냅이 총액 보존을 깨지 않으려면 `Σ subtotal` 이 정수여야 하는데, 이는 입력이 정수로
 * 강제되고 모든 나눗셈이 `splitEvenly` 를 거치므로 항상 성립한다.
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

/**
 * 금액 반올림과 잔돈 배분.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §2, 인수조건 B1~B4
 */

/**
 * `unit` 단위로 반올림한다. `unit === 0` 이면 원 단위 그대로 반환.
 * 음수는 부호 대칭(0에서 멀어지는 방향)으로 반올림한다: 3,350 → 3,400, -3,350 → -3,400.
 */
export function roundTo(amount: number, unit: 0 | 10 | 100): number {
  if (unit === 0) return amount;
  const sign = amount < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(amount) / unit) * unit;
}

export type RoundedShare = { rounded: number; adjustment: number };

/**
 * 각자의 부담액을 `unit` 단위로 반올림하고, 그 과정에서 생긴 총 오차를 한 사람이 흡수한다.
 *
 * - `absorberId` 가 주어지고 실제로 존재하면 그 사람(=총무)이 흡수한다.
 * - 없으면 subtotal 이 가장 큰 사람(최대 부담자)이 흡수한다.
 *
 * 반환값의 `rounded` 합계는 반올림 전 `subtotals` 합계와 일치한다.
 */
export function distributeWithRemainder(
  subtotals: Record<string, number>,
  unit: 0 | 10 | 100,
  absorberId?: string,
): Record<string, RoundedShare> {
  const ids = Object.keys(subtotals);
  const out: Record<string, RoundedShare> = {};
  if (ids.length === 0) return out;

  let total = 0;
  let roundedTotal = 0;
  for (const id of ids) {
    const rounded = roundTo(subtotals[id], unit);
    out[id] = { rounded, adjustment: rounded - subtotals[id] };
    total += subtotals[id];
    roundedTotal += rounded;
  }

  const absorber =
    absorberId !== undefined && absorberId in subtotals
      ? absorberId
      : ids.reduce((best, id) => (subtotals[id] > subtotals[best] ? id : best), ids[0]);

  const remainder = total - roundedTotal;
  if (remainder !== 0) {
    out[absorber].rounded += remainder;
    out[absorber].adjustment = out[absorber].rounded - subtotals[absorber];
  }
  return out;
}

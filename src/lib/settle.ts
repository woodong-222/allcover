/**
 * 최종 부담액을 실제 송금 목록으로 바꾼다.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §4 M4
 */
import type { Member, MemberResult } from '../types';

export type Transfer = { from: string; to: string; amount: number };

/** 부동소수 잔여분을 0으로 볼 임계값 */
const EPSILON = 1e-9;

/**
 * - `treasurerId` 가 주어지면 모든 송금이 총무에게 모인다.
 *   부담액이 음수(내기로 이득 본 사람)면 총무가 그 사람에게 주는 역방향 송금이 된다.
 * - 총무가 없으면 그리디 최소 송금: 가장 큰 채무자와 가장 큰 채권자를 반복 매칭한다.
 *   정산 총액이 남는 경우(Σ rounded > 0) 채권자 몫까지만 송금하고 나머지는 각자 부담한다.
 *
 * 결과 순서는 `members` 순서를 따라 결정적이다.
 */
export function settleTransfers(
  results: MemberResult[],
  members: Member[],
  treasurerId?: string,
): Transfer[] {
  const amountOf = new Map(results.map((r) => [r.memberId, r.rounded]));
  const order = members.map((m) => m.id).filter((id) => amountOf.has(id));
  const transfers: Transfer[] = [];

  if (treasurerId !== undefined && amountOf.has(treasurerId)) {
    for (const id of order) {
      if (id === treasurerId) continue;
      const amount = amountOf.get(id) ?? 0;
      if (amount > EPSILON) transfers.push({ from: id, to: treasurerId, amount });
      else if (amount < -EPSILON) transfers.push({ from: treasurerId, to: id, amount: -amount });
    }
    return transfers;
  }

  const debtors = order
    .filter((id) => (amountOf.get(id) ?? 0) > EPSILON)
    .map((id) => ({ id, left: amountOf.get(id) as number }));
  const creditors = order
    .filter((id) => (amountOf.get(id) ?? 0) < -EPSILON)
    .map((id) => ({ id, left: -(amountOf.get(id) as number) }));

  // Array.prototype.sort 는 안정 정렬이므로 동점은 members 순서가 유지된다.
  debtors.sort((a, b) => b.left - a.left);
  creditors.sort((a, b) => b.left - a.left);

  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(debtors[d].left, creditors[c].left);
    if (amount > EPSILON) transfers.push({ from: debtors[d].id, to: creditors[c].id, amount });
    debtors[d].left -= amount;
    creditors[c].left -= amount;
    if (debtors[d].left <= EPSILON) d++;
    if (creditors[c].left <= EPSILON) c++;
  }
  return transfers;
}

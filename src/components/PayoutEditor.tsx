/**
 * 등수별 인당 배당액 편집기.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §2 "배당 입력 규칙", R4, 인수조건 A6
 *
 * pot = ante × 참여인원, 배당합 = Σ payout[r] × rankGroup[r].length.
 * 둘의 차이(= 남은 판돈)를 실시간으로 보여주고, 0이 아니면 색으로 경고한다. 숨기지 않는다.
 *
 * 그룹 인원수는 roundDelta와 똑같이 "참여자로 필터링한" 크기를 쓴다.
 * 그래야 화면에 보이는 남은 판돈과 실제 imbalance가 어긋나지 않는다.
 */

import type { Round } from '../types';
import { formatKRW } from '../lib/format';
import { useSettlementStore } from '../store/useSettlementStore';
import { NumberField } from './ui/NumberField';

const HIT_AREA = 'min-h-[44px] min-w-[44px]';

export type PayoutEditorProps = {
  round: Round;
};

/**
 * 남은 판돈을 배당 배열에 흡수시켜 imbalance를 정확히 0으로 만든다.
 *
 * 1. 배당이 판돈을 넘었으면 마지막 등수부터 인당 배당을 0원으로 비워 초과분을 걷어낸다.
 *    (1등 그룹은 비우지 않는다. 음수 배당을 만들지 않기 위한 단계)
 * 2. 마지막 등수 그룹에 인당 100원 단위로 나눠 담고, 남는 금액은 1등 그룹에 인당 균등하게 얹는다.
 * 3. 1등 인원수로 나누어떨어지지 않으면, 뒤 등수부터 인원수로 딱 나누어떨어지는 등수를 찾아 통째로 얹는다.
 * 4. 어떤 등수로도 원 단위로 나뉘지 않으면 마지막 등수 그룹에 그대로 나눠 담는다.
 *
 * 어느 경로를 타도 결과 배당합은 pot과 정확히 같아진다.
 */
export function distributeRemainder(payout: number[], sizes: number[], pot: number): number[] {
  const next = sizes.map((_, i) => payout[i] ?? 0);
  const paid = sizes.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0);
  if (paid.length === 0) return next;

  let remaining = pot - next.reduce((acc, p, i) => acc + p * sizes[i], 0);

  // 1) 초과분 걷어내기
  for (let k = paid.length - 1; k >= 1 && remaining < 0; k--) {
    const i = paid[k];
    const capacity = next[i] * sizes[i];
    if (capacity === 0) continue;
    if (capacity > -remaining) break; // 이 등수 안에서 다 흡수된다 → 아래 단계로
    remaining += capacity;
    next[i] = 0;
  }
  if (remaining === 0) return next;

  // 2) 마지막 등수에 100원 단위 + 1등 잔액 흡수
  const first = paid[0];
  const last = paid[paid.length - 1];
  const per = Math.floor(remaining / sizes[last] / 100) * 100;
  const leftover = remaining - per * sizes[last];
  if (
    first !== last &&
    next[last] + per >= 0 &&
    leftover % sizes[first] === 0 &&
    next[first] + leftover / sizes[first] >= 0
  ) {
    next[last] += per;
    next[first] += leftover / sizes[first];
    return next;
  }

  // 3) 나누어떨어지는 등수를 뒤에서부터 찾는다
  for (let k = paid.length - 1; k >= 0; k--) {
    const i = paid[k];
    const share = remaining / sizes[i];
    if (Number.isInteger(share) && next[i] + share >= 0) {
      next[i] += share;
      return next;
    }
  }

  // 4) 최후 수단: 마지막 등수에 그대로 나눠 담는다
  next[last] += remaining / sizes[last];
  return next;
}

export function PayoutEditor({ round }: PayoutEditorProps) {
  const setPayout = useSettlementStore((s) => s.setPayout);

  const participantIds = [...new Set(round.participants)];
  const joined = new Set(participantIds);
  const sizes = round.ranking.map((group) => group.filter((id) => joined.has(id)).length);
  const pot = round.ante * participantIds.length;
  const payoutTotal = sizes.reduce((acc, n, i) => acc + (round.payout[i] ?? 0) * n, 0);
  const remaining = pot - payoutTotal;
  const paidRanks = sizes.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0);

  if (round.ranking.length === 0) {
    return <p className="text-sm text-slate-600">먼저 순위를 정해주세요.</p>;
  }

  function handleChange(rank: number, value: number): void {
    setPayout(
      round.id,
      round.ranking.map((_, i) => (i === rank ? value : round.payout[i] ?? 0)),
    );
  }

  function handleAutoDistribute(): void {
    setPayout(round.id, distributeRemainder(round.payout, sizes, pot));
  }

  /** 승자독식: pot 전액을 1등 그룹 인원수로 나눠 인당 배당으로 준다 */
  function handleWinnerTakesAll(): void {
    const next = round.ranking.map(() => 0);
    const first = paidRanks[0];
    next[first] = pot / sizes[first];
    setPayout(round.id, next);
  }

  /** 1·2등 차등: pot의 60%를 1등 그룹, 40%를 2등 그룹에 인당 균등 배분 */
  function handleSplit6040(): void {
    const next = round.ranking.map(() => 0);
    const [first, second] = paidRanks;
    next[first] = (pot * 0.6) / sizes[first];
    next[second] = (pot * 0.4) / sizes[second];
    setPayout(round.id, next);
  }

  const remainingText =
    remaining === 0
      ? '0원'
      : remaining > 0
        ? `${formatKRW(remaining)} 남음`
        : `${formatKRW(-remaining)} 초과`;
  const remainingTone =
    remaining === 0
      ? 'bg-emerald-50 text-emerald-800'
      : remaining > 0
        ? 'bg-amber-50 text-amber-900'
        : 'bg-red-50 text-red-800';

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-700">
        판돈 {formatKRW(pot)} · 인당 {formatKRW(round.ante)} × {participantIds.length}명
      </p>

      <div className="flex flex-col gap-2">
        {round.ranking.map((_, rank) => (
          <NumberField
            key={rank}
            label={`${rank + 1}등 인당 배당`}
            value={round.payout[rank] ?? 0}
            onChange={(v) => handleChange(rank, v)}
            suffix="원"
          />
        ))}
      </div>

      <p role="status" className={`rounded-lg px-3 py-2 text-sm font-semibold ${remainingTone}`}>
        {`남은 판돈 ${remainingText}`}
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleAutoDistribute}
          disabled={remaining === 0 || paidRanks.length === 0}
          className={`${HIT_AREA} rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700`}
        >
          나머지 자동 분배
        </button>
        <button
          type="button"
          onClick={handleWinnerTakesAll}
          disabled={paidRanks.length === 0}
          className={`${HIT_AREA} rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:text-slate-500`}
        >
          승자독식
        </button>
        <button
          type="button"
          onClick={handleSplit6040}
          disabled={paidRanks.length < 2}
          className={`${HIT_AREA} rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:text-slate-500`}
        >
          1·2등 차등
        </button>
      </div>

      <p className="text-xs text-slate-600">
        나머지 자동 분배는 남은 판돈을 마지막 등수 그룹에 인당 100원 단위로 나눠 담고, 남는 금액을
        1등 그룹에 인당 균등하게 얹습니다. 1등 인원수로 나누어떨어지지 않으면 인원수로 딱 나뉘는
        등수를 뒤에서부터 찾아 얹습니다. 배당이 판돈을 넘은 경우에는 마지막 등수부터 인당 배당을
        0원으로 비워 초과분을 걷어냅니다. 어느 쪽이든 남은 판돈은 정확히 0원이 됩니다.
      </p>
    </div>
  );
}

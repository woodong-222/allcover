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
 * 남은 판돈을 배당 배열에 흡수시켜 imbalance를 0으로 만든다.
 * **결과 payout은 항상 정수(원 단위)다.** 소수 배당은 결과 카드·공유 이미지를 오염시키고,
 * NumberField가 소수점을 제거해 금액이 100배로 튀는 버그를 만든다. 생성 지점에서 막는다.
 *
 * 1. 배당이 판돈을 넘었으면 마지막 등수부터 인당 배당을 0원으로 비워 초과분을 걷어낸다.
 *    (1등 그룹은 비우지 않는다. 음수 배당을 만들지 않기 위한 단계)
 * 2. 마지막 등수 그룹에 인당 100원 단위로 담는다.
 * 3. 잔액이 인원수로 딱 나뉘는 등수를 뒤에서부터 찾아 통째로 얹는다.
 * 4. 한 등수로 안 되면 두 등수의 인당 배당을 함께 조정해 정수로 정확히 맞춘다.
 *    (뒤 등수를 먼저 움직이고 1등 그룹으로 상쇄하는 순서 — 계획서 §2 배분 규칙과 같은 방향)
 * 5. 등수 그룹 인원수의 최대공약수가 잔액을 나누지 못하면 정수 해가 **존재하지 않는다.**
 *    예: 등수 그룹이 7명 하나뿐이고 판돈이 900원 → 900 % 7 === 4 이라 7·p = 900 인 정수 p가 없다.
 *    이때는 최대한 담고 잔액을 남긴다. imbalance가 작은 **정수**로 남아 경고가 진실해진다
 *    (소수로 억지로 맞추면 1.1e-13 같은 값이 남아 "0원 어긋남"이라는 무의미한 경고가 뜬다).
 *
 * 1~4를 탄 경우 결과 배당합은 pot과 정확히 같다.
 */
export function distributeRemainder(payout: number[], sizes: number[], pot: number): number[] {
  // 예전에 저장된 소수 배당이 섞여 들어와도 여기서 정수로 정규화한다.
  const next = sizes.map((_, i) => Math.round(payout[i] ?? 0));
  const paid = sizes.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0);
  if (paid.length === 0) return next;

  let remaining = pot - next.reduce((acc, p, i) => acc + p * sizes[i], 0);
  if (remaining === 0) return next;

  const last = paid[paid.length - 1];

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

  // 2) 마지막 등수에 100원 단위로 담는다. 이후 잔액은 100 × 인원수 미만으로 작아진다.
  const chunk = Math.floor(remaining / sizes[last] / 100) * 100;
  if (chunk !== 0 && next[last] + chunk >= 0) {
    next[last] += chunk;
    remaining -= chunk * sizes[last];
    if (remaining === 0) return next;
  }

  // 3) 잔액이 딱 나뉘는 등수를 뒤에서부터 찾는다
  for (let k = paid.length - 1; k >= 0; k--) {
    const i = paid[k];
    const share = remaining / sizes[i];
    if (Number.isInteger(share) && next[i] + share >= 0) {
      next[i] += share;
      return next;
    }
  }

  // 4) 두 등수를 함께 조정한다. (뒤 등수, 1등) 쌍부터 시도한다.
  //
  // ★ 탐색 반복 횟수에 상한을 둔다 (2026-08-21 보안 검토 MEDIUM).
  // window 는 `remaining` 에 선형 비례하는데 `remaining` 은 사용자가 입력한 배당액에서 온다.
  // 상한이 없으면 배당액 10억 입력 시 7.5억 회를 돌아 메인 스레드가 10초 넘게 멈춘다.
  // 게다가 이 함수는 PayoutEditor 가 **매 렌더마다** 부르고 payout 은 localStorage 에
  // 저장되므로, 새로고침해도 같은 값으로 다시 멈춰 앱이 영구적으로 못 쓰게 된다.
  // 상한을 넘으면 포기하고 5) 로 떨어진다 — 5) 는 이미 "정수 해 없음" 을 정상 처리한다.
  let budget = 200_000;
  for (let k = paid.length - 1; k >= 0 && budget > 0; k--) {
    for (let m = 0; m < paid.length && budget > 0; m++) {
      const i = paid[k];
      const j = paid[m];
      if (i === j) continue;
      // a·sizes[i] + b·sizes[j] === remaining 인 정수 해를 찾는다.
      // a는 remaining/sizes[i] 근처이고, 해가 있다면 sizes[j] 주기 안에 반드시 나타난다.
      const window = Math.ceil(Math.abs(remaining) / sizes[i]) + sizes[j] + 1;
      for (let a = -window; a <= window && budget > 0; a++) {
        budget--;
        const rest = remaining - a * sizes[i];
        if (rest % sizes[j] !== 0) continue;
        const b = rest / sizes[j];
        if (next[i] + a >= 0 && next[j] + b >= 0) {
          next[i] += a;
          next[j] += b;
          return next;
        }
      }
    }
  }

  // 5) 정수 해가 없다. 최대한 담고 잔액은 남긴다 (imbalance가 정수로 남아 경고가 진실해진다).
  const rest = Math.trunc(remaining / sizes[last]);
  if (next[last] + rest >= 0) next[last] += rest;
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

  // 자동 분배 결과를 미리 계산해 두고, 실제로 바뀌는 게 있을 때만 버튼을 살린다.
  // 정수 해가 없는 판(§5 경로)에서 눌러도 아무 변화가 없는 버튼이 활성인 걸 막는다.
  const autoDistributed = distributeRemainder(round.payout, sizes, pot);
  const canAutoDistribute = autoDistributed.some((p, i) => p !== (round.payout[i] ?? 0));

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
    setPayout(round.id, autoDistributed);
  }

  /**
   * 승자독식: pot 전액을 1등 그룹 인원수로 나눠 인당 배당으로 준다.
   * 나누어떨어지지 않으면 내림한 뒤 잔액을 distributeRemainder에 맡긴다 — 소수 배당을 만들지 않는다.
   */
  function handleWinnerTakesAll(): void {
    const next = round.ranking.map(() => 0);
    const first = paidRanks[0];
    next[first] = Math.floor(pot / sizes[first]);
    setPayout(round.id, distributeRemainder(next, sizes, pot));
  }

  /**
   * 1·2등 차등: pot의 60%를 1등 그룹, 40%를 2등 그룹에 인당 균등 배분.
   * 0.6/0.4를 곱하면 부동소수 오차가 섞이므로 정수 나눗셈(× 6 ÷ 10)으로 계산하고,
   * 내림 잔액은 distributeRemainder가 흡수한다.
   */
  function handleSplit6040(): void {
    const next = round.ranking.map(() => 0);
    const [first, second] = paidRanks;
    next[first] = Math.floor((pot * 6) / 10 / sizes[first]);
    next[second] = Math.floor((pot * 4) / 10 / sizes[second]);
    setPayout(round.id, distributeRemainder(next, sizes, pot));
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
          disabled={!canAutoDistribute}
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
        나머지 자동 분배는 남은 판돈을 마지막 등수 그룹에 인당 100원 단위로 담고, 잔액은 인원수로 딱
        나뉘는 등수를 뒤에서부터 찾아 얹습니다. 한 등수로 안 되면 두 등수를 함께 조정합니다. 배당이
        판돈을 넘은 경우에는 마지막 등수부터 인당 배당을 0원으로 비워 초과분을 걷어냅니다. 배당액은
        항상 원 단위 정수로 맞춥니다. 등수 그룹 인원수로는 판돈을 정수로 나눌 수 없는 판(예: 7명
        그룹 하나에 판돈 900원)에서는 남은 금액이 그대로 남고, 위의 경고가 그 금액을 그대로 알려
        줍니다.
      </p>
    </div>
  );
}

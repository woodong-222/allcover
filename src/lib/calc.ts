/**
 * 정산 계산 엔진. React 의존 0의 순수 함수.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §2, 인수조건 A1~A11
 */
import type {
  CalcResult,
  MemberResult,
  Round,
  RoundBreakdown,
  Settlement,
} from '../types';
import { distributeWithRemainder, splitEvenly } from './money';

function zeroed(ids: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ids) out[id] = 0;
  return out;
}

/**
 * 한 판의 내기 결과를 계산한다.
 *
 * - `pot`: `delta = ante - payout[rankOf(m)]`, `imbalance = 배당합계 - 판돈합계`
 * - `transfer`: 진 쪽이 이긴 쪽 1인분(`amount`)을 나눠 부담
 * - `none` 및 계산 불가 엣지(참여자 0명 / 순위 0개 / losers 0명 또는 전원): 전원 0
 *
 * 전역 정산/내기 모드는 2026-08-24 에 제거됐다. 정산/내기는 판마다 다를 수 있으므로
 * `method === 'none'` 하나가 "이 판은 정산만" 을 뜻한다.
 */
export function roundDelta(round: Round, gameFeePerGame: number): RoundBreakdown {
  const participants = [...new Set(round.participants)];
  const delta = zeroed(participants);
  const noBet: RoundBreakdown = { roundId: round.id, delta, imbalance: 0, surplus: 0 };
  if (participants.length === 0 || round.method === 'none') return noBet;

  const joined = new Set(participants);

  if (round.method === 'pot') {
    // 미참여자가 순위 그룹에 섞여 있어도 배당 계산에서 제외한다 (A7).
    const groups = round.ranking.map((group) => group.filter((id) => joined.has(id)));
    if (groups.every((group) => group.length === 0)) return noBet; // 순위 탭 0개 (A9)

    const payoutOf = new Map<string, number>();
    let payoutTotal = 0;
    groups.forEach((group, rank) => {
      const perPerson = round.payout[rank] ?? 0;
      for (const id of group) {
        // 같은 멤버가 두 그룹에 들어가 있으면 상위 등수 배당만 인정한다.
        // payoutOf 와 payoutTotal 의 집계 기준이 어긋나면 `Σ betDelta === -imbalance` 가 깨진다.
        if (payoutOf.has(id)) continue;
        payoutOf.set(id, perPerson);
        payoutTotal += perPerson;
      }
    });

    for (const id of participants) delta[id] = round.ante - (payoutOf.get(id) ?? 0);
    const pot = round.ante * participants.length;
    // pot 방식은 나눗셈을 쓰지 않는다 — ante 도 payout 도 사용자가 직접 넣은 정수다.
    // 배당이 판돈과 안 맞는 건 올림 초과분이 아니라 imbalance 이므로 surplus 는 0이다.
    return { roundId: round.id, delta, imbalance: payoutTotal - pot, surplus: 0 };
  }

  // method === 'transfer'
  const losers = [...new Set(round.losers)].filter((id) => joined.has(id));
  const loserSet = new Set(losers);
  const winners = participants.filter((id) => !loserSet.has(id));
  if (losers.length === 0 || winners.length === 0) return noBet; // A9

  const amount = round.transferSource === 'gameFee' ? gameFeePerGame : round.transferAmount;
  const pot = amount * winners.length;
  // 나누어떨어지지 않을 때 0.333… 이 공유 이미지에 찍히면 안 되므로 정수로 쪼갠다 (R13).
  // 전원이 같은 금액을 내도록 올리므로 합계가 pot 보다 최대 (진 쪽 인원 - 1)원 커진다.
  // 그만큼 제로섬이 깨지고, 그 초과분을 surplus 로 정확히 내보낸다 (2026-08-21).
  const shares = splitEvenly(pot, losers.length);
  losers.forEach((id, i) => {
    delta[id] = shares[i];
  });
  for (const id of winners) delta[id] = -amount;
  const surplus = shares.reduce((acc, s) => acc + s, 0) - pot;
  return { roundId: round.id, delta, imbalance: 0, surplus };
}

/** 정산 전체를 계산한다. 결과 순서는 `settlement.members` 순서를 따른다. */
export function calculate(settlement: Settlement): CalcResult {
  const ids = settlement.members.map((m) => m.id);
  const known = new Set(ids);

  const gameCount = zeroed(ids);
  for (const round of settlement.rounds) {
    for (const id of new Set(round.participants)) {
      if (known.has(id)) gameCount[id] += 1;
    }
  }

  const breakdowns = settlement.rounds.map((r) => roundDelta(r, settlement.gameFeePerGame));
  const betDelta = zeroed(ids);
  for (const b of breakdowns) {
    for (const [id, d] of Object.entries(b.delta)) {
      if (known.has(id)) betDelta[id] += d;
    }
  }

  // 기타비용은 사람별 금액을 그대로 더한다 (2026-08-24). 균등 분배는 입력 단계에서
  // 같은 값을 채워 넣는 것으로 이미 끝나 있으므로, 여기서는 나눗셈을 하지 않는다.
  // 즉 올림 초과분이 생길 여지가 없어 extras 는 roundingSurplus 에 기여하지 않는다.
  const extra = zeroed(ids);
  const unassignedExtras: { label: string; amount: number }[] = [];
  for (const item of settlement.extras) {
    let charged = 0;
    for (const [id, amount] of Object.entries(item.amounts)) {
      if (!known.has(id) || amount === 0) continue;
      extra[id] += amount;
      charged += amount;
    }
    if (charged === 0) {
      // 낼 사람이 한 명도 안 남은 항목(멤버 삭제 등). 아무에게도 청구되지 않아 금액이
      // 정산에서 조용히 증발하므로 드러낸다 (F3). 남아 있던 총액을 그대로 보고한다.
      const orphaned = Object.values(item.amounts).reduce((a, b) => a + b, 0);
      if (orphaned !== 0) unassignedExtras.push({ label: item.label, amount: orphaned });
    }
  }

  const shoeRenters = new Set(settlement.shoeRenters);
  const subtotals: Record<string, number> = {};
  const rows = ids.map((id) => {
    const gameFee = settlement.gameFeePerGame * gameCount[id];
    const shoe = shoeRenters.has(id) ? settlement.shoeFee : 0;
    const subtotal = gameFee + shoe + extra[id] + betDelta[id];
    subtotals[id] = subtotal;
    return { id, gameFee, shoe, subtotal };
  });

  // treasurerId 가 제거돼(2026-08-21) 흡수자를 지정하지 않는다 → 최대 부담자가 흡수한다.
  const spread = distributeWithRemainder(subtotals);
  const results: MemberResult[] = rows.map((row) => ({
    memberId: row.id,
    gameCount: gameCount[row.id],
    gameFee: row.gameFee,
    shoe: row.shoe,
    extra: extra[row.id],
    betDelta: betDelta[row.id],
    subtotal: row.subtotal,
    rounded: spread[row.id].rounded,
    adjustment: spread[row.id].adjustment,
  }));

  return {
    results,
    breakdowns,
    totalImbalance: breakdowns.reduce((acc, b) => acc + b.imbalance, 0),
    /**
     * 올림으로 더 걷힌 금액만 정확히 담는다.
     *
     * 초기 구현은 `Σ rounded - 실제결제액` 으로 역산했는데, 그 식에는 pot 라운드의
     * `-imbalance` 와 분담 대상이 없는 기타비용 미수금이 함께 섞여 들어갔다. 그러면
     * 배당을 잘못 입력한 것만으로 "올림으로 더 걷힌 금액: -2,000원" 같은 거짓말이 나온다.
     * 그래서 역산을 버리고 `splitEvenly` 를 부른 지점에서 초과분을 직접 누적한다. (F2)
     */
    roundingSurplus: breakdowns.reduce((acc, b) => acc + b.surplus, 0),
    unassignedExtras,
  };
}

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
  SettlementMode,
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
 * - `mode === 'normal'`(정산 모드): 라운드에 내기 입력이 남아 있어도 전원 0, imbalance 0.
 *   `RoundCard` 가 자기 경고를 그리려고 이 함수를 직접 호출하므로 게이트가 여기 있어야 한다 (G5).
 *
 * **극성 주의**: 반드시 `mode === 'normal'` 로 판정한다. `mode === 'bet'` 로 뒤집으면
 * mode 가 undefined 인 구버전 저장값에서 내기 금액이 통째로 사라진다 (§5-A-3 결정 2, G8).
 * 기본값을 `'bet'` 으로 둔 것도 같은 이유다 — 인자가 없거나 undefined 면 내기 모드로 폴백한다.
 */
export function roundDelta(
  round: Round,
  gameFeePerGame: number,
  mode: SettlementMode = 'bet',
): RoundBreakdown {
  const participants = [...new Set(round.participants)];
  const delta = zeroed(participants);
  const noBet: RoundBreakdown = { roundId: round.id, delta, imbalance: 0 };
  if (mode === 'normal') return noBet; // 정산 모드: 라운드 데이터는 읽기만 하고 계산에서만 제외한다 (G1)
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
    return { roundId: round.id, delta, imbalance: payoutTotal - pot };
  }

  // method === 'transfer'
  const losers = [...new Set(round.losers)].filter((id) => joined.has(id));
  const loserSet = new Set(losers);
  const winners = participants.filter((id) => !loserSet.has(id));
  if (losers.length === 0 || winners.length === 0) return noBet; // A9

  const amount = round.transferSource === 'gameFee' ? gameFeePerGame : round.transferAmount;
  const pot = amount * winners.length;
  // 판돈을 나누어떨어지지 않을 때 1/3 = 0.333… 이 그대로 공유 이미지에 찍히면 안 된다.
  // 정수로 쪼개되 합계는 정확히 pot 이라 제로섬은 그대로 유지된다 (계획서 R13).
  const shares = splitEvenly(pot, losers.length);
  losers.forEach((id, i) => {
    delta[id] = shares[i];
  });
  for (const id of winners) delta[id] = -amount;
  return { roundId: round.id, delta, imbalance: 0 };
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

  const breakdowns = settlement.rounds.map((r) =>
    roundDelta(r, settlement.gameFeePerGame, settlement.mode),
  );
  const betDelta = zeroed(ids);
  for (const b of breakdowns) {
    for (const [id, d] of Object.entries(b.delta)) {
      if (known.has(id)) betDelta[id] += d;
    }
  }

  // 기타비용은 항목마다 분담 대상에게 **전원 같은 금액**으로 분배한다.
  // 나누어떨어지지 않으면 1원씩 올려 걷으므로 항목 총액보다 조금 더 걷힌다 (roundingSurplus 참고).
  const extra = zeroed(ids);
  for (const item of settlement.extras) {
    const sharers = (item.splitAmong === 'all' ? ids : item.splitAmong).filter((id) =>
      known.has(id),
    );
    const shares = splitEvenly(item.amount, sharers.length);
    sharers.forEach((id, i) => {
      extra[id] += shares[i];
    });
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

  // 그날 실제로 결제되는 금액. 나눗셈 올림이 끼어들기 전의 원본 합계다.
  const actualBill =
    settlement.gameFeePerGame * ids.reduce((acc, id) => acc + gameCount[id], 0) +
    settlement.shoeFee * ids.filter((id) => shoeRenters.has(id)).length +
    settlement.extras.reduce((acc, item) => acc + item.amount, 0);

  return {
    results,
    breakdowns,
    totalImbalance: breakdowns.reduce((acc, b) => acc + b.imbalance, 0),
    // 전원이 같은 금액을 내도록 1원 단위로 올린 결과 실제 결제액보다 더 걷힌 금액.
    // 나눗셈 한 번당 최대 (인원-1)원이라 보통 0~2원이다. 조용히 삼키지 않고 드러낸다.
    roundingSurplus: results.reduce((acc, r) => acc + r.rounded, 0) - actualBill,
  };
}

/** 정산 계산 엔진. React 에 의존하지 않는 순수 함수만 둔다. */
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
 * - `none` 과 계산이 불가능한 경우(참여자 0명 / 순위 0개 / 진 쪽이 0명이거나 전원): 전원 0
 */
export function roundDelta(round: Round, gameFeePerGame: number): RoundBreakdown {
  const participants = [...new Set(round.participants)];
  const delta = zeroed(participants);
  const noBet: RoundBreakdown = { roundId: round.id, delta, imbalance: 0, surplus: 0 };
  if (participants.length === 0 || round.method === 'none') return noBet;

  const joined = new Set(participants);

  if (round.method === 'pot') {
    // 참여를 뺀 사람이 순위 그룹에 남아 있을 수 있다. 배당 계산에서는 제외한다.
    const groups = round.ranking.map((group) => group.filter((id) => joined.has(id)));
    if (groups.every((group) => group.length === 0)) return noBet; // 순위를 아직 안 정했다

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
    // ante 도 payout 도 사용자가 직접 넣은 정수라 나눗셈이 없다. 배당이 판돈과 안 맞는 건
    // 올림 때문이 아니라 입력이 어긋난 것이므로 imbalance 로 잡고 surplus 는 0으로 둔다.
    return { roundId: round.id, delta, imbalance: payoutTotal - pot, surplus: 0 };
  }

  // method === 'transfer'
  const losers = [...new Set(round.losers)].filter((id) => joined.has(id));
  const loserSet = new Set(losers);
  const winners = participants.filter((id) => !loserSet.has(id));
  if (losers.length === 0 || winners.length === 0) return noBet;

  const amount = round.transferSource === 'gameFee' ? gameFeePerGame : round.transferAmount;
  const pot = amount * winners.length;
  // 0.333… 같은 값이 공유 이미지에 찍히면 안 되므로 정수로 쪼갠다. 전원이 같은 금액을
  // 내도록 올리는 탓에 합계가 pot 보다 최대 (진 쪽 인원 - 1)원 커지는데, 그 차이를
  // surplus 로 내보내 화면에서 설명할 수 있게 한다.
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

  // 기타비용은 사람별 금액을 그대로 더하기만 한다. 균등 분배는 입력할 때 같은 값을
  // 채워 넣는 것으로 끝나므로 여기서 나눌 일이 없고, 따라서 초과분도 생기지 않는다.
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
      // 멤버가 삭제돼 낼 사람이 아무도 안 남은 항목. 그냥 두면 금액이 정산에서
      // 조용히 사라지므로 남아 있던 총액을 그대로 보고해 화면에서 경고하게 한다.
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
     * 올림으로 더 걷힌 금액만 담는다.
     *
     * 총액에서 역산하면 배당 불일치와 미수금이 함께 섞여 들어와 "더 걷힌 금액: -2,000원"
     * 같은 값이 나온다. 그래서 나눗셈이 실제로 일어난 지점에서만 초과분을 모은다.
     */
    roundingSurplus: breakdowns.reduce((acc, b) => acc + b.surplus, 0),
    unassignedExtras,
  };
}

/**
 * 통합 시나리오 테스트 — 계획서 §6-5의 수동 E2E 시나리오를 자동화한다.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §6-5
 *
 * 목적: store 액션 → calc → settle 을 관통하는 검증. 상태는 반드시 스토어 액션으로만 만든다.
 * 이 파일은 검증만 하며 lib/store 구현은 건드리지 않는다.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useSettlementStore } from '../store/useSettlementStore';
import { initialPrefs, usePrefsStore } from '../store/usePrefsStore';
import { calculate, roundDelta } from '../lib/calc';
import { settleTransfers } from '../lib/settle';
import type { MemberResult, Settlement } from '../types';

const SESSION_KEY = 'allcover:session:v1';

const store = () => useSettlementStore.getState();
const current = (): Settlement => useSettlementStore.getState().settlement;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function resultOf(results: MemberResult[], memberId: string): MemberResult {
  const row = results.find((r) => r.memberId === memberId);
  if (!row) throw new Error(`no result for ${memberId}`);
  return row;
}

/**
 * 계획서 §6-5 시나리오를 스토어 액션만으로 구성한다.
 *
 * 멤버 8명 / 게임단가 4,000 / 신발비 2,000(3명) / 반올림 100원
 * 1판 개인전 pot(1등 4,000·2등 4,000) — 2판 개인전 pot 승자독식 —
 * 3판 4:4 팀전 transfer(판비 연동) — 4판 4팀×2명 pot — 5판 4명만 참여 none
 */
function buildScenario() {
  const s = store();
  s.setFees({ gameFeePerGame: 4000, shoeFee: 2000, defaultAnte: 1000, roundingUnit: 100 });
  for (const name of ['가', '나', '다', '라', '마', '바', '사', '아']) s.addMember(name);

  const ids = current().members.map((m) => m.id);
  const [m0, m1, m2, m3, m4, m5, m6, m7] = ids;

  // 신발 대여 3명
  for (const id of [m0, m1, m2]) store().toggleShoeRenter(id);

  // --- 1판: 개인전 pot, ante 1,000, 1등 4,000 / 2등 4,000 ---
  store().addRound();
  const r1 = current().rounds[0].id;
  store().setMethod(r1, 'pot');
  store().setAnte(r1, 1000);
  store().setPayout(r1, [4000, 4000]);
  store().tapRank(r1, m0);
  store().tapRank(r1, m1);

  // --- 2판: 개인전 pot 승자독식 (1등이 pot 8,000 전액) ---
  store().addRound();
  const r2 = current().rounds[1].id;
  store().setPayout(r2, [8000]);
  store().tapRank(r2, m0);

  // --- 3판: 4:4 팀전 transfer, 판비(gameFee) 연동, 진 팀 = B팀 ---
  store().addRound();
  const r3 = current().rounds[2].id;
  store().setTeams(r3, [
    [m0, m1, m2, m3],
    [m4, m5, m6, m7],
  ]);
  store().setMethod(r3, 'transfer');
  store().setTransfer(r3, { transferSource: 'gameFee' });
  store().toggleLoser(r3, m4); // 팀 단위 토글 → B팀 전원이 losers

  // --- 4판: 4팀×2명 pot, ante 1,000, 1등팀 인당 3,000 / 2등팀 인당 1,000 ---
  store().addRound();
  const r4 = current().rounds[3].id;
  store().setTeams(r4, [
    [m0, m1],
    [m2, m3],
    [m4, m5],
    [m6, m7],
  ]);
  store().setMethod(r4, 'pot');
  store().setAnte(r4, 1000);
  store().setPayout(r4, [3000, 1000]);
  for (const teamIndex of [0, 1, 2, 3]) store().tapRank(r4, teamIndex);

  // --- 5판: 앞 4명만 참여, 내기 없음 ---
  store().addRound();
  const r5 = current().rounds[4].id;
  store().setTeams(r5, null);
  store().setMethod(r5, 'none');
  for (const id of [m4, m5, m6, m7]) store().toggleParticipant(r5, id);

  // 총무 지정
  store().setTreasurer(m0);

  return { ids, m0, m1, m2, m3, m4, m5, m6, m7, r1, r2, r3, r4, r5 };
}

beforeEach(() => {
  window.localStorage.clear();
  usePrefsStore.setState({ ...initialPrefs });
  store().resetSession();
});

describe('통합 시나리오 — 계획서 §6-5 (8명 / 5판 / 총무 지정)', () => {
  it('시나리오가 스토어 액션만으로 계획서대로 구성된다 (셋업 자체 검증)', () => {
    const { ids, m0, m4 } = buildScenario();
    const s = current();

    expect(s.members).toHaveLength(8);
    expect(s.gameFeePerGame).toBe(4000);
    expect(s.shoeFee).toBe(2000);
    expect(s.shoeRenters).toHaveLength(3);
    expect(s.roundingUnit).toBe(100);
    expect(s.treasurerId).toBe(m0);
    expect(s.rounds).toHaveLength(5);

    const [p1, p2, p3, p4, p5] = s.rounds;
    expect(p1.method).toBe('pot');
    expect(p1.teams).toBeNull();
    expect(p1.ranking).toEqual([[m0], [ids[1]]]);
    expect(p2.method).toBe('pot');
    expect(p2.payout).toEqual([8000]);
    expect(p3.method).toBe('transfer');
    expect(p3.transferSource).toBe('gameFee');
    expect(p3.losers.sort()).toEqual([m4, ids[5], ids[6], ids[7]].sort());
    expect(p4.method).toBe('pot');
    expect(p4.ranking).toHaveLength(4);
    expect(p5.method).toBe('none');
    expect(p5.participants).toEqual(ids.slice(0, 4));
  });

  it('1. 판별 betDelta 가 손계산 값과 정확히 일치한다 (5판 전부)', () => {
    const { m0, m1, m2, m3, m4, m5, m6, m7 } = buildScenario();
    const s = current();
    const delta = (i: number) => roundDelta(s.rounds[i], s.gameFeePerGame).delta;

    // 1판: pot 8,000 = 배당 8,000. 1·2등 각 -3,000, 나머지 6명 각 +1,000
    expect(delta(0)).toEqual({
      [m0]: -3000,
      [m1]: -3000,
      [m2]: 1000,
      [m3]: 1000,
      [m4]: 1000,
      [m5]: 1000,
      [m6]: 1000,
      [m7]: 1000,
    });

    // 2판: 승자독식. 1등 -7,000, 나머지 7명 각 +1,000
    expect(delta(1)).toEqual({
      [m0]: -7000,
      [m1]: 1000,
      [m2]: 1000,
      [m3]: 1000,
      [m4]: 1000,
      [m5]: 1000,
      [m6]: 1000,
      [m7]: 1000,
    });

    // 3판: 4:4 판비 연동. 진 팀 각 +4,000 / 이긴 팀 각 -4,000
    expect(delta(2)).toEqual({
      [m0]: -4000,
      [m1]: -4000,
      [m2]: -4000,
      [m3]: -4000,
      [m4]: 4000,
      [m5]: 4000,
      [m6]: 4000,
      [m7]: 4000,
    });

    // 4판: 1등팀원 각 -2,000 / 2등팀원 각 0 / 3·4등팀원 각 +1,000
    expect(delta(3)).toEqual({
      [m0]: -2000,
      [m1]: -2000,
      [m2]: 0,
      [m3]: 0,
      [m4]: 1000,
      [m5]: 1000,
      [m6]: 1000,
      [m7]: 1000,
    });

    // 5판: 내기 없음. 참여 4명 전원 0
    expect(delta(4)).toEqual({ [m0]: 0, [m1]: 0, [m2]: 0, [m3]: 0 });
  });

  it('2. 5판 모두 imbalance === 0 이고 totalImbalance 도 0 이다', () => {
    buildScenario();
    const { breakdowns, totalImbalance } = calculate(current());
    expect(breakdowns.map((b) => b.imbalance)).toEqual([0, 0, 0, 0, 0]);
    expect(totalImbalance).toBe(0);
  });

  it('3. 제로섬 불변식: Σ betDelta === 0', () => {
    const { m0, m1, m2, m3, m4 } = buildScenario();
    const { results } = calculate(current());

    expect(sum(results.map((r) => r.betDelta))).toBe(0);
    // 개인별 누계도 손계산과 일치
    expect(resultOf(results, m0).betDelta).toBe(-16000);
    expect(resultOf(results, m1).betDelta).toBe(-8000);
    expect(resultOf(results, m2).betDelta).toBe(-2000);
    expect(resultOf(results, m3).betDelta).toBe(-2000);
    expect(resultOf(results, m4).betDelta).toBe(7000);
  });

  it('4. 총액 보존: Σ subtotal === Σ base 이고 Σ rounded === Σ subtotal', () => {
    const { m0 } = buildScenario();
    const { results } = calculate(current());

    const base = sum(results.map((r) => r.gameFee + r.shoe + r.extra));
    const subtotal = sum(results.map((r) => r.subtotal));
    const rounded = sum(results.map((r) => r.rounded));

    expect(base).toBe(150000); // 게임비 144,000 + 신발비 6,000
    expect(subtotal).toBe(base);
    expect(rounded).toBe(subtotal);
    // 모든 금액이 100원 배수라 이 시나리오에서는 잔돈 조정이 발생하지 않는다
    expect(sum(results.map((r) => r.adjustment))).toBe(0);
    expect(resultOf(results, m0).rounded).toBe(6000);
  });

  it('5. 게임 수: 5판에 4명만 참여했으므로 참여자 5판 / 미참여자 4판', () => {
    const { ids } = buildScenario();
    const { results } = calculate(current());

    for (const id of ids.slice(0, 4)) {
      expect(resultOf(results, id).gameCount).toBe(5);
      expect(resultOf(results, id).gameFee).toBe(20000);
    }
    for (const id of ids.slice(4)) {
      expect(resultOf(results, id).gameCount).toBe(4);
      expect(resultOf(results, id).gameFee).toBe(16000);
    }
  });

  it('6. 송금 균형(총무 모드): 총무 순수령액 === 나머지 인원 rounded 합', () => {
    const { m0 } = buildScenario();
    const s = current();
    const { results } = calculate(s);
    const transfers = settleTransfers(results, s.members, s.treasurerId);

    const expected = sum(results.filter((r) => r.memberId !== m0).map((r) => r.rounded));
    const inflow = sum(transfers.filter((t) => t.to === m0).map((t) => t.amount));
    const outflow = sum(transfers.filter((t) => t.from === m0).map((t) => t.amount));

    expect(inflow - outflow).toBe(expected);
    expect(expected).toBe(144000);
    expect(transfers).toHaveLength(7); // 총무 본인 제외 7명
    expect(transfers.every((t) => t.to === m0 && t.from !== m0)).toBe(true);
  });

  it('7. 총무 미지정 모드: 이 시나리오는 전원 채무자라 상계할 채권자가 없어 송금이 0건이다', () => {
    buildScenario();
    const s = current();
    const { results } = calculate(s);

    // 내기로 크게 이득 본 가(-16,000)조차 게임비·신발비가 더 커서 최종 부담은 +6,000 이다.
    expect(results.every((r) => r.rounded > 0)).toBe(true);

    const transfers = settleTransfers(results, s.members);
    expect(transfers).toEqual([]);
  });

  it('7. 총무 미지정 모드: 채권자가 생기면 그리디 불변식이 성립한다 (6판 추가로 채권자 발생)', () => {
    const { m0 } = buildScenario();
    store().setTreasurer(undefined);

    // 판돈을 크게 건 6판을 추가해 1등(가)을 순채권자로 만든다.
    // addRound 는 직전 판(5판)의 참여자를 상속하므로 이 판의 참여자는 4명, pot 은 5,000×4 = 20,000 이다.
    store().addRound();
    const r6 = current().rounds[5].id;
    store().setTeams(r6, null);
    store().setMethod(r6, 'pot');
    store().setAnte(r6, 5000);
    store().setPayout(r6, [20000]);
    store().tapRank(r6, m0);

    expect(current().rounds[5].participants).toHaveLength(4);

    const s = current();
    const { results, totalImbalance } = calculate(s);
    expect(totalImbalance).toBe(0);
    expect(resultOf(results, m0).rounded).toBeLessThan(0); // 채권자 확보

    const transfers = settleTransfers(results, s.members);
    const debt = sum(results.filter((r) => r.rounded > 0).map((r) => r.rounded));
    const credit = sum(results.filter((r) => r.rounded < 0).map((r) => -r.rounded));

    // Σ송금 === min(총채무, 총채권)
    expect(sum(transfers.map((t) => t.amount))).toBe(Math.min(debt, credit));

    for (const r of results) {
      const paid = sum(transfers.filter((t) => t.from === r.memberId).map((t) => t.amount));
      const got = sum(transfers.filter((t) => t.to === r.memberId).map((t) => t.amount));
      if (r.rounded < 0) {
        expect(got - paid).toBe(-r.rounded); // 채권자는 정확히 받을 만큼 받는다
      } else {
        expect(paid).toBeLessThanOrEqual(r.rounded); // 채무자는 rounded 이하만 송금한다
        expect(got).toBe(0);
      }
    }
    expect(transfers.every((t) => t.amount > 0 && t.from !== t.to)).toBe(true);
  });

  it('8. 영속성 왕복: localStorage 복원 후 calculate() 결과가 완전히 동일하다', async () => {
    buildScenario();
    const before = calculate(current());

    const raw = window.localStorage.getItem(SESSION_KEY);
    expect(raw).not.toBeNull();

    // 세션을 날린 뒤 저장돼 있던 값을 다시 주입해 복원시킨다
    store().resetSession();
    expect(current().rounds).toEqual([]);
    expect(calculate(current()).results).toEqual([]);

    window.localStorage.setItem(SESSION_KEY, raw as string);
    await useSettlementStore.persist.rehydrate();

    const after = calculate(current());
    expect(after).toEqual(before);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it('9. 멤버 삭제 후에도 크래시 없이 계산되고 댕글링 참조가 남지 않는다', () => {
    const { ids, m4 } = buildScenario();
    store().removeMember(m4);

    const s = current();
    expect(s.members).toHaveLength(7);
    const remaining = new Set(s.members.map((m) => m.id));
    expect(remaining.has(m4)).toBe(false);

    // 어떤 판에도 삭제된 멤버 참조가 남아 있지 않다
    for (const round of s.rounds) {
      expect(round.participants).not.toContain(m4);
      expect(round.losers).not.toContain(m4);
      expect(round.ranking.flat()).not.toContain(m4);
      expect((round.teams ?? []).flat()).not.toContain(m4);
    }

    const result = calculate(s);
    expect(result.results).toHaveLength(7);
    for (const b of result.breakdowns) {
      for (const id of Object.keys(b.delta)) expect(remaining.has(id)).toBe(true);
    }
    expect(result.results.map((r) => r.memberId)).toEqual(ids.filter((id) => id !== m4));
  });

  it('9. 멤버 삭제는 pot 라운드의 판돈만 줄여 imbalance 를 발생시킨다 (제로섬이 깨지는 지점)', () => {
    const { m4 } = buildScenario();
    store().removeMember(m4);

    const { results, breakdowns, totalImbalance } = calculate(current());

    // 1·2·4판은 참여자가 8→7명이 되어 pot 이 8,000→7,000 으로 줄지만 payout 은 그대로다.
    expect(breakdowns.map((b) => b.imbalance)).toEqual([1000, 1000, 0, 1000, 0]);
    expect(totalImbalance).toBe(3000);

    // 따라서 Σ betDelta 는 0 이 아니라 -totalImbalance 다. 이것이 항상 성립하는 불변식이다.
    // 3판의 진 팀이 3명이 되어 16,000/3 이 무한소수라 부동소수 오차가 남는다 → toBeCloseTo.
    expect(sum(results.map((r) => r.betDelta))).toBeCloseTo(-totalImbalance, 6);
    expect(sum(results.map((r) => r.betDelta))).toBeCloseTo(-3000, 6);

    // 총액도 그만큼 어긋난다 — UI가 경고 배지를 띄워야 하는 상태다 (계획서 R4).
    const base = sum(results.map((r) => r.gameFee + r.shoe + r.extra));
    expect(sum(results.map((r) => r.subtotal))).toBeCloseTo(base - totalImbalance, 6);
  });
});

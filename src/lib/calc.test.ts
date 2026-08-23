import { describe, expect, it } from 'vitest';
import { calculate, roundDelta } from './calc';
import { formatKRW, formatSigned } from './format';
import type { Extra, Member, Round, Settlement, SettlementMode } from '../types';

// ---------------------------------------------------------------------------
// 테스트 픽스처 헬퍼
// ---------------------------------------------------------------------------

function members(...names: string[]): Member[] {
  return names.map((name) => ({ id: name, name }));
}

function mkRound(patch: Partial<Round> & { id: string; participants: string[] }): Round {
  return {
    teams: null,
    method: 'none',
    ante: 0,
    payout: [],
    ranking: [],
    losers: [],
    transferSource: 'custom',
    transferAmount: 0,
    ...patch,
  };
}

function mkSettlement(patch: Partial<Settlement> & { members: Member[] }): Settlement {
  return {
    version: 1,
    id: 's1',
    date: '2026-08-21',
    gameFeePerGame: 4000,
    shoeFee: 2000,
    shoeRenters: [],
    rounds: [],
    extras: [],
    mode: 'bet',
    ...patch,
  };
}

/** 결과를 memberId -> MemberResult 로 색인 */
function byId(s: Settlement) {
  const r = calculate(s);
  return {
    ...r,
    of: (id: string) => {
      const row = r.results.find((x) => x.memberId === id);
      if (!row) throw new Error(`no result for ${id}`);
      return row;
    },
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const deltaSum = (d: Record<string, number>) => sum(Object.values(d));

// ---------------------------------------------------------------------------
// A1
// ---------------------------------------------------------------------------

describe('calculate — 기본 정산', () => {
  it('A1: 일반 모드(내기 없음) 게임비 + 신발비 합산이 정확하다', () => {
    // 계획서 A1 의 기대값 [16000, 14000, 12000] / 합 42,000 을 만족하는 구성:
    // 게임단가 4,000, 참여판수 4/3/3, 신발비 2,000 을 b 1명이 대여.
    const ms = members('a', 'b', 'c');
    const s = mkSettlement({
      members: ms,
      gameFeePerGame: 4000,
      shoeFee: 2000,
      shoeRenters: ['b'],
      rounds: [
        mkRound({ id: 'r1', participants: ['a', 'b', 'c'] }),
        mkRound({ id: 'r2', participants: ['a', 'b', 'c'] }),
        mkRound({ id: 'r3', participants: ['a', 'b', 'c'] }),
        mkRound({ id: 'r4', participants: ['a'] }),
      ],
    });
    const r = byId(s);
    expect(r.results.map((x) => x.rounded)).toEqual([16000, 14000, 12000]);
    expect(sum(r.results.map((x) => x.rounded))).toBe(42000);
    expect(r.of('a').gameCount).toBe(4);
    expect(r.of('c').gameCount).toBe(3);
    expect(r.totalImbalance).toBe(0);

    // 계획서에 적힌 입력(참여판수 3/3/2, 신발 2명)을 그대로 쓰면 합계는 36,000 이다.
    const literal = mkSettlement({
      members: ms,
      gameFeePerGame: 4000,
      shoeFee: 2000,
      shoeRenters: ['a', 'b'],
      rounds: [
        mkRound({ id: 'r1', participants: ['a', 'b', 'c'] }),
        mkRound({ id: 'r2', participants: ['a', 'b', 'c'] }),
        mkRound({ id: 'r3', participants: ['a', 'b'] }),
      ],
    });
    const lit = byId(literal);
    expect(lit.results.map((x) => x.rounded)).toEqual([14000, 14000, 8000]);
    expect(sum(lit.results.map((x) => x.rounded))).toBe(36000);
  });
});

// ---------------------------------------------------------------------------
// A2 — pot 방식 (계획서 §2 손계산 값 하드코딩)
// ---------------------------------------------------------------------------

describe('roundDelta — pot(판돈 분배)', () => {
  it('A2-1: 개인전 5명, ante 1,000, 1등 3,000 / 2등 2,000 → [-2000,-1000,+1000,+1000,+1000]', () => {
    const round = mkRound({
      id: 'r1',
      participants: ['m1', 'm2', 'm3', 'm4', 'm5'],
      method: 'pot',
      ante: 1000,
      payout: [3000, 2000],
      ranking: [['m1'], ['m2']],
    });
    const b = roundDelta(round, 4000);
    expect(b.delta).toEqual({ m1: -2000, m2: -1000, m3: 1000, m4: 1000, m5: 1000 });
    expect(b.imbalance).toBe(0);
    expect(deltaSum(b.delta)).toBe(0);
  });

  it('A2-2: 승자독식 5명, ante 1,000, 1등 5,000 → 1등 -4,000 / 나머지 +1,000', () => {
    const round = mkRound({
      id: 'r2',
      participants: ['m1', 'm2', 'm3', 'm4', 'm5'],
      method: 'pot',
      ante: 1000,
      payout: [5000],
      ranking: [['m1']],
    });
    const b = roundDelta(round, 4000);
    expect(b.delta).toEqual({ m1: -4000, m2: 1000, m3: 1000, m4: 1000, m5: 1000 });
    expect(b.imbalance).toBe(0);
    expect(deltaSum(b.delta)).toBe(0);
  });

  it('A2-3: 팀전 4팀×2명, ante 1,000, 1등팀 인당 3,000 / 2등팀 인당 1,000', () => {
    const round = mkRound({
      id: 'r3',
      participants: ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'd1', 'd2'],
      teams: [
        ['a1', 'a2'],
        ['b1', 'b2'],
        ['c1', 'c2'],
        ['d1', 'd2'],
      ],
      method: 'pot',
      ante: 1000,
      payout: [3000, 1000],
      ranking: [
        ['a1', 'a2'],
        ['b1', 'b2'],
        ['c1', 'c2'],
        ['d1', 'd2'],
      ],
    });
    const b = roundDelta(round, 4000);
    expect(b.delta).toEqual({
      a1: -2000,
      a2: -2000,
      b1: 0,
      b2: 0,
      c1: 1000,
      c2: 1000,
      d1: 1000,
      d2: 1000,
    });
    expect(b.imbalance).toBe(0);
    expect(deltaSum(b.delta)).toBe(0);
  });

  it('A6: 팀전 4팀×2명 ante 1,000 에서 1등팀 인당 3,000 만 입력하면 imbalance === -2000', () => {
    const round = mkRound({
      id: 'r4',
      participants: ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'd1', 'd2'],
      method: 'pot',
      ante: 1000,
      payout: [3000],
      ranking: [
        ['a1', 'a2'],
        ['b1', 'b2'],
        ['c1', 'c2'],
        ['d1', 'd2'],
      ],
    });
    const b = roundDelta(round, 4000);
    expect(b.imbalance).toBe(-2000);
    // 불균형만큼 제로섬이 깨진다: Σ delta === -imbalance
    expect(deltaSum(b.delta)).toBe(2000);
  });

  it('ranking 에 없는 참여자는 무배당 최하위로 취급된다', () => {
    const round = mkRound({
      id: 'r5',
      participants: ['m1', 'm2', 'm3'],
      method: 'pot',
      ante: 1000,
      payout: [3000],
      ranking: [['m1']],
    });
    const b = roundDelta(round, 4000);
    expect(b.delta).toEqual({ m1: -2000, m2: 1000, m3: 1000 });
  });
});

// ---------------------------------------------------------------------------
// A3 — transfer 방식 (계획서 §2 손계산 값 하드코딩)
// ---------------------------------------------------------------------------

describe('roundDelta — transfer(판비 내주기)', () => {
  it('A3-1: 팀전 4:4, amount 4,000 → 진 팀 각 +4,000 / 이긴 팀 각 -4,000', () => {
    const round = mkRound({
      id: 'r1',
      participants: ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4'],
      teams: [
        ['a1', 'a2', 'a3', 'a4'],
        ['b1', 'b2', 'b3', 'b4'],
      ],
      method: 'transfer',
      losers: ['b1', 'b2', 'b3', 'b4'],
      transferSource: 'custom',
      transferAmount: 4000,
    });
    const b = roundDelta(round, 4000);
    expect(b.delta).toEqual({
      a1: -4000,
      a2: -4000,
      a3: -4000,
      a4: -4000,
      b1: 4000,
      b2: 4000,
      b3: 4000,
      b4: 4000,
    });
    expect(b.imbalance).toBe(0);
    expect(deltaSum(b.delta)).toBe(0);
  });

  it('A3-2: 개인전 8명 꼴찌 1명, amount 4,000 → 꼴찌 +28,000 / 나머지 각 -4,000', () => {
    const ids = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'];
    const round = mkRound({
      id: 'r2',
      participants: ids,
      method: 'transfer',
      losers: ['m8'],
      transferSource: 'custom',
      transferAmount: 4000,
    });
    const b = roundDelta(round, 4000);
    expect(b.delta.m8).toBe(28000);
    for (const id of ids.slice(0, 7)) expect(b.delta[id]).toBe(-4000);
    expect(b.imbalance).toBe(0);
    expect(deltaSum(b.delta)).toBe(0);
  });

  it("A8: transferSource 'gameFee' 라운드는 게임 단가 변경이 자동 반영된다", () => {
    const round = mkRound({
      id: 'r3',
      participants: ['m1', 'm2', 'm3', 'm4'],
      method: 'transfer',
      losers: ['m4'],
      transferSource: 'gameFee',
      transferAmount: 999999, // gameFee 소스이므로 무시되어야 한다
    });
    expect(roundDelta(round, 4000).delta).toEqual({ m1: -4000, m2: -4000, m3: -4000, m4: 12000 });
    expect(roundDelta(round, 5000).delta).toEqual({ m1: -5000, m2: -5000, m3: -5000, m4: 15000 });

    // calculate() 를 통해서도 단가 변경이 전파된다
    const base = mkSettlement({ members: members('m1', 'm2', 'm3', 'm4'), rounds: [round] });
    expect(byId(base).of('m4').betDelta).toBe(12000);
    expect(byId({ ...base, gameFeePerGame: 5000 }).of('m4').betDelta).toBe(15000);
  });
});

// ---------------------------------------------------------------------------
// R13 — 표시 금액 정수성 (소수점이 공유 이미지에 새는 것 방지)
// ---------------------------------------------------------------------------

describe('R13: 금액이 소수점으로 새지 않는다', () => {
  it('R13: 재현 케이스(5명·판비 4,000·진 쪽 3명)에서 betDelta·adjustment 가 전부 정수다', () => {
    const s = mkSettlement({
      members: members('a', 'b', 'c', 'd', 'e'),
      gameFeePerGame: 4000,
      shoeFee: 0,
      rounds: [
        mkRound({
          id: 'r1',
          participants: ['a', 'b', 'c', 'd', 'e'],
          method: 'transfer',
          losers: ['c', 'd', 'e'],
          transferSource: 'gameFee',
        }),
      ],
    });
    const r = byId(s);

    // 8,000원을 3명이 나눠 내되 2,666.666… 이 아니라 **전원 2,667** 이다 (한 명만 덜 내지 않는다)
    expect(r.of('c').betDelta).toBe(2667);
    expect(r.of('d').betDelta).toBe(2667);
    expect(r.of('e').betDelta).toBe(2667);
    expect(r.of('a').betDelta).toBe(-4000);
    expect(r.of('b').betDelta).toBe(-4000);

    // 제로섬이 아니라 "정확히 1원 더 걷힌다". 이 1원은 splitEvenly 의 초과분이고
    // roundingSurplus 로 드러난다 — 근사가 아니라 정확한 값으로 조인다.
    expect(sum(r.results.map((x) => x.betDelta))).toBe(1);
    expect(sum(r.results.map((x) => x.betDelta))).toBe(Math.ceil(8000 / 3) * 3 - 8000);
    expect(r.roundingSurplus).toBe(1);

    // 화면·공유 이미지에 나가는 모든 숫자 칸이 정수여야 한다
    for (const row of r.results) {
      expect(Number.isInteger(row.betDelta)).toBe(true);
      expect(Number.isInteger(row.adjustment)).toBe(true);
      expect(Number.isInteger(row.subtotal)).toBe(true);
      expect(Number.isInteger(row.rounded)).toBe(true);
      expect(Number.isInteger(row.extra)).toBe(true);
    }
  });

  it('R13: 실제 표시 문자열에 소수점이 찍히지 않는다', () => {
    const s = mkSettlement({
      members: members('a', 'b', 'c', 'd', 'e'),
      gameFeePerGame: 4000,
      shoeFee: 0,
      rounds: [
        mkRound({
          id: 'r1',
          participants: ['a', 'b', 'c', 'd', 'e'],
          method: 'transfer',
          losers: ['c', 'd', 'e'],
          transferSource: 'gameFee',
        }),
      ],
    });
    const r = byId(s);

    // 수정 전에는 "+2,666.667" / "잔돈 조정 -66.667원" 이 그대로 카카오톡 이미지로 나갔다
    for (const row of r.results) {
      expect(formatSigned(row.betDelta)).not.toContain('.');
      expect(formatKRW(row.adjustment)).not.toContain('.');
      expect(formatKRW(row.rounded)).not.toContain('.');
    }
    expect(formatSigned(r.of('c').betDelta)).toBe('+2,667');
  });

  it('R13: 진 쪽 2~7명 × 참여 3~8명 조합에서 Σ delta 가 정확히 초과분과 일치한다', () => {
    const ids = ['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'];
    let checked = 0;
    let withSurplus = 0;

    for (let participantCount = 3; participantCount <= 8; participantCount++) {
      const participants = ids.slice(0, participantCount);
      for (let loserCount = 2; loserCount <= Math.min(7, participantCount - 1); loserCount++) {
        for (const amount of [4000, 3333, 1000, 7777]) {
          const losers = participants.slice(0, loserCount);
          const b = roundDelta(
            mkRound({
              id: `r-${participantCount}-${loserCount}-${amount}`,
              participants,
              method: 'transfer',
              losers,
              transferSource: 'custom',
              transferAmount: amount,
            }),
            4000,
          );
          const deltas = Object.values(b.delta);
          const pot = amount * (participantCount - loserCount);
          // 진 쪽이 낼 금액을 calc 와 무관하게 독립적으로 계산해 대조한다
          const expectedSurplus = Math.ceil(pot / loserCount) * loserCount - pot;

          // toBeCloseTo 가 아니라 toBe — 초과분에는 정확한 값이 있다
          expect(sum(deltas)).toBe(expectedSurplus);
          expect(expectedSurplus).toBeGreaterThanOrEqual(0);
          // 상한: 나눗셈 한 번의 초과분은 반드시 진 쪽 인원수 미만이다
          expect(expectedSurplus).toBeLessThan(loserCount);

          // 진 쪽 전원이 정확히 같은 금액을 낸다 (한 명만 1원 덜 내지 않는다)
          expect(new Set(losers.map((id) => b.delta[id])).size).toBe(1);
          expect(deltas.every(Number.isInteger)).toBe(true);
          expect(b.imbalance).toBe(0);
          checked++;
          if (expectedSurplus > 0) withSurplus++;
        }
      }
    }
    expect(checked).toBe(84);
    // 초과분이 실제로 생기는 케이스가 충분해야 이 검사가 공허하지 않다
    expect(withSurplus).toBe(40);
  });

  it("R13: transferSource 'gameFee' 로 나누어떨어지지 않아도 정수가 유지된다", () => {
    const b = roundDelta(
      mkRound({
        id: 'r1',
        participants: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
        method: 'transfer',
        losers: ['e', 'f', 'g'],
        transferSource: 'gameFee',
      }),
      4500,
    );
    // pot = 4,500 × 4 = 18,000 → 3명이 정확히 6,000씩
    expect(b.delta).toEqual({ a: -4500, b: -4500, c: -4500, d: -4500, e: 6000, f: 6000, g: 6000 });
    expect(sum(Object.values(b.delta))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 중복 멤버 방어 — payoutOf 와 payoutTotal 의 집계 기준 일치
// ---------------------------------------------------------------------------

describe('ranking 에 중복 멤버가 있어도 불변식이 깨지지 않는다', () => {
  it('같은 멤버가 두 순위 그룹에 들어가도 Σ betDelta === -imbalance 가 유지된다', () => {
    const b = roundDelta(
      mkRound({
        id: 'r1',
        participants: ['a', 'b', 'c'],
        method: 'pot',
        ante: 1000,
        payout: [3000, 1000],
        ranking: [['a'], ['a', 'b']], // a 가 1등과 2등 그룹에 중복 등장
      }),
      4000,
    );

    // 상위 등수 배당만 인정한다: a 3,000 / b 1,000 → payoutTotal 4,000, pot 3,000
    expect(b.delta).toEqual({ a: -2000, b: 0, c: 1000 });
    expect(b.imbalance).toBe(1000);
    expect(deltaSum(b.delta)).toBe(-b.imbalance);
  });

  it('한 그룹 안에 같은 멤버가 두 번 들어가도 배당은 1회만 계산된다', () => {
    const b = roundDelta(
      mkRound({
        id: 'r2',
        participants: ['a', 'b', 'c'],
        method: 'pot',
        ante: 1000,
        payout: [3000, 1000],
        ranking: [['a', 'a'], ['b']],
      }),
      4000,
    );
    expect(b.delta).toEqual({ a: -2000, b: 0, c: 1000 });
    expect(b.imbalance).toBe(1000);
    expect(deltaSum(b.delta)).toBe(-b.imbalance);
  });

  it('중복이 없는 정상 입력의 imbalance 는 그대로다 (회귀 방지)', () => {
    const b = roundDelta(
      mkRound({
        id: 'r3',
        participants: ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'd1', 'd2'],
        method: 'pot',
        ante: 1000,
        payout: [3000],
        ranking: [
          ['a1', 'a2'],
          ['b1', 'b2'],
          ['c1', 'c2'],
          ['d1', 'd2'],
        ],
      }),
      4000,
    );
    expect(b.imbalance).toBe(-2000);
    expect(deltaSum(b.delta)).toBe(-b.imbalance);
  });
});

// ---------------------------------------------------------------------------
// A7 / A9 — 미참여자, 엣지 케이스
// ---------------------------------------------------------------------------

describe('참여 범위와 엣지 케이스', () => {
  it('A7: 판별 미참여자는 게임비·판돈·배당 어디에도 포함되지 않는다', () => {
    const s = mkSettlement({
      members: members('a', 'b', 'c', 'd'),
      gameFeePerGame: 4000,
      rounds: [
        mkRound({
          id: 'r1',
          participants: ['a', 'b', 'c'], // d 는 불참
          method: 'pot',
          ante: 1000,
          payout: [3000],
          ranking: [['a']],
        }),
      ],
    });
    const r = byId(s);
    expect(r.of('d').gameCount).toBe(0);
    expect(r.of('d').gameFee).toBe(0);
    expect(r.of('d').betDelta).toBe(0);
    expect(r.of('d').subtotal).toBe(0);
    // pot 은 참여자 3명 기준 3,000
    expect(r.of('a').betDelta).toBe(-2000);
    expect(r.of('b').betDelta).toBe(1000);
    expect(r.breakdowns[0].imbalance).toBe(0);
    expect(r.breakdowns[0].delta.d).toBeUndefined();
  });

  it('A7: ranking 에 미참여자가 섞여 있어도 판돈·배당 계산에서 제외된다', () => {
    const round = mkRound({
      id: 'r1',
      participants: ['a', 'b', 'c'],
      method: 'pot',
      ante: 1000,
      payout: [3000],
      ranking: [['a', 'zzz']],
    });
    const b = roundDelta(round, 4000);
    expect(b.delta).toEqual({ a: -2000, b: 1000, c: 1000 });
    expect(b.imbalance).toBe(0);
  });

  it('A9: losers 0명 → 전원 delta 0, imbalance 0, 크래시 없음', () => {
    const b = roundDelta(
      mkRound({
        id: 'r1',
        participants: ['a', 'b', 'c'],
        method: 'transfer',
        losers: [],
        transferAmount: 4000,
      }),
      4000,
    );
    expect(b.delta).toEqual({ a: 0, b: 0, c: 0 });
    expect(b.imbalance).toBe(0);
  });

  it('A9: losers 가 참여자 전원 → 전원 delta 0, imbalance 0', () => {
    const b = roundDelta(
      mkRound({
        id: 'r2',
        participants: ['a', 'b', 'c'],
        method: 'transfer',
        losers: ['a', 'b', 'c'],
        transferAmount: 4000,
      }),
      4000,
    );
    expect(b.delta).toEqual({ a: 0, b: 0, c: 0 });
    expect(b.imbalance).toBe(0);
  });

  it('A9: ranking 이 비어 있는 pot 라운드 → 전원 delta 0, imbalance 0', () => {
    const b = roundDelta(
      mkRound({
        id: 'r3',
        participants: ['a', 'b', 'c'],
        method: 'pot',
        ante: 1000,
        payout: [3000],
        ranking: [],
      }),
      4000,
    );
    expect(b.delta).toEqual({ a: 0, b: 0, c: 0 });
    expect(b.imbalance).toBe(0);
  });

  it('A9: participants 가 비어 있는 라운드 → 빈 delta, imbalance 0', () => {
    for (const method of ['none', 'pot', 'transfer'] as const) {
      const b = roundDelta(
        mkRound({ id: `r-${method}`, participants: [], method, ante: 1000, payout: [3000] }),
        4000,
      );
      expect(b.delta).toEqual({});
      expect(b.imbalance).toBe(0);
    }
  });

  it("A9: method 'none' 라운드는 게임비만 남고 delta 전원 0", () => {
    const s = mkSettlement({
      members: members('a', 'b'),
      rounds: [mkRound({ id: 'r1', participants: ['a', 'b'] })],
    });
    const r = byId(s);
    expect(r.breakdowns[0].delta).toEqual({ a: 0, b: 0 });
    expect(r.of('a').rounded).toBe(4000);
    expect(r.of('b').rounded).toBe(4000);
  });

  it('멤버가 0명이어도 크래시하지 않는다', () => {
    const r = calculate(mkSettlement({ members: [] }));
    expect(r.results).toEqual([]);
    expect(r.totalImbalance).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// A11 — 기타비용
// ---------------------------------------------------------------------------

describe('기타비용 분담', () => {
  it("A11: splitAmong 'all' 12,000원 / 5명 / 반올림 100원 → 각 2,400원, 오차 0", () => {
    const ms = members('a', 'b', 'c', 'd', 'e');
    const extras: Extra[] = [{ id: 'e1', label: '음료', amount: 12000, splitAmong: 'all' }];
    const s = mkSettlement({ members: ms, extras });
    const r = byId(s);
    for (const m of ms) expect(r.of(m.id).extra).toBe(2400);
    expect(sum(r.results.map((x) => x.extra))).toBe(12000);
    expect(sum(r.results.map((x) => x.adjustment))).toBe(0);
    expect(sum(r.results.map((x) => x.rounded))).toBe(12000);
  });

  it('기타비용 지정 분담: 대상자만 나눠 낸다', () => {
    const s = mkSettlement({
      members: members('a', 'b', 'c'),
      extras: [{ id: 'e1', label: '맥주', amount: 9000, splitAmong: ['a', 'b'] }],
    });
    const r = byId(s);
    expect(r.of('a').extra).toBe(4500);
    expect(r.of('b').extra).toBe(4500);
    expect(r.of('c').extra).toBe(0);
    expect(sum(r.results.map((x) => x.extra))).toBe(9000);
  });

  it('R13: 기타비용 10,000원 / 3명 → 전원 정확히 같은 정수이고 초과분은 2원이다', () => {
    const ms = members('a', 'b', 'c');
    const s = mkSettlement({
      members: ms,
      extras: [{ id: 'e1', label: '치킨', amount: 10000, splitAmong: 'all' }],
    });
    const r = byId(s);
    // 3,333.333… 을 올려 전원 3,334. 이전 정책의 3,334 / 3,333 / 3,333 과 달리 아무도 덜 내지 않는다
    expect(r.results.map((x) => x.extra)).toEqual([3334, 3334, 3334]);
    expect(sum(r.results.map((x) => x.extra))).toBe(10002);
    expect(sum(r.results.map((x) => x.extra)) - 10000).toBe(2); // 상한 3 미만
    expect(sum(r.results.map((x) => x.rounded))).toBe(10002);
    expect(r.roundingSurplus).toBe(2);
  });

  it("B5'/B6': 나누어떨어지지 않는 기타비용도 전 항목이 정수이고 표시에 소수점이 없다", () => {
    const s = mkSettlement({
      members: members('a', 'b', 'c'),
      extras: [{ id: 'e1', label: '치킨', amount: 10000, splitAmong: 'all' }],
    });
    const r = byId(s);
    for (const row of r.results) {
      expect(Number.isInteger(row.extra)).toBe(true);
      expect(Number.isInteger(row.rounded)).toBe(true);
      expect(Number.isInteger(row.adjustment)).toBe(true);
      expect(formatKRW(row.extra)).not.toContain('.');
    }
    expect(sum(r.results.map((x) => x.extra))).toBe(10002);
    expect(sum(r.results.map((x) => x.rounded))).toBe(10002);
  });

  it('R13: 여러 금액 × 인원 조합에서 기타비용 초과분이 정확히 상한 안에 있다', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    let checked = 0;
    let withSurplus = 0;
    for (let count = 1; count <= 7; count++) {
      for (const amount of [10000, 12000, 7777, 1, 99999]) {
        const s = mkSettlement({
          members: members(...ids.slice(0, count)),
          extras: [{ id: 'e1', label: 'x', amount, splitAmong: 'all' }],
        });
        const r = byId(s);
        const shares = r.results.map((x) => x.extra);
        const expectedSurplus = Math.ceil(amount / count) * count - amount;

        // 총액이 "보존"되지는 않는다. 대신 초과분이 정확히 얼마인지가 고정된다.
        expect(sum(shares)).toBe(amount + expectedSurplus);
        expect(sum(shares)).toBeGreaterThanOrEqual(amount);
        expect(sum(shares) - amount).toBeLessThan(count); // 상한: 분담 인원 미만
        expect(r.roundingSurplus).toBe(expectedSurplus);

        expect(r.results.every((x) => Number.isInteger(x.extra))).toBe(true);
        // 전원 동일 — "차이 1원 이하" 가 아니라 차이 0 이다
        expect(Math.max(...shares) - Math.min(...shares)).toBe(0);
        checked++;
        if (expectedSurplus > 0) withSurplus++;
      }
    }
    expect(checked).toBe(35);
    expect(withSurplus).toBe(20);
  });

  it('기타비용 여러 건이 겹치면 초과분이 항목별 초과분의 합과 일치한다', () => {
    const s = mkSettlement({
      members: members('a', 'b', 'c'),
      extras: [
        { id: 'e1', label: '치킨', amount: 10000, splitAmong: 'all' }, // 3,334 × 3 = 10,002 (+2)
        { id: 'e2', label: '맥주', amount: 5000, splitAmong: ['a', 'b'] }, // 2,500 × 2 = 5,000 (+0)
      ],
    });
    const r = byId(s);
    expect(sum(r.results.map((x) => x.extra))).toBe(15002);
    expect(r.of('a').extra).toBe(3334 + 2500);
    expect(r.of('b').extra).toBe(3334 + 2500);
    expect(r.of('c').extra).toBe(3334);
    expect(r.results.every((x) => Number.isInteger(x.extra))).toBe(true);
    // 초과분은 두 나눗셈의 초과분 합(2 + 0)과 정확히 같다
    expect(r.roundingSurplus).toBe(2 + 0);
  });

  it('분담 대상이 모두 멤버에서 빠진 기타비용은 무시되고 크래시하지 않는다', () => {
    const s = mkSettlement({
      members: members('a'),
      extras: [{ id: 'e1', label: '유령', amount: 5000, splitAmong: ['ghost'] }],
    });
    const r = byId(s);
    expect(r.of('a').extra).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// roundingSurplus — 전원 동일 분배로 더 걷힌 금액
// ---------------------------------------------------------------------------

describe('roundingSurplus — 더 걷힌 금액이 정확히 드러난다', () => {
  it('판돈 8,000원을 3명이 나누면 정확히 1원이다', () => {
    const s = mkSettlement({
      members: members('a', 'b', 'c', 'd', 'e'),
      gameFeePerGame: 4000,
      shoeFee: 0,
      rounds: [
        mkRound({
          id: 'r1',
          participants: ['a', 'b', 'c', 'd', 'e'],
          method: 'transfer',
          losers: ['c', 'd', 'e'],
          transferSource: 'gameFee',
        }),
      ],
    });
    const r = byId(s);
    expect(r.roundingSurplus).toBe(1);
    expect(r.roundingSurplus).toBe(Math.ceil(8000 / 3) * 3 - 8000);
  });

  it('기타비용 10,000원을 3명이 나누면 정확히 2원이다', () => {
    const s = mkSettlement({
      members: members('a', 'b', 'c'),
      gameFeePerGame: 0,
      shoeFee: 0,
      extras: [{ id: 'e1', label: '치킨', amount: 10000, splitAmong: 'all' }],
    });
    expect(byId(s).roundingSurplus).toBe(2);
  });

  it('나누어떨어지면 정확히 0 이다 (배지가 뜨면 안 된다)', () => {
    const s = mkSettlement({
      members: members('a', 'b', 'c', 'd'),
      gameFeePerGame: 4000,
      shoeFee: 2000,
      shoeRenters: ['a'],
      extras: [{ id: 'e1', label: '음료', amount: 12000, splitAmong: 'all' }],
      rounds: [
        mkRound({
          id: 'r1',
          participants: ['a', 'b', 'c', 'd'],
          method: 'transfer',
          losers: ['c', 'd'],
          transferSource: 'gameFee', // pot 8,000 / 2명 = 정확히 4,000
        }),
      ],
    });
    const r = byId(s);
    expect(r.roundingSurplus).toBe(0);
    // 0 이라는 건 "덜 걷힌 것도 없다" 는 뜻이기도 하다
    expect(sum(r.results.map((x) => x.rounded))).toBe(16000 + 2000 + 12000);
  });

  it('여러 나눗셈이 겹치면 각각의 초과분 합과 정확히 일치한다', () => {
    const s = mkSettlement({
      members: members('a', 'b', 'c', 'd', 'e'),
      gameFeePerGame: 4000,
      shoeFee: 0,
      extras: [
        { id: 'e1', label: '치킨', amount: 10000, splitAmong: 'all' }, // 2,000 × 5 → +0
        { id: 'e2', label: '맥주', amount: 5000, splitAmong: ['a', 'b', 'c'] }, // 1,667 × 3 → +1
      ],
      rounds: [
        mkRound({
          id: 'r1',
          participants: ['a', 'b', 'c', 'd', 'e'],
          method: 'transfer',
          losers: ['c', 'd', 'e'],
          transferSource: 'gameFee', // pot 8,000 / 3명 → +1
        }),
      ],
    });
    const r = byId(s);
    const expected =
      (Math.ceil(10000 / 5) * 5 - 10000) +
      (Math.ceil(5000 / 3) * 3 - 5000) +
      (Math.ceil(8000 / 3) * 3 - 8000);
    expect(expected).toBe(2);
    expect(r.roundingSurplus).toBe(expected);
  });

  it('초과분은 나눗셈 한 번당 인원수 미만이라는 상한을 넘지 않는다', () => {
    // 7명이 나눠 내는 기타비용 2건 → 각각 최대 6원, 합쳐도 12원을 넘을 수 없다
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const s = mkSettlement({
      members: members(...ids),
      gameFeePerGame: 0,
      shoeFee: 0,
      extras: [
        { id: 'e1', label: 'x', amount: 99999, splitAmong: 'all' },
        { id: 'e2', label: 'y', amount: 7777, splitAmong: 'all' },
      ],
    });
    const r = byId(s);
    expect(r.roundingSurplus).toBe(
      (Math.ceil(99999 / 7) * 7 - 99999) + (Math.ceil(7777 / 7) * 7 - 7777),
    );
    expect(r.roundingSurplus).toBeGreaterThanOrEqual(0);
    expect(r.roundingSurplus).toBeLessThan(7 * 2);
  });

  // --- 아래 두 건은 "초과분"이 아닌 값이 roundingSurplus 에 섞이는 현 구현의 동작을 고정한다.
  //     팀 리드에게 보고된 사안이며, 정의가 바뀌면 이 테스트가 먼저 빨개진다.
  it('imbalance 가 있으면 roundingSurplus 에 -imbalance 가 섞인다 (현 구현 고정)', () => {
    const s = mkSettlement({
      members: members('a', 'b', 'c', 'd'),
      gameFeePerGame: 4000,
      shoeFee: 0,
      rounds: [
        // pot 4,000 인데 배당은 6,000 → imbalance +2,000
        mkRound({
          id: 'r1',
          participants: ['a', 'b', 'c', 'd'],
          method: 'pot',
          ante: 1000,
          payout: [6000],
          ranking: [['a']],
        }),
      ],
    });
    const r = byId(s);
    expect(r.totalImbalance).toBe(2000);
    // 나눗셈 초과분은 0 인데도 roundingSurplus 가 0 이 아니다 — imbalance 가 그대로 새어 든다
    expect(r.roundingSurplus).toBe(-2000);
  });

  it('분담 대상이 전원 빠진 기타비용은 roundingSurplus 를 음수로 만든다 (현 구현 고정)', () => {
    const s = mkSettlement({
      members: members('a'),
      gameFeePerGame: 0,
      shoeFee: 0,
      extras: [{ id: 'e1', label: '유령', amount: 5000, splitAmong: ['ghost'] }],
    });
    const r = byId(s);
    expect(r.of('a').extra).toBe(0);
    // 아무도 내지 않은 5,000원이 "초과분 -5,000" 으로 표현된다 (실제로는 미수금이다)
    expect(r.roundingSurplus).toBe(-5000);
  });
});

// ---------------------------------------------------------------------------
// A4 / A5 / A10 — 고정 시드 랜덤 불변식
// ---------------------------------------------------------------------------

/** mulberry32 — 외부 의존성 없는 고정 시드 의사난수 생성기 */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const randInt = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T,>(rng: Rng, xs: T[]): T => xs[randInt(rng, 0, xs.length - 1)];

function shuffled<T>(rng: Rng, xs: T[]): T[] {
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** participants 를 1~3개의 순위 그룹으로 랜덤 분할 */
function partition(rng: Rng, ids: string[]): string[][] {
  const pool = shuffled(rng, ids);
  const groups: string[][] = [];
  const count = Math.min(randInt(rng, 1, 3), pool.length);
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const left = pool.length - cursor;
    const remainingGroups = count - i;
    const size = i === count - 1 ? left : randInt(rng, 1, left - (remainingGroups - 1));
    groups.push(pool.slice(cursor, cursor + size));
    cursor += size;
  }
  return groups;
}

function makeRound(rng: Rng, id: string, memberIds: string[], method: Round['method']): Round {
  const participants = shuffled(rng, memberIds).slice(0, randInt(rng, 2, memberIds.length));
  if (method === 'pot') {
    const ante = randInt(rng, 1, 5) * 1000;
    const ranking = partition(rng, participants);
    // 배당을 ante 배수 토큰으로 배분한다. 남은 토큰이 있으면 그만큼 imbalance 가 생긴다.
    let pool = participants.length;
    const payout: number[] = [];
    for (const g of ranking) {
      const k = randInt(rng, 0, Math.floor(pool / g.length));
      payout.push(k * ante);
      pool -= k * g.length;
    }
    // 절반 확률로 남은 판돈을 마지막 그룹에 몰아 균형을 맞춘다
    const last = ranking.length - 1;
    if (pool > 0 && rng() < 0.5 && pool % ranking[last].length === 0) {
      payout[last] += (pool / ranking[last].length) * ante;
      pool = 0;
    }
    return mkRound({ id, participants, method, ante, payout, ranking });
  }
  if (method === 'transfer') {
    // 0명 / 전원 losers 엣지도 가끔 생성한다
    const size = randInt(rng, 0, participants.length);
    const losers = shuffled(rng, participants).slice(0, size);
    const source: Round['transferSource'] = rng() < 0.5 ? 'gameFee' : 'custom';
    return mkRound({
      id,
      participants,
      method,
      losers,
      transferSource: source,
      transferAmount: randInt(rng, 1, 5) * 1000,
    });
  }
  return mkRound({ id, participants, method });
}

function makeSettlement(rng: Rng, methods?: Round['method'][]): Settlement {
  const n = randInt(rng, 3, 8);
  const ms = members(...Array.from({ length: n }, (_, i) => `m${i}`));
  const ids = ms.map((m) => m.id);
  const roundMethods =
    methods ??
    Array.from({ length: randInt(rng, 1, 5) }, () =>
      pick<Round['method']>(rng, ['none', 'pot', 'transfer']),
    );
  const extras: Extra[] = Array.from({ length: randInt(rng, 0, 2) }, (_, i) => ({
    id: `e${i}`,
    label: `extra${i}`,
    amount: randInt(rng, 1, 10) * 1000,
    splitAmong: rng() < 0.5 ? 'all' : shuffled(rng, ids).slice(0, randInt(rng, 1, n)),
  }));
  return mkSettlement({
    members: ms,
    gameFeePerGame: randInt(rng, 6, 10) * 500,
    shoeFee: randInt(rng, 0, 4) * 500,
    shoeRenters: shuffled(rng, ids).slice(0, randInt(rng, 0, n)),
    rounds: roundMethods.map((m, i) => makeRound(rng, `r${i}`, ids, m)),
    extras,
  });
}

/**
 * 한 transfer 라운드가 만드는 초과분을 **calc.ts 를 쓰지 않고** 독립적으로 계산한다.
 *
 * 랜덤 케이스에서 `Σ betDelta >= 0` 만 보면 거의 항상 참이라 아무것도 못 잡는다.
 * Σ betDelta 가 정확히 얼마여야 하는지를 여기서 따로 구해 대조한다.
 */
function transferSurplusOf(round: Round, gameFeePerGame: number): number {
  if (round.method !== 'transfer') return 0;
  const participants = [...new Set(round.participants)];
  const joined = new Set(participants);
  const losers = [...new Set(round.losers)].filter((id) => joined.has(id));
  const loserSet = new Set(losers);
  const winners = participants.filter((id) => !loserSet.has(id));
  if (losers.length === 0 || winners.length === 0) return 0;

  const amount = round.transferSource === 'gameFee' ? gameFeePerGame : round.transferAmount;
  const pot = amount * winners.length;
  return Math.ceil(pot / losers.length) * losers.length - pot;
}

/** 기타비용 항목들이 만드는 초과분을 독립적으로 계산한다 */
function extraSurplusOf(s: Settlement): number {
  const known = new Set(s.members.map((m) => m.id));
  let surplus = 0;
  for (const item of s.extras) {
    const n = (item.splitAmong === 'all' ? [...known] : item.splitAmong).filter((id) =>
      known.has(id),
    ).length;
    // 분담 대상이 한 명도 없으면 아무도 내지 않는다 → 걷힌 금액이 항목 금액보다 부족하다
    surplus += n === 0 ? -item.amount : Math.ceil(item.amount / n) * n - item.amount;
  }
  return surplus;
}

/**
 * 한 케이스에 대해 총액 불변식을 검사하고, imbalance 0 여부를 반환한다.
 *
 * splitEvenly 가 전원 동일 정책으로 바뀐 뒤로 제로섬(`Σ betDelta === 0`)은 더 이상 성립하지 않는다.
 * 대신 초과분이 **정확히 얼마인지**를 독립 계산과 대조한다.
 */
function assertInvariants(s: Settlement): { balanced: boolean; surplus: number } {
  const r = calculate(s);
  const totalBet = sum(r.results.map((x) => x.betDelta));
  const totalBase = sum(r.results.map((x) => x.gameFee + x.shoe + x.extra));
  const totalSub = sum(r.results.map((x) => x.subtotal));
  const totalRounded = sum(r.results.map((x) => x.rounded));

  const betSurplus = sum(s.rounds.map((round) => transferSurplusOf(round, s.gameFeePerGame)));
  const extraSurplus = extraSurplusOf(s);

  // 정수 입력이면 엔진 어디에도 부동소수 잔여가 남지 않는다 (R13).
  // toBeCloseTo 로 느슨하게 통과시키면 소수점 유출을 놓친다 — 전부 toBe 로 검사한다.
  for (const row of r.results) {
    expect(Number.isInteger(row.betDelta)).toBe(true);
    expect(Number.isInteger(row.extra)).toBe(true);
    expect(Number.isInteger(row.subtotal)).toBe(true);
    expect(Number.isInteger(row.rounded)).toBe(true);
    expect(Number.isInteger(row.adjustment)).toBe(true);
  }

  // 초과분은 방향이 정해져 있다 — 항상 0 이상이고 절대 음수가 되지 않는다
  expect(betSurplus).toBeGreaterThanOrEqual(0);
  expect(extraSurplus).toBeGreaterThanOrEqual(0);

  // 항상 성립: Σ betDelta + Σ imbalance === 판비 나눗셈이 만든 초과분
  // (`toBe(betSurplus - totalImbalance)` 는 0 과 -0 이 Object.is 로 갈려서 못 쓴다)
  expect(totalBet + r.totalImbalance).toBe(betSurplus);
  // 반올림은 총액을 바꾸지 않는다 (초과분은 이미 splitEvenly 단계에서 반영됐다)
  expect(totalRounded).toBe(totalSub);
  // roundingSurplus 가 실제 초과분과 정확히 일치한다
  expect(r.roundingSurplus).toBe(betSurplus + extraSurplus - r.totalImbalance);

  if (r.totalImbalance === 0) {
    expect(totalBet).toBe(betSurplus); // A4(개정): 제로섬 대신 "초과분만큼만 더 걷힌다"
    // A5(개정): Σ rounded 는 Σ base 이상이고, 그 차이가 정확히 판비 나눗셈의 초과분이다
    // (Σ base 안의 extra 에는 기타비용 초과분이 이미 반영돼 있다)
    expect(totalRounded).toBe(totalBase + betSurplus);
    expect(totalRounded).toBeGreaterThanOrEqual(totalBase);
    expect(r.roundingSurplus).toBe(betSurplus + extraSurplus);
    return { balanced: true, surplus: betSurplus + extraSurplus };
  }
  return { balanced: false, surplus: betSurplus + extraSurplus };
}

describe('불변식 — 고정 시드 랜덤', () => {
  it('A4/A5: 총액·초과분 불변식 — 고정 시드 랜덤 200케이스', () => {
    const rng = makeRng(20260821);
    let balanced = 0;
    let withSurplus = 0;
    for (let i = 0; i < 200; i++) {
      const out = assertInvariants(makeSettlement(rng));
      if (out.balanced) balanced++;
      if (out.surplus > 0) withSurplus++;
    }
    // 균형 케이스가 실제로 충분히 생성되어야 테스트가 공허하지 않다
    expect(balanced).toBeGreaterThan(20);
    // 초과분이 0 이 아닌 케이스도 충분해야 한다 — 전부 0 이면 위 대조가 아무것도 검증하지 못한다
    expect(withSurplus).toBeGreaterThan(20);
  });

  it('A10: 혼합 정산(pot 2 / transfer 2 / none 1)에서도 A4·A5 불변식 유지 — 200케이스', () => {
    const rng = makeRng(777);
    const methods: Round['method'][] = ['pot', 'pot', 'transfer', 'transfer', 'none'];
    let balanced = 0;
    let withSurplus = 0;
    for (let i = 0; i < 200; i++) {
      const out = assertInvariants(makeSettlement(rng, methods));
      if (out.balanced) balanced++;
      if (out.surplus > 0) withSurplus++;
    }
    expect(balanced).toBeGreaterThan(20);
    expect(withSurplus).toBeGreaterThan(20);
  });

  it('A10: 혼합 정산 손계산 대조 — 5판 시나리오', () => {
    const ms = members('a', 'b', 'c', 'd');
    const s = mkSettlement({
      members: ms,
      gameFeePerGame: 4000,
      shoeFee: 2000,
      shoeRenters: ['a'],
      rounds: [
        // 1판 pot: 4명, ante 1,000, 1등 4,000 → a -3,000 / 나머지 +1,000
        mkRound({
          id: 'r1',
          participants: ['a', 'b', 'c', 'd'],
          method: 'pot',
          ante: 1000,
          payout: [4000],
          ranking: [['a']],
        }),
        // 2판 pot: 4명, ante 1,000, 1등 2,000 / 2등 2,000 → a,b -1,000 / c,d +1,000
        mkRound({
          id: 'r2',
          participants: ['a', 'b', 'c', 'd'],
          method: 'pot',
          ante: 1000,
          payout: [2000, 2000],
          ranking: [['a'], ['b']],
        }),
        // 3판 transfer(gameFee 4,000): 진 쪽 c,d → 각 +4,000 / a,b 각 -4,000
        mkRound({
          id: 'r3',
          participants: ['a', 'b', 'c', 'd'],
          method: 'transfer',
          losers: ['c', 'd'],
          transferSource: 'gameFee',
        }),
        // 4판 transfer(custom 3,000): 진 쪽 a → +9,000 / 나머지 각 -3,000
        mkRound({
          id: 'r4',
          participants: ['a', 'b', 'c', 'd'],
          method: 'transfer',
          losers: ['a'],
          transferSource: 'custom',
          transferAmount: 3000,
        }),
        // 5판 none: b,c 만 참여
        mkRound({ id: 'r5', participants: ['b', 'c'] }),
      ],
    });
    const r = byId(s);
    expect(r.of('a').betDelta).toBe(-3000 - 1000 - 4000 + 9000); // +1,000
    expect(r.of('b').betDelta).toBe(1000 - 1000 - 4000 - 3000); // -7,000
    expect(r.of('c').betDelta).toBe(1000 + 1000 + 4000 - 3000); // +3,000
    expect(r.of('d').betDelta).toBe(1000 + 1000 + 4000 - 3000); // +3,000
    expect(sum(r.results.map((x) => x.betDelta))).toBe(0);

    expect(r.of('a').gameCount).toBe(4);
    expect(r.of('b').gameCount).toBe(5);
    expect(r.of('a').gameFee).toBe(16000);
    expect(r.of('a').shoe).toBe(2000);
    expect(r.of('a').subtotal).toBe(16000 + 2000 + 0 + 1000);

    const base = sum(r.results.map((x) => x.gameFee + x.shoe + x.extra));
    expect(sum(r.results.map((x) => x.rounded))).toBe(base);
    expect(r.totalImbalance).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 반올림 통합 (B1/B3 를 calculate 경로에서 재확인)
// ---------------------------------------------------------------------------

describe('calculate — 반올림 통합', () => {
  it("B1'': 나누어떨어지지 않는 기타비용은 전원 동일 금액이 되고 초과분만큼 더 걷힌다", () => {
    const ms = members('a', 'b', 'c');
    const s = mkSettlement({
      members: ms,
      gameFeePerGame: 0,
      shoeFee: 0,
      extras: [{ id: 'e1', label: '음료', amount: 10000, splitAmong: 'all' }],
    });
    const r = byId(s);
    // splitEvenly 가 전원을 올리므로 셋 다 3,334 이고 합계가 10,002 다 (초과 2원)
    expect(r.of('a').rounded).toBe(3334);
    expect(r.of('b').rounded).toBe(3334);
    expect(r.of('c').rounded).toBe(3334);
    expect(sum(r.results.map((x) => x.rounded))).toBe(10002);
    expect(r.roundingSurplus).toBe(2);
    // 올림은 splitEvenly 단계에서 끝났으므로 distributeWithRemainder 는 아무것도 조정하지 않는다
    expect(sum(r.results.map((x) => x.adjustment))).toBe(0);
  });

  it('B3: 입력이 정수면 잔돈 조정이 아예 발생하지 않는다 (배지가 뜨면 안 된다)', () => {
    const s = mkSettlement({
      members: members('a', 'b', 'c'),
      gameFeePerGame: 1250,
      shoeFee: 0,
      rounds: [
        mkRound({ id: 'r1', participants: ['a', 'b', 'c'] }),
        mkRound({ id: 'r2', participants: ['a'] }),
      ],
    });
    const r = byId(s);
    // subtotal: a 2,500 / b 1,250 / c 1,250 → 합 5,000. 1원 올림은 여기서 no-op 이다.
    expect(r.of('a').subtotal).toBe(2500);
    expect(sum(r.results.map((x) => x.rounded))).toBe(5000);
    // 1.8e-12 같은 sub-원 잔여가 아니라 정확히 0 이어야 `adjustment !== 0` 배지 판정이 의미를 갖는다
    for (const row of r.results) {
      expect(row.adjustment).toBe(0);
      expect(row.rounded).toBe(row.subtotal);
    }
  });

  it('B4: 내기로 이득 본 사람의 최종 금액은 음수로 유지된다', () => {
    const s = mkSettlement({
      members: members('a', 'b', 'c'),
      gameFeePerGame: 1000,
      shoeFee: 0,
      rounds: [
        mkRound({
          id: 'r1',
          participants: ['a', 'b', 'c'],
          method: 'pot',
          ante: 5000,
          payout: [15000],
          ranking: [['a']],
        }),
      ],
    });
    const r = byId(s);
    expect(r.of('a').betDelta).toBe(-10000);
    expect(r.of('a').rounded).toBe(-9000); // 게임비 1,000 - 10,000
    expect(r.of('a').rounded).toBeLessThan(0);
    expect(sum(r.results.map((x) => x.rounded))).toBe(3000);
  });
});

// ---------------------------------------------------------------------------
// 5-A-2 / 5-A-3 — 정산 모드 게이트 (G1, G2, G8) 및 표시 정수성 (B6')
// ---------------------------------------------------------------------------

/**
 * 내기가 잔뜩 입력된 3판 시나리오.
 * r3 은 일부러 배당(10,000)이 판돈(4,000)을 초과해 `imbalance === +6000` 이다.
 * 이게 없으면 G1 의 `breakdowns[].imbalance === 0` 검사가 공허해진다.
 */
function betScenario(mode: SettlementMode): Settlement {
  return mkSettlement({
    members: members('a', 'b', 'c', 'd'),
    gameFeePerGame: 4000,
    shoeFee: 2000,
    shoeRenters: ['a'],
    mode,
    rounds: [
      mkRound({
        id: 'r1',
        participants: ['a', 'b', 'c', 'd'],
        method: 'pot',
        ante: 1000,
        payout: [4000],
        ranking: [['a']],
      }),
      mkRound({
        id: 'r2',
        participants: ['a', 'b', 'c', 'd'],
        teams: [
          ['a', 'b'],
          ['c', 'd'],
        ],
        method: 'transfer',
        losers: ['c', 'd'],
        transferSource: 'gameFee',
      }),
      mkRound({
        id: 'r3',
        participants: ['a', 'b', 'c', 'd'],
        method: 'pot',
        ante: 1000,
        payout: [10000],
        ranking: [['b']],
      }),
    ],
  });
}

describe('정산 모드 / 내기 모드 게이트', () => {
  it('내기 모드에서는 기존 계산이 그대로다 (대조군)', () => {
    const r = byId(betScenario('bet'));
    expect(r.of('a').betDelta).toBe(-6000);
    expect(r.of('b').betDelta).toBe(-12000);
    expect(r.of('c').betDelta).toBe(6000);
    expect(r.of('d').betDelta).toBe(6000);
    expect(r.breakdowns.map((b) => b.imbalance)).toEqual([0, 0, 6000]);
    expect(r.totalImbalance).toBe(6000);
  });

  it('G1: 정산 모드면 내기 입력이 남아 있어도 betDelta·totalImbalance·breakdowns[].imbalance 가 전부 0', () => {
    const r = byId(betScenario('normal'));

    for (const row of r.results) expect(row.betDelta).toBe(0);
    expect(sum(r.results.map((x) => x.betDelta))).toBe(0);
    expect(r.totalImbalance).toBe(0);
    // breakdowns 를 안 막으면 ResultCard 의 원인 힌트 블록이 정산 모드에서도 뜬다
    expect(r.breakdowns.map((b) => b.imbalance)).toEqual([0, 0, 0]);
    for (const b of r.breakdowns) {
      expect(Object.values(b.delta).every((d) => d === 0)).toBe(true);
    }
  });

  it('G1: 정산 모드에서도 gameCount·gameFee·신발비는 그대로 센다', () => {
    const r = byId(betScenario('normal'));
    for (const row of r.results) {
      expect(row.gameCount).toBe(3);
      expect(row.gameFee).toBe(12000);
    }
    expect(r.of('a').shoe).toBe(2000);
    expect(sum(r.results.map((x) => x.rounded))).toBe(50000); // 게임비 48,000 + 신발비 2,000
  });

  it('G5: roundDelta 를 직접 호출해도 정산 모드면 경고가 뜰 근거가 없다 (delta·imbalance 0)', () => {
    const s = betScenario('normal');
    for (const round of s.rounds) {
      const b = roundDelta(round, s.gameFeePerGame, 'normal');
      expect(b.imbalance).toBe(0);
      expect(Object.values(b.delta).every((d) => d === 0)).toBe(true);
    }
    // 같은 라운드를 내기 모드로 부르면 r3 는 여전히 불균형이다
    expect(roundDelta(s.rounds[2], s.gameFeePerGame, 'bet').imbalance).toBe(6000);
  });

  it('G2: calculate() 는 라운드의 내기 입력을 변형하지 않는다 (비파괴 전환)', () => {
    const s = betScenario('normal');
    const before = JSON.parse(JSON.stringify(s.rounds));

    calculate(s);
    calculate({ ...s, mode: 'bet' });
    calculate(s);

    expect(s.rounds).toEqual(before);
    for (const round of s.rounds) {
      expect(round.ranking).toEqual(before[s.rounds.indexOf(round)].ranking);
    }
    // 모드를 되돌리면 계산 결과도 그대로 살아난다
    const back = byId({ ...s, mode: 'bet' });
    expect(back.of('a').betDelta).toBe(-6000);
    expect(back.totalImbalance).toBe(6000);
  });

  it("G8: mode 가 undefined 인 구버전 데이터에서 내기 금액이 사라지지 않는다 (극성 회귀 방지)", () => {
    // `mode === 'bet' ? delta : 0` 으로 극성을 뒤집으면 여기서 전부 0 이 된다
    const legacy: Settlement = {
      ...betScenario('bet'),
      mode: undefined as unknown as SettlementMode,
    };
    const r = byId(legacy);

    expect(r.of('a').betDelta).toBe(-6000);
    expect(r.of('b').betDelta).toBe(-12000);
    expect(r.totalImbalance).toBe(6000);
    expect(r.results.some((x) => x.betDelta !== 0)).toBe(true);
  });

  it("G8: 알 수 없는 mode 값도 내기 모드로 폴백한다 (극성 회귀 방지 — 기본 인자로는 못 잡는 경로)", () => {
    // `mode: undefined` 는 roundDelta 의 기본 인자 `= 'bet'` 이 먼저 막아버려서
    // 극성이 뒤집혀도 통과한다. 손상된 저장값이 'bet'/'normal' 이 아닌 문자열을 담고 있으면
    // 기본 인자가 안 먹으므로 판정식의 극성이 그대로 드러난다.
    const corrupted: Settlement = {
      ...betScenario('bet'),
      mode: 'legacy-v1' as unknown as SettlementMode,
    };
    const r = byId(corrupted);
    expect(r.of('a').betDelta).toBe(-6000);
    expect(r.of('b').betDelta).toBe(-12000);
    expect(r.totalImbalance).toBe(6000);

    // roundDelta 직접 호출도 동일하게 안전한 쪽으로 무너져야 한다
    const b = roundDelta(corrupted.rounds[0], corrupted.gameFeePerGame, 'legacy-v1' as unknown as SettlementMode);
    expect(b.delta.a).toBe(-3000);
  });

  it('G8: roundDelta 도 mode 인자를 생략하면 내기 모드로 폴백한다', () => {
    const s = betScenario('bet');
    expect(roundDelta(s.rounds[0], s.gameFeePerGame).delta.a).toBe(-3000);
    expect(roundDelta(s.rounds[0], s.gameFeePerGame, undefined).delta.a).toBe(-3000);
  });

  it("B6': 두 모드 모두 표시 문자열에 소수점이 없다", () => {
    for (const mode of ['bet', 'normal'] as const) {
      const r = byId(betScenario(mode));
      for (const row of r.results) {
        expect(formatKRW(row.rounded)).not.toContain('.');
        expect(formatSigned(row.betDelta)).not.toContain('.');
        expect(formatSigned(row.adjustment)).not.toContain('.');
        expect(Number.isInteger(row.rounded)).toBe(true);
        expect(Number.isInteger(row.betDelta)).toBe(true);
        expect(Number.isInteger(row.adjustment)).toBe(true);
      }
    }
  });

  it("B6': 나누어떨어지지 않는 판비 + 기타비용이 섞여도 표시에 소수점이 없다", () => {
    // reviewer 실측 사례와 같은 형태: 6명 + 나누어떨어지지 않는 기타비용
    const s = mkSettlement({
      members: members('a', 'b', 'c', 'd', 'e', 'f'),
      gameFeePerGame: 4000,
      shoeFee: 2000,
      shoeRenters: ['a', 'c'],
      extras: [{ id: 'e1', label: '뒤풀이', amount: 13000, splitAmong: 'all' }],
      rounds: [
        mkRound({
          id: 'r1',
          participants: ['a', 'b', 'c', 'd', 'e', 'f'],
          method: 'transfer',
          losers: ['d', 'e', 'f'],
          transferSource: 'gameFee',
        }),
      ],
    });
    const r = byId(s);
    for (const row of r.results) {
      expect(formatKRW(row.rounded)).not.toContain('.');
      expect(formatSigned(row.betDelta)).not.toContain('.');
      expect(formatSigned(row.adjustment)).not.toContain('.');
      expect(formatKRW(row.extra)).not.toContain('.');
      expect(row.adjustment).toBe(0); // "잔돈 조정 +0원" 배지가 뜨면 안 된다
    }
    // 13,000 / 6명 = 2,166.666… → 전원 2,167 이라 합계가 13,002 다 (초과 2원, 상한 6 미만)
    expect(r.results.map((x) => x.extra)).toEqual([2167, 2167, 2167, 2167, 2167, 2167]);
    expect(sum(r.results.map((x) => x.extra))).toBe(13002);
    expect(sum(r.results.map((x) => x.extra)) - 13000).toBe(2);
    // 판비 쪽(12,000 / 3명)은 나누어떨어지므로 초과분 전액이 기타비용에서 온다
    expect(r.roundingSurplus).toBe(2);
  });
});

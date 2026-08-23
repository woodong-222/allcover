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

    // 8,000원을 3명이 나눠 내되 2,666.666… 이 아니라 2,667 / 2,667 / 2,666 이다
    expect(r.of('c').betDelta).toBe(2667);
    expect(r.of('d').betDelta).toBe(2667);
    expect(r.of('e').betDelta).toBe(2666);
    expect(r.of('a').betDelta).toBe(-4000);
    expect(r.of('b').betDelta).toBe(-4000);
    expect(sum(r.results.map((x) => x.betDelta))).toBe(0);

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

  it('R13: 진 쪽 2~7명 × 참여 3~8명 조합에서 Σ delta === 0 이 정확히 성립한다', () => {
    const ids = ['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'];
    let checked = 0;

    for (let participantCount = 3; participantCount <= 8; participantCount++) {
      const participants = ids.slice(0, participantCount);
      for (let loserCount = 2; loserCount <= Math.min(7, participantCount - 1); loserCount++) {
        for (const amount of [4000, 3333, 1000, 7777]) {
          const b = roundDelta(
            mkRound({
              id: `r-${participantCount}-${loserCount}-${amount}`,
              participants,
              method: 'transfer',
              losers: participants.slice(0, loserCount),
              transferSource: 'custom',
              transferAmount: amount,
            }),
            4000,
          );
          const deltas = Object.values(b.delta);
          // toBeCloseTo 가 아니라 toBe — 부동소수 잔여가 하나도 없어야 한다
          expect(sum(deltas)).toBe(0);
          expect(deltas.every(Number.isInteger)).toBe(true);
          expect(b.imbalance).toBe(0);
          checked++;
        }
      }
    }
    expect(checked).toBe(84);
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

  it('R13: 기타비용 10,000원 / 3명 → 각 배분이 정수이고 합이 정확히 10,000', () => {
    const ms = members('a', 'b', 'c');
    const s = mkSettlement({
      members: ms,
      extras: [{ id: 'e1', label: '치킨', amount: 10000, splitAmong: 'all' }],
    });
    const r = byId(s);
    // 3,333.333… 이 아니라 3,334 / 3,333 / 3,333
    expect(r.results.map((x) => x.extra)).toEqual([3334, 3333, 3333]);
    expect(sum(r.results.map((x) => x.extra))).toBe(10000);
    expect(sum(r.results.map((x) => x.rounded))).toBe(10000);
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
    expect(sum(r.results.map((x) => x.extra))).toBe(10000);
    expect(sum(r.results.map((x) => x.rounded))).toBe(10000);
  });

  it('R13: 여러 금액 × 인원 조합에서 기타비용 항목 총액이 정확히 보존된다', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    let checked = 0;
    for (let count = 1; count <= 7; count++) {
      for (const amount of [10000, 12000, 7777, 1, 99999]) {
        const s = mkSettlement({
          members: members(...ids.slice(0, count)),
          extras: [{ id: 'e1', label: 'x', amount, splitAmong: 'all' }],
        });
        const r = byId(s);
        expect(sum(r.results.map((x) => x.extra))).toBe(amount);
        expect(r.results.every((x) => Number.isInteger(x.extra))).toBe(true);
        const shares = r.results.map((x) => x.extra);
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
        checked++;
      }
    }
    expect(checked).toBe(35);
  });

  it('기타비용 여러 건이 겹쳐도 각 항목 총액이 보존된다', () => {
    const s = mkSettlement({
      members: members('a', 'b', 'c'),
      extras: [
        { id: 'e1', label: '치킨', amount: 10000, splitAmong: 'all' },
        { id: 'e2', label: '맥주', amount: 5000, splitAmong: ['a', 'b'] },
      ],
    });
    const r = byId(s);
    expect(sum(r.results.map((x) => x.extra))).toBe(15000);
    expect(r.results.every((x) => Number.isInteger(x.extra))).toBe(true);
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

/** 한 케이스에 대해 제로섬·총액 불변식을 검사하고, imbalance 0 여부를 반환한다 */
function assertInvariants(s: Settlement): boolean {
  const r = calculate(s);
  const totalBet = sum(r.results.map((x) => x.betDelta));
  const totalBase = sum(r.results.map((x) => x.gameFee + x.shoe + x.extra));
  const totalSub = sum(r.results.map((x) => x.subtotal));
  const totalRounded = sum(r.results.map((x) => x.rounded));

  // 정수 입력이면 엔진 어디에도 부동소수 잔여가 남지 않는다 (R13).
  // toBeCloseTo 로 느슨하게 통과시키면 소수점 유출을 놓친다 — 전부 toBe 로 검사한다.
  for (const row of r.results) {
    expect(Number.isInteger(row.betDelta)).toBe(true);
    expect(Number.isInteger(row.extra)).toBe(true);
    expect(Number.isInteger(row.subtotal)).toBe(true);
    expect(Number.isInteger(row.rounded)).toBe(true);
    expect(Number.isInteger(row.adjustment)).toBe(true);
  }

  // 항상 성립: Σ betDelta === -Σ imbalance
  // (`toBe(-totalImbalance)` 는 imbalance 가 0 일 때 -0 과 +0 이 Object.is 로 갈려서 못 쓴다)
  expect(totalBet + r.totalImbalance).toBe(0);
  // 반올림은 총액을 바꾸지 않는다
  expect(totalRounded).toBe(totalSub);

  if (r.totalImbalance === 0) {
    expect(totalBet).toBe(0); // A4
    expect(totalRounded).toBe(totalBase); // A5
    return true;
  }
  return false;
}

describe('불변식 — 고정 시드 랜덤', () => {
  it('A4/A5: 제로섬·총액 불변식 — 고정 시드 랜덤 200케이스', () => {
    const rng = makeRng(20260821);
    let balanced = 0;
    for (let i = 0; i < 200; i++) {
      if (assertInvariants(makeSettlement(rng))) balanced++;
    }
    // 균형 케이스가 실제로 충분히 생성되어야 테스트가 공허하지 않다
    expect(balanced).toBeGreaterThan(20);
  });

  it('A10: 혼합 정산(pot 2 / transfer 2 / none 1)에서도 A4·A5 불변식 유지 — 200케이스', () => {
    const rng = makeRng(777);
    const methods: Round['method'][] = ['pot', 'pot', 'transfer', 'transfer', 'none'];
    let balanced = 0;
    for (let i = 0; i < 200; i++) {
      if (assertInvariants(makeSettlement(rng, methods))) balanced++;
    }
    expect(balanced).toBeGreaterThan(20);
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
  it("B1': 나누어떨어지지 않는 기타비용도 합계가 정확히 보존된다", () => {
    const ms = members('a', 'b', 'c');
    const s = mkSettlement({
      members: ms,
      gameFeePerGame: 0,
      shoeFee: 0,
      extras: [{ id: 'e1', label: '음료', amount: 10000, splitAmong: 'all' }],
    });
    const r = byId(s);
    expect(sum(r.results.map((x) => x.rounded))).toBe(10000);
    // splitEvenly 가 앞사람부터 1원씩 얹으므로 a 가 1원 더 낸다
    expect(r.of('a').rounded).toBe(3334);
    expect(r.of('b').rounded).toBe(3333);
    expect(r.of('c').rounded).toBe(3333);
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
    expect(sum(r.results.map((x) => x.extra))).toBe(13000);
  });
});

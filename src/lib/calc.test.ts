import { describe, expect, it } from 'vitest';
import { calculate, roundDelta } from './calc';
import type { Extra, Member, Round, Settlement } from '../types';

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
    defaultAnte: 1000,
    rounds: [],
    extras: [],
    roundingUnit: 100,
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
    const s = mkSettlement({ members: ms, roundingUnit: 100, extras });
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

  it('기타비용 나눗셈 나머지가 생겨도 총액이 보존된다', () => {
    const ms = members('a', 'b', 'c');
    const s = mkSettlement({
      members: ms,
      roundingUnit: 100,
      extras: [{ id: 'e1', label: '치킨', amount: 10000, splitAmong: 'all' }],
    });
    const r = byId(s);
    expect(sum(r.results.map((x) => x.extra))).toBeCloseTo(10000, 6);
    expect(sum(r.results.map((x) => x.rounded))).toBeCloseTo(10000, 6);
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
  const treasurer = rng() < 0.5 ? pick(rng, ids) : undefined;
  return mkSettlement({
    members: ms,
    gameFeePerGame: randInt(rng, 6, 10) * 500,
    shoeFee: randInt(rng, 0, 4) * 500,
    shoeRenters: shuffled(rng, ids).slice(0, randInt(rng, 0, n)),
    roundingUnit: pick<Settlement['roundingUnit']>(rng, [0, 10, 100]),
    rounds: roundMethods.map((m, i) => makeRound(rng, `r${i}`, ids, m)),
    extras,
    treasurerId: treasurer,
  });
}

/** 한 케이스에 대해 제로섬·총액 불변식을 검사하고, imbalance 0 여부를 반환한다 */
function assertInvariants(s: Settlement): boolean {
  const r = calculate(s);
  const totalBet = sum(r.results.map((x) => x.betDelta));
  const totalBase = sum(r.results.map((x) => x.gameFee + x.shoe + x.extra));
  const totalSub = sum(r.results.map((x) => x.subtotal));
  const totalRounded = sum(r.results.map((x) => x.rounded));

  // 항상 성립: Σ betDelta === -Σ imbalance
  expect(totalBet).toBeCloseTo(-r.totalImbalance, 6);
  // 반올림은 총액을 바꾸지 않는다
  expect(totalRounded).toBeCloseTo(totalSub, 6);

  if (r.totalImbalance === 0) {
    expect(totalBet).toBeCloseTo(0, 6); // A4
    expect(totalRounded).toBeCloseTo(totalBase, 6); // A5
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
      roundingUnit: 0,
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
  it('B1: 총무가 지정되면 잔돈을 총무가 흡수하고 합계가 보존된다', () => {
    const ms = members('a', 'b', 'c');
    const s = mkSettlement({
      members: ms,
      gameFeePerGame: 0,
      shoeFee: 0,
      roundingUnit: 100,
      treasurerId: 'a',
      extras: [{ id: 'e1', label: '음료', amount: 10000, splitAmong: 'all' }],
    });
    const r = byId(s);
    expect(sum(r.results.map((x) => x.rounded))).toBeCloseTo(10000, 6);
    expect(r.of('a').rounded).toBeGreaterThan(r.of('b').rounded);
  });

  it('B3: 총무 미지정이면 최대 부담자가 잔돈을 흡수한다', () => {
    const s = mkSettlement({
      members: members('a', 'b', 'c'),
      gameFeePerGame: 1250,
      shoeFee: 0,
      roundingUnit: 100,
      rounds: [
        mkRound({ id: 'r1', participants: ['a', 'b', 'c'] }),
        mkRound({ id: 'r2', participants: ['a'] }),
      ],
    });
    const r = byId(s);
    // subtotal: a 2,500 / b 1,250 / c 1,250 → 합 5,000
    expect(r.of('a').subtotal).toBe(2500);
    expect(sum(r.results.map((x) => x.rounded))).toBe(5000);
    const absorber = r.results.find((x) => x.adjustment !== 0 && x.memberId === 'a');
    expect(absorber).toBeDefined();
  });

  it('B4: 내기로 이득 본 사람의 최종 금액은 음수로 유지된다', () => {
    const s = mkSettlement({
      members: members('a', 'b', 'c'),
      gameFeePerGame: 1000,
      shoeFee: 0,
      roundingUnit: 100,
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

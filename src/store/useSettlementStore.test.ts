import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettlementStore } from './useSettlementStore';
import { usePrefsStore, initialPrefs } from './usePrefsStore';
import { calculate } from '../lib/calc';

function resetAll() {
  usePrefsStore.setState({ ...initialPrefs });
  useSettlementStore.getState().resetSession();
}

function addMembers(names: string[]) {
  names.forEach((n) => useSettlementStore.getState().addMember(n));
  return useSettlementStore.getState().settlement.members;
}

describe('useSettlementStore: 액션 로직', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetAll();
  });

  it('addMember: 멤버를 추가하고 최근 이름 목록 맨 앞에 넣는다', () => {
    useSettlementStore.getState().addMember('철수');
    useSettlementStore.getState().addMember('영희');
    const { members } = useSettlementStore.getState().settlement;
    expect(members.map((m) => m.name)).toEqual(['철수', '영희']);
    expect(usePrefsStore.getState().recentMemberNames).toEqual(['영희', '철수']);
  });

  it('addRound: 첫 판은 전체 멤버 참여 / teams null / method none / ante 0으로 시작', () => {
    // 첫 판의 ante 는 항상 0에서 시작해 사용자가 그 판에서 직접 입력한다.
    const members = addMembers(['A', 'B', 'C']);
    useSettlementStore.getState().addRound();
    const round = useSettlementStore.getState().settlement.rounds[0];
    expect(round.participants.sort()).toEqual(members.map((m) => m.id).sort());
    expect(round.teams).toBeNull();
    expect(round.method).toBe('none');
    expect(round.ante).toBe(0);
    expect(round.payout).toEqual([]);
  });

  it('addRound: 직전 판의 participants/teams/method/ante/payout을 상속하고 ranking/losers는 초기화된다', () => {
    addMembers(['A', 'B', 'C']);
    useSettlementStore.getState().addRound();
    const round1 = useSettlementStore.getState().settlement.rounds[0];
    useSettlementStore.getState().setMethod(round1.id, 'pot');
    useSettlementStore.getState().setAnte(round1.id, 1000);
    useSettlementStore.getState().setPayout(round1.id, [3000, 2000]);

    useSettlementStore.getState().addRound();
    const round2 = useSettlementStore.getState().settlement.rounds[1];
    expect(round2.method).toBe('pot');
    expect(round2.ante).toBe(1000);
    expect(round2.payout).toEqual([3000, 2000]);
    expect(round2.ranking).toEqual([]);
    expect(round2.losers).toEqual([]);
  });

  it('duplicateRound: 직전 판 구성을 그대로 복제하되 새 id를 부여한다', () => {
    const members = addMembers(['A', 'B']);
    useSettlementStore.getState().addRound();
    const round1 = useSettlementStore.getState().settlement.rounds[0];
    useSettlementStore.getState().setMethod(round1.id, 'pot');
    useSettlementStore.getState().setAnte(round1.id, 1000);
    useSettlementStore.getState().setPayout(round1.id, [2000]);
    useSettlementStore.getState().tapRank(round1.id, members[0].id);
    const updatedRound1 = useSettlementStore.getState().settlement.rounds[0];

    useSettlementStore.getState().duplicateRound(round1.id);
    const rounds = useSettlementStore.getState().settlement.rounds;
    expect(rounds).toHaveLength(2);
    const copy = rounds[1];
    expect(copy.id).not.toBe(round1.id);
    expect(copy.method).toBe('pot');
    expect(copy.ante).toBe(1000);
    expect(copy.payout).toEqual([2000]);
    expect(copy.ranking).toEqual(updatedRound1.ranking);
    expect(copy.ranking).toEqual([[members[0].id]]);
  });

  it('tapRank: 개인전은 탭 순서대로 등수가 매겨진다', () => {
    const [a, b, c] = addMembers(['A', 'B', 'C']);
    useSettlementStore.getState().addRound();
    const roundId = useSettlementStore.getState().settlement.rounds[0].id;

    useSettlementStore.getState().tapRank(roundId, b.id);
    useSettlementStore.getState().tapRank(roundId, a.id);
    let round = useSettlementStore.getState().settlement.rounds[0];
    expect(round.ranking).toEqual([[b.id], [a.id]]);

    void c;
  });

  it('tapRank: 이미 랭크된 그룹을 재탭하면 제거되고 뒤 등수가 한 칸씩 당겨진다', () => {
    const [a, b, c] = addMembers(['A', 'B', 'C']);
    useSettlementStore.getState().addRound();
    const roundId = useSettlementStore.getState().settlement.rounds[0].id;

    useSettlementStore.getState().tapRank(roundId, a.id); // 1등: A
    useSettlementStore.getState().tapRank(roundId, b.id); // 2등: B
    useSettlementStore.getState().tapRank(roundId, c.id); // 3등: C
    useSettlementStore.getState().tapRank(roundId, a.id); // A 재탭 -> 해제

    const round = useSettlementStore.getState().settlement.rounds[0];
    // A가 빠지고 B, C가 한 칸씩 당겨져 1등 B, 2등 C가 된다
    expect(round.ranking).toEqual([[b.id], [c.id]]);
  });

  it('tapRank: 팀전은 team index를 groupKey로 사용해 팀 전체가 한 그룹으로 랭크된다', () => {
    const [a, b, c, d] = addMembers(['A', 'B', 'C', 'D']);
    useSettlementStore.getState().addRound();
    const roundId = useSettlementStore.getState().settlement.rounds[0].id;
    useSettlementStore.getState().setTeams(roundId, [
      [a.id, b.id],
      [c.id, d.id],
    ]);

    useSettlementStore.getState().tapRank(roundId, 1); // 2번 팀(C,D) 먼저 탭
    useSettlementStore.getState().tapRank(roundId, 0); // 0번 팀(A,B)
    let round = useSettlementStore.getState().settlement.rounds[0];
    expect(round.ranking).toEqual([
      [c.id, d.id],
      [a.id, b.id],
    ]);

    // 재탭 해제도 팀 단위로 동작
    useSettlementStore.getState().tapRank(roundId, 1); // 0번 팀 (C,D) 재탭 -> 해제
    round = useSettlementStore.getState().settlement.rounds[0];
    expect(round.ranking).toEqual([[a.id, b.id]]);
  });

  it('toggleLoser: 개인전은 해당 멤버만 토글된다', () => {
    const [a, b] = addMembers(['A', 'B']);
    useSettlementStore.getState().addRound();
    const roundId = useSettlementStore.getState().settlement.rounds[0].id;

    useSettlementStore.getState().toggleLoser(roundId, a.id);
    expect(useSettlementStore.getState().settlement.rounds[0].losers).toEqual([a.id]);

    useSettlementStore.getState().toggleLoser(roundId, a.id);
    expect(useSettlementStore.getState().settlement.rounds[0].losers).toEqual([]);

    void b;
  });

  it('toggleLoser: 팀전은 그 멤버가 속한 팀 전원이 한꺼번에 토글된다', () => {
    const [a, b, c, d] = addMembers(['A', 'B', 'C', 'D']);
    useSettlementStore.getState().addRound();
    const roundId = useSettlementStore.getState().settlement.rounds[0].id;
    useSettlementStore.getState().setTeams(roundId, [
      [a.id, b.id],
      [c.id, d.id],
    ]);

    useSettlementStore.getState().toggleLoser(roundId, a.id);
    let losers = useSettlementStore.getState().settlement.rounds[0].losers;
    expect(new Set(losers)).toEqual(new Set([a.id, b.id]));

    useSettlementStore.getState().toggleLoser(roundId, b.id); // 같은 팀 -> 전원 해제
    losers = useSettlementStore.getState().settlement.rounds[0].losers;
    expect(losers).toEqual([]);

    void c;
    void d;
  });

  it('setTeams: ranking이 채워진 라운드에 setTeams를 호출하면 ranking이 비워진다', () => {
    const [a, b, c, d] = addMembers(['A', 'B', 'C', 'D']);
    useSettlementStore.getState().addRound();
    const roundId = useSettlementStore.getState().settlement.rounds[0].id;
    useSettlementStore.getState().setTeams(roundId, [
      [a.id, b.id],
      [c.id, d.id],
    ]);
    useSettlementStore.getState().setMethod(roundId, 'pot');
    useSettlementStore.getState().tapRank(roundId, 0);
    expect(useSettlementStore.getState().settlement.rounds[0].ranking).toEqual([[a.id, b.id]]);

    // 팀을 다시 편성(개인전으로 전환)하면 옛 팀 기준 순위는 의미를 잃으므로 비워져야 한다
    useSettlementStore.getState().setTeams(roundId, null);
    expect(useSettlementStore.getState().settlement.rounds[0].ranking).toEqual([]);
  });

  it('setTeams: losers가 채워진 라운드에 setTeams를 호출하면 losers가 비워진다', () => {
    const [a, b, c, d] = addMembers(['A', 'B', 'C', 'D']);
    useSettlementStore.getState().addRound();
    const roundId = useSettlementStore.getState().settlement.rounds[0].id;
    useSettlementStore.getState().setTeams(roundId, [
      [a.id, b.id],
      [c.id, d.id],
    ]);
    useSettlementStore.getState().setMethod(roundId, 'transfer');
    useSettlementStore.getState().toggleLoser(roundId, a.id);
    expect(new Set(useSettlementStore.getState().settlement.rounds[0].losers)).toEqual(
      new Set([a.id, b.id])
    );

    // 팀 재편성 -> 옛 팀으로 매긴 승패도 함께 비워져야 한다. 그렇지 않으면 화면엔 아무도
    // 진 쪽으로 안 보이는데 계산은 옛 losers에게 계속 돈을 물리는 불일치가 생긴다.
    useSettlementStore.getState().setTeams(roundId, [
      [a.id, c.id],
      [b.id, d.id],
    ]);
    expect(useSettlementStore.getState().settlement.rounds[0].losers).toEqual([]);
  });

  it('버그 재현: 팀전에서 개인전으로 전환 후 tapRank해도 같은 멤버가 두 그룹에 동시에 들어가지 않는다', () => {
    // 재현 시나리오: 4명, 게임비 4,000, ante 1,000
    // 1) 2팀 편성 -> 2) 판돈분배, 1팀 탭(1등) -> 3) 개인전으로 전환 -> 4) m1 탭
    const [m1, m2, m3, m4] = addMembers(['m1', 'm2', 'm3', 'm4']);
    useSettlementStore.getState().setFees({ gameFeePerGame: 4000 });
    useSettlementStore.getState().addRound();
    const roundId = useSettlementStore.getState().settlement.rounds[0].id;

    useSettlementStore.getState().setTeams(roundId, [
      [m1.id, m2.id],
      [m3.id, m4.id],
    ]);
    useSettlementStore.getState().setMethod(roundId, 'pot');
    useSettlementStore.getState().setAnte(roundId, 1000);
    useSettlementStore.getState().tapRank(roundId, 0); // 팀 기준 1등: [m1,m2]

    useSettlementStore.getState().setTeams(roundId, null); // 개인전으로 전환 -> ranking 초기화됨
    expect(useSettlementStore.getState().settlement.rounds[0].ranking).toEqual([]);

    useSettlementStore.getState().tapRank(roundId, m1.id); // 1등: m1
    useSettlementStore.getState().tapRank(roundId, m2.id); // 2등: m2

    const finalRanking = useSettlementStore.getState().settlement.rounds[0].ranking;
    const allIds = finalRanking.flat();
    // 같은 멤버가 두 그룹에 동시에 들어가는지(중복) 확인
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(finalRanking).toEqual([[m1.id], [m2.id]]);

    useSettlementStore.getState().setPayout(roundId, [3000, 1000]);

    // Σ betDelta === 0 유지 확인 (calc.ts 교차 검증)
    const settlement = useSettlementStore.getState().settlement;
    const { breakdowns, totalImbalance } = calculate(settlement);
    const sumDelta = Object.values(breakdowns[0].delta).reduce((sum, v) => sum + v, 0);
    expect(sumDelta).toBe(0);
    expect(totalImbalance).toBe(0);

    // 실제 결제 총액도 게임비 기준(4명 x 4,000원 = 16,000원)과 일치해야 한다
    const { results } = calculate(settlement);
    const total = results.reduce((sum, r) => sum + r.subtotal, 0);
    expect(total).toBe(16000);
  });

  it('removeMember: 모든 판의 participants/teams/losers/ranking, shoeRenters, extras에서 댕글링 참조 없이 제거된다', () => {
    const [a, b, c, d] = addMembers(['A', 'B', 'C', 'D']);

    // round1: 팀전 pot, A만 속한 solo team이 있어 팀 삭제 케이스도 검증
    useSettlementStore.getState().addRound();
    const round1Id = useSettlementStore.getState().settlement.rounds[0].id;
    useSettlementStore.getState().setTeams(round1Id, [[a.id], [b.id, c.id]]);
    useSettlementStore.getState().tapRank(round1Id, 0); // [[A]]
    useSettlementStore.getState().tapRank(round1Id, 1); // [[A],[B,C]]

    // round2: 개인전 transfer, A/C 패
    useSettlementStore.getState().addRound();
    const round2Id = useSettlementStore.getState().settlement.rounds[1].id;
    useSettlementStore.getState().setTeams(round2Id, null);
    useSettlementStore.getState().toggleLoser(round2Id, a.id);
    useSettlementStore.getState().toggleLoser(round2Id, c.id);

    useSettlementStore.getState().toggleShoeRenter(a.id);
    useSettlementStore.getState().toggleShoeRenter(b.id);
    // 사람마다 다른 금액을 넣어야 "A 키만 사라졌는지"를 값으로도 확인할 수 있다
    useSettlementStore
      .getState()
      .addExtra({ label: '음료', amounts: { [a.id]: 2000, [b.id]: 2500, [c.id]: 1500 } });

    useSettlementStore.getState().removeMember(a.id);

    const s = useSettlementStore.getState().settlement;
    expect(s.members.map((m) => m.id)).toEqual([b.id, c.id, d.id]);

    const round1 = s.rounds[0];
    expect(round1.participants).not.toContain(a.id);
    // A만 있던 solo team은 통째로 사라진다
    expect(round1.teams).toEqual([[b.id, c.id]]);
    // ranking 의 [A] 그룹은 비어 사라지고, [B,C] 그룹은 그대로 남는다
    expect(round1.ranking).toEqual([[b.id, c.id]]);

    const round2 = s.rounds[1];
    expect(round2.losers).toEqual([c.id]);
    expect(round2.participants).not.toContain(a.id);

    expect(s.shoeRenters).toEqual([b.id]);
    // 삭제된 멤버의 몫은 키째 사라지고, 남은 사람의 금액은 그대로여야 한다
    expect(s.extras[0].amounts).toEqual({ [b.id]: 2500, [c.id]: 1500 });
    expect(a.id in s.extras[0].amounts).toBe(false);
  });

  it('resetSession: 세션(멤버/판)은 초기화되지만 prefs와 최근 멤버 이름은 유지된다', () => {
    usePrefsStore.getState().setFees({ gameFeePerGame: 4000, shoeFee: 2000 });
    addMembers(['A', 'B']);
    useSettlementStore.getState().addRound();

    useSettlementStore.getState().resetSession();

    const s = useSettlementStore.getState().settlement;
    expect(s.members).toEqual([]);
    expect(s.rounds).toEqual([]);
    // 새 세션은 prefs의 요금을 그대로 이어받는다
    expect(s.gameFeePerGame).toBe(4000);
    expect(s.shoeFee).toBe(2000);

    expect(usePrefsStore.getState().gameFeePerGame).toBe(4000);
    expect(usePrefsStore.getState().recentMemberNames).toEqual(['B', 'A']);
  });

  it('setFees: 세션의 요금 필드와 prefs를 동시에 갱신한다', () => {
    useSettlementStore.getState().setFees({ gameFeePerGame: 5000, shoeFee: 1500 });
    expect(useSettlementStore.getState().settlement.gameFeePerGame).toBe(5000);
    expect(useSettlementStore.getState().settlement.shoeFee).toBe(1500);
    expect(usePrefsStore.getState().gameFeePerGame).toBe(5000);
    expect(usePrefsStore.getState().shoeFee).toBe(1500);
  });

  it('addRound: method가 none이어도 직전 판을 그대로 상속한다', () => {
    // 상속은 method 값과 무관하게 언제나 일어난다.
    const members = addMembers(['A', 'B']);
    useSettlementStore.getState().addRound();
    const round1Id = useSettlementStore.getState().settlement.rounds[0].id;
    useSettlementStore.getState().setMethod(round1Id, 'none');
    useSettlementStore.getState().setAnte(round1Id, 1500);
    useSettlementStore.getState().setPayout(round1Id, [4500]);

    useSettlementStore.getState().addRound();
    const round2 = useSettlementStore.getState().settlement.rounds[1];
    expect(round2.method).toBe('none');
    // 기본값(0 / [])과 다른 값을 넣었으므로 이 두 줄이 상속 여부를 실제로 판별한다
    expect(round2.ante).toBe(1500);
    expect(round2.payout).toEqual([4500]);
    expect(round2.participants.sort()).toEqual(members.map((m) => m.id).sort());
  });

  it('addExtra: 사람별 금액을 정수로 정규화해 저장한다', () => {
    const [a, b] = addMembers(['A', 'B']);
    useSettlementStore
      .getState()
      .addExtra({ label: '음료', amounts: { [a.id]: 2000.4, [b.id]: 2500 } });

    const extra = useSettlementStore.getState().settlement.extras[0];
    expect(extra.id).toBeTruthy();
    expect(extra.amounts).toEqual({ [a.id]: 2000, [b.id]: 2500 });
  });

  it('setExtraAmounts: 소수는 정수로, 0 이하·NaN·Infinity는 키째 사라진다', () => {
    const [a, b, c] = addMembers(['A', 'B', 'C']);
    useSettlementStore.getState().addExtra({ label: '음료', amounts: { [a.id]: 3000 } });
    const extraId = useSettlementStore.getState().settlement.extras[0].id;

    useSettlementStore.getState().setExtraAmounts(extraId, {
      [a.id]: 2000.6, // 반올림 -> 2001
      [b.id]: 0, // 0원인 사람은 저장하지 않는다
      [c.id]: -500, // 음수도 마찬가지
      ghost1: Number.NaN,
      ghost2: Number.POSITIVE_INFINITY,
    });

    const extra = useSettlementStore.getState().settlement.extras[0];
    expect(extra.amounts).toEqual({ [a.id]: 2001 });
    expect(extra.label).toBe('음료'); // label은 건드리지 않는다
  });

  it('setExtraAmounts: 맵을 통째로 교체하므로 이전 키는 남지 않는다', () => {
    const [a, b] = addMembers(['A', 'B']);
    useSettlementStore
      .getState()
      .addExtra({ label: '음료', amounts: { [a.id]: 2000, [b.id]: 2000 } });
    const extraId = useSettlementStore.getState().settlement.extras[0].id;

    useSettlementStore.getState().setExtraAmounts(extraId, { [b.id]: 3000 });
    expect(useSettlementStore.getState().settlement.extras[0].amounts).toEqual({ [b.id]: 3000 });
  });

  it('setExtraAmounts: 다른 항목은 건드리지 않는다', () => {
    const [a] = addMembers(['A']);
    useSettlementStore.getState().addExtra({ label: '음료', amounts: { [a.id]: 2000 } });
    useSettlementStore.getState().addExtra({ label: '간식', amounts: { [a.id]: 5000 } });
    const [first, second] = useSettlementStore.getState().settlement.extras;

    useSettlementStore.getState().setExtraAmounts(first.id, { [a.id]: 1000 });

    const extras = useSettlementStore.getState().settlement.extras;
    expect(extras[0].amounts).toEqual({ [a.id]: 1000 });
    expect(extras[1].amounts).toEqual({ [a.id]: 5000 });
    expect(extras[1].id).toBe(second.id);
  });
});

describe('영속성 — localStorage 라운드트립', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it('요금 프리셋 입력 후 새로고침해도 값이 복원된다', async () => {
    {
      const { usePrefsStore: prefs } = await import('./usePrefsStore');
      prefs.getState().setFees({ gameFeePerGame: 4000, shoeFee: 2000 });
    }

    vi.resetModules();

    const { usePrefsStore: prefsAfterReload } = await import('./usePrefsStore');
    const p = prefsAfterReload.getState();
    expect(p.gameFeePerGame).toBe(4000);
    expect(p.shoeFee).toBe(2000);
  });

  // 진행 중인 정산은 저장하지 않는다. 새로고침하면 빈 화면에서 시작하고,
  // 게임 단가·신발비·최근 멤버 이름만 prefs 가 이어받는다.
  // 세션 저장을 없앤 뒤 실제로 났던 버그: 정산은 비워지는데 요금까지 0으로 시작했다.
  // 프리셋은 남기기로 한 값이므로 첫 화면부터 채워져 있어야 한다.
  it('새로고침해도 저장된 게임 단가·신발비가 첫 화면에 들어온다', async () => {
    {
      const { usePrefsStore: prefs } = await import('./usePrefsStore');
      prefs.getState().setFees({ gameFeePerGame: 4500, shoeFee: 2000 });
    }

    vi.resetModules();

    const { useSettlementStore: reloaded } = await import('./useSettlementStore');
    const s = reloaded.getState().settlement;
    expect(s.gameFeePerGame).toBe(4500);
    expect(s.shoeFee).toBe(2000);
    // 정산 자체는 여전히 비어 있다
    expect(s.members).toEqual([]);
    expect(s.rounds).toEqual([]);
  });

  it('진행 중인 정산은 새로고침하면 남지 않는다', async () => {
    {
      const { useSettlementStore: store } = await import('./useSettlementStore');
      store.getState().addMember('철수');
      store.getState().addRound();
      expect(store.getState().settlement.members).toHaveLength(1);
      expect(store.getState().settlement.rounds).toHaveLength(1);
    }

    vi.resetModules();

    const { useSettlementStore: reloaded } = await import('./useSettlementStore');
    const s = reloaded.getState().settlement;
    expect(s.members).toEqual([]);
    expect(s.rounds).toEqual([]);
    expect(s.extras).toEqual([]);
  });

  // 예전 버전이 저장해둔 세션 키에는 멤버 실명과 금액이 통째로 들어 있다.
  // 이제 읽지 않는 값이라도 남겨두면 개인정보가 브라우저에 계속 머문다.
  it('예전 버전이 남긴 세션 저장값을 지운다', async () => {
    window.localStorage.setItem(
      'allcover:session:v1',
      JSON.stringify({ state: { settlement: { members: [{ id: 'm1', name: '철수' }] } }, version: 3 })
    );

    await import('./useSettlementStore');

    expect(window.localStorage.getItem('allcover:session:v1')).toBeNull();
  });

  it('정산 세션은 localStorage 에 키를 만들지 않는다', async () => {
    const { useSettlementStore: store } = await import('./useSettlementStore');
    store.getState().addMember('철수');
    store.getState().addRound();

    const keys = Object.keys(window.localStorage);
    expect(keys).not.toContain('allcover:session:v1');
    expect(keys.filter((k) => k.startsWith('allcover:session'))).toEqual([]);
  });

  it('prefs v1 -> v3: roundingUnit·defaultAnte가 사라지고 요금/최근 이름은 보존된다', async () => {
    window.localStorage.setItem(
      'allcover:prefs:v1',
      JSON.stringify({
        state: {
          gameFeePerGame: 4000,
          shoeFee: 2000,
          defaultAnte: 1000, // v1 전용 필드
          roundingUnit: 100, // v1 전용 필드
          recentMemberNames: ['영희', '철수'],
        },
        version: 1,
      })
    );

    const { usePrefsStore: reloaded } = await import('./usePrefsStore');
    const p = reloaded.getState();
    expect(p.gameFeePerGame).toBe(4000);
    expect(p.shoeFee).toBe(2000);
    expect(p.recentMemberNames).toEqual(['영희', '철수']);
    expect('mode' in p).toBe(false); // v2가 넣었다가 v3가 지운 필드
    expect('roundingUnit' in p).toBe(false);
    expect('defaultAnte' in p).toBe(false);

    const backupKey = Object.keys(window.localStorage).find((k) => k.startsWith('allcover:corrupt:'));
    expect(backupKey).toBeUndefined();
  });

  it('prefs v2 -> v3: mode만 사라지고 요금/최근 이름은 보존된다', async () => {
    window.localStorage.setItem(
      'allcover:prefs:v1',
      JSON.stringify({
        state: {
          // 기본값(0)과 다른 값이어야 "보존됐다"가 의미를 갖는다
          gameFeePerGame: 5000,
          shoeFee: 1500,
          mode: 'normal', // v3에서 삭제되어야 한다
          recentMemberNames: ['민수', '영희'],
        },
        version: 2,
      })
    );

    const { usePrefsStore: reloaded } = await import('./usePrefsStore');
    const p = reloaded.getState();
    expect(p.gameFeePerGame).toBe(5000);
    expect(p.shoeFee).toBe(1500);
    expect(p.recentMemberNames).toEqual(['민수', '영희']);
    expect('mode' in p).toBe(false);

    const backupKey = Object.keys(window.localStorage).find((k) => k.startsWith('allcover:corrupt:'));
    expect(backupKey).toBeUndefined();
  });


  it('prefs도 버전 일치 + 모양이 깨진 값이면 백업 후 초기화된다', async () => {
    window.localStorage.setItem(
      'allcover:prefs:v1',
      JSON.stringify({ state: { gameFeePerGame: '오억원', recentMemberNames: null }, version: 3 })
    );

    const { usePrefsStore: reloaded } = await import('./usePrefsStore');
    expect(reloaded.getState().gameFeePerGame).toBe(0);
    expect(reloaded.getState().recentMemberNames).toEqual([]);

    const backupKey = Object.keys(window.localStorage).find((k) => k.startsWith('allcover:corrupt:'));
    expect(backupKey).toBeDefined();
  });

  it('localStorage 접근이 throw하는 환경에서도 스토어 생성/액션이 크래시하지 않는다', async () => {
    const setSpy = vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    const getSpy = vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });

    const { useSettlementStore: reloaded } = await import('./useSettlementStore');
    expect(() => reloaded.getState().addMember('철수')).not.toThrow();
    expect(reloaded.getState().settlement.members.map((m) => m.name)).toEqual(['철수']);

    const { isPersistenceAvailable } = await import('../lib/storage');
    expect(isPersistenceAvailable()).toBe(false);

    getSpy.mockRestore();
    setSpy.mockRestore();
  });
});

describe('duplicateRound — 판을 통째로 복제한다', () => {
  beforeEach(() => {
    usePrefsStore.setState({ ...initialPrefs });
    useSettlementStore.getState().resetSession();
  });

  it('method가 none인 판도 transferSource/transferAmount까지 그대로 복제된다', () => {
    // 복제는 method 값과 무관하게 언제나 원본 그대로다.
    const s = useSettlementStore.getState();
    s.addMember('a');
    s.addMember('b');

    s.addRound();
    const r1 = useSettlementStore.getState().settlement.rounds[0]!.id;
    s.setMethod(r1, 'none');
    s.setAnte(r1, 1000);
    // 기본값(gameFee / 0)과 다르게 만들어야 복제 여부가 값으로 드러난다
    s.setTransfer(r1, { transferSource: 'custom', transferAmount: 5000 });
    const original = useSettlementStore.getState().settlement.rounds[0]!;

    s.duplicateRound(r1);

    const copy = useSettlementStore.getState().settlement.rounds[1]!;
    expect(copy.id).not.toBe(r1);
    expect(copy.method).toBe('none');
    expect(copy.ante).toBe(1000);
    expect(copy.transferSource).toBe('custom');
    expect(copy.transferAmount).toBe(5000);
    expect(copy.participants).toEqual(original.participants);
    expect(copy.teams).toEqual(original.teams);
  });

  it('내기 판을 복제하면 내기 필드를 그대로 가져오고 배열은 원본과 공유하지 않는다', () => {
    const s = useSettlementStore.getState();
    s.addMember('a');
    s.addMember('b');
    const memberId = useSettlementStore.getState().settlement.members[0]!.id;

    s.addRound();
    const r1 = useSettlementStore.getState().settlement.rounds[0]!.id;
    s.setMethod(r1, 'pot');
    s.setAnte(r1, 1000);
    s.tapRank(r1, memberId);
    s.setPayout(r1, [4000]);

    s.duplicateRound(r1);
    const copy = useSettlementStore.getState().settlement.rounds[1]!;
    expect(copy.method).toBe('pot');
    expect(copy.ante).toBe(1000);
    expect(copy.payout).toEqual([4000]);
    expect(copy.ranking).toEqual([[memberId]]);

    // 복제본의 순위를 바꿔도 원본이 따라 움직이면 안 된다 (얕은 복사 회귀 방어)
    s.tapRank(copy.id, memberId);
    expect(useSettlementStore.getState().settlement.rounds[1]!.ranking).toEqual([]);
    expect(useSettlementStore.getState().settlement.rounds[0]!.ranking).toEqual([[memberId]]);
  });
});

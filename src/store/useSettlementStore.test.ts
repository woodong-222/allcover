import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettlementStore } from './useSettlementStore';
import { usePrefsStore, initialPrefs } from './usePrefsStore';

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

  it('addRound: 첫 판은 전체 멤버 참여 / teams null / method none / defaultAnte 사용', () => {
    useSettlementStore.getState().setFees({ defaultAnte: 500 });
    const members = addMembers(['A', 'B', 'C']);
    useSettlementStore.getState().addRound();
    const round = useSettlementStore.getState().settlement.rounds[0];
    expect(round.participants.sort()).toEqual(members.map((m) => m.id).sort());
    expect(round.teams).toBeNull();
    expect(round.method).toBe('none');
    expect(round.ante).toBe(500);
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

  it('removeMember: 모든 판의 participants/teams/losers/ranking, shoeRenters, extras, treasurerId에서 댕글링 참조 없이 제거된다', () => {
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
    useSettlementStore.getState().addExtra({ label: '음료', amount: 3000, splitAmong: [a.id, b.id, c.id] });
    useSettlementStore.getState().setTreasurer(a.id);

    useSettlementStore.getState().removeMember(a.id);

    const s = useSettlementStore.getState().settlement;
    expect(s.members.map((m) => m.id)).toEqual([b.id, c.id, d.id]);

    const round1 = s.rounds[0];
    expect(round1.participants).not.toContain(a.id);
    // A만 있던 solo team은 통째로 사라진다
    expect(round1.teams).toEqual([[b.id, c.id]]);
    // ranking의 [A] 그룹은 비어 사라지고, [A,B... wait no B,C] 그룹은 A가 없었으므로 그대로
    expect(round1.ranking).toEqual([[b.id, c.id]]);

    const round2 = s.rounds[1];
    expect(round2.losers).toEqual([c.id]);
    expect(round2.participants).not.toContain(a.id);

    expect(s.shoeRenters).toEqual([b.id]);
    expect(s.extras[0].splitAmong).toEqual([b.id, c.id]);
    expect(s.treasurerId).toBeUndefined();
  });

  it('resetSession: 세션(멤버/판)은 초기화되지만 prefs와 최근 멤버 이름은 유지된다 (C5)', () => {
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
    useSettlementStore.getState().setFees({ gameFeePerGame: 5000, roundingUnit: 10 });
    expect(useSettlementStore.getState().settlement.gameFeePerGame).toBe(5000);
    expect(useSettlementStore.getState().settlement.roundingUnit).toBe(10);
    expect(usePrefsStore.getState().gameFeePerGame).toBe(5000);
    expect(usePrefsStore.getState().roundingUnit).toBe(10);
  });
});

describe('영속성 (C1~C4): localStorage 라운드트립', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it('C1: 요금 프리셋 입력 후 새로고침해도 값이 복원된다', async () => {
    {
      const { usePrefsStore: prefs } = await import('./usePrefsStore');
      prefs.getState().setFees({ gameFeePerGame: 4000, shoeFee: 2000, defaultAnte: 1000, roundingUnit: 100 });
    }

    vi.resetModules();

    const { usePrefsStore: prefsAfterReload } = await import('./usePrefsStore');
    const p = prefsAfterReload.getState();
    expect(p.gameFeePerGame).toBe(4000);
    expect(p.shoeFee).toBe(2000);
    expect(p.defaultAnte).toBe(1000);
    expect(p.roundingUnit).toBe(100);
  });

  it('C2: 판 3개를 입력한 세션이 탭을 닫았다 열어도 전체 복원된다', async () => {
    let snapshot: unknown;
    {
      const { useSettlementStore: store } = await import('./useSettlementStore');
      store.getState().addMember('철수');
      store.getState().addMember('영희');
      store.getState().addRound();
      store.getState().addRound();
      store.getState().addRound();
      const roundId = store.getState().settlement.rounds[0].id;
      store.getState().setMethod(roundId, 'pot');
      store.getState().setAnte(roundId, 1000);
      snapshot = store.getState().settlement;
    }

    vi.resetModules();

    const { useSettlementStore: reloaded } = await import('./useSettlementStore');
    expect(reloaded.getState().settlement).toEqual(snapshot);
  });

  it('C3: 파싱 불가능한 저장값은 백업 후 초기 상태로 복구되며 크래시하지 않는다', async () => {
    window.localStorage.setItem('allcover:session:v1', '{ 이건 유효한 JSON이 아님 ]');

    const { useSettlementStore: reloaded } = await import('./useSettlementStore');
    const s = reloaded.getState().settlement;
    expect(s.members).toEqual([]);
    expect(s.rounds).toEqual([]);

    const backupKey = Object.keys(window.localStorage).find((k) => k.startsWith('allcover:corrupt:'));
    expect(backupKey).toBeDefined();
    expect(window.localStorage.getItem(backupKey!)).toContain('유효한 JSON이 아님');
  });

  it('C3: 알 수 없는 버전의 저장값은 백업 후 초기 상태로 복구되며 크래시하지 않는다', async () => {
    window.localStorage.setItem(
      'allcover:session:v1',
      JSON.stringify({ state: { settlement: { members: [{ id: 'x', name: '유령' }] } }, version: 999 })
    );

    const { useSettlementStore: reloaded } = await import('./useSettlementStore');
    const s = reloaded.getState().settlement;
    expect(s.members).toEqual([]);

    const backupKey = Object.keys(window.localStorage).find((k) => k.startsWith('allcover:corrupt:'));
    expect(backupKey).toBeDefined();
  });

  it('C4: localStorage 접근이 throw하는 환경에서도 스토어 생성/액션이 크래시하지 않는다', async () => {
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

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
    // defaultAnte는 Settlement/Prefs 양쪽에서 완전히 삭제됐다 (2026-08-21) —
    // 첫 판의 ante는 항상 0에서 시작해 사용자가 그 판에서 직접 입력한다.
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

  it('setTeams: ranking이 채워진 라운드에 setTeams를 호출하면 ranking이 비워진다 (HIGH 회귀 수정)', () => {
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

  it('setTeams: losers가 채워진 라운드에 setTeams를 호출하면 losers가 비워진다 (HIGH 회귀 수정)', () => {
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
    // reviewer가 보고한 재현 시나리오 그대로: 4명, 게임비 4,000, ante 1,000
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

    useSettlementStore.getState().setTeams(roundId, null); // 개인전으로 전환 -> setTeams 수정으로 ranking 초기화됨
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
    useSettlementStore.getState().addExtra({ label: '음료', amount: 3000, splitAmong: [a.id, b.id, c.id] });

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
    useSettlementStore.getState().setFees({ gameFeePerGame: 5000, shoeFee: 1500 });
    expect(useSettlementStore.getState().settlement.gameFeePerGame).toBe(5000);
    expect(useSettlementStore.getState().settlement.shoeFee).toBe(1500);
    expect(usePrefsStore.getState().gameFeePerGame).toBe(5000);
    expect(usePrefsStore.getState().shoeFee).toBe(1500);
  });

  it('setMode: 세션의 mode와 prefs를 동시에 갱신하고, resetSession 후 새 세션도 그 모드를 이어받는다', () => {
    expect(useSettlementStore.getState().settlement.mode).toBe('bet');
    useSettlementStore.getState().setMode('normal');
    expect(useSettlementStore.getState().settlement.mode).toBe('normal');
    expect(usePrefsStore.getState().mode).toBe('normal');

    useSettlementStore.getState().resetSession();
    expect(useSettlementStore.getState().settlement.mode).toBe('normal');
  });

  it('addRound (G2): mode가 normal이면 직전 판이 있어도 method/ante/payout을 상속하지 않는다', () => {
    const members = addMembers(['A', 'B']);
    useSettlementStore.getState().addRound();
    const round1Id = useSettlementStore.getState().settlement.rounds[0].id;
    useSettlementStore.getState().setMethod(round1Id, 'pot');
    useSettlementStore.getState().setAnte(round1Id, 1000);
    useSettlementStore.getState().setPayout(round1Id, [2000]);

    useSettlementStore.getState().setMode('normal');
    useSettlementStore.getState().addRound();
    const round2 = useSettlementStore.getState().settlement.rounds[1];
    expect(round2.method).toBe('none');
    expect(round2.ante).toBe(0);
    expect(round2.payout).toEqual([]);
    // participants/teams는 모드와 무관하게 계속 상속된다
    expect(round2.participants.sort()).toEqual(members.map((m) => m.id).sort());

    // bet으로 돌아가도 정산 모드에서 만든 판에 유령 판돈이 생기면 안 된다
    useSettlementStore.getState().setMode('bet');
    const round2AfterSwitch = useSettlementStore.getState().settlement.rounds[1];
    expect(round2AfterSwitch.method).toBe('none');
    expect(round2AfterSwitch.ante).toBe(0);
    expect(round2AfterSwitch.payout).toEqual([]);
    // 기존 판(round1)의 내기 입력은 모드 전환에 전혀 영향받지 않는다 (비파괴적 전환)
    const round1AfterSwitch = useSettlementStore.getState().settlement.rounds[0];
    expect(round1AfterSwitch.method).toBe('pot');
    expect(round1AfterSwitch.ante).toBe(1000);
    expect(round1AfterSwitch.payout).toEqual([2000]);
  });

  it('setMode 왕복: 라운드의 ranking/payout/losers/teams가 전환 전과 동일하다 (G2)', () => {
    const [a, b, c, d] = addMembers(['A', 'B', 'C', 'D']);
    useSettlementStore.getState().addRound();
    const roundId = useSettlementStore.getState().settlement.rounds[0].id;
    useSettlementStore.getState().setTeams(roundId, [
      [a.id, b.id],
      [c.id, d.id],
    ]);
    useSettlementStore.getState().setMethod(roundId, 'pot');
    useSettlementStore.getState().setAnte(roundId, 1000);
    useSettlementStore.getState().setPayout(roundId, [3000, 1000]);
    useSettlementStore.getState().tapRank(roundId, 0);
    const before = useSettlementStore.getState().settlement.rounds[0];

    useSettlementStore.getState().setMode('normal');
    useSettlementStore.getState().setMode('bet');
    const after = useSettlementStore.getState().settlement.rounds[0];

    expect(after.ranking).toEqual(before.ranking);
    expect(after.payout).toEqual(before.payout);
    expect(after.losers).toEqual(before.losers);
    expect(after.teams).toEqual(before.teams);
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
      prefs.getState().setFees({ gameFeePerGame: 4000, shoeFee: 2000 });
    }

    vi.resetModules();

    const { usePrefsStore: prefsAfterReload } = await import('./usePrefsStore');
    const p = prefsAfterReload.getState();
    expect(p.gameFeePerGame).toBe(4000);
    expect(p.shoeFee).toBe(2000);
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

  it('G7: v1 스키마 저장값(mode 없음, roundingUnit 있음)이 members/rounds/extras 보존하며 v2로 마이그레이션된다', async () => {
    const v1Settlement = {
      version: 1,
      id: 'sett-1',
      date: '2026-08-21T00:00:00.000Z',
      members: [
        { id: 'm1', name: '철수' },
        { id: 'm2', name: '영희' },
      ],
      gameFeePerGame: 4000,
      shoeFee: 2000,
      shoeRenters: ['m1'],
      defaultAnte: 1000, // v1 전용 필드(2026-08-21 삭제). v2에서는 삭제되어야 한다
      rounds: [
        {
          id: 'r1',
          participants: ['m1', 'm2'],
          teams: null,
          method: 'pot',
          ante: 1000,
          payout: [2000],
          ranking: [['m1']],
          losers: [],
          transferSource: 'gameFee',
          transferAmount: 0,
        },
      ],
      extras: [{ id: 'e1', label: '음료', amount: 3000, splitAmong: 'all' }],
      treasurerId: 'm1', // v1 전용 필드(2026-08-21 삭제). v2에서는 삭제되어야 한다
      roundingUnit: 100, // v1 전용 필드(2026-08-21 삭제). v2에서는 삭제되어야 한다
    };
    window.localStorage.setItem(
      'allcover:session:v1',
      JSON.stringify({ state: { settlement: v1Settlement }, version: 1 })
    );

    const { useSettlementStore: reloaded } = await import('./useSettlementStore');
    const s = reloaded.getState().settlement;

    // members가 빈 배열이 되면 실패다 — 마이그레이션이 아니라 초기화가 일어난 것이다
    expect(s.members).toEqual(v1Settlement.members);
    expect(s.rounds).toEqual(v1Settlement.rounds);
    expect(s.extras).toEqual(v1Settlement.extras);
    expect(s.gameFeePerGame).toBe(4000);
    expect(s.shoeFee).toBe(2000);
    expect(s.shoeRenters).toEqual(['m1']);

    expect(s.mode).toBe('bet'); // 채워짐 (기존 동작 보존 극성)
    expect(s.version).toBe(2);
    expect('roundingUnit' in s).toBe(false); // 삭제됨
    expect('defaultAnte' in s).toBe(false); // 삭제됨 (2026-08-21, Settlement.defaultAnte 필드 자체가 없어짐)
    expect('treasurerId' in s).toBe(false); // 삭제됨 (2026-08-21, Settlement.treasurerId 필드 자체가 없어짐)

    // 이건 정상 마이그레이션이지 손상이 아니므로 손상 백업이 생기면 안 된다
    const backupKey = Object.keys(window.localStorage).find((k) => k.startsWith('allcover:corrupt:'));
    expect(backupKey).toBeUndefined();
  });

  it('G7: 버전이 1도 2도 아니면(알 수 없는 버전) CURRENT_VERSION이 2로 오른 뒤에도 여전히 백업 후 초기화된다', async () => {
    window.localStorage.setItem(
      'allcover:session:v1',
      JSON.stringify({
        state: { settlement: { members: [{ id: 'x', name: '유령' }], rounds: [], extras: [] } },
        version: 999,
      })
    );

    const { useSettlementStore: reloaded } = await import('./useSettlementStore');
    const s = reloaded.getState().settlement;
    // 알 수 없는 버전은 마이그레이션 대상이 아니다 — members가 보존되면 안 된다
    expect(s.members).toEqual([]);

    const backupKey = Object.keys(window.localStorage).find((k) => k.startsWith('allcover:corrupt:'));
    expect(backupKey).toBeDefined();
  });

  it('G7: prefs도 v1(roundingUnit·defaultAnte 있음, mode 없음)에서 요금/최근 이름 보존하며 v2로 마이그레이션된다', async () => {
    window.localStorage.setItem(
      'allcover:prefs:v1',
      JSON.stringify({
        state: {
          gameFeePerGame: 4000,
          shoeFee: 2000,
          defaultAnte: 1000, // v1 전용 필드(2026-08-21 삭제). v2에서는 삭제되어야 한다
          roundingUnit: 100, // v1 전용 필드(2026-08-21 삭제). v2에서는 삭제되어야 한다
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
    expect(p.mode).toBe('bet');
    expect('roundingUnit' in p).toBe(false);
    expect('defaultAnte' in p).toBe(false);

    const backupKey = Object.keys(window.localStorage).find((k) => k.startsWith('allcover:corrupt:'));
    expect(backupKey).toBeUndefined();
  });

  it('C3(LOW 수정): 버전은 일치하지만 state 모양이 깨진 저장값도 백업 후 초기화되며 크래시하지 않는다', async () => {
    // version이 CURRENT_VERSION과 같으면 zustand persist는 migrate를 호출하지 않고
    // state를 그대로 쓴다. settlement가 null이면 calc.ts가 렌더 중 TypeError로 죽는다.
    window.localStorage.setItem(
      'allcover:session:v1',
      JSON.stringify({ state: { settlement: null }, version: 2 })
    );

    const { useSettlementStore: reloaded } = await import('./useSettlementStore');
    expect(() => reloaded.getState()).not.toThrow();
    const s = reloaded.getState().settlement;
    expect(s.members).toEqual([]);
    expect(s.rounds).toEqual([]);

    const backupKey = Object.keys(window.localStorage).find((k) => k.startsWith('allcover:corrupt:'));
    expect(backupKey).toBeDefined();
  });

  it('C3(LOW 수정): prefs도 버전 일치 + 모양이 깨진 값이면 백업 후 초기화된다', async () => {
    window.localStorage.setItem(
      'allcover:prefs:v1',
      JSON.stringify({ state: { gameFeePerGame: '오억원', recentMemberNames: null }, version: 2 })
    );

    const { usePrefsStore: reloaded } = await import('./usePrefsStore');
    expect(reloaded.getState().gameFeePerGame).toBe(0);
    expect(reloaded.getState().recentMemberNames).toEqual([]);

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

describe('duplicateRound — 정산 모드에서는 내기 필드를 복제하지 않는다 (F4)', () => {
  beforeEach(() => {
    usePrefsStore.setState({ ...initialPrefs });
    useSettlementStore.getState().resetSession();
  });

  it('정산 모드에서 복제한 판은 내기 필드가 비어 있다', () => {
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

    // 정산 모드로 전환하면 내기 UI 는 숨겨지지만 "복제" 버튼은 남아 있다.
    // 사용자에게 그 버튼은 "같은 멤버로 한 판 더" 라는 뜻이다.
    s.setMode('normal');
    s.duplicateRound(r1);

    const copy = useSettlementStore.getState().settlement.rounds[1]!;
    expect(copy.method).toBe('none');
    expect(copy.ante).toBe(0);
    expect(copy.payout).toEqual([]);
    expect(copy.ranking).toEqual([]);
    expect(copy.losers).toEqual([]);
    // 참여자와 팀 편성은 모드와 무관하게 유용하므로 그대로 복제한다
    expect(copy.participants).toEqual(copy.participants);
    expect(copy.participants.length).toBeGreaterThan(0);

    // 원본은 그대로 남아야 한다 (비파괴)
    const original = useSettlementStore.getState().settlement.rounds[0]!;
    expect(original.method).toBe('pot');
    expect(original.payout).toEqual([4000]);
  });

  it('내기 모드에서 복제한 판은 내기 필드를 그대로 가져온다', () => {
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
  });
});

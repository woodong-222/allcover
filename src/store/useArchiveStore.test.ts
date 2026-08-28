import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useArchiveStore, autoLabel } from './useArchiveStore';
import { useSettlementStore } from './useSettlementStore';
import { usePrefsStore, initialPrefs } from './usePrefsStore';
import type { Settlement } from '../types';

function mkSettlement(patch: Partial<Settlement> = {}): Settlement {
  return {
    id: 's1',
    date: '2026-08-27T00:00:00.000Z',
    members: [{ id: 'm1', name: '철수' }],
    gameFeePerGame: 4000,
    shoeFee: 2000,
    shoeRenters: [],
    rounds: [],
    extras: [],
    ...patch,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  useArchiveStore.setState({ entries: [] });
  usePrefsStore.setState({ ...initialPrefs });
  useSettlementStore.getState().resetSession();
});

describe('autoLabel', () => {
  it('날짜·대표 이름·총액을 한 줄로 만든다', () => {
    const s = mkSettlement({
      members: [
        { id: 'm1', name: '철수' },
        { id: 'm2', name: '영희' },
        { id: 'm3', name: '민수' },
      ],
    });
    expect(autoLabel(s, 42000, new Date('2026-08-27T10:00:00'))).toBe(
      '8월 27일 · 철수 외 2명 · 42,000원'
    );
  });

  it('혼자면 "외 N명"을 붙이지 않는다', () => {
    const s = mkSettlement({ members: [{ id: 'm1', name: '철수' }] });
    expect(autoLabel(s, 8000, new Date('2026-08-27T10:00:00'))).toBe('8월 27일 · 철수 · 8,000원');
  });

  it('총액이 0이면 금액을 빼고, 멤버가 없으면 날짜만 남는다', () => {
    const s = mkSettlement({ members: [{ id: 'm1', name: '철수' }] });
    expect(autoLabel(s, 0, new Date('2026-08-27T10:00:00'))).toBe('8월 27일 · 철수');
    expect(autoLabel(mkSettlement({ members: [] }), 0, new Date('2026-08-27T10:00:00'))).toBe(
      '8월 27일'
    );
  });
});

describe('useArchiveStore', () => {
  it('save: 최근 저장한 것이 목록 맨 앞에 온다', () => {
    useArchiveStore.getState().save({ label: '첫 번째', settlement: mkSettlement() });
    useArchiveStore.getState().save({ label: '두 번째', settlement: mkSettlement() });

    const { entries } = useArchiveStore.getState();
    expect(entries.map((e) => e.label)).toEqual(['두 번째', '첫 번째']);
    expect(entries[0].id).not.toBe(entries[1].id);
  });

  /**
   * 보관본은 저장 시점의 스냅샷이다. 참조를 그대로 들고 있으면 저장한 뒤 화면에서
   * 금액을 고쳤을 때 보관함에 남아 있는 값까지 같이 바뀐다.
   */
  it('save: 저장 후 원본을 고쳐도 보관본은 그대로다', () => {
    const settlement = mkSettlement();
    useArchiveStore.getState().save({ label: '스냅샷', settlement });

    settlement.members.push({ id: 'm2', name: '나중에 추가' });
    settlement.gameFeePerGame = 9999;

    const stored = useArchiveStore.getState().entries[0].settlement;
    expect(stored.members).toHaveLength(1);
    expect(stored.gameFeePerGame).toBe(4000);
  });

  it('save: 이름이 비면 기본 이름을 붙인다', () => {
    useArchiveStore.getState().save({ label: '   ', settlement: mkSettlement() });
    expect(useArchiveStore.getState().entries[0].label).toBe('이름 없는 정산');
  });

  it('save: 상한을 넘으면 가장 오래된 것부터 밀려난다', () => {
    for (let i = 0; i < 33; i++) {
      useArchiveStore.getState().save({ label: `저장 ${i}`, settlement: mkSettlement() });
    }
    const { entries } = useArchiveStore.getState();
    expect(entries).toHaveLength(30);
    expect(entries[0].label).toBe('저장 32');
    expect(entries.some((e) => e.label === '저장 0')).toBe(false);
  });

  it('rename: 이름을 바꾸고, 빈 이름은 무시한다', () => {
    useArchiveStore.getState().save({ label: '원래 이름', settlement: mkSettlement() });
    const id = useArchiveStore.getState().entries[0].id;

    useArchiveStore.getState().rename(id, '금요모임');
    expect(useArchiveStore.getState().entries[0].label).toBe('금요모임');

    useArchiveStore.getState().rename(id, '   ');
    expect(useArchiveStore.getState().entries[0].label).toBe('금요모임');
  });

  it('remove: 지정한 항목만 지운다', () => {
    useArchiveStore.getState().save({ label: 'A', settlement: mkSettlement() });
    useArchiveStore.getState().save({ label: 'B', settlement: mkSettlement() });
    const target = useArchiveStore.getState().entries.find((e) => e.label === 'A')!;

    useArchiveStore.getState().remove(target.id);
    expect(useArchiveStore.getState().entries.map((e) => e.label)).toEqual(['B']);
  });
});

describe('loadSettlement', () => {
  it('보관본을 화면에 올리고 요금은 프리셋에도 반영한다', () => {
    const saved = mkSettlement({
      members: [
        { id: 'm1', name: '철수' },
        { id: 'm2', name: '영희' },
      ],
      gameFeePerGame: 5500,
      shoeFee: 1500,
    });

    useSettlementStore.getState().loadSettlement(saved);

    const s = useSettlementStore.getState().settlement;
    expect(s.members.map((m) => m.name)).toEqual(['철수', '영희']);
    expect(s.gameFeePerGame).toBe(5500);
    // 다음 "새 정산"이 같은 요금으로 시작하도록 프리셋도 따라간다
    expect(usePrefsStore.getState().gameFeePerGame).toBe(5500);
    expect(usePrefsStore.getState().shoeFee).toBe(1500);
  });

  /**
   * 화면에 올리는 것도 사본이어야 한다. 보관본 객체를 그대로 올려두면, 나중에 누가
   * 정산을 직접 변형하는 코드를 넣는 순간 사용자가 저장해둔 값까지 같이 망가진다.
   * 지금은 스토어가 전부 불변 업데이트라 겉으로 드러나지 않으므로 계약으로 못 박아 둔다.
   */
  it('화면에 올린 정산과 보관본이 같은 객체를 공유하지 않는다', () => {
    useArchiveStore.getState().save({ label: '보관본', settlement: mkSettlement() });
    const entry = useArchiveStore.getState().entries[0];

    useSettlementStore.getState().loadSettlement(entry.settlement);
    const live = useSettlementStore.getState().settlement;

    expect(live).not.toBe(entry.settlement);
    expect(live.members).not.toBe(entry.settlement.members);

    // 직접 변형해도 보관본은 그대로다
    live.members.push({ id: 'zzz', name: '난입' });
    live.gameFeePerGame = 9999;
    expect(entry.settlement.members).toHaveLength(1);
    expect(entry.settlement.gameFeePerGame).toBe(4000);
  });

  it('불러온 뒤 화면에서 고쳐도 보관본은 바뀌지 않는다', () => {
    useArchiveStore.getState().save({ label: '보관본', settlement: mkSettlement() });
    const entry = useArchiveStore.getState().entries[0];

    useSettlementStore.getState().loadSettlement(entry.settlement);
    useSettlementStore.getState().addMember('새 멤버');

    expect(useSettlementStore.getState().settlement.members).toHaveLength(2);
    expect(useArchiveStore.getState().entries[0].settlement.members).toHaveLength(1);
  });
});

describe('보관함 영속성', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it('저장한 정산은 새로고침해도 남는다', async () => {
    {
      const { useArchiveStore: store } = await import('./useArchiveStore');
      store.getState().save({ label: '지난주 모임', settlement: mkSettlement() });
    }

    vi.resetModules();

    const { useArchiveStore: reloaded } = await import('./useArchiveStore');
    const { entries } = reloaded.getState();
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe('지난주 모임');
    expect(entries[0].settlement.members.map((m) => m.name)).toEqual(['철수']);
  });

  it('손상된 저장값은 백업 후 빈 보관함으로 복구되며 크래시하지 않는다', async () => {
    window.localStorage.setItem('allcover:archive:v1', '{{ not json');

    const { useArchiveStore: reloaded } = await import('./useArchiveStore');
    expect(() => reloaded.getState()).not.toThrow();
    expect(reloaded.getState().entries).toEqual([]);

    const backup = Object.keys(window.localStorage).find((k) => k.startsWith('allcover:corrupt:'));
    expect(backup).toBeDefined();
  });
});

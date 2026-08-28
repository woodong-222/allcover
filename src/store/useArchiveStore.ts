/**
 * 보관함 — 사용자가 "임시 저장"을 눌러 남긴 정산들.
 *
 * 진행 중인 정산은 자동으로 저장하지 않는다. 다음에 앱을 열었을 때 지난주 판이 그대로
 * 남아 있는 쪽이 더 성가시기 때문이다. 대신 저장하고 싶을 때만 명시적으로 넣는다.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Settlement } from '../types';
import { createGuardedStorage, backupCorruptState } from './persistGuard';

const STORAGE_KEY = 'allcover:archive:v1';
const CURRENT_VERSION = 1;

/**
 * 보관 개수 상한. localStorage 는 도메인당 5MB 안팎이고 정산 하나가 수 KB 라 여유가 있지만,
 * 목록이 길어지면 찾는 것 자체가 일이 된다. 상한을 넘으면 가장 오래된 것부터 밀려난다.
 */
const MAX_ENTRIES = 30;

export type ArchiveEntry = {
  id: string;
  /** 목록에 보이는 이름. 저장할 때 자동으로 만들고 나중에 바꿀 수 있다 */
  label: string;
  /** 저장 시각 (ISO 8601) */
  savedAt: string;
  settlement: Settlement;
};

/**
 * 저장 시점의 정산으로 목록에 쓸 이름을 만든다.
 *
 * 예: `8월 27일 · 철수 외 4명 · 42,000원`
 * 멤버가 없으면 날짜만, 금액이 0이면 금액을 뺀다 — "0원" 은 알려주는 게 없다.
 */
export function autoLabel(settlement: Settlement, total: number, now = new Date()): string {
  const parts: string[] = [`${now.getMonth() + 1}월 ${now.getDate()}일`];

  const [first, ...rest] = settlement.members;
  if (first) {
    parts.push(rest.length > 0 ? `${first.name} 외 ${rest.length}명` : first.name);
  }
  if (total > 0) {
    parts.push(`${total.toLocaleString('ko-KR')}원`);
  }
  return parts.join(' · ');
}

function isValidArchiveState(state: unknown): boolean {
  if (typeof state !== 'object' || state === null) return false;
  const entries = (state as Record<string, unknown>).entries;
  if (!Array.isArray(entries)) return false;
  return entries.every((e) => {
    if (typeof e !== 'object' || e === null) return false;
    const entry = e as Record<string, unknown>;
    const s = entry.settlement;
    return (
      typeof entry.id === 'string' &&
      typeof entry.label === 'string' &&
      typeof s === 'object' &&
      s !== null &&
      Array.isArray((s as Record<string, unknown>).members) &&
      Array.isArray((s as Record<string, unknown>).rounds)
    );
  });
}

type ArchiveState = {
  /** 최근 저장한 것이 앞에 온다 */
  entries: ArchiveEntry[];
  save: (entry: Omit<ArchiveEntry, 'id' | 'savedAt'>) => void;
  rename: (id: string, label: string) => void;
  remove: (id: string) => void;
  clear: () => void;
};

export const useArchiveStore = create<ArchiveState>()(
  persist(
    (set) => ({
      entries: [],

      save: ({ label, settlement }) => {
        const entry: ArchiveEntry = {
          // crypto.randomUUID 는 안전한 컨텍스트에서만 있다. 보관함 id 는 이 목록 안에서만
          // 구분되면 되므로 시각 + 난수로 충분하다.
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          label: label.trim() || '이름 없는 정산',
          savedAt: new Date().toISOString(),
          // 저장 시점 스냅샷이다. 이후 화면에서 정산을 더 고쳐도 보관본은 그대로여야 한다.
          settlement: structuredClone(settlement),
        };
        set((state) => ({ entries: [entry, ...state.entries].slice(0, MAX_ENTRIES) }));
      },

      rename: (id, label) => {
        const trimmed = label.trim();
        if (!trimmed) return;
        set((state) => ({
          entries: state.entries.map((e) => (e.id === id ? { ...e, label: trimmed } : e)),
        }));
      },

      remove: (id) => {
        set((state) => ({ entries: state.entries.filter((e) => e.id !== id) }));
      },

      clear: () => set({ entries: [] }),
    }),
    {
      name: STORAGE_KEY,
      version: CURRENT_VERSION,
      storage: createGuardedStorage<{ entries: ArchiveEntry[] }>(isValidArchiveState),
      partialize: (state) => ({ entries: state.entries }),
      migrate: (persistedState, version) => {
        backupCorruptState(persistedState, version);
        return { entries: [] };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.error('[allcover] 보관함 복원 실패', error);
        }
      },
    }
  )
);

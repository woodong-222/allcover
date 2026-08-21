/**
 * 요금 프리셋 + 최근 멤버 이름. 정산 세션과 분리 저장한다 (C1, C5).
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §3 인수조건 C
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createGuardedStorage, backupCorruptState } from './persistGuard';

const STORAGE_KEY = 'allcover:prefs:v1';
const CURRENT_VERSION = 1;
const MAX_RECENT_NAMES = 20;

export type Prefs = {
  gameFeePerGame: number;
  shoeFee: number;
  defaultAnte: number;
  roundingUnit: 0 | 10 | 100;
  /** 최근 추가한 멤버 이름, 최신순, 최대 20개 */
  recentMemberNames: string[];
};

export const initialPrefs: Prefs = {
  gameFeePerGame: 0,
  shoeFee: 0,
  defaultAnte: 0,
  roundingUnit: 100,
  recentMemberNames: [],
};

export type PrefsFees = Pick<Prefs, 'gameFeePerGame' | 'shoeFee' | 'defaultAnte' | 'roundingUnit'>;

type PrefsState = Prefs & {
  setFees: (fees: Partial<PrefsFees>) => void;
  addRecentMemberName: (name: string) => void;
};

/** 버전이 일치해 migrate 없이 그대로 쓰이는 값이므로 여기서 최소한의 모양을 검사한다 */
function isValidPrefsState(state: unknown): boolean {
  if (typeof state !== 'object' || state === null) return false;
  const s = state as Record<string, unknown>;
  return (
    typeof s.gameFeePerGame === 'number' &&
    typeof s.shoeFee === 'number' &&
    typeof s.defaultAnte === 'number' &&
    Array.isArray(s.recentMemberNames)
  );
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      ...initialPrefs,
      setFees: (fees) => set((state) => ({ ...state, ...fees })),
      addRecentMemberName: (name) =>
        set((state) => {
          const trimmed = name.trim();
          if (!trimmed) return state;
          const recentMemberNames = [
            trimmed,
            ...state.recentMemberNames.filter((n) => n !== trimmed),
          ].slice(0, MAX_RECENT_NAMES);
          return { ...state, recentMemberNames };
        }),
    }),
    {
      name: STORAGE_KEY,
      version: CURRENT_VERSION,
      storage: createGuardedStorage<Prefs>(isValidPrefsState),
      partialize: (state) => ({
        gameFeePerGame: state.gameFeePerGame,
        shoeFee: state.shoeFee,
        defaultAnte: state.defaultAnte,
        roundingUnit: state.roundingUnit,
        recentMemberNames: state.recentMemberNames,
      }),
      migrate: (persistedState, version): Prefs => {
        try {
          if (version !== CURRENT_VERSION) {
            backupCorruptState(persistedState, version);
            return { ...initialPrefs };
          }
          return persistedState as Prefs;
        } catch {
          backupCorruptState(persistedState, version);
          return { ...initialPrefs };
        }
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          // 복원 실패는 크래시로 이어지지 않아야 한다. 초기 상태로 계속 진행한다.
          console.error('[allcover] prefs 복원 실패', error);
        }
      },
    }
  )
);

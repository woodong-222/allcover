/**
 * 요금 프리셋 + 최근 멤버 이름. 정산 세션과 분리 저장한다 (C1, C5).
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §3 인수조건 C
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SettlementMode } from '../types';
import { createGuardedStorage, backupCorruptState } from './persistGuard';

const STORAGE_KEY = 'allcover:prefs:v1';
/**
 * v2: `roundingUnit`·`defaultAnte` 삭제(1원 올림 고정 §5-A-1, defaultAnte는 첫 판 하나에서만
 * 쓰이던 필드라 판별 "인당 판돈"과 이름이 겹쳐 혼란만 줘서 제거), `mode` 추가.
 * `resetSession`이 요금 프리셋과 같은 이유로 마지막에 고른 모드를 유지해야 해서 여기 둔다.
 */
const CURRENT_VERSION = 2;
const MAX_RECENT_NAMES = 20;

export type Prefs = {
  gameFeePerGame: number;
  shoeFee: number;
  /** 마지막으로 고른 정산 모드. resetSession 이후 새 세션의 기본값으로 쓰인다 */
  mode: SettlementMode;
  /** 최근 추가한 멤버 이름, 최신순, 최대 20개 */
  recentMemberNames: string[];
};

export const initialPrefs: Prefs = {
  gameFeePerGame: 0,
  shoeFee: 0,
  mode: 'bet',
  recentMemberNames: [],
};

export type PrefsFees = Pick<Prefs, 'gameFeePerGame' | 'shoeFee'>;

type PrefsState = Prefs & {
  setFees: (fees: Partial<PrefsFees>) => void;
  setMode: (mode: SettlementMode) => void;
  addRecentMemberName: (name: string) => void;
};

/** 버전이 일치해 migrate 없이 그대로 쓰이는 값이므로 여기서 최소한의 모양을 검사한다 */
function isValidPrefsState(state: unknown): boolean {
  if (typeof state !== 'object' || state === null) return false;
  const s = state as Record<string, unknown>;
  return (
    typeof s.gameFeePerGame === 'number' &&
    typeof s.shoeFee === 'number' &&
    Array.isArray(s.recentMemberNames)
  );
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      ...initialPrefs,
      setFees: (fees) => set((state) => ({ ...state, ...fees })),
      setMode: (mode) => set((state) => ({ ...state, mode })),
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
        mode: state.mode,
        recentMemberNames: state.recentMemberNames,
      }),
      migrate: (persistedState, version): Prefs => {
        try {
          if (version === 1) {
            // v1 -> v2: roundingUnit·defaultAnte 삭제, mode 채움. 요금/최근 이름은 보존한다.
            const v1 = persistedState as Record<string, unknown>;
            return {
              gameFeePerGame:
                typeof v1.gameFeePerGame === 'number' ? v1.gameFeePerGame : initialPrefs.gameFeePerGame,
              shoeFee: typeof v1.shoeFee === 'number' ? v1.shoeFee : initialPrefs.shoeFee,
              recentMemberNames: Array.isArray(v1.recentMemberNames)
                ? (v1.recentMemberNames as string[])
                : [],
              mode: 'bet',
            };
          }
          // 그 외 알 수 없는 버전은 손상으로 취급해 백업 후 초기화한다
          backupCorruptState(persistedState, version);
          return { ...initialPrefs };
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

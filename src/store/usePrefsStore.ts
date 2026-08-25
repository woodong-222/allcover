/**
 * 요금 프리셋 + 최근 멤버 이름. 정산 세션과 분리 저장한다 (C1, C5).
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §3 인수조건 C
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createGuardedStorage, backupCorruptState } from './persistGuard';

const STORAGE_KEY = 'allcover:prefs:v1';
/**
 * v2: `roundingUnit`·`defaultAnte` 삭제(1원 올림 고정 §5-A-1), `mode` 추가.
 * v3: `mode` 삭제 (2026-08-24). 전역 정산/내기 토글이 사라져 `Round.method` 하나로 합쳐졌으므로
 * "마지막에 고른 모드"를 이어받을 대상 자체가 없어졌다.
 *
 * 옛 버전은 전부 **삭제된 필드만 더 갖고 있다** — 요금과 최근 이름은 v1부터 지금까지 같은
 * 이름·같은 의미다. 그래서 v1/v2 모두 "쓸 필드만 골라 담는" 한 경로로 복원된다.
 * 알 수 없는 버전만 백업 후 초기화한다.
 */
const CURRENT_VERSION = 3;
const MAX_RECENT_NAMES = 20;

export type Prefs = {
  gameFeePerGame: number;
  shoeFee: number;
  /** 최근 추가한 멤버 이름, 최신순, 최대 20개 */
  recentMemberNames: string[];
};

export const initialPrefs: Prefs = {
  gameFeePerGame: 0,
  shoeFee: 0,
  recentMemberNames: [],
};

export type PrefsFees = Pick<Prefs, 'gameFeePerGame' | 'shoeFee'>;

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
        recentMemberNames: state.recentMemberNames,
      }),
      migrate: (persistedState, version): Prefs => {
        try {
          if (version === 1 || version === 2) {
            // v1 -> v2 -> v3. 두 단계 모두 "삭제"뿐이라(v1: roundingUnit·defaultAnte,
            // v2: mode) 살릴 필드를 골라 담는 것으로 연쇄가 끝난다.
            const old = persistedState as Record<string, unknown>;
            return {
              gameFeePerGame:
                typeof old.gameFeePerGame === 'number'
                  ? old.gameFeePerGame
                  : initialPrefs.gameFeePerGame,
              shoeFee: typeof old.shoeFee === 'number' ? old.shoeFee : initialPrefs.shoeFee,
              recentMemberNames: Array.isArray(old.recentMemberNames)
                ? (old.recentMemberNames as string[])
                : [],
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

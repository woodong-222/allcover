/**
 * 진행 중인 정산 세션 상태. localStorage에 `allcover:session:v1` 키로 저장한다 (C2).
 * 요금 프리셋·최근 멤버 이름은 [[usePrefsStore]]가 별도로 저장한다 (C1, C5).
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §2, §3 인수조건 C
 */

import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BetMethod, Extra, Member, Round, Settlement } from '../types';
import { createGuardedStorage, backupCorruptState } from './persistGuard';
import { initialPrefs, usePrefsStore, type Prefs, type PrefsFees } from './usePrefsStore';

const STORAGE_KEY = 'allcover:session:v1';
const CURRENT_VERSION = 1;

function createEmptySettlement(prefs: Pick<Prefs, 'gameFeePerGame' | 'shoeFee' | 'defaultAnte' | 'roundingUnit'>): Settlement {
  return {
    version: CURRENT_VERSION,
    id: nanoid(),
    date: new Date().toISOString(),
    members: [],
    gameFeePerGame: prefs.gameFeePerGame,
    shoeFee: prefs.shoeFee,
    shoeRenters: [],
    defaultAnte: prefs.defaultAnte,
    rounds: [],
    extras: [],
    treasurerId: undefined,
    roundingUnit: prefs.roundingUnit,
  };
}

/** 그룹(개인 또는 팀) 두 개가 같은 멤버 집합인지 비교. tapRank의 재탭 판별에 쓴다 */
function sameMemberSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((id) => setA.has(id));
}

/** 특정 멤버를 판(Round) 내부의 모든 참조(participants/teams/losers/ranking)에서 제거한다 */
function cleanRoundOfMember(round: Round, memberId: string): Round {
  const participants = round.participants.filter((id) => id !== memberId);
  const teams = round.teams
    ? round.teams.map((t) => t.filter((id) => id !== memberId)).filter((t) => t.length > 0)
    : null;
  const losers = round.losers.filter((id) => id !== memberId);
  const ranking = round.ranking
    .map((g) => g.filter((id) => id !== memberId))
    .filter((g) => g.length > 0);
  return { ...round, participants, teams, losers, ranking };
}

type SettlementState = {
  settlement: Settlement;

  addMember: (name: string) => void;
  removeMember: (memberId: string) => void;
  renameMember: (memberId: string, name: string) => void;

  addRound: () => void;
  duplicateRound: (roundId: string) => void;
  removeRound: (roundId: string) => void;

  toggleParticipant: (roundId: string, memberId: string) => void;
  setTeams: (roundId: string, teams: string[][] | null) => void;
  setMethod: (roundId: string, method: BetMethod) => void;
  setAnte: (roundId: string, ante: number) => void;
  setPayout: (roundId: string, payout: number[]) => void;
  /** 탭 순서대로 등수 배정. groupKey는 개인전이면 memberId, 팀전이면 teams 배열의 index */
  tapRank: (roundId: string, groupKey: string | number) => void;
  toggleLoser: (roundId: string, memberId: string) => void;
  setTransfer: (
    roundId: string,
    patch: Partial<Pick<Round, 'transferSource' | 'transferAmount'>>
  ) => void;

  toggleShoeRenter: (memberId: string) => void;
  addExtra: (extra: Omit<Extra, 'id'>) => void;
  removeExtra: (extraId: string) => void;
  setTreasurer: (memberId: string | undefined) => void;
  setFees: (fees: Partial<PrefsFees>) => void;

  /** 세션만 초기화. 요금 프리셋과 최근 멤버 이름은 유지된다 (C5) */
  resetSession: () => void;
};

function mapRounds(
  settlement: Settlement,
  roundId: string,
  fn: (round: Round) => Round
): Round[] {
  return settlement.rounds.map((r) => (r.id === roundId ? fn(r) : r));
}

export const useSettlementStore = create<SettlementState>()(
  persist(
    (set) => ({
      settlement: createEmptySettlement(initialPrefs),

      addMember: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const member: Member = { id: nanoid(), name: trimmed };
        set((state) => ({
          settlement: { ...state.settlement, members: [...state.settlement.members, member] },
        }));
        usePrefsStore.getState().addRecentMemberName(trimmed);
      },

      removeMember: (memberId) => {
        set((state) => {
          const settlement = state.settlement;
          const members = settlement.members.filter((m) => m.id !== memberId);
          const rounds = settlement.rounds.map((r) => cleanRoundOfMember(r, memberId));
          const shoeRenters = settlement.shoeRenters.filter((id) => id !== memberId);
          const extras = settlement.extras.map((e) => ({
            ...e,
            splitAmong:
              e.splitAmong === 'all' ? ('all' as const) : e.splitAmong.filter((id) => id !== memberId),
          }));
          const treasurerId = settlement.treasurerId === memberId ? undefined : settlement.treasurerId;
          return { settlement: { ...settlement, members, rounds, shoeRenters, extras, treasurerId } };
        });
      },

      renameMember: (memberId, name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        set((state) => ({
          settlement: {
            ...state.settlement,
            members: state.settlement.members.map((m) =>
              m.id === memberId ? { ...m, name: trimmed } : m
            ),
          },
        }));
      },

      addRound: () => {
        set((state) => {
          const settlement = state.settlement;
          const last = settlement.rounds[settlement.rounds.length - 1];
          const newRound: Round = {
            id: nanoid(),
            participants: last ? [...last.participants] : settlement.members.map((m) => m.id),
            teams: last ? (last.teams ? last.teams.map((t) => [...t]) : null) : null,
            method: last ? last.method : 'none',
            ante: last ? last.ante : settlement.defaultAnte,
            payout: last ? [...last.payout] : [],
            ranking: [],
            losers: [],
            transferSource: 'gameFee',
            transferAmount: 0,
          };
          return { settlement: { ...settlement, rounds: [...settlement.rounds, newRound] } };
        });
      },

      duplicateRound: (roundId) => {
        set((state) => {
          const rounds = state.settlement.rounds;
          const idx = rounds.findIndex((r) => r.id === roundId);
          if (idx === -1) return state;
          const original = rounds[idx];
          const copy: Round = {
            ...original,
            id: nanoid(),
            participants: [...original.participants],
            teams: original.teams ? original.teams.map((t) => [...t]) : null,
            payout: [...original.payout],
            ranking: original.ranking.map((g) => [...g]),
            losers: [...original.losers],
          };
          const next = [...rounds];
          next.splice(idx + 1, 0, copy);
          return { settlement: { ...state.settlement, rounds: next } };
        });
      },

      removeRound: (roundId) => {
        set((state) => ({
          settlement: {
            ...state.settlement,
            rounds: state.settlement.rounds.filter((r) => r.id !== roundId),
          },
        }));
      },

      toggleParticipant: (roundId, memberId) => {
        set((state) => ({
          settlement: {
            ...state.settlement,
            rounds: mapRounds(state.settlement, roundId, (r) => {
              if (r.participants.includes(memberId)) {
                // 참여 해제: 이 판의 teams/losers/ranking에서도 함께 정리해 댕글링 참조를 막는다
                return cleanRoundOfMember(r, memberId);
              }
              return { ...r, participants: [...r.participants, memberId] };
            }),
          },
        }));
      },

      setTeams: (roundId, teams) => {
        set((state) => ({
          settlement: {
            ...state.settlement,
            rounds: mapRounds(state.settlement, roundId, (r) => ({ ...r, teams })),
          },
        }));
      },

      setMethod: (roundId, method) => {
        set((state) => ({
          settlement: {
            ...state.settlement,
            rounds: mapRounds(state.settlement, roundId, (r) => ({ ...r, method })),
          },
        }));
      },

      setAnte: (roundId, ante) => {
        set((state) => ({
          settlement: {
            ...state.settlement,
            rounds: mapRounds(state.settlement, roundId, (r) => ({ ...r, ante })),
          },
        }));
      },

      setPayout: (roundId, payout) => {
        set((state) => ({
          settlement: {
            ...state.settlement,
            rounds: mapRounds(state.settlement, roundId, (r) => ({ ...r, payout: [...payout] })),
          },
        }));
      },

      tapRank: (roundId, groupKey) => {
        set((state) => ({
          settlement: {
            ...state.settlement,
            rounds: mapRounds(state.settlement, roundId, (r) => {
              const group = r.teams ? [...(r.teams[Number(groupKey)] ?? [])] : [String(groupKey)];
              if (group.length === 0) return r;
              const existingIdx = r.ranking.findIndex((g) => sameMemberSet(g, group));
              const ranking =
                existingIdx === -1
                  ? [...r.ranking, group]
                  : r.ranking.filter((_, i) => i !== existingIdx);
              return { ...r, ranking };
            }),
          },
        }));
      },

      toggleLoser: (roundId, memberId) => {
        set((state) => ({
          settlement: {
            ...state.settlement,
            rounds: mapRounds(state.settlement, roundId, (r) => {
              const group = r.teams ? r.teams.find((t) => t.includes(memberId)) ?? [memberId] : [memberId];
              const currentlyLoser = group.every((id) => r.losers.includes(id));
              const losers = currentlyLoser
                ? r.losers.filter((id) => !group.includes(id))
                : Array.from(new Set([...r.losers, ...group]));
              return { ...r, losers };
            }),
          },
        }));
      },

      setTransfer: (roundId, patch) => {
        set((state) => ({
          settlement: {
            ...state.settlement,
            rounds: mapRounds(state.settlement, roundId, (r) => ({ ...r, ...patch })),
          },
        }));
      },

      toggleShoeRenter: (memberId) => {
        set((state) => {
          const shoeRenters = state.settlement.shoeRenters.includes(memberId)
            ? state.settlement.shoeRenters.filter((id) => id !== memberId)
            : [...state.settlement.shoeRenters, memberId];
          return { settlement: { ...state.settlement, shoeRenters } };
        });
      },

      addExtra: (extra) => {
        set((state) => ({
          settlement: {
            ...state.settlement,
            extras: [...state.settlement.extras, { ...extra, id: nanoid() }],
          },
        }));
      },

      removeExtra: (extraId) => {
        set((state) => ({
          settlement: {
            ...state.settlement,
            extras: state.settlement.extras.filter((e) => e.id !== extraId),
          },
        }));
      },

      setTreasurer: (memberId) => {
        set((state) => ({ settlement: { ...state.settlement, treasurerId: memberId } }));
      },

      setFees: (fees) => {
        set((state) => ({ settlement: { ...state.settlement, ...fees } }));
        usePrefsStore.getState().setFees(fees);
      },

      resetSession: () => {
        const prefs = usePrefsStore.getState();
        set({ settlement: createEmptySettlement(prefs) });
      },
    }),
    {
      name: STORAGE_KEY,
      version: CURRENT_VERSION,
      storage: createGuardedStorage<{ settlement: Settlement }>(),
      partialize: (state) => ({ settlement: state.settlement }),
      migrate: (persistedState, version): { settlement: Settlement } => {
        try {
          if (version !== CURRENT_VERSION) {
            backupCorruptState(persistedState, version);
            return { settlement: createEmptySettlement(usePrefsStore.getState()) };
          }
          return persistedState as { settlement: Settlement };
        } catch {
          backupCorruptState(persistedState, version);
          return { settlement: createEmptySettlement(usePrefsStore.getState()) };
        }
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.error('[allcover] 세션 복원 실패', error);
        }
      },
    }
  )
);

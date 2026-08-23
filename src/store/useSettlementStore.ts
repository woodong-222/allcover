/**
 * 진행 중인 정산 세션 상태. localStorage에 `allcover:session:v1` 키로 저장한다 (C2).
 * 요금 프리셋·최근 멤버 이름은 [[usePrefsStore]]가 별도로 저장한다 (C1, C5).
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §2, §3 인수조건 C
 */

import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BetMethod, Extra, Member, Round, Settlement, SettlementMode } from '../types';
import { createGuardedStorage, backupCorruptState, clearCorruptBackups } from './persistGuard';
import { initialPrefs, usePrefsStore, type Prefs, type PrefsFees } from './usePrefsStore';

const STORAGE_KEY = 'allcover:session:v1';
/**
 * v2: `roundingUnit` 삭제(1원 올림으로 고정, 계획서 §5-A-1), `mode` 추가(§5-A-2).
 * v1 -> v2는 실제 마이그레이션을 쓴다 — 버전만 올리고 무조건 초기화하면 진행 중인
 * 정산이 전부 날아간다 (계획서 §5-A-3). "그 외 알 수 없는 버전"만 백업 후 초기화한다.
 */
const CURRENT_VERSION = 2;

function createEmptySettlement(prefs: Pick<Prefs, 'gameFeePerGame' | 'shoeFee' | 'mode'>): Settlement {
  return {
    version: CURRENT_VERSION,
    id: nanoid(),
    date: new Date().toISOString(),
    mode: prefs.mode,
    members: [],
    gameFeePerGame: prefs.gameFeePerGame,
    shoeFee: prefs.shoeFee,
    shoeRenters: [],
    rounds: [],
    extras: [],
  };
}

/**
 * localStorage에서 읽은 값이 실제로 Settlement 모양인지 최소한으로 검사한다.
 * 버전이 일치하면 zustand persist가 migrate 없이 이 값을 그대로 쓰므로,
 * 여기서 걸러내지 않으면 `{ settlement: null }` 같은 값이 그대로 들어가 계산 단계에서 크래시한다.
 */
function isValidSettlementState(state: unknown): boolean {
  if (typeof state !== 'object' || state === null) return false;
  const settlement = (state as Record<string, unknown>).settlement;
  if (typeof settlement !== 'object' || settlement === null) return false;
  const s = settlement as Record<string, unknown>;
  return Array.isArray(s.members) && Array.isArray(s.rounds) && Array.isArray(s.extras);
}

/**
 * 입력 경계에서 금액을 정수 원 단위로 강제한다 (계획서 §5-A-1 "결정 C").
 *
 * **`money.roundTo`(Math.ceil, 계산 출력 반올림 정책)와는 의도적으로 다르다** — 절대 통일하지 마라.
 * - 여기(입력 정규화)는 `Math.round`: 사용자가 친 값에 가장 가까운 정수를 잡는다. `4000.4` -> `4000`.
 * - `money.roundTo`(계산 출력)는 `Math.ceil` 1원 올림: 총액 보존을 위해 항상 위로만 올린다.
 * 입력을 여기서 정수로 못박아 두면 `subtotal`이 이미 전부 정수라 `roundTo`는 사실상 방어용 no-op으로만
 * 남는다 — 진짜 목적(소수점 없는 화면)은 이 경계에서 달성된다.
 *
 * `NumberField`가 UI 레이어에서도 이미 정수화하지만, 테스트/마이그레이션은 UI를 우회해
 * 스토어에 직접 값을 넣으므로 **여기가 진짜 경계**다.
 */
function toWon(n: number): number {
  return Number.isFinite(n) ? Math.round(n) : 0;
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
  setFees: (fees: Partial<PrefsFees>) => void;
  /** 정산 전체에 걸리는 모드 전환. 비파괴적 — 라운드의 method/ante/payout/ranking/losers/teams는 지우지 않는다 */
  setMode: (mode: SettlementMode) => void;

  /** 세션만 초기화. 요금 프리셋·최근 멤버 이름·모드는 유지된다 (C5) */
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
          return { settlement: { ...settlement, members, rounds, shoeRenters, extras } };
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
          // 정산 모드에서는 내기 필드를 상속하지 않는다 (G2). UI가 숨겨져 있어도 상속이
          // 계속되면, 정산 모드로 판을 여러 개 만들고 내기 모드로 돌아왔을 때 사용자가
          // 만든 적 없는 판돈·배당이 붙은 판들을 만나게 된다. participants/teams는
          // 모드와 무관하게 유용하므로 계속 상속한다.
          const inheritBetFields = settlement.mode !== 'normal';
          const newRound: Round = {
            id: nanoid(),
            participants: last ? [...last.participants] : settlement.members.map((m) => m.id),
            teams: last ? (last.teams ? last.teams.map((t) => [...t]) : null) : null,
            method: inheritBetFields && last ? last.method : 'none',
            // 첫 판의 ante는 0에서 시작해 사용자가 그 판에서 직접 입력한다 (defaultAnte 제거, 2026-08-21)
            ante: inheritBetFields && last ? last.ante : 0,
            payout: inheritBetFields && last ? [...last.payout] : [],
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
          // addRound 의 inheritBetFields 와 같은 규칙이다. 두 곳이 갈리면 안 된다.
          const copyBetFields = state.settlement.mode !== 'normal';
          const copy: Round = {
            ...original,
            id: nanoid(),
            participants: [...original.participants],
            teams: original.teams ? original.teams.map((t) => [...t]) : null,
            // 정산 모드에서는 내기 UI 가 숨겨져 있으므로 "복제" 는 사용자에게 "같은 멤버로
            // 한 판 더" 라는 뜻이다. 내기 필드까지 복사하면 사용자가 입력한 적 없는 판돈·배당이
            // 내기 모드로 돌아왔을 때 계산에 반영된다. addRound 가 G2 로 막은 구멍과 같다 (F4).
            ...(copyBetFields
              ? {
                  payout: [...original.payout],
                  ranking: original.ranking.map((g) => [...g]),
                  losers: [...original.losers],
                }
              : {
                  method: 'none' as const,
                  ante: 0,
                  payout: [],
                  ranking: [],
                  losers: [],
                  // transferSource/transferAmount 도 함께 초기화해야 addRound 와 같은 규칙이 된다.
                  // 안 그러면 정산 모드에서 복제한 판에 "직접 입력 5,000원" 이 남아 있다가,
                  // 내기 모드로 돌아와 "판비 내주기" 를 누르는 순간 입력한 적 없는 금액이 채워진다.
                  transferSource: 'gameFee' as const,
                  transferAmount: 0,
                }),
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
        // 팀 구성이 바뀌면 팀 기준으로 매긴 순위(ranking)와 승패(losers)는 의미를 잃는다.
        // 옛 조합이 남아있으면 같은 멤버가 새/옛 그룹에 동시에 들어가 제로섬이 깨질 수 있어
        // (팀전 -> 개인전 전환 시 특히) 팀을 바꿀 때마다 함께 초기화한다.
        set((state) => ({
          settlement: {
            ...state.settlement,
            rounds: mapRounds(state.settlement, roundId, (r) => ({
              ...r,
              teams,
              ranking: [],
              losers: [],
            })),
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
            rounds: mapRounds(state.settlement, roundId, (r) => ({ ...r, ante: toWon(ante) })),
          },
        }));
      },

      setPayout: (roundId, payout) => {
        set((state) => ({
          settlement: {
            ...state.settlement,
            rounds: mapRounds(state.settlement, roundId, (r) => ({
              ...r,
              payout: payout.map(toWon),
            })),
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
        const normalized =
          patch.transferAmount === undefined ? patch : { ...patch, transferAmount: toWon(patch.transferAmount) };
        set((state) => ({
          settlement: {
            ...state.settlement,
            rounds: mapRounds(state.settlement, roundId, (r) => ({ ...r, ...normalized })),
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
            extras: [...state.settlement.extras, { ...extra, amount: toWon(extra.amount), id: nanoid() }],
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

      setFees: (fees) => {
        const normalized: Partial<PrefsFees> = {
          ...fees,
          ...(fees.gameFeePerGame !== undefined && { gameFeePerGame: toWon(fees.gameFeePerGame) }),
          ...(fees.shoeFee !== undefined && { shoeFee: toWon(fees.shoeFee) }),
        };
        set((state) => ({ settlement: { ...state.settlement, ...normalized } }));
        usePrefsStore.getState().setFees(normalized);
      },

      setMode: (mode) => {
        set((state) => ({ settlement: { ...state.settlement, mode } }));
        // resetSession이 마지막에 고른 모드를 이어받도록 prefs에도 반영한다 (setFees와 같은 패턴)
        usePrefsStore.getState().setMode(mode);
      },

      resetSession: () => {
        const prefs = usePrefsStore.getState();
        // 손상 백업에는 이전 세션의 멤버 실명과 금액이 통째로 들어 있다. "새 정산" 은
        // 사용자에게 "지웠다" 는 뜻이므로 그 사본도 함께 지운다 (보안 검토 LOW).
        clearCorruptBackups();
        set({ settlement: createEmptySettlement(prefs) });
      },
    }),
    {
      name: STORAGE_KEY,
      version: CURRENT_VERSION,
      storage: createGuardedStorage<{ settlement: Settlement }>(isValidSettlementState),
      partialize: (state) => ({ settlement: state.settlement }),
      migrate: (persistedState, version): { settlement: Settlement } => {
        try {
          if (version === 1) {
            // v1 -> v2: roundingUnit·defaultAnte·treasurerId 삭제, mode 채움(§5-A-3 결정 1).
            // members/rounds/extras 등은 보존한다.
            const wrapped = persistedState as { settlement?: Record<string, unknown> };
            const v1 = wrapped.settlement;
            const looksLikeSettlement =
              v1 &&
              typeof v1 === 'object' &&
              Array.isArray(v1.members) &&
              Array.isArray(v1.rounds) &&
              Array.isArray(v1.extras);
            if (!looksLikeSettlement) {
              backupCorruptState(persistedState, version);
              return { settlement: createEmptySettlement(usePrefsStore.getState()) };
            }
            const {
              roundingUnit: _roundingUnit,
              defaultAnte: _defaultAnte,
              treasurerId: _treasurerId,
              ...rest
            } = v1 as Record<string, unknown> & {
              roundingUnit?: unknown;
              defaultAnte?: unknown;
              treasurerId?: unknown;
            };
            const migratedMode: SettlementMode =
              v1!.mode === 'normal' || v1!.mode === 'bet' ? (v1!.mode as SettlementMode) : 'bet';
            return {
              settlement: { ...(rest as Omit<Settlement, 'version' | 'mode'>), version: CURRENT_VERSION, mode: migratedMode },
            };
          }
          // 그 외 알 수 없는 버전은 손상으로 취급해 백업 후 초기화한다 (기존 C3 동작 유지)
          backupCorruptState(persistedState, version);
          return { settlement: createEmptySettlement(usePrefsStore.getState()) };
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

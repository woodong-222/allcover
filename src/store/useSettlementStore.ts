/**
 * 진행 중인 정산 세션 상태. localStorage에 `allcover:session:v1` 키로 저장한다 (C2).
 * 요금 프리셋·최근 멤버 이름은 [[usePrefsStore]]가 별도로 저장한다 (C1, C5).
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §2, §3 인수조건 C
 */

import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BetMethod, Extra, Member, Round, Settlement } from '../types';
import { splitEvenly } from '../lib/money';
import { createGuardedStorage, backupCorruptState, clearCorruptBackups } from './persistGuard';
import { initialPrefs, usePrefsStore, type PrefsFees } from './usePrefsStore';

const STORAGE_KEY = 'allcover:session:v1';
/**
 * v2: `roundingUnit` 삭제(1원 올림으로 고정, 계획서 §5-A-1), `mode` 추가(§5-A-2).
 * v3: `mode` 삭제, `Extra.amount`/`Extra.splitAmong` -> `Extra.amounts` (2026-08-24).
 *
 * 어느 단계도 버전만 올리고 초기화하지 않는다 — 진행 중인 정산이 통째로 날아간다 (§5-A-3).
 * "그 외 알 수 없는 버전"만 백업 후 초기화한다.
 */
const CURRENT_VERSION = 3;

function createEmptySettlement(prefs: PrefsFees): Settlement {
  return {
    version: CURRENT_VERSION,
    id: nanoid(),
    date: new Date().toISOString(),
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
 *
 * `extras[].amounts`까지 보는 이유: `calc.ts`가 `Object.entries(item.amounts)`를 도는데
 * v3 버전 딱지를 달고 옛 모양(`amount`/`splitAmong`)이 들어오면 렌더 중 TypeError로 죽는다.
 * 단 그 검사는 **현재 버전일 때만** 한다 — 옛 버전 값은 옛 모양인 게 정상이고, 여기서
 * 걸러버리면 마이그레이션이 돌기도 전에 진행 중인 정산이 초기화된다.
 */
function isValidSettlementState(state: unknown, version: number): boolean {
  if (typeof state !== 'object' || state === null) return false;
  const settlement = (state as Record<string, unknown>).settlement;
  if (typeof settlement !== 'object' || settlement === null) return false;
  const s = settlement as Record<string, unknown>;
  if (!Array.isArray(s.members) || !Array.isArray(s.rounds) || !Array.isArray(s.extras)) {
    return false;
  }
  if (version !== CURRENT_VERSION) return true;
  return s.extras.every((e) => {
    if (typeof e !== 'object' || e === null) return false;
    const amounts = (e as Record<string, unknown>).amounts;
    return typeof amounts === 'object' && amounts !== null;
  });
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

/**
 * 기타비용의 사람별 금액 맵을 정규화한다.
 *
 * 정수화(`toWon`)한 뒤 **0 이하는 키째로 버린다.** 0원인 사람은 그 항목을 안 먹은 것이고,
 * 안 먹은 사람을 굳이 저장할 이유가 없다. 음수·NaN·Infinity도 같은 규칙으로 사라진다
 * (`toWon`이 비유한값을 0으로 눕힌다). 덕분에 "키가 있으면 청구 대상"이 불변식이 되어
 * `calc.ts`의 미수금(unassignedExtras) 판정이 단순해진다.
 */
function normalizeAmounts(amounts: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [memberId, raw] of Object.entries(amounts)) {
    const won = toWon(raw);
    if (won > 0) out[memberId] = won;
  }
  return out;
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
  /** 한 항목의 사람별 금액을 통째로 교체한다. 균등 분배도 같은 값을 채워 넣어 이 액션으로 표현한다 */
  setExtraAmounts: (extraId: string, amounts: Record<string, number>) => void;
  removeExtra: (extraId: string) => void;
  setFees: (fees: Partial<PrefsFees>) => void;

  /** 세션만 초기화. 요금 프리셋·최근 멤버 이름은 유지된다 (C5) */
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
          // 기타비용에서도 그 사람 몫을 지운다. 남겨두면 삭제된 멤버 앞으로 금액이 계속
          // 잡혀 있다가 calc 단계에서 조용히 증발한다 (calc.ts는 모르는 id를 건너뛴다).
          const extras = settlement.extras.map((e) => {
            if (!(memberId in e.amounts)) return e;
            const { [memberId]: _removed, ...amounts } = e.amounts;
            return { ...e, amounts };
          });
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
          // 새 판은 언제나 직전 판의 구성을 상속한다. 전역 정산/내기 모드가 사라지면서
          // (2026-08-24) "정산 모드에서는 내기 필드를 상속하지 않는다"는 분기도 함께 사라졌다.
          // 이 판이 내기인지 아닌지는 이제 Round.method 하나가 말하므로, method 를 상속하면
          // 정산만 하는 모임은 'none' 이 계속 이어지고 내기 모임은 판돈이 계속 이어진다.
          const newRound: Round = {
            id: nanoid(),
            participants: last ? [...last.participants] : settlement.members.map((m) => m.id),
            teams: last ? (last.teams ? last.teams.map((t) => [...t]) : null) : null,
            method: last ? last.method : 'none',
            // 첫 판의 ante는 0에서 시작해 사용자가 그 판에서 직접 입력한다 (defaultAnte 제거, 2026-08-21)
            ante: last ? last.ante : 0,
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
          // "복제"는 말 그대로 그 판을 통째로 복사한다. 배열은 새로 떠서 원본과 공유하지 않는다.
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
            extras: [
              ...state.settlement.extras,
              { ...extra, amounts: normalizeAmounts(extra.amounts), id: nanoid() },
            ],
          },
        }));
      },

      setExtraAmounts: (extraId, amounts) => {
        set((state) => ({
          settlement: {
            ...state.settlement,
            extras: state.settlement.extras.map((e) =>
              e.id === extraId ? { ...e, amounts: normalizeAmounts(amounts) } : e
            ),
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
          if (version === 1 || version === 2) {
            const wrapped = persistedState as { settlement?: Record<string, unknown> };
            const stored = wrapped.settlement;
            const looksLikeSettlement =
              stored &&
              typeof stored === 'object' &&
              Array.isArray(stored.members) &&
              Array.isArray(stored.rounds) &&
              Array.isArray(stored.extras);
            if (!looksLikeSettlement) {
              backupCorruptState(persistedState, version);
              return { settlement: createEmptySettlement(usePrefsStore.getState()) };
            }
            // v1은 v2를 거쳐 v3로 간다. 단계를 건너뛰면 v1에서만 존재하던 필드가
            // 그대로 v3 상태에 얹혀 저장된다.
            const v2 = version === 1 ? migrateV1toV2(stored) : stored;
            return { settlement: migrateV2toV3(v2) };
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

/**
 * v1 -> v2: v2에서 삭제된 필드(`roundingUnit`/`defaultAnte`/`treasurerId`)만 떼어낸다.
 *
 * v2가 새로 넣었던 `mode`는 여기서 채우지 않는다 — 바로 다음 단계인 v3가 다시 지우기 때문이다.
 * members/rounds/extras는 v1과 v2가 같은 모양이므로 손대지 않고 넘긴다.
 */
function migrateV1toV2(v1: Record<string, unknown>): Record<string, unknown> {
  const {
    roundingUnit: _roundingUnit,
    defaultAnte: _defaultAnte,
    treasurerId: _treasurerId,
    ...rest
  } = v1;
  return rest;
}

/** v2 기타비용 한 항목. `amount` 하나를 `splitAmong` 대상에게 균등 분배하던 시절의 모양이다 */
type V2Extra = {
  id?: unknown;
  label?: unknown;
  amount?: unknown;
  splitAmong?: unknown;
};

/**
 * v2 기타비용 하나를 사람별 금액 맵으로 편다.
 *
 * 분담 대상은 `splitAmong === 'all'`이면 전 멤버, 배열이면 그중 **실제로 남아 있는 멤버**다
 * (이미 삭제된 멤버 id가 남아 있을 수 있다). 대상이 하나도 없으면 빈 맵을 돌려준다.
 *
 * **알려진 한계**: 그 경우 v2가 들고 있던 금액은 얹을 키가 없어 사라지고, `calc.ts`의
 * 미수금(unassignedExtras) 경고에도 잡히지 않는다(합계가 0이면 보고하지 않는다).
 * v3 스키마에는 주인 없는 금액을 담을 자리가 없다 — 되살리려면 스키마 쪽 결정이 필요하다.
 *
 * 분배는 반드시 [[splitEvenly]]를 쓴다. 이 앱의 분배 규칙은 "전원이 같은 금액"이고
 * (합계가 최대 인원-1원 커진다), 여기서만 다른 규칙을 쓰면 마이그레이션 전후로 청구액이 달라진다.
 */
function extraAmountsFromV2(extra: V2Extra, memberIds: string[]): Record<string, number> {
  const targets =
    extra.splitAmong === 'all'
      ? memberIds
      : Array.isArray(extra.splitAmong)
        ? (extra.splitAmong as unknown[]).filter(
            (id): id is string => typeof id === 'string' && memberIds.includes(id)
          )
        : [];
  if (targets.length === 0) return {};

  const shares = splitEvenly(toWon(extra.amount as number), targets.length);
  const amounts: Record<string, number> = {};
  targets.forEach((id, i) => {
    amounts[id] = shares[i];
  });
  return normalizeAmounts(amounts);
}

/**
 * v2 -> v3: `mode` 삭제 + 기타비용을 사람별 금액 맵으로 전환한다 (2026-08-24).
 * members/rounds/요금 등 나머지는 전부 보존한다.
 */
function migrateV2toV3(v2: Record<string, unknown>): Settlement {
  const { mode: _mode, ...rest } = v2;
  const members = (rest.members ?? []) as Member[];
  const memberIds = members.map((m) => m.id);
  const extras = ((rest.extras ?? []) as V2Extra[]).map((e) => ({
    id: typeof e.id === 'string' ? e.id : nanoid(),
    label: typeof e.label === 'string' ? e.label : '',
    amounts: extraAmountsFromV2(e, memberIds),
  }));
  return {
    ...(rest as Omit<Settlement, 'version' | 'extras'>),
    extras,
    version: CURRENT_VERSION,
  };
}

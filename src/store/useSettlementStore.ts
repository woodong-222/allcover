/**
 * 진행 중인 정산 세션 상태. 메모리에만 두고 저장하지 않는다.
 * 앱을 다시 열면 빈 화면에서 시작하고, 게임 단가·신발비·최근 멤버 이름만
 * usePrefsStore 가 이어받는다.
 */

import { nanoid } from 'nanoid';
import { create } from 'zustand';
import type { BetMethod, Extra, Member, Round, Settlement } from '../types';
import { clearCorruptBackups } from './persistGuard';
import { safeRemove } from '../lib/storage';
import { usePrefsStore, type PrefsFees } from './usePrefsStore';

/**
 * 예전에는 정산 세션을 통째로 저장했다. 그 키가 남아 있으면 멤버 실명과 금액이
 * 브라우저에 계속 들어 있게 되므로, 이제 읽지 않는 값이라도 한 번은 지워준다.
 */
safeRemove('allcover:session:v1');

function createEmptySettlement(prefs: PrefsFees): Settlement {
  return {
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
 * 입력 경계에서 금액을 정수 원 단위로 강제한다.
 *
 * 계산 출력을 반올림하는 `money.roundTo` 와 방식이 의도적으로 다르니 통일하지 마라.
 * - 입력 정규화인 여기는 `Math.round`. 사용자가 친 값에 가장 가까운 정수를 잡는다. `4000.4` -> `4000`.
 * - 계산 출력인 `money.roundTo` 는 `Math.ceil` 1원 올림. 총액 보존을 위해 항상 위로만 올린다.
 *
 * 입력을 여기서 정수로 못박아 두면 `subtotal` 이 이미 전부 정수라 `roundTo` 는 사실상 방어용
 * no-op 으로만 남는다. 소수점 없는 화면이라는 진짜 목적은 이 경계에서 달성된다.
 *
 * `NumberField` 가 UI 레이어에서도 이미 정수화하지만, 테스트와 마이그레이션은 UI를 우회해
 * 스토어에 직접 값을 넣으므로 여기가 진짜 경계다.
 */
function toWon(n: number): number {
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * 기타비용의 사람별 금액 맵을 정규화한다.
 *
 * 정수화(`toWon`)한 뒤 0 이하는 키째로 버린다. 0원인 사람은 그 항목을 안 먹은 것이고,
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

  /** 세션만 초기화. 요금 프리셋과 최근 멤버 이름은 유지된다 */
  resetSession: () => void;
  /** 보관함에서 꺼낸 정산으로 지금 화면을 통째로 바꾼다 */
  loadSettlement: (settlement: Settlement) => void;
};

function mapRounds(
  settlement: Settlement,
  roundId: string,
  fn: (round: Round) => Round
): Round[] {
  return settlement.rounds.map((r) => (r.id === roundId ? fn(r) : r));
}

export const useSettlementStore = create<SettlementState>()((set) => ({
    // 저장된 프리셋(게임 단가·신발비)을 첫 화면부터 채운다. usePrefsStore 는 이 모듈보다
    // 먼저 평가되면서 localStorage 에서 복원되므로 여기서 이미 실제 값을 들고 있다.
    settlement: createEmptySettlement(usePrefsStore.getState()),

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
        // 새 판은 언제나 직전 판의 구성을 상속한다. 이 판이 내기인지 아닌지는 Round.method
        // 하나가 말하므로, method 를 상속하면 정산만 하는 모임은 'none' 이 계속 이어지고
        // 내기 모임은 판돈이 계속 이어진다.
        const newRound: Round = {
          id: nanoid(),
          participants: last ? [...last.participants] : settlement.members.map((m) => m.id),
          teams: last ? (last.teams ? last.teams.map((t) => [...t]) : null) : null,
          method: last ? last.method : 'none',
          // 첫 판의 ante 는 0에서 시작해 사용자가 그 판에서 직접 입력한다
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
        // 배열은 새로 떠서 원본과 공유하지 않는다.
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
      // 사용자에게 지웠다는 뜻이므로 그 사본도 함께 지운다.
      clearCorruptBackups();
      set({ settlement: createEmptySettlement(prefs) });
    },

    loadSettlement: (settlement) => {
      // 보관본은 그대로 두고 사본을 화면에 올린다. 안 그러면 불러온 뒤 금액을 고칠 때
      // 보관함에 남아 있는 원본까지 같이 바뀐다.
      const loaded = structuredClone(settlement);

      // 보관본은 지금 스키마보다 오래됐을 수 있어 요금이 비어 있거나 숫자가 아닐 수 있다.
      // 그대로 두면 계산이 NaN 이 되고, 프리셋에까지 번져 요금과 최근 멤버가 통째로 날아간다.
      loaded.gameFeePerGame = toWon(loaded.gameFeePerGame);
      loaded.shoeFee = toWon(loaded.shoeFee);

      set({ settlement: loaded });
      // 불러온 정산의 요금을 프리셋에도 반영해 다음 새 정산이 같은 값으로 시작하게 한다.
      usePrefsStore.getState().setFees({
        gameFeePerGame: loaded.gameFeePerGame,
        shoeFee: loaded.shoeFee,
      });
    },
}));

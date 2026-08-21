/**
 * 탭 순서로 등수를 정하는 칩 목록.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §2 "순위 입력 규칙", R5, 인수조건 E1/E2
 *
 * - 개인전(round.teams === null)이면 참여자 칩, 팀전이면 팀 칩을 보여준다.
 * - 탭한 순서대로 `1등, 2등, 3등…` 배지가 붙고, 이미 등수가 붙은 칩을 다시 탭하면 해제된다.
 *   (뒤 등수를 한 칸씩 당기는 처리는 스토어의 tapRank가 이미 한다.)
 * - 탭하지 않은 칩은 회색 + `무배당` 라벨로, 어떤 상태인지가 항상 눈에 보이게 한다 (R5).
 */

import type { Member, Round } from '../types';
import { useSettlementStore } from '../store/useSettlementStore';

const HIT_AREA = 'min-h-[44px] min-w-[44px]';
const CHIP_LIST = 'flex flex-wrap gap-2';

export type RankPickerProps = {
  round: Round;
  members: Member[];
};

type RankGroup = {
  /** tapRank에 그대로 넘기는 키. 개인전은 memberId, 팀전은 teams 배열의 index */
  key: string | number;
  label: string;
  sub: string;
  ids: string[];
};

/** 두 그룹이 같은 멤버 집합인지. ranking 안에서 이 칩의 등수를 찾을 때 쓴다 */
function sameMemberSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((id) => setA.has(id));
}

function buildGroups(round: Round, members: Member[]): RankGroup[] {
  const nameOf = (id: string): string => members.find((m) => m.id === id)?.name ?? '?';

  if (round.teams) {
    return round.teams
      .map((team, index) => ({
        key: index,
        label: `${index + 1}팀`,
        sub: team.map(nameOf).join('·'),
        ids: team,
      }))
      .filter((g) => g.ids.length > 0);
  }

  return round.participants.map((id) => ({
    key: id,
    label: nameOf(id),
    sub: '',
    ids: [id],
  }));
}

export function RankPicker({ round, members }: RankPickerProps) {
  const tapRank = useSettlementStore((s) => s.tapRank);
  const groups = buildGroups(round, members);

  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0">
      <legend className="text-sm font-medium text-slate-700">순위</legend>
      <p className="text-sm text-slate-600">
        배당 받는 등수까지만 탭하세요. 나머지는 자동으로 무배당입니다.
      </p>

      {groups.length === 0 ? (
        <p className="text-sm text-slate-600">참여자를 먼저 선택해 주세요.</p>
      ) : (
        <div className={CHIP_LIST}>
          {groups.map((group) => {
            const rank = round.ranking.findIndex((g) => sameMemberSet(g, group.ids));
            const ranked = rank !== -1;
            return (
              <button
                key={String(group.key)}
                type="button"
                aria-pressed={ranked}
                onClick={() => tapRank(round.id, group.key)}
                className={`${HIT_AREA} flex flex-col items-start rounded-xl border px-3 py-2 text-left ${
                  ranked
                    ? 'border-blue-600 bg-blue-50 text-slate-900'
                    : 'border-slate-300 bg-slate-100 text-slate-700'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-sm font-medium">{group.label}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                      ranked ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-800'
                    }`}
                  >
                    {ranked ? `${rank + 1}등` : '무배당'}
                  </span>
                </span>
                {group.sub && <span className="text-xs text-slate-600">{group.sub}</span>}
              </button>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

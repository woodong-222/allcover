/**
 * 판별 팀 편성 시트.
 *
 * 팀 수를 고르고 참여자 칩을 탭할 때마다 소속 팀이 1팀 → 2팀 → … → 미배정 → 1팀 으로 순환한다.
 * 확인을 눌러야 스토어에 반영되므로, 편집 중 상태는 시트 로컬에 둔다.
 * 미배정 인원이 남아도 막지 않는다 (그 판에 팀 없이 낀 사람이 있을 수 있다). 경고만 띄운다.
 */

import { useEffect, useState } from 'react';
import type { Member, Round } from '../types';
import { useSettlementStore } from '../store/useSettlementStore';

const HIT_AREA = 'min-h-[44px] min-w-[44px]';
const CHIP_LIST = 'flex flex-wrap gap-2';

/** 미배정 상태를 나타내는 팀 index */
const UNASSIGNED = -1;

const TEAM_COUNT_OPTIONS = [
  { value: 0, label: '개인전' },
  { value: 2, label: '2팀' },
  { value: 3, label: '3팀' },
  { value: 4, label: '4팀' },
] as const;

export type TeamSheetProps = {
  round: Round;
  members: Member[];
  open: boolean;
  onClose: () => void;
};

export function TeamSheet({ round, members, open, onClose }: TeamSheetProps) {
  const setTeams = useSettlementStore((s) => s.setTeams);
  const [teamCount, setTeamCount] = useState(0);
  const [assign, setAssign] = useState<Record<string, number>>({});

  const participants = members.filter((m) => round.participants.includes(m.id));

  // 시트를 열 때마다 현재 라운드의 팀 편성을 편집 상태로 복사한다.
  useEffect(() => {
    if (!open) return;
    const next: Record<string, number> = {};
    for (const id of round.participants) next[id] = UNASSIGNED;
    round.teams?.forEach((team, index) => {
      for (const id of team) if (id in next) next[id] = index;
    });
    setTeamCount(round.teams ? round.teams.length : 0);
    setAssign(next);
  }, [open, round.teams, round.participants]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleTeamCount(count: number): void {
    setTeamCount(count);
    // 팀 수를 줄이면 사라진 팀에 있던 사람은 미배정으로 되돌린다.
    setAssign((prev) => {
      const next: Record<string, number> = {};
      for (const [id, team] of Object.entries(prev)) next[id] = team >= count ? UNASSIGNED : team;
      return next;
    });
  }

  function handleCycle(memberId: string): void {
    if (teamCount === 0) return;
    setAssign((prev) => {
      const current = prev[memberId] ?? UNASSIGNED;
      const next = current + 1 >= teamCount ? UNASSIGNED : current + 1;
      return { ...prev, [memberId]: next };
    });
  }

  function handleAutoAssign(): void {
    if (teamCount === 0) return;
    const next: Record<string, number> = {};
    participants.forEach((m, i) => {
      next[m.id] = i % teamCount;
    });
    setAssign(next);
  }

  function handleConfirm(): void {
    if (teamCount === 0) {
      setTeams(round.id, null);
      onClose();
      return;
    }
    const teams: string[][] = Array.from({ length: teamCount }, () => []);
    for (const m of participants) {
      const team = assign[m.id] ?? UNASSIGNED;
      if (team >= 0 && team < teamCount) teams[team].push(m.id);
    }
    setTeams(round.id, teams);
    onClose();
  }

  const unassignedCount =
    teamCount === 0 ? 0 : participants.filter((m) => (assign[m.id] ?? UNASSIGNED) < 0).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="팀 편성"
        className="relative flex max-h-[85vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl"
      >
        <h3 className="text-base font-semibold text-slate-900">팀 편성</h3>

        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="text-sm font-medium text-slate-700">팀 수</legend>
          <div className={CHIP_LIST}>
            {TEAM_COUNT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={teamCount === option.value}
                onClick={() => handleTeamCount(option.value)}
                className={`${HIT_AREA} rounded-lg border px-3 py-2 text-sm font-medium ${
                  teamCount === option.value
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="text-sm font-medium text-slate-700">참여자 배정</legend>
          {teamCount === 0 ? (
            <p className="text-sm text-slate-600">개인전이라 팀 배정이 필요 없습니다.</p>
          ) : participants.length === 0 ? (
            <p className="text-sm text-slate-600">이 판에 참여자가 없습니다.</p>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                칩을 탭할 때마다 1팀 → {teamCount}팀 → 미배정 순으로 바뀝니다.
              </p>
              <div className={CHIP_LIST}>
                {participants.map((m) => {
                  const team = assign[m.id] ?? UNASSIGNED;
                  const assigned = team >= 0;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleCycle(m.id)}
                      className={`${HIT_AREA} flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm ${
                        assigned
                          ? 'border-blue-600 bg-blue-50 text-slate-900'
                          : 'border-slate-300 bg-slate-100 text-slate-700'
                      }`}
                    >
                      <span className="font-medium">{m.name}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                          assigned ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-800'
                        }`}
                      >
                        {assigned ? `${team + 1}팀` : '미배정'}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={handleAutoAssign}
                className={`${HIT_AREA} self-start rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700`}
              >
                균등 자동 배정
              </button>
            </>
          )}
        </fieldset>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            className={`${HIT_AREA} rounded-lg bg-blue-600 px-4 py-2 font-medium text-white`}
          >
            확인
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`${HIT_AREA} rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700`}
          >
            취소
          </button>
          {unassignedCount > 0 && (
            <span role="alert" className="text-sm font-medium text-amber-900">
              미배정 {unassignedCount}명
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

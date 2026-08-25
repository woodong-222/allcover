/**
 * 한 판(Round)의 입력 카드. 참여자 · 정산/내기 구분 · 팀 편성 · 내기 방식과 그 하위 입력을 모두 담는다.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §2, §4 M3, R4, 인수조건 E1/E2
 *
 * 정산 방식은 2단 세그먼트다 (2026-08-24). 전역 모드 토글을 없애고 판별로 정산/내기를 고른다 —
 * 1단 `정산 / 내기`, 내기를 고른 판에서만 2단 `판돈 분배 / 판비 내주기` 가 붙는다.
 * 두 단은 `Round.method` 하나로 표현된다: 'none' 이 정산, 'pot'/'transfer' 가 내기다.
 *
 * round 는 부모(RoundList)가 스토어에서 읽어 내려주고, 액션과 나머지 정산 정보는 여기서 직접 읽는다.
 * imbalance 경고는 계산 엔진(roundDelta)이 실제로 쓰는 값을 그대로 보여준다. 화면에서 따로 계산하지 않는다.
 */

import { useState } from 'react';
import type { BetMethod, Round } from '../types';
import { roundDelta } from '../lib/calc';
import { formatKRW } from '../lib/format';
import { useSettlementStore } from '../store/useSettlementStore';
import { NumberField } from './ui/NumberField';
import { PayoutEditor } from './PayoutEditor';
import { RankPicker } from './RankPicker';
import { TeamSheet } from './TeamSheet';

const HIT_AREA = 'min-h-[44px] min-w-[44px]';
const CHIP_LIST = 'flex flex-wrap gap-2';

/** 내기를 고른 판에서만 쓰는 하위 방식. 'none' 은 여기 들어오지 않는다 */
type ActiveBetMethod = Exclude<BetMethod, 'none'>;

const BET_METHODS: { value: ActiveBetMethod; label: string }[] = [
  { value: 'pot', label: '판돈 분배' },
  { value: 'transfer', label: '판비 내주기' },
];

function chipClass(active: boolean): string {
  return `${HIT_AREA} rounded-full border px-3 py-2 text-sm font-medium ${
    active
      ? 'border-blue-600 bg-blue-600 text-white'
      : 'border-slate-300 bg-white text-slate-700'
  }`;
}

/**
 * 세그먼트 버튼. `flex-1` 로 한 줄을 나눠 갖되 `min-w-[44px]` 때문에 그 아래로는 줄지 않는다 —
 * 320px 폭에서 두 줄로 감싸질지언정 히트 영역이 깎이거나 가로 스크롤이 생기지 않는다 (E1/E2).
 * 클래스는 컨테이너가 아니라 **실제 클릭 대상인 button** 에 붙는다.
 */
function segClass(active: boolean): string {
  return `${HIT_AREA} flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
    active
      ? 'border-blue-600 bg-blue-600 text-white'
      : 'border-slate-300 bg-white text-slate-700'
  }`;
}

export type RoundCardProps = {
  round: Round;
  index: number;
};

export function RoundCard({ round, index }: RoundCardProps) {
  const members = useSettlementStore((s) => s.settlement.members);
  const gameFeePerGame = useSettlementStore((s) => s.settlement.gameFeePerGame);
  const duplicateRound = useSettlementStore((s) => s.duplicateRound);
  const removeRound = useSettlementStore((s) => s.removeRound);
  const toggleParticipant = useSettlementStore((s) => s.toggleParticipant);
  const setMethod = useSettlementStore((s) => s.setMethod);
  const setAnte = useSettlementStore((s) => s.setAnte);
  const toggleLoser = useSettlementStore((s) => s.toggleLoser);
  const setTransfer = useSettlementStore((s) => s.setTransfer);

  const [teamSheetOpen, setTeamSheetOpen] = useState(false);

  /**
   * "내기" 로 되돌아왔을 때 직전에 고른 하위 방식을 복원하기 위한 기억.
   * 스토어의 `method` 는 정산을 고르는 순간 'none' 이 되어 pot/transfer 구분을 잃으므로,
   * 그 구분만 여기 화면 상태로 들고 있는다. 금액·순위 같은 **데이터는 스토어가 그대로 보존**한다.
   */
  const [lastBetMethod, setLastBetMethod] = useState<ActiveBetMethod>(
    round.method === 'none' ? 'pot' : round.method,
  );

  // 정산 판(method === 'none')에서는 내기 UI를 통째로 숨긴다 (G3). 라운드 데이터는 지우지 않고
  // 렌더만 건너뛴다 — 잘못 눌렀을 때 순위·배당이 날아가면 복구할 방법이 없기 때문이다 (§5-A-2).
  const showBetUI = round.method !== 'none';
  const { imbalance } = roundDelta(round, gameFeePerGame);

  const selectBetMethod = (method: ActiveBetMethod): void => {
    setLastBetMethod(method);
    setMethod(round.id, method);
  };
  const nameOf = (id: string): string => members.find((m) => m.id === id)?.name ?? '?';
  const teams = round.teams?.filter((t) => t.length > 0) ?? null;
  const teamSummary = round.teams
    ? `${round.teams.length}팀 (${round.teams.map((t) => t.length).join(':')})`
    : '개인전';

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-slate-300 bg-white p-4">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">{index + 1}판</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => duplicateRound(round.id)}
            className={`${HIT_AREA} rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700`}
          >
            복제
          </button>
          <button
            type="button"
            onClick={() => removeRound(round.id)}
            className={`${HIT_AREA} rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700`}
          >
            삭제
          </button>
        </div>
      </header>

      {showBetUI && imbalance !== 0 && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800"
        >
          판돈 불일치 — 배당 합계가 판돈보다 {formatKRW(Math.abs(imbalance))}{' '}
          {imbalance > 0 ? '많습니다' : '적습니다'}
        </p>
      )}

      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="text-sm font-medium text-slate-700">참여자</legend>
        {members.length === 0 ? (
          <p className="text-sm text-slate-600">먼저 멤버를 추가해 주세요.</p>
        ) : (
          <div className={CHIP_LIST}>
            {members.map((m) => {
              const joined = round.participants.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={joined}
                  onClick={() => toggleParticipant(round.id, m.id)}
                  className={chipClass(joined)}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>

      {/*
        1단: 이 판이 정산해야 하는 판인지 내기 판인지. 판마다 다를 수 있어서 전역 토글이 아니라
        판별 설정이다. "정산" 은 곧 method === 'none' 이므로 별도 상태를 두지 않는다.
      */}
      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="text-sm font-medium text-slate-700">정산 방식</legend>
        <div className={CHIP_LIST}>
          <button
            type="button"
            aria-pressed={!showBetUI}
            /*
             * method 만 바꾼다. payout/ranking/losers/ante 를 지우면 안 된다 —
             * 잘못 눌렀을 때 입력해둔 배당과 순위가 복구 불가능하게 날아간다.
             * 계산에서 빠지는 건 roundDelta 가 method === 'none' 을 보고 알아서 한다.
             */
            onClick={() => setMethod(round.id, 'none')}
            className={segClass(!showBetUI)}
          >
            정산
          </button>
          <button
            type="button"
            aria-pressed={showBetUI}
            onClick={() => selectBetMethod(lastBetMethod)}
            className={segClass(showBetUI)}
          >
            내기
          </button>
        </div>
      </fieldset>

      {/* 2단: 내기를 고른 판에서만 하위 방식을 묻는다 */}
      {showBetUI && (
      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="text-sm font-medium text-slate-700">내기 방식</legend>
        <div className={CHIP_LIST}>
          {BET_METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={round.method === m.value}
              onClick={() => selectBetMethod(m.value)}
              className={segClass(round.method === m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </fieldset>
      )}

      {showBetUI && (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-700">팀 편성</span>
        <span className="text-sm text-slate-700">{teamSummary}</span>
        <button
          type="button"
          onClick={() => setTeamSheetOpen(true)}
          className={`${HIT_AREA} rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700`}
        >
          팀 편성 변경
        </button>
      </div>
      )}

      {round.method === 'pot' && (
        <div className="flex flex-col gap-4">
          <NumberField
            label="인당 판돈"
            value={round.ante}
            onChange={(v) => setAnte(round.id, v)}
            suffix="원"
          />
          <RankPicker round={round} members={members} />
          <PayoutEditor round={round} />
        </div>
      )}

      {round.method === 'transfer' && (
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2 border-0 p-0">
            <legend className="text-sm font-medium text-slate-700">금액</legend>
            <div className={CHIP_LIST}>
              <button
                type="button"
                aria-pressed={round.transferSource === 'gameFee'}
                onClick={() => setTransfer(round.id, { transferSource: 'gameFee' })}
                className={chipClass(round.transferSource === 'gameFee')}
              >
                한판비 연동
              </button>
              <button
                type="button"
                aria-pressed={round.transferSource === 'custom'}
                onClick={() => setTransfer(round.id, { transferSource: 'custom' })}
                className={chipClass(round.transferSource === 'custom')}
              >
                직접 입력
              </button>
            </div>
            {round.transferSource === 'gameFee' ? (
              <p className="text-sm text-slate-700">
                한판비 {formatKRW(gameFeePerGame)}을 그대로 씁니다.
              </p>
            ) : (
              <NumberField
                label="내줄 금액 (1인분)"
                value={round.transferAmount}
                onChange={(v) => setTransfer(round.id, { transferAmount: v })}
                suffix="원"
              />
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-2 border-0 p-0">
            <legend className="text-sm font-medium text-slate-700">진 쪽</legend>
            {round.participants.length === 0 ? (
              <p className="text-sm text-slate-600">참여자를 먼저 선택해 주세요.</p>
            ) : teams ? (
              <div className={CHIP_LIST}>
                {teams.map((team, i) => {
                  const isLoser = team.every((id) => round.losers.includes(id));
                  return (
                    <button
                      key={i}
                      type="button"
                      aria-pressed={isLoser}
                      onClick={() => toggleLoser(round.id, team[0])}
                      className={chipClass(isLoser)}
                    >
                      {i + 1}팀 ({team.map(nameOf).join('·')})
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className={CHIP_LIST}>
                {round.participants.map((id) => {
                  const isLoser = round.losers.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={isLoser}
                      onClick={() => toggleLoser(round.id, id)}
                      className={chipClass(isLoser)}
                    >
                      {nameOf(id)}
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>
        </div>
      )}

      <TeamSheet
        round={round}
        members={members}
        open={showBetUI && teamSheetOpen}
        onClose={() => setTeamSheetOpen(false)}
      />
    </article>
  );
}

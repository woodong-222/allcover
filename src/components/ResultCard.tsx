/**
 * 결과 카드 — 캡처(html-to-image) 대상 컴포넌트.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §3 인수조건 D5, D7, B3 / §5 R1, R9
 * §5-A-2 G4: `settlement.mode === 'normal'`(정산 모드)이면 "내기±" 열과 판별 내기 요약(D7)을 숨긴다.
 *
 * 극성 주의: `mode === 'normal'` 일 때만 숨기고, 그 외(= 'bet' 이거나 구버전 저장값처럼
 * mode 가 없는 경우)는 그대로 보여준다. 반대로 `mode === 'bet'` 일 때만 보여주는 식으로 쓰면
 * mode 가 undefined 인 낡은 데이터에서 내기 정보가 조용히 사라진다 (계획서 §5-A-3와 같은 함정).
 *
 * 총무/송금 안내는 2026-08-21 사용자 요청으로 제거됐다. 볼링장에서는 누가 카드로 긁었는지
 * 다들 아는데 앱이 굳이 지정을 받을 이유가 없다는 판단. 결과 카드는 "누가 얼마"와 총액만
 * 보여준다 (types.ts의 Settlement.treasurerId 제거 주석 참고).
 *
 * R1: 이 컴포넌트(및 하위 요소) 안에서 쓰는 모든 색은 src/index.css 의 hex CSS 변수
 * (--card-bg, --card-fg, --card-muted, --card-border, --card-accent, --card-accent-soft,
 * --card-positive, --card-negative) 만 사용한다. Tailwind 색상 유틸(bg-*, text-* 등)은
 * oklch() 로 컴파일되어 html-to-image 의 SVG foreignObject 직렬화에서 깨질 수 있으므로
 * 색 지정은 반드시 inline style 로 var(--card-*) 를 참조한다. 레이아웃(flex/grid/gap/padding/
 * text-size 등 색과 무관한) Tailwind 유틸은 사용해도 된다.
 *
 * D1/R2: 부모(결과 화면)는 이 컴포넌트가 마운트된 노드를 ref 로 잡아 capture.ts의
 * captureNode/createCapturer 로 "미리" 캡처해둔다. 그래서 이 컴포넌트는 순수 표시용이며
 * 캡처 트리거를 스스로 갖지 않는다.
 *
 * 결합도를 낮추기 위해 계산 결과(results/breakdowns/totalImbalance)는 전부
 * props 로 받는다. src/lib/calc.ts 를 이 컴포넌트가 직접 import 하지 않는다.
 */

import { forwardRef } from 'react';
import type { Member, MemberResult, Round, RoundBreakdown, Settlement } from '../types';
import { formatDate, formatKRW, formatSigned } from '../lib/format';

/** R9: 13명 이상이면 행 높이·폰트를 축소해 카드가 지나치게 길어지지 않게 한다 */
const COMPACT_THRESHOLD = 13;

export type ResultCardProps = {
  settlement: Settlement;
  results: MemberResult[];
  breakdowns: RoundBreakdown[];
  totalImbalance: number;
  /** 전원이 같은 금액을 내도록 올려서 더 걷힌 금액. 0 이면 표시하지 않는다 */
  roundingSurplus?: number;
  /** 분담 대상이 한 명도 남지 않아 아무에게도 청구되지 않은 기타비용 항목 */
  unassignedExtras?: { label: string; amount: number }[];
};

/** memberId -> 이름 조회. 못 찾으면 id 그대로 표시(크래시 방지) */
function nameLookup(members: Member[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of members) map[m.id] = m.name;
  return map;
}

/** D7: 판별 내기 요약 한 줄. 방식·판돈(또는 금액)·순위(또는 진 쪽)를 포함한다 */
function describeRoundBet(
  round: Round,
  index: number,
  names: Record<string, string>,
  gameFeePerGame: number,
): string {
  const label = `${index + 1}판`;
  const nameOf = (id: string) => names[id] ?? id;
  const groupNames = (ids: string[]) => ids.map(nameOf).join('·');

  if (round.method === 'none') {
    return `${label} · 내기 없음`;
  }

  if (round.method === 'pot') {
    const ranks = round.ranking
      .map((group, i) => (round.payout[i] != null ? `${i + 1}등 ${groupNames(group)}` : null))
      .filter((v): v is string => v !== null);
    const ranksText = ranks.length > 0 ? ranks.join(' / ') : '순위 미입력';
    return `${label} · 판돈 분배 · 인당 ${formatKRW(round.ante)} · ${ranksText}`;
  }

  // transfer
  const amountText =
    round.transferSource === 'gameFee'
      ? `게임비(${formatKRW(gameFeePerGame)}) 연동`
      : formatKRW(round.transferAmount);
  const losersText = round.losers.length > 0 ? groupNames(round.losers) : '미지정';
  return `${label} · 판비 내주기 · ${amountText} · 진 쪽 ${losersText}`;
}

export const ResultCard = forwardRef<HTMLDivElement, ResultCardProps>(function ResultCard(
  { settlement, results, breakdowns, totalImbalance, roundingSurplus = 0, unassignedExtras = [] },
  ref,
) {
  const { date, title, members, rounds, gameFeePerGame, mode } = settlement;
  const names = nameLookup(members);
  const nameOf = (id: string) => names[id] ?? id;
  const total = results.reduce((sum, r) => sum + r.rounded, 0);
  // G4: 정산 모드에서만 숨긴다. mode 가 'bet'이든 undefined(구버전 데이터)든 그대로 보여준다.
  const hideBet = mode === 'normal';

  const roundImbalances = breakdowns.filter((b) => b.imbalance !== 0);
  const compact = members.length >= COMPACT_THRESHOLD;
  const cellPad = compact ? 'py-1' : 'py-2';
  const bodyTextSize = compact ? 'text-xs' : 'text-sm';

  return (
    <div
      ref={ref}
      data-testid="result-card"
      style={{
        width: 540,
        backgroundColor: 'var(--card-bg)',
        color: 'var(--card-fg)',
        border: '1px solid var(--card-border)',
      }}
      className="rounded-2xl p-6 font-sans"
    >
      {/* 헤더 */}
      <header className="mb-4">
        <p className="text-lg font-bold" style={{ color: 'var(--card-fg)' }}>
          {title ?? 'allcover 정산'}
        </p>
        <p className="mt-1 text-sm" style={{ color: 'var(--card-muted)' }}>
          {formatDate(date)} · {members.length}명
        </p>
      </header>

      {(totalImbalance !== 0 || roundImbalances.length > 0) && (
        <div
          data-testid="imbalance-warning"
          className="mb-4 rounded-lg px-3 py-2 text-sm font-medium"
          style={{ backgroundColor: 'var(--card-accent-soft)', color: 'var(--card-positive)' }}
        >
          <p>⚠ 배당 불일치 총 {formatKRW(totalImbalance)} — 판별 배당 합계를 다시 확인하세요</p>
          {/*
           * 원인 힌트: pot 라운드 진행 중 참여 인원이 바뀌면(예: removeMember, toggleParticipant)
           * 판돈 총액(ante × 참여인원)만 따라 변하고 사용자가 입력해둔 payout은 그대로 남아
           * 멀쩡하던 판이 불균형해질 수 있다. 앱이 배당을 말없이 고치지 않고 그대로 반영하는
           * 대신, 어느 판이 왜 어긋났는지 알려줘야 사용자가 원인을 찾을 수 있다.
           */}
          {roundImbalances.length > 0 && (
            <p data-testid="imbalance-cause-hint" className="mt-1 text-xs font-normal">
              걷은 판돈과 나눠준 배당이 어긋난 판:{' '}
              {roundImbalances
                .map((b) => {
                  const roundIndex = rounds.findIndex((r) => r.id === b.roundId);
                  const label = roundIndex >= 0 ? `${roundIndex + 1}판` : b.roundId;
                  return `${label} ${formatSigned(b.imbalance)}원`;
                })
                .join(', ')}
              . 참여 인원을 바꾸면 판돈 총액이 달라지므로, 해당 판의 배당을 다시 확인해주세요.
            </p>
          )}
        </div>
      )}

      {/*
       * 분담 대상이 전원 삭제된 기타비용. 그 금액은 아무에게도 청구되지 않아 정산에서
       * 사라지므로, 사용자가 실제로 그만큼 덜 걷게 된다. 반드시 드러내야 한다 (F3).
       */}
      {unassignedExtras.length > 0 && (
        <div
          data-testid="unassigned-extras-warning"
          className="mb-4 rounded-lg px-3 py-2 text-sm font-medium"
          style={{ backgroundColor: 'var(--card-accent-soft)', color: 'var(--card-positive)' }}
        >
          <p>⚠ 분담할 사람이 없어 아무도 내지 않는 항목이 있습니다</p>
          <p className="mt-1 text-xs font-normal">
            {unassignedExtras.map((e) => `${e.label} ${formatKRW(e.amount)}`).join(', ')}. 아래
            총액에 포함되지 않았습니다 — 분담 대상을 다시 지정해주세요.
          </p>
        </div>
      )}

      {/* 멤버별 표 */}
      <table
        data-testid="member-table"
        data-compact={compact}
        className={`w-full border-collapse ${bodyTextSize}`}
      >
        <thead>
          <tr style={{ color: 'var(--card-muted)' }}>
            <th className="py-1 text-left font-normal">이름</th>
            <th className="py-1 text-right font-normal">판수</th>
            <th className="py-1 text-right font-normal">게임비</th>
            <th className="py-1 text-right font-normal">신발</th>
            <th className="py-1 text-right font-normal">기타</th>
            {!hideBet && <th className="py-1 text-right font-normal">내기±</th>}
            <th className="py-1 text-right font-normal">최종</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr
              key={r.memberId}
              data-testid="result-row"
              style={{ borderTop: '1px solid var(--card-border)' }}
            >
              <td className={cellPad}>
                {nameOf(r.memberId)}
                {r.adjustment !== 0 && (
                  <span
                    data-testid="adjustment-badge"
                    className="ml-2 rounded px-1.5 py-0.5 text-xs"
                    style={{ backgroundColor: 'var(--card-accent-soft)', color: 'var(--card-accent)' }}
                  >
                    잔돈 조정 {formatSigned(r.adjustment)}원
                  </span>
                )}
              </td>
              <td className={`${cellPad} text-right`}>{r.gameCount}</td>
              <td className={`${cellPad} text-right`}>{formatKRW(r.gameFee)}</td>
              <td className={`${cellPad} text-right`}>{formatKRW(r.shoe)}</td>
              <td className={`${cellPad} text-right`}>{formatKRW(r.extra)}</td>
              {!hideBet && (
                <td
                  className={`${cellPad} text-right`}
                  style={{ color: r.betDelta > 0 ? 'var(--card-positive)' : r.betDelta < 0 ? 'var(--card-negative)' : undefined }}
                >
                  {formatSigned(r.betDelta)}
                </td>
              )}
              <td className={`${cellPad} text-right font-semibold`}>
                {r.rounded < 0 ? `${formatKRW(Math.abs(r.rounded))} 받음` : formatKRW(r.rounded)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 총액 */}
      <div
        className="mt-3 flex items-baseline justify-between border-t pt-3"
        style={{ borderColor: 'var(--card-border)' }}
      >
        <span style={{ color: 'var(--card-muted)' }}>총액</span>
        <span className="text-lg font-bold">{formatKRW(total)}</span>
      </div>

      {/*
       * 전원이 같은 금액을 내도록 1원 단위로 올린 결과 실제 결제액보다 더 걷힌 금액.
       * 나눗셈 한 번당 최대 (인원-1)원이라 보통 1~2원이다. 금액은 사소하지만,
       * "한 명만 1원 덜 내는 것보다 낫다"는 결정의 전제가 바로 이 노출이다 (F1).
       */}
      {roundingSurplus !== 0 && (
        <p
          data-testid="rounding-surplus-note"
          className="mt-1 text-right text-xs"
          style={{ color: 'var(--card-muted)' }}
        >
          인원수로 나누어떨어지지 않아 전원 같은 금액으로 올렸습니다 — 실제 결제액보다{' '}
          {formatKRW(Math.abs(roundingSurplus))} 더 걷힙니다
        </p>
      )}

      {/* 판별 내기 요약 (D7) — 정산 모드에서는 숨긴다 (G4) */}
      {!hideBet && rounds.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold" style={{ color: 'var(--card-muted)' }}>
            판별 내기 요약
          </p>
          <ul className="space-y-1 text-xs" style={{ color: 'var(--card-muted)' }}>
            {rounds.map((round, i) => (
              <li key={round.id} data-testid="round-summary-row">
                {describeRoundBet(round, i, names, gameFeePerGame)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});

/**
 * 결과 카드 — 캡처(html-to-image) 대상 컴포넌트.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §3 인수조건 D5, D7, B3 / §5 R1, R9
 * G4: 내기 판이 하나도 없으면 "내기±" 열과 판별 내기 요약(D7)을 숨긴다.
 *
 * 판정은 전역 플래그가 아니라 `rounds` 에서 파생한다 (2026-08-24). 예전에는 `settlement.mode`
 * 라는 별도 상태를 봤는데, 그러면 mode 가 없는 구버전 데이터에서 극성을 잘못 잡아 내기 정보가
 * 조용히 사라지는 함정이 있었다. 이제는 판이 하나라도 내기면 보여주므로 그 함정 자체가 없다.
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
import type { Extra, Member, MemberResult, Round, RoundBreakdown, Settlement } from '../types';
import { formatDate, formatKRW, formatSigned } from '../lib/format';

/** R9: 13명 이상이면 행 높이·폰트를 축소해 카드가 지나치게 길어지지 않게 한다 */
const COMPACT_THRESHOLD = 13;

/** 카드 기본 폭. 기타 항목이 하나뿐이던 시절의 고정값이며 캡처 PNG 의 기준 가로다 */
const BASE_CARD_WIDTH = 540;
/** 기타 열이 하나 늘 때마다 넓히는 폭 */
const EXTRA_COLUMN_WIDTH = 70;
/**
 * 카드가 넓어져도 넘지 않는 상한.
 * 캡처 PNG 가 너무 넓으면 메신저가 화면 폭에 맞춰 축소해버려 정작 금액이 안 읽힌다.
 */
const MAX_CARD_WIDTH = 720;
/** 기타비용을 항목명 열로 펼칠 때의 최대 열 수 */
const MAX_EXTRA_COLUMNS = 4;

/** 표에 그릴 기타비용 열 하나. `ids` 가 여러 개면 그 항목들을 합친 열이다 */
export type ExtraColumn = { label: string; ids: string[] };

/**
 * 기타비용 항목을 표의 열로 펼친다 (2026-08-25).
 *
 * 예전에는 항목이 몇 개든 "기타" 한 열에 합계만 찍혀서, 카드를 받은 사람이 그 금액이
 * 무엇 때문인지 알 수 없었다. `Extra.amounts` 가 사람별 금액 맵이라 "누가 어느 항목에
 * 얼마" 를 정확히 아는데도 표에서 뭉개고 있던 셈이다.
 *
 * 항목이 많으면 열이 무한정 늘어 카드가 읽을 수 없게 넓어지므로 `maxCols` 에서 자른다.
 * 자를 때 뒤쪽을 **버리지 않고** "기타" 한 열로 합친다 — 버리면 열 합계가 `MemberResult.extra`
 * 와 어긋나 카드가 조용히 거짓말을 한다.
 */
export function extraColumns(extras: Extra[], maxCols = MAX_EXTRA_COLUMNS): ExtraColumn[] {
  if (extras.length === 0) return [];
  const cap = Math.max(1, maxCols);
  if (extras.length <= cap) return extras.map((e) => ({ label: e.label, ids: [e.id] }));
  return [
    ...extras.slice(0, cap - 1).map((e) => ({ label: e.label, ids: [e.id] })),
    { label: '기타', ids: extras.slice(cap - 1).map((e) => e.id) },
  ];
}

/**
 * 기타 열 수에 맞춘 카드 폭.
 *
 * 첫 열은 폭을 늘리지 않는다 — 기존 540px 표에 이미 "기타" 열 하나가 들어가 있었다.
 * 둘째 열부터 항목당 70px 씩 넓히고 상한에서 자른다.
 */
export function cardWidth(columnCount: number): number {
  const widened = Math.max(0, columnCount - 1) * EXTRA_COLUMN_WIDTH;
  return Math.min(MAX_CARD_WIDTH, BASE_CARD_WIDTH + widened);
}

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
  const { date, title, members, rounds, gameFeePerGame } = settlement;
  const names = nameLookup(members);
  const nameOf = (id: string) => names[id] ?? id;
  const total = results.reduce((sum, r) => sum + r.rounded, 0);
  // G4: 판이 하나라도 내기면 내기 표시를 남긴다. 전부 정산('none')일 때만 숨긴다.
  const hideBet = !rounds.some((r) => r.method !== 'none');

  const roundImbalances = breakdowns.filter((b) => b.imbalance !== 0);
  const compact = members.length >= COMPACT_THRESHOLD;
  const cellPad = compact ? 'py-1' : 'py-2';
  const bodyTextSize = compact ? 'text-xs' : 'text-sm';

  // 기타비용은 "기타" 한 열이 아니라 항목명 열들로 편다. 항목이 없으면 열 자체가 없다.
  const columns = extraColumns(settlement.extras);
  const amountsById = new Map(settlement.extras.map((e) => [e.id, e.amounts]));
  const columnAmount = (column: ExtraColumn, memberId: string): number =>
    column.ids.reduce((sum, id) => sum + (amountsById.get(id)?.[memberId] ?? 0), 0);

  return (
    <div
      ref={ref}
      data-testid="result-card"
      style={{
        width: cardWidth(columns.length),
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
            {columns.map((c) => (
              <th key={c.ids.join(',')} className="py-1 text-right font-normal">
                {c.label}
              </th>
            ))}
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
              {columns.map((c) => (
                <td key={c.ids.join(',')} className={`${cellPad} text-right`}>
                  {formatKRW(columnAmount(c, r.memberId))}
                </td>
              ))}
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
      {/*
       * 가드가 `> 0` 인 이유: 이 값은 구조적으로 항상 0 이상이지만(초과분만 누적한다),
       * `!== 0` 로 두고 절대값을 씌우면 훗날 음수가 되는 변경이 들어왔을 때 부호가 지워진 채
       * "더 걷힙니다" 가 출력된다 — 모자란 돈을 더 걷혔다고 말하는 그럴듯한 거짓말이 된다.
       * `> 0` 이면 그 경우 아무것도 안 뜨고, 절대값도 필요 없다.
       */}
      {roundingSurplus > 0 && (
        <p
          data-testid="rounding-surplus-note"
          className="mt-1 text-right text-xs"
          style={{ color: 'var(--card-muted)' }}
        >
          인원수로 나누어떨어지지 않아 전원 같은 금액으로 올렸습니다 — 나눠 낸 금액이{' '}
          {formatKRW(roundingSurplus)} 더 걷힙니다
        </p>
      )}

      {/* 판별 내기 요약 (D7) — 전 판이 정산이면 숨긴다 (G4) */}
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

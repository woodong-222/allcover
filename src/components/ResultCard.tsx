/**
 * 결과 카드 — 캡처(html-to-image) 대상 컴포넌트.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §3 인수조건 D5, D7, B3 / §5 R1
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
 */

import { forwardRef } from 'react';
import type { Member, MemberResult, Round, RoundBreakdown } from '../types';
import { formatDate, formatKRW, formatSigned } from '../lib/format';

export type TransferInstruction = { from: string; to: string; amount: number };

export type ResultCardProps = {
  /** ISO 8601 날짜 문자열 */
  date: string;
  title?: string;
  members: Member[];
  rounds: Round[];
  gameFeePerGame: number;
  results: MemberResult[];
  breakdowns: RoundBreakdown[];
  totalImbalance: number;
  treasurerId?: string;
  /**
   * 총무 미지정 시 외부(예: src/lib/settle.ts 의 그리디 최소 송금 계산)에서 계산한
   * 송금 리스트. treasurerId 가 있으면 이 카드가 직접 "전원 -> 총무" 리스트를 계산하므로
   * 이 값은 무시된다.
   */
  transfers?: TransferInstruction[];
};

/** memberId -> 이름 조회. 못 찾으면 id 그대로 표시(크래시 방지) */
function nameLookup(members: Member[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of members) map[m.id] = m.name;
  return map;
}

/** 총무가 지정된 경우: 나머지 전원의 rounded 금액을 총무 기준 송금 리스트로 변환한다 */
function treasurerTransfers(results: MemberResult[], treasurerId: string): TransferInstruction[] {
  return results
    .filter((r) => r.memberId !== treasurerId && r.rounded !== 0)
    .map((r) =>
      r.rounded > 0
        ? { from: r.memberId, to: treasurerId, amount: r.rounded }
        : { from: treasurerId, to: r.memberId, amount: -r.rounded },
    );
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
  {
    date,
    title,
    members,
    rounds,
    gameFeePerGame,
    results,
    breakdowns,
    totalImbalance,
    treasurerId,
    transfers,
  },
  ref,
) {
  const names = nameLookup(members);
  const nameOf = (id: string) => names[id] ?? id;
  const total = results.reduce((sum, r) => sum + r.rounded, 0);

  const transferList = treasurerId
    ? treasurerTransfers(results, treasurerId)
    : (transfers ?? []);

  const roundImbalances = breakdowns.filter((b) => b.imbalance !== 0);

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
          ⚠ 배당 불일치 총 {formatKRW(totalImbalance)} — 판별 배당 합계를 다시 확인하세요
        </div>
      )}

      {/* 멤버별 표 */}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr style={{ color: 'var(--card-muted)' }}>
            <th className="py-1 text-left font-normal">이름</th>
            <th className="py-1 text-right font-normal">판수</th>
            <th className="py-1 text-right font-normal">게임비</th>
            <th className="py-1 text-right font-normal">신발</th>
            <th className="py-1 text-right font-normal">기타</th>
            <th className="py-1 text-right font-normal">내기±</th>
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
              <td className="py-2">
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
              <td className="py-2 text-right">{r.gameCount}</td>
              <td className="py-2 text-right">{formatKRW(r.gameFee)}</td>
              <td className="py-2 text-right">{formatKRW(r.shoe)}</td>
              <td className="py-2 text-right">{formatKRW(r.extra)}</td>
              <td
                className="py-2 text-right"
                style={{ color: r.betDelta > 0 ? 'var(--card-positive)' : r.betDelta < 0 ? 'var(--card-negative)' : undefined }}
              >
                {formatSigned(r.betDelta)}
              </td>
              <td className="py-2 text-right font-semibold">
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

      {/* 송금 리스트 */}
      <div className="mt-4">
        <p className="mb-2 text-sm font-semibold" style={{ color: 'var(--card-muted)' }}>
          송금 안내
        </p>
        {transferList.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {transferList.map((t, i) => (
              <li key={`${t.from}-${t.to}-${i}`} data-testid="transfer-row">
                {nameOf(t.from)} → {nameOf(t.to)}에게{' '}
                <strong style={{ color: 'var(--card-accent)' }}>{formatKRW(t.amount)}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm" style={{ color: 'var(--card-muted)' }}>
            {treasurerId
              ? '정산할 금액이 없습니다'
              : '총무를 지정하면 송금 안내를 볼 수 있어요'}
          </p>
        )}
      </div>

      {/* 판별 내기 요약 (D7) */}
      {rounds.length > 0 && (
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

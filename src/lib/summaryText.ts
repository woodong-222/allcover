/**
 * 카카오톡 등에 붙여넣을 플레인 텍스트 정산 요약.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §3 인수조건 D7
 */

import type { MemberResult } from '../types';
import { formatDate, formatKRW } from './format';

export type BuildSummaryTextArgs = {
  /** ISO 8601 날짜 문자열 */
  date: string;
  /** memberId -> 이름 */
  memberNames: Record<string, string>;
  results: MemberResult[];
  /** 총무 이름. 없으면 마지막 안내 줄을 생략한다 */
  treasurerName?: string;
  /** 총액 (원) */
  total: number;
};

/**
 * 예)
 * 🎳 allcover 정산 · 2026.08.21 (금)
 * 총 42,000원 / 3명
 *
 * 김철수  16,000원
 * 이영희  14,000원
 * 박민수  12,000원
 *
 * → 모두 김철수에게 보내주세요
 */
export function buildSummaryText(args: BuildSummaryTextArgs): string {
  const { date, memberNames, results, treasurerName, total } = args;

  const lines: string[] = [];
  lines.push(`🎳 allcover 정산 · ${formatDate(date)}`);
  lines.push(`총 ${formatKRW(total)} / ${results.length}명`);
  lines.push('');

  for (const result of results) {
    const name = memberNames[result.memberId] ?? result.memberId;
    lines.push(`${name}  ${formatKRW(result.rounded)}`);
  }

  if (treasurerName) {
    lines.push('');
    lines.push(`→ 모두 ${treasurerName}에게 보내주세요`);
  }

  return lines.join('\n');
}
